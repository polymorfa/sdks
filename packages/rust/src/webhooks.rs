//! Verify the exact received bytes before JSON parsing. Native signatures do not
//! contain timestamps; applications deduplicate verified event IDs themselves.
pub use crate::webhook_payloads::*;
use crate::{Error, ErrorKind, Result};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use hmac::{Hmac, Mac};
use serde::{Deserialize, Serialize};
use sha2::Sha256;

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WebhookEnvelope {
    pub id: String,
    pub session: String,
    pub external_id: Option<String>,
    pub timestamp: String,
    pub event: String,
    pub payload: serde_json::Value,
}
impl std::fmt::Debug for WebhookEnvelope {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let payload: &dyn std::fmt::Debug =
            if self.event == "history.sync" && self.payload.get("delivery").is_some() {
                &"[redacted history descriptor]"
            } else {
                &self.payload
            };
        f.debug_struct("WebhookEnvelope")
            .field("id", &self.id)
            .field("session", &self.session)
            .field("timestamp", &self.timestamp)
            .field("event", &self.event)
            .field("payload", payload)
            .finish()
    }
}

#[derive(Clone, Debug)]
pub enum WebhookEvent {
    MessageReceived {
        envelope: WebhookEnvelope,
        payload: MessageReceivedPayload,
    },
    MessageSent {
        envelope: WebhookEnvelope,
        payload: Box<MessageSentPayload>,
    },
    SessionStatus {
        envelope: WebhookEnvelope,
        payload: SessionStatusPayload,
    },
    Known {
        envelope: WebhookEnvelope,
        payload: KnownWebhookPayload,
    },
    Unknown(WebhookEnvelope),
}
impl WebhookEvent {
    pub fn envelope(&self) -> &WebhookEnvelope {
        match self {
            Self::MessageReceived { envelope, .. }
            | Self::MessageSent { envelope, .. }
            | Self::SessionStatus { envelope, .. }
            | Self::Known { envelope, .. }
            | Self::Unknown(envelope) => envelope,
        }
    }
}

pub fn verify_signature(raw_body: &[u8], signature: &str, secret: &str) -> bool {
    if secret.is_empty() {
        return false;
    }
    verify(
        raw_body,
        signature.strip_prefix("sha256=").unwrap_or(signature),
        secret.as_bytes(),
    )
}
fn verify(body: &[u8], signature: &str, secret: &[u8]) -> bool {
    if signature.len() != 64 {
        return false;
    }
    let Ok(expected) = hex::decode(signature) else {
        return false;
    };
    let Ok(mut mac) = Hmac::<Sha256>::new_from_slice(secret) else {
        return false;
    };
    mac.update(body);
    mac.verify_slice(&expected).is_ok()
}

/// Header on a decrypted WhatsApp Flow request forwarded to your endpoint.
pub const FLOW_FORWARD_SIGNATURE_HEADER: &str = "x-polymorfa-flow-signature";

#[derive(Clone, Copy, Debug)]
pub struct VerifyFlowForwardSignatureOptions {
    /// Allowed age or clock skew in seconds, including fractional seconds.
    pub tolerance_seconds: f64,
    /// Current Unix time in milliseconds. None uses the system clock.
    pub now_millis: Option<f64>,
}
impl Default for VerifyFlowForwardSignatureOptions {
    fn default() -> Self {
        Self {
            tolerance_seconds: 300.0,
            now_millis: None,
        }
    }
}

