use polymorfa_sdk::storage::{memory::MemoryAdapter, reducer::events::StorageEvent, sync::*, *};
use serde_json::{json, Value};
use std::sync::Arc;
fn fixture() -> Value {
    serde_json::from_str(include_str!("fixtures/descriptor-storage/fixture.json")).unwrap()
}
fn event(payload: Value) -> StorageEvent {
    StorageEvent {
        id: "descriptor-event".into(),
        session: "descriptor-session".into(),
        timestamp: "2026-10-17T00:00:00Z".into(),
        event: "history.sync".into(),
        payload,
    }
}
#[tokio::test]
async fn descriptor_missing_decoder_refuses_consumption() {
    let a = Arc::new(MemoryAdapter::new());
    let s = Storage::new(a.clone(), StorageOptions::default()).unwrap();
    let e = event(fixture()["inline"].clone());
    assert!(
        apply_event(&s, &e, ApplyEventOptions::default())
            .await
            .is_err(),
        "undecoded descriptor was consumed"
    );
    assert!(!s.has_event(&e.session, &e.id).await.unwrap());
    assert!(a.rows(Entity::HistoryProgress).is_empty());
}
use base64::{engine::general_purpose::STANDARD, Engine as _};
use hmac::{Hmac, Mac};
use polymorfa_sdk::{
    storage::reducer::history::HistorySyncChunk,
    storage_sync::{apply_verified_event, NativeStorageEventSource},
    stream::EventStreamOptions,
    RequestOptions,
};
use sha2::Sha256;
use std::{
    io::{BufRead, BufReader},
    process::{Child, Command, Stdio},
    sync::atomic::{AtomicUsize, Ordering},
    time::Duration,
};
#[allow(dead_code)]
mod support;
struct Decoder {
    mode: &'static str,
    calls: AtomicUsize,
    storage: Option<Arc<Storage>>,
}
impl HistoryDescriptorDecoder for Decoder {
    fn decode<'a>(
        &'a self,
        p: &'a Value,
        e: &'a StorageEvent,
    ) -> StorageFuture<'a, HistorySyncChunk> {
        Box::pin(async move {
            self.calls.fetch_add(1, Ordering::SeqCst);
            assert_eq!(p, &e.payload);
            if self.mode == "error" {
                return Err(StorageError::Invalid("synthetic-key-secret"));
            }
            if self.mode == "empty" {
                return Ok(HistorySyncChunk::default());
            }
            if self.mode == "invalid" || self.mode == "null" {
                return serde_json::from_value(if self.mode == "null" {
                    Value::Null
                } else {
                    json!({"conversations":"bad"})
                })
                .map_err(|_| StorageError::Invalid("invalid application projection"));
            }
            if let Some(s) = &self.storage {
                s.apply(&OperationBatch {
                    session_id: "*".into(),
                    event_id: None,
                    event_type: None,
                    operations: vec![StorageOperation::Checkpoint {
                        session_id: "*".into(),
                        stream: "events".into(),
                        cursor: "competitor".into(),
                        expected_cursor: Some(None),
                        position: None,
                        updated_at: None,
                    }],
                })
                .await?;
            }
            if let Some(data) = p["inline"]["data"].as_str() {
                let bytes = STANDARD.decode(data).unwrap();
                let d = polymorfa_sdk::history_chunks::download_history_chunk(
                    polymorfa_sdk::history_chunks::HistoryChunkInput::Inline(bytes),
                    Default::default(),
                )
                .await
                .map_err(|_| StorageError::Invalid("verified history failed"))?;
                assert_eq!(
                    d.proto.encoded,
                    STANDARD
                        .decode(fixture()["protobuf"].as_str().unwrap())
                        .unwrap()
                );
            }
            // Explicit application projection of this independent fixture, not a generic full-schema codec.
            serde_json::from_value(fixture()["chunk"].clone())
                .map_err(|_| StorageError::Invalid("application projection failed"))
        })
    }
}
struct Archive(AtomicUsize);
impl HistoryChunkDecoder for Archive {
    fn decode<'a>(
        &'a self,
        _: &'a Value,
        _: &'a StorageEvent,
    ) -> StorageFuture<'a, Option<HistorySyncChunk>> {
        Box::pin(async move {
            self.0.fetch_add(1, Ordering::SeqCst);
            Ok(None)
        })
    }
}
fn decoder(mode: &'static str) -> Decoder {
    Decoder {
        mode,
        calls: AtomicUsize::new(0),
        storage: None,
    }
}
#[tokio::test]
async fn signed_public_descriptor_dispatch_and_secret_safe_replay() {
    for branch in ["inline", "media"] {
        for mode in [
            "missing",
            "archive",
            "null",
            "error",
            "invalid",
            "metadata",
            "metadata-decoder",
            "empty",
            "full",
        ] {
            let a = Arc::new(MemoryAdapter::new());
            let s = Storage::new(a.clone(), StorageOptions::default()).unwrap();
            let e = event(fixture()[branch].clone());
            let raw = serde_json::to_vec(&e).unwrap();
            let mut mac = Hmac::<Sha256>::new_from_slice(b"synthetic-secret").unwrap();
            mac.update(&raw);
            let signed = polymorfa_sdk::webhooks::construct_event(
                &raw,
                &hex::encode(mac.finalize().into_bytes()),
                "synthetic-secret",
            )
            .unwrap();
            let d = decoder(mode);
            let old = Archive(AtomicUsize::new(0));
            let opts = ApplyEventOptions {
                decode_history: if mode == "archive" { Some(&old) } else { None },
                decode_history_descriptor: if matches!(mode, "missing" | "archive" | "metadata") {
                    None
                } else {
                    Some(&d)
                },
                history_descriptor_mode: if mode.starts_with("metadata") {
                    HistoryDescriptorMode::MetadataOnly
                } else {
                    HistoryDescriptorMode::Decode
                },
            };
            let result = apply_verified_event(&s, signed.envelope(), opts).await;
            let failed = matches!(mode, "missing" | "archive" | "null" | "error" | "invalid");
            assert_eq!(result.is_err(), failed, "{branch}/{mode}");
            assert_eq!(s.has_event(&e.session, &e.id).await.unwrap(), !failed);
            assert_eq!(a.rows(Entity::Messages).len(), usize::from(mode == "full"));
            assert_eq!(!a.rows(Entity::HistoryProgress).is_empty(), !failed);
            if failed {
                for entity in schema::ALL_ENTITIES {
                    assert!(a.rows(entity).is_empty())
                }
            } else {
                assert!(
                    !apply_event(&s, &e, Default::default())
                        .await
                        .unwrap()
                        .applied
                )
            }
            assert_eq!(old.0.load(Ordering::SeqCst), 0);
            if mode.starts_with("metadata") {
                assert_eq!(d.calls.load(Ordering::SeqCst), 0)
            }
            let stored = serde_json::to_string(&a.rows(Entity::Messages)).unwrap();
            if mode == "full" {
                assert!(stored.contains("wa:") && !stored.contains("synthetic-notification"))
            }
            for secret in [
                fixture()["inline"]["inline"]["data"].as_str().unwrap(),
                fixture()["media"]["media"]["mediaKey"].as_str().unwrap(),
            ] {
                assert!(!stored.contains(secret));
                assert!(!format!("{signed:?} {e:?} {:?}", result.as_ref().err()).contains(secret));
            }
        }
    }
}
#[tokio::test]
async fn raw_descriptor_fields_and_malformed_duplicates_fail_before_writes() {
    let f = fixture();
    for patch in [
        json!({"delivery":null}),
        json!({"delivery":"bad"}),
        json!({"media":{}}),
        json!({"inline":null}),
        json!({"whatsapp_ids":{}}),
        json!({"whatsapp_ids":{"linked_devices":null}}),
        json!({"fileLength":null}),
        json!({"fileLength":-1}),
        json!({"fileLength":1.5}),
        json!({"progress":101}),
        json!({"syncType":""}),
        json!({"oldestMessageAt":"2026-02-30T00:00:00Z"}),
        json!({"peerDataRequestSessionId":null}),
        json!({"whatsapp_id":""}),
    ] {
        let a = Arc::new(MemoryAdapter::new());
        let s = Storage::new(a.clone(), Default::default()).unwrap();
        let mut p = f["inline"].clone();
        p.as_object_mut()
            .unwrap()
            .extend(patch.as_object().unwrap().clone());
        assert!(apply_event(
            &s,
            &event(p),
            ApplyEventOptions {
                history_descriptor_mode: HistoryDescriptorMode::MetadataOnly,
                ..Default::default()
            }
        )
        .await
        .is_err());
        for entity in schema::ALL_ENTITIES {
            assert!(a.rows(entity).is_empty())
        }
    }
    let s = Storage::new(Arc::new(MemoryAdapter::new()), Default::default()).unwrap();
    let mut e = event(f["inline"].clone());
    apply_event(
        &s,
        &e,
        ApplyEventOptions {
            history_descriptor_mode: HistoryDescriptorMode::MetadataOnly,
            ..Default::default()
        },
    )
    .await
    .unwrap();
    e.payload["fileLength"] = Value::Null;
    assert!(apply_event(&s, &e, Default::default()).await.is_err());
}
struct Peer(Child);
impl Drop for Peer {
    fn drop(&mut self) {
        let _ = self.0.kill();
        let _ = self.0.wait();
    }
}
struct Observed<'a> {
    native: NativeStorageEventSource<'a>,
    storage: &'a Storage,
}
impl StorageEventSource for Observed<'_> {
    fn stream(&self, p: StorageStreamParams) -> StorageResult<StorageEventStream<'_>> {
        self.native.stream(p)
    }
    fn acknowledge<'a>(&'a self, item: &'a StorageStreamItem) -> StorageFuture<'a, ()> {
        Box::pin(async move {
            assert!(
                self.storage
                    .has_event("descriptor-session", "descriptor-event")
                    .await?
            );
            assert_eq!(
                self.storage
                    .checkpoint("*", "events")
                    .await?
                    .unwrap()
                    .cursor,
                "descriptor-cursor"
            );
            self.native.acknowledge(item).await
        })
    }
}
#[tokio::test]
async fn actual_native_http_sse_manual_ack_resume_and_failure_order() {
    let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("tests/fixtures/descriptor-storage/server.mjs");
    let mut child = Command::new(std::env::var("SDK_NODE").unwrap_or("node".into()))
        .arg(path)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    let mut line = String::new();
    BufReader::new(child.stdout.take().unwrap())
        .read_line(&mut line)
        .unwrap();
    let _peer = Peer(child);
    let ready: Value = serde_json::from_str(&line).unwrap();
    let base = ready["baseUrl"].as_str().unwrap();
    let http = reqwest::Client::new();
    for branch in ["inline", "media"] {
        for mode in [
            "missing",
            "archive",
            "null",
            "error",
            "invalid",
            "metadata",
            "metadata-decoder",
            "empty",
            "full",
            "conflict",
            "ack-error",
            "malformed",
        ] {
            let mut payload = fixture()[branch].clone();
            if mode == "malformed" {
                payload["delivery"] = Value::Null
            }
            http.post(format!("{base}/configure"))
                .json(&json!({"branch":branch,"mode":mode,"payload":payload}))
                .send()
                .await
                .unwrap();
            let a = Arc::new(MemoryAdapter::new());
            let s = Arc::new(Storage::new(a.clone(), Default::default()).unwrap());
            let org = support::organization(base.to_string());
            let project = org.project("018f0000-0000-7000-8000-000000000077").unwrap();
            let events = project.events();
            let native = Observed {
                native: NativeStorageEventSource::new(
                    &events,
                    EventStreamOptions::default(),
                    RequestOptions::default(),
                ),
                storage: &s,
            };
            let mut d = decoder(mode);
            if mode == "conflict" {
                d.storage = Some(s.clone())
            }
            let old = Archive(AtomicUsize::new(0));
            let stop = StorageSyncStop::default();
            let finish = stop.clone();
            let callback = move |_: &StorageStreamItem, _: &engine::ApplyResult| {
                finish.stop();
                Ok(())
            };
            let result = tokio::time::timeout(
                Duration::from_secs(5),
                sync_to_storage(
                    &native,
                    &s,
                    StorageSyncOptions {
                        apply: ApplyEventOptions {
                            decode_history: if mode == "archive" { Some(&old) } else { None },
                            decode_history_descriptor: if matches!(
                                mode,
                                "missing" | "archive" | "metadata" | "malformed"
                            ) {
                                None
                            } else {
                                Some(&d)
                            },
                            history_descriptor_mode: if mode.starts_with("metadata") {
                                HistoryDescriptorMode::MetadataOnly
                            } else {
                                HistoryDescriptorMode::Decode
                            },
                        },
                        on_applied: Some(&callback),
                        ..Default::default()
                    },
                    &stop,
                ),
            )
            .await
            .unwrap();
            let state: Value = http
                .get(format!("{base}/state"))
                .send()
                .await
                .unwrap()
                .json()
                .await
                .unwrap();
            let failed = matches!(
                mode,
                "missing" | "archive" | "null" | "error" | "invalid" | "malformed"
            );
            assert_eq!(
                result.is_err(),
                failed || matches!(mode, "conflict" | "ack-error"),
                "{branch}/{mode}"
            );
            assert_eq!(
                state["acks"],
                if failed || mode == "conflict" { 0 } else { 1 }
            );
            assert_eq!(state["media"], 0);
            assert_eq!(state["manual"], true);
            assert_eq!(
                s.has_event("descriptor-session", "descriptor-event")
                    .await
                    .unwrap(),
                !failed
            );
            assert_eq!(
                a.rows(Entity::Messages).len(),
                usize::from(matches!(mode, "full" | "conflict" | "ack-error"))
            );
            let saved = s.checkpoint("*", "events").await.unwrap().map(|v| v.cursor);
            assert_eq!(
                saved.as_deref(),
                if failed {
                    None
                } else if mode == "conflict" {
                    Some("competitor")
                } else {
                    Some("descriptor-cursor")
                }
            );
            if matches!(mode, "full" | "metadata") {
                let stop = StorageSyncStop::default();
                let finished = stop.clone();
                let cb = move |_: &StorageStreamItem, _: &engine::ApplyResult| {
                    finished.stop();
                    Ok(())
                };
                assert_eq!(
                    sync_to_storage(
                        &native,
                        &s,
                        StorageSyncOptions {
                            on_applied: Some(&cb),
                            ..Default::default()
                        },
                        &stop
                    )
                    .await
                    .unwrap(),
                    1
                );
                let state: Value = http
                    .get(format!("{base}/state"))
                    .send()
                    .await
                    .unwrap()
                    .json()
                    .await
                    .unwrap();
                assert_eq!(state["lastEventId"], "descriptor-cursor");
                assert_eq!(state["acks"], 2);
            }
        }
    }
}
