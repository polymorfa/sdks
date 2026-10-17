#[allow(dead_code)]
mod support;
#[allow(dead_code)]
mod support41;
use base64::{
    engine::general_purpose::{STANDARD, URL_SAFE_NO_PAD},
    Engine as _,
};
use polymorfa_sdk::{
    media_descriptor::*, media_encrypt::*, media_upload::MediaSource, models::*, ClientOptions,
    Credential, ErrorKind, MessagingClient, RequestOptions,
};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::{TcpListener, TcpStream},
};
async fn read(socket: &mut TcpStream) -> (String, BTreeMap<String, String>, Vec<u8>) {
    let mut bytes = Vec::new();
    let mut buf = [0; 8192];
    let end = loop {
        let n = socket.read(&mut buf).await.unwrap();
        assert!(n > 0);
        bytes.extend_from_slice(&buf[..n]);
        if let Some(i) = bytes.windows(4).position(|b| b == b"\r\n\r\n") {
            break i + 4;
        }
    };
    let head = String::from_utf8(bytes[..end].to_vec()).unwrap();
    let mut lines = head.lines();
    let request = lines.next().unwrap().to_owned();
    let headers = lines
        .filter_map(|s| s.split_once(':'))
        .map(|(k, v)| (k.to_ascii_lowercase(), v.trim().into()))
        .collect::<BTreeMap<String, String>>();
    let length = headers
        .get("content-length")
        .map(|s| s.parse::<usize>().unwrap())
        .unwrap_or(0);
    while bytes.len() < end + length {
        let n = socket.read(&mut buf).await.unwrap();
        assert!(n > 0);
        bytes.extend_from_slice(&buf[..n]);
    }
    (request, headers, bytes[end..end + length].to_vec())
}
async fn reply(socket: &mut TcpStream, body: &[u8]) {
    socket.write_all(format!("HTTP/1.1 200 OK\r\ncontent-length: {}\r\ncontent-type: application/json\r\nconnection: close\r\n\r\n",body.len()).as_bytes()).await.unwrap();
    socket.write_all(body).await.unwrap();
}
fn scoped(base: String) -> MessagingClient {
    MessagingClient::new(
        Credential::client_token("pmfa_ct_synthetic-only").unwrap(),
        ClientOptions {
            base_url: base,
            max_network_retries: 0,
            ..Default::default()
        },
    )
    .unwrap()
}
#[tokio::test]
async fn actual_six_type_encryption_public_relay_and_stored_ciphertext_round_trip() {
    let fixtures: Value =
        serde_json::from_str(include_str!("fixtures/whatsapp-media.json")).unwrap();
    for vector in fixtures["fixtures"].as_array().unwrap() {
        let kind: UploadMediaType = serde_json::from_value(vector["kind"].clone()).unwrap();
        let plaintext = hex::decode(vector["plaintext"].as_str().unwrap()).unwrap();
        let expected = hex::decode(vector["encrypted"].as_str().unwrap()).unwrap();
        let hash: [u8; 32] = hex::decode(vector["fileEncSha256"].as_str().unwrap())
            .unwrap()
            .try_into()
            .unwrap();
        let mut options = MediaEncryptionOptions::new(kind);
        options.media_key = Some(
            hex::decode(vector["mediaKey"].as_str().unwrap())
                .unwrap()
                .try_into()
                .unwrap(),
        );
        let encrypted = encrypt_media(&plaintext, options.clone()).await.unwrap();
        assert_eq!(encrypted.ciphertext, expected);
        assert_eq!(encrypted.info.file_enc_sha256, hash);
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let base = format!("http://{}", listener.local_addr().unwrap());
        let stored_expected = expected.clone();
        let name = vector["kind"].as_str().unwrap().to_owned();
        let task = tokio::spawn(async move {
            for pass in 0..2 {
                let (mut socket, _) = listener.accept().await.unwrap();
                let (line, headers, body) = read(&mut socket).await;
                let api_type = match name.as_str() {
                    "document" => "file",
                    "audio" | "ptt" => "voice",
                    n => n,
                };
                let ptt = match name.as_str() {
                    "audio" => "&ptt=false",
                    "ptt" => "&ptt=true",
                    _ => "",
                };
                assert_eq!(line,format!("POST /messaging/s%20%2F/media/uploads?type={api_type}&fileEncSha256={}{ptt} HTTP/1.1",URL_SAFE_NO_PAD.encode(hash)));
                assert_eq!(
                    headers["polymorfa-version"],
                    if pass == 0 {
                        "2026-10-14"
                    } else {
                        "2026-09-22"
                    }
                );
                assert_eq!(headers["authorization"], "Bearer pmfa_ct_synthetic-only");
                assert_eq!(headers["content-length"], stored_expected.len().to_string());
                assert_eq!(body, stored_expected);
                assert_eq!(Sha256::digest(&body).as_slice(), hash);
                reply(&mut socket,json!({"success":true,"data":{"directPath":"/stored.enc","url":"https://mmg.whatsapp.net/stored.enc"}}).to_string().as_bytes()).await;
                // This independent GET returns bytes actually retained from the preceding upload.
                let (mut get, _) = listener.accept().await.unwrap();
                let (line, headers, _) = read(&mut get).await;
                assert_eq!(line, "GET /stored HTTP/1.1");
                assert!(!headers.contains_key("authorization"));
                reply(&mut get, &body).await;
            }
        });
        let client = scoped(base.clone());
        let first = client
            .whatsapp_media()
            .upload_relay(
                "s /",
                MediaSource::Bytes(plaintext),
                options,
                Default::default(),
            )
            .await
            .unwrap();
        assert_eq!(first.info.file_enc_sha256, hash);
        assert_eq!(first.egress, "relay");
        let stored = reqwest::get(format!("{base}/stored"))
            .await
            .unwrap()
            .bytes()
            .await
            .unwrap();
        assert_eq!(stored.as_ref(), expected);
        let second = client
            .whatsapp_media()
            .relay_upload(
                "s /",
                kind,
                &hash,
                reqwest::Body::from(encrypted.ciphertext),
                expected.len() as u64,
                RequestOptions {
                    api_version: Some("2026-09-22".into()),
                    ..Default::default()
                },
            )
            .await
            .unwrap();
        assert_eq!(second.direct_path, "/stored.enc");
        assert_eq!(
            reqwest::get(format!("{base}/stored"))
                .await
                .unwrap()
                .bytes()
                .await
                .unwrap()
                .as_ref(),
            expected
        );
        task.await.unwrap();
    }
}
fn sticker() -> MediaSendDescriptor {
    MediaSendDescriptor {
        direct_path: "/sticker.enc".into(),
        media_key: STANDARD.encode([1; 32]),
        file_sha256: STANDARD.encode([2; 32]),
        file_enc_sha256: STANDARD.encode([3; 32]),
        file_length: 1,
        mime_type: "image/webp".into(),
        url: "https://mmg.whatsapp.net/sticker.enc".into(),
        thumbnail: None,
        width: Some(512),
        height: Some(512),
        seconds: None,
        waveform: None,
        media_key_timestamp: Some(1),
        is_animated: Some(false),
    }
}
#[tokio::test]
async fn sticker_descriptor_public_send_preserves_flags_large_string_id_and_version_override() {
    let response = json!({"success":true,"data":{"id":"1234567890123456789","whatsapp_ids":{"linked_devices":"wa-id"},"conversation":{"id":"conversation"},"timestamp":"2026-10-14T00:00:00Z","status":"sent","type":"sticker"}});
    let wire = support41::Wire::new(vec![(200, response.clone()), (200, response)]).await;
    let client = support::messaging(wire.base.clone());
    for animated in [false, true] {
        let mut descriptor = sticker();
        descriptor.is_animated = Some(animated);
        let mut body = SendMessageRequest::text(ConversationReference::id("recipient"), "unused");
        body.content = MessageContent::Sticker {
            sticker: descriptor,
        };
        let options = if animated {
            RequestOptions {
                api_version: Some("2026-09-22".into()),
                idempotency_key: Some("sticker-caller".into()),
                ..Default::default()
            }
        } else {
            Default::default()
        };
        assert_eq!(
            client
                .messages()
                .send("s /", &body, options)
                .await
                .unwrap()
                .data
                .data
                .receipt
                .id,
            "1234567890123456789"
        );
    }
    let rows = wire.captured();
    assert_eq!(rows[0].body()["content"]["sticker"]["isAnimated"], false);
    assert_eq!(rows[1].body()["content"]["sticker"]["isAnimated"], true);
    assert_eq!(rows[0].body()["content"]["sticker"]["width"], 512);
    assert_eq!(rows[0].headers["polymorfa-version"], "2026-10-14");
    assert_eq!(rows[1].headers["polymorfa-version"], "2026-09-22");
    assert_eq!(rows[1].headers["idempotency-key"], "sticker-caller");
    for change in 0..5 {
        let mut d = sticker();
        match change {
            0 => d.mime_type = "image/png".into(),
            1 => d.height = None,
            2 => d.seconds = Some(0),
            3 => d.thumbnail = Some("x".into()),
            _ => d.url.clear(),
        };
        let mut body = SendMessageRequest::text(ConversationReference::id("recipient"), "unused");
        body.content = MessageContent::Sticker { sticker: d };
        assert_eq!(
            client
                .messages()
                .send("s", &body, Default::default())
                .await
                .unwrap_err()
                .kind,
            ErrorKind::Configuration
        );
    }
    assert_eq!(wire.captured().len(), 2);
    for wrong in [
        json!({"sticker":{"url":"https://example.com"}}),
        json!({"sticker":{"base64":"AA=="}}),
    ] {
        assert!(serde_json::from_value::<MessageContent>(wrong).is_err());
    }
}
#[tokio::test]
async fn cancelled_relay_preserves_source_ownership_before_reading() {
    use polymorfa_sdk::media_upload::{MediaSource, SourceFactory};
    use std::sync::{
        atomic::{AtomicUsize, Ordering},
        Arc,
    };
    let opened = Arc::new(AtomicUsize::new(0));
    let count = opened.clone();
    let factory: SourceFactory = Arc::new(move || {
        count.fetch_add(1, Ordering::SeqCst);
        Box::pin(async { Ok(Box::pin(futures_util::stream::empty()) as MediaInputStream) })
    });
    let token = tokio_util::sync::CancellationToken::new();
    token.cancel();
    let client = scoped("http://127.0.0.1:1".into());
    let error = client
        .whatsapp_media()
        .upload_relay(
            "s",
            MediaSource::Reopen(factory),
            MediaEncryptionOptions::new(UploadMediaType::Document),
            RequestOptions {
                cancellation: Some(token),
                ..Default::default()
            },
        )
        .await
        .err()
        .unwrap();
    assert_eq!(error.kind, ErrorKind::Cancelled);
    assert_eq!(opened.load(Ordering::SeqCst), 0);
}