/// Verify the exact forwarded Flow body and its timestamp without parsing JSON.
/// The original timestamp text is signed, including any leading zeroes.
pub fn verify_flow_forward_signature(
    raw_body: &[u8],
    signature_header: Option<&str>,
    secret: &str,
    options: VerifyFlowForwardSignatureOptions,
) -> bool {
    if secret.is_empty() {
        return false;
    }
    let Some((time, hash)) = signature_header
        .and_then(|header| {
            header
                .trim_matches(|c| {
                    matches!(c,
                        '\u{0009}'..='\u{000d}' | ' ' | '\u{00a0}' | '\u{1680}' |
                        '\u{2000}'..='\u{200a}' | '\u{2028}' | '\u{2029}' | '\u{202f}' |
                        '\u{205f}' | '\u{3000}' | '\u{feff}'
                    )
                })
                .strip_prefix("t=")
        })
        .and_then(|header| header.split_once(",v1="))
    else {
        return false;
    };
    if time.is_empty()
        || time.len() > 12
        || !time.bytes().all(|b| b.is_ascii_digit())
        || hash.len() != 64
        || !hash.bytes().all(|b| b.is_ascii_hexdigit())
    {
        return false;
    }
    let Ok(timestamp) = time.parse::<f64>() else {
        return false;
    };
    let now_millis = options.now_millis.unwrap_or_else(|| {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|time| time.as_secs_f64() * 1000.0)
            .unwrap_or(f64::NAN)
    });
    let now_seconds = now_millis / 1000.0;
    if !options.tolerance_seconds.is_finite()
        || !now_seconds.is_finite()
        || options.tolerance_seconds < 0.0
        || (now_seconds - timestamp).abs() > options.tolerance_seconds
    {
        return false;
    }
    let mut signed = format!("{time}.").into_bytes();
    signed.extend_from_slice(raw_body);
    verify(&signed, hash, secret.as_bytes())
}

/// Signed bytes and headers for exercising your webhook handler locally.
/// Body contents may contain customer data; this type deliberately has no Debug.
pub struct WebhookFixture {
    pub body: Vec<u8>,
    pub content_type: &'static str,
    pub signature: String,
    pub headers: std::collections::BTreeMap<String, String>,
}

