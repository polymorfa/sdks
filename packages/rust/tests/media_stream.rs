use bytes::Bytes;
use futures_util::{stream, StreamExt};
use polymorfa_sdk::{media::*, media_stream::*, Error, ErrorKind};
use serde_json::Value;
use std::{path::PathBuf, sync::Arc};
use tokio_util::sync::CancellationToken;
fn fixtures() -> Value {
    serde_json::from_str(include_str!("fixtures/whatsapp-media.json")).unwrap()
}
fn bytes(value: &Value, name: &str) -> Vec<u8> {
    hex::decode(value[name].as_str().unwrap()).unwrap()
}
fn descriptor(value: &Value) -> MediaDescriptor {
    WhatsAppMediaMessage {
        message_type: value["kind"].as_str().unwrap().into(),
        media: Some(value["descriptor"].as_str().unwrap().into()),
    }
    .descriptor()
    .unwrap()
}
fn options(d: &MediaDescriptor, verify: MediaVerifyMode) -> MediaDecryptOptions {
    MediaDecryptOptions {
        file_sha256: d.file_sha256,
        file_enc_sha256: d.file_enc_sha256,
        file_length: d.file_length,
        max_bytes: 1024,
        verify,
        ..Default::default()
    }
}
fn source(input: &[u8], size: usize) -> MediaByteStream {
    Box::pin(stream::iter(
        input
            .chunks(size)
            .map(|chunk| Ok(Bytes::copy_from_slice(chunk)))
            .collect::<Vec<_>>(),
    ))
}
#[tokio::test]
async fn five_independent_vectors_incremental_modes_fragment_mac_and_hash_boundaries() {
    for vector in fixtures()["fixtures"].as_array().unwrap() {
        let d = descriptor(vector);
        let keys = derive_keys(&d.media_key, d.media_kind).unwrap();
        let input = bytes(vector, "encrypted");
        let expected = bytes(vector, "plaintext");
        for size in [1, 2, 7, 15, 16, 17, 26, 37, 4096] {
            for mode in [MediaVerifyMode::BeforeRelease, MediaVerifyMode::Streaming] {
                let mut decryptor = MediaDecryptor::new(&keys, options(&d, mode)).unwrap();
                let mut output = Vec::new();
                for chunk in input.chunks(size) {
                    let part = decryptor.update(chunk).unwrap();
                    if mode == MediaVerifyMode::BeforeRelease {
                        assert!(part.is_empty());
                    }
                    output.extend(part);
                }
                output.extend(decryptor.finish().unwrap());
                assert_eq!(output, expected);
                let mut body =
                    decrypt_stream(source(&input, size), keys.clone(), options(&d, mode)).unwrap();
                let mut collected = Vec::new();
                while let Some(chunk) = body.next().await {
                    collected.extend_from_slice(&chunk.unwrap());
                }
                assert_eq!(collected, expected);
            }
        }
        for (variant, code) in [
            (0, "media_enc_hash_mismatch"),
            (1, "media_mac_mismatch"),
            (2, "media_hash_mismatch"),
        ] {
            let mut input = input.clone();
            let mut config = options(&d, MediaVerifyMode::BeforeRelease);
            if variant == 0 {
                input[0] ^= 1;
            }
            if variant == 1 {
                let last = input.len() - 1;
                input[last] ^= 1;
                config.file_enc_sha256 = None;
            }
            if variant == 2 {
                config.file_sha256 = Some([0; 32]);
            }
            let mut body = decrypt_stream(source(&input, 3), keys.clone(), config).unwrap();
            let error = body.next().await.unwrap().unwrap_err();
            assert_eq!(error.code.as_deref(), Some(code));
            assert!(body.next().await.is_none());
        }
        let mut config = options(&d, MediaVerifyMode::Streaming);
        config.file_sha256 = Some([0; 32]);
        let mut body = decrypt_stream(source(&input, 17), keys.clone(), config).unwrap();
        let mut released = false;
        loop {
            match body.next().await.unwrap() {
                Ok(chunk) => {
                    assert!(!chunk.is_empty());
                    released = true
                }
                Err(error) => {
                    assert_eq!(error.code.as_deref(), Some("media_hash_mismatch"));
                    break;
                }
            }
        }
        assert!(released);
    }
}
fn scratch() -> PathBuf {
    let root = std::env::var_os("POLYMORFA_TEST_WORK_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            PathBuf::from(std::env::var_os("HOME").unwrap())
                .join(".polymorfa-agent-work/multi-language-sdks-20261011/rust-media-tests")
        });
    let path = root.join(uuid::Uuid::new_v4().to_string());
    std::fs::create_dir_all(&path).unwrap();
    path
}
#[tokio::test]
async fn atomic_file_preserves_target_after_integrity_limit_cancel_and_dropped_future() {
    let directory = scratch();
    let target = directory.join("verified.bin");
    for vector in fixtures()["fixtures"].as_array().unwrap() {
        let d = descriptor(vector);
        let keys = derive_keys(&d.media_key, d.media_kind).unwrap();
        let input = bytes(vector, "encrypted");
        let body = decrypt_stream(
            source(&input, 3),
            keys.clone(),
            options(&d, MediaVerifyMode::Streaming),
        )
        .unwrap();
        write_to_file(body, &target, MediaFileOptions::default())
            .await
            .unwrap();
        assert_eq!(std::fs::read(&target).unwrap(), bytes(vector, "plaintext"));
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            assert_eq!(
                std::fs::metadata(&target).unwrap().permissions().mode() & 0o777,
                0o600
            );
        }
        std::fs::write(&target, b"original").unwrap();
        let mut bad = options(&d, MediaVerifyMode::Streaming);
        bad.file_sha256 = Some([0; 32]);
        let error = write_to_file(
            decrypt_stream(source(&input, 3), keys, bad).unwrap(),
            &target,
            MediaFileOptions::default(),
        )
        .await
        .unwrap_err();
        assert_eq!(error.kind, ErrorKind::MediaIntegrity);
        assert_eq!(std::fs::read(&target).unwrap(), b"original");
        assert_eq!(std::fs::read_dir(&directory).unwrap().count(), 1);
    }
    let overflow = write_to_file(
        source(b"12345", 1),
        &target,
        MediaFileOptions {
            max_bytes: 4,
            ..Default::default()
        },
    )
    .await
    .unwrap_err();
    assert_eq!(overflow.code.as_deref(), Some("media_too_large"));
    let cancellation = CancellationToken::new();
    let partial =
        Box::pin(stream::iter(vec![Ok(Bytes::from_static(b"prefix"))]).chain(stream::pending()))
            as MediaByteStream;
    let task = tokio::spawn(write_to_file(
        partial,
        target.clone(),
        MediaFileOptions {
            cancellation: cancellation.clone(),
            ..Default::default()
        },
    ));
    tokio::time::sleep(std::time::Duration::from_millis(10)).await;
    cancellation.cancel();
    assert_eq!(task.await.unwrap().unwrap_err().kind, ErrorKind::Cancelled);
    assert_eq!(std::fs::read_dir(&directory).unwrap().count(), 1);
    assert_eq!(std::fs::read(&target).unwrap(), b"original");
    let partial =
        Box::pin(stream::iter(vec![Ok(Bytes::from_static(b"prefix"))]).chain(stream::pending()))
            as MediaByteStream;
    let task = tokio::spawn(write_to_file(
        partial,
        target.clone(),
        MediaFileOptions::default(),
    ));
    tokio::time::sleep(std::time::Duration::from_millis(10)).await;
    task.abort();
    let _ = task.await;
    assert_eq!(std::fs::read_dir(&directory).unwrap().count(), 1);
    assert_eq!(std::fs::read(&target).unwrap(), b"original");
    std::fs::remove_dir_all(directory).unwrap();
}
#[tokio::test]
async fn decrypt_stream_bounds_and_pending_cancellation_are_native() {
    let all = fixtures();
    let vector = &all["fixtures"][0];
    let d = descriptor(vector);
    let keys = derive_keys(&d.media_key, d.media_kind).unwrap();
    let input = bytes(vector, "encrypted");
    let mut too_small = options(&d, MediaVerifyMode::BeforeRelease);
    too_small.max_bytes = 1;
    assert_eq!(
        decrypt_stream(source(&input, 3), keys.clone(), too_small)
            .err()
            .unwrap()
            .code
            .as_deref(),
        Some("media_too_large")
    );
    let token = CancellationToken::new();
    let mut config = options(&d, MediaVerifyMode::BeforeRelease);
    config.cancellation = token.clone();
    let source = Box::pin(
        stream::iter(vec![Ok(Bytes::copy_from_slice(&input[..32]))]).chain(stream::pending()),
    ) as MediaByteStream;
    let mut body = decrypt_stream(source, keys.clone(), config).unwrap();
    let task = tokio::spawn(async move { body.next().await.unwrap().unwrap_err() });
    tokio::task::yield_now().await;
    token.cancel();
    assert_eq!(task.await.unwrap().kind, ErrorKind::Cancelled);
    let broken = Box::pin(stream::iter(vec![Err(Error::from(std::io::Error::new(
        std::io::ErrorKind::ConnectionReset,
        "fixture interruption",
    )))])) as MediaByteStream;
    assert_eq!(
        decrypt_stream(broken, keys, options(&d, MediaVerifyMode::BeforeRelease))
            .unwrap()
            .next()
            .await
            .unwrap()
            .unwrap_err()
            .kind,
        ErrorKind::Connection
    );
    assert!(WhatsAppMediaMessage {
        message_type: "text".into(),
        media: None
    }
    .descriptor()
    .is_err());
}
struct CdnPeer {
    child: std::process::Child,
    directory: PathBuf,
    addr: std::net::SocketAddr,
    certificate: reqwest::Certificate,
}
impl CdnPeer {
    fn start() -> Self {
        use base64::{engine::general_purpose::STANDARD, Engine};
        use std::io::BufRead;
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        let mut child = std::process::Command::new("node")
            .arg(root.join("tests/cdn-server.mjs"))
            .arg(root.join("tests/fixtures/whatsapp-media.json"))
            .stdout(std::process::Stdio::piped())
            .spawn()
            .unwrap();
        let mut line = String::new();
        std::io::BufReader::new(child.stdout.take().unwrap())
            .read_line(&mut line)
            .unwrap();
        let ready: Value = serde_json::from_str(&line).unwrap();
        Self {
            child,
            directory: ready["directory"].as_str().unwrap().into(),
            addr: format!("127.0.0.1:{}", ready["port"].as_u64().unwrap())
                .parse()
                .unwrap(),
            certificate: reqwest::Certificate::from_pem(
                &STANDARD
                    .decode(ready["certificate"].as_str().unwrap())
                    .unwrap(),
            )
            .unwrap(),
        }
    }
    fn options(&self) -> MediaDownloadOptions {
        let addr = self.addr;
        let certificate = self.certificate.clone();
        MediaDownloadOptions {
            max_bytes: 1024,
            configure_http: Some(Arc::new(move |builder| {
                builder
                    .no_proxy()
                    .add_root_certificate(certificate.clone())
                    .resolve("mmg.whatsapp.net", addr)
                    .resolve("media.whatsapp.net", addr)
            })),
            ..Default::default()
        }
    }
}
impl Drop for CdnPeer {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
        let _ = std::fs::remove_dir_all(&self.directory);
    }
}
#[tokio::test]
async fn native_https_cdn_downloads_message_inputs_redirects_without_credentials_and_confines_hosts(
) {
    let peer = CdnPeer::start();
    assert!(reqwest::Client::builder()
        .no_proxy()
        .resolve("mmg.whatsapp.net", peer.addr)
        .build()
        .unwrap()
        .get("https://mmg.whatsapp.net/image.enc")
        .send()
        .await
        .is_err());
    let client = polymorfa_sdk::MessagingClient::new(
        polymorfa_sdk::Credential::organization_api_key("pmfa_AAECAwQFBgcICQoLDA0ODxAREhM73f-k".to_string())
            .unwrap(),
        Default::default(),
    )
    .unwrap();
    for vector in fixtures()["fixtures"].as_array().unwrap() {
        let input = WhatsAppMediaMessage {
            message_type: vector["kind"].as_str().unwrap().into(),
            media: Some(vector["descriptor"].as_str().unwrap().into()),
        };
        let buffered = client
            .media()
            .download_from_whatsapp_message(&input, peer.options())
            .await
            .unwrap();
        assert_eq!(buffered.bytes, bytes(vector, "plaintext"));
        let stream = client
            .media()
            .download_from_whatsapp_stream(&WhatsAppMediaInput::Message(input), peer.options())
            .await
            .unwrap();
        assert_eq!(
            stream.into_bytes().await.unwrap().bytes,
            bytes(vector, "plaintext")
        );
    }
    let all = fixtures();
    let vector = &all["fixtures"][0];
    let mut d = descriptor(vector);
    d.url = Some("https://mmg.whatsapp.net/redirect".into());
    let directory = scratch();
    let target = directory.join("download.bin");
    let mut streaming = peer.options();
    streaming.verify = MediaVerifyMode::Streaming;
    let body = download_stream(&d, streaming).await.unwrap();
    body.write_to_file(&target, CancellationToken::new())
        .await
        .unwrap();
    assert_eq!(std::fs::read(&target).unwrap(), bytes(vector, "plaintext"));
    d.url = Some("https://mmg.whatsapp.net/image.enc".into());
    let token = CancellationToken::new();
    let mut config = peer.options();
    config.verify = MediaVerifyMode::Streaming;
    config.cancellation = token.clone();
    let mut body = download_stream(&d, config).await.unwrap().body;
    assert!(!body.next().await.unwrap().unwrap().is_empty());
    token.cancel();
    assert_eq!(
        body.next().await.unwrap().unwrap_err().kind,
        ErrorKind::Cancelled
    );
    d.url = Some("https://mmg.whatsapp.net/not-found".into());
    let direct_path = d.direct_path.take();
    assert_eq!(
        download_stream(&d, peer.options())
            .await
            .err()
            .unwrap()
            .status,
        Some(404)
    );
    d.direct_path = direct_path;
    d.url = Some("https://mmg.whatsapp.net/escape".into());
    let error = download_stream(&d, peer.options()).await.err().unwrap();
    assert_eq!(error.kind, ErrorKind::MediaIntegrity);
    assert!(!error.message.contains("secret"));
    d.url = Some("https://mmg.whatsapp.net/image.enc?oversize".into());
    assert_eq!(
        download_stream(&d, peer.options())
            .await
            .err()
            .unwrap()
            .code
            .as_deref(),
        Some("media_too_large")
    );
    let cancellation = CancellationToken::new();
    cancellation.cancel();
    let mut config = peer.options();
    config.cancellation = cancellation;
    assert_eq!(
        download_stream(&d, config).await.err().unwrap().kind,
        ErrorKind::Cancelled
    );
    // Native TLS validates the synthetic certificate; no verifier bypass is used.
    let state: Value = reqwest::Client::builder()
        .no_proxy()
        .add_root_certificate(peer.certificate.clone())
        .resolve("mmg.whatsapp.net", peer.addr)
        .build()
        .unwrap()
        .get("https://mmg.whatsapp.net/state")
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let requests = state.as_array().unwrap();
    assert!(requests.len() >= 14);
    assert!(requests
        .iter()
        .all(|r| r["authorization"] == false && r["cookie"] == false));
    assert!(requests
        .iter()
        .any(|r| r["path"] == "/image.enc?signature=fixture"));
    std::fs::remove_dir_all(directory).unwrap();
}
