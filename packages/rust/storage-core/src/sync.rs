//! Opt-in persistence for verified events. Trust and application ACK authority stay with the caller.
mod history_descriptor;
use crate::{
    reducer::{
        events::{reduce_event, StorageEvent, STORED_EVENT_TYPES},
        history::{
            history_identity_index, reduce_history_chunk, HistoryChunkInput, HistorySyncChunk,
        },
    },
    *,
};
use futures_util::{Stream, StreamExt};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
#[derive(Clone, Default)]
pub struct StorageSyncStop(Arc<StopState>);
#[derive(Default)]
struct StopState {
    stopped: AtomicBool,
    event: event_listener::Event,
}
impl StorageSyncStop {
    pub fn stop(&self) {
        self.0.stopped.store(true, Ordering::SeqCst);
        self.0.event.notify(usize::MAX);
    }
    pub fn is_stopped(&self) -> bool {
        self.0.stopped.load(Ordering::SeqCst)
    }
    pub async fn stopped(&self) {
        let listener = self.0.event.listen();
        if !self.is_stopped() {
            listener.await;
        }
    }
}
#[derive(Clone)]
pub struct StorageStreamItem {
    pub webhook: Option<StorageEvent>,
    pub cursor: String,
    pub stream_id: String,
    pub sequence: u64,
}
#[derive(Clone)]
pub enum StorageStreamFrame {
    Event(StorageStreamItem),
    RetentionGap,
}
#[cfg(not(target_arch = "wasm32"))]
pub type StorageEventStream<'a> =
    Pin<Box<dyn Stream<Item = StorageResult<StorageStreamFrame>> + Send + 'a>>;
#[cfg(target_arch = "wasm32")]
pub type StorageEventStream<'a> =
    Pin<Box<dyn Stream<Item = StorageResult<StorageStreamFrame>> + 'a>>;
