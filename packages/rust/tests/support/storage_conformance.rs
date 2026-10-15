use polymorfa_storage_core::{
    merge::empty_row,
    schema::{encode_key, FieldType, ALL_ENTITIES},
    *,
};
use serde_json::json;
use std::{
    collections::BTreeMap,
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc,
    },
    time::Duration,
};
fn key(values: &[(&str, &str)]) -> RowKey {
    values
        .iter()
        .map(|(k, v)| ((*k).into(), (*v).into()))
        .collect()
}
pub async fn conformance(adapter: Arc<dyn StorageAdapter>) {
    adapter.setup().await.unwrap();
    adapter.setup().await.unwrap();
    for entity in ALL_ENTITIES {
        let d = entity.definition();
        let keys = d
            .key
            .iter()
            .enumerate()
            .map(|(i, k)| ((*k).into(), format!("schema-{i}")))
            .collect::<RowKey>();
        let mut row = empty_row(entity, &keys).unwrap();
        row.revision = 1;
        for (f, t) in d.fields {
            row.fields.insert(
                (*f).into(),
                match t {
                    FieldType::String => json!("name💎'\\\""),
                    FieldType::Number => json!(1.25),
                    FieldType::Boolean => json!(true),
                    FieldType::Json => json!({"unknown":[null,false,1,"💎"]}),
                },
            );
            row.versions.insert((*f).into(), 2.);
        }
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
        let fetched = adapter
            .get(entity, std::slice::from_ref(&row.id))
            .await
            .unwrap()
            .remove(&row.id)
            .unwrap();
        assert_eq!(
            serde_json::to_value(fetched).unwrap(),
            serde_json::to_value(row).unwrap(),
            "{} roundtrip",
            d.name
        );
    }
    let scalar_key = key(&[("sessionId", "scalars"), ("messageId", "json")]);
    let mut scalar = empty_row(Entity::Messages, &scalar_key).unwrap();
    for (index, value) in [
        json!("string 💎"),
        json!(false),
        json!(12.5),
        json!([1, null]),
        json!({"unknown":true}),
        json!({"$date":"literal", "$binary":{"base64":"literal","subType":"zz"}, "$numberLong":"not a number"}),
        json!("replaced literal tags"),
    ]
    .into_iter()
    .enumerate()
    {
        let expected = if index == 0 { None } else { Some(index as u64) };
        scalar.revision = index as u64 + 1;
        scalar.fields.insert("extra".into(), value.clone());
        assert!(
            adapter
                .commit(&[RowWrite::Put {
                    entity: Entity::Messages,
                    row: scalar.clone(),
                    expected_revision: expected
                }])
                .await
                .unwrap()
                .ok
        );
        let fetched = adapter
            .get(Entity::Messages, std::slice::from_ref(&scalar.id))
            .await
            .unwrap()
            .remove(&scalar.id)
            .unwrap();
        assert_eq!(fetched.fields["extra"], value);
    }
    fences(adapter.clone()).await;
    let store = Arc::new(Storage::new(adapter.clone(), StorageOptions::default()).unwrap());
    let session = format!("native-sql-{}", uuid::Uuid::new_v4());
    let message = |id: &str, n: usize| StorageOperation::Upsert {
        entity: Entity::Messages,
        key: key(&[("sessionId", &session), ("messageId", id)]),
        fields: BTreeMap::from([
            (
                "timestamp".into(),
                FieldWrite {
                    value: json!(n),
                    version: n as f64,
                },
            ),
            (
                "text".into(),
                FieldWrite {
                    value: json!(id),
                    version: n as f64,
                },
            ),
            (
                "chatId".into(),
                FieldWrite {
                    value: json!("chat"),
                    version: n as f64,
                },
            ),
        ]),
        guard: None,
    };
    let batch = OperationBatch {
        session_id: session.clone(),
        event_id: Some("event".into()),
        event_type: None,
        operations: (0..2000).map(|n| message(&n.to_string(), n)).collect(),
    };
    assert!(store.apply(&batch).await.unwrap().applied);
    assert!(!store.apply(&batch).await.unwrap().applied);
    let query = IndexQuery {
        index: "by_chat".into(),
        equals: key(&[("sessionId", &session), ("chatId", "chat")]),
        range: None,
        order: Some("asc".into()),
        limit: 17,
        after: None,
    };
    let page = store.query(Entity::Messages, &query).await.unwrap();
    assert_eq!(page.rows.len(), 17);
    let next = store
        .query(
            Entity::Messages,
            &IndexQuery {
                after: page.next,
                ..query.clone()
            },
        )
        .await
        .unwrap();
    assert_eq!(next.rows[0]["timestamp"].as_f64(), Some(17.));
    let id = encode_key(
        Entity::Messages,
        &key(&[("sessionId", &session), ("messageId", "0")]),
    )
    .unwrap();
    let existing = adapter
        .get(Entity::Messages, std::slice::from_ref(&id))
        .await
        .unwrap()
        .remove(&id)
        .unwrap();
    let mut created = empty_row(
        Entity::Messages,
        &key(&[("sessionId", &session), ("messageId", "rolled-back")]),
    )
    .unwrap();
    created.revision = 1;
    assert!(
        !adapter
            .commit(&[
                RowWrite::Put {
                    entity: Entity::Messages,
                    row: created,
                    expected_revision: None
                },
                RowWrite::Delete {
                    entity: Entity::Messages,
                    id,
                    expected_revision: Some(existing.revision + 1)
                }
            ])
            .await
            .unwrap()
            .ok
    );
    assert!(store
        .get(
            Entity::Messages,
            &key(&[("sessionId", &session), ("messageId", "rolled-back")])
        )
        .await
        .unwrap()
        .is_none());
    let checkpoint = OperationBatch {
        session_id: session.clone(),
        event_id: None,
        event_type: None,
        operations: vec![StorageOperation::Checkpoint {
            session_id: session.clone(),
            stream: "events".into(),
            cursor: "saved".into(),
            expected_cursor: Some(None),
            position: Some(json!({"unknown":[1,true]})),
            updated_at: Some(2.),
        }],
    };
    store.apply(&checkpoint).await.unwrap();
    assert!(matches!(
        store.apply(&checkpoint).await,
        Err(StorageError::CheckpointConflict)
    ));
    store
        .apply(&OperationBatch {
            session_id: session.clone(),
            event_id: Some("clear".into()),
            event_type: None,
            operations: vec![
                StorageOperation::Upsert {
                    entity: Entity::Chats,
                    key: key(&[("sessionId", &session), ("chatId", "chat")]),
                    fields: BTreeMap::from([(
                        "clearedAt".into(),
                        FieldWrite {
                            value: json!(1000),
                            version: 1000.,
                        },
                    )]),
                    guard: None,
                },
                StorageOperation::ClearChat {
                    session_id: session.clone(),
                    chat_id: "chat".into(),
                    up_to: 1000.,
                },
            ],
        })
        .await
        .unwrap();
    assert_eq!(
        store
            .query(
                Entity::Messages,
                &IndexQuery {
                    limit: 2000,
                    ..query
                }
            )
            .await
            .unwrap()
            .rows
            .len(),
        999
    );
}
struct PauseAdapter {
    inner: Arc<dyn StorageAdapter>,
    calls: AtomicU64,
    started: tokio::sync::Notify,
    release: tokio::sync::Notify,
}
impl StorageAdapter for PauseAdapter {
    fn name(&self) -> &str {
        "paused-storage"
    }
    fn capabilities(&self) -> StorageCapabilities {
        self.inner.capabilities()
    }
    fn get<'a>(
        &'a self,
        e: Entity,
        ids: &'a [String],
    ) -> StorageFuture<'a, BTreeMap<String, StoredRow>> {
        self.inner.get(e, ids)
    }
    fn query<'a>(&'a self, e: Entity, q: &'a IndexQuery) -> StorageFuture<'a, Vec<StoredRow>> {
        self.inner.query(e, q)
    }
    fn commit<'a>(&'a self, w: &'a [RowWrite]) -> StorageFuture<'a, CommitResult> {
        Box::pin(async move {
            if self.calls.fetch_add(1, Ordering::SeqCst) == 1 {
                self.started.notify_one();
                self.release.notified().await;
            }
            self.inner.commit(w).await
        })
    }
}
async fn fences(adapter: Arc<dyn StorageAdapter>) {
    let clock = Arc::new(AtomicU64::new(100));
    let c = clock.clone();
    let options = StorageOptions {
        now: Arc::new(move || c.load(Ordering::SeqCst) as f64),
        lease_duration: Duration::from_millis(10),
        lease_wait: Duration::ZERO,
        ..Default::default()
    };
    let paused = Arc::new(PauseAdapter {
        inner: adapter.clone(),
        calls: AtomicU64::new(0),
        started: tokio::sync::Notify::new(),
        release: tokio::sync::Notify::new(),
    });
    let old = Storage::new(paused.clone(), options.clone()).unwrap();
    let new = Storage::new(adapter.clone(), options).unwrap();
    let session = format!("fence-{}", uuid::Uuid::new_v4());
    let batch = |id: &str| OperationBatch {
        session_id: session.clone(),
        event_id: Some(id.into()),
        event_type: None,
        operations: vec![StorageOperation::Upsert {
            entity: Entity::Messages,
            key: key(&[("sessionId", &session), ("messageId", id)]),
            fields: BTreeMap::from([(
                "text".into(),
                FieldWrite {
                    value: json!(id),
                    version: 1.,
                },
            )]),
            guard: None,
        }],
    };
    let old_batch = batch("old-only");
    let old_work = old.apply(&old_batch);
    let replacement = async {
        paused.started.notified().await;
        clock.store(111, Ordering::SeqCst);
        new.apply(&batch("new-only")).await.unwrap();
        paused.release.notify_one();
    };
    #[cfg(not(target_arch = "wasm32"))]
    let (result, ()) = tokio::time::timeout(
        Duration::from_secs(2),
        futures_util::future::join(old_work, replacement),
    )
    .await
    .unwrap();
    #[cfg(target_arch = "wasm32")]
    let (result, ()) = futures_util::future::join(old_work, replacement).await;
    assert!(matches!(result, Err(StorageError::LeaseLost)));
    assert!(!new.has_event(&session, "old-only").await.unwrap());
    assert!(new
        .get(
            Entity::Messages,
            &key(&[("sessionId", &session), ("messageId", "old-only")])
        )
        .await
        .unwrap()
        .is_none());
    assert!(new
        .get(
            Entity::Messages,
            &key(&[("sessionId", &session), ("messageId", "new-only")])
        )
        .await
        .unwrap()
        .is_some());
}
