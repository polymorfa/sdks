#![cfg(feature = "storage-s3")]
use aws_sdk_s3::{
    config::{retry::RetryConfig, timeout::TimeoutConfig, BehaviorVersion, Credentials, Region},
    primitives::ByteStream,
    Client,
};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use futures_util::StreamExt as _;
use polymorfa_sdk::{
    direct_media::UploadLocation,
    media::{MediaDescriptor, MediaDownloadOptions, MediaKind},
    media_encrypt::UploadMediaType,
    media_upload_transport::{EncryptedUploadBody, MediaUploadTransport, UploadTransportFuture},
    s3::{S3ArchiveOptions, S3MediaStore, S3UploadOptions, S3WhatsAppEgress},
    ClientOptions, Credential, ErrorKind, MessagingClient,
};
use serde_json::Value;
use sha2::{Digest as _, Sha256};
use std::{io::BufRead, path::PathBuf, sync::Arc, time::Duration};
struct Peer {
    child: std::process::Child,
    ready: Value,
}
struct CustomerUpload;
impl MediaUploadTransport for CustomerUpload {
    fn name(&self) -> &str {
        "customer-s3"
    }
    fn upload<'a>(
        &'a self,
        _: &'a str,
        body: EncryptedUploadBody<'a>,
        _: tokio_util::sync::CancellationToken,
    ) -> UploadTransportFuture<'a> {
        Box::pin(async move {
            let mut source = body.open(0).await?;
            let mut bytes = Vec::new();
            while let Some(chunk) = source.next().await {
                bytes.extend_from_slice(&chunk?);
            }
            assert_eq!(body.encrypted_length(), bytes.len() as u64);
            assert_eq!(
                body.file_enc_sha256().as_slice(),
                Sha256::digest(bytes).as_slice()
            );
            Ok(UploadLocation {
                direct_path: "/customer.enc".into(),
                url: "https://mmg.whatsapp.net/customer.enc".into(),
                handle: None,
            })
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
        let address = format!("127.0.0.1:{}", self.ready["port"].as_u64().unwrap())
            .parse()
            .unwrap();
        let certificate = reqwest::Certificate::from_pem(
            &STANDARD
                .decode(self.ready["certificate"].as_str().unwrap())
                .unwrap(),
        )
        .unwrap();
        MediaDownloadOptions {
            configure_http: Some(Arc::new(move |b| {
                b.no_proxy()
                    .add_root_certificate(certificate.clone())
                    .resolve("mmg.whatsapp.net", address)
            })),
            ..Default::default()
        }
    }
    fn http(&self) -> reqwest::Client {
        (self.options().configure_http.unwrap())(reqwest::Client::builder())
            .build()
            .unwrap()
    }
    async fn get(&self, path: &str) -> Value {
        self.http()
            .get(format!("https://mmg.whatsapp.net{path}"))
            .send()
            .await
            .unwrap()
            .json()
            .await
            .unwrap()
    }
    async fn seen(&self, path: &str, count: usize) {
        tokio::time::timeout(Duration::from_secs(5), async {
            loop {
                let state = self.get("/state").await;
                let total = state["requests"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .filter(|r| {
                        url::Url::parse(&format!("https://fixture{}", r["path"].as_str().unwrap()))
                            .unwrap()
                            .path()
                            == path
                    })
                    .count();
                if total >= count {
                    return;
                }
                tokio::time::sleep(Duration::from_millis(10)).await;
            }
        })
        .await
        .unwrap();
    }
}
impl Drop for Peer {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
        let _ = std::fs::remove_dir_all(self.ready["directory"].as_str().unwrap());
    }
}
fn client(endpoint: &str) -> Client {
    Client::from_conf(
        aws_sdk_s3::Config::builder()
            .behavior_version(BehaviorVersion::latest())
            .credentials_provider(Credentials::new(
                std::env::var("POLYMORFA_MINIO_ACCESS_KEY").unwrap(),
                std::env::var("POLYMORFA_MINIO_SECRET_KEY").unwrap(),
                None,
                None,
                "native-fixture",
            ))
            .region(Region::new("us-east-1"))
            .endpoint_url(endpoint)
            .force_path_style(true)
            .retry_config(RetryConfig::disabled())
            .timeout_config(
                TimeoutConfig::builder()
                    .operation_timeout(Duration::from_secs(10))
                    .build(),
            )
            .build(),
    )
}
async fn seed(client: &Client, bucket: &str, key: &str, bytes: Vec<u8>) {
    client
        .put_object()
        .bucket(bucket)
        .key(key)
        .body(ByteStream::from(bytes))
        .content_type("application/octet-stream")
        .send()
        .await
        .unwrap();
}
async fn read(client: &Client, bucket: &str, key: &str) -> Vec<u8> {
    client
        .get_object()
        .bucket(bucket)
        .key(key)
        .send()
        .await
        .unwrap()
        .body
        .collect()
        .await
        .unwrap()
        .into_bytes()
        .to_vec()
}
fn descriptor(peer: &Peer) -> MediaDescriptor {
    let v = &peer.ready["archive"];
    let bytes = |name: &str| hex::decode(v[name].as_str().unwrap()).unwrap();
    MediaDescriptor {
        media_kind: MediaKind::Image,
        url: None,
        direct_path: Some("/archive.enc".into()),
        media_key: bytes("mediaKey").try_into().unwrap(),
        file_sha256: Some(bytes("fileSha256").try_into().unwrap()),
        file_enc_sha256: Some(bytes("fileEncSha256").try_into().unwrap()),
        file_length: Some(bytes("plaintext").len() as u64),
        mimetype: Some("image/jpeg".into()),
        file_name: Some("image 💎!.jpg".into()),
    }
}
fn options(peer: &Peer, scratch: &std::path::Path) -> S3ArchiveOptions {
    let mut options = S3ArchiveOptions::new("archive", scratch);
    options.download = peer.options();
    options
        .metadata
        .insert("WA-MEDIA-KIND".into(), "spoof".into());
    options.metadata.insert("custom".into(), "safe".into());
    options
}
#[tokio::test]
async fn actual_minio_official_driver_verified_spool_and_etag_pinned_uploads() {
    let Ok(endpoint) = std::env::var("POLYMORFA_MINIO_ENDPOINT") else {
        eprintln!(
            "SKIP actual MinIO: set independent endpoint/access key/secret fixture environment"
        );
        return;
    };
    let peer = Peer::start();
    let direct = client(&endpoint);
    let observed = client(&format!(
        "http://127.0.0.1:{}",
        peer.ready["s3Port"].as_u64().unwrap()
    ));
    let bucket = format!("native-rust-{}", uuid::Uuid::new_v4().simple());
    direct.create_bucket().bucket(&bucket).send().await.unwrap();
    let store = S3MediaStore::new(observed, &bucket, "media/").unwrap();
    let descriptor = descriptor(&peer);
    let plain = hex::decode(peer.ready["archive"]["plaintext"].as_str().unwrap()).unwrap();
    let scratch = PathBuf::from(std::env::var("HOME").unwrap())
        .join(".polymorfa-agent-work/zk-program-20261014/rust-s3-tests")
        .join(uuid::Uuid::new_v4().to_string());
    std::fs::create_dir_all(&scratch).unwrap();
    seed(&direct, &bucket, "media/archive", b"keep original".to_vec()).await;
    let mut gated_descriptor = descriptor.clone();
    gated_descriptor.direct_path = Some("/archive-gate.enc".into());
    let mut pending = Box::pin(store.archive(&gated_descriptor, options(&peer, &scratch)));
    tokio::select! {result=&mut pending=>{result.ok();panic!("Archive ended before terminal CDN byte");},_=peer.seen("/archive-gate.enc",1)=>{}}
    assert!(peer.get("/s3-state").await["requests"]
        .as_array()
        .unwrap()
        .is_empty());
    assert_eq!(
        read(&direct, &bucket, "media/archive").await,
        b"keep original"
    );
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt as _;
        let private = std::fs::read_dir(&scratch)
            .unwrap()
            .next()
            .unwrap()
            .unwrap()
            .path();
        assert_eq!(
            std::fs::metadata(&private).unwrap().permissions().mode() & 0o777,
            0o700
        );
        for file in std::fs::read_dir(private).unwrap() {
            assert_eq!(
                file.unwrap().metadata().unwrap().permissions().mode() & 0o777,
                0o600
            );
        }
    }
    peer.get("/release-archive").await;
    let archived = pending.await.unwrap();
    assert_eq!(archived.bytes, plain.len() as u64);
    assert_eq!(read(&direct, &bucket, "media/archive").await, plain);
    assert_eq!(std::fs::read_dir(&scratch).unwrap().count(), 0);
    let head = direct
        .head_object()
        .bucket(&bucket)
        .key("media/archive")
        .send()
        .await
        .unwrap();
    let metadata = head.metadata().unwrap();
    assert_eq!(metadata["wa-media-kind"], "image");
    assert_eq!(
        metadata["wa-file-sha256"],
        hex::encode(descriptor.file_sha256.unwrap())
    );
    assert_eq!(metadata["wa-file-name"], "image%20%F0%9F%92%8E!.jpg");
    assert!(metadata.keys().all(|key| !key.contains("media-key")));
    let puts = peer.get("/s3-state").await["requests"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|r| r["method"] == "PUT")
        .count();
    assert_eq!(puts, 1);
    for bad in ["cipher", "length", "metadata"] {
        let mut input = descriptor.clone();
        let mut archive = options(&peer, &scratch);
        match bad {
            "cipher" => input.direct_path = Some("/archive-bad.enc".into()),
            "length" => input.file_length = Some(plain.len() as u64 + 1),
            _ => {
                archive
                    .metadata
                    .insert("bad".into(), "header\r\ninjection".into());
            }
        }
        assert!(store.archive(&input, archive).await.is_err());
        assert_eq!(read(&direct, &bucket, "media/archive").await, plain);
        assert_eq!(std::fs::read_dir(&scratch).unwrap().count(), 0);
    }
    let cancelled = options(&peer, &scratch);
    cancelled.download.cancellation.cancel();
    assert_eq!(
        store
            .archive(&descriptor, cancelled)
            .await
            .err()
            .unwrap()
            .kind,
        ErrorKind::Cancelled
    );
    let cancelled = options(&peer, &scratch);
    let token = cancelled.download.cancellation.clone();
    let mut pending = Box::pin(store.archive(&gated_descriptor, cancelled));
    tokio::select! {result=&mut pending=>{result.ok();panic!("Cancelled archive ended before gate");},_=peer.seen("/archive-gate.enc",2)=>{}}
    token.cancel();
    assert_eq!(pending.await.err().unwrap().kind, ErrorKind::Cancelled);
    peer.get("/release-archive").await;
    assert_eq!(std::fs::read_dir(&scratch).unwrap().count(), 0);
    assert_eq!(
        peer.get("/s3-state").await["requests"]
            .as_array()
            .unwrap()
            .iter()
            .filter(|r| r["method"] == "PUT")
            .count(),
        puts
    );
    let messaging = MessagingClient::new(
        Credential::organization_api_key("pmfa_AgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA".to_string()).unwrap(),
        ClientOptions {
            base_url: format!(
                "http://127.0.0.1:{}",
                peer.ready["apiPort"].as_u64().unwrap()
            ),
            max_network_retries: 0,
            ..Default::default()
        },
    )
    .unwrap();
    let resource = messaging.whatsapp_media();
    let source = vec![42u8; 100];
    seed(&direct, &bucket, "media/source", source.clone()).await;
    let uploaded = store
        .upload_to_whatsapp(
            &resource,
            "s3-relay",
            S3UploadOptions::new("source", UploadMediaType::Document),
        )
        .await
        .unwrap();
    assert_eq!(uploaded.info.file_length, source.len() as u64);
    let state = peer.get("/s3-state").await;
    let reads = state["requests"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|r| r["method"] == "GET" && r["path"].as_str().unwrap().ends_with("/media/source"))
        .collect::<Vec<_>>();
    assert_eq!(reads.len(), 2);
    assert!(!reads[0]["ifMatch"].as_str().unwrap().is_empty());
    assert_eq!(reads[0]["ifMatch"], reads[1]["ifMatch"]);
    let mut upload = S3UploadOptions::new("source", UploadMediaType::Document);
    upload.egress = S3WhatsAppEgress::Direct;
    upload.direct.document_part_size = 32;
    upload.direct.configure_http = peer.options().configure_http;
    let uploaded = store
        .upload_to_whatsapp(&resource, "s3-direct", upload)
        .await
        .unwrap();
    assert_eq!(uploaded.info.file_length, 100);
    seed(&direct, &bucket, "media/custom-source", source.clone()).await;
    let api_count = peer.get("/state").await["requests"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|r| r["boundary"] == "api")
        .count();
    let custom = store
        .upload_to_whatsapp_with_transport(
            &resource,
            "customer-s3",
            S3UploadOptions::new("custom-source", UploadMediaType::Document),
            &CustomerUpload,
        )
        .await
        .unwrap();
    assert_eq!(custom.egress, "customer-s3");
    assert_eq!(custom.info.file_length, 100);
    let state = peer.get("/s3-state").await;
    let custom_reads = state["requests"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|r| {
            r["method"] == "GET"
                && r["path"]
                    .as_str()
                    .unwrap()
                    .ends_with("/media/custom-source")
        })
        .collect::<Vec<_>>();
    assert_eq!(custom_reads.len(), 2);
    assert_eq!(custom_reads[0]["ifMatch"], custom_reads[1]["ifMatch"]);
    assert_eq!(
        peer.get("/state").await["requests"]
            .as_array()
            .unwrap()
            .iter()
            .filter(|r| r["boundary"] == "api")
            .count(),
        api_count
    );
    seed(&direct, &bucket, "media/mutable", source).await;
    peer.get("/s3-arm-change?key=media/mutable").await;
    let mut pending = Box::pin(store.upload_to_whatsapp(
        &resource,
        "s3-changed",
        S3UploadOptions::new("mutable", UploadMediaType::Document),
    ));
    let ready = async {
        tokio::time::timeout(Duration::from_secs(5), async {
            while peer.get("/s3-state").await["pending"] != 1 {
                tokio::time::sleep(Duration::from_millis(10)).await;
            }
        })
        .await
        .unwrap();
    };
    tokio::select! {result=&mut pending=>{result.ok();panic!("Second conditional GET was not held");},_=ready=>{}}
    seed(&direct, &bucket, "media/mutable", vec![99u8; 100]).await;
    peer.get("/s3-release").await;
    let error = pending.await.err().unwrap();
    assert_eq!(error.code.as_deref(), Some("media_enc_hash_mismatch"));
    assert!(!error.to_string().contains("127.0.0.1"));
    let state = peer.get("/s3-state").await;
    for request in state["requests"].as_array().unwrap() {
        for field in ["bearer", "cookie", "origin", "version"] {
            assert_eq!(request[field], false);
        }
    }
    for request in peer.get("/state").await["requests"].as_array().unwrap() {
        if request["boundary"] == "cdn" {
            assert_eq!(request["authorization"], false);
            assert_eq!(request["cookie"], false);
        }
    }
    let objects = direct
        .list_objects_v2()
        .bucket(&bucket)
        .send()
        .await
        .unwrap();
    for object in objects.contents() {
        direct
            .delete_object()
            .bucket(&bucket)
            .key(object.key().unwrap())
            .send()
            .await
            .unwrap();
    }
    direct.delete_bucket().bucket(&bucket).send().await.unwrap();
    std::fs::remove_dir_all(scratch).unwrap();
    println!("PASS actual MinIO/official Rust S3 driver: private spool before PUT, integrity/length/cancel barriers, safe metadata, two If-Match source reads, changed-object rejection and ciphertext-only relay/direct multipart");
}

