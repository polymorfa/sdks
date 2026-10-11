//! Typed call control operations shared by server and scoped client principals.
use crate::{
    calls::{AcceptCallResult, Participant},
    models::*,
    transport::{configuration, encode, HttpTransport},
    ApiResponse, RequestOptions, Result,
};
use reqwest::Method;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(untagged)]
pub enum CallDestination {
    To {
        to: String,
    },
    Participants {
        participants: Vec<String>,
    },
    Group {
        #[serde(rename = "groupId")]
        group_id: String,
    },
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaceCallRequest {
    #[serde(flatten)]
    pub destination: CallDestination,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub session: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub video: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub exclusive: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub participant: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaceCallResult {
    pub call_id: String,
    pub session: String,
    pub video: bool,
}
#[derive(Clone, Debug, Serialize, Deserialize, Default)]
pub struct AcceptCallRequest {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub exclusive: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub video: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub participant: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize, Default)]
pub struct RejectCallRequest {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub participant: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LeaveCallRequest {
    pub connection_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub participant: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AddParticipantRequest {
    pub to: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CreateCallLinkRequest {
    pub session: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub video: Option<bool>,
}
#[derive(Clone, Serialize, Deserialize)]
pub struct PreviewCallLinkRequest {
    pub session: String,
    pub token: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub video: Option<bool>,
}
#[derive(Clone, Serialize, Deserialize)]
pub struct CreatedCallLink {
    pub session: String,
    pub token: String,
    pub url: String,
    pub video: bool,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewedCallLink {
    pub session: String,
    pub video: bool,
    pub creator: ConversationReference,
    pub approval_required: bool,
    pub is_admin: bool,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CallReactionRequest {
    pub connection_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub participant: Option<String>,
    pub emoji: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HandRaisedRequest {
    pub connection_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub participant: Option<String>,
    pub raised: bool,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionCallSettings {
    pub calls_enabled: bool,
    pub conference_mode: bool,
    pub inbound_route: String,
    pub sip_trunk_id: Option<String>,
    pub sip_claim: bool,
    pub host_cloud_api_calls: bool,
    pub revision: u64,
    pub updated_at: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct UpdateSessionCallSettingsRequest {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub calls_enabled: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub conference_mode: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub inbound_route: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(
        default,
        deserialize_with = "crate::configuration::deserialize_present_option"
    )]
    pub sip_trunk_id: Option<Option<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sip_claim: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub host_cloud_api_calls: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expected_revision: Option<u64>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CallPermissionLimit {
    pub period: String,
    pub max_allowed: u64,
    pub used: u64,
    pub resets_at: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CallPermissionAction {
    pub allowed: bool,
    pub limits: Vec<CallPermissionLimit>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CallPermissionActions {
    pub request_permission: Option<CallPermissionAction>,
    pub start_call: Option<CallPermissionAction>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CallPermissionState {
    pub status: String,
    pub expires_at: Option<String>,
    pub source: Option<String>,
    pub updated_at: Option<String>,
    pub checked_at: Option<String>,
    pub fresh: bool,
    pub actions: Option<CallPermissionActions>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CallPermission {
    #[serde(flatten)]
    pub state: CallPermissionState,
    pub conversation: ConversationReference,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CheckCallRequest {
    pub session: String,
    pub to: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CallCheck {
    pub allowed: bool,
    pub refusal: Option<String>,
    pub permission: Option<CallPermissionState>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CallReportClient {
    pub sdk: String,
    pub version: String,
    pub platform: String,
}
#[derive(Clone, Debug, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CallQuality {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rtt_ms: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub jitter_ms: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub packets_lost: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub packets_received: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub audio_codec: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub video_codec: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub candidate_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reconnects: Option<u32>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CallErrorReport {
    pub code: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum CallReportDetails {
    Quality { quality: CallQuality },
    Error { error: CallErrorReport },
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CallReportRequest {
    pub connection_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub participant: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub client: Option<CallReportClient>,
    #[serde(flatten)]
    pub details: CallReportDetails,
}

pub struct Voip<'a>(pub(crate) &'a HttpTransport);
impl Voip<'_> {
    fn participant(&self, participant: Option<&str>) -> Result<()> {
        if let Some(value) = participant {
            if matches!(self.0.credential, Some(crate::Credential::ClientToken(_)))
                || value.is_empty()
                || value.len() > 128
                || !value
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b"._:@-".contains(&b))
            {
                return Err(configuration("participant"));
            }
        }
        Ok(())
    }
    pub async fn place(
        &self,
        body: &PlaceCallRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<PlaceCallResult>>> {
        if !matches!(self.0.credential, Some(crate::Credential::ClientToken(_)))
            && body.session.as_ref().is_none_or(|s| s.trim().is_empty())
        {
            return Err(configuration("session"));
        }
        self.participant(body.participant.as_deref())?;
        match &body.destination {
            CallDestination::To { to } if !destination(to) => return Err(configuration("to")),
            CallDestination::Group { group_id } if !public_id(group_id) => {
                return Err(configuration("group_id"))
            }
            CallDestination::Participants { participants } => {
                let unique: std::collections::BTreeSet<_> = participants.iter().collect();
                if !(2..=31).contains(&participants.len())
                    || unique.len() != participants.len()
                    || participants.iter().any(|p| !destination(p))
                {
                    return Err(configuration("participants"));
                }
            }
            _ => {}
        }
        self.0
            .request(
                Method::POST,
                "/messaging/voip/calls",
                &[],
                Some(body),
                options,
            )
            .await
    }
    pub async fn accept(
        &self,
        call_id: &str,
        body: &AcceptCallRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<AcceptCallResult>>> {
        self.participant(body.participant.as_deref())?;
        self.0
            .request(
                Method::POST,
                &path(call_id, "accept"),
                &[],
                Some(body),
                options,
            )
            .await
    }
    pub async fn reject(
        &self,
        call_id: &str,
        body: &RejectCallRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessResponse>> {
        self.participant(body.participant.as_deref())?;
        self.0
            .request(
                Method::POST,
                &path(call_id, "reject"),
                &[],
                body.participant.as_ref().map(|_| body),
                options,
            )
            .await
    }
    pub async fn leave(
        &self,
        call_id: &str,
        body: &LeaveCallRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessResponse>> {
        connection(&body.connection_id)?;
        self.participant(body.participant.as_deref())?;
        self.0
            .request(
                Method::POST,
                &path(call_id, "leave"),
                &[],
                Some(body),
                options,
            )
            .await
    }
    pub async fn end(
        &self,
        call_id: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessResponse>> {
        self.0
            .request::<_, ()>(
                Method::DELETE,
                &format!("/messaging/voip/calls/{}", encode(call_id)),
                &[],
                None,
                options,
            )
            .await
    }
    pub async fn add_participant(
        &self,
        call_id: &str,
        body: &AddParticipantRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<Participant>>> {
        self.0
            .request(
                Method::POST,
                &path(call_id, "participants"),
                &[],
                Some(body),
                options,
            )
            .await
    }
    pub async fn ring_participant(
        &self,
        call_id: &str,
        body: &AddParticipantRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessResponse>> {
        self.0
            .request(
                Method::POST,
                &path(call_id, "participants/ring"),
                &[],
                Some(body),
                options,
            )
            .await
    }
    pub async fn send_reaction(
        &self,
        call_id: &str,
        body: &CallReactionRequest,
        mut options: RequestOptions,
    ) -> Result<ApiResponse<SuccessResponse>> {
        connection(&body.connection_id)?;
        self.participant(body.participant.as_deref())?;
        if !["", "👍", "❤️", "😂", "😮", "😢", "🙏"].contains(&body.emoji.as_str()) {
            return Err(configuration("emoji"));
        }
        options.max_network_retries = Some(0);
        self.0
            .request(
                Method::POST,
                &path(call_id, "reaction"),
                &[],
                Some(body),
                options,
            )
            .await
    }
    pub async fn set_hand_raised(
        &self,
        call_id: &str,
        body: &HandRaisedRequest,
        mut options: RequestOptions,
    ) -> Result<ApiResponse<SuccessResponse>> {
        connection(&body.connection_id)?;
        self.participant(body.participant.as_deref())?;
        options.max_network_retries = Some(0);
        self.0
            .request(
                Method::POST,
                &path(call_id, "hand"),
                &[],
                Some(body),
                options,
            )
            .await
    }
    pub async fn create_call_link(
        &self,
        body: &CreateCallLinkRequest,
        mut options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<CreatedCallLink>>> {
        self.link(&body.session, &options)?;
        options.max_network_retries = Some(0);
        self.0
            .request(
                Method::POST,
                "/messaging/voip/call-links",
                &[],
                Some(body),
                options,
            )
            .await
    }
    pub async fn preview_call_link(
        &self,
        body: &PreviewCallLinkRequest,
        mut options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<PreviewedCallLink>>> {
        self.link(&body.session, &options)?;
        if body.token.is_empty()
            || body.token.len() > 256
            || !body
                .token
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b"_-".contains(&b))
        {
            return Err(configuration("call-link token"));
        }
        options.max_network_retries = Some(0);
        self.0
            .request(
                Method::POST,
                "/messaging/voip/call-links/preview",
                &[],
                Some(body),
                options,
            )
            .await
    }
    fn link(&self, session: &str, options: &RequestOptions) -> Result<()> {
        self.0.server()?;
        if session.trim().is_empty()
            || session.len() > 128
            || options.idempotency_key.is_some()
            || options
                .headers
                .keys()
                .any(|name| name.eq_ignore_ascii_case("idempotency-key"))
        {
            return Err(configuration("call link"));
        }
        Ok(())
    }
    pub async fn retrieve_call_settings(
        &self,
        session: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<SessionCallSettings>>> {
        self.0.server()?;
        self.0
            .get(
                &format!("/platform/sessions/{}/call-settings", encode(session)),
                options,
            )
            .await
    }
    pub async fn update_call_settings(
        &self,
        session: &str,
        body: &UpdateSessionCallSettingsRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<SessionCallSettings>>> {
        self.0.server()?;
        if body.calls_enabled.is_none()
            && body.conference_mode.is_none()
            && body.inbound_route.is_none()
            && body.sip_trunk_id.is_none()
            && body.sip_claim.is_none()
            && body.host_cloud_api_calls.is_none()
        {
            return Err(configuration("call settings: specify a setting"));
        }
        if body
            .inbound_route
            .as_ref()
            .is_some_and(|route| !matches!(route.as_str(), "clients" | "sip_trunk"))
        {
            return Err(configuration("inbound_route"));
        }
        self.0
            .request(
                Method::PUT,
                &format!("/platform/sessions/{}/call-settings", encode(session)),
                &[],
                Some(body),
                options,
            )
            .await
    }
    pub async fn retrieve_call_permission(
        &self,
        session: &str,
        to: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<CallPermission>>> {
        self.0.server()?;
        if session.trim().is_empty() || to.trim().is_empty() {
            return Err(configuration("session or to"));
        }
        self.0
            .get(
                &format!(
                    "/messaging/{}/call-permissions/{}",
                    encode(session),
                    encode(to)
                ),
                options,
            )
            .await
    }
    pub async fn check(
        &self,
        body: &CheckCallRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<CallCheck>>> {
        self.0.server()?;
        if body.session.trim().is_empty() || body.to.trim().is_empty() {
            return Err(configuration("session or to"));
        }
        self.0
            .request(
                Method::POST,
                "/messaging/voip/calls/check",
                &[],
                Some(body),
                options,
            )
            .await
    }
    pub async fn report(
        &self,
        call_id: &str,
        body: &CallReportRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessResponse>> {
        connection(&body.connection_id)?;
        self.participant(body.participant.as_deref())?;
        validate_report(body)?;
        self.0
            .request(
                Method::POST,
                &path(call_id, "reports"),
                &[],
                Some(body),
                options,
            )
            .await
    }
}
fn path(call_id: &str, action: &str) -> String {
    format!("/messaging/voip/calls/{}/{action}", encode(call_id))
}
fn public_id(value: &str) -> bool {
    (1..=19).contains(&value.len())
        && value.as_bytes()[0] != b'0'
        && value.bytes().all(|b| b.is_ascii_digit())
}
fn destination(value: &str) -> bool {
    match value.strip_prefix('+') {
        Some(phone) => (2..=15).contains(&phone.len()) && public_id(phone),
        None => public_id(value),
    }
}
fn connection(id: &str) -> Result<()> {
    if !(8..=64).contains(&id.len())
        || !id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"_-".contains(&b))
    {
        return Err(configuration("connection_id"));
    }
    Ok(())
}
fn validate_report(body: &CallReportRequest) -> Result<()> {
    match &body.details {
        CallReportDetails::Error { error } => {
            if ![
                "media_permission_denied",
                "device_not_found",
                "device_in_use",
                "ice_failed",
                "negotiation_failed",
                "media_timeout",
                "reconnect_exhausted",
                "token_refresh_failed",
                "unsupported_browser",
                "other",
            ]
            .contains(&error.code.as_str())
            {
                return Err(configuration("call error code"));
            }
        }
        CallReportDetails::Quality { quality } => {
            if quality.rtt_ms.is_some_and(|v| v > 60000)
                || quality.jitter_ms.is_some_and(|v| v > 60000)
                || quality.packets_lost.is_some_and(|v| v > i32::MAX as u32)
                || quality
                    .packets_received
                    .is_some_and(|v| v > i32::MAX as u32)
                || quality.reconnects.is_some_and(|v| v > 1000)
            {
                return Err(configuration("quality"));
            }
            if quality.rtt_ms.is_none()
                && quality.jitter_ms.is_none()
                && quality.packets_lost.is_none()
                && quality.packets_received.is_none()
                && quality.audio_codec.is_none()
                && quality.video_codec.is_none()
                && quality.candidate_type.is_none()
                && quality.reconnects.is_none()
            {
                return Err(configuration("quality: at least one measurement required"));
            }
            if quality
                .candidate_type
                .as_ref()
                .is_some_and(|v| !["host", "srflx", "prflx", "relay"].contains(&v.as_str()))
            {
                return Err(configuration("candidate_type"));
            }
            for codec in [&quality.audio_codec, &quality.video_codec]
                .into_iter()
                .flatten()
            {
                if codec.is_empty()
                    || codec.len() > 32
                    || !codec
                        .bytes()
                        .all(|b| b.is_ascii_alphanumeric() || b"/.-".contains(&b))
                {
                    return Err(configuration("codec"));
                }
            }
        }
    }
    if let Some(client) = &body.client {
        if client.sdk.is_empty()
            || client.sdk.len() > 32
            || !client
                .sdk
                .bytes()
                .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b"@/._-".contains(&b))
            || !["browser", "node", "other"].contains(&client.platform.as_str())
        {
            return Err(configuration("report client"));
        }
        let mut version = client.version.splitn(2, ['-', '+']);
        let main = version.next().unwrap_or("");
        let parts: Vec<_> = main.split('.').collect();
        let invalid_suffix = version.next().is_some_and(|suffix| {
            suffix.is_empty()
                || suffix.len() > 24
                || !suffix
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b".+-".contains(&b))
        });
        if client.version.len() > 32
            || invalid_suffix
            || parts.len() != 3
            || parts
                .iter()
                .any(|p| p.is_empty() || p.len() > 6 || !p.bytes().all(|b| b.is_ascii_digit()))
        {
            return Err(configuration("report client version"));
        }
    }
    Ok(())
}
