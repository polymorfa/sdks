#[allow(dead_code)]
mod support;
use polymorfa_sdk::errors::{is_known_error_code, POLYMORFA_ERROR_CODES};
#[test]
fn known_catalog_matches_pinned_typescript_without_closing_future_codes() {
    let fixture: serde_json::Value =
        serde_json::from_str(include_str!("fixtures/known-error-codes.json")).unwrap();
    let expected: Vec<_> = fixture["codes"]
        .as_array()
        .unwrap()
        .iter()
        .map(|code| code.as_str().unwrap())
        .collect();
    assert_eq!(POLYMORFA_ERROR_CODES, expected);
    assert!(is_known_error_code("entitlement_required"));
    assert!(!is_known_error_code("future_api_error"));
}
#[tokio::test]
async fn future_error_code_survives_native_http_response_and_request_metadata() {
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let base = format!("http://{}", listener.local_addr().unwrap());
    let server = tokio::spawn(async move {
        let (mut socket, _) = listener.accept().await.unwrap();
        let mut bytes = [0; 4096];
        let read = socket.read(&mut bytes).await.unwrap();
        assert!(read > 0);
        let body = r#"{"error":{"code":"future_api_error","message":"Future refusal"}}"#;
        socket.write_all(format!("HTTP/1.1 422 Unprocessable Entity\r\nx-request-id: future-request\r\ncontent-type: application/json\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{body}",body.len()).as_bytes()).await.unwrap();
    });
    let error = support::messaging(base)
        .sessions()
        .list(Default::default())
        .await
        .unwrap_err();
    assert_eq!(error.code.as_deref(), Some("future_api_error"));
    assert_eq!(error.request_id.as_deref(), Some("future-request"));
    assert_eq!(error.kind, polymorfa_sdk::ErrorKind::Validation);
    server.await.unwrap();
}
