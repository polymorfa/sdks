#![cfg(feature = "storage-firestore")]
#[path = "support/storage_conformance.rs"]
mod storage_conformance;
use ::firestore::{
    FirestoreCreateSupport, FirestoreDb, FirestoreDbOptions, FirestoreDeleteSupport,
    FirestoreQueryParams, FirestoreQuerySupport,
};
use gcloud_sdk::{ExternalJwtFunctionSource, Token, TokenSourceType};
use polymorfa_sdk::storage::{
    firestore::{FirestoreStorageAdapter, FirestoreStorageOptions},
    *,
};
use std::{collections::BTreeMap, sync::Arc};
#[tokio::test]
async fn actual_native_firestore_transactions_full_schema2_conformance() {
    let Ok(endpoint) = std::env::var("FIRESTORE_EMULATOR_HOST") else {
        eprintln!("SKIP actual Firestore: independent emulator environment required");
        return;
    };
    let url = url::Url::parse(&format!("http://{endpoint}")).unwrap();
    assert!(
        matches!(url.host_str(), Some("127.0.0.1" | "localhost" | "[::1]")),
        "Native Firestore proof requires loopback fixture"
    );
    // Explicit synthetic source avoids loading ADC or reaching the metadata service.
    let source = ExternalJwtFunctionSource::new(|| async {
        Ok(Token::new(
            "Bearer".into(),
            "owner".into(),
            chrono::DateTime::from_timestamp(4102444800, 0).unwrap(),
        ))
    });
    let database = FirestoreDb::with_options_token_source(
        FirestoreDbOptions::new("sdk-fixture-go".into()).with_firebase_api_url(url.to_string()),
        vec![],
        TokenSourceType::ExternalSource(Box::new(source)),
    )
    .await
    .unwrap();
    for name in ["", "bad/name", "bad\0"] {
        assert!(
            FirestoreStorageAdapter::new(database.clone(), FirestoreStorageOptions::new(name))
                .is_err()
        );
    }
    let mut invalid = FirestoreStorageOptions::new("app");
    invalid.max_query_rows = 0;
    assert!(FirestoreStorageAdapter::new(database.clone(), invalid).is_err());
    let ns = format!("rust_{}", uuid::Uuid::new_v4().simple());
    let adapter = Arc::new(
        FirestoreStorageAdapter::new(database.clone(), FirestoreStorageOptions::new(&ns)).unwrap(),
    );
    assert_eq!(adapter.capabilities().max_commit_size, 250);
    storage_conformance::conformance(adapter.clone()).await;
    let docs = database
        .query_doc(FirestoreQueryParams::new(
            format!("polymorfa_{ns}_messages").as_str().into(),
        ))
        .await
        .unwrap();
    let history = docs.iter().find(|d| d.fields.get("timestamp").is_some_and(|v| matches!(v.value_type,Some(gcloud_sdk::google::firestore::v1::value::ValueType::IntegerValue(n)) if n>1000))).unwrap();
    let session = match &history.fields["sessionId"].value_type {
        Some(gcloud_sdk::google::firestore::v1::value::ValueType::StringValue(s)) => s.clone(),
        _ => panic!("Invalid fixture"),
    };
    let query = IndexQuery {
        index: "by_chat".into(),
        equals: BTreeMap::from([
            ("sessionId".into(), session),
            ("chatId".into(), "chat".into()),
            ("unknown.field".into(), "ignored".into()),
        ]),
        limit: 10,
        range: None,
        order: None,
        after: None,
    };
    assert_eq!(
        adapter.query(Entity::Messages, &query).await.unwrap().len(),
        10
    );
    let other = FirestoreStorageAdapter::new(
        database.clone(),
        FirestoreStorageOptions::new(format!("{ns}_other")),
    )
    .unwrap();
    assert!(other
        .get(Entity::Messages, &["kscalars:json".into()])
        .await
        .unwrap()
        .is_empty());
    assert!(other
        .query(Entity::Messages, &query)
        .await
        .unwrap()
        .is_empty());
    let mut options = FirestoreStorageOptions::new(&ns);
    options.max_query_rows = 10;
    assert!(matches!(
        FirestoreStorageAdapter::new(database.clone(), options)
            .unwrap()
            .query(Entity::Messages, &query)
            .await,
        Err(StorageError::Provider(_))
    ));
    for id in [
        "".into(),
        ".".into(),
        "..".into(),
        "bad/path".into(),
        "x".repeat(1501),
    ] {
        assert!(matches!(
            adapter.get(Entity::Messages, &[id]).await,
            Err(StorageError::Invalid(_))
        ));
    }
    let oversized = (0..251)
        .map(|i| RowWrite::Delete {
            entity: Entity::Messages,
            id: format!("knever:{i}"),
            expected_revision: None,
        })
        .collect::<Vec<_>>();
    assert!(matches!(
        adapter.commit(&oversized).await,
        Err(StorageError::Invalid(_))
    ));
    use gcloud_sdk::google::firestore::v1::{value::ValueType, Value as NativeValue};
    for mode in ["identity", "reference"] {
        let id = format!("ksafe:{mode}");
        let mut document = history.clone();
        document.name.clear();
        for (field, value) in [
            ("_id", id.as_str()),
            ("sessionId", "safe"),
            (
                "messageId",
                if mode == "identity" {
                    "different"
                } else {
                    mode
                },
            ),
        ] {
            document.fields.insert(
                field.into(),
                NativeValue {
                    value_type: Some(ValueType::StringValue(value.into())),
                },
            );
        }
        if mode == "reference" {
            document.fields.insert(
                "extra".into(),
                NativeValue {
                    value_type: Some(ValueType::ReferenceValue(format!(
                        "{}/synthetic/reference",
                        database.get_documents_path()
                    ))),
                },
            );
        }
        database
            .create_doc(
                &format!("polymorfa_{ns}_messages"),
                Some(&id),
                document,
                None,
            )
            .await
            .unwrap();
        assert!(matches!(
            adapter.get(Entity::Messages, &[id]).await,
            Err(StorageError::Provider(_))
        ));
    }
    // Remove only this run's collections; never reset the shared emulator project.
    for entity in schema::ALL_ENTITIES {
        let collection = format!("polymorfa_{ns}_{}", entity.definition().name);
        for document in database
            .query_doc(FirestoreQueryParams::new(collection.as_str().into()))
            .await
            .unwrap()
        {
            database
                .delete_by_id(&collection, document.name.rsplit('/').next().unwrap(), None)
                .await
                .unwrap();
        }
    }
    eprintln!("PASS actual Firestore emulator/community Rust driver: all17entities,literal JSON,250-write native transactions,2000history,rollback,replay,checkpoint,expired-writer fence,closed scope,namespace/read bounds");
}
