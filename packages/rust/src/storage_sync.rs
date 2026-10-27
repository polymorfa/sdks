//! Opt-in adapter for the existing project-bound Events API; never runs at SDK construction.
use crate::storage::{reducer::events::StorageEvent, sync::*, *};
use crate::{platform::Events, stream::EventStreamOptions, RequestOptions};
use futures_util::StreamExt;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
impl From<&crate::webhooks::WebhookEnvelope> for StorageEvent {
    fn from(event: &crate::webhooks::WebhookEnvelope) -> Self {
        Self {
            id: event.id.clone(),
            session: event.session.clone(),
            timestamp: event.timestamp.clone(),
            event: event.event.clone(),
            payload: event.payload.clone(),
        }
    }
}
pub struct NativeStorageEventSource<'a> {
    events: &'a Events<'a>,
    options: EventStreamOptions,
    ack_options: RequestOptions,
}
impl<'a> NativeStorageEventSource<'a> {
    pub fn new(
        events: &'a Events<'a>,
        options: EventStreamOptions,
        ack_options: RequestOptions,
    ) -> Self {
        Self {
            events,
            options,
            ack_options,
        }
    }
}
struct CancelStreamOnDrop(tokio_util::sync::CancellationToken);
impl Drop for CancelStreamOnDrop {
    fn drop(&mut self) {
        self.0.cancel();
    }
}
fn source_error() -> StorageError {
    StorageError::Provider(
        "Native event source operation failed; saved storage state may require reconciliation.",
    )
}
impl StorageEventSource for NativeStorageEventSource<'_> {
    fn stream(&self, params: StorageStreamParams) -> StorageResult<StorageEventStream<'_>> {
        let gap = Arc::new(tokio::sync::Notify::new());
        let seen = Arc::new(AtomicBool::new(false));
        let mut options = self.options.clone();
        options.since = params.since;
        options.types = params.types;
        options.manual_acknowledgements = true;
        let cancellation = options
            .request_options
            .cancellation
            .as_ref()
            .map(tokio_util::sync::CancellationToken::child_token)
            .unwrap_or_default();
        options.request_options.cancellation = Some(cancellation.clone());
        let previous = options.on_gap.clone();
        let notify = gap.clone();
        let flag = seen.clone();
        options.on_gap = Some(Arc::new(move |value| {
            flag.store(true, Ordering::SeqCst);
            notify.notify_one();
            if let Some(callback) = &previous {
                callback(value);
            }
        }));
        let mut source = self
            .events
            .stream(options)
            .map_err(|_| source_error())?
            .into_stream();
        Ok(Box::pin(
            async_stream::stream! {let _cancel=CancelStreamOnDrop(cancellation);loop{
             if seen.load(Ordering::SeqCst){yield Ok(StorageStreamFrame::RetentionGap);break;}
             let next=tokio::select!{biased;_=gap.notified()=>{yield Ok(StorageStreamFrame::RetentionGap);break;},next=source.next()=>next};
             if seen.load(Ordering::SeqCst){yield Ok(StorageStreamFrame::RetentionGap);break;}
             match next{Some(Ok(item))=>yield Ok(StorageStreamFrame::Event(StorageStreamItem{webhook:item.webhook.as_ref().map(StorageEvent::from),cursor:item.cursor,stream_id:item.stream_id,sequence:item.sequence})),Some(Err(_))=>{yield Err(source_error());break;},None=>break,}
            }},
        ))
    }
    fn acknowledge<'a>(&'a self, item: &'a StorageStreamItem) -> StorageFuture<'a, ()> {
        Box::pin(async move {
            self.events
                .acknowledge_stream(
                    &item.stream_id,
                    &crate::models::EventStreamAcknowledgement {
                        cursor: item.cursor.clone(),
                        sequence: item.sequence,
                    },
                    self.ack_options.clone(),
                )
                .await
                .map_err(|_| source_error())?;
            Ok(())
        })
    }
}
/// The caller verifies the envelope before invoking this helper. No signature or principal is inferred.
pub async fn apply_verified_event(
    storage: &Storage,
    event: &crate::webhooks::WebhookEnvelope,
    options: ApplyEventOptions<'_>,
) -> StorageResult<engine::ApplyResult> {
    apply_event(storage, &StorageEvent::from(event), options).await
}
