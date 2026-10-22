use base64::{engine::general_purpose::STANDARD, Engine as _};
use futures_util::stream;
use hmac::{Hmac, Mac};
use polymorfa_sdk::{
    history_chunks::{download_history_chunk, HistoryChunkInput, HistoryChunkOptions},
    storage::{
        memory::MemoryAdapter,
        reducer::{
            events::StorageEvent,
            history::{HistoryConversation, HistorySyncChunk},
        },
        sync::*,
        *,
    },
    webhooks::construct_event,
};
use serde_json::{json, Value};
use sha2::Sha256;
use std::sync::{
    atomic::{AtomicUsize, Ordering},
    Arc,
};
struct ArchiveDecoder;
impl HistoryChunkDecoder for ArchiveDecoder {
    fn decode<'a>(
        &'a self,
        payload: &'a Value,
        _event: &'a StorageEvent,
    ) -> StorageFuture<'a, Option<HistorySyncChunk>> {
        Box::pin(async move {
            let bytes = STANDARD
                .decode(payload["whatsapp"]["data"].as_str().unwrap())
                .unwrap();
            let decoded = download_history_chunk(
                HistoryChunkInput::Inline(bytes),
                HistoryChunkOptions::default(),
            )
            .await
            .map_err(|error| {
                assert_eq!(error.code.as_deref(), Some("media_invalid_ciphertext"));
                StorageError::Invalid("Archive compression rejected before storage")
            })?;
            // Test application projection of supported common fields only.
            // This does not implement generic descriptor dispatch or a full-schema decoder.
            Ok(Some(HistorySyncChunk {
                conversations: Some(
                    decoded
                        .conversations
                        .into_iter()
                        .map(|c| HistoryConversation {
                            id: Some(c.id),
                            ..Default::default()
                        })
                        .collect(),
                ),
                chunk_order: decoded.chunk_order.map(Into::into),
                progress: decoded.progress.map(Into::into),
                ..Default::default()
            }))
        })
    }
}
struct Source {
    item: StorageStreamItem,
    acknowledgements: AtomicUsize,
}
impl StorageEventSource for Source {
    fn stream(&self, params: StorageStreamParams) -> StorageResult<StorageEventStream<'_>> {
        assert!(params.manual_acknowledgements);
        assert!(params.since.is_none());
        Ok(Box::pin(stream::iter([Ok(StorageStreamFrame::Event(
            self.item.clone(),
        ))])))
    }
    fn acknowledge<'a>(&'a self, _item: &'a StorageStreamItem) -> StorageFuture<'a, ()> {
        Box::pin(async move {
            self.acknowledgements.fetch_add(1, Ordering::SeqCst);
            Ok(())
        })
    }
}
#[tokio::test]
async fn real_archive_decoder_failure_prevents_content_progress_checkpoint_and_ack() {
    let corpus: Value = serde_json::from_str(include_str!("fixtures/strict-history.json")).unwrap();
    let single = STANDARD
        .decode(
            corpus["streams"]["provider-gzip"]["input"]
                .as_str()
                .unwrap(),
        )
        .unwrap();
    for tail in [false, true] {
        let mut bytes = single.clone();
        if tail {
            bytes.push(0);
        }
        let raw = json!({"id":"signed-archive","session":"fixture-session","timestamp":"2026-10-17T00:00:00Z","event":"history.sync","payload":{"mode":"deliver","whatsapp_ids":{"linked_devices":"fixture-archive"},"messages":[],"syncType":"RECENT","chunkOrder":7,"progress":92,"fileLength":bytes.len(),"conversationCount":1,"messageCount":0,"pushNameCount":0,"statusMessageCount":0,"whatsapp":{"encoding":"gzip-base64-protobuf","data":STANDARD.encode(bytes)}}}).to_string();
        let mut mac = Hmac::<Sha256>::new_from_slice(b"synthetic-archive-secret").unwrap();
        mac.update(raw.as_bytes());
        let event = construct_event(
            raw.as_bytes(),
            &hex::encode(mac.finalize().into_bytes()),
            "synthetic-archive-secret",
        )
        .unwrap();
        let source = Source {
            item: StorageStreamItem {
                webhook: Some(StorageEvent::from(event.envelope())),
                cursor: "cursor-after-archive".into(),
                stream_id: "fixture-stream".into(),
                sequence: 1,
            },
            acknowledgements: AtomicUsize::new(0),
        };
        let adapter = Arc::new(MemoryAdapter::new());
        let storage = Storage::new(adapter.clone(), StorageOptions::default()).unwrap();
        let result = sync_to_storage(
            &source,
            &storage,
            StorageSyncOptions {
                apply: ApplyEventOptions {
                    decode_history: Some(&ArchiveDecoder),
                    ..Default::default()
                },
                ..Default::default()
            },
            &StorageSyncStop::default(),
        )
        .await;
        if tail {
            assert!(result.is_err());
            assert!(!storage
                .has_event("fixture-session", "signed-archive")
                .await
                .unwrap());
            assert!(storage.checkpoint("*", "events").await.unwrap().is_none());
            assert_eq!(source.acknowledgements.load(Ordering::SeqCst), 0);
            for entity in schema::ALL_ENTITIES {
                assert!(adapter.rows(entity).is_empty());
            }
        } else {
            assert_eq!(result.unwrap(), 1);
            assert!(storage
                .has_event("fixture-session", "signed-archive")
                .await
                .unwrap());
            assert_eq!(
                storage
                    .checkpoint("*", "events")
                    .await
                    .unwrap()
                    .unwrap()
                    .cursor,
                "cursor-after-archive"
            );
            assert_eq!(source.acknowledgements.load(Ordering::SeqCst), 1);
            assert_eq!(adapter.rows(Entity::Chats).len(), 1);
        }
    }
}