pub fn create_fixture(event: &WebhookEvent, secret: &str) -> Result<WebhookFixture> {
    let body = serde_json::to_vec(event.envelope()).map_err(|_| {
        Error::local(
            ErrorKind::Validation,
            "Webhook fixture event cannot be encoded.",
            "invalid_webhook_event",
        )
    })?;
    // HMAC accepts an empty key for fixture generation, as the pinned TS helper
    // does. Verification deliberately refuses an empty configured secret.
    let mut mac =
        Hmac::<Sha256>::new_from_slice(secret.as_bytes()).map_err(|_| signature_error())?;
    mac.update(&body);
    let signature = hex::encode(mac.finalize().into_bytes());
    let content_type = "application/json";
    let headers = std::collections::BTreeMap::from([
        ("content-type".into(), content_type.into()),
        ("x-webhook-signature".into(), signature.clone()),
    ]);
    Ok(WebhookFixture {
        body,
        content_type,
        signature,
        headers,
    })
}
pub fn construct_event(raw_body: &[u8], signature: &str, secret: &str) -> Result<WebhookEvent> {
    if !verify_signature(raw_body, signature, secret) {
        return Err(Error::local(
            ErrorKind::Authentication,
            "Webhook signature verification failed.",
            "invalid_webhook_signature",
        ));
    }
    parse_verified_event(raw_body)
}
pub fn parse_verified_event(raw_body: &[u8]) -> Result<WebhookEvent> {
    std::str::from_utf8(raw_body).map_err(|_| {
        Error::local(
            ErrorKind::Validation,
            "Webhook body must contain valid UTF-8.",
            "invalid_webhook_body",
        )
    })?;
    let value: serde_json::Value = serde_json::from_slice(raw_body).map_err(|_| {
        Error::local(
            ErrorKind::Validation,
            "Webhook body must contain valid JSON.",
            "invalid_webhook_json",
        )
    })?;
    let envelope: WebhookEnvelope = serde_json::from_value(value).map_err(|_| {
        Error::local(
            ErrorKind::Validation,
            "Webhook body is not a valid event envelope.",
            "invalid_webhook_event",
        )
    })?;
    if envelope.id.is_empty() || envelope.timestamp.is_empty() || envelope.event.is_empty() {
        return Err(Error::local(
            ErrorKind::Validation,
            "Webhook body is not a valid event envelope.",
            "invalid_webhook_event",
        ));
    }
    let payload = envelope.payload.clone();
    match envelope.event.as_str() {
        "message.received" => Ok(WebhookEvent::MessageReceived {
            payload: decode_payload(payload)?,
            envelope,
        }),
        "message.sent" => Ok(WebhookEvent::MessageSent {
            payload: decode_payload(payload)?,
            envelope,
        }),
        "session.status" => Ok(WebhookEvent::SessionStatus {
            payload: serde_json::from_value(payload).map_err(|_| {
                Error::local(
                    ErrorKind::Validation,
                    "Webhook payload is invalid.",
                    "invalid_webhook_event",
                )
            })?,
            envelope,
        }),
        event if KNOWN_EVENT_TYPES.contains(&event) => {
            let typed =
                serde_json::from_value(serde_json::json!({"event":event,"payload":payload}))
                    .map_err(|_| {
                        Error::local(
                            ErrorKind::Validation,
                            "Webhook payload is invalid.",
                            "invalid_webhook_event",
                        )
                    })?;
            Ok(WebhookEvent::Known {
                envelope,
                payload: typed,
            })
        }
        _ => Ok(WebhookEvent::Unknown(envelope)),
    }
}
fn decode_payload<T: serde::de::DeserializeOwned>(value: serde_json::Value) -> Result<T> {
    serde_json::from_value(value).map_err(|_| {
        Error::local(
            ErrorKind::Validation,
            "Webhook payload is invalid.",
            "invalid_webhook_event",
        )
    })
}
/// CLI local-forward signatures use a 32-byte base64url secret and bind timestamp.
/// The tolerance limits age; deduplicate the verified event ID to prevent replay.
pub fn construct_local_event(
    raw_body: &[u8],
    signature: &str,
    secret: &str,
    now_unix_seconds: u64,
    tolerance_seconds: u64,
) -> Result<WebhookEvent> {
    let key = URL_SAFE_NO_PAD
        .decode(secret)
        .map_err(|_| signature_error())?;
    if key.len() != 32 || secret.len() != 43 {
        return Err(Error::local(
            ErrorKind::Authentication,
            "Webhook signature verification failed.",
            "invalid_webhook_signature",
        ));
    }
    let Some((time, hash)) = signature
        .strip_prefix("t=")
        .and_then(|s| s.split_once(",v1="))
    else {
        return Err(Error::local(
            ErrorKind::Authentication,
            "Webhook signature verification failed.",
            "invalid_webhook_signature",
        ));
    };
    if time.is_empty()
        || !time.bytes().all(|b| b.is_ascii_digit())
        || !hash
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
    {
        return Err(Error::local(
            ErrorKind::Authentication,
            "Webhook signature verification failed.",
            "invalid_webhook_signature",
        ));
    }
    let timestamp: u64 = time.parse().map_err(|_| signature_error())?;
    if timestamp > 9_007_199_254_740_991 || now_unix_seconds.abs_diff(timestamp) > tolerance_seconds
    {
        return Err(Error::local(
            ErrorKind::Authentication,
            "Webhook signature verification failed.",
            "invalid_webhook_signature",
        ));
    }
    let mut body = format!("{timestamp}.").into_bytes();
    body.extend_from_slice(raw_body);
    if !verify(&body, hash, &key) {
        return Err(Error::local(
            ErrorKind::Authentication,
            "Webhook signature verification failed.",
            "invalid_webhook_signature",
        ));
    }
    parse_verified_event(raw_body)
}
fn signature_error() -> Error {
    Error::local(
        ErrorKind::WebhookSignature,
        "Webhook signature verification failed.",
        "invalid_webhook_signature",
    )
}
pub const KNOWN_EVENT_TYPES: &[&str] = &[
    "marketing.onboarding_updated",
    "contact.marketing_preference_updated",
    "bansafe.action",
    "bansafe.claim",
    "bansafe.health_threshold",
    "bansafe.incident",
    "blocklist.update",
    "business.quick_reply.update",
    "call.accepted",
    "call.connection_joined",
    "call.connection_left",
    "call.ended",
    "call.missed",
    "call.participant_joined",
    "call.participant_left",
    "call.participant_state",
    "call.permission_changed",
    "call.received",
    "call.rejected",
    "call.telemetry",
    "campaign.cap_reached",
    "campaign.cold_blocked",
    "campaign.completed",
    "campaign.failed",
    "campaign.launched",
    "campaign.paused",
    "campaign.recipient_failed",
    "campaign.recipient_sent",
    "campaign.recipient_skipped",
    "campaign.rescheduled",
    "campaign.resumed",
    "campaign.stopped",
    "campaign.throttled",
    "chat.archive",
    "chat.clear",
    "chat.delete",
    "chat.mute",
    "chat.read",
    "command.result",
    "contact.opted_in",
    "contact.opted_out",
    "contact.sync",
    "contact.update",
    "customer.archived",
    "customer.archiving",
    "customer.created",
    "customer.enabled",
    "customer.number.attached",
    "customer.number.disconnected",
    "customer.number.transferred",
    "customer.pairing_link.connected",
    "customer.pairing_link.created",
    "customer.pairing_link.expired",
    "customer.pairing_link.failed",
    "customer.pairing_link.opened",
    "customer.pairing_link.revoked",
    "customer.restored",
    "customer.updated",
    "group.participant",
    "group.update",
    "history.sync",
    "labels.update",
    "message.ack",
    "message.delete",
    "message.echo",
    "message.edited",
    "message.failed",
    "message.reaction",
    "message.received",
    "message.revoked",
    "message.sent",
    "message.update",
    "message.vote",
    "newsletter.update",
    "order.payment_updated",
    "presence.update",
    "session.capabilities_updated",
    "session.connected",
    "session.logged_out",
    "session.phone_offline",
    "session.restriction_updated",
    "session.status",
    "template.status",
    "usage.recorded",
    "voice.asset_failed",
    "voice.asset_ready",
];

