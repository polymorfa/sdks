use crate::{Error, ErrorKind, Result, NATIVE_API_VERSION, SDK_VERSION};
use bytes::Bytes;
use futures_util::{Stream, StreamExt};
use reqwest::{header::HeaderMap, Method};
use serde::{de::DeserializeOwned, Serialize};
use std::{collections::BTreeMap, pin::Pin, sync::Arc, time::Duration};
use tokio_util::sync::CancellationToken;
use url::Url;

#[derive(Clone)]
pub enum Credential {
    OrganizationApiKey(String),
    ProjectToken(String),
    ClientToken(String),
}
impl Credential {
    pub fn organization_api_key(value: impl Into<String>) -> Result<Self> {
        let value = value.into();
        if !canonical(&value, "pmfa_", 72) {
            return Err(configuration("credential"));
        }
        Ok(Self::OrganizationApiKey(value))
    }
    pub fn project_token(value: impl Into<String>) -> Result<Self> {
        let value = value.into();
        if !canonical(&value, "pmfa_pt_", 94) || !value.ends_with(['A', 'Q', 'g', 'w']) {
            return Err(configuration("credential"));
        }
        Ok(Self::ProjectToken(value))
    }
    pub fn client_token(value: impl Into<String>) -> Result<Self> {
        let value = value.into();
        if !value.starts_with("pmfa_ct_") || value.len() <= 8 || value.contains(['\r', '\n']) {
            return Err(configuration("credential"));
        }
        Ok(Self::ClientToken(value))
    }
    pub(crate) fn value(&self) -> &str {
        match self {
            Self::OrganizationApiKey(v) | Self::ProjectToken(v) | Self::ClientToken(v) => v,
        }
    }
    pub(crate) fn validate(&self) -> Result<()> {
        match self {
            Self::OrganizationApiKey(v) => Self::organization_api_key(v.clone()),
            Self::ProjectToken(v) => Self::project_token(v.clone()),
            Self::ClientToken(v) => Self::client_token(v.clone()),
        }
        .map(|_| ())
    }
    pub(crate) fn server(&self) -> Result<()> {
        if matches!(self, Self::ClientToken(_)) {
            Err(configuration(
                "credential: this operation requires a server credential",
            ))
        } else {
            Ok(())
        }
    }
}
fn canonical(value: &str, prefix: &str, size: usize) -> bool {
    value.strip_prefix(prefix).is_some_and(|s| {
        s.len() == size
            && s.bytes()
                .all(|c| c.is_ascii_alphanumeric() || c == b'_' || c == b'-')
    })
}
pub(crate) fn configuration(field: &str) -> Error {
    Error::local(
        ErrorKind::Configuration,
        format!("Invalid {field}."),
        "invalid_configuration",
    )
}

#[derive(Clone)]
pub struct ClientOptions {
    pub base_url: String,
    pub api_version: String,
    pub timeout: Duration,
    pub max_network_retries: u32,
    pub proxy: Option<String>,
    /// Configure connections, TLS, or DNS. The SDK applies its redirect policy
    /// after this callback, so API credentials cannot follow redirects.
    pub configure_http:
        Option<Arc<dyn Fn(reqwest::ClientBuilder) -> reqwest::ClientBuilder + Send + Sync>>,
}
impl Default for ClientOptions {
    fn default() -> Self {
        Self {
            base_url: "https://api.polymorfa.com".into(),
            api_version: NATIVE_API_VERSION.into(),
            timeout: Duration::from_secs(30),
            max_network_retries: 2,
            proxy: None,
            configure_http: None,
        }
    }
}
#[derive(Clone, Default)]
pub struct RequestOptions {
    pub api_version: Option<String>,
    pub headers: BTreeMap<String, String>,
    pub idempotency_key: Option<String>,
    pub max_network_retries: Option<u32>,
    pub timeout: Option<Duration>,
    pub cancellation: Option<CancellationToken>,
}
impl RequestOptions {
    pub(crate) fn idempotent(mut self) -> Self {
        if self.idempotency_key.is_none() {
            self.idempotency_key = Some(uuid::Uuid::new_v4().to_string());
        }
        self
    }
}
#[derive(Clone, Debug)]
pub struct ResponseMetadata {
    pub status: u16,
    pub request_id: Option<String>,
    pub api_version: Option<String>,
    pub attempts: u32,
    pub headers: BTreeMap<String, String>,
    pub transport: Option<String>,
    pub routing_reason: Option<String>,
    pub operation_id: Option<String>,
}
#[derive(Clone, Debug)]
pub struct ApiResponse<T> {
    pub data: T,
    pub metadata: ResponseMetadata,
}

