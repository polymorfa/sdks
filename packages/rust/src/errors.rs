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

#[derive(Clone, Debug)]
pub struct Error {
    inner: Box<ErrorInfo>,
}
#[derive(Clone, Debug)]
pub struct ErrorInfo {
    pub kind: ErrorKind,
    pub message: String,
    pub code: Option<String>,
    pub status: Option<u16>,
    pub request_id: Option<String>,
    pub operation_id: Option<String>,
    pub request_log_url: Option<String>,
    pub doc_url: Option<String>,
    pub rate_limit_reason: Option<String>,
    pub details: Option<serde_json::Value>,
    pub metadata: Option<ResponseMetadata>,
}

impl Error {
    /// Create a local error from a caller-defined response decoder.
    pub fn new(kind: ErrorKind, message: impl Into<String>, code: &str) -> Self {
        Self::local(kind, message, code)
    }
    pub(crate) fn local(kind: ErrorKind, message: impl Into<String>, code: &str) -> Self {
        Self {
            inner: Box::new(ErrorInfo {
                kind,
                message: message.into(),
                code: Some(code.into()),
                status: None,
                request_id: None,
                operation_id: None,
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
            400 | 413 | 422 => ErrorKind::Validation,
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
                operation_id: metadata.operation_id.clone(),
                request_log_url: text("request_log_url"),
                doc_url: text("docs"),
                rate_limit_reason: metadata.headers.get("polymorfa-ratelimit-reason").cloned(),
                details: object.get("details").cloned(),
                metadata: Some(metadata),
            }),
        }
    }
    pub(crate) fn with_local_status(mut self, status: u16) -> Self {
        self.inner.status = Some(status);
        self
    }
    pub(crate) fn with_local_details(mut self, details: serde_json::Value) -> Self {
        self.inner.details = Some(details);
        self
    }
    pub(crate) fn with_metadata(mut self, metadata: ResponseMetadata) -> Self {
        self.inner.status = Some(metadata.status);
        self.inner.request_id = metadata.request_id.clone();
        self.inner.operation_id = metadata.operation_id.clone();
        self.inner.metadata = Some(metadata);
        self
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

/// Stable documented API codes. `Error::code` remains open to future API and SDK codes.
pub const POLYMORFA_ERROR_CODES: &[&str] = &[
    "invalid_parameter",
    "invalid_credential",
    "entitlement_required",
    "cloud_template_authority_restricted",
    "gate_limit_reached",
    "method_not_allowed",
    "permission_denied",
    "missing_scope",
    "resource_not_found",
    "hms_not_enabled",
    "media_fetch_failed",
    "resource_gone",
    "state_conflict",
    "rate_limit_exceeded",
    "internal_error",
    "operation_not_supported",
    "upstream_failure",
    "service_unavailable",
    "credential_verification_unavailable",
    "session_not_ready",
    "hybrid_routing_paused",
    "hybrid_automation_unavailable",
    "hybrid_transport_unavailable",
    "hybrid_target_reference_unavailable",
    "hybrid_choice_required",
    "hybrid_transition_ineligible",
    "send_outcome_unknown",
    "command_dispatch_failed",
    "result_unknown",
    "recipient_not_on_whatsapp",
    "conversation_window_closed",
    "template_not_approved",
    "media_too_large",
    "whatsapp_rate_limited",
    "new_chat_limit_reached",
    "whatsapp_account_restricted",
    "whatsapp_groups_ineligible",
    "whatsapp_group_creation_paused",
    "whatsapp_group_limit_reached",
    "whatsapp_group_full",
    "whatsapp_group_suspended",
    "whatsapp_group_has_no_participants",
    "order_status_transition_invalid",
    "order_cancellation_failed",
    "number_restricted",
    "bansafe_suspended",
    "bansafe_org_suspended",
    "bansafe_cold_blocked",
    "bansafe_cold_held",
    "bansafe_throttled",
    "bansafe_daily_allowance_reached",
    "bansafe_accounting_unavailable",
    "bansafe_send_outcome_unknown",
    "campaign_throughput_capped",
    "addon_required",
    "campaigns_not_entitled",
    "idempotency_completed",
    "idempotency_conflict",
    "idempotency_in_progress",
    "idempotency_outcome_unknown",
    "feature_unavailable",
    "stream_connection_limit_reached",
    "stream_cursor_expired",
    "stream_cursor_invalid",
    "payg_required",
    "premium_required",
    "call_claimed",
    "call_not_ringing",
    "call_permission_required",
    "calls_disabled",
    "call_recipient_opted_out",
    "call_destination_blocked",
    "call_permission_request_limited",
    "call_permission_granted",
    "call_opt_out_limit",
    "asset_not_ready",
    "connection_limit",
    "invalid_sip_trunk",
    "sip_trunk_in_use",
    "sip_trunk_limit",
    "sip_trunk_revision_conflict",
    "sip_unavailable",
    "provider_credential_invalid",
    "provider_unavailable",
    "voice_asset_in_use",
    "voice_asset_revision_conflict",
    "voice_not_enabled",
    "voice_unavailable",
    "unsupported_for_connection",
];

pub fn is_known_error_code(code: &str) -> bool {
    POLYMORFA_ERROR_CODES.contains(&code)
}

impl From<std::io::Error> for Error {
    fn from(_: std::io::Error) -> Self {
        Self::local(
            ErrorKind::Connection,
            "The I/O operation failed.",
            "connection_error",
        )
    }
}
