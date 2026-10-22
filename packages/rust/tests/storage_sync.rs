#[allow(dead_code)]
mod support;
use base64::{engine::general_purpose::STANDARD, Engine};
use polymorfa_sdk::{
    storage::{memory::MemoryAdapter, sync::*, *},
    storage_sync::NativeStorageEventSource,
    stream::EventStreamOptions,
    RequestOptions,
};
use serde_json::{json, Value};
use std::{sync::Arc, time::Duration};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::{TcpListener, TcpStream},
};

async fn request(socket: &mut TcpStream) -> (String, Value) {
    let mut data = vec![];
    let mut byte = [0];
    while !data.ends_with(b"\r\n\r\n") {
        socket.read_exact(&mut byte).await.unwrap();
        data.push(byte[0]);
    }
    let head = String::from_utf8(data).unwrap();
    let len = head
        .lines()
        .find_map(|s| {
            s.to_lowercase()
                .strip_prefix("content-length:")
                .and_then(|v| v.trim().parse::<usize>().ok())
        })
        .unwrap_or(0);
    let mut body = vec![0; len];
    socket.read_exact(&mut body).await.unwrap();
    (
        head,
        if len == 0 {
            Value::Null
        } else {
            serde_json::from_slice(&body).unwrap()
        },
    )
}
fn event_frame() -> String {
    let envelope = json!({"id":"webhook-one","session":"wire-session","timestamp":"2026-10-01T12:00:00Z","event":"session.connected","payload":{"pushName":"fixture"}});
    let record = json!({"id":"retained","organizationId":"org","projectId":"project","type":"session.connected","source":"runtime","environment":"development","createdAt":"2026-10-01T12:00:00Z","payloadAvailability":"retained","payload":{"contentType":"application/json","encoding":"base64","data":STANDARD.encode(envelope.to_string())},"metadataExpiresAt":"2026-11-01T12:00:00Z"});
    format!(
        "data: {}\n\n",
        json!({"type":"event","streamId":"stream/one","sequence":7,"cursor":"cursor-new","event":record})
    )
}
#[tokio::test]
async fn native_manual_ack_observes_durable_content_marker_and_saved_cursor() {
    let adapter = Arc::new(MemoryAdapter::new());
    let storage = Arc::new(Storage::new(adapter.clone(), StorageOptions::default()).unwrap());
    storage
        .apply(&OperationBatch {
            session_id: "*".into(),
            event_id: None,
            event_type: None,
            operations: vec![StorageOperation::Checkpoint {
                session_id: "*".into(),
                stream: "events".into(),
                cursor: "cursor-old".into(),
                expected_cursor: None,
                position: None,
                updated_at: Some(1.0),
            }],
        })
        .await
        .unwrap();
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let base = format!("http://{}", listener.local_addr().unwrap());
    let durable = storage.clone();
    let server = tokio::spawn(async move {
        let (mut stream, _) = listener.accept().await.unwrap();
        let (head, _) = request(&mut stream).await;
        assert_eq!(head.lines().next().unwrap(),"GET /platform/projects/project/events/stream?types=session.connected&ack=manual HTTP/1.1");
        assert!(head.to_lowercase().contains("last-event-id: cursor-old"));
        assert!(!head.contains("ignored"));
        let body = event_frame();
        stream.write_all(format!("HTTP/1.1 200 OK\r\ncontent-type: text/event-stream\r\ncontent-length: {}\r\n\r\n{body}",body.len()+4096).as_bytes()).await.unwrap();
        let (mut ack, _) = tokio::time::timeout(Duration::from_secs(5), listener.accept())
            .await
            .unwrap()
            .unwrap();
        let (head, body) = request(&mut ack).await;
        assert_eq!(
            head.lines().next().unwrap(),
            "POST /platform/projects/project/events/stream/stream%2Fone/ack HTTP/1.1"
        );
        assert_eq!(body, json!({"cursor":"cursor-new","sequence":7}));
        assert!(durable
            .has_event("wire-session", "webhook-one")
            .await
            .unwrap());
        assert_eq!(
            durable
                .checkpoint("*", "events")
                .await
                .unwrap()
                .unwrap()
                .cursor,
            "cursor-new"
        );
        let id = schema::encode_key(
            Entity::Sessions,
            &RowKey::from([("sessionId".into(), "wire-session".into())]),
        )
        .unwrap();
        assert!(adapter
            .get(Entity::Sessions, std::slice::from_ref(&id))
            .await
            .unwrap()[&id]
            .fields
            .contains_key("connected"));
        let body=json!({"data":{"streamId":"stream/one","acknowledgedCursor":"cursor-new","sequence":7,"replayed":false}}).to_string();
        ack.write_all(format!("HTTP/1.1 200 OK\r\ncontent-type: application/json\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{body}",body.len()).as_bytes()).await.unwrap();
        let mut byte = [0];
        assert_eq!(
            tokio::time::timeout(Duration::from_secs(5), stream.read(&mut byte))
                .await
                .unwrap()
                .unwrap(),
            0
        );
    });
    let org = support::organization(base);
    let project = org.project("project").unwrap();
    let events = project.events();
    let source = NativeStorageEventSource::new(
        &events,
        EventStreamOptions {
            since: Some("ignored".into()),
            ..Default::default()
        },
        RequestOptions::default(),
    );
    let stop = StorageSyncStop::default();
    let finish = stop.clone();
    let callback = move |_: &StorageStreamItem, _: &engine::ApplyResult| {
        finish.stop();
        Ok(())
    };
    let count = sync_to_storage(
        &source,
        &storage,
        StorageSyncOptions {
            types: vec!["session.connected".into()],
            on_applied: Some(&callback),
            ..Default::default()
        },
        &stop,
    )
    .await
    .unwrap();
    assert_eq!(count, 1);
    server.await.unwrap();
}
#[tokio::test]
async fn native_retention_gap_in_same_packet_prevents_content_checkpoint_and_ack() {
    let storage =
        Arc::new(Storage::new(Arc::new(MemoryAdapter::new()), StorageOptions::default()).unwrap());
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let base = format!("http://{}", listener.local_addr().unwrap());
    let server = tokio::spawn(async move {
        let (mut stream, _) = listener.accept().await.unwrap();
        request(&mut stream).await;
        let body = format!(
            "data: {}\n\n{}",
            json!({"type":"gap","reason":"retention_exceeded","missedEvents":2}),
            event_frame()
        );
        stream.write_all(format!("HTTP/1.1 200 OK\r\ncontent-type: text/event-stream\r\ncontent-length: {}\r\n\r\n{body}",body.len()+4096).as_bytes()).await.unwrap();
        let mut byte = [0];
        assert_eq!(
            tokio::time::timeout(Duration::from_secs(5), stream.read(&mut byte))
                .await
                .unwrap()
                .unwrap(),
            0
        );
        assert!(
            tokio::time::timeout(Duration::from_millis(100), listener.accept())
                .await
                .is_err()
        );
    });
    let org = support::organization(base);
    let project = org.project("project").unwrap();
    let events = project.events();
    let source = NativeStorageEventSource::new(
        &events,
        EventStreamOptions::default(),
        RequestOptions::default(),
    );
    let result = sync_to_storage(
        &source,
        &storage,
        StorageSyncOptions::default(),
        &StorageSyncStop::default(),
    )
    .await;
    assert!(result.is_err());
    assert!(!storage
        .has_event("wire-session", "webhook-one")
        .await
        .unwrap());
    assert!(storage.checkpoint("*", "events").await.unwrap().is_none());
    server.await.unwrap();
}

