use base64::{engine::general_purpose::STANDARD, Engine as _};
use polymorfa_sdk::{history_chunks::*, media::MediaDownloadOptions};
use serde_json::Value;
use std::{io::BufRead, path::PathBuf, sync::Arc, time::Duration};
struct Peer {
    child: std::process::Child,
    ready: Value,
}
impl Peer {
    fn start() -> Self {
        let mut child =
            std::process::Command::new(std::env::var("SDK_NODE").unwrap_or_else(|_| "node".into()))
                .arg(
                    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                        .join("tests/fixtures/strict-history-server.mjs"),
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
    fn options(&self) -> HistoryChunkOptions {
        let address = format!("127.0.0.1:{}", self.ready["port"].as_u64().unwrap())
            .parse()
            .unwrap();
        let certificate = reqwest::Certificate::from_pem(
            &STANDARD
                .decode(self.ready["certificate"].as_str().unwrap())
                .unwrap(),
        )
        .unwrap();
        HistoryChunkOptions {
            media: MediaDownloadOptions {
                configure_http: Some(Arc::new(move |builder| {
                    builder
                        .no_proxy()
                        .add_root_certificate(certificate.clone())
                        .resolve("mmg.whatsapp.net", address)
                })),
                ..Default::default()
            },
            ..Default::default()
        }
    }
    fn descriptor(&self, name: &str) -> HistoryChunkDescriptor {
        let d = &self.ready["descriptors"][name];
        HistoryChunkDescriptor {
            direct_path: d["directPath"].as_str().unwrap().into(),
            media_key: hex::decode(d["mediaKey"].as_str().unwrap())
                .unwrap()
                .try_into()
                .unwrap(),
            file_sha256: hex::decode(d["fileSha256"].as_str().unwrap())
                .unwrap()
                .try_into()
                .unwrap(),
            file_enc_sha256: hex::decode(d["fileEncSha256"].as_str().unwrap())
                .unwrap()
                .try_into()
                .unwrap(),
            file_length: d["fileLength"].as_u64(),
        }
    }
    async fn state(&self) -> Value {
        (self.options().media.configure_http.unwrap())(reqwest::Client::builder())
            .build()
            .unwrap()
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
fn code(result: polymorfa_sdk::Result<HistoryChunk>) -> Option<String> {
    result.err().and_then(|error| error.code.clone())
}
#[tokio::test]
async fn independently_authenticated_download_validates_compression_and_credentials() {
    let peer = Peer::start();
    for format in ["gzip", "zlib", "raw"] {
        let chunk = download_history_chunk(
            HistoryChunkInput::Descriptor(peer.descriptor(format)),
            peer.options(),
        )
        .await
        .unwrap();
        assert_eq!(chunk.sync_type, 3);
        assert_eq!(
            chunk.conversations[0].last_message_timestamp,
            Some(u64::MAX)
        );
        assert_eq!(
            chunk.proto.bytes(100),
            Some(b"unknown provider data".as_slice())
        );
    }
    for name in ["tail", "concat", "checksum"] {
        assert_eq!(
            code(
                download_history_chunk(
                    HistoryChunkInput::Descriptor(peer.descriptor(name)),
                    peer.options()
                )
                .await
            )
            .as_deref(),
            Some("media_invalid_ciphertext"),
            "{name}: authenticated invalid compressed stream"
        );
    }
    let mut tampered = peer.descriptor("gzip");
    tampered.direct_path = "/tampered.enc".into();
    assert_eq!(
        code(download_history_chunk(HistoryChunkInput::Descriptor(tampered), peer.options()).await)
            .as_deref(),
        Some("media_enc_hash_mismatch")
    );
    let mut limited = peer.options();
    limited.media.max_bytes = 1;
    assert_eq!(
        code(
            download_history_chunk(
                HistoryChunkInput::Descriptor(peer.descriptor("gzip")),
                limited
            )
            .await
        )
        .as_deref(),
        Some("media_too_large")
    );
    // Authentication still precedes inflated-limit validation on the encrypted path.
    let mut invalid_limit = peer.options();
    invalid_limit.max_inflated_bytes = 0;
    let mut tampered = peer.descriptor("gzip");
    tampered.direct_path = "/tampered.enc".into();
    assert_eq!(
        code(download_history_chunk(HistoryChunkInput::Descriptor(tampered), invalid_limit).await)
            .as_deref(),
        Some("media_enc_hash_mismatch")
    );
    let state = peer.state().await;
    for request in state["requests"].as_array().unwrap() {
        assert_eq!(request["mms"], "md-msg-hist");
        assert_eq!(request["origin"], "https://web.whatsapp.com");
        assert_eq!(request["referer"], "https://web.whatsapp.com/");
        for field in ["authorization", "cookie", "version"] {
            assert_eq!(request[field], false, "{field}");
        }
    }
}
#[tokio::test]
async fn cancellation_withholds_a_download_waiting_for_its_authenticated_eof() {
    let peer = Peer::start();
    let options = peer.options();
    let token = options.media.cancellation.clone();
    let abort = async {
        tokio::time::timeout(Duration::from_secs(5), async {
            loop {
                if peer.state().await["waiting"] == 1 {
                    break;
                }
                tokio::task::yield_now().await;
            }
        })
        .await
        .unwrap();
        token.cancel();
    };
    let (result, ()) = tokio::join!(
        download_history_chunk(
            HistoryChunkInput::Descriptor(peer.descriptor("gate")),
            options
        ),
        abort
    );
    assert_eq!(code(result).as_deref(), Some("request_cancelled"));
}
