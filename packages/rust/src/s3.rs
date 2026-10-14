//! Customer-owned S3 media bridge. The caller configures a separate official AWS SDK client.
//! Media and object locations deliberately omit Debug. No Polymorfa credential enters storage.
use crate::{
    direct_media::WhatsAppMediaResource,
    media::{MediaDescriptor, MediaDownloadOptions, MediaKind, WhatsAppMediaInput},
    media_encrypt::{MediaEncryptionOptions, MediaInputStream, UploadMediaType},
    media_stream::MediaVerifyMode,
    media_upload::{DirectUploadOptions, MediaSource, MediaUploadResult, SourceFactory},
    Error, ErrorKind, RequestOptions, Result,
};
use aws_sdk_s3::{primitives::ByteStream, Client};
use std::{collections::BTreeMap, future::Future, path::PathBuf, sync::Arc};
use tokio::io::AsyncReadExt as _;
use tokio_util::sync::CancellationToken;

pub const SOURCE_SDK_COMMIT: &str = "254fc6a2d073e7fc79420cf95f9b03927d00c04a";

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum S3WhatsAppEgress {
    #[default]
    Relay,
    Direct,
}
pub struct S3UploadOptions {
    pub key: String,
    pub encryption: MediaEncryptionOptions,
    pub egress: S3WhatsAppEgress,
    pub direct: DirectUploadOptions,
    pub request: RequestOptions,
}
impl S3UploadOptions {
    pub fn new(key: impl Into<String>, media_type: UploadMediaType) -> Self {
        Self {
            key: key.into(),
            encryption: MediaEncryptionOptions::new(media_type),
            egress: S3WhatsAppEgress::Relay,
            direct: DirectUploadOptions::default(),
            request: RequestOptions::default(),
        }
    }
}
pub struct S3ArchiveOptions {
    pub key: String,
    /// Caller-selected private spool parent. The helper removes only its own child directory.
    pub scratch_directory: PathBuf,
    pub metadata: BTreeMap<String, String>,
    pub download: MediaDownloadOptions,
}
impl S3ArchiveOptions {
    pub fn new(key: impl Into<String>, scratch_directory: impl Into<PathBuf>) -> Self {
        Self {
            key: key.into(),
            scratch_directory: scratch_directory.into(),
            metadata: BTreeMap::new(),
            download: MediaDownloadOptions::default(),
        }
    }
}
pub struct S3ArchiveResult {
    pub bucket: String,
    pub key: String,
    pub bytes: u64,
    pub mimetype: String,
    pub etag: Option<String>,
}
#[derive(Clone)]
pub struct S3MediaStore {
    client: Client,
    bucket: String,
    prefix: String,
}
impl S3MediaStore {
    /// Borrows a cheap clone of the caller's independently configured S3 client.
    /// Configure customer credentials, endpoint/TLS trust, retries and operation deadlines there.
    pub fn new(
        client: Client,
        bucket: impl Into<String>,
        prefix: impl Into<String>,
    ) -> Result<Self> {
        let bucket = bucket.into();
        let prefix = prefix.into();
        if bucket.is_empty()
            || !bucket.bytes().all(|c| (b'!'..=b'~').contains(&c))
            || prefix.contains('\0')
        {
            return Err(configuration());
        }
        Ok(Self {
            client,
            bucket,
            prefix,
        })
    }
    fn key(&self, key: &str) -> Result<String> {
        if key.is_empty()
            || key.contains('\0')
            || self.prefix.len().saturating_add(key.len()) > 1024
        {
            return Err(configuration());
        }
        Ok(format!("{}{key}", self.prefix))
    }
    /// Accepts a decoded descriptor or the media/type fields from an inbound message.
    pub async fn archive_input(
        &self,
        input: &WhatsAppMediaInput,
        options: S3ArchiveOptions,
    ) -> Result<S3ArchiveResult> {
        self.archive(&input.descriptor()?, options).await
    }
    /// Verifies a bounded private disk spool completely before the first object PUT.
    pub async fn archive(
        &self,
        descriptor: &MediaDescriptor,
        mut options: S3ArchiveOptions,
    ) -> Result<S3ArchiveResult> {
        let key = self.key(&options.key)?;
        let metadata = metadata(descriptor, options.metadata)?;
        if options.scratch_directory.as_os_str().is_empty() {
            return Err(configuration());
        }
        let cancellation = options.download.cancellation.clone();
        if cancellation.is_cancelled() {
            return Err(crate::transport::cancelled());
        }
        let directory = Spool::create(&options.scratch_directory)?;
        let path = directory.0.join("verified");
        // Streaming plaintext remains private until terminal MAC/hash/padding verification.
        options.download.verify = MediaVerifyMode::Streaming;
        let downloaded = crate::media::download_stream(descriptor, options.download).await?;
        let mimetype = downloaded.mimetype.clone();
        downloaded
            .write_to_file(&path, cancellation.clone())
            .await?;
        let bytes = tokio::fs::metadata(&path)
            .await
            .map_err(|_| storage_failure())?
            .len();
        if descriptor
            .file_length
            .is_some_and(|expected| expected != bytes)
        {
            return Err(Error::local(
                ErrorKind::MediaIntegrity,
                "The media length does not match its descriptor.",
                "media_invalid_descriptor",
            ));
        }
        let length = i64::try_from(bytes).map_err(|_| configuration())?;
        let body = ByteStream::from_path(&path)
            .await
            .map_err(|_| storage_failure())?;
        let request = self
            .client
            .put_object()
            .bucket(&self.bucket)
            .key(&key)
            .body(body)
            .content_length(length)
            .content_type(&mimetype)
            .set_metadata(Some(metadata.into_iter().collect()))
            .send();
        let response = cancel(&cancellation, request)
            .await?
            .map_err(|_| storage_failure())?;
        Ok(S3ArchiveResult {
            bucket: self.bucket.clone(),
            key,
            bytes,
            mimetype,
            etag: response.e_tag().map(str::to_owned),
        })
    }
    /// Hashes and uploads through two streaming GETs with the same If-Match ETag.
    /// The native uploader verifies the second complete encrypted hash before final bytes.
    pub async fn upload_to_whatsapp(
        &self,
        messaging: &WhatsAppMediaResource<'_>,
        session: &str,
        mut options: S3UploadOptions,
    ) -> Result<MediaUploadResult> {
        let key = self.key(&options.key)?;
        if options.encryption.max_bytes == 0 {
            return Err(configuration());
        }
        let cancellations = Arc::new(vec![
            options.encryption.cancellation.clone(),
            options.request.cancellation.clone().unwrap_or_default(),
            options.direct.cancellation.clone(),
        ]);
        let head = cancel_any(
            &cancellations,
            self.client
                .head_object()
                .bucket(&self.bucket)
                .key(&key)
                .send(),
        )
        .await?
        .map_err(|_| storage_failure())?;
        let etag = head
            .e_tag()
            .filter(|tag| {
                !tag.is_empty()
                    && tag.len() <= 1024
                    && tag.bytes().all(|c| (b' '..=b'~').contains(&c))
            })
            .ok_or_else(|| {
                Error::local(
                    ErrorKind::Connection,
                    "The customer object requires a stable ETag.",
                    "customer_storage_error",
                )
            })?
            .to_owned();
        let length = head
            .content_length()
            .and_then(|n| u64::try_from(n).ok())
            .ok_or_else(storage_failure)?;
        if length > options.encryption.max_bytes as u64 {
            return Err(Error::local(
                ErrorKind::MediaIntegrity,
                "Media exceeds its permitted size.",
                "media_too_large",
            ));
        }
        if options.encryption.mimetype.is_none() {
            options.encryption.mimetype = head.content_type().map(str::to_owned);
        }
        let factory = self.source(key, etag, length, cancellations.clone());
        let upload = async {
            match options.egress {
                S3WhatsAppEgress::Relay => {
                    messaging
                        .upload_relay(
                            session,
                            MediaSource::Reopen(factory),
                            options.encryption,
                            options.request,
                        )
                        .await
                }
                S3WhatsAppEgress::Direct => {
                    messaging
                        .upload_direct(
                            session,
                            MediaSource::Reopen(factory),
                            options.encryption,
                            options.direct,
                            options.request,
                        )
                        .await
                }
            }
        };
        cancel_any(&cancellations, upload).await?
    }
    fn source(
        &self,
        key: String,
        etag: String,
        length: u64,
        cancellations: Arc<Vec<CancellationToken>>,
    ) -> SourceFactory {
        let client = self.client.clone();
        let bucket = self.bucket.clone();
        Arc::new(move || {
            let client = client.clone();
            let bucket = bucket.clone();
            let key = key.clone();
            let etag = etag.clone();
            let cancellations = cancellations.clone();
            Box::pin(async move {
                let response = cancel_any(
                    &cancellations,
                    client
                        .get_object()
                        .bucket(bucket)
                        .key(key)
                        .if_match(&etag)
                        .send(),
                )
                .await?
                .map_err(|error| {
                    if error
                        .raw_response()
                        .is_some_and(|response| response.status().as_u16() == 412)
                    {
                        changed()
                    } else {
                        storage_failure()
                    }
                })?;
                if response.e_tag() != Some(etag.as_str())
                    || response
                        .content_length()
                        .and_then(|n| u64::try_from(n).ok())
                        != Some(length)
                {
                    return Err(changed());
                }
                let mut reader = response.body.into_async_read();
                Ok(Box::pin(async_stream::try_stream! {
                    let mut count=0u64;let mut buffer=vec![0u8;64*1024];
                    loop {let read=cancel_any(&cancellations,reader.read(&mut buffer)).await?.map_err(|_|storage_failure())?;
                        if read==0 {if count!=length {Err(changed())?;} break;}
                        count=count.checked_add(read as u64).ok_or_else(changed)?;if count>length {Err(changed())?;}
                        yield bytes::Bytes::copy_from_slice(&buffer[..read]);
                    }
                }) as MediaInputStream)
            })
        })
    }
}
fn metadata(
    descriptor: &MediaDescriptor,
    input: BTreeMap<String, String>,
) -> Result<BTreeMap<String, String>> {
    let mut output = BTreeMap::new();
    for (key, value) in input {
        if key.is_empty()
            || key.len() > 128
            || !key
                .bytes()
                .all(|c| c.is_ascii_alphanumeric() || matches!(c, b'-' | b'_' | b'.'))
            || !value.bytes().all(|c| (b' '..=b'~').contains(&c))
        {
            return Err(configuration());
        }
        output.insert(key.to_ascii_lowercase(), value);
    }
    output.insert(
        "wa-media-kind".into(),
        match descriptor.media_kind {
            MediaKind::Image => "image",
            MediaKind::Video => "video",
            MediaKind::Audio => "audio",
            MediaKind::Document => "document",
            MediaKind::Sticker => "sticker",
        }
        .into(),
    );
    if let Some(sha) = descriptor.file_sha256 {
        output.insert("wa-file-sha256".into(), hex::encode(sha));
    }
    if let Some(name) = &descriptor.file_name {
        output.insert("wa-file-name".into(), component(name));
    }
    if output.iter().map(|(k, v)| k.len() + v.len()).sum::<usize>() > 2048 {
        return Err(configuration());
    }
    Ok(output)
}
fn component(value: &str) -> String {
    const ALLOWED: &percent_encoding::AsciiSet = &percent_encoding::NON_ALPHANUMERIC
        .remove(b'-')
        .remove(b'_')
        .remove(b'.')
        .remove(b'!')
        .remove(b'~')
        .remove(b'*')
        .remove(b'\'')
        .remove(b'(')
        .remove(b')');
    percent_encoding::utf8_percent_encode(value, ALLOWED).to_string()
}
struct Spool(PathBuf);
impl Spool {
    fn create(parent: &std::path::Path) -> Result<Self> {
        let path = parent.join(format!("polymorfa-media-{}", uuid::Uuid::new_v4()));
        let mut builder = std::fs::DirBuilder::new();
        #[cfg(unix)]
        {
            use std::os::unix::fs::DirBuilderExt as _;
            builder.mode(0o700);
        }
        builder.create(&path).map_err(|_| storage_failure())?;
        Ok(Self(path))
    }
}
impl Drop for Spool {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}
async fn cancel<F: Future>(token: &CancellationToken, future: F) -> Result<F::Output> {
    tokio::select! {biased;_=token.cancelled()=>Err(crate::transport::cancelled()),result=future=>Ok(result)}
}
async fn cancelled_any(tokens: &[CancellationToken]) {
    let futures = tokens.iter().map(|token| Box::pin(token.cancelled()));
    futures_util::future::select_all(futures).await;
}
async fn cancel_any<F: Future>(tokens: &[CancellationToken], future: F) -> Result<F::Output> {
    tokio::select! {biased;_=cancelled_any(tokens)=>Err(crate::transport::cancelled()),result=future=>Ok(result)}
}
fn configuration() -> Error {
    Error::local(
        ErrorKind::Configuration,
        "Invalid customer S3 media options.",
        "configuration_error",
    )
}
fn changed() -> Error {
    Error::local(
        ErrorKind::MediaIntegrity,
        "The customer object changed between hashing and upload.",
        "media_enc_hash_mismatch",
    )
}
fn storage_failure() -> Error {
    Error::local(
        ErrorKind::Connection,
        "Customer media storage request failed; an upload outcome may be uncertain.",
        "customer_storage_error",
    )
}
