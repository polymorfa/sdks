//! Organization-owned Number lifecycle, reviewed tier changes and resolved safety settings.
use crate::{
    models::*,
    transport::{configuration, encode, HttpTransport},
    ApiResponse, RequestOptions, Result,
};
use reqwest::Method;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionProjectContext {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub project_id: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionBatchRequest {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub project_id: Option<String>,
    pub session_ids: Vec<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SessionBatchStopResult {
    pub stopping: u32,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SessionBatchRemoveResult {
    pub removed: u32,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum NumberTier {
    Free,
    Standard,
    Pro,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum HybridTransport {
    LinkedDevices,
    OfficialApi,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(
    tag = "action",
    rename_all = "snake_case",
    rename_all_fields = "camelCase"
)]
pub enum HybridResolution {
    Keep {
        transport: HybridTransport,
    },
    Split {
        existing_number_transport: HybridTransport,
        new_number_name: String,
    },
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HybridMerge {
    pub absorb_number_id: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NumberTierQuoteRequest {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub project_id: Option<String>,
    pub tier_override: Option<NumberTier>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hybrid_resolution: Option<HybridResolution>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hybrid_merge: Option<HybridMerge>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionTierOverrideRequest {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub project_id: Option<String>,
    pub quote_id: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum NumberTierChangeStatus {
    Quoted,
    Queued,
    Applied,
    Rejected,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum NumberTierChangeAction {
    Upgrade,
    Downgrade,
    Configure,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum NumberHybridTransitionStatus {
    Scheduled,
    Running,
    Completed,
    Failed,
    Cancelled,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NumberHybridTransitionProgress {
    pub surviving_number_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<NumberHybridTransitionStatus>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub failure_reason: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub meta_disconnect_required: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub effective_at_ms: Option<u64>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(
    tag = "action",
    rename_all = "snake_case",
    rename_all_fields = "camelCase"
)]
pub enum NumberHybridTransition {
    Keep {
        #[serde(flatten)]
        progress: NumberHybridTransitionProgress,
        keep_transport: HybridTransport,
    },
    Split {
        #[serde(flatten)]
        progress: NumberHybridTransitionProgress,
        existing_number_transport: HybridTransport,
        new_number_name: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        new_number_id: Option<String>,
    },
    Merge {
        #[serde(flatten)]
        progress: NumberHybridTransitionProgress,
        absorb_number_id: String,
    },
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NumberTierQuote {
    pub tier: String,
    pub tier_override: Option<String>,
    pub amount_cents: f64,
    pub price_version: String,
    pub action: NumberTierChangeAction,
    pub effective_at_ms: u64,
    pub replaces_window_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hybrid_transition: Option<NumberHybridTransition>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NumberTierChange {
    pub id: String,
    pub status: NumberTierChangeStatus,
    pub failure_reason: Option<String>,
    pub expires_at_ms: u64,
    pub quote: NumberTierQuote,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SafeModePresence {
    Dark,
    OnlineWhileSending,
    OnlineHours,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SafeModeTyping {
    Off,
    BeforeText,
    BeforeAll,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SafeModeReads {
    Off,
    RepliedChats,
    AllInbound,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SafeModePacing {
    Off,
    Jittered,
    Conversation,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(untagged)]
pub enum Inheritable<T> {
    Setting(T),
    Inherit(InheritSetting),
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum InheritSetting {
    Inherit,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SafeModeSettings {
    pub presence: SafeModePresence,
    pub typing: SafeModeTyping,
    pub reads: SafeModeReads,
    pub pacing: SafeModePacing,
    pub online_start: f64,
    pub online_end: f64,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SafeModeOverride {
    pub presence: Inheritable<SafeModePresence>,
    pub typing: Inheritable<SafeModeTyping>,
    pub reads: Inheritable<SafeModeReads>,
    pub pacing: Inheritable<SafeModePacing>,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct UpdateSessionSafeModeRequest {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub presence: Option<Inheritable<SafeModePresence>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub typing: Option<Inheritable<SafeModeTyping>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reads: Option<Inheritable<SafeModeReads>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pacing: Option<Inheritable<SafeModePacing>>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SafeModeApplied {
    pub observed_at: String,
    pub presence: Option<String>,
    pub typing: Option<String>,
    pub reads: Option<String>,
    pub pacing: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionSafeMode {
    pub session: String,
    pub project_id: String,
    pub project: SafeModeSettings,
    #[serde(rename = "override")]
    pub session_override: SafeModeOverride,
    pub effective: SafeModeSettings,
    pub applied: Option<SafeModeApplied>,
    pub mismatch: bool,
    pub entitled: bool,
    pub entitlement_reason: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SessionCapabilitySource {
    Server,
    ClientDefault,
    AccountType,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SessionCapabilityUnit {
    Seconds,
    Count,
    Characters,
    Members,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum SessionCapability {
    Feature {
        key: String,
        source: Option<SessionCapabilitySource>,
        unit: (),
        value: Option<bool>,
    },
    Limit {
        key: String,
        source: Option<SessionCapabilitySource>,
        unit: SessionCapabilityUnit,
        value: Option<i64>,
    },
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SessionCapabilitiesStatus {
    Synced,
    Unknown,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SessionAccountType {
    Business,
    Personal,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionCapabilities {
    pub session: String,
    pub project_id: String,
    pub status: SessionCapabilitiesStatus,
    pub synced_at: Option<String>,
    pub checked_at: Option<String>,
    pub account_type: Option<SessionAccountType>,
    pub capabilities: Vec<SessionCapability>,
}

pub struct PlatformSessions<'a>(pub(crate) &'a HttpTransport);
fn path(id: &str) -> String {
    format!("/platform/sessions/{}", encode(id))
}
impl PlatformSessions<'_> {
    pub async fn list(
        &self,
        context: &SessionProjectContext,
        options: RequestOptions,
    ) -> Result<ApiResponse<DataEnvelope<Vec<PlatformSession>>>> {
        let query = context
            .project_id
            .as_ref()
            .map(|p| vec![("projectId", p.clone())])
            .unwrap_or_default();
        self.0
            .request::<_, ()>(Method::GET, "/platform/sessions", &query, None, options)
            .await
    }
    pub async fn retrieve(
        &self,
        id: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<Session>>> {
        self.0.get(&path(id), options).await
    }
    pub async fn update(
        &self,
        id: &str,
        body: &crate::configuration::UpdateSessionRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<Session>>> {
        self.0
            .request(Method::PUT, &path(id), &[], Some(body), options)
            .await
    }
    pub async fn start(
        &self,
        id: &str,
        body: &SessionProjectContext,
        options: RequestOptions,
    ) -> Result<ApiResponse<DataEnvelope<SessionStartResult>>> {
        self.0
            .request(
                Method::POST,
                &format!("{}/start", path(id)),
                &[],
                Some(body),
                options,
            )
            .await
    }
    pub async fn stop(
        &self,
        id: &str,
        body: &SessionProjectContext,
        options: RequestOptions,
    ) -> Result<ApiResponse<DataEnvelope<SessionStopResult>>> {
        self.0
            .request(
                Method::POST,
                &format!("{}/stop", path(id)),
                &[],
                Some(body),
                options,
            )
            .await
    }
    pub async fn stop_many(
        &self,
        body: &SessionBatchRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<DataEnvelope<SessionBatchStopResult>>> {
        self.0
            .request(
                Method::POST,
                "/platform/sessions/stop",
                &[],
                Some(body),
                options,
            )
            .await
    }
    pub async fn delete(
        &self,
        id: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<DataEnvelope<SessionRemoveResult>>> {
        self.0
            .request::<_, ()>(Method::DELETE, &path(id), &[], None, options)
            .await
    }
    pub async fn delete_many(
        &self,
        body: &SessionBatchRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<DataEnvelope<SessionBatchRemoveResult>>> {
        self.0
            .request(
                Method::POST,
                "/platform/sessions/delete",
                &[],
                Some(body),
                options,
            )
            .await
    }
    pub async fn quote_tier_change(
        &self,
        id: &str,
        body: &NumberTierQuoteRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<DataEnvelope<NumberTierChange>>> {
        if body.hybrid_resolution.is_some() && body.hybrid_merge.is_some() {
            return Err(configuration("hybridResolution or hybridMerge"));
        }
        self.0
            .request(
                Method::POST,
                &format!("{}/tier-quotes", path(id)),
                &[],
                Some(body),
                options,
            )
            .await
    }
    pub async fn retrieve_tier_change(
        &self,
        id: &str,
        quote_id: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<DataEnvelope<NumberTierChange>>> {
        self.0
            .get(
                &format!("{}/tier-quotes/{}", path(id), encode(quote_id)),
                options,
            )
            .await
    }
    pub async fn set_tier_override(
        &self,
        id: &str,
        body: &SessionTierOverrideRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<DataEnvelope<NumberTierChange>>> {
        if body.quote_id.trim().is_empty() {
            return Err(configuration("quoteId"));
        }
        self.0
            .request(Method::PATCH, &path(id), &[], Some(body), options)
            .await
    }
    pub async fn get_capabilities(
        &self,
        id: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<DataEnvelope<SessionCapabilities>>> {
        self.0
            .get(&format!("{}/capabilities", path(id)), options)
            .await
    }
    pub async fn get_safe_mode(
        &self,
        id: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<DataEnvelope<SessionSafeMode>>> {
        self.0
            .get(&format!("{}/safe-mode", path(id)), options)
            .await
    }
    pub async fn update_safe_mode(
        &self,
        id: &str,
        body: &UpdateSessionSafeModeRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<DataEnvelope<SessionSafeMode>>> {
        self.0
            .request(
                Method::PUT,
                &format!("{}/safe-mode", path(id)),
                &[],
                Some(body),
                options,
            )
            .await
    }
}
