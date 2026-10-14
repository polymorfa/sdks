use polymorfa_sdk::storage::{
    memory::MemoryAdapter,
    merge::{canonical_json, compare_values, empty_row, merge_fields},
    schema::encode_key,
    *,
};
use serde_json::{json, Value};
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
fn fields(name: &str, value: Value, version: f64) -> FieldWrites {
    BTreeMap::from([(name.into(), FieldWrite { value, version })])
}
fn batch(session: &str, event: Option<&str>, operations: Vec<StorageOperation>) -> OperationBatch {
    OperationBatch {
        session_id: session.into(),
        event_id: event.map(str::to_owned),
        event_type: None,
        operations,
    }
}
fn upsert(entity: Entity, key: RowKey, fields: FieldWrites) -> StorageOperation {
    StorageOperation::Upsert {
        entity,
        key,
        fields,
        guard: None,
    }
}
#[test]
fn schema_canonical_merge_and_presence_are_portable() {
    assert_eq!(schema::ALL_ENTITIES.len(), 17);
    assert_eq!(schema::SCHEMA_VERSION, 2);
    assert_eq!(
        encode_key(
            Entity::Messages,
            &key(&[("sessionId", "s.a/💎"), ("messageId", "!'()")])
        )
        .unwrap(),
        "ks%2Ea%2F%F0%9F%92%8E:!'()"
    );
    for entity in schema::ALL_ENTITIES {
        let d = entity.definition();
        assert_eq!(d.key[0], "sessionId");
        for index in d.indexes {
            assert!(d.fields.iter().any(|(f, _)| *f == index.sort));
        }
    }
    for (number, expected) in [
        (1e-7, "1e-7"),
        (1e-6, "0.000001"),
        (1e20, "100000000000000000000"),
        (1e21, "1e+21"),
        (-0., "0"),
        (1.5, "1.5"),
    ] {
        assert_eq!(canonical_json(&json!(number)), expected);
    }
    assert_eq!(
        compare_values(&json!(-0.), &json!(0.)),
        std::cmp::Ordering::Equal
    );
    assert_eq!(
        canonical_json(&json!({"\u{e000}":1,"💎":2})),
        "{\"💎\":2,\"\u{e000}\":1}"
    );
    let row = empty_row(
        Entity::Messages,
        &key(&[("sessionId", "s"), ("messageId", "m")]),
    )
    .unwrap();
    let (a, _) = merge_fields(Entity::Messages, &row, &fields("text", json!("a"), 2.)).unwrap();
    let (b, _) = merge_fields(Entity::Messages, &a, &fields("text", json!("b"), 2.)).unwrap();
    assert_eq!(b.fields["text"], "b");
    assert!(
        !merge_fields(Entity::Messages, &b, &fields("text", json!("a"), 2.))
            .unwrap()
            .1
    );
    let absent: StorageOperation = serde_json::from_value(
        json!({"kind":"checkpoint","sessionId":"s","stream":"events","cursor":"x"}),
    )
    .unwrap();
    let null:StorageOperation=serde_json::from_value(json!({"kind":"checkpoint","sessionId":"s","stream":"events","cursor":"x","expectedCursor":null})).unwrap();
    assert!(matches!(
        absent,
        StorageOperation::Checkpoint {
            expected_cursor: None,
            ..
        }
    ));
    assert!(matches!(
        null,
        StorageOperation::Checkpoint {
            expected_cursor: Some(None),
            ..
        }
    ));
}
#[tokio::test]
async fn memory_atomicity_engine_replay_concurrency_checkpoints_clear_and_2000_rows() {
    let memory = Arc::new(MemoryAdapter::new());
    let store = Arc::new(Storage::new(memory.clone(), StorageOptions::default()).unwrap());
    let k = key(&[("sessionId", "s"), ("messageId", "m")]);
    let first = batch(
        "s",
        Some("evt"),
        vec![upsert(
            Entity::Messages,
            k.clone(),
            fields("text", json!("first"), 1.),
        )],
    );
    assert!(store.apply(&first).await.unwrap().applied);
    assert!(!store.apply(&first).await.unwrap().applied);
    let current = memory.rows(Entity::Messages)[0].clone();
    let mut created = empty_row(
        Entity::Messages,
        &key(&[("sessionId", "s"), ("messageId", "new")]),
    )
    .unwrap();
    created.revision = 1;
    let result = memory
        .commit(&[
            RowWrite::Put {
                entity: Entity::Messages,
                row: created,
                expected_revision: None,
            },
            RowWrite::Delete {
                entity: Entity::Messages,
                id: current.id.clone(),
                expected_revision: Some(current.revision + 1),
            },
        ])
        .await
        .unwrap();
    assert!(!result.ok);
    assert_eq!(memory.rows(Entity::Messages).len(), 1);
    let mut tasks = Vec::new();
    for version in 2..=10 {
        let store = store.clone();
        let k = k.clone();
        tasks.push(tokio::spawn(async move {
            store
                .apply(&batch(
                    "s",
                    None,
                    vec![upsert(
                        Entity::Messages,
                        k,
                        fields("text", json!(version.to_string()), version as f64),
                    )],
                ))
                .await
                .unwrap();
        }));
    }
    for task in tasks {
        task.await.unwrap();
    }
    assert_eq!(
        store.get(Entity::Messages, &k).await.unwrap().unwrap()["text"],
        "10"
    );
    let checkpoint = |expected| StorageOperation::Checkpoint {
        session_id: "s".into(),
        stream: "events".into(),
        cursor: "next".into(),
        expected_cursor: expected,
        position: None,
        updated_at: Some(100.),
    };
    store
        .apply(&batch("s", None, vec![checkpoint(Some(None))]))
        .await
        .unwrap();
    assert!(matches!(
        store
            .apply(&batch("s", None, vec![checkpoint(Some(None))]))
            .await,
        Err(StorageError::CheckpointConflict)
    ));
    assert_eq!(
        store
            .checkpoint("s", "events")
            .await
            .unwrap()
            .unwrap()
            .cursor,
        "next"
    );
    let mut operations = Vec::new();
    for i in 0..2000 {
        let mut f = fields("timestamp", json!(i), i as f64);
        f.extend(fields("chatId", json!("chat"), i as f64));
        operations.push(upsert(
            Entity::Messages,
            key(&[("sessionId", "big"), ("messageId", &i.to_string())]),
            f,
        ));
    }
    store
        .apply(&batch("big", Some("chunk"), operations))
        .await
        .unwrap();
    assert_eq!(memory.rows(Entity::Messages).len(), 2001);
    let query = IndexQuery {
        index: "by_chat".into(),
        equals: key(&[("sessionId", "big"), ("chatId", "chat")]),
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
                ..query
            },
        )
        .await
        .unwrap();
    assert_eq!(next.rows[0]["timestamp"], 17);
    store
        .apply(&batch(
            "big",
            None,
            vec![
                upsert(
                    Entity::Chats,
                    key(&[("sessionId", "big"), ("chatId", "chat")]),
                    fields("clearedAt", json!(1000), 1000.),
                ),
                StorageOperation::ClearChat {
                    session_id: "big".into(),
                    chat_id: "chat".into(),
                    up_to: 1000.,
                },
            ],
        ))
        .await
        .unwrap();
    assert_eq!(memory.rows(Entity::Messages).len(), 1000);
    let late = StorageOperation::Upsert {
        entity: Entity::Messages,
        key: key(&[("sessionId", "big"), ("messageId", "late")]),
        fields: fields("text", json!("must stay absent"), 1001.),
        guard: Some(ChatWatermarkGuard {
            session_id: "big".into(),
            chat_id: "chat".into(),
            timestamp: 500.,
        }),
    };
    store
        .apply(&batch("big", Some("late"), vec![late]))
        .await
        .unwrap();
    assert!(store
        .get(
            Entity::Messages,
            &key(&[("sessionId", "big"), ("messageId", "late")])
        )
        .await
        .unwrap()
        .is_none());
    assert!(store
        .apply(&batch(
            "s",
            None,
            vec![upsert(
                Entity::Messages,
                key(&[("sessionId", "foreign"), ("messageId", "m")]),
                FieldWrites::new()
            )]
        ))
        .await
        .is_err());
    assert!(store
        .apply(&batch(
            "s",
            None,
            vec![upsert(
                Entity::Leases,
                key(&[("sessionId", "s")]),
                FieldWrites::new()
            )]
        ))
        .await
        .is_err());
}
struct Paused {
    memory: Arc<MemoryAdapter>,
    calls: AtomicU64,
    started: tokio::sync::Notify,
    release: tokio::sync::Notify,
}
impl StorageAdapter for Paused {
    fn name(&self) -> &str {
        "paused-memory"
    }
    fn capabilities(&self) -> StorageCapabilities {
        self.memory.capabilities()
    }
    fn get<'a>(
        &'a self,
        e: Entity,
        ids: &'a [String],
    ) -> StorageFuture<'a, BTreeMap<String, StoredRow>> {
        self.memory.get(e, ids)
    }
    fn query<'a>(&'a self, e: Entity, q: &'a IndexQuery) -> StorageFuture<'a, Vec<StoredRow>> {
        self.memory.query(e, q)
    }
    fn commit<'a>(&'a self, writes: &'a [RowWrite]) -> StorageFuture<'a, CommitResult> {
        Box::pin(async move {
            if self.calls.fetch_add(1, Ordering::SeqCst) == 1 {
                self.started.notify_one();
                self.release.notified().await;
            }
            self.memory.commit(writes).await
        })
    }
}
#[tokio::test]
async fn durable_fences_reject_expired_paused_writer_and_preserve_generation_on_release() {
    let memory = Arc::new(MemoryAdapter::new());
    let clock = Arc::new(AtomicU64::new(100));
    let c = clock.clone();
    let options = StorageOptions {
        now: Arc::new(move || c.load(Ordering::SeqCst) as f64),
        lease_duration: Duration::from_millis(10),
        lease_wait: Duration::ZERO,
        ..Default::default()
    };
    let paused = Arc::new(Paused {
        memory: memory.clone(),
        calls: AtomicU64::new(0),
        started: tokio::sync::Notify::new(),
        release: tokio::sync::Notify::new(),
    });
    let old = Arc::new(Storage::new(paused.clone(), options.clone()).unwrap());
    let new = Storage::new(memory.clone(), options).unwrap();
    let old_task = tokio::spawn(async move {
        old.apply(&batch(
            "s",
            Some("old"),
            vec![upsert(
                Entity::Messages,
                key(&[("sessionId", "s"), ("messageId", "m")]),
                fields("text", json!("old"), 1.),
            )],
        ))
        .await
    });
    paused.started.notified().await;
    clock.store(111, Ordering::SeqCst);
    new.apply(&batch(
        "s",
        Some("new"),
        vec![upsert(
            Entity::Messages,
            key(&[("sessionId", "s"), ("messageId", "m")]),
            fields("text", json!("new"), 2.),
        )],
    ))
    .await
    .unwrap();
    paused.release.notify_one();
    assert!(matches!(
        old_task.await.unwrap(),
        Err(StorageError::LeaseLost)
    ));
    assert!(!new.has_event("s", "old").await.unwrap());
    let revision = memory.rows(Entity::Leases)[0].revision;
    new.apply(&batch("s", Some("next"), vec![])).await.unwrap();
    assert!(memory.rows(Entity::Leases)[0].revision > revision);
    assert_eq!(
        new.get(
            Entity::Messages,
            &key(&[("sessionId", "s"), ("messageId", "m")])
        )
        .await
        .unwrap()
        .unwrap()["text"],
        "new"
    );
}

