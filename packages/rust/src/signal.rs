//! Server-only client for the customer-operated Signal service.
//! Contract: signal-node 8aa191ef0d4c318229c91bcdf474bf2d79dac47c.
//! This client holds an application bearer, never a Signal master/session key.
use crate::{Error, ErrorKind, Result};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use futures_util::{Stream, StreamExt as _};
use hmac::{Hmac, Mac};
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use sha2::Sha256;
use std::{pin::Pin, sync::Arc, time::Duration};
use tokio_util::sync::CancellationToken;

pub const SIGNAL_SERVICE_CONTRACT: &str = "8aa191ef0d4c318229c91bcdf474bf2d79dac47c";
const BODY_LIMIT: usize = 4 * 1024 * 1024;
#[derive(Clone)]
pub struct SignalClientOptions {
    pub base_url: String,
    pub application_secret: String,
    pub timeout: Duration,
    /// Configure DNS/proxy/trust. Redirects and credential policy remain SDK-owned.
    pub configure_http:
        Option<Arc<dyn Fn(reqwest::ClientBuilder) -> reqwest::ClientBuilder + Send + Sync>>,
}
impl SignalClientOptions {
    pub fn new(base_url: impl Into<String>, application_secret: impl Into<String>) -> Self {
        Self {
            base_url: base_url.into(),
            application_secret: application_secret.into(),
            timeout: Duration::from_secs(30),
            configure_http: None,
        }
    }
}
#[derive(Clone)]
pub struct SignalClient {
    http: reqwest::Client,
    base: String,
    bearer: reqwest::header::HeaderValue,
    timeout: Duration,
}
#[derive(Clone, Deserialize)]
pub struct SignalSessions {
    pub node_id: String,
    pub sessions: Vec<SignalSession>,
}
#[derive(Clone, Deserialize)]
pub struct SignalSession {
    pub id: String,
    pub lease_generation: u64,
    pub claimed: bool,
    pub has_device_keys: bool,
    pub state: String,
    pub pn: Option<String>,
    pub lid: Option<String>,
}
#[derive(Clone, Deserialize)]
pub struct SignalSendOutcome {
    pub message_id: String,
    pub server_timestamp: i64,
    pub resent: bool,
}
#[derive(Clone, Serialize)]
#[serde(untagged)]
pub enum SignalSendRequest {
    Text {
        to: String,
        text: String,
    },
    Media {
        to: String,
        media: Box<SignalMediaDescriptor>,
    },
}
/// Descriptors contain secret media keys and do not implement Debug.
#[derive(Clone, Deserialize, Serialize)]
pub struct SignalMediaDescriptor {
    pub kind: String,
    pub direct_path: String,
    pub media_key: String,
    pub file_sha256: String,
    pub file_enc_sha256: String,
    pub file_length: u64,
    pub mimetype: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub caption: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub width: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub height: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub seconds: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ptt: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub media_key_timestamp: Option<i64>,
}
#[derive(Clone, Deserialize)]
pub struct SignalHistoryDescriptor {
    pub sync_type: Option<i32>,
    pub chunk_order: Option<u32>,
    pub progress: Option<u32>,
    pub direct_path: Option<String>,
    pub media_key: Option<String>,
    pub file_sha256: Option<String>,
    pub file_enc_sha256: Option<String>,
    pub file_length: Option<u64>,
    pub original_message_id: Option<String>,
    pub peer_data_request_session_id: Option<String>,
    pub inline_payload: Option<String>,
    pub notification_proto: String,
}
/// Plaintext stays in the caller's application. Never log the event body.
#[derive(Clone, Deserialize)]
pub struct SignalEvent {
    pub id: String,
    #[serde(rename = "type")]
    pub event_type: String,
    pub session_id: String,
    pub chat: String,
    pub sender: String,
    pub message_id: String,
    pub timestamp: i64,
    pub is_from_me: bool,
    pub redelivered: bool,
    pub identity_changed: bool,
    pub message_proto: String,
    pub sender_alt: Option<String>,
    pub text: Option<String>,
    pub media: Option<SignalMediaDescriptor>,
    pub history: Option<SignalHistoryDescriptor>,
    #[serde(flatten)]
    pub additional: std::collections::BTreeMap<String, serde_json::Value>,
}
impl SignalMediaDescriptor {
    pub fn download_descriptor(&self) -> Result<crate::media::MediaDescriptor> {
        let kind = match self.kind.as_str() {
            "image" => crate::media::MediaKind::Image,
            "video" => crate::media::MediaKind::Video,
            "audio" => crate::media::MediaKind::Audio,
            "document" => crate::media::MediaKind::Document,
            "sticker" => crate::media::MediaKind::Sticker,
            _ => return Err(invalid("Invalid Signal media kind.")),
        };
        Ok(crate::media::MediaDescriptor {
            media_kind: kind,
            media_key: binary32(&self.media_key)?,
            file_sha256: Some(binary32(&self.file_sha256)?),
            file_enc_sha256: Some(binary32(&self.file_enc_sha256)?),
            file_length: Some(self.file_length),
            direct_path: Some(self.direct_path.clone()),
            url: self.url.clone(),
            mimetype: Some(self.mimetype.clone()),
            file_name: self.file_name.clone(),
        })
    }
}
fn binary32(value: &str) -> Result<[u8; 32]> {
    STANDARD
        .decode(value)
        .ok()
        .and_then(|v| v.try_into().ok())
        .ok_or_else(|| invalid("Signal descriptor requires base64 of 32 bytes."))
}
fn invalid(message: &str) -> Error {
    Error::local(ErrorKind::Validation, message, "invalid_signal_request")
}
fn malformed() -> Error {
    Error::local(
        ErrorKind::Server,
        "Signal service returned an invalid response.",
        "invalid_response",
    )
}
fn network() -> Error {
    Error::local(
        ErrorKind::Connection,
        "Cannot reach the Signal service.",
        "connection_error",
    )
}
impl SignalClient {
    pub fn new(options: SignalClientOptions) -> Result<Self> {
        let url = url::Url::parse(&options.base_url)
            .map_err(|_| crate::transport::configuration("Signal base URL"))?;
        let loopback = matches!(url.host_str(), Some("localhost" | "127.0.0.1" | "[::1]"));
        if !(url.scheme() == "https" || url.scheme() == "http" && loopback)
            || !url.username().is_empty()
            || url.password().is_some()
            || url.query().is_some()
            || url.fragment().is_some()
            || options.timeout.is_zero()
            || options.application_secret.len() < 16
            || !options
                .application_secret
                .bytes()
                .all(|b| (33..=126).contains(&b))
        {
            return Err(crate::transport::configuration("Signal client options"));
        }
        let mut bearer = reqwest::header::HeaderValue::from_str(&format!(
            "Bearer {}",
            options.application_secret
        ))
        .map_err(|_| crate::transport::configuration("Signal application secret"))?;
        bearer.set_sensitive(true);
        let mut builder = reqwest::Client::builder();
        if let Some(configure) = options.configure_http {
            builder = configure(builder);
        }
        let http = builder
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .map_err(|_| crate::transport::configuration("Signal transport"))?;
        Ok(Self {
            http,
            base: url.as_str().trim_end_matches('/').into(),
            bearer,
            timeout: options.timeout,
        })
    }
    async fn open(
        &self,
        method: reqwest::Method,
        path: &str,
        body: Option<serde_json::Value>,
        cancellation: &CancellationToken,
        accept: &str,
    ) -> Result<reqwest::Response> {
        let mut request = self
            .http
            .request(method, format!("{}{path}", self.base))
            .header(reqwest::header::AUTHORIZATION, self.bearer.clone())
            .header(reqwest::header::ACCEPT, accept);
        if let Some(body) = body {
            request = request.json(&body);
        }
        let response = tokio::select! { _=cancellation.cancelled()=>return Err(crate::transport::cancelled()), result=tokio::time::timeout(self.timeout,request.send())=>result.map_err(|_|Error::local(ErrorKind::Timeout,"Signal request timed out.","request_timeout"))?.map_err(|_|network())? };
        if !response.status().is_success() {
            let status = response.status().as_u16();
            // Do not copy arbitrary upstream messages, URLs or reflected secrets into errors.
            let kind = match status {
                401 => ErrorKind::Authentication,
                403 => ErrorKind::Authorization,
                404 => ErrorKind::NotFound,
                409 => ErrorKind::Conflict,
                429 => ErrorKind::RateLimit,
                500..=599 => ErrorKind::Server,
                _ => ErrorKind::Api,
            };
            let _ = kind;
            return Err(Error::response(
                &serde_json::json!({"error":{"code":"signal_service_error","message":format!("Signal service returned HTTP {status}.")}}),
                crate::ResponseMetadata {
                    status,
                    request_id: None,
                    api_version: None,
                    attempts: 1,
                    headers: Default::default(),
                    transport: None,
                    routing_reason: None,
                    operation_id: None,
                },
            ));
        }
        Ok(response)
    }
    async fn json<T: DeserializeOwned>(
        &self,
        method: reqwest::Method,
        path: &str,
        body: Option<serde_json::Value>,
        cancellation: &CancellationToken,
    ) -> Result<T> {
        let response = self
            .open(method, path, body, cancellation, "application/json")
            .await?;
        if !response
            .headers()
            .get(reqwest::header::CONTENT_TYPE)
            .and_then(|v| v.to_str().ok())
            .is_some_and(|v| v.starts_with("application/json"))
        {
            return Err(malformed());
        }
        let mut chunks = response.bytes_stream();
        let mut bytes = Vec::new();
        loop {
            let chunk = tokio::select! {_=cancellation.cancelled()=>return Err(crate::transport::cancelled()), result=tokio::time::timeout(self.timeout,chunks.next())=>result.map_err(|_|Error::local(ErrorKind::Timeout,"Signal response timed out.","request_timeout"))?};
            let Some(chunk) = chunk else { break };
            let chunk = chunk.map_err(|_| network())?;
            if bytes.len().saturating_add(chunk.len()) > BODY_LIMIT {
                return Err(malformed());
            }
            bytes.extend_from_slice(&chunk);
        }
        serde_json::from_slice(&bytes).map_err(|_| malformed())
    }
    pub async fn sessions(&self, cancellation: &CancellationToken) -> Result<SignalSessions> {
        self.json(reqwest::Method::GET, "/v1/sessions", None, cancellation)
            .await
    }
    /// Persist the event in application storage before calling this method. No auto-ACK.
    pub async fn acknowledge(&self, id: &str, cancellation: &CancellationToken) -> Result<()> {
        if id.is_empty() {
            return Err(invalid("Event ID is required."));
        }
        self.open(
            reqwest::Method::POST,
            &format!("/v1/events/{}/ack", crate::transport::encode(id)),
            None,
            cancellation,
            "application/json",
        )
        .await?;
        Ok(())
    }
    pub async fn send(
        &self,
        session: &str,
        request: &SignalSendRequest,
        cancellation: &CancellationToken,
    ) -> Result<SignalSendOutcome> {
        if session.is_empty() {
            return Err(invalid("Session ID is required."));
        }
        self.json(
            reqwest::Method::POST,
            &format!(
                "/v1/sessions/{}/messages",
                crate::transport::encode(session)
            ),
            Some(serde_json::to_value(request).map_err(|_| invalid("Invalid send request."))?),
            cancellation,
        )
        .await
    }
    /// One native SSE connection, without cursor replay or automatic acknowledgment.
    pub fn events(
        &self,
        session: Option<&str>,
        cancellation: CancellationToken,
    ) -> Pin<Box<dyn Stream<Item = Result<SignalEvent>> + Send>> {
        let client = self.clone();
        let path = session.map_or_else(
            || "/v1/events".into(),
            |id| format!("/v1/events?session_id={}", crate::transport::encode(id)),
        );
        Box::pin(async_stream::try_stream! {
            let response=client.open(reqwest::Method::GET,&path,None,&cancellation,"text/event-stream").await?;
            if !response.headers().get(reqwest::header::CONTENT_TYPE).and_then(|v|v.to_str().ok()).is_some_and(|v|v.starts_with("text/event-stream")) {Err(malformed())?;}
            let mut chunks=response.bytes_stream(); let mut parser=crate::stream::SseParser::default();
            loop {
                let next=tokio::select! {_=cancellation.cancelled()=>break, result=tokio::time::timeout(client.timeout,chunks.next())=>result};
                let Some(chunk)=next.map_err(|_|Error::local(ErrorKind::Timeout,"Signal event stream timed out.","request_timeout"))? else {break};
                for message in parser.feed(&chunk.map_err(|_|network())?)? {
                    let event:SignalEvent=serde_json::from_str(&message.data).map_err(|_|malformed())?;
                    if event.id.is_empty() || message.id.as_deref()!=Some(event.id.as_str()) || message.event!=event.event_type {Err(malformed())?;}
                    yield event;
                }
            }
        })
    }
}
/// Verify exact raw webhook bytes and a bounded timestamp window before parsing.
/// Durably deduplicate by event ID before returning a webhook 2xx response.
pub fn verify_signal_webhook(
    secret: &[u8],
    timestamp: i64,
    body: &[u8],
    signature: &str,
    now: i64,
    tolerance: Duration,
) -> Result<SignalEvent> {
    let reject = || {
        Error::local(
            ErrorKind::WebhookSignature,
            "Invalid Signal webhook signature or timestamp.",
            "invalid_signature",
        )
    };
    if timestamp.abs_diff(now) > tolerance.as_secs() {
        return Err(reject());
    }
    let digest = signature
        .strip_prefix("v1=")
        .and_then(|s| hex::decode(s).ok())
        .ok_or_else(reject)?;
    let mut mac = Hmac::<Sha256>::new_from_slice(secret).map_err(|_| reject())?;
    mac.update(timestamp.to_string().as_bytes());
    mac.update(b".");
    mac.update(body);
    mac.verify_slice(&digest).map_err(|_| reject())?;
    if body.len() > BODY_LIMIT {
        return Err(malformed());
    }
    let event: SignalEvent = serde_json::from_slice(body).map_err(|_| malformed())?;
    if event.id.is_empty() {
        return Err(malformed());
    }
    Ok(event)
}

impl SignalHistoryDescriptor {
    pub fn chunk_input(&self) -> Result<crate::history_chunks::HistoryChunkInput> {
        use crate::history_chunks::{HistoryChunkDescriptor, HistoryChunkInput};
        if let Some(inline) = &self.inline_payload {
            return Ok(HistoryChunkInput::Inline(
                STANDARD
                    .decode(inline)
                    .map_err(|_| invalid("Invalid history inline base64."))?,
            ));
        }
        let required = || invalid("History notification has no downloadable chunk descriptor.");
        Ok(HistoryChunkInput::Descriptor(HistoryChunkDescriptor {
            direct_path: self.direct_path.clone().ok_or_else(required)?,
            media_key: binary32(self.media_key.as_deref().ok_or_else(required)?)?,
            file_sha256: binary32(self.file_sha256.as_deref().ok_or_else(required)?)?,
            file_enc_sha256: binary32(self.file_enc_sha256.as_deref().ok_or_else(required)?)?,
            file_length: self.file_length,
        }))
    }
}
