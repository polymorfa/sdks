use base64::{engine::general_purpose::STANDARD, Engine as _};
use futures_util::{stream, StreamExt as _};
use polymorfa_sdk::{
    history_chunks::*,
    media::MediaDownloadOptions,
    media_encrypt::*,
    media_upload::*,
    media_upload_transport::{
        upload_with_transport, EncryptedUploadBody, MediaUploadTransport, UploadTransportFuture,
    },
    ClientOptions, Credential, ErrorKind, MessagingClient, RequestOptions,
};
use serde_json::Value;
use std::{
    io::BufRead,
    path::PathBuf,
    sync::{
        atomic::{AtomicUsize, Ordering},
        Arc,
    },
};
struct Peer {
    child: std::process::Child,
    ready: Value,
}
struct WrappingTransport<'a> {
    inner: &'a dyn MediaUploadTransport,
    calls: AtomicUsize,
    name: String,
}
impl MediaUploadTransport for WrappingTransport<'_> {
    fn name(&self) -> &str {
        &self.name
    }
    fn upload<'a>(
        &'a self,
        session: &'a str,
        body: EncryptedUploadBody<'a>,
        cancellation: tokio_util::sync::CancellationToken,
    ) -> UploadTransportFuture<'a> {
        Box::pin(async move {
            self.calls.fetch_add(1, Ordering::SeqCst);
            self.inner.upload(session, body, cancellation).await
        })
    }
}
impl Peer {
    fn start() -> Self {
        let mut child =
            std::process::Command::new(std::env::var("SDK_NODE").unwrap_or_else(|_| "node".into()))
                .arg(
                    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                        .join("tests/fixtures/customer-data-server.mjs"),
                )
                .stdout(std::process::Stdio::piped())
                .spawn()
                .unwrap();
        let mut line = String::new();
        std::io::BufReader::new(child.stdout.take().unwrap())
            .read_line(&mut line)
            .unwrap();
        Self {
            child,
            ready: serde_json::from_str(&line).unwrap(),
        }
    }
    fn options(&self) -> MediaDownloadOptions {
        let addr = format!("127.0.0.1:{}", self.ready["port"].as_u64().unwrap())
            .parse()
            .unwrap();
        let cert = reqwest::Certificate::from_pem(
            &STANDARD
                .decode(self.ready["certificate"].as_str().unwrap())
                .unwrap(),
        )
        .unwrap();
        MediaDownloadOptions {
            configure_http: Some(Arc::new(move |b| {
                b.no_proxy()
                    .add_root_certificate(cert.clone())
                    .resolve("mmg.whatsapp.net", addr)
            })),
            ..Default::default()
        }
    }
    fn client(&self) -> MessagingClient {
        MessagingClient::new(
            Credential::organization_api_key("pmfa_AgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA".to_string()).unwrap(),
            ClientOptions {
                base_url: format!(
                    "http://127.0.0.1:{}",
                    self.ready["apiPort"].as_u64().unwrap()
                ),
                max_network_retries: 0,
                ..Default::default()
            },
        )
        .unwrap()
    }
    async fn state(&self) -> Value {
        let opts = self.options();
        let client = (opts.configure_http.unwrap())(reqwest::Client::builder())
            .build()
            .unwrap();
        client
            .get("https://mmg.whatsapp.net/state")
            .send()
            .await
            .unwrap()
            .json()
            .await
            .unwrap()
    }
}
impl Drop for Peer {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
        let _ = std::fs::remove_dir_all(self.ready["directory"].as_str().unwrap());
    }
}
fn factory(bytes: Vec<u8>) -> SourceFactory {
    Arc::new(move || {
        let bytes = bytes.clone();
        Box::pin(async move {
            Ok(Box::pin(stream::iter(
                bytes
                    .chunks(7)
                    .map(|c| Ok(bytes::Bytes::copy_from_slice(c)))
                    .collect::<Vec<_>>(),
            )) as MediaInputStream)
        })
    })
}
#[tokio::test]
async fn history_exact_full_width_unknown_fields_three_compressions_verified_native_cdn() {
    let peer = Peer::start();
    assert_eq!(
        ProtoMessage::decode(&[0x0b, 0x10, 0x01, 0x0c])
            .unwrap()
            .fields[0]
            .encoded,
        vec![0x0b, 0x10, 0x01, 0x0c]
    );
    assert!(ProtoMessage::decode(&[0x0b, 0x14]).is_err());
    for name in ["zlib", "gzip", "raw"] {
        let history = decode_history_payload(
            &STANDARD.decode(peer.ready[name].as_str().unwrap()).unwrap(),
            1024,
        )
        .unwrap();
        assert_eq!(history.sync_type, 6);
        assert_eq!(
            history.conversations[0].last_message_timestamp,
            Some(u64::MAX)
        );
        assert_eq!(history.proto.uint64(211), Some(u64::MAX));
        assert_eq!(
            history.conversations[0]
                .proto
                .string(199)
                .unwrap()
                .as_deref(),
            Some("unknown nested")
        );
        assert_eq!(
            history.proto.encoded,
            STANDARD
                .decode(peer.ready["proto"].as_str().unwrap())
                .unwrap()
        );
    }
    let h = &peer.ready["history"];
    let descriptor = HistoryChunkDescriptor {
        direct_path: h["directPath"].as_str().unwrap().into(),
        media_key: hex::decode(h["mediaKey"].as_str().unwrap())
            .unwrap()
            .try_into()
            .unwrap(),
        file_sha256: hex::decode(h["fileSha256"].as_str().unwrap())
            .unwrap()
            .try_into()
            .unwrap(),
        file_enc_sha256: hex::decode(h["fileEncSha256"].as_str().unwrap())
            .unwrap()
            .try_into()
            .unwrap(),
        file_length: h["fileLength"].as_u64(),
    };
    let options = HistoryChunkOptions {
        media: peer.options(),
        max_inflated_bytes: 1024,
    };
    let decoded = download_history_chunk(
        HistoryChunkInput::Descriptor(descriptor.clone()),
        options.clone(),
    )
    .await
    .unwrap();
    assert_eq!(
        decoded.conversations[0].name.as_deref(),
        Some("private chat")
    );
    let mut bad = descriptor;
    bad.direct_path = "/history-bad.enc".into();
    let error = download_history_chunk(HistoryChunkInput::Descriptor(bad), options.clone())
        .await
        .err()
        .unwrap();
    assert_eq!(error.code.as_deref(), Some("media_enc_hash_mismatch"));
    assert_eq!(
        decode_history_payload(
            &STANDARD
                .decode(peer.ready["zlib"].as_str().unwrap())
                .unwrap(),
            1
        )
        .err()
        .unwrap()
        .code
        .as_deref(),
        Some("media_too_large")
    );
    assert!(decode_history_payload(b"broken", 1024).is_err());
    let cancel = options;
    cancel.media.cancellation.cancel();
    assert_eq!(
        download_history_chunk(HistoryChunkInput::Inline(vec![]), cancel)
            .await
            .err()
            .unwrap()
            .kind,
        ErrorKind::Cancelled
    );
}
#[tokio::test]
async fn native_relay_direct_resume_refresh_multipart_and_redirect_do_not_leak_credentials() {
    let peer = Peer::start();
    let client = peer.client();
    let resource = client.whatsapp_media();
    let plaintext = vec![42u8; 100];
    let info = MediaEncryptionOptions::new(UploadMediaType::Document);
    let relay = resource
        .upload_relay(
            "relay",
            MediaSource::Reopen(factory(plaintext.clone())),
            info.clone(),
            RequestOptions::default(),
        )
        .await
        .unwrap();
    assert_eq!(relay.info.file_length, 100);
    let builtin_relay = resource.relay_transport(RequestOptions::default());
    let wrapped_relay = WrappingTransport {
        inner: &builtin_relay,
        calls: AtomicUsize::new(0),
        name: "wrapped-relay".into(),
    };
    let wrapped_result = upload_with_transport(
        "wrapped-relay",
        MediaSource::Reopen(factory(plaintext.clone())),
        info.clone(),
        &wrapped_relay,
    )
    .await
    .unwrap();
    assert_eq!(wrapped_result.egress, "wrapped-relay");
    assert_eq!(wrapped_relay.calls.load(Ordering::SeqCst), 1);
    let builtin_direct = resource
        .direct_transport(
            DirectUploadOptions {
                configure_http: peer.options().configure_http,
                ..Default::default()
            },
            RequestOptions::default(),
        )
        .unwrap();
    let wrapped_direct = WrappingTransport {
        inner: &builtin_direct,
        calls: AtomicUsize::new(0),
        name: "wrapped-direct".into(),
    };
    let wrapped_result = upload_with_transport(
        "wrapped-direct",
        MediaSource::Reopen(factory(plaintext.clone())),
        info.clone(),
        &wrapped_direct,
    )
    .await
    .unwrap();
    assert_eq!(wrapped_result.egress, "wrapped-direct");
    assert_eq!(wrapped_direct.calls.load(Ordering::SeqCst), 1);
    for scenario in ["plain", "retry", "unauthorized", "multipart"] {
        let opts = DirectUploadOptions {
            document_part_size: if scenario == "multipart" { 32 } else { 1000 },
            configure_http: peer.options().configure_http,
            ..Default::default()
        };
        let result = resource
            .upload_direct(
                scenario,
                MediaSource::Reopen(factory(plaintext.clone())),
                info.clone(),
                opts,
                RequestOptions::default(),
            )
            .await
            .unwrap();
        assert_eq!(result.location.direct_path, "/stored.enc");
    }
    let error = resource
        .upload_direct(
            "redirect",
            MediaSource::Bytes(plaintext),
            info,
            DirectUploadOptions {
                configure_http: peer.options().configure_http,
                ..Default::default()
            },
            RequestOptions::default(),
        )
        .await
        .err()
        .unwrap();
    assert!(!format!("{error}").contains("synthetic-grant"));
    assert!(!format!("{error}").contains("secret=fixture"));
    let mut encrypt = MediaEncryptionOptions::new(UploadMediaType::Image);
    encrypt.mimetype = Some("image/jpeg".into());
    let upload = resource
        .upload_relay(
            "image",
            MediaSource::Bytes(vec![1; 20]),
            encrypt,
            RequestOptions::default(),
        )
        .await
        .unwrap();
    let descriptor = polymorfa_sdk::media_descriptor::media_send_descriptor(
        &upload.info,
        &upload.location,
        Default::default(),
    )
    .unwrap();
    let mut message = polymorfa_sdk::models::SendMessageRequest::text(
        polymorfa_sdk::models::ConversationReference {
            id: Some("c".into()),
            phone_number: None,
            bsuid: None,
            username: None,
        },
        "unused",
    );
    message.content = polymorfa_sdk::models::MessageContent::DescriptorImage {
        image: polymorfa_sdk::media_descriptor::DescriptorMediaContent {
            descriptor: descriptor.clone(),
            caption: None,
        },
    };
    client
        .messages()
        .send("image", &message, RequestOptions::default())
        .await
        .unwrap();
    let decoded: polymorfa_sdk::models::SendMessageRequest =
        serde_json::from_value(serde_json::to_value(&message).unwrap()).unwrap();
    assert!(matches!(
        decoded.content,
        polymorfa_sdk::models::MessageContent::DescriptorImage { .. }
    ));
    assert_eq!(
        descriptor
            .signal_descriptor(UploadMediaType::Image, None, None)
            .unwrap()
            .media_key,
        descriptor.media_key
    );
    assert!(!format!("{descriptor:?}").contains(&descriptor.media_key));
    let mut bad = descriptor.clone();
    bad.width = Some(1);
    assert!(bad.validate(UploadMediaType::Image).is_err());
    bad = descriptor.clone();
    bad.waveform = Some(STANDARD.encode([1; 64]));
    assert!(bad.validate(UploadMediaType::Image).is_err());
    let state = peer.state().await;
    for request in state["requests"].as_array().unwrap() {
        if request["boundary"] == "cdn" {
            assert_eq!(request["authorization"], false);
            assert_eq!(request["cookie"], false);
            assert!(!request["path"].as_str().unwrap().contains("/escape"));
        } else {
            assert_eq!(request["version"], "2026-10-14");
            if request["path"].as_str().unwrap().contains("upload-grants") {
                let body = STANDARD.decode(request["body"].as_str().unwrap()).unwrap();
                assert!(!String::from_utf8(body).unwrap().contains("encryptedLength"));
            }
        }
    }
    let multipart = state["states"]
        .as_array()
        .unwrap()
        .iter()
        .find(|s| s["name"] == "multipart")
        .unwrap();
    assert_eq!(multipart["finals"], 1);
}
#[tokio::test]
async fn changed_reopened_source_withholds_final_bytes_and_prevents_multipart_finalize() {
    let counter = Arc::new(AtomicUsize::new(0));
    let count = counter.clone();
    let source: SourceFactory = Arc::new(move || {
        let pass = count.fetch_add(1, Ordering::SeqCst);
        Box::pin(async move {
            Ok(Box::pin(stream::iter([Ok(bytes::Bytes::from(vec![
                if pass == 0 {
                    1
                } else {
                    2
                };
                80
            ]))])) as MediaInputStream)
        })
    });
    let prepared = prepare_upload(
        MediaSource::Reopen(source.clone()),
        MediaEncryptionOptions::new(UploadMediaType::Document),
    )
    .await
    .unwrap();
    let mut body = prepared.open(0).await.unwrap();
    let mut emitted = 0;
    while let Some(chunk) = body.next().await {
        match chunk {
            Ok(b) => emitted += b.len(),
            Err(e) => {
                assert_eq!(e.code.as_deref(), Some("media_enc_hash_mismatch"));
                break;
            }
        }
    }
    assert!(emitted < (prepared.info.encrypted_length as usize));
    counter.store(0, Ordering::SeqCst);
    let peer = Peer::start();
    let client = peer.client();
    let error = client
        .whatsapp_media()
        .upload_direct(
            "changed",
            MediaSource::Reopen(source.clone()),
            MediaEncryptionOptions::new(UploadMediaType::Document),
            DirectUploadOptions {
                document_part_size: 32,
                max_attempts: 1,
                configure_http: peer.options().configure_http,
                ..Default::default()
            },
            RequestOptions::default(),
        )
        .await
        .err()
        .unwrap();
    assert_eq!(error.code.as_deref(), Some("media_enc_hash_mismatch"));
    counter.store(0, Ordering::SeqCst);
    let error = client
        .whatsapp_media()
        .upload_relay(
            "changed-relay",
            MediaSource::Reopen(source),
            MediaEncryptionOptions::new(UploadMediaType::Document),
            RequestOptions::default(),
        )
        .await
        .err()
        .unwrap();
    assert_eq!(error.code.as_deref(), Some("media_enc_hash_mismatch"));
    let state = peer.state().await;
    assert!(state["states"]
        .as_array()
        .unwrap()
        .iter()
        .all(|s| s["finals"] == 0));
}
