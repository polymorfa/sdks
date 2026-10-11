#[allow(dead_code)]
mod support;
use polymorfa_sdk::{voice::*, ErrorKind, RequestOptions};
use serde_json::{json, Value};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::{TcpListener, TcpStream},
};
fn asset() -> Value {
    json!({"id":"asset","projectId":"project","name":"greeting","source":"upload","status":"transcoding","failureReason":null,"originalFormat":"ogg","originalContentType":"audio/ogg","sizeBytes":3,"durationMs":null,"contentSha256":null,"tts":null,"retentionDays":null,"expiresAt":null,"inUseCount":0,"revision":2,"createdAt":"then","updatedAt":"now","readyAt":null})
}
async fn read(socket: &mut TcpStream) -> (String, Vec<u8>) {
    let mut all = Vec::new();
    let mut buf = [0; 1024];
    let (end, length) = loop {
        let n = socket.read(&mut buf).await.unwrap();
        assert!(n > 0);
        all.extend_from_slice(&buf[..n]);
        if let Some(end) = all.windows(4).position(|w| w == b"\r\n\r\n") {
            let head = String::from_utf8_lossy(&all[..end]);
            let length = head
                .lines()
                .find_map(|l| {
                    l.to_lowercase()
                        .strip_prefix("content-length:")
                        .and_then(|v| v.trim().parse::<usize>().ok())
                })
                .unwrap_or(0);
            break (end + 4, length);
        }
    };
    while all.len() < end + length {
        let n = socket.read(&mut buf).await.unwrap();
        assert!(n > 0);
        all.extend_from_slice(&buf[..n]);
    }
    (
        String::from_utf8(all[..end].to_vec())
            .unwrap()
            .to_lowercase(),
        all[end..].to_vec(),
    )
}
async fn reply(socket: &mut TcpStream, body: Value) {
    let body = body.to_string();
    socket.write_all(format!("HTTP/1.1 200 OK\r\ncontent-type: application/json\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{body}",body.len()).as_bytes()).await.unwrap();
}
#[tokio::test]
async fn bytes_and_stream_uploads_never_forward_api_credentials_and_complete_with_fresh_identity() {
    for streaming in [false, true] {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let base = format!("http://{}", listener.local_addr().unwrap());
        let url = base.clone();
        let server = tokio::spawn(async move {
            let (mut socket, _) = listener.accept().await.unwrap();
            let (head, body) = read(&mut socket).await;
            assert!(head.starts_with("post /platform/voice/audio "));
            assert!(head.contains("authorization: bearer pmfa_"));
            assert!(head.contains("idempotency-key: create-key"));
            assert_eq!(
                serde_json::from_slice::<Value>(&body).unwrap(),
                json!({"projectId":"project","name":"greeting","contentType":"audio/ogg","sizeBytes":3})
            );
            reply(&mut socket,json!({"data":{"asset":asset(),"upload":{"url":format!("{url}/storage?secret=capability"),"method":"POST","headers":{"content-type":"audio/ogg","authorization":"Bearer forbidden"},"maxBytes":16777216,"expiresAt":"later"}}})).await;
            let (mut socket, _) = listener.accept().await.unwrap();
            let (head, body) = read(&mut socket).await;
            assert!(head.starts_with("post /storage?secret=capability "));
            assert!(!head.contains("authorization:"));
            assert!(!head.contains("idempotency-key:"));
            assert!(!head.contains("polymorfa-version:"));
            assert_eq!(body, b"abc");
            reply(&mut socket, json!({"ok":true})).await;
            let (mut socket, _) = listener.accept().await.unwrap();
            let (head, _) = read(&mut socket).await;
            assert!(head.starts_with("post /platform/voice/audio/asset/complete "));
            assert!(head.contains("authorization: bearer pmfa_"));
            assert!(!head.contains("idempotency-key:"));
            reply(&mut socket, json!({"data":asset()})).await;
        });
        let client = support::organization(base);
        let voice = client.voice();
        let audio = voice.audio("project").unwrap();
        let request = CreateAudioUploadRequest {
            name: "greeting".into(),
            content_type: UploadContentType::Ogg,
            size_bytes: 3,
            retention_days: None,
        };
        let options = RequestOptions {
            idempotency_key: Some("create-key".into()),
            ..Default::default()
        };
        let result = if streaming {
            audio
                .upload_stream(
                    &request,
                    futures_util::stream::iter([Ok::<_, std::io::Error>(
                        bytes::Bytes::from_static(b"abc"),
                    )]),
                    options,
                )
                .await
        } else {
            audio.upload(&request, b"abc", options).await
        }
        .unwrap();
        assert_eq!(result.data.status, "transcoding");
        server.await.unwrap();
    }
}
#[tokio::test]
async fn malformed_or_empty_bytes_fail_before_asset_creation() {
    let client = support::organization("http://127.0.0.1:1".into());
    let voice = client.voice();
    let audio = voice.audio("project").unwrap();
    for (size, bytes) in [(4, b"abc".as_slice()), (0, b"".as_slice())] {
        let error = audio
            .upload(
                &CreateAudioUploadRequest {
                    name: "greeting".into(),
                    content_type: UploadContentType::Ogg,
                    size_bytes: size,
                    retention_days: None,
                },
                bytes,
                Default::default(),
            )
            .await
            .unwrap_err();
        assert_eq!(error.kind, ErrorKind::Validation);
    }
}
#[tokio::test]
async fn storage_redirect_failure_never_echoes_capability_or_completes() {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let base = format!("http://{}", listener.local_addr().unwrap());
    let url = base.clone();
    let server = tokio::spawn(async move {
        let (mut socket, _) = listener.accept().await.unwrap();
        read(&mut socket).await;
        reply(&mut socket,json!({"data":{"asset":asset(),"upload":{"url":format!("{url}/storage?secret=capability"),"method":"POST","headers":{},"maxBytes":16777216,"expiresAt":"later"}}})).await;
        let (mut socket, _) = listener.accept().await.unwrap();
        read(&mut socket).await;
        socket.write_all(b"HTTP/1.1 307 Temporary Redirect\r\nlocation: https://evil.invalid/secret=capability\r\ncontent-length: 0\r\nconnection: close\r\n\r\n").await.unwrap();
        assert!(
            tokio::time::timeout(std::time::Duration::from_millis(40), listener.accept())
                .await
                .is_err()
        );
    });
    let client = support::organization(base);
    let error = client
        .voice()
        .audio("project")
        .unwrap()
        .upload(
            &CreateAudioUploadRequest {
                name: "greeting".into(),
                content_type: UploadContentType::Ogg,
                size_bytes: 3,
                retention_days: None,
            },
            b"abc",
            Default::default(),
        )
        .await
        .unwrap_err();
    assert_eq!(error.status, Some(307));
    assert!(!format!("{error:?}").contains("capability"));
    server.await.unwrap();
}
