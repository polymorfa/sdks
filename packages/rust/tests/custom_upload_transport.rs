use bytes::Bytes;
use futures_util::{stream, StreamExt as _};
use polymorfa_sdk::{
    direct_media::UploadLocation,
    media_encrypt::{encrypt_media, MediaEncryptionOptions, UploadMediaType},
    media_upload::{MediaSource, SourceFactory},
    media_upload_transport::*,
    Error, ErrorKind,
};
use sha2::{Digest as _, Sha256};
use std::sync::{
    atomic::{AtomicBool, AtomicUsize, Ordering},
    Arc,
};
use tokio_util::sync::CancellationToken;
struct Capture {
    name: String,
    expected: Vec<u8>,
    calls: AtomicUsize,
    emitted: AtomicUsize,
    committed: AtomicBool,
}
impl Capture {
    fn new(expected: Vec<u8>) -> Self {
        Self {
            name: format!("customer-{}", uuid::Uuid::new_v4()),
            expected,
            calls: AtomicUsize::new(0),
            emitted: AtomicUsize::new(0),
            committed: AtomicBool::new(false),
        }
    }
}
impl MediaUploadTransport for Capture {
    fn name(&self) -> &str {
        &self.name
    }
    fn upload<'a>(
        &'a self,
        session: &'a str,
        body: EncryptedUploadBody<'a>,
        _: CancellationToken,
    ) -> UploadTransportFuture<'a> {
        Box::pin(async move {
            assert_eq!(session, "session");
            self.calls.fetch_add(1, Ordering::SeqCst);
            assert_eq!(body.media_type(), UploadMediaType::Document);
            assert_eq!(body.encrypted_length(), self.expected.len() as u64);
            assert_eq!(
                body.file_enc_sha256().as_slice(),
                Sha256::digest(&self.expected).as_slice()
            );
            let mut source = body.open(0).await?;
            let mut ciphertext = Vec::new();
            while let Some(chunk) = source.next().await {
                let chunk = chunk?;
                self.emitted.fetch_add(chunk.len(), Ordering::SeqCst);
                ciphertext.extend_from_slice(&chunk);
            }
            assert_eq!(ciphertext, self.expected);
            let mut tail = body.open(7).await?;
            let mut bytes = Vec::new();
            while let Some(chunk) = tail.next().await {
                bytes.extend_from_slice(&chunk?);
            }
            assert_eq!(bytes, ciphertext[7..]);
            self.committed.store(true, Ordering::SeqCst);
            Ok(UploadLocation {
                direct_path: "/custom.enc".into(),
                url: "https://mmg.whatsapp.net/custom.enc".into(),
                handle: None,
            })
        })
    }
}
fn options() -> MediaEncryptionOptions {
    let mut options = MediaEncryptionOptions::new(UploadMediaType::Document);
    options.media_key = Some([7; 32]);
    options
}
#[tokio::test]
async fn custom_transport_gets_verified_ciphertext_metadata_offsets_and_dynamic_egress() {
    let plaintext = b"private customer media".to_vec();
    let expected = encrypt_media(&plaintext, options()).await.unwrap();
    let capture = Capture::new(expected.ciphertext.clone());
    let result = upload_with_transport(
        "session",
        MediaSource::Bytes(plaintext.clone()),
        options(),
        &capture,
    )
    .await
    .unwrap();
    assert_eq!(result.egress, capture.name);
    assert_eq!(result.info.media_key, [7; 32]);
    assert_eq!(
        result.info.file_sha256.as_slice(),
        Sha256::digest(plaintext).as_slice()
    );
    assert!(capture.committed.load(Ordering::SeqCst));
    assert_eq!(capture.calls.load(Ordering::SeqCst), 1);
}
#[tokio::test]
async fn changed_second_pass_never_reaches_custom_finalization() {
    let first = vec![1; 80];
    let expected = encrypt_media(&first, options()).await.unwrap();
    let capture = Capture::new(expected.ciphertext);
    let opens = Arc::new(AtomicUsize::new(0));
    let factory: SourceFactory = Arc::new(move || {
        let value = if opens.fetch_add(1, Ordering::SeqCst) == 0 {
            1
        } else {
            2
        };
        Box::pin(
            async move { Ok(Box::pin(stream::iter(vec![Ok(Bytes::from(vec![value; 80]))])) as _) },
        )
    });
    let error = upload_with_transport("session", MediaSource::Reopen(factory), options(), &capture)
        .await
        .err()
        .unwrap();
    assert_eq!(error.code.as_deref(), Some("media_enc_hash_mismatch"));
    assert!(!capture.committed.load(Ordering::SeqCst));
    assert!(capture.emitted.load(Ordering::SeqCst) < capture.expected.len());
}
struct Failure;
impl MediaUploadTransport for Failure {
    fn name(&self) -> &str {
        "failure"
    }
    fn upload<'a>(
        &'a self,
        _: &'a str,
        _: EncryptedUploadBody<'a>,
        _: CancellationToken,
    ) -> UploadTransportFuture<'a> {
        Box::pin(async {
            Err(Error::new(
                ErrorKind::Conflict,
                "Caller transport refused the upload.",
                "custom_transport_refused",
            ))
        })
    }
}
#[tokio::test]
async fn custom_errors_and_preabort_are_preserved_without_opening_a_source() {
    let error = upload_with_transport("session", MediaSource::Bytes(vec![1]), options(), &Failure)
        .await
        .err()
        .unwrap();
    assert_eq!(error.code.as_deref(), Some("custom_transport_refused"));
    let mut cancelled = options();
    cancelled.cancellation.cancel();
    let factory: SourceFactory = Arc::new(|| panic!("Cancelled upload opened plaintext"));
    let error = upload_with_transport(
        "session",
        MediaSource::Reopen(factory),
        cancelled.clone(),
        &Failure,
    )
    .await
    .err()
    .unwrap();
    assert_eq!(error.kind, ErrorKind::Cancelled);
    cancelled.cancellation = CancellationToken::new();
    let factory: SourceFactory = Arc::new(|| panic!("Invalid upload opened plaintext"));
    assert_eq!(
        upload_with_transport("", MediaSource::Reopen(factory), cancelled, &Failure)
            .await
            .err()
            .unwrap()
            .kind,
        ErrorKind::Configuration
    );
}
struct Pending {
    started: tokio::sync::Notify,
    dropped: Arc<AtomicBool>,
}
struct OnDrop(Arc<AtomicBool>);
impl Drop for OnDrop {
    fn drop(&mut self) {
        self.0.store(true, Ordering::SeqCst);
    }
}
impl MediaUploadTransport for Pending {
    fn name(&self) -> &str {
        "pending"
    }
    fn upload<'a>(
        &'a self,
        _: &'a str,
        _: EncryptedUploadBody<'a>,
        _: CancellationToken,
    ) -> UploadTransportFuture<'a> {
        Box::pin(async move {
            let _guard = OnDrop(self.dropped.clone());
            self.started.notify_one();
            std::future::pending().await
        })
    }
}
#[tokio::test]
async fn cancellation_drops_the_inflight_custom_upload() {
    let transport = Arc::new(Pending {
        started: tokio::sync::Notify::new(),
        dropped: Arc::new(AtomicBool::new(false)),
    });
    let settings = options();
    let stop = settings.cancellation.clone();
    let upload_transport = transport.clone();
    let work = tokio::spawn(async move {
        upload_with_transport(
            "session",
            MediaSource::Bytes(vec![1]),
            settings,
            upload_transport.as_ref(),
        )
        .await
    });
    tokio::time::timeout(
        std::time::Duration::from_secs(2),
        transport.started.notified(),
    )
    .await
    .unwrap();
    stop.cancel();
    assert_eq!(
        work.await.unwrap().err().unwrap().kind,
        ErrorKind::Cancelled
    );
    assert!(transport.dropped.load(Ordering::SeqCst));
}
