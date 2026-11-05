use polymorfa_storage_core::{memory::MemoryAdapter, merge::empty_row, schema::ALL_ENTITIES, *};
use std::{collections::BTreeMap, sync::Arc};
#[tokio::test]
async fn independent_core_schema2_and_fenced_2000_message_engine() {
    let adapter = Arc::new(MemoryAdapter::new());
    for entity in ALL_ENTITIES {
        let keys = entity
            .definition()
            .key
            .iter()
            .map(|k| ((*k).into(), "native-core".into()))
            .collect();
        let mut row = empty_row(entity, &keys).unwrap();
        row.revision = 1;
        assert!(
            adapter
                .commit(&[RowWrite::Put {
                    entity,
                    row: row.clone(),
                    expected_revision: None
                }])
                .await
                .unwrap()
                .ok
        );
        assert_eq!(
            adapter.get(entity, &[row.id.clone()]).await.unwrap()[&row.id].revision,
            1
        );
    }
    let storage = Storage::new(adapter, StorageOptions::default()).unwrap();
    let batch = OperationBatch {
        session_id: "history".into(),
        event_id: Some("event".into()),
        event_type: None,
        operations: (0..2000)
            .map(|i| StorageOperation::Upsert {
                entity: Entity::Messages,
                key: RowKey::from([
                    ("sessionId".into(), "history".into()),
                    ("messageId".into(), i.to_string()),
                ]),
                fields: BTreeMap::from([
                    (
                        "chatId".into(),
                        FieldWrite {
                            value: "chat".into(),
                            version: 1.,
                        },
                    ),
                    (
                        "timestamp".into(),
                        FieldWrite {
                            value: i.into(),
                            version: 1.,
                        },
                    ),
                ]),
                guard: None,
            })
            .collect(),
    };
    assert!(storage.apply(&batch).await.unwrap().applied);
    assert!(!storage.apply(&batch).await.unwrap().applied);
    let query = IndexQuery {
        index: "by_chat".into(),
        equals: RowKey::from([
            ("sessionId".into(), "history".into()),
            ("chatId".into(), "chat".into()),
        ]),
        range: None,
        order: None,
        limit: 2000,
        after: None,
    };
    assert_eq!(
        storage
            .query(Entity::Messages, &query)
            .await
            .unwrap()
            .rows
            .len(),
        2000
    );
}
