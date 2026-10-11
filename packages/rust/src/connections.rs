//! Official API credential checks, Hybrid Link policies, and client-token grants.
use crate::{
    messaging::Sessions,
    models::*,
    transport::{configuration, encode, HttpTransport},
    ApiResponse, RequestOptions, Result,
};
use reqwest::Method;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudTokenHealth {
    pub status: String,
    pub expires_at: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudCredentialHealth {
    pub status: String,
    pub checked_at: Option<String>,
    pub next_check_at: Option<String>,
    pub token: CloudTokenHealth,
    pub missing_permissions: Vec<String>,
    pub phone_registration: String,
    pub webhook_subscription: String,
    pub failure_code: Option<String>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudReauthorization {
    pub quicklink_id: String,
    pub url: String,
    pub session: String,
}
#[derive(Clone, Debug, Serialize, Deserialize, Default)]
pub struct MetaPricingParameters {
    pub since: Option<String>,
    pub until: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MetaPricingGroup {
    pub category: String,
    pub pricing_model: String,
    pub pricing_type: Option<String>,
    pub billable: Option<bool>,
    pub messages: u64,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct MetaPricingSummary {
    pub source: String,
    pub since: String,
    pub until: String,
    pub messages: u64,
    pub groups: Vec<MetaPricingGroup>,
}
impl Sessions<'_> {
    pub async fn get_meta_pricing(
        &self,
        session: &str,
        parameters: &MetaPricingParameters,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<MetaPricingSummary>>> {
        self.0.credential.server()?;
        let mut query = Vec::new();
        if let Some(since) = &parameters.since {
            query.push(("since", since.clone()));
        }
        if let Some(until) = &parameters.until {
            query.push(("until", until.clone()));
        }
        self.0
            .request::<_, ()>(
                Method::GET,
                &format!("/messaging/{}/meta-pricing", encode(session)),
                &query,
                None,
                options,
            )
            .await
    }
    pub async fn get_cloud_credential_health(
        &self,
        session: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<CloudCredentialHealth>>> {
        self.0.credential.server()?;
        self.0
            .get(
                &format!("/messaging/{}/cloud-credentials", encode(session)),
                options,
            )
            .await
    }
    pub async fn reauthorize_cloud_credentials(
        &self,
        session: &str,
        mut options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<CloudReauthorization>>> {
        self.0.credential.server()?;
        options.max_network_retries = Some(0);
        self.0
            .request::<_, ()>(
                Method::POST,
                &format!(
                    "/messaging/{}/cloud-credentials/reauthorize",
                    encode(session)
                ),
                &[],
                None,
                options,
            )
            .await
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum HybridConnectionKind {
    LinkedDevices,
    OfficialApi,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "scope", rename_all = "snake_case")]
pub enum HybridPolicyScope {
    Team,
    Project {
        #[serde(rename = "projectId")]
        project_id: String,
    },
    Session {
        #[serde(rename = "projectId")]
        project_id: String,
        session: String,
    },
}
impl HybridPolicyScope {
    fn query(&self) -> Vec<(&str, String)> {
        match self {
            Self::Team => vec![("scope", "team".into())],
            Self::Project { project_id } => vec![
                ("scope", "project".into()),
                ("projectId", project_id.clone()),
            ],
            Self::Session {
                project_id,
                session,
            } => vec![
                ("scope", "session".into()),
                ("projectId", project_id.clone()),
                ("session", session.clone()),
            ],
        }
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HybridRoutingPolicy {
    pub scope: String,
    pub revision: String,
    pub prefer: Option<HybridConnectionKind>,
    pub allowed_transports: Vec<HybridConnectionKind>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetHybridRoutingPolicyRequest {
    pub expected_revision: String,
    pub prefer: Option<HybridConnectionKind>,
    pub allowed_transports: Vec<HybridConnectionKind>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct HybridConnection {
    pub kind: HybridConnectionKind,
    pub status: String,
    pub enabled: bool,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct HybridLinkState {
    pub revision: String,
    pub paused: bool,
    pub connections: Vec<HybridConnection>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetHybridLinkPausedRequest {
    pub expected_revision: String,
    pub paused: bool,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct HybridLinkPaused {
    pub revision: String,
    pub paused: bool,
}
pub struct HybridLink<'a>(pub(crate) &'a HttpTransport);
impl HybridLink<'_> {
    pub async fn get_policy(
        &self,
        scope: &HybridPolicyScope,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<HybridRoutingPolicy>>> {
        self.0.credential.server()?;
        self.0
            .request::<_, ()>(
                Method::GET,
                "/messaging/routing/hybrid",
                &scope.query(),
                None,
                options,
            )
            .await
    }
    pub async fn set_policy(
        &self,
        scope: &HybridPolicyScope,
        body: &SetHybridRoutingPolicyRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<HybridRoutingPolicy>>> {
        self.0.credential.server()?;
        self.0
            .request(
                Method::PUT,
                "/messaging/routing/hybrid",
                &scope.query(),
                Some(body),
                options,
            )
            .await
    }
    pub async fn state(
        &self,
        session: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<HybridLinkState>>> {
        self.0.credential.server()?;
        self.0
            .get(
                &format!("/messaging/{}/hybrid-link", encode(session)),
                options,
            )
            .await
    }
    pub async fn set_paused(
        &self,
        session: &str,
        body: &SetHybridLinkPausedRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<HybridLinkPaused>>> {
        self.0.credential.server()?;
        self.0
            .request(
                Method::PUT,
                &format!("/messaging/{}/hybrid-link", encode(session)),
                &[],
                Some(body),
                options,
            )
            .await
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CustomerClientAction {
    SendMessage,
    SendReaction,
    SendTyping,
    SendSeen,
    ReadPresence,
    SubscribePresence,
    ReadContact,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(untagged)]
pub enum ClientTokenTarget {
    Session {
        session: String,
    },
    Customer {
        customer: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        allow: Option<Vec<CustomerClientAction>>,
    },
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MintClientTokenRequest {
    pub ephemeral_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ttl_seconds: Option<u32>,
    #[serde(flatten)]
    pub target: ClientTokenTarget,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClientTokenValue {
    pub token: String,
    pub expires_at: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClientRules {
    pub recipient_mode: String,
    pub allowed_actions: String,
    pub rate_limit: u64,
    pub max_daily: u64,
    pub allowed_origins: String,
    pub conversation_ttl_seconds: u64,
    pub max_concurrency: u64,
    pub max_setups_per_minute: u64,
    pub allowed_number: String,
    pub enabled: bool,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ClientRecipientMode {
    Conversation,
    Any,
    None,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetClientRulesRequest {
    pub recipient_mode: ClientRecipientMode,
    pub enabled: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub allowed_actions: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rate_limit: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_daily: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub allowed_origins: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub conversation_ttl_seconds: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_concurrency: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_setups_per_minute: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub allowed_number: Option<String>,
}
pub struct ClientTokens<'a>(pub(crate) &'a HttpTransport);
impl ClientTokens<'_> {
    pub async fn mint(
        &self,
        body: &MintClientTokenRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<ClientTokenValue>>> {
        self.0.credential.server()?;
        let target = match &body.target {
            ClientTokenTarget::Session { session } => session,
            ClientTokenTarget::Customer { customer, .. } => customer,
        };
        if target.is_empty() {
            return Err(configuration("session or customer"));
        }
        self.0
            .request(
                Method::POST,
                "/platform/client-tokens",
                &[],
                Some(body),
                options,
            )
            .await
    }
    pub async fn retrieve_rules(
        &self,
        session: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<ClientRules>>> {
        self.0.credential.server()?;
        self.0.get(&rules_path(session), options).await
    }
    pub async fn update_rules(
        &self,
        session: &str,
        body: &SetClientRulesRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessResponse>> {
        self.0.credential.server()?;
        self.0
            .request(Method::PUT, &rules_path(session), &[], Some(body), options)
            .await
    }
    pub async fn delete_rules(
        &self,
        session: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessResponse>> {
        self.0.credential.server()?;
        self.0
            .request::<_, ()>(Method::DELETE, &rules_path(session), &[], None, options)
            .await
    }
}
fn rules_path(session: &str) -> String {
    format!("/platform/sessions/{}/client-rules", encode(session))
}
