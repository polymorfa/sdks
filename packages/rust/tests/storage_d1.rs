use hmac::{Hmac, Mac};
use polymorfa_sdk::storage::{
    d1::{D1BridgeAdapter, D1BridgeOptions},
    merge::empty_row,
    schema::encode_key,
    *,
};
use serde_json::json;
use sha2::Sha256;
use std::{collections::BTreeMap, sync::Arc, time::Duration};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
fn options(url: &str) -> D1BridgeOptions {
    D1BridgeOptions::new(
        url,
        "fixture-customer-a",
        "bridge_a_",
        "synthetic_D1_bridge_fixture_secret_only_20261015",
    )
}
fn key(s: &str, m: &str) -> RowKey {
    BTreeMap::from([
        ("sessionId".into(), s.into()),
        ("messageId".into(), m.into()),
    ])
}
fn upsert(s: &str, m: &str, time: usize) -> StorageOperation {
    StorageOperation::Upsert {
        entity: Entity::Messages,
        key: key(s, m),
        fields: BTreeMap::from([
            (
                "text".into(),
                FieldWrite {
                    value: json!(m),
                    version: time as f64,
                },
            ),
            (
                "timestamp".into(),
                FieldWrite {
                    value: json!(time),
                    version: time as f64,
                },
            ),
            (
                "chatId".into(),
                FieldWrite {
                    value: json!("chat"),
                    version: time as f64,
                },
            ),
        ]),
        guard: None,
    }
}
#[tokio::test]
async fn rejects_unsafe_configuration_unsigned_redirect_and_stalled_body() {
    for url in [
        "http://example.com/",
        "https://example.com/base",
        "https://user@example.com/",
        "https://example.com/?a=1",
    ] {
        assert!(D1BridgeAdapter::connect(options(url)).await.is_err());
    }
    for mode in ["unsigned", "redirect", "stalled"] {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let url = format!("http://{}/", listener.local_addr().unwrap());
        let server = tokio::spawn(async move {
            let (mut socket, _) = listener.accept().await.unwrap();
            let mut raw = Vec::new();
            loop {
                let mut byte = [0];
                if socket.read(&mut byte).await.unwrap() == 0 {
                    break;
                }
                raw.push(byte[0]);
                if raw.ends_with(b"\r\n\r\n") {
                    break;
                }
            }
            let text = String::from_utf8(raw).unwrap();
            assert!(!text.to_ascii_lowercase().contains("origin:"));
            assert!(!text.to_ascii_lowercase().contains("cookie:"));
            assert!(!text.contains("pmfa_"));
            if mode == "redirect" {
                socket.write_all(b"HTTP/1.1 307 Temporary Redirect\r\nLocation: https://invalid.example/private?secret=never-reflect\r\nContent-Length: 0\r\n\r\n").await.unwrap();
            } else if mode == "stalled" {
                let nonce = text
                    .lines()
                    .find_map(|l| l.strip_prefix("polymorfa-storage-nonce: "))
                    .unwrap();
                let response=format!("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nPolymorfa-Storage-Nonce: {nonce}\r\nContent-Length: 3\r\n\r\n{{");
                socket.write_all(response.as_bytes()).await.unwrap();
                tokio::time::sleep(Duration::from_millis(300)).await;
            } else {
                socket.write_all(b"HTTP/1.1 403 Forbidden\r\nContent-Type: application/json\r\nContent-Length: 2\r\n\r\n{}").await.unwrap();
            }
        });
        let mut config = options(&url);
        config.timeout = Duration::from_millis(80);
        let error = match D1BridgeAdapter::connect(config).await {
            Err(e) => e,
            Ok(_) => panic!("untrusted bridge accepted"),
        };
        assert!(!error.to_string().contains("never-reflect"));
        assert!(!format!("{error:?}").contains("synthetic_"));
        server.await.unwrap();
    }
}
/// Run with POLYMORFA_D1_BRIDGE_URL against the independently bundled actual Worker/D1 fixture.
#[tokio::test]
async fn actual_worker_binding_atomicity_history_replay_checkpoint_and_clear() {
    let Ok(url) = std::env::var("POLYMORFA_D1_BRIDGE_URL") else {
        return;
    };
    let adapter = Arc::new(D1BridgeAdapter::connect(options(&url)).await.unwrap());
    assert!(adapter.capabilities().atomic_commit);
    assert_eq!(adapter.capabilities().max_commit_size, 50);
    adapter.setup().await.unwrap();
    let s = format!("rust-native-{}", uuid::Uuid::new_v4());
    let store = Arc::new(Storage::new(adapter.clone(), StorageOptions::default()).unwrap());
    let first = OperationBatch {
        session_id: s.clone(),
        event_id: Some("first".into()),
        event_type: None,
        operations: vec![upsert(&s, "first", 1)],
    };
    assert!(store.apply(&first).await.unwrap().applied);
    assert!(!store.apply(&first).await.unwrap().applied);
    let id = encode_key(Entity::Messages, &key(&s, "first")).unwrap();
    let current = adapter
        .get(Entity::Messages, std::slice::from_ref(&id))
        .await
        .unwrap()
        .remove(&id)
        .unwrap();
    let mut new = empty_row(Entity::Messages, &key(&s, "rollback")).unwrap();
    new.revision = 1;
    assert!(
        !adapter
            .commit(&[
                RowWrite::Put {
                    entity: Entity::Messages,
                    row: new,
                    expected_revision: None
                },
                RowWrite::Delete {
                    entity: Entity::Messages,
                    id,
                    expected_revision: Some(current.revision + 1)
                }
            ])
            .await
            .unwrap()
            .ok
    );
    assert!(store
        .get(Entity::Messages, &key(&s, "rollback"))
        .await
        .unwrap()
        .is_none());
    let mut tasks = Vec::new();
    for n in 2..=5 {
        let store = store.clone();
        let s = s.clone();
        tasks.push(tokio::spawn(async move {
            store
                .apply(&OperationBatch {
                    session_id: s.clone(),
                    event_id: None,
                    event_type: None,
                    operations: vec![upsert(&s, "first", n)],
                })
                .await
                .unwrap();
        }));
    }
    for task in tasks {
        task.await.unwrap();
    }
    let huge = OperationBatch {
        session_id: s.clone(),
        event_id: Some("history".into()),
        event_type: None,
        operations: (0..2000).map(|n| upsert(&s, &n.to_string(), n)).collect(),
    };
    assert!(store.apply(&huge).await.unwrap().applied);
    assert!(!store.apply(&huge).await.unwrap().applied);
    let mut query = IndexQuery {
        index: "by_chat".into(),
        equals: BTreeMap::from([
            ("sessionId".into(), s.clone()),
            ("chatId".into(), "chat".into()),
        ]),
        range: None,
        order: Some("asc".into()),
        limit: 1000,
        after: None,
    };
    let page = adapter.query(Entity::Messages, &query).await.unwrap();
    assert_eq!(page.len(), 1000);
    let last = page.last().unwrap();
    query.after = Some(IndexCursor {
        sort: last.fields["timestamp"].as_f64().unwrap(),
        id: last.id.clone(),
    });
    let second = adapter.query(Entity::Messages, &query).await.unwrap();
    assert_eq!(second.len(), 1000);
    let checkpoint = OperationBatch {
        session_id: s.clone(),
        event_id: None,
        event_type: None,
        operations: vec![StorageOperation::Checkpoint {
            session_id: s.clone(),
            stream: "events".into(),
            cursor: "saved".into(),
            expected_cursor: Some(None),
            position: None,
            updated_at: Some(1.),
        }],
    };
    store.apply(&checkpoint).await.unwrap();
    assert!(matches!(
        store.apply(&checkpoint).await,
        Err(StorageError::CheckpointConflict)
    ));
    let clear = OperationBatch {
        session_id: s.clone(),
        event_id: Some("clear".into()),
        event_type: None,
        operations: vec![
            StorageOperation::Upsert {
                entity: Entity::Chats,
                key: BTreeMap::from([
                    ("sessionId".into(), s.clone()),
                    ("chatId".into(), "chat".into()),
                ]),
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
                session_id: s.clone(),
                chat_id: "chat".into(),
                up_to: 1000.,
            },
        ],
    };
    store.apply(&clear).await.unwrap();
    query.after = None;
    assert_eq!(
        adapter.query(Entity::Messages, &query).await.unwrap().len(),
        999
    );
    let late = OperationBatch {
        session_id: s.clone(),
        event_id: Some("late".into()),
        event_type: None,
        operations: vec![match upsert(&s, "late", 1) {
            StorageOperation::Upsert {
                entity,
                key,
                fields,
                ..
            } => StorageOperation::Upsert {
                entity,
                key,
                fields,
                guard: Some(ChatWatermarkGuard {
                    session_id: s.clone(),
                    chat_id: "chat".into(),
                    timestamp: 1.,
                }),
            },
            _ => unreachable!(),
        }],
    };
    store.apply(&late).await.unwrap();
    assert!(store
        .get(Entity::Messages, &key(&s, "late"))
        .await
        .unwrap()
        .is_none());
    assert!(adapter
        .commit(&[RowWrite::Delete {
            entity: Entity::Messages,
            id: encode_key(Entity::Messages, &key(&s, "1001")).unwrap(),
            expected_revision: None
        }])
        .await
        .is_err());
}