pub struct DownloadStream {
    pub body: Pin<Box<dyn Stream<Item = Result<Bytes>> + Send>>,
    pub content_type: Option<String>,
    pub content_length: Option<u64>,
    pub filename: Option<String>,
    pub redirected: bool,
    pub metadata: ResponseMetadata,
}
/// A signed storage URL is a bearer capability; this type omits Debug.
pub enum DownloadLocation {
    Streamed {
        metadata: ResponseMetadata,
    },
    Redirect {
        url: String,
        expires_at: Option<std::time::SystemTime>,
        metadata: ResponseMetadata,
    },
}

#[derive(Clone)]
pub(crate) struct HttpTransport {
    pub(crate) credential: Option<Credential>,
    pub(crate) options: ClientOptions,
    client: reqwest::Client,
}
impl HttpTransport {
    /// Credential-free upload transport: capabilities and storage bodies never
    /// enter errors, default API headers, redirect policies, or retry logic.
    pub(crate) async fn send_upload(
        &self,
        upload: &crate::voice::VoiceUpload,
        body: reqwest::Body,
        size: u64,
        options: &RequestOptions,
    ) -> Result<()> {
        let url = Url::parse(&self.options.base_url)
            .and_then(|base| base.join(&upload.url))
            .map_err(|_| configuration("upload URL"))?;
        validate_download_target(&url).map_err(|_| configuration("upload URL"))?;
        let mut builder = reqwest::Client::builder().redirect(reqwest::redirect::Policy::none());
        if let Some(proxy) = &self.options.proxy {
            builder =
                builder.proxy(reqwest::Proxy::all(proxy).map_err(|_| configuration("proxy"))?);
        }
        let client = builder
            .build()
            .map_err(|_| configuration("upload HTTP client"))?;
        let mut request = client.post(url).body(body);
        for (name, value) in &upload.headers {
            if !name.eq_ignore_ascii_case("authorization") {
                request = request.header(name, value);
            }
        }
        request = request
            .header("user-agent", format!("polymorfa-rust/{SDK_VERSION}"))
            .header("content-length", size);
        let token = options.cancellation.clone().unwrap_or_default();
        let send = async {
            let response = request.send().await.map_err(|_| {
                Error::local(
                    ErrorKind::Connection,
                    "Cannot reach audio upload storage.",
                    "connection_error",
                )
            })?;
            let status = response.status().as_u16();
            if !response.status().is_success() {
                let kind = match status {
                    401 => ErrorKind::Authentication,
                    403 => ErrorKind::Authorization,
                    404 => ErrorKind::NotFound,
                    408 => ErrorKind::Timeout,
                    409 => ErrorKind::Conflict,
                    413 | 422 => ErrorKind::Validation,
                    429 => ErrorKind::RateLimit,
                    500..=599 => ErrorKind::Server,
                    _ => ErrorKind::Api,
                };
                return Err(Error::local(
                    kind,
                    "Audio upload storage refused the request.",
                    "upload_failed",
                )
                .with_local_status(status));
            }
            // Consume success bodies under the same deadline without decoding or retaining them.
            let mut stream = response.bytes_stream();
            while let Some(chunk) = stream.next().await {
                chunk.map_err(|_| {
                    Error::local(
                        ErrorKind::Connection,
                        "Cannot read audio upload response.",
                        "connection_error",
                    )
                })?;
            }
            Ok(())
        };
        tokio::select! { _=token.cancelled()=>Err(cancelled()), result=tokio::time::timeout(options.timeout.unwrap_or(self.options.timeout),send)=>result.map_err(|_|Error::local(ErrorKind::Timeout,"Audio upload timed out.","request_timeout"))? }
    }