#[derive(Clone, Debug)]
pub struct WebhookEventBatch {
    pub object: String,
    pub version: u32,
    pub id: String,
    pub events: Vec<WebhookEvent>,
}
#[derive(Clone, Debug)]
pub enum WebhookDelivery {
    Single(Box<WebhookEvent>),
    Batch(WebhookEventBatch),
}
/// Authenticate the entire original envelope before dispatch. Deduplicate all IDs.
pub fn construct_delivery(raw: &[u8], signature: &str, secret: &str) -> Result<WebhookDelivery> {
    if !verify_signature(raw, signature, secret) {
        return Err(Error::local(
            ErrorKind::Authentication,
            "Webhook signature verification failed.",
            "invalid_webhook_signature",
        ));
    }
    parse_verified_delivery(raw)
}
pub fn parse_verified_delivery(raw: &[u8]) -> Result<WebhookDelivery> {
    let value: serde_json::Value = serde_json::from_slice(raw).map_err(|_| {
        Error::local(
            ErrorKind::Validation,
            "Invalid webhook JSON.",
            "invalid_webhook_json",
        )
    })?;
    if value.get("object").and_then(|v| v.as_str()) != Some("event_batch") {
        return parse_verified_event(raw).map(|event| WebhookDelivery::Single(Box::new(event)));
    }
    let fail = || {
        Error::local(
            ErrorKind::Validation,
            "Invalid version 1 event batch.",
            "invalid_webhook_batch",
        )
    };
    let obj = value.as_object().ok_or_else(fail)?;
    let id = value.get("id").and_then(|v| v.as_str()).ok_or_else(fail)?;
    if obj.len() != 4
        || value.get("version").and_then(|v| v.as_u64()) != Some(1)
        || id.len() != 36
        || uuid::Uuid::parse_str(id).is_err()
    {
        return Err(fail());
    }
    let members = value
        .get("events")
        .and_then(|v| v.as_array())
        .ok_or_else(fail)?;
    if members.is_empty() || members.len() > 100 {
        return Err(fail());
    }
    let mut events = Vec::with_capacity(members.len());
    for m in members {
        if m.get("object").is_some() {
            return Err(fail());
        }
        let bytes = serde_json::to_vec(m).map_err(|_| fail())?;
        events.push(parse_verified_event(&bytes)?)
    }
    Ok(WebhookDelivery::Batch(WebhookEventBatch {
        object: "event_batch".into(),
        version: 1,
        id: id.into(),
        events,
    }))
}
