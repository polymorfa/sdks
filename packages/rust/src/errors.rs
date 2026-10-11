use crate::transport::ResponseMetadata;
use std::fmt;

pub type Result<T> = std::result::Result<T, Error>;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ErrorKind {
    Configuration,
    Authentication,
    Authorization,
    PaymentRequired,
    Validation,
    NotFound,
    Conflict,
    RateLimit,
    Server,
    Connection,
    Timeout,
    Cancelled,
    Api,
    WebhookSignature,
    MediaIntegrity,
}

#[derive(Debug)]
pub struct Error {
    inner: Box<ErrorInfo>,
}
#[derive(Debug)]
pub struct ErrorInfo {
    pub kind: ErrorKind,
    pub message: String,
    pub code: Option<String>,
    pub status: Option<u16>,
    pub request_id: Option<String>,
    pub request_log_url: Option<String>,
    pub doc_url: Option<String>,
    pub rate_limit_reason: Option<String>,
    pub details: Option<serde_json::Value>,
    pub metadata: Option<ResponseMetadata>,
}

impl Error {
    pub(crate) fn local(kind: ErrorKind, message: impl Into<String>, code: &str) -> Self {
        Self {
            inner: Box::new(ErrorInfo {
                kind,
                message: message.into(),
                code: Some(code.into()),
                status: None,
                request_id: None,
                request_log_url: None,
                doc_url: None,
                rate_limit_reason: None,
                details: None,
                metadata: None,
            }),
        }
    }
    pub(crate) fn response(data: &serde_json::Value, metadata: ResponseMetadata) -> Self {
        let status = metadata.status;
        let object = data.get("error").filter(|v| v.is_object()).unwrap_or(data);
        let text = |name: &str| object.get(name).and_then(|v| v.as_str()).map(str::to_owned);
        let kind = match status {
            400 | 422 => ErrorKind::Validation,
            401 => ErrorKind::Authentication,
            402 => ErrorKind::PaymentRequired,
            403 => ErrorKind::Authorization,
            404 => ErrorKind::NotFound,
            409 => ErrorKind::Conflict,
            429 => ErrorKind::RateLimit,
            500..=599 => ErrorKind::Server,
            _ => ErrorKind::Api,
        };
        Self {
            inner: Box::new(ErrorInfo {
                kind,
                message: text("message")
                    .unwrap_or_else(|| format!("Polymorfa returned HTTP {status}.")),
                code: text("code"),
                status: Some(status),
                request_id: text("request_id").or_else(|| metadata.request_id.clone()),
                request_log_url: text("request_log_url"),
                doc_url: text("docs"),
                rate_limit_reason: metadata.headers.get("polymorfa-ratelimit-reason").cloned(),
                details: object.get("details").cloned(),
                metadata: Some(metadata),
            }),
        }
    }
}
impl std::ops::Deref for Error {
    type Target = ErrorInfo;
    fn deref(&self) -> &Self::Target {
        &self.inner
    }
}
impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.message)
    }
}
impl std::error::Error for Error {}
