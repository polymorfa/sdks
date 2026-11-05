//! Phase-observed regression for the admitted response-body timeout. Test builds only.
//!
//! The request timeout covers connect, request write and response headers, and an
//! eligible keyed attempt retries when it expires there. This test needs the body
//! phase, so it waits for the client's own admission (successful headers and
//! metadata in `open_internal`) before letting the unchanged 30 ms timer run.
use crate::{models::Query, ClientOptions, Credential, ErrorKind, MessagingClient, RequestOptions};
use std::{cell::RefCell, sync::mpsc, time::Duration};
use tokio::io::{AsyncReadExt, AsyncWriteExt};

thread_local! {
    static ADMITTED: RefCell<Option<mpsc::Sender<u32>>> = const { RefCell::new(None) };
}

/// Called synchronously by `open_internal` in test builds after the client has
/// received successful response headers and built their metadata.
pub(super) fn observe_admission(attempt: u32) {
    ADMITTED.with(|slot| {
        if let Some(sender) = slot.borrow().as_ref() {
            let _ = sender.send(attempt);
        }
    });
}

const BODY: &[u8] = b"{\"value\":1}";
const REAL_WATCHDOG: Duration = Duration::from_secs(30);
const INHIBIT_LIMIT: Duration = Duration::from_secs(20);

fn credential() -> Credential {
    let fixture: serde_json::Value = serde_json::from_slice(
        &std::fs::read(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../contracts/machine-credentials.v1.json"
        ))
        .unwrap(),
    )
    .unwrap();
    let token = fixture["opaque"]
        .as_array()
        .unwrap()
        .iter()
        .find(|entry| entry["kind"] == "key")
        .unwrap()["token"]
        .as_str()
        .unwrap()
        .to_owned();
    Credential::organization_api_key(token).unwrap()
}

async fn scenario() {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    // A running blocking task stops the paused clock from auto-advancing, so
    // connect, write and header latency cannot consume the request timeout.
    let (admitted_tx, admitted_rx) = mpsc::channel::<u32>();
    ADMITTED.with(|slot| *slot.borrow_mut() = Some(admitted_tx));
    let inhibitor = tokio::task::spawn_blocking(move || admitted_rx.recv_timeout(INHIBIT_LIMIT));
    let server = tokio::spawn(async move {
        let (mut socket, _) = listener.accept().await.unwrap();
        let mut request = Vec::new();
        let mut bytes = [0u8; 4096];
        let head_end = loop {
            if let Some(end) = request.windows(4).position(|w| w == b"\r\n\r\n") {
                break end + 4;
            }
            let count = socket.read(&mut bytes).await.unwrap();
            assert_ne!(count, 0, "client closed before complete request headers");
            request.extend_from_slice(&bytes[..count]);
        };
        while request.len() < head_end + BODY.len() {
            let count = socket.read(&mut bytes).await.unwrap();
            assert_ne!(count, 0, "client closed before the request body");
            request.extend_from_slice(&bytes[..count]);
        }
        socket.write_all(b"HTTP/1.1 200 OK\r\ncontent-type: application/json\r\nrequest-id: admitted-request\r\nx-polymorfa-operation-id: operation-1\r\ncontent-length: 100\r\nconnection: close\r\n\r\n{\"success\":").await.unwrap();
        // Leave the body incomplete; the client closes after its body timeout.
        let mut rest = [0u8; 64];
        assert_eq!(socket.read(&mut rest).await.unwrap(), 0);
        (request, head_end, listener)
    });
    let client = MessagingClient::new(
        credential(),
        ClientOptions {
            base_url: format!("http://{address}"),
            max_network_retries: 0,
            ..ClientOptions::default()
        },
    )
    .unwrap();
    let error = client
        .raw::<serde_json::Value>(
            reqwest::Method::POST,
            "/messaging/operation",
            &Query::new(),
            Some(&serde_json::json!({"value":1})),
            RequestOptions {
                timeout: Some(Duration::from_millis(30)),
                max_network_retries: Some(3),
                idempotency_key: Some("once".into()),
                ..RequestOptions::default()
            },
        )
        .await
        .unwrap_err();
    let admitted_attempt = inhibitor
        .await
        .unwrap()
        .expect("client never reported admitted response headers");
    ADMITTED.with(|slot| slot.borrow_mut().take());
    let (request, head_end, listener) = server.await.unwrap();

    assert_eq!(admitted_attempt, 1);
    assert_eq!(error.kind, ErrorKind::Timeout);
    assert_eq!(error.status, Some(200));
    assert_eq!(error.request_id.as_deref(), Some("admitted-request"));
    assert_eq!(error.operation_id.as_deref(), Some("operation-1"));
    assert_eq!(error.metadata.as_ref().unwrap().attempts, 1);
    let head = String::from_utf8_lossy(&request[..head_end]).to_ascii_lowercase();
    assert!(head.starts_with("post /messaging/operation http/1.1\r\n"));
    assert!(head.contains("\r\nidempotency-key: once\r\n"));
    assert_eq!(&request[head_end..], BODY);
    // No replay: nothing else reached the still-bound listener.
    let listener = listener.into_std().unwrap();
    listener.set_nonblocking(true).unwrap();
    let pending = listener.accept();
    assert!(
        matches!(&pending, Err(e) if e.kind() == std::io::ErrorKind::WouldBlock),
        "request after the admitted response: {pending:?}"
    );
}

#[test]
fn admitted_operation_body_timeout_preserves_metadata_without_retry() {
    let (done_tx, done_rx) = mpsc::channel();
    let worker = std::thread::spawn(move || {
        tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .start_paused(true)
            .build()
            .unwrap()
            .block_on(scenario());
        let _ = done_tx.send(());
    });
    // Paused Tokio time cannot detect a stuck harness, so use a real wall clock.
    match done_rx.recv_timeout(REAL_WATCHDOG) {
        Ok(()) | Err(mpsc::RecvTimeoutError::Disconnected) => {
            if let Err(panic) = worker.join() {
                std::panic::resume_unwind(panic);
            }
        }
        Err(mpsc::RecvTimeoutError::Timeout) => {
            panic!("phase-observed harness exceeded its real wall-clock watchdog")
        }
    }
}