#[tokio::test]
async fn malformed_project_payload_never_advances_storage_or_explicit_resume() {
    for malformed in ["%%%", "e30="] {
        let storage = Arc::new(
            Storage::new(Arc::new(MemoryAdapter::new()), StorageOptions::default()).unwrap(),
        );
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let base = format!("http://{}", listener.local_addr().unwrap());
        let durable = storage.clone();
        let malformed = malformed.to_string();
        let server = tokio::spawn(async move {
            let (mut stream, _) = listener.accept().await.unwrap();
            let (head, _) = request(&mut stream).await;
            assert!(head.contains("ack=manual"));
            let mut bad: Value =
                serde_json::from_str(event_frame().trim().strip_prefix("data: ").unwrap()).unwrap();
            bad["cursor"] = json!("bad");
            bad["event"]["payload"]["data"] = json!(malformed);
            let body = format!("{}data: {bad}\n\n", event_frame());
            stream.write_all(format!("HTTP/1.1 200 OK\r\ncontent-type: text/event-stream\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{body}", body.len()).as_bytes()).await.unwrap();
            drop(stream);
            let (mut ack, _) = listener.accept().await.unwrap();
            let (head, body) = request(&mut ack).await;
            assert!(head.starts_with("POST "));
            assert_eq!(body, json!({"cursor":"cursor-new","sequence":7}));
            assert!(durable
                .has_event("wire-session", "webhook-one")
                .await
                .unwrap());
            assert_eq!(
                durable
                    .checkpoint("*", "events")
                    .await
                    .unwrap()
                    .unwrap()
                    .cursor,
                "cursor-new"
            );
            let body = json!({"data":{"streamId":"stream/one","acknowledgedCursor":"cursor-new","sequence":7,"replayed":false}}).to_string();
            ack.write_all(format!("HTTP/1.1 200 OK\r\ncontent-type: application/json\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{body}",body.len()).as_bytes()).await.unwrap();
            drop(ack);
            let (mut resumed, _) = listener.accept().await.unwrap();
            let (head, _) = request(&mut resumed).await;
            assert!(head.to_lowercase().contains("last-event-id: cursor-new"));
            assert!(!head.to_lowercase().contains("last-event-id: bad"));
            assert_eq!(
                durable
                    .checkpoint("*", "events")
                    .await
                    .unwrap()
                    .unwrap()
                    .cursor,
                "cursor-new"
            );
            let body = "data: {\"type\":\"revoked\"}\n\n";
            resumed.write_all(format!("HTTP/1.1 200 OK\r\ncontent-type: text/event-stream\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{body}",body.len()).as_bytes()).await.unwrap();
        });
        let org = support::organization(base);
        let project = org.project("project").unwrap();
        let events = project.events();
        let source = NativeStorageEventSource::new(
            &events,
            EventStreamOptions::default(),
            RequestOptions::default(),
        );
        let stop = StorageSyncStop::default();
        assert!(
            sync_to_storage(&source, &storage, StorageSyncOptions::default(), &stop)
                .await
                .is_err()
        );
        assert_eq!(
            storage
                .checkpoint("*", "events")
                .await
                .unwrap()
                .unwrap()
                .cursor,
            "cursor-new"
        );
        // Rust parse errors are terminal. Resume explicitly from the durable
        // cursor, preserving that policy rather than introducing a retry loop.
        assert!(
            sync_to_storage(&source, &storage, StorageSyncOptions::default(), &stop)
                .await
                .is_err()
        );
        server.await.unwrap();
    }
}
