//! Ciphertext-only relay/direct upload. Two-pass sources release their last bytes only after EOF/hash verification.
use crate::{
    direct_media::{UploadGrant, UploadLocation, WhatsAppMediaResource},
    media_encrypt::*,
    Error, ErrorKind, RequestOptions, Result,
};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use futures_util::StreamExt as _;
use std::{
    future::Future,
    pin::Pin,
    sync::{Arc, Mutex},
    time::Duration,
};
use subtle::ConstantTimeEq as _;
use tokio_util::sync::CancellationToken;
pub type SourceFactory =
    Arc<dyn Fn() -> Pin<Box<dyn Future<Output = Result<MediaInputStream>> + Send>> + Send + Sync>;
pub enum MediaSource {
    Bytes(Vec<u8>),
    Stream(MediaInputStream),
    Reopen(SourceFactory),
}
pub struct PreparedUpload {
    pub info: EncryptedMediaInfo,
    source: PreparedSource,
}
enum PreparedSource {
    Bytes(bytes::Bytes),
    Reopen(SourceFactory, MediaEncryptionOptions),
}
impl PreparedUpload {
    pub async fn open(&self, offset: u64) -> Result<MediaInputStream> {
        if offset > self.info.encrypted_length {
            return Err(configuration("offset"));
        }
        let source = match &self.source {
            PreparedSource::Bytes(bytes) => {
                return Ok(Box::pin(futures_util::stream::iter([Ok(
                    bytes.slice(offset as usize..)
                )])))
            }
            PreparedSource::Reopen(factory, options) => {
                encrypt_media_stream(factory().await?, options.clone())?
            }
        };
        let expected = self.info.clone();
        Ok(Box::pin(async_stream::try_stream! {
            let mut body=source.body;let mut pending:Option<bytes::Bytes>=None;let mut count=0u64;let mut remaining=offset;
            while let Some(chunk)=body.next().await {let chunk=chunk?;count=count.checked_add(chunk.len()as u64).ok_or_else(changed)?;if count>expected.encrypted_length{return_if_changed()?;}
                if let Some(previous)=pending.replace(chunk) {if remaining>=previous.len()as u64 {remaining-=previous.len()as u64;}else{let part=previous.slice(remaining as usize..);remaining=0;if !part.is_empty(){yield part;}}}
            }
            let actual=source.info.await.map_err(|_|changed())??;
            if count!=expected.encrypted_length||actual.file_enc_sha256.ct_eq(&expected.file_enc_sha256).unwrap_u8()!=1{return_if_changed()?;}
            if let Some(last)=pending {if remaining<last.len()as u64 {yield last.slice(remaining as usize..);}}
        }))
    }
}
fn watch(stream: MediaInputStream) -> (MediaInputStream, Arc<Mutex<Option<Error>>>) {
    let error = Arc::new(Mutex::new(None));
    let store = error.clone();
    let watched = stream.map(move |result| {
        if let Err(failure) = &result {
            let safe = match failure.code.as_deref() {
                Some("media_enc_hash_mismatch") => changed(),
                Some("media_too_large") => Error::local(
                    ErrorKind::MediaIntegrity,
                    "Media exceeds its permitted size.",
                    "media_too_large",
                ),
                _ if failure.kind == ErrorKind::Cancelled => crate::transport::cancelled(),
                _ => Error::local(
                    ErrorKind::Connection,
                    "Cannot read the media source.",
                    "connection_error",
                ),
            };
            *store.lock().unwrap() = Some(safe);
        }
        result
    });
    (Box::pin(watched), error)
}
fn return_if_changed() -> Result<()> {
    Err(changed())
}
fn changed() -> Error {
    Error::local(
        ErrorKind::MediaIntegrity,
        "The media source changed between hashing and upload.",
        "media_enc_hash_mismatch",
    )
}
fn configuration(field: &str) -> Error {
    crate::transport::configuration(field)
}
pub async fn prepare_upload(
    source: MediaSource,
    mut options: MediaEncryptionOptions,
) -> Result<PreparedUpload> {
    match source {
        MediaSource::Reopen(factory) => {
            options.media_key.get_or_insert_with(generate_media_key);
            let first = encrypt_media_stream(factory().await?, options.clone())?;
            let mut body = first.body;
            while let Some(chunk) = body.next().await {
                chunk?;
            }
            let info = first.info.await.map_err(|_| changed())??;
            Ok(PreparedUpload {
                info,
                source: PreparedSource::Reopen(factory, options),
            })
        }
        MediaSource::Bytes(bytes) => {
            let encrypted = encrypt_media(&bytes, options).await?;
            Ok(PreparedUpload {
                info: encrypted.info,
                source: PreparedSource::Bytes(encrypted.ciphertext.into()),
            })
        }
        MediaSource::Stream(stream) => {
            let encrypted = encrypt_media_stream(stream, options)?;
            let mut body = encrypted.body;
            let mut bytes = Vec::new();
            while let Some(chunk) = body.next().await {
                bytes.extend_from_slice(&chunk?);
            }
            let info = encrypted.info.await.map_err(|_| changed())??;
            Ok(PreparedUpload {
                info,
                source: PreparedSource::Bytes(bytes.into()),
            })
        }
    }
}
#[derive(Clone)]
pub struct DirectUploadOptions {
    pub max_attempts: usize,
    pub document_part_size: u64,
    pub timeout: Duration,
    pub cancellation: CancellationToken,
    pub configure_http:
        Option<Arc<dyn Fn(reqwest::ClientBuilder) -> reqwest::ClientBuilder + Send + Sync>>,
}
impl Default for DirectUploadOptions {
    fn default() -> Self {
        Self {
            max_attempts: 3,
            document_part_size: 50 * 1024 * 1024,
            timeout: Duration::from_secs(30),
            cancellation: CancellationToken::new(),
            configure_http: None,
        }
    }
}
pub struct MediaUploadResult {
    pub info: EncryptedMediaInfo,
    pub location: UploadLocation,
    pub egress: String,
}
impl WhatsAppMediaResource<'_> {
    pub async fn upload_relay(
        &self,
        session: &str,
        source: MediaSource,
        options: MediaEncryptionOptions,
        request: RequestOptions,
    ) -> Result<MediaUploadResult> {
        let cancellation = request.cancellation.clone().unwrap_or_default();
        let prepared = tokio::select! {biased;_=cancellation.cancelled()=>return Err(crate::transport::cancelled()),p=prepare_upload(source,options)=>p?};
        let location = self
            .upload_relay_prepared(session, &prepared, request)
            .await?;
        Ok(MediaUploadResult {
            info: prepared.info,
            location,
            egress: "relay".into(),
        })
    }
    pub(crate) async fn upload_relay_prepared(
        &self,
        session: &str,
        prepared: &PreparedUpload,
        request: RequestOptions,
    ) -> Result<UploadLocation> {
        let (body, failure) = watch(prepared.open(0).await?);
        let location = self
            .relay_upload(
                session,
                prepared.info.media_type,
                &prepared.info.file_enc_sha256,
                reqwest::Body::wrap_stream(body),
                prepared.info.encrypted_length,
                request,
            )
            .await;
        if let Some(error) = failure.lock().unwrap().take() {
            return Err(error);
        }
        location
    }
    pub async fn upload_direct(
        &self,
        session: &str,
        source: MediaSource,
        options: MediaEncryptionOptions,
        direct: DirectUploadOptions,
        request: RequestOptions,
    ) -> Result<MediaUploadResult> {
        self.0.server()?;
        if direct.max_attempts == 0 || direct.document_part_size == 0 || direct.timeout.is_zero() {
            return Err(configuration("directUpload"));
        }
        let prepared = tokio::select! {biased;_=direct.cancellation.cancelled()=>return Err(crate::transport::cancelled()),p=prepare_upload(source,options)=>p?};
        let location = self
            .upload_direct_prepared(session, &prepared, direct, request)
            .await?;
        Ok(MediaUploadResult {
            info: prepared.info,
            location,
            egress: "direct".into(),
        })
    }
    pub(crate) async fn upload_direct_prepared(
        &self,
        session: &str,
        prepared: &PreparedUpload,
        direct: DirectUploadOptions,
        request: RequestOptions,
    ) -> Result<UploadLocation> {
        self.0.server()?;
        if direct.max_attempts == 0 || direct.document_part_size == 0 || direct.timeout.is_zero() {
            return Err(configuration("directUpload"));
        }
        let mut builder = reqwest::Client::builder()
            .timeout(direct.timeout)
            .referer(false);
        if let Some(configure) = &direct.configure_http {
            builder = configure(builder);
        }
        // The storage client has its own trust/proxy settings and never inherits API headers or cookies.
        let client = builder
            .default_headers(reqwest::header::HeaderMap::new())
            .referer(false)
            .timeout(direct.timeout)
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .map_err(|_| configuration("directUploadHttp"))?;
        let mut grant = self
            .create_upload_grant(
                session,
                prepared.info.media_type,
                &prepared.info.file_enc_sha256,
                request.clone(),
            )
            .await?;
        let total = prepared.info.encrypted_length;
        let location = if prepared.info.media_type == UploadMediaType::Document
            && total > direct.document_part_size
        {
            let mut position = 0;
            let mut reader = UploadReader::new(prepared, 0).await?;
            while position < total {
                let end = position
                    .saturating_add(direct.document_part_size)
                    .min(total);
                let mut final_error = None;
                for attempt in 0..direct.max_attempts {
                    if attempt > 0 {
                        reader = UploadReader::new(prepared, position).await?;
                        if final_error
                            .as_ref()
                            .is_some_and(|e: &AttemptError| e.status == Some(401))
                        {
                            grant = self
                                .create_upload_grant(
                                    session,
                                    prepared.info.media_type,
                                    &prepared.info.file_enc_sha256,
                                    request.clone(),
                                )
                                .await?;
                        }
                    }
                    let url = upload_url(
                        &grant,
                        prepared,
                        &[
                            ("stream", "1".into()),
                            ("bytestart", position.to_string()),
                            ("byteend", end.to_string()),
                        ],
                    )?;
                    let body = reader.part(end - position).await;
                    match post(&client, url, Some(body), end - position, &direct).await {
                        Ok(_) => {
                            final_error = None;
                            break;
                        }
                        Err(e) => {
                            if !e.retryable {
                                return Err(e.error);
                            }
                            final_error = Some(e);
                        }
                    }
                }
                if let Some(error) = final_error {
                    return Err(error.error);
                }
                position = end;
            }
            // Every final byte has been gated on complete second-pass validation before this call.
            retry_post(
                self,
                session,
                prepared,
                &mut grant,
                &client,
                &direct,
                &request,
                &[
                    ("stream", "1".into()),
                    (
                        "final_hash",
                        URL_SAFE_NO_PAD.encode(prepared.info.file_enc_sha256),
                    ),
                ],
                None,
            )
            .await?
            .ok_or_else(invalid_location)
            .and_then(parse_location)?
        } else {
            let mut final_error = None;
            let mut outcome = None;
            for attempt in 0..direct.max_attempts {
                if attempt > 0
                    && final_error
                        .as_ref()
                        .is_some_and(|e: &AttemptError| e.status == Some(401))
                {
                    grant = self
                        .create_upload_grant(
                            session,
                            prepared.info.media_type,
                            &prepared.info.file_enc_sha256,
                            request.clone(),
                        )
                        .await?;
                }
                let mut offset = 0;
                if attempt > 0 {
                    match post(
                        &client,
                        upload_url(&grant, prepared, &[("resume", "1".into())])?,
                        None,
                        0,
                        &direct,
                    )
                    .await
                    {
                        Ok(Some(value)) => {
                            if value["resume"] == "complete" {
                                outcome = Some(parse_location(value)?);
                                break;
                            }
                            offset = value["resume"]
                                .as_u64()
                                .or_else(|| value["resume"].as_str().and_then(|v| v.parse().ok()))
                                .filter(|v| *v > 0 && *v < total)
                                .unwrap_or(0);
                        }
                        Ok(None) => {}
                        Err(e) if e.status == Some(404) => {}
                        Err(e) => {
                            if !e.retryable {
                                return Err(e.error);
                            }
                            final_error = Some(e);
                            continue;
                        }
                    }
                }
                let query = if offset > 0 {
                    vec![
                        ("bytestart", offset.to_string()),
                        ("byteend", total.to_string()),
                    ]
                } else {
                    vec![]
                };
                match post(
                    &client,
                    upload_url(&grant, prepared, &query)?,
                    Some(prepared.open(offset).await?),
                    total - offset,
                    &direct,
                )
                .await
                {
                    Ok(Some(value)) => {
                        outcome = Some(parse_location(value)?);
                        break;
                    }
                    Ok(None) => return Err(invalid_location()),
                    Err(e) => {
                        if !e.retryable {
                            return Err(e.error);
                        }
                        final_error = Some(e);
                    }
                }
            }
            outcome.ok_or_else(|| {
                final_error
                    .map(|e| e.error)
                    .unwrap_or_else(invalid_location)
            })?
        };
        Ok(location)
    }
}
struct UploadReader {
    stream: Arc<tokio::sync::Mutex<(MediaInputStream, Option<bytes::Bytes>)>>,
}
impl UploadReader {
    async fn new(prepared: &PreparedUpload, offset: u64) -> Result<Self> {
        Ok(Self {
            stream: Arc::new(tokio::sync::Mutex::new((
                prepared.open(offset).await?,
                None,
            ))),
        })
    }
    async fn part(&self, length: u64) -> MediaInputStream {
        let source = self.stream.clone();
        Box::pin(
            async_stream::try_stream! {let mut remaining=length;while remaining>0 {let mut guard=source.lock().await;let chunk=if let Some(chunk)=guard.1.take(){chunk}else{guard.0.next().await.ok_or_else(changed)??};let count=remaining.min(chunk.len()as u64)as usize;if count<chunk.len(){guard.1=Some(chunk.slice(count..));}drop(guard);remaining-=count as u64;if count>0{yield chunk.slice(..count);}}},
        )
    }
}
fn upload_url(
    grant: &UploadGrant,
    prepared: &PreparedUpload,
    query: &[(&str, String)],
) -> Result<url::Url> {
    let mut url = url::Url::parse(&grant.upload_url).map_err(|_| invalid_location())?;
    if !crate::media::is_whatsapp_media_url(url.as_str())
        || !grant
            .hosts
            .iter()
            .any(|h| Some(h.as_str()) == url.host_str())
        || url.path()
            != format!(
                "{}/{}",
                prepared.info.media_type.upload_path(),
                URL_SAFE_NO_PAD.encode(prepared.info.file_enc_sha256)
            )
    {
        return Err(invalid_location());
    }
    let mut pairs = url
        .query_pairs()
        .map(|(k, v)| (k.into_owned(), v.into_owned()))
        .collect::<Vec<_>>();
    for (k, v) in query {
        pairs.retain(|(name, _)| name != k);
        pairs.push(((*k).into(), v.clone()));
    }
    url.set_query(None);
    url.query_pairs_mut().extend_pairs(pairs);
    Ok(url)
}
fn invalid_location() -> Error {
    Error::local(
        ErrorKind::Server,
        "Invalid media upload response.",
        "invalid_response",
    )
}
fn parse_location(value: serde_json::Value) -> Result<UploadLocation> {
    Ok(UploadLocation {
        direct_path: value["direct_path"]
            .as_str()
            .filter(|s| !s.is_empty())
            .ok_or_else(invalid_location)?
            .into(),
        url: value["url"]
            .as_str()
            .filter(|s| !s.is_empty())
            .ok_or_else(invalid_location)?
            .into(),
        handle: value["handle"].as_str().map(str::to_owned),
    })
}
struct AttemptError {
    error: Error,
    retryable: bool,
    status: Option<u16>,
}
async fn post(
    client: &reqwest::Client,
    url: url::Url,
    payload: Option<MediaInputStream>,
    length: u64,
    options: &DirectUploadOptions,
) -> std::result::Result<Option<serde_json::Value>, AttemptError> {
    let (payload, failure) = if let Some(body) = payload {
        let (body, error) = watch(body);
        (Some(body), Some(error))
    } else {
        (None, None)
    };
    let request = client
        .post(url)
        .header("origin", "https://web.whatsapp.com")
        .header("referer", "https://web.whatsapp.com/");
    let request = if let Some(body) = payload {
        request
            .header("content-length", length)
            .body(reqwest::Body::wrap_stream(body))
    } else {
        request
    };
    let response = tokio::select! {biased;_=options.cancellation.cancelled()=>return Err(AttemptError{error:crate::transport::cancelled(),retryable:false,status:None}),r=request.send()=>r.map_err(|_|{if let Some(error)=failure.as_ref().and_then(|e|e.lock().unwrap().take()){AttemptError{error,retryable:false,status:None}}else{AttemptError{error:Error::local(ErrorKind::Connection,"Cannot reach the WhatsApp media host.","connection_error"),retryable:true,status:None}}})?};
    let status = response.status().as_u16();
    if !response.status().is_success() {
        let code = match status {
            413 => "media_too_large",
            415 => "media_upload_hash_mismatch",
            507 => "media_upload_throttled",
            401 => "media_upload_unauthorized",
            _ => "media_upload_failed",
        };
        return Err(AttemptError {
            error: Error::local(
                ErrorKind::Connection,
                format!("WhatsApp media host returned status {status}."),
                code,
            ),
            retryable: status == 401 || status == 408 || (status >= 500 && status != 507),
            status: Some(status),
        });
    }
    let mut bytes = Vec::new();
    let mut stream = response.bytes_stream();
    while let Some(chunk) = tokio::select! {biased;_=options.cancellation.cancelled()=>return Err(AttemptError{error:crate::transport::cancelled(),retryable:false,status:None}),r=stream.next()=>r}
    {
        let chunk = chunk.map_err(|_| AttemptError {
            error: invalid_location(),
            retryable: true,
            status: None,
        })?;
        if bytes.len() + chunk.len() > 1024 * 1024 {
            return Err(AttemptError {
                error: invalid_location(),
                retryable: false,
                status: None,
            });
        }
        bytes.extend_from_slice(&chunk);
    }
    if bytes.is_empty() {
        Ok(None)
    } else {
        serde_json::from_slice(&bytes)
            .map(Some)
            .map_err(|_| AttemptError {
                error: invalid_location(),
                retryable: false,
                status: None,
            })
    }
}
#[allow(clippy::too_many_arguments)]
async fn retry_post(
    resource: &WhatsAppMediaResource<'_>,
    session: &str,
    prepared: &PreparedUpload,
    grant: &mut UploadGrant,
    client: &reqwest::Client,
    options: &DirectUploadOptions,
    request: &RequestOptions,
    query: &[(&str, String)],
    _: Option<()>,
) -> Result<Option<serde_json::Value>> {
    let mut last = None;
    for attempt in 0..options.max_attempts {
        if attempt > 0
            && last
                .as_ref()
                .is_some_and(|e: &AttemptError| e.status == Some(401))
        {
            *grant = resource
                .create_upload_grant(
                    session,
                    prepared.info.media_type,
                    &prepared.info.file_enc_sha256,
                    request.clone(),
                )
                .await?;
        }
        match post(
            client,
            upload_url(grant, prepared, query)?,
            None,
            0,
            options,
        )
        .await
        {
            Ok(v) => return Ok(v),
            Err(e) => {
                if !e.retryable {
                    return Err(e.error);
                }
                last = Some(e);
            }
        }
    }
    Err(last.unwrap().error)
}