#[tokio::test]
async fn invalid_keys_metadata_and_cancellation_fail_before_any_customer_request() {
    let offline = Client::from_conf(
        aws_sdk_s3::Config::builder()
            .behavior_version(BehaviorVersion::latest())
            .credentials_provider(Credentials::new(
                "synthetic-test-access",
                "synthetic-test-secret",
                None,
                None,
                "offline-fixture",
            ))
            .region(Region::new("us-east-1"))
            .endpoint_url("http://127.0.0.1:9")
            .force_path_style(true)
            .retry_config(RetryConfig::disabled())
            .build(),
    );
    assert!(S3MediaStore::new(offline.clone(), "", "").is_err());
    assert!(S3MediaStore::new(offline.clone(), "bucket", "bad\0").is_err());
    let store = S3MediaStore::new(offline, "bucket", "").unwrap();
    let descriptor = MediaDescriptor {
        media_kind: MediaKind::Image,
        url: None,
        direct_path: Some("/never.enc".into()),
        media_key: [0; 32],
        file_sha256: Some([0; 32]),
        file_enc_sha256: Some([0; 32]),
        file_length: Some(0),
        mimetype: None,
        file_name: None,
    };
    for key in [String::new(), "bad\0".into(), "💎".repeat(257)] {
        assert_eq!(
            store
                .archive(&descriptor, S3ArchiveOptions::new(key, "."))
                .await
                .err()
                .unwrap()
                .kind,
            ErrorKind::Configuration
        );
    }
    let mut invalid = S3ArchiveOptions::new("key", ".");
    invalid
        .metadata
        .insert("unsafe".into(), "header\r\ninjection".into());
    assert_eq!(
        store
            .archive(&descriptor, invalid)
            .await
            .err()
            .unwrap()
            .kind,
        ErrorKind::Configuration
    );
    let mut invalid = S3ArchiveOptions::new("key", ".");
    invalid.metadata.insert("large".into(), "x".repeat(2048));
    assert_eq!(
        store
            .archive(&descriptor, invalid)
            .await
            .err()
            .unwrap()
            .kind,
        ErrorKind::Configuration
    );
    let invalid = polymorfa_sdk::media::WhatsAppMediaInput::Message(
        polymorfa_sdk::media::WhatsAppMediaMessage {
            message_type: "image".into(),
            media: Some("not base64".into()),
        },
    );
    assert!(store
        .archive_input(&invalid, S3ArchiveOptions::new("key", "."))
        .await
        .is_err());
    let cancelled = S3ArchiveOptions::new("key", ".");
    cancelled.download.cancellation.cancel();
    assert_eq!(
        store
            .archive(&descriptor, cancelled)
            .await
            .err()
            .unwrap()
            .kind,
        ErrorKind::Cancelled
    );
    let messaging = MessagingClient::new(
        Credential::organization_api_key("pmfa_AgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA".to_string()).unwrap(),
        ClientOptions::default(),
    )
    .unwrap();
    let resource = messaging.whatsapp_media();
    let mut invalid = S3UploadOptions::new("key", UploadMediaType::Image);
    invalid.encryption.max_bytes = 0;
    assert_eq!(
        store
            .upload_to_whatsapp(&resource, "session", invalid)
            .await
            .err()
            .unwrap()
            .kind,
        ErrorKind::Configuration
    );
    for source in 0..3 {
        let mut cancelled = S3UploadOptions::new("key", UploadMediaType::Image);
        match source {
            0 => cancelled.encryption.cancellation.cancel(),
            1 => {
                let token = tokio_util::sync::CancellationToken::new();
                token.cancel();
                cancelled.request.cancellation = Some(token);
            }
            _ => cancelled.direct.cancellation.cancel(),
        };
        assert_eq!(
            store
                .upload_to_whatsapp(&resource, "session", cancelled)
                .await
                .err()
                .unwrap()
                .kind,
            ErrorKind::Cancelled
        );
    }
}
