#[allow(dead_code)]
mod support;
use futures_util::StreamExt;
use polymorfa_sdk::{media::*, transport::DownloadLocation, RequestOptions};
use serde_json::{json, Value};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::TcpListener,
};

#[test]
fn whatsapp_media_matches_independent_node_crypto_vectors() {
    let data: Value = serde_json::from_str(include_str!("fixtures/whatsapp-media.json")).unwrap();
    for fixture in data["fixtures"].as_array().unwrap() {
        let kind: MediaKind = fixture["kind"].as_str().unwrap().parse().unwrap();
        let bytes = |name: &str| hex::decode(fixture[name].as_str().unwrap()).unwrap();
        let key: [u8; 32] = bytes("mediaKey").try_into().unwrap();
        let keys = derive_keys(&key, kind).unwrap();
        assert_eq!(keys.iv.to_vec(), bytes("iv"));
        assert_eq!(keys.cipher_key.to_vec(), bytes("cipherKey"));
        assert_eq!(keys.mac_key.to_vec(), bytes("macKey"));
        let descriptor = decode_descriptor(fixture["descriptor"].as_str().unwrap(), kind).unwrap();
        assert_eq!(descriptor.media_key, key);
        assert_eq!(
            descriptor.file_length,
            Some(bytes("plaintext").len() as u64)
        );
        let encrypted = bytes("encrypted");
        let plaintext = decrypt(
            &encrypted,
            &keys,
            descriptor.file_sha256.as_ref(),
            descriptor.file_enc_sha256.as_ref(),
            1024,
        )
        .unwrap();
        assert_eq!(plaintext, bytes("plaintext"));
        let mut damaged = encrypted.clone();
        damaged[0] ^= 1;
        assert_eq!(
            decrypt(
                &damaged,
                &keys,
                descriptor.file_sha256.as_ref(),
                descriptor.file_enc_sha256.as_ref(),
                1024
            )
            .unwrap_err()
            .code
            .as_deref(),
            Some("media_enc_hash_mismatch")
        );
        assert_eq!(
            decrypt(&damaged, &keys, descriptor.file_sha256.as_ref(), None, 1024)
                .unwrap_err()
                .code
                .as_deref(),
            Some("media_mac_mismatch")
        );
        let wrong_sha = [0u8; 32];
        assert_eq!(
            decrypt(&encrypted, &keys, Some(&wrong_sha), None, 1024)
                .unwrap_err()
                .code
                .as_deref(),
            Some("media_hash_mismatch")
        );
        assert_eq!(
            decrypt(&encrypted, &keys, None, None, 1)
                .unwrap_err()
                .code
                .as_deref(),
            Some("media_too_large")
        );
        assert!(candidate_urls(&descriptor).unwrap()[1].contains("hash="));
    }
}
#[test]
fn descriptors_and_download_hosts_fail_closed() {
    for data in [
        "",
        "!",
        "AA==",
        "Cg==",
        "Qh8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
        "gICAgICAgICAgA==",
    ] {
        assert!(decode_descriptor(data, MediaKind::Image).is_err());
    }
    for url in [
        "http://mmg.whatsapp.net/x",
        "https://mmg.whatsapp.net.evil.test/x",
        "https://evil.test/x",
        "https://name:secret@mmg.whatsapp.net/x",
        "https://mmg.whatsapp.net:444/x",
    ] {
        assert!(!is_whatsapp_media_url(url));
    }
    assert!(is_whatsapp_media_url(
        "https://mmg.whatsapp.net/x?token=secret"
    ));
}
#[tokio::test]
async fn api_media_resource_wire_contracts() {
    wire_messaging!(
        client,
        "GET",
        "/messaging/media/media/info",
        None,
        json!({"success":true,"data":{"id":"media","session":"s","messageId":"message","mimeType":"image/jpeg","fileLength":10,"persisted":true}}),
        client.media().retrieve("media", RequestOptions::default())
    );
    wire_messaging!(
        client,
        "POST",
        "/messaging/media/media/download-and-save",
        None,
        json!({"success":true}),
        client.media().persist("media", RequestOptions::default())
    );
}
#[tokio::test]
async fn api_media_redirect_does_not_forward_credentials_or_caller_headers() {
    let storage = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let storage_url = format!(
        "http://{}/object?Expires=2000000000&signature=secret",
        storage.local_addr().unwrap()
    );
    let storage_task = tokio::spawn(async move {
        let (mut socket, _) = storage.accept().await.unwrap();
        let mut buffer = [0; 4096];
        let length = socket.read(&mut buffer).await.unwrap();
        let request = String::from_utf8_lossy(&buffer[..length]).to_ascii_lowercase();
        assert!(request.contains("/object?expires=2000000000&signature=secret"));
        assert!(!request.contains("authorization:"));
        assert!(!request.contains("polymorfa-version:"));
        assert!(!request.contains("x-private-header:"));
        assert!(!request.contains("cookie:"));
        socket.write_all(b"HTTP/1.1 200 OK\r\ncontent-length: 5\r\ncontent-type: text/plain\r\ncontent-disposition: attachment; filename=old.txt; filename*=UTF-8''hello%20world.txt\r\nconnection: close\r\n\r\nHello").await.unwrap();
    });
    let api = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let base = format!("http://{}", api.local_addr().unwrap());
    let api_task = tokio::spawn(async move {
        for _ in 0..2 {
            let (mut socket, _) = api.accept().await.unwrap();
            let mut buffer = [0; 4096];
            let length = socket.read(&mut buffer).await.unwrap();
            let request = String::from_utf8_lossy(&buffer[..length]).to_ascii_lowercase();
            assert!(request.contains("authorization: bearer pmfa_"));
            assert!(request.contains("x-private-header: value"));
            socket.write_all(format!("HTTP/1.1 302 Found\r\nlocation: {storage_url}\r\nx-request-id: api_redirect\r\ncontent-length: 0\r\nconnection: close\r\n\r\n").as_bytes()).await.unwrap();
        }
    });
    let client = support::messaging(base);
    let options = RequestOptions {
        headers: std::collections::BTreeMap::from([("x-private-header".into(), "value".into())]),
        ..RequestOptions::default()
    };
    let mut stream = client
        .media()
        .download_stream("media", options.clone())
        .await
        .unwrap();
    assert!(stream.redirected);
    assert_eq!(stream.filename.as_deref(), Some("hello world.txt"));
    assert_eq!(stream.metadata.request_id.as_deref(), Some("api_redirect"));
    assert!(!stream.metadata.headers.contains_key("location"));
    let mut bytes = Vec::new();
    while let Some(chunk) = stream.body.next().await {
        bytes.extend_from_slice(&chunk.unwrap());
    }
    assert_eq!(bytes, b"Hello");
    let location = client.media().download_url("media", options).await.unwrap();
    match location {
        DownloadLocation::Redirect {
            url, expires_at, ..
        } => {
            assert!(url.contains("signature=secret"));
            assert!(expires_at.is_some());
        }
        _ => panic!("Expected signed redirect"),
    }
    api_task.await.unwrap();
    storage_task.await.unwrap();
}