#[tokio::test]
async fn authenticated_but_wrong_identity_capabilities_nonce_and_body_are_rejected() {
    for mode in [
        "authority",
        "prefix",
        "schema",
        "atomic",
        "limit",
        "deletes",
        "nonce",
        "tamper",
    ] {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let url = format!("http://{}/", listener.local_addr().unwrap());
        let server = tokio::spawn(async move {
            let (mut socket, _) = listener.accept().await.unwrap();
            let mut raw = Vec::new();
            loop {
                let mut b = [0];
                if socket.read(&mut b).await.unwrap() == 0 {
                    break;
                }
                raw.push(b[0]);
                if raw.ends_with(b"\r\n\r\n") {
                    break;
                }
            }
            let text = String::from_utf8(raw).unwrap();
            let nonce = text
                .lines()
                .find_map(|l| l.strip_prefix("polymorfa-storage-nonce: "))
                .unwrap();
            let mut envelope = json!({"contract":"polymorfa-d1-storage-v1","schemaVersion":2,"authority":"fixture-customer-a","tablePrefix":"bridge_a_","data":{"atomicCommit":true,"maxCommitSize":50,"maxGetSize":1000,"maxQuerySize":1000,"maxBodyBytes":8388608,"conditionalDeletes":true,"setupAllowed":false}});
            match mode {
                "authority" => envelope["authority"] = json!("other"),
                "prefix" => envelope["tablePrefix"] = json!("other_"),
                "schema" => envelope["schemaVersion"] = json!(1),
                "atomic" => envelope["data"]["atomicCommit"] = json!(false),
                "limit" => envelope["data"]["maxCommitSize"] = json!(100),
                "deletes" => envelope["data"]["conditionalDeletes"] = json!(false),
                _ => {}
            }
            let mut body = serde_json::to_string(&envelope).unwrap();
            let mut mac =
                Hmac::<Sha256>::new_from_slice(b"synthetic_D1_bridge_fixture_secret_only_20261015")
                    .unwrap();
            mac.update(format!("{nonce}.200.{body}").as_bytes());
            let signature = format!("v1={}", hex::encode(mac.finalize().into_bytes()));
            if mode == "tamper" {
                body.push(' ');
            }
            let returned_nonce = if mode == "nonce" { "wrong" } else { nonce };
            let response=format!("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nPolymorfa-Storage-Nonce: {returned_nonce}\r\nPolymorfa-Storage-Signature: {signature}\r\nContent-Length: {}\r\n\r\n{body}",body.len());
            socket.write_all(response.as_bytes()).await.unwrap();
        });
        assert!(
            D1BridgeAdapter::connect(options(&url)).await.is_err(),
            "accepted {mode}"
        );
        server.await.unwrap();
    }
}
/// Serves signed handshakes keyed by the bearer the client sent, counting every connection.
async fn handshake_server() -> (
    String,
    Arc<std::sync::atomic::AtomicUsize>,
    tokio::task::JoinHandle<()>,
) {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = format!("http://{}/", listener.local_addr().unwrap());
    let calls = Arc::new(std::sync::atomic::AtomicUsize::new(0));
    let counted = calls.clone();
    let server = tokio::spawn(async move {
        loop {
            let Ok((mut socket, _)) = listener.accept().await else {
                return;
            };
            counted.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
            let mut raw = Vec::new();
            loop {
                let mut b = [0];
                if socket.read(&mut b).await.unwrap() == 0 {
                    break;
                }
                raw.push(b[0]);
                if raw.ends_with(b"\r\n\r\n") {
                    break;
                }
            }
            let text = String::from_utf8(raw).unwrap();
            let header = |name: &str| {
                text.lines()
                    .find_map(|l| l.strip_prefix(name))
                    .unwrap()
                    .to_owned()
            };
            let nonce = header("polymorfa-storage-nonce: ");
            let secret = header("authorization: Bearer ");
            let body = json!({"contract":"polymorfa-d1-storage-v1","schemaVersion":2,"authority":"fixture-customer-a","tablePrefix":"bridge_a_","data":{"atomicCommit":true,"maxCommitSize":50,"maxGetSize":1000,"maxQuerySize":1000,"maxBodyBytes":8388608,"conditionalDeletes":true,"setupAllowed":false}}).to_string();
            let mut mac = Hmac::<Sha256>::new_from_slice(secret.as_bytes()).unwrap();
            mac.update(format!("{nonce}.200.{body}").as_bytes());
            let signature = format!("v1={}", hex::encode(mac.finalize().into_bytes()));
            let response=format!("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nPolymorfa-Storage-Nonce: {nonce}\r\nPolymorfa-Storage-Signature: {signature}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",body.len());
            socket.write_all(response.as_bytes()).await.unwrap();
        }
    });
    (url, calls, server)
}
#[tokio::test]
async fn reserved_or_out_of_range_application_secrets_send_no_request() {
    let (url, calls, server) = handshake_server().await;
    let with = |secret: String| {
        D1BridgeOptions::new(url.as_str(), "fixture-customer-a", "bridge_a_", secret)
    };
    let mut rejected: Vec<String> = [
        "pmfa_",
        "pmfa_pt_",
        "pmfa_ct_",
        "pmfa_ls_",
        "pmfa_at_",
        "pmfa_wst_",
        "pmfa_sd_",
    ]
    .iter()
    .map(|p| format!("{p}synthetic-fixture-value-0123456789"))
    .collect();
    rejected.extend([
        format!("pmfa_{}", "x".repeat(251)),
        "x".repeat(31),
        "x".repeat(257),
    ]);
    for secret in rejected {
        assert!(D1BridgeAdapter::connect(with(secret)).await.is_err());
    }
    assert_eq!(calls.load(std::sync::atomic::Ordering::SeqCst), 0);
    for secret in [
        "x".repeat(32),
        "x".repeat(256),
        "PMFA_uppercase-is-not-reserved-0123456789".into(),
        "xpmfa_not-a-prefix-fixture-0123456789".into(),
    ] {
        let adapter = D1BridgeAdapter::connect(with(secret)).await.unwrap();
        assert!(adapter.capabilities().atomic_commit);
    }
    assert_eq!(calls.load(std::sync::atomic::Ordering::SeqCst), 4);
    server.abort();
}