struct ConflictFirstChunk {
    memory: Arc<MemoryAdapter>,
    failed: std::sync::atomic::AtomicBool,
}
impl StorageAdapter for ConflictFirstChunk {
    fn name(&self) -> &str {
        "conflict-chunk"
    }
    fn capabilities(&self) -> StorageCapabilities {
        StorageCapabilities {
            atomic_commit: true,
            max_commit_size: 3,
        }
    }
    fn get<'a>(
        &'a self,
        e: Entity,
        ids: &'a [String],
    ) -> StorageFuture<'a, BTreeMap<String, StoredRow>> {
        self.memory.get(e, ids)
    }
    fn query<'a>(&'a self, e: Entity, q: &'a IndexQuery) -> StorageFuture<'a, Vec<StoredRow>> {
        self.memory.query(e, q)
    }
    fn commit<'a>(&'a self, writes: &'a [RowWrite]) -> StorageFuture<'a, CommitResult> {
        Box::pin(async move {
            if writes.len() > 1 && !self.failed.swap(true, Ordering::SeqCst) {
                let id = match &writes[0] {
                    RowWrite::Put { row, .. } => row.id.clone(),
                    _ => panic!(),
                };
                return Ok(CommitResult {
                    ok: false,
                    conflicts: vec![id],
                });
            }
            self.memory.commit(writes).await
        })
    }
}
#[tokio::test]
async fn failed_chunk_never_commits_later_rows_or_marker_and_replay_can_finish() {
    let memory = Arc::new(MemoryAdapter::new());
    let adapter = Arc::new(ConflictFirstChunk {
        memory: memory.clone(),
        failed: std::sync::atomic::AtomicBool::new(false),
    });
    let store = Storage::new(
        adapter,
        StorageOptions {
            max_retries: 0,
            ..Default::default()
        },
    )
    .unwrap();
    let operations = (0..3)
        .map(|i| StorageOperation::Upsert {
            entity: Entity::Messages,
            key: key(&[("sessionId", "s"), ("messageId", &i.to_string())]),
            fields: fields("text", json!("value"), 1.),
            guard: Some(ChatWatermarkGuard {
                session_id: "s".into(),
                chat_id: "c".into(),
                timestamp: 1.,
            }),
        })
        .collect();
    let event = batch("s", Some("event"), operations);
    assert!(matches!(
        store.apply(&event).await,
        Err(StorageError::Conflict(_))
    ));
    assert!(memory.rows(Entity::Messages).is_empty());
    assert!(!store.has_event("s", "event").await.unwrap());
    assert!(store.apply(&event).await.unwrap().applied);
    assert_eq!(memory.rows(Entity::Messages).len(), 3);
    assert!(store.has_event("s", "event").await.unwrap());
}
