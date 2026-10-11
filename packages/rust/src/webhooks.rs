//! Verify the exact received bytes before JSON parsing. Native signatures do not
//! contain timestamps; applications deduplicate verified event IDs themselves.
use crate::{
    models::{ConversationReference, WhatsAppMessageIds},
    Error, ErrorKind, Result,
};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use hmac::{Hmac, Mac};
use serde::{Deserialize, Serialize};
use sha2::Sha256;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WebhookEnvelope {
    pub id: String,
    pub session: String,
    pub external_id: Option<String>,
    pub timestamp: String,
    pub event: String,
    pub payload: serde_json::Value,
}
#[derive(Clone, Debug)]
pub enum WebhookEvent {
    MessageReceived {
        envelope: WebhookEnvelope,
        payload: MessageEventPayload,
    },
    MessageSent {
        envelope: WebhookEnvelope,
        payload: MessageEventPayload,
    },
    SessionStatus {
        envelope: WebhookEnvelope,
        payload: SessionStatusPayload,
    },
    /// Other recognized event types preserve their payload until a typed model exists.
    Known(WebhookEnvelope),
    Unknown(WebhookEnvelope),
}
impl WebhookEvent {
    pub fn envelope(&self) -> &WebhookEnvelope {
        match self {
            Self::MessageReceived { envelope, .. }
            | Self::MessageSent { envelope, .. }
            | Self::SessionStatus { envelope, .. }
            | Self::Known(envelope)
            | Self::Unknown(envelope) => envelope,
        }
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MessageEventPayload {
    pub id: String,
    pub whatsapp_ids: WhatsAppMessageIds,
    pub conversation: ConversationReference,
    pub from_me: bool,
    pub timestamp: u64,
    pub push_name: String,
    pub is_group: bool,
    #[serde(rename = "type")]
    pub message_type: String,
    pub text: Option<String>,
    pub caption: Option<String>,
    pub mime_type: Option<String>,
    pub filename: Option<String>,
    #[serde(flatten)]
    pub extra: std::collections::BTreeMap<String, serde_json::Value>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionStatusPayload {
    pub status: String,
    #[serde(flatten)]
    pub extra: std::collections::BTreeMap<String, serde_json::Value>,
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
pub fn construct_event(raw_body: &[u8], signature: &str, secret: &str) -> Result<WebhookEvent> {
    if !verify_signature(raw_body, signature, secret) {
        return Err(signature_error());
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
    let envelope: WebhookEnvelope = serde_json::from_slice(raw_body).map_err(|_| {
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
    let decode = |payload| {
        serde_json::from_value(payload).map_err(|_| {
            Error::local(
                ErrorKind::Validation,
                "Webhook payload is invalid.",
                "invalid_webhook_event",
            )
        })
    };
    match envelope.event.as_str() {
        "message.received" => Ok(WebhookEvent::MessageReceived {
            payload: decode(payload)?,
            envelope,
        }),
        "message.sent" => Ok(WebhookEvent::MessageSent {
            payload: decode(payload)?,
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
        event if KNOWN_EVENT_TYPES.contains(&event) => Ok(WebhookEvent::Known(envelope)),
        _ => Ok(WebhookEvent::Unknown(envelope)),
    }
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
        return Err(signature_error());
    }
    let Some((time, hash)) = signature
        .strip_prefix("t=")
        .and_then(|s| s.split_once(",v1="))
    else {
        return Err(signature_error());
    };
    if time.is_empty()
        || !time.bytes().all(|b| b.is_ascii_digit())
        || !hash
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
    {
        return Err(signature_error());
    }
    let timestamp: u64 = time.parse().map_err(|_| signature_error())?;
    if timestamp > 9_007_199_254_740_991 || now_unix_seconds.abs_diff(timestamp) > tolerance_seconds
    {
        return Err(signature_error());
    }
    let mut body = format!("{timestamp}.").into_bytes();
    body.extend_from_slice(raw_body);
    if !verify(&body, hash, &key) {
        return Err(signature_error());
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