    pub(crate) fn new(credential: Credential, options: ClientOptions) -> Result<Self> {
        credential.validate()?;
        Self::build(Some(credential), options)
    }
    pub(crate) fn without_credentials(options: ClientOptions) -> Result<Self> {
        Self::build(None, options)
    }
    fn build(credential: Option<Credential>, options: ClientOptions) -> Result<Self> {
        validate_base(&options.base_url)?;
        if options.timeout.is_zero()
            || options.api_version.is_empty()
            || options.api_version.contains(['\r', '\n'])
            || options.max_network_retries > 10
        {
            return Err(configuration("client options"));
        }
        let mut builder = reqwest::Client::builder();
        if let Some(proxy) = &options.proxy {
            builder =
                builder.proxy(reqwest::Proxy::all(proxy).map_err(|_| configuration("proxy"))?);
        }
        if let Some(configure) = &options.configure_http {
            builder = configure(builder);
        }
        let client = builder
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .map_err(|_| configuration("http client"))?;
        Ok(Self {
            credential,
            options,
            client,
        })
    }
    pub(crate) fn server(&self) -> Result<()> {
        self.credential
            .as_ref()
            .ok_or_else(|| configuration("credential"))?
            .server()
    }
    pub(crate) fn credential_value(&self) -> Result<&str> {
        Ok(self
            .credential
            .as_ref()
            .ok_or_else(|| configuration("credential"))?
            .value())
    }
    pub(crate) async fn request<T: DeserializeOwned, B: Serialize + ?Sized>(
        &self,
        method: Method,
        path: &str,
        query: &[(&str, String)],
        body: Option<&B>,
        options: RequestOptions,
    ) -> Result<ApiResponse<T>> {
        let serialized = body.map(serde_json::to_vec).transpose().map_err(|_| {
            Error::local(
                ErrorKind::Validation,
                "Request body cannot be serialized.",
                "invalid_request_body",
            )
        })?;
        let (response, metadata) = self
            .open(
                method,
                path,
                query,
                serialized,
                &options,
                "application/json",
            )
            .await?;
        let value = read_body(
            response,
            &options,
            options.timeout.unwrap_or(self.options.timeout),
        )
        .await
        .map_err(|error| error.with_metadata(metadata.clone()))?;
        let data = serde_json::from_slice(if value.is_empty() { b"null" } else { &value })
            .map_err(|_| {
                Error::local(
                    ErrorKind::Server,
                    "Polymorfa returned an invalid JSON response.",
                    "invalid_response",
                )
                .with_metadata(metadata.clone())
            })?;
        Ok(ApiResponse { data, metadata })
    }
    pub(crate) async fn request_text(
        &self,
        path: &str,
        query: &[(&str, String)],
        options: RequestOptions,
        accept: &str,
    ) -> Result<ApiResponse<String>> {
        let (response, metadata) = self
            .open(Method::GET, path, query, None, &options, accept)
            .await?;
        let bytes = read_body(
            response,
            &options,
            options.timeout.unwrap_or(self.options.timeout),
        )
        .await
        .map_err(|e| e.with_metadata(metadata.clone()))?;
        let data = String::from_utf8(bytes.to_vec()).map_err(|_| {
            Error::local(
                ErrorKind::Server,
                "Polymorfa returned invalid UTF-8 text",
                "invalid_response",
            )
            .with_metadata(metadata.clone())
        })?;
        Ok(ApiResponse { data, metadata })
    }
    pub(crate) async fn get<T: DeserializeOwned>(
        &self,
        path: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<T>> {
        self.request::<T, ()>(Method::GET, path, &[], None, options)
            .await
    }
    pub(crate) async fn open(
        &self,
        method: Method,
        path: &str,
        query: &[(&str, String)],
        body: Option<Vec<u8>>,
        options: &RequestOptions,
        accept: &str,
    ) -> Result<(reqwest::Response, ResponseMetadata)> {
        self.open_internal(method, path, query, body, options, accept, false)
            .await
    }
    #[allow(clippy::too_many_arguments)]
    async fn open_internal(
        &self,
        method: Method,
        path: &str,
        query: &[(&str, String)],
        body: Option<Vec<u8>>,
        options: &RequestOptions,
        accept: &str,
        allow_redirect: bool,
    ) -> Result<(reqwest::Response, ResponseMetadata)> {
        validate_path(path)?;
        let retries = options
            .max_network_retries
            .unwrap_or(self.options.max_network_retries);
        let timeout = options.timeout.unwrap_or(self.options.timeout);
        if timeout.is_zero() || retries > 10 {
            return Err(configuration("request options"));
        }
        let mut url = Url::parse(&self.options.base_url)
            .and_then(|base| base.join(path))
            .map_err(|_| configuration("path"))?;
        if !query.is_empty() {
            let mut pairs = url.query_pairs_mut();
            for (key, value) in query {
                pairs.append_pair(key, value);
            }
        }
        let eligible = matches!(method, Method::GET | Method::HEAD | Method::OPTIONS)
            || options
                .idempotency_key
                .as_ref()
                .is_some_and(|v| !v.is_empty());
        let mut attempt = 0;
        loop {
            attempt += 1;
            let mut request = self
                .client
                .request(method.clone(), url.clone())
                .header("accept", accept)
                .header("user-agent", format!("polymorfa-rust/{SDK_VERSION}"));
            for (key, value) in &options.headers {
                if matches!(
                    key.to_ascii_lowercase().as_str(),
                    "authorization" | "host" | "cookie"
                ) {
                    return Err(configuration("headers: reserved authentication header"));
                }
                request = request.header(key, value);
            }
            if let Some(credential) = &self.credential {
                request = request.bearer_auth(credential.value());
            }
            request = request.header(
                "polymorfa-version",
                options
                    .api_version
                    .as_deref()
                    .unwrap_or(&self.options.api_version),
            );
            if let Some(key) = &options.idempotency_key {
                request = request.header("idempotency-key", key);
            }
            if let Some(body) = &body {
                request = request
                    .header("content-type", "application/json")
                    .body(body.clone());
            }
            let cancellation = options.cancellation.clone().unwrap_or_default();
            let outcome = tokio::select! {
                _ = cancellation.cancelled() => return Err(cancelled()),
                result = tokio::time::timeout(timeout, request.send()) => result,
            };
            let response = match outcome {
                Ok(Ok(response)) => response,
                other => {
                    if eligible && attempt <= retries {
                        sleep(delay(None, attempt), &cancellation).await?;
                        continue;
                    }
                    return Err(match other {
                        Err(_) => Error::local(
                            ErrorKind::Timeout,
                            "Request timed out.",
                            "request_timeout",
                        ),
                        Ok(Err(error)) if error.is_timeout() => Error::local(
                            ErrorKind::Timeout,
                            "Request timed out.",
                            "request_timeout",
                        ),
                        _ => Error::local(
                            ErrorKind::Connection,
                            "Cannot reach the Polymorfa API.",
                            "connection_error",
                        ),
                    });
                }
            };
            let metadata = metadata(&response, attempt);
            if !(response.status().is_success()
                || allow_redirect && response.status().is_redirection())
            {
                if eligible
                    && attempt <= retries
                    && retryable(metadata.status)
                    && metadata.operation_id.is_none()
                    && response
                        .headers()
                        .get("idempotent-replayed")
                        .and_then(|v| v.to_str().ok())
                        != Some("true")
                {
                    let wait = delay(Some(response.headers()), attempt);
                    drop(response);
                    sleep(wait, &cancellation).await?;
                    continue;
                }
                let bytes = read_body(response, options, timeout)
                    .await
                    .map_err(|error| error.with_metadata(metadata.clone()))?;
                let value = serde_json::from_slice(&bytes).unwrap_or(serde_json::Value::Null);
                return Err(Error::response(&value, metadata));
            }
            return Ok((response, metadata));
        }
    }
    pub(crate) async fn download(
        &self,
        path: &str,
        options: RequestOptions,
    ) -> Result<DownloadStream> {
        // Redirects are handled manually so no credential or caller header reaches storage.
        validate_path(path)?;
        let url = Url::parse(&self.options.base_url)
            .and_then(|base| base.join(path))
            .map_err(|_| configuration("path"))?
            .to_string();
        let token = options.cancellation.clone().unwrap_or_default();
        let (mut response, metadata) = self
            .open_internal(
                Method::GET,
                path,
                &[],
                None,
                &options,
                "application/octet-stream, */*",
                true,
            )
            .await?;
        let mut redirected = false;
        if response.status().is_redirection() {
            let location = response
                .headers()
                .get("location")
                .and_then(|v| v.to_str().ok())
                .ok_or_else(|| configuration("media redirect"))?;
            let location = Url::parse(&url)
                .unwrap()
                .join(location)
                .map_err(|_| configuration("media redirect"))?;
            validate_download_target(&location)?;
            // Storage uses an independently owned client with no custom API
            // default headers, authentication, or redirect-follow policy.
            let mut storage_builder =
                reqwest::Client::builder().redirect(reqwest::redirect::Policy::none());
            if let Some(proxy) = &self.options.proxy {
                storage_builder = storage_builder
                    .proxy(reqwest::Proxy::all(proxy).map_err(|_| configuration("proxy"))?);
            }
            let storage_client = storage_builder
                .build()
                .map_err(|_| configuration("storage HTTP client"))?;
            response = tokio::select! {
                _ = token.cancelled() => return Err(cancelled()),
                r = tokio::time::timeout(options.timeout.unwrap_or(self.options.timeout), storage_client.get(location).send()) => r.map_err(|_| Error::local(ErrorKind::Timeout,"Download timed out.","request_timeout"))?.map_err(|_| Error::local(ErrorKind::Connection,"Cannot download storage media.","connection_error"))?,
            };
            redirected = true;
        }
        if !response.status().is_success() {
            return Err(Error::local(
                ErrorKind::Server,
                "Media download failed.",
                "media_fetch_failed",
            ));
        }
        let content_type = response
            .headers()
            .get("content-type")
            .and_then(|v| v.to_str().ok())
            .map(str::to_owned);
        let content_length = response.content_length();
        let filename = response
            .headers()
            .get("content-disposition")
            .and_then(|v| v.to_str().ok())
            .and_then(filename);
        let mut stream = response.bytes_stream();
        let body = async_stream::try_stream! {
            loop {
                let next = tokio::select! { _ = token.cancelled() => Err(cancelled()), next = stream.next() => Ok(next) }?;
                match next { Some(Ok(bytes)) => yield bytes, Some(Err(_)) => Err(Error::local(ErrorKind::Connection,"Media stream interrupted.","connection_error"))?, None => break }
            }
        };
        Ok(DownloadStream {
            body: Box::pin(body),
            content_type,
            content_length,
            filename,
            redirected,
            metadata,
        })
    }
    pub(crate) async fn download_location(
        &self,
        path: &str,
        options: RequestOptions,
    ) -> Result<DownloadLocation> {
        let (response, metadata) = self
            .open_internal(
                Method::GET,
                path,
                &[],
                None,
                &options,
                "application/octet-stream, */*",
                true,
            )
            .await?;
        if response.status().is_redirection() {
            let value = response
                .headers()
                .get("location")
                .and_then(|v| v.to_str().ok())
                .ok_or_else(|| configuration("media redirect"))?;
            let url = Url::parse(&self.options.base_url)
                .and_then(|base| base.join(path))
                .and_then(|base| base.join(value))
                .map_err(|_| configuration("media redirect"))?;
            validate_download_target(&url)?;
            Ok(DownloadLocation::Redirect {
                expires_at: signed_url_expiry(&url),
                url: url.to_string(),
                metadata,
            })
        } else {
            Ok(DownloadLocation::Streamed { metadata })
        }
    }
}
fn filename(value: &str) -> Option<String> {
    let mut fallback = None;
    for segment in value.split(';').skip(1) {
        let (name, value) = segment.trim().split_once('=')?;
        if name.eq_ignore_ascii_case("filename*") {
            if let Some(encoded) = value
                .trim_matches('"')
                .strip_prefix("UTF-8''")
                .or_else(|| value.trim_matches('"').strip_prefix("utf-8''"))
            {
                if let Ok(decoded) = percent_decode(encoded) {
                    return Some(decoded);
                }
            }
        } else if name.eq_ignore_ascii_case("filename") {
            fallback = Some(value.trim_matches('"').replace("\\\"", "\""));
        }
    }
    fallback
}
fn signed_url_expiry(url: &Url) -> Option<std::time::SystemTime> {
    let query: BTreeMap<_, _> = url.query_pairs().collect();
    if let (Some(date), Some(expires)) = (query.get("X-Amz-Date"), query.get("X-Amz-Expires")) {
        let start = chrono::NaiveDateTime::parse_from_str(date, "%Y%m%dT%H%M%SZ")
            .ok()?
            .and_utc()
            .timestamp();
        let seconds = start.checked_add(expires.parse::<i64>().ok()?)?;
        return u64::try_from(seconds)
            .ok()
            .and_then(|seconds| std::time::UNIX_EPOCH.checked_add(Duration::from_secs(seconds)));
    }
    query
        .get("Expires")
        .and_then(|v| v.parse::<u64>().ok())
        .and_then(|seconds| std::time::UNIX_EPOCH.checked_add(Duration::from_secs(seconds)))
}

async fn read_body(
    response: reqwest::Response,
    options: &RequestOptions,
    timeout: Duration,
) -> Result<Bytes> {
    let cancellation = options.cancellation.clone().unwrap_or_default();
    tokio::select! {
        _ = cancellation.cancelled() => Err(cancelled()),
        r = tokio::time::timeout(timeout, response.bytes()) => r.map_err(|_| Error::local(ErrorKind::Timeout,"Response body timed out.","request_timeout"))?.map_err(|_| Error::local(ErrorKind::Connection,"Response body interrupted.","connection_error")),
    }
}
pub(crate) fn cancelled() -> Error {
    Error::local(
        ErrorKind::Cancelled,
        "Request cancelled by caller.",
        "request_cancelled",
    )
}
pub(crate) fn validate_path(path: &str) -> Result<()> {
    let decoded = percent_decode(path)?;
    if !path.starts_with('/')
        || path.starts_with("//")
        || path.contains(['\\', '?', '#'])
        || decoded.contains('\\')
        || decoded.split('/').any(|p| p == ".." || p == ".")
        || decoded.starts_with("//")
    {
        return Err(configuration(
            "path: expected an absolute API path without traversal",
        ));
    }
    Ok(())
}
fn percent_decode(value: &str) -> Result<String> {
    let mut bytes = Vec::new();
    let mut input = value.bytes();
    while let Some(byte) = input.next() {
        if byte == b'%' {
            let a = input
                .next()
                .and_then(|b| (b as char).to_digit(16))
                .ok_or_else(|| configuration("path encoding"))?;
            let b = input
                .next()
                .and_then(|b| (b as char).to_digit(16))
                .ok_or_else(|| configuration("path encoding"))?;
            bytes.push((a * 16 + b) as u8);
        } else {
            bytes.push(byte);
        }
    }
    String::from_utf8(bytes).map_err(|_| configuration("path encoding"))
}
pub(crate) fn encode(value: &str) -> String {
    let mut output = String::new();
    for byte in value.bytes() {
        if byte.is_ascii_alphanumeric() || b"-_.!~*'()".contains(&byte) {
            output.push(byte as char);
        } else {
            output.push_str(&format!("%{byte:02X}"));
        }
    }
    output
}
pub(crate) fn validate_base(value: &str) -> Result<()> {
    let url = Url::parse(value).map_err(|_| configuration("base_url"))?;
    let local = matches!(url.host_str(), Some("localhost" | "127.0.0.1" | "[::1]"));
    if !(url.scheme() == "https" || (url.scheme() == "http" && local))
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err(configuration("base_url"));
    }
    Ok(())
}
fn validate_download_target(url: &Url) -> Result<()> {
    let local = matches!(url.host_str(), Some("localhost" | "127.0.0.1" | "[::1]"));
    if !(url.scheme() == "https" || url.scheme() == "http" && local)
        || !url.username().is_empty()
        || url.password().is_some()
        || url.fragment().is_some()
    {
        return Err(configuration("media redirect"));
    }
    Ok(())
}
fn retryable(status: u16) -> bool {
    matches!(status, 408 | 409 | 429 | 500..=599)
}
fn delay(headers: Option<&HeaderMap>, attempt: u32) -> Duration {
    if let Some(value) = headers
        .and_then(|h| h.get("retry-after"))
        .and_then(|v| v.to_str().ok())
    {
        if let Ok(seconds) = value.parse::<f64>() {
            if seconds.is_finite() && seconds >= 0.0 {
                return Duration::from_secs_f64(seconds.min(60.0));
            }
        }
        if let Ok(date) = httpdate::parse_http_date(value) {
            return date
                .duration_since(std::time::SystemTime::now())
                .unwrap_or_default()
                .min(Duration::from_secs(60));
        }
    }
    let ceiling = (500u64 * 2u64.pow((attempt - 1).min(4))).min(5000);
    Duration::from_millis((ceiling as f64 * (0.5 + rand::random::<f64>() * 0.5)) as u64)
}
async fn sleep(duration: Duration, cancellation: &CancellationToken) -> Result<()> {
    tokio::select! { _ = cancellation.cancelled() => Err(cancelled()), _ = tokio::time::sleep(duration) => Ok(()) }
}
fn metadata(response: &reqwest::Response, attempts: u32) -> ResponseMetadata {
    let allowed = [
        "x-request-id",
        "request-id",
        "polymorfa-version",
        "retry-after",
        "idempotent-replayed",
        "x-polymorfa-transport",
        "x-polymorfa-routing-reason",
        "x-polymorfa-operation-id",
        "polymorfa-ratelimit-reason",
        "polymorfa-next-cursor",
        "polymorfa-data-region",
        "content-type",
        "content-length",
        "content-disposition",
    ];
    let headers: BTreeMap<_, _> = allowed
        .iter()
        .filter_map(|name| {
            response
                .headers()
                .get(*name)
                .and_then(|v| v.to_str().ok())
                .map(|value| ((*name).to_owned(), value.to_owned()))
        })
        .collect();
    ResponseMetadata {
        status: response.status().as_u16(),
        request_id: headers
            .get("x-request-id")
            .or_else(|| headers.get("request-id"))
            .cloned(),
        api_version: headers.get("polymorfa-version").cloned(),
        attempts,
        transport: headers.get("x-polymorfa-transport").cloned(),
        routing_reason: headers.get("x-polymorfa-routing-reason").cloned(),
        operation_id: headers.get("x-polymorfa-operation-id").cloned(),
        headers,
    }
}