pub struct StorageStreamParams {
    pub since: Option<String>,
    pub types: Vec<String>,
    pub manual_acknowledgements: bool,
}
pub trait StorageEventSource: AdapterBounds {
    fn stream(&self, params: StorageStreamParams) -> StorageResult<StorageEventStream<'_>>;
    fn acknowledge<'a>(&'a self, item: &'a StorageStreamItem) -> StorageFuture<'a, ()>;
}
pub trait HistoryChunkDecoder: AdapterBounds {
    fn decode<'a>(
        &'a self,
        payload: &'a Value,
        event: &'a StorageEvent,
    ) -> StorageFuture<'a, Option<HistorySyncChunk>>;
}
#[derive(Clone, Copy, Default)]
pub struct ApplyEventOptions<'a> {
    pub decode_history: Option<&'a dyn HistoryChunkDecoder>,
    pub decode_history_descriptor: Option<&'a dyn HistoryDescriptorDecoder>,
    pub history_descriptor_mode: HistoryDescriptorMode,
}
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum HistoryDescriptorMode {
    #[default]
    Decode,
    MetadataOnly,
}
/// Caller owns authorized download and complete-schema decoding/application projection.
/// The non-null return is intentional; deliberate consumption uses MetadataOnly.
pub trait HistoryDescriptorDecoder: AdapterBounds {
    fn decode<'a>(
        &'a self,
        payload: &'a Value,
        event: &'a StorageEvent,
    ) -> StorageFuture<'a, HistorySyncChunk>;
}
pub async fn apply_event(
    storage: &Storage,
    event: &StorageEvent,
    options: ApplyEventOptions<'_>,
) -> StorageResult<engine::ApplyResult> {
    if event.event == "history.sync" && event.payload.get("delivery").is_some() {
        history_descriptor::validate(&event.payload)?;
        if storage.has_event(&event.session, &event.id).await? {
            return Ok(engine::ApplyResult {
                applied: false,
                writes: 0,
            });
        }
        let mut batch = reduce_event(event);
        if options.history_descriptor_mode == HistoryDescriptorMode::MetadataOnly {
            return storage.apply(&batch).await;
        }
        let decoder = options
            .decode_history_descriptor
            .ok_or(StorageError::Invalid(
                "A history descriptor decoder is required.",
            ))?;
        let chunk = decoder
            .decode(&event.payload, event)
            .await
            .map_err(|_| StorageError::Invalid("Failed to decode history descriptor."))?;
        let history = reduce_history_chunk(&HistoryChunkInput {
            session_id: event.session.clone(),
            chunk,
            identities: None,
            chunk_id: None,
        });
        let mut operations = history.operations;
        operations.extend(batch.operations);
        batch.operations = operations;
        return storage.apply(&batch).await;
    }
    let mut batch = reduce_event(event);
    if event.event == "history.sync" && event.payload["kind"] != "history" {
        if let Some(decoder) = options.decode_history {
            if storage.has_event(&event.session, &event.id).await? {
                return Ok(engine::ApplyResult {
                    applied: false,
                    writes: 0,
                });
            }
            if let Some(chunk) = decoder.decode(&event.payload, event).await? {
                let history = reduce_history_chunk(&HistoryChunkInput {
                    session_id: event.session.clone(),
                    chunk,
                    identities: Some(history_identity_index(&event.payload)),
                    chunk_id: None,
                });
                let mut operations = history.operations;
                operations.extend(batch.operations);
                batch.operations = operations;
            }
        }
    }
    storage.apply(&batch).await
}
/// Caller supplies an already verified envelope and sends its HTTP response only after `handle` succeeds.
pub struct StorageWebhookHandler<'a> {
    pub storage: &'a Storage,
    pub options: ApplyEventOptions<'a>,
}
impl StorageWebhookHandler<'_> {
    pub async fn handle(&self, event: &StorageEvent) -> StorageResult<engine::ApplyResult> {
        apply_event(self.storage, event, self.options).await
    }
}
pub trait AppliedCallback: AdapterBounds {
    fn on_applied(
        &self,
        item: &StorageStreamItem,
        result: &engine::ApplyResult,
    ) -> StorageResult<()>;
}
impl<T> AppliedCallback for T
where
    T: Fn(&StorageStreamItem, &engine::ApplyResult) -> StorageResult<()> + AdapterBounds,
{
    fn on_applied(
        &self,
        item: &StorageStreamItem,
        result: &engine::ApplyResult,
    ) -> StorageResult<()> {
        self(item, result)
    }
}
pub struct StorageSyncOptions<'a> {
    pub checkpoint_session: String,
    pub checkpoint_stream: String,
    pub types: Vec<String>,
    pub require_payload: bool,
    pub apply: ApplyEventOptions<'a>,
    pub on_applied: Option<&'a dyn AppliedCallback>,
    pub now: Arc<dyn Fn() -> f64 + Send + Sync>,
}
impl Default for StorageSyncOptions<'_> {
    fn default() -> Self {
        Self {
            checkpoint_session: "*".into(),
            checkpoint_stream: "events".into(),
            types: STORED_EVENT_TYPES.iter().map(|s| s.to_string()).collect(),
            require_payload: true,
            apply: ApplyEventOptions::default(),
            on_applied: None,
            now: Arc::new(crate::runtime::epoch_millis),
        }
    }
}
/// Admitted events finish their content, marker, checkpoint and ACK before a stop is observed.
/// Dropping this future can interrupt an await and leave a provider outcome uncertain.
pub async fn sync_to_storage(
    source: &dyn StorageEventSource,
    storage: &Storage,
    options: StorageSyncOptions<'_>,
    stop: &StorageSyncStop,
) -> StorageResult<usize> {
    let saved = storage
        .checkpoint(&options.checkpoint_session, &options.checkpoint_stream)
        .await?;
    let mut expected = saved.map(|s| s.cursor);
    let mut stream = source.stream(StorageStreamParams {
        since: expected.clone(),
        types: options.types,
        manual_acknowledgements: true,
    })?;
    let mut count = 0;
    loop {
        if stop.is_stopped() {
            break;
        }
        let frame = {
            let next = stream.next();
            let stopped = stop.stopped();
            futures_util::pin_mut!(next, stopped);
            match futures_util::future::select(next, stopped).await {
                futures_util::future::Either::Left((next, _)) => next,
                futures_util::future::Either::Right(_) => break,
            }
        };
        let Some(frame) = frame else {
            break;
        };
        let item=match frame?{StorageStreamFrame::RetentionGap=>return Err(StorageError::Provider("Event retention has a storage gap; reconcile customer-owned history before resuming.")),StorageStreamFrame::Event(item)=>item};
        if stop.is_stopped() {
            break;
        }
        if item.webhook.is_none() && options.require_payload {
            return Err(StorageError::Provider(
                "Event body unavailable; storage checkpoint and acknowledgement were not advanced.",
            ));
        }
        let applied = if let Some(event) = &item.webhook {
            apply_event(storage, event, options.apply).await?
        } else {
            engine::ApplyResult {
                applied: false,
                writes: 0,
            }
        };
        let now = (options.now)();
        if !now.is_finite() {
            return Err(StorageError::Invalid("Storage sync clock must be finite."));
        }
        storage
            .apply(&OperationBatch {
                session_id: options.checkpoint_session.clone(),
                event_id: None,
                event_type: None,
                operations: vec![StorageOperation::Checkpoint {
                    session_id: options.checkpoint_session.clone(),
                    stream: options.checkpoint_stream.clone(),
                    cursor: item.cursor.clone(),
                    expected_cursor: Some(expected.clone()),
                    position: None,
                    updated_at: Some(now),
                }],
            })
            .await?;
        expected = Some(item.cursor.clone());
        source.acknowledge(&item).await?;
        if let Some(callback) = options.on_applied {
            callback.on_applied(&item, &applied)?;
        }
        count += 1;
    }
    Ok(count)
}
