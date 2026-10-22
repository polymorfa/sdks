use polymorfa_storage_core::{
    memory::MemoryAdapter,
    reducer::{events::StorageEvent, history::HistorySyncChunk},
    sync::*,
    *,
};
use serde_json::{json, Value};
use std::sync::{
    atomic::{AtomicUsize, Ordering},
    Arc,
};
struct Decode(AtomicUsize);
impl HistoryDescriptorDecoder for Decode {
    fn decode<'a>(
        &'a self,
        _: &'a Value,
        _: &'a StorageEvent,
    ) -> StorageFuture<'a, HistorySyncChunk> {
        Box::pin(async move {
            self.0.fetch_add(1, Ordering::SeqCst);
            Ok(HistorySyncChunk::default())
        })
    }
}
#[tokio::test]
async fn standalone_core_descriptor_validation_modes_and_replay() {
    let f: Value =
        serde_json::from_str(include_str!("../fixtures/history-descriptor.json")).unwrap();
    for branch in ["inline", "media"] {
        let a = Arc::new(MemoryAdapter::new());
        let s = Storage::new(a.clone(), Default::default()).unwrap();
        let e = StorageEvent {
            id: "event".into(),
            session: "session".into(),
            timestamp: "2026-10-17T00:00:00Z".into(),
            event: "history.sync".into(),
            payload: f[branch].clone(),
        };
        assert!(apply_event(&s, &e, Default::default()).await.is_err());
        assert!(a.rows(Entity::HistoryProgress).is_empty());
        let decoder = Decode(AtomicUsize::new(0));
        let result = apply_event(
            &s,
            &e,
            ApplyEventOptions {
                decode_history_descriptor: Some(&decoder),
                history_descriptor_mode: HistoryDescriptorMode::MetadataOnly,
                ..Default::default()
            },
        )
        .await
        .unwrap();
        assert!(result.applied);
        assert_eq!(decoder.0.load(Ordering::SeqCst), 0);
        assert!(
            !apply_event(&s, &e, Default::default())
                .await
                .unwrap()
                .applied
        );
        let mut bad = e;
        bad.payload["delivery"] = Value::Null;
        assert!(apply_event(&s, &bad, Default::default()).await.is_err());
    }
}
struct Archive(&'static str);
impl HistoryChunkDecoder for Archive {
    fn decode<'a>(
        &'a self,
        _: &'a Value,
        _: &'a StorageEvent,
    ) -> StorageFuture<'a, Option<HistorySyncChunk>> {
        Box::pin(async move {
            if matches!(self.0, "error" | "cloud") {
                Err(StorageError::Provider("archive failure"))
            } else if self.0 == "full" {
                let f: Value =
                    serde_json::from_str(include_str!("../fixtures/history-descriptor.json"))
                        .unwrap();
                Ok(Some(serde_json::from_value(f["chunk"].clone()).unwrap()))
            } else {
                Ok(None)
            }
        })
    }
}
#[tokio::test]
async fn archive_null_no_decoder_callback_failure_and_cloud_remain_unchanged() {
    for mode in ["missing", "null", "full", "error", "cloud"] {
        let a = Arc::new(MemoryAdapter::new());
        let s = Storage::new(a.clone(), Default::default()).unwrap();
        let e = StorageEvent {
            id: "event".into(),
            session: "session".into(),
            timestamp: "2026-10-17T00:00:00Z".into(),
            event: "history.sync".into(),
            payload: if mode == "cloud" {
                json!({"kind":"history","value":{}})
            } else {
                json!({"syncType":"RECENT","messages":[],"futureField":true})
            },
        };
        let old = Archive(mode);
        let result = apply_event(
            &s,
            &e,
            ApplyEventOptions {
                decode_history: if mode == "missing" { None } else { Some(&old) },
                ..Default::default()
            },
        )
        .await;
        assert_eq!(result.is_err(), mode == "error");
        assert_eq!(a.rows(Entity::Messages).len(), usize::from(mode == "full"));
        assert_eq!(
            s.has_event("session", "event").await.unwrap(),
            mode != "error"
        );
    }
}

#[tokio::test]
async fn raw_unprojected_descriptor_fields_fail_before_writes() {
    let f: Value =
        serde_json::from_str(include_str!("../fixtures/history-descriptor.json")).unwrap();
    for branch in ["top", "inline", "media"] {
        let a = Arc::new(MemoryAdapter::new());
        let s = Storage::new(a.clone(), Default::default()).unwrap();
        let mut payload = f[if branch == "media" { "media" } else { "inline" }].clone();
        if branch == "top" {
            payload["unprojected"] = json!(true);
        } else {
            payload[branch]["unprojected"] = json!(true);
        }
        let e = StorageEvent {
            id: "event".into(),
            session: "session".into(),
            timestamp: "2026-10-17T00:00:00Z".into(),
            event: "history.sync".into(),
            payload,
        };
        assert!(
            apply_event(
                &s,
                &e,
                ApplyEventOptions {
                    history_descriptor_mode: HistoryDescriptorMode::MetadataOnly,
                    ..Default::default()
                }
            )
            .await
            .is_err(),
            "unprojected {branch} consumed"
        );
        assert!(!s.has_event("session", "event").await.unwrap());
        assert!(a.rows(Entity::HistoryProgress).is_empty());
        assert!(a.rows(Entity::Messages).is_empty());
    }
}
