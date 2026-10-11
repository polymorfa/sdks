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
    let server = tokio::spawn(async move {
        let (mut socket, _) = listener.accept().await.unwrap();
        let mut request = Vec::new();
        let mut bytes = [0u8; 4096];
        while !request.windows(4).any(|bytes| bytes == b"\r\n\r\n") {
            let count = socket.read(&mut bytes).await.unwrap();
            assert_ne!(count, 0);
            request.extend_from_slice(&bytes[..count]);
        }
        socket.write_all(b"HTTP/1.1 200 OK\r\ncontent-type: application/json\r\nrequest-id: admitted-request\r\nx-polymorfa-operation-id: operation-1\r\ncontent-length: 100\r\nconnection: close\r\n\r\n{\"success\":").await.unwrap();
        tokio::time::sleep(Duration::from_millis(100)).await;
        assert!(
            tokio::time::timeout(Duration::from_millis(20), listener.accept())
                .await
                .is_err()
        );
    });
    let error = support::messaging(base)
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
    assert_eq!(error.kind, ErrorKind::Timeout);
    assert_eq!(error.status, Some(200));
    assert_eq!(error.request_id.as_deref(), Some("admitted-request"));
    assert_eq!(error.operation_id.as_deref(), Some("operation-1"));
    assert_eq!(error.metadata.as_ref().unwrap().attempts, 1);
    server.await.unwrap();
}
