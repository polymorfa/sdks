use futures_util::StreamExt;
use polymorfa_storage_core::{
    merge::{canonical_json, public_row},
    reducer::{
        events::{reduce_event, StorageEvent},
        history::{reduce_history_chunk, HistoryChunkInput, HistorySyncChunk},
    },
    schema::ALL_ENTITIES,
    sync::*,
    *,
};
use serde_json::{json, Value};
use std::sync::{
    atomic::{AtomicBool, AtomicUsize, Ordering},
    Arc, Mutex,
};
fn fixture() -> Value {
    serde_json::from_str(include_str!("../../fixtures/storage-3bac.json")).unwrap()
}
fn clean_snapshot(mut value: Value) -> Value {
    for rows in value.as_object_mut().unwrap().values_mut() {
        rows.as_array_mut().unwrap().sort_by_key(canonical_json);
    }
    value
}
/// Identical exact-producer tests used by native SQLite and actual browser IndexedDB.
pub async fn reducers(adapter: Arc<dyn StorageAdapter>) {
    adapter.setup().await.unwrap();
    let f = fixture();
    for mode in ["events", "history"] {
        let storage = Storage::new(adapter.clone(), StorageOptions::default()).unwrap();
        let batches = if mode == "events" {
            f["events"]
                .as_array()
                .unwrap()
                .iter()
                .map(|v| reduce_event(&serde_json::from_value(v.clone()).unwrap()))
                .collect::<Vec<_>>()
        } else {
            vec![reduce_history_chunk(&HistoryChunkInput {
                session_id: "portable-fixture".into(),
                chunk: serde_json::from_value(f["history"].clone()).unwrap(),
                identities: None,
                chunk_id: None,
            })]
        };
        for batch in &batches {
            storage.apply(batch).await.unwrap();
        }
        // Reconstruct every expected row by its declared key. Storage enumeration is
        // intentionally not part of the provider contract.
        let expected = &f[if mode == "events" {
            "eventRows"
        } else {
            "historyRows"
        }];
        let mut actual = serde_json::Map::new();
        for entity in ALL_ENTITIES {
            if matches!(entity, Entity::Events | Entity::Leases) {
                continue;
            }
            let mut rows = vec![];
            for expected in expected[entity.definition().name].as_array().unwrap() {
                let key = entity
                    .definition()
                    .key
                    .iter()
                    .map(|k| ((*k).into(), expected[*k].as_str().unwrap().into()))
                    .collect::<RowKey>();
                let id = schema::encode_key(entity, &key).unwrap();
                let row = adapter
                    .get(entity, std::slice::from_ref(&id))
                    .await
                    .unwrap()
                    .remove(&id)
                    .expect("expected producer row");
                rows.push(json!(public_row(entity, &row)));
            }
            actual.insert(entity.definition().name.into(), json!(rows));
        }
        assert_eq!(
            canonical_json(&clean_snapshot(Value::Object(actual))),
            canonical_json(&clean_snapshot(expected.clone()))
        );
        for batch in &batches {
            assert_eq!(storage.apply(batch).await.unwrap().writes, 0);
        }
        // Use separate fixture sessions between modes so live events and native
        // history never accidentally satisfy one another's row assertions.
        let deletes = ALL_ENTITIES
            .into_iter()
            .flat_map(|entity| {
                let rows = expected
                    .get(entity.definition().name)
                    .and_then(Value::as_array)
                    .cloned()
                    .unwrap_or_default();
                rows.into_iter().map(move |row| {
                    let key = entity
                        .definition()
                        .key
                        .iter()
                        .map(|k| ((*k).into(), row[*k].as_str().unwrap().into()))
                        .collect();
                    RowWrite::Delete {
                        entity,
                        id: schema::encode_key(entity, &key).unwrap(),
                        expected_revision: None,
                    }
                })
            })
            .collect::<Vec<_>>();
        for part in deletes.chunks(adapter.capabilities().max_commit_size) {
            adapter.commit(part).await.unwrap();
        }
    }
    // Exact batch oracle checks also run through the same WASM/native parser.
    let oracle: Value =
        serde_json::from_str(include_str!("../../fixtures/reducer-batches-3bac.json")).unwrap();
    for case in oracle["events"].as_array().unwrap() {
        assert_eq!(
            canonical_json(
                &serde_json::to_value(reduce_event(
                    &serde_json::from_value(case["input"].clone()).unwrap()
                ))
                .unwrap()
            ),
            canonical_json(&case["batch"])
        );
    }
    for case in oracle["history"].as_array().unwrap() {
        assert_eq!(
            canonical_json(
                &serde_json::to_value(reduce_history_chunk(
                    &serde_json::from_value(case["input"].clone()).unwrap()
                ))
                .unwrap()
            ),
            canonical_json(&case["batch"])
        );
    }
    // A full decoded 2,000-message chunk, rather than hand-built storage writes.
    let s = format!("decoded-{}", uuid::Uuid::new_v4());
    let history:HistorySyncChunk=serde_json::from_value(json!({"syncType":"RECENT","chunkOrder":1,"progress":100,"conversations":[{"id":"111@s.whatsapp.net","messages":(0..2000).map(|i|json!({"message":{"key":{"id":i.to_string(),"fromMe":false},"messageTimestamp":1790856000+i,"message":{"conversation":format!("message {i}")}}})).collect::<Vec<_>>()}]})).unwrap();
    let storage = Storage::new(adapter.clone(), StorageOptions::default()).unwrap();
    let batch = reduce_history_chunk(&HistoryChunkInput {
        session_id: s.clone(),
        chunk: history,
        identities: None,
        chunk_id: Some("big".into()),
    });
    assert!(storage.apply(&batch).await.unwrap().applied);
    assert!(!storage.apply(&batch).await.unwrap().applied);
    let page = storage
        .query(
            Entity::Messages,
            &IndexQuery {
                index: "by_chat".into(),
                equals: RowKey::from([
                    ("sessionId".into(), s),
                    ("chatId".into(), "wa:111@s.whatsapp.net".into()),
                ]),
                range: None,
                order: None,
                limit: 2000,
                after: None,
            },
        )
        .await
        .unwrap();
    assert_eq!(page.rows.len(), 2000);
}
struct Source {
    storage: Arc<Storage>,
    items: Vec<StorageStreamFrame>,
    acks: AtomicUsize,
    fail_ack: bool,
    params: Mutex<Option<StorageStreamParams>>,
    checkpoint: String,
}
impl Source {
    fn new(storage: Arc<Storage>, item: StorageStreamItem, checkpoint: &str) -> Self {
        Self {
            storage,
            items: vec![StorageStreamFrame::Event(item)],
            acks: AtomicUsize::new(0),
            fail_ack: false,
            params: Mutex::new(None),
            checkpoint: checkpoint.into(),
        }
    }
}
impl StorageEventSource for Source {
    fn stream(&self, params: StorageStreamParams) -> StorageResult<StorageEventStream<'_>> {
        *self.params.lock().unwrap() = Some(params);
        Ok(Box::pin(futures_util::stream::iter(
            self.items.clone().into_iter().map(Ok),
        )))
    }
    fn acknowledge<'a>(&'a self, item: &'a StorageStreamItem) -> StorageFuture<'a, ()> {
        Box::pin(async move {
            if let Some(event) = &item.webhook {
                assert!(self.storage.has_event(&event.session, &event.id).await?);
            }
            assert_eq!(
                self.storage
                    .checkpoint("*", &self.checkpoint)
                    .await?
                    .unwrap()
                    .cursor,
                item.cursor
            );
            self.acks.fetch_add(1, Ordering::SeqCst);
            if self.fail_ack {
                Err(StorageError::Provider("fixture ACK unavailable"))
            } else {
                Ok(())
            }
        })
    }
}
fn item(session: &str) -> StorageStreamItem {
    StorageStreamItem {
        webhook: Some(StorageEvent {
            id: format!("event-{session}"),
            session: session.into(),
            event: "session.connected".into(),
            timestamp: "2026-10-01T12:00:00Z".into(),
            payload: json!({"pushName":"fixture"}),
        }),
        cursor: "cursor-1".into(),
        stream_id: "stream-1".into(),
        sequence: 1,
    }
}
fn options(name: &str) -> StorageSyncOptions<'_> {
    StorageSyncOptions {
        checkpoint_stream: name.into(),
        ..Default::default()
    }
}
struct Decoder(bool);
struct Interrupted<'a> {
    source: &'a Source,
    stale: bool,
}
impl StorageEventSource for Interrupted<'_> {
    fn stream(&self, params: StorageStreamParams) -> StorageResult<StorageEventStream<'_>> {
        let stream = self.source.stream(params)?;
        Ok(Box::pin(
            futures_util::stream::once(async move {
                if self.stale {
                    self.source
                        .storage
                        .apply(&OperationBatch {
                            session_id: "*".into(),
                            event_id: None,
                            event_type: None,
                            operations: vec![StorageOperation::Checkpoint {
                                session_id: "*".into(),
                                stream: self.source.checkpoint.clone(),
                                cursor: "competing-writer".into(),
                                expected_cursor: Some(None),
                                position: None,
                                updated_at: Some(1.),
                            }],
                        })
                        .await?;
                    Ok(self.source.items[0].clone())
                } else {
                    Err(StorageError::Provider("fixture source failure"))
                }
            })
            .chain(stream.skip(1)),
        ))
    }
    fn acknowledge<'a>(&'a self, item: &'a StorageStreamItem) -> StorageFuture<'a, ()> {
        self.source.acknowledge(item)
    }
}
impl HistoryChunkDecoder for Decoder {
    fn decode<'a>(
        &'a self,
        _: &'a Value,
        _: &'a StorageEvent,
    ) -> StorageFuture<'a, Option<HistorySyncChunk>> {
        Box::pin(async move {
            if self.0 {
                Err(StorageError::Provider("fixture decoder failure"))
            } else {
                Ok(Some(
                    serde_json::from_value(fixture()["history"].clone()).unwrap(),
                ))
            }
        })
    }
}
struct Fault {
    inner: Arc<dyn StorageAdapter>,
    checkpoint_failure: AtomicBool,
    pause: bool,
    pause_reached: StorageSyncStop,
    stop: Option<StorageSyncStop>,
}
impl StorageAdapter for Fault {
    fn name(&self) -> &str {
        "fixture-fault"
    }
    fn capabilities(&self) -> StorageCapabilities {
        self.inner.capabilities()
    }
    fn get<'a>(
        &'a self,
        e: Entity,
        ids: &'a [String],
    ) -> StorageFuture<'a, std::collections::BTreeMap<String, StoredRow>> {
        self.inner.get(e, ids)
    }
    fn query<'a>(&'a self, e: Entity, q: &'a IndexQuery) -> StorageFuture<'a, Vec<StoredRow>> {
        self.inner.query(e, q)
    }
    fn commit<'a>(&'a self, w: &'a [RowWrite]) -> StorageFuture<'a, CommitResult> {
        Box::pin(async move {
            let contains = |e| {
                w.iter()
                    .any(|w| matches!(w,RowWrite::Put{entity,..}if *entity==e))
            };
            if contains(Entity::Checkpoints) && self.checkpoint_failure.load(Ordering::SeqCst) {
                return Err(StorageError::Provider("fixture checkpoint failure"));
            }
            if contains(Entity::Sessions) {
                if let Some(stop) = &self.stop {
                    stop.stop();
                }
                if self.pause {
                    self.pause_reached.stop();
                    std::future::pending::<()>().await;
                }
            }
            self.inner.commit(w).await
        })
    }
}
pub async fn synchronization(adapter: Arc<dyn StorageAdapter>) {
    let storage = Arc::new(Storage::new(adapter.clone(), StorageOptions::default()).unwrap());
    let token = uuid::Uuid::new_v4().to_string();
    for stale in [false, true] {
        let key = format!("{token}-interrupt-{stale}");
        let event = item(&key);
        let source = Source::new(storage.clone(), event.clone(), &key);
        let result = sync_to_storage(
            &Interrupted {
                source: &source,
                stale,
            },
            &storage,
            options(&key),
            &StorageSyncStop::default(),
        )
        .await;
        assert!(result.is_err());
        assert_eq!(source.acks.load(Ordering::SeqCst), 0);
        assert_eq!(
            storage
                .has_event(&key, &event.webhook.unwrap().id)
                .await
                .unwrap(),
            stale
        );
        if stale {
            assert!(matches!(result, Err(StorageError::CheckpointConflict)));
            assert_eq!(
                storage.checkpoint("*", &key).await.unwrap().unwrap().cursor,
                "competing-writer"
            );
        } else {
            assert!(storage.checkpoint("*", &key).await.unwrap().is_none());
        }
    }
    for case in [
        "happy", "ack", "missing", "metadata", "gap", "callback", "stop",
    ] {
        let key = format!("{token}-{case}");
        let mut event = item(&key);
        if case == "missing" || case == "metadata" {
            event.webhook = None;
        }
        let mut source = Source::new(storage.clone(), event.clone(), &key);
        source.fail_ack = case == "ack";
        if case == "gap" {
            source.items.insert(0, StorageStreamFrame::RetentionGap);
        }
        let stop = StorageSyncStop::default();
        if case == "stop" {
            stop.stop();
        }
        let callback = |_: &StorageStreamItem, _: &engine::ApplyResult| -> StorageResult<()> {
            Err(StorageError::Provider("fixture applied callback failure"))
        };
        let mut opts = options(&key);
        opts.require_payload = case != "metadata";
        if case == "callback" {
            opts.on_applied = Some(&callback);
        }
        let result = sync_to_storage(&source, &storage, opts, &stop).await;
        let succeeds = matches!(case, "happy" | "metadata" | "stop");
        assert_eq!(result.is_ok(), succeeds, "{case}");
        let admitted = !matches!(case, "missing" | "gap" | "stop");
        assert_eq!(
            source.acks.load(Ordering::SeqCst),
            usize::from(admitted),
            "{case} ACK"
        );
        assert_eq!(
            storage.checkpoint("*", &key).await.unwrap().is_some(),
            admitted,
            "{case} cursor"
        );
        {
            let params = source.params.lock().unwrap();
            assert!(params.as_ref().unwrap().manual_acknowledgements);
            assert_eq!(params.as_ref().unwrap().types.len(), 24);
        }
        if case == "ack" {
            let replay = Source::new(storage.clone(), event, &key);
            let observed = AtomicBool::new(false);
            let callback = |_: &StorageStreamItem, result: &engine::ApplyResult| {
                assert!(!result.applied);
                observed.store(true, Ordering::SeqCst);
                Ok(())
            };
            let mut opts = options(&key);
            opts.on_applied = Some(&callback);
            sync_to_storage(&replay, &storage, opts, &StorageSyncStop::default())
                .await
                .unwrap();
            assert!(observed.load(Ordering::SeqCst));
            assert_eq!(
                replay
                    .params
                    .lock()
                    .unwrap()
                    .as_ref()
                    .unwrap()
                    .since
                    .as_deref(),
                Some("cursor-1")
            );
        }
    }
    // Persisted content/marker survives a failed conditional checkpoint, with no ACK.
    let fault = Arc::new(Fault {
        inner: adapter.clone(),
        checkpoint_failure: AtomicBool::new(true),
        pause: false,
        pause_reached: StorageSyncStop::default(),
        stop: None,
    });
    let target = Arc::new(Storage::new(fault.clone(), StorageOptions::default()).unwrap());
    let name = format!("{token}-checkpoint");
    let event = item(&name);
    let source = Source::new(target.clone(), event.clone(), &name);
    assert!(sync_to_storage(
        &source,
        &target,
        options(&name),
        &StorageSyncStop::default()
    )
    .await
    .is_err());
    assert_eq!(source.acks.load(Ordering::SeqCst), 0);
    assert!(target
        .has_event(&name, &event.webhook.as_ref().unwrap().id)
        .await
        .unwrap());
    assert!(target.checkpoint("*", &name).await.unwrap().is_none());
    fault.checkpoint_failure.store(false, Ordering::SeqCst);
    sync_to_storage(
        &source,
        &target,
        options(&name),
        &StorageSyncStop::default(),
    )
    .await
    .unwrap();
    // Stop during an admitted event finishes that event's checkpoint and ACK.
    let stop = StorageSyncStop::default();
    let target = Arc::new(
        Storage::new(
            Arc::new(Fault {
                inner: adapter.clone(),
                checkpoint_failure: AtomicBool::new(false),
                pause: false,
                pause_reached: StorageSyncStop::default(),
                stop: Some(stop.clone()),
            }),
            StorageOptions::default(),
        )
        .unwrap(),
    );
    let name = format!("{token}-admitted");
    let source = Source::new(target.clone(), item(&name), &name);
    assert_eq!(
        sync_to_storage(&source, &target, options(&name), &stop)
            .await
            .unwrap(),
        1
    );
    assert_eq!(source.acks.load(Ordering::SeqCst), 1);
    // A dropped Rust future does not checkpoint or ACK a still-pending provider write.
    let pause_reached = StorageSyncStop::default();
    let target = Arc::new(
        Storage::new(
            Arc::new(Fault {
                inner: adapter.clone(),
                checkpoint_failure: AtomicBool::new(false),
                pause: true,
                pause_reached: pause_reached.clone(),
                stop: None,
            }),
            StorageOptions::default(),
        )
        .unwrap(),
    );
    let name = format!("{token}-drop");
    let source = Source::new(target.clone(), item(&name), &name);
    let stop = StorageSyncStop::default();
    let work = Box::pin(sync_to_storage(&source, &target, options(&name), &stop));
    let reached = Box::pin(pause_reached.stopped());
    match futures_util::future::select(work, reached).await {
        futures_util::future::Either::Right(((), remaining)) => drop(remaining),
        futures_util::future::Either::Left(_) => panic!("fixture write did not pause"),
    };
    assert_eq!(source.acks.load(Ordering::SeqCst), 0);
    assert!(target.checkpoint("*", &name).await.unwrap().is_none());
    // A full-schema decoder is explicit, skipped on replay, and failure stores no marker.
    let name = format!("{token}-decode");
    let mut event = item(&name).webhook.unwrap();
    event.event = "history.sync".into();
    event.payload = json!({"syncType":"RECENT","chunkOrder":1,"progress":40,"messages":[]});
    let bad = Decoder(true);
    assert!(apply_event(
        &storage,
        &event,
        ApplyEventOptions {
            decode_history: Some(&bad),
            ..Default::default()
        }
    )
    .await
    .is_err());
    assert!(!storage.has_event(&name, &event.id).await.unwrap());
    let good = Decoder(false);
    assert!(
        apply_event(
            &storage,
            &event,
            ApplyEventOptions {
                decode_history: Some(&good),
                ..Default::default()
            }
        )
        .await
        .unwrap()
        .applied
    );
    assert!(
        !apply_event(
            &storage,
            &event,
            ApplyEventOptions {
                decode_history: Some(&bad),
                ..Default::default()
            }
        )
        .await
        .unwrap()
        .applied
    );
}
