#[allow(dead_code)]
mod support;
use polymorfa_sdk::{models::Query, ErrorKind, RequestOptions};
use std::time::Duration;
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::TcpListener,
};

#[tokio::test]
async fn admitted_operation_body_timeout_preserves_metadata_without_retry() {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let base = format!("http://{}", listener.local_addr().unwrap());
    // The request timeout covers connect, request write and response headers;
    // an eligible keyed attempt may retry when it expires there, before admission.
    // A stalled runner can close such an attempt before the server sees complete
    // headers. Count exactly those incomplete-header EOFs, bounded by the retry
    // budget, then require one admitted request and no request after it.
    const RETRIES: u32 = 3;
    let server = tokio::spawn(async move {
        let watchdog = tokio::time::Instant::now() + Duration::from_secs(10);
        let mut early_closes = 0u32;
        loop {
            assert!(
                early_closes <= RETRIES,
                "more pre-header closes than the retry budget allows"
            );
            let (mut socket, _) = tokio::time::timeout_at(watchdog, listener.accept())
                .await
                .expect("fixture watchdog expired before an admitted request")
                .unwrap();
            let mut request = Vec::new();
            let mut bytes = [0u8; 4096];
            let complete = loop {
                if request.windows(4).any(|bytes| bytes == b"\r\n\r\n") {
                    break true;
                }
                let count = tokio::time::timeout_at(watchdog, socket.read(&mut bytes))
                    .await
                    .expect("fixture watchdog expired while reading request headers")
                    .unwrap();
                if count == 0 {
                    break false;
                }
                request.extend_from_slice(&bytes[..count]);
            };
            if !complete {
                early_closes += 1;
                continue;
            }
            assert!(request.starts_with(b"POST /messaging/operation "));
            socket.write_all(b"HTTP/1.1 200 OK\r\ncontent-type: application/json\r\nrequest-id: admitted-request\r\nx-polymorfa-operation-id: operation-1\r\ncontent-length: 100\r\nconnection: close\r\n\r\n{\"success\":").await.unwrap();
            tokio::time::sleep(Duration::from_millis(100)).await;
            assert!(
                tokio::time::timeout(Duration::from_millis(20), listener.accept())
                    .await
                    .is_err(),
                "request after the admitted response"
            );
            return early_closes;
        }
    });
    let error = support::messaging(base)
        .raw::<serde_json::Value>(
            reqwest::Method::POST,
            "/messaging/operation",
            &Query::new(),
            Some(&serde_json::json!({"value":1})),
            RequestOptions {
                timeout: Some(Duration::from_millis(30)),
                max_network_retries: Some(RETRIES),
                idempotency_key: Some("once".into()),
                ..RequestOptions::default()
            },
        )
        .await
        .unwrap_err();
    assert_eq!(error.kind, ErrorKind::Timeout);
    assert_eq!(error.status, Some(200));
    assert_eq!(error.request_id.as_deref(), Some("admitted-request"));
    assert_eq!(error.operation_id.as_deref(), Some("operation-1"));
    let early_closes = server.await.unwrap();
    // The admitted attempt is the last one: 1 when no attempt closed early.
    assert_eq!(error.metadata.as_ref().unwrap().attempts, early_closes + 1);
}
