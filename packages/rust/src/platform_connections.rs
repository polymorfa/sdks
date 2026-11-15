//! Team-owned Connection lifecycle, reviewed tier changes and resolved safety settings.
use crate::{
    models::*,
    transport::{configuration, encode, HttpTransport},
    ApiResponse, RequestOptions, Result,
};
use reqwest::Method;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionProjectContext {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub project_id: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionBatchRequest {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub project_id: Option<String>,
    pub connection_ids: Vec<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ConnectionBatchStopResult {
    pub stopping: u32,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ConnectionBatchRemoveResult {
    pub removed: u32,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ConnectionTier {
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
        existing_connection_transport: HybridTransport,
        new_connection_name: String,
    },
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HybridMerge {
    pub absorb_connection_id: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionTierQuoteRequest {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub project_id: Option<String>,
    pub tier_override: Option<ConnectionTier>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hybrid_resolution: Option<HybridResolution>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hybrid_merge: Option<HybridMerge>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionTierOverrideRequest {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub project_id: Option<String>,
    pub quote_id: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ConnectionTierChangeStatus {
    Quoted,
    Queued,
    Applied,
    Rejected,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ConnectionTierChangeAction {
    Upgrade,
    Downgrade,
    Configure,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ConnectionHybridTransitionStatus {
    Scheduled,
    Running,
    Completed,
    Failed,
    Cancelled,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionHybridTransitionProgress {
    pub surviving_connection_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<ConnectionHybridTransitionStatus>,
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
pub enum ConnectionHybridTransition {
    Keep {
        #[serde(flatten)]
        progress: ConnectionHybridTransitionProgress,
        keep_transport: HybridTransport,
    },
    Split {
        #[serde(flatten)]
        progress: ConnectionHybridTransitionProgress,
        existing_connection_transport: HybridTransport,
        new_connection_name: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        new_connection_id: Option<String>,
    },
    Merge {
        #[serde(flatten)]
        progress: ConnectionHybridTransitionProgress,
        absorb_connection_id: String,
    },
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionTierQuote {
    pub tier: String,
    pub tier_override: Option<String>,
    pub amount_cents: f64,
    pub price_version: String,
    pub action: ConnectionTierChangeAction,
    pub effective_at_ms: u64,
    pub replaces_window_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hybrid_transition: Option<ConnectionHybridTransition>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionTierChange {
    pub id: String,
    pub status: ConnectionTierChangeStatus,
    pub failure_reason: Option<String>,
    pub expires_at_ms: u64,
    pub quote: ConnectionTierQuote,
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
pub struct UpdateConnectionSafeModeRequest {
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
pub struct ConnectionSafeMode {
    pub connection: String,
    pub project_id: String,
    pub project: SafeModeSettings,
    #[serde(rename = "override")]
    pub connection_override: SafeModeOverride,
    pub effective: SafeModeSettings,
    pub applied: Option<SafeModeApplied>,
    pub mismatch: bool,
    pub entitled: bool,
    pub entitlement_reason: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ConnectionCapabilitySource {
    Server,
    ClientDefault,
    AccountType,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ConnectionCapabilityUnit {
    Seconds,
    Count,
    Characters,
    Members,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum ConnectionCapability {
    Feature {
        key: String,
        source: Option<ConnectionCapabilitySource>,
        unit: (),
        value: Option<bool>,
    },
    Limit {
        key: String,
        source: Option<ConnectionCapabilitySource>,
        unit: ConnectionCapabilityUnit,
        value: Option<i64>,
    },
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ConnectionCapabilitiesStatus {
    Synced,
    Unknown,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ConnectionAccountType {
    Business,
    Personal,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionCapabilities {
    pub connection: String,
    pub project_id: String,
    pub status: ConnectionCapabilitiesStatus,
    pub synced_at: Option<String>,
    pub checked_at: Option<String>,
    pub account_type: Option<ConnectionAccountType>,
    pub capabilities: Vec<ConnectionCapability>,
}

pub struct PlatformConnections<'a>(pub(crate) &'a HttpTransport);
fn path(id: &str) -> String {
    format!("/platform/connections/{}", encode(id))
}
impl PlatformConnections<'_> {
    pub async fn list(
        &self,
        context: &ConnectionProjectContext,
        options: RequestOptions,
    ) -> Result<ApiResponse<DataEnvelope<Vec<PlatformConnection>>>> {
        let query = context
            .project_id
            .as_ref()
            .map(|p| vec![("projectId", p.clone())])
            .unwrap_or_default();
        self.0
            .request::<_, ()>(Method::GET, "/platform/connections", &query, None, options)
            .await
    }
    pub async fn retrieve(
        &self,
        id: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<Connection>>> {
        self.0.get(&path(id), options).await
    }
    pub async fn update(
        &self,
        id: &str,
        body: &crate::configuration::UpdateConnectionRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<Connection>>> {
        let options = body.configuration.options(options);
        self.0
            .request(Method::PUT, &path(id), &[], Some(body), options)
            .await
    }
    pub async fn start(
        &self,
        id: &str,
        body: &ConnectionProjectContext,
        options: RequestOptions,
    ) -> Result<ApiResponse<DataEnvelope<ConnectionStartResult>>> {
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
        body: &ConnectionProjectContext,
        options: RequestOptions,
    ) -> Result<ApiResponse<DataEnvelope<ConnectionStopResult>>> {
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
        body: &ConnectionBatchRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<DataEnvelope<ConnectionBatchStopResult>>> {
        self.0
            .request(
                Method::POST,
                "/platform/connections/stop",
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
    ) -> Result<ApiResponse<DataEnvelope<ConnectionRemoveResult>>> {
        self.0
            .request::<_, ()>(Method::DELETE, &path(id), &[], None, options)
            .await
    }
    pub async fn delete_many(
        &self,
        body: &ConnectionBatchRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<DataEnvelope<ConnectionBatchRemoveResult>>> {
        self.0
            .request(
                Method::POST,
                "/platform/connections/delete",
                &[],
                Some(body),
                options,
            )
            .await
    }
    pub async fn quote_tier_change(
        &self,
        id: &str,
        body: &ConnectionTierQuoteRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<DataEnvelope<ConnectionTierChange>>> {
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
    ) -> Result<ApiResponse<DataEnvelope<ConnectionTierChange>>> {
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
        body: &ConnectionTierOverrideRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<DataEnvelope<ConnectionTierChange>>> {
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
    ) -> Result<ApiResponse<DataEnvelope<ConnectionCapabilities>>> {
        self.0
            .get(&format!("{}/capabilities", path(id)), options)
            .await
    }
    pub async fn get_safe_mode(
        &self,
        id: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<DataEnvelope<ConnectionSafeMode>>> {
        self.0
            .get(&format!("{}/safe-mode", path(id)), options)
            .await
    }
    pub async fn update_safe_mode(
        &self,
        id: &str,
        body: &UpdateConnectionSafeModeRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<DataEnvelope<ConnectionSafeMode>>> {
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
