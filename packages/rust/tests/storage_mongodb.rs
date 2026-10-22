#![cfg(feature = "storage-mongodb")]
#[path = "support/storage_conformance.rs"]
mod storage_conformance;
use ::mongodb::{
    bson::{doc, Bson, Document},
    Client,
};
use polymorfa_sdk::storage::{
    mongodb::{MongoStorageAdapter, MongoStorageOptions},
    *,
};
use std::{collections::BTreeMap, sync::Arc};
#[tokio::test]
async fn mongo_namespace_and_bounds_are_checked_without_storage_commands() {
    let client = Client::with_uri_str(
        "mongodb://127.0.0.1:9/?directConnection=true&serverSelectionTimeoutMS=100",
    )
    .await
    .unwrap();
    for name in ["", "bad/name", "bad\0"] {
        assert!(MongoStorageAdapter::new(
            client.database("offline_fixture"),
            MongoStorageOptions::new(name)
        )
        .is_err());
    }
    let mut options = MongoStorageOptions::new("app");
    options.max_query_rows = 0;
    assert!(MongoStorageAdapter::new(client.database("offline_fixture"), options).is_err());
    let key = BTreeMap::from([
        ("sessionId".into(), "offline".into()),
        ("messageId".into(), "invalid-key".into()),
    ]);
    let mut row = polymorfa_sdk::storage::merge::empty_row(Entity::Messages, &key).unwrap();
    row.revision = 1;
    row.fields.insert(
        "extra".into(),
        serde_json::json!({"synthetic\0key":"fixture"}),
    );
    let error = MongoStorageAdapter::new(
        client.database("offline_fixture"),
        MongoStorageOptions::new("app"),
    )
    .unwrap()
    .commit(&[RowWrite::Put {
        entity: Entity::Messages,
        row,
        expected_revision: None,
    }])
    .await
    .err()
    .unwrap();
    assert!(matches!(error, StorageError::Invalid(_)));
    assert!(!error.to_string().contains("synthetic"));
    client.shutdown().immediate(true).await;
}
#[tokio::test]
async fn actual_replica_set_official_driver_full_schema2_conformance() {
    let Ok(uri) = std::env::var("POLYMORFA_MONGODB_URI") else {
        eprintln!(
            "SKIP actual MongoDB replica set: independent native fixture environment required"
        );
        return;
    };
    let parsed = url::Url::parse(&uri).unwrap();
    assert!(
        matches!(parsed.host_str(), Some("127.0.0.1" | "localhost" | "[::1]")),
        "Native MongoDB proof requires its loopback fixture"
    );
    let client = Client::with_uri_str(&uri).await.unwrap();
    let database = client.database(&format!("native_rust_{}", uuid::Uuid::new_v4().simple()));
    let options = MongoStorageOptions::new("rust_native");
    let adapter = Arc::new(MongoStorageAdapter::new(database.clone(), options).unwrap());
    storage_conformance::conformance(adapter.clone()).await;
    let literal_key = BTreeMap::from([
        ("sessionId".into(), "literal-json".into()),
        ("messageId".into(), "tags".into()),
    ]);
    let mut literal =
        polymorfa_sdk::storage::merge::empty_row(Entity::Messages, &literal_key).unwrap();
    literal.revision = 1;
    literal
        .fields
        .insert("chatId".into(), serde_json::json!("literal-chat"));
    literal
        .fields
        .insert("extra".into(), serde_json::json!({"$date":"literal"}));
    assert!(
        adapter
            .commit(&[RowWrite::Put {
                entity: Entity::Messages,
                row: literal.clone(),
                expected_revision: None
            }])
            .await
            .unwrap()
            .ok
    );
    let literal_rows = adapter
        .query(
            Entity::Messages,
            &IndexQuery {
                index: "by_chat".into(),
                equals: BTreeMap::from([
                    ("sessionId".into(), "literal-json".into()),
                    ("chatId".into(), "literal-chat".into()),
                ]),
                limit: 10,
                range: None,
                order: None,
                after: None,
            },
        )
        .await
        .unwrap();
    assert_eq!(literal_rows[0].fields["extra"], literal.fields["extra"]);
    let collection = database.collection::<Document>("polymorfa_rust_native_messages");
    assert!(collection
        .list_index_names()
        .await
        .unwrap()
        .contains(&"by_chat".into()));
    let history = collection
        .find_one(doc! {"chatId":"chat","timestamp":{"$gt":1000}})
        .await
        .unwrap()
        .unwrap();
    let session = history.get_str("sessionId").unwrap();
    let query = IndexQuery {
        index: "by_chat".into(),
        equals: BTreeMap::from([
            ("sessionId".into(), session.into()),
            ("chatId".into(), "chat".into()),
            (
                "$where".into(),
                "function(){throw new Error('synthetic-test-only')}".into(),
            ),
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
    let other = MongoStorageAdapter::new(
        database.clone(),
        MongoStorageOptions::new("another_customer"),
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
    let mut options = MongoStorageOptions::new("rust_native");
    options.max_query_rows = 10;
    let bounded = MongoStorageAdapter::new(database.clone(), options).unwrap();
    assert!(bounded.query(Entity::Messages, &query).await.is_err());
    for (id, malformed) in [
        (
            "identity",
            doc! {"_id":"ksafe:identity","_rev":1i64,"_v":{},"sessionId":"safe","messageId":"different"},
        ),
        (
            "date",
            doc! {"_id":"ksafe:date","_rev":1i64,"_v":{},"sessionId":"safe","messageId":"date","extra":Bson::DateTime(::mongodb::bson::DateTime::from_millis(0))},
        ),
    ] {
        collection.insert_one(malformed).await.unwrap();
        let error = adapter
            .get(Entity::Messages, &[format!("ksafe:{id}")])
            .await
            .err()
            .unwrap();
        assert!(!error.to_string().contains(&uri));
    }
    database.drop().await.unwrap();
    drop(adapter);
    client.shutdown().immediate(true).await;
    println!("PASS actual MongoDB replica set/official Rust driver: all 17 entities, literal extended-JSON-shaped data, snapshot/majority rollback, 2000 history, replay/checkpoint, expired-writer fence, index scope/namespace/read bounds and corrupted-row refusal");
}
#[tokio::test]
async fn actual_standalone_is_refused_without_partial_writes() {
    let Ok(uri) = std::env::var("POLYMORFA_MONGODB_STANDALONE_URI") else {
        return;
    };
    let parsed = url::Url::parse(&uri).unwrap();
    assert!(matches!(
        parsed.host_str(),
        Some("127.0.0.1" | "localhost" | "[::1]")
    ));
    let client = Client::with_uri_str(&uri).await.unwrap();
    let database = client.database(&format!(
        "standalone_rust_{}",
        uuid::Uuid::new_v4().simple()
    ));
    let adapter =
        MongoStorageAdapter::new(database.clone(), MongoStorageOptions::new("app")).unwrap();
    assert!(adapter.setup().await.is_err());
    let key = BTreeMap::from([
        ("sessionId".into(), "s".into()),
        ("messageId".into(), "m".into()),
    ]);
    let mut row = polymorfa_sdk::storage::merge::empty_row(Entity::Messages, &key).unwrap();
    row.revision = 1;
    assert!(adapter
        .commit(&[RowWrite::Put {
            entity: Entity::Messages,
            row,
            expected_revision: None
        }])
        .await
        .is_err());
    assert_eq!(
        database
            .collection::<Document>("polymorfa_app_messages")
            .count_documents(doc! {})
            .await
            .unwrap(),
        0
    );
    database.drop().await.unwrap();
    client.shutdown().immediate(true).await;
}
