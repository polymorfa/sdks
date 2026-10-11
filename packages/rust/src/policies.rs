//! Project Safe Mode, warm-up plans, insurance evidence and revision-bound health policy.
use crate::{
    models::{DataEnvelope, SuccessEnvelope},
    platform::Projects,
    platform_sessions::{
        HybridTransport, SafeModePacing, SafeModePresence, SafeModeReads, SafeModeSettings,
        SafeModeTyping, SessionSafeMode, UpdateSessionSafeModeRequest,
    },
    transport::{encode, HttpTransport},
    ApiResponse, RequestOptions, Result,
};
use reqwest::Method;
use serde::{Deserialize, Serialize};
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectSafeMode {
    pub project_id: String,
    pub ceiling: SafeModeSettings,
    pub entitled: bool,
    pub entitlement_reason: Option<String>,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateProjectSafeModeRequest {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub presence: Option<SafeModePresence>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub typing: Option<SafeModeTyping>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reads: Option<SafeModeReads>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pacing: Option<SafeModePacing>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub online_start: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub online_end: Option<f64>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WarmupPlanSettings {
    pub enabled: bool,
    pub warmup_days: u32,
    pub daily_start: u32,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct WarmupCurvePoint {
    pub day: u32,
    pub allowance: u32,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectWarmupPlan {
    pub project_id: String,
    pub plan: WarmupPlanSettings,
    pub ceiling: u32,
    pub curve: Vec<WarmupCurvePoint>,
    pub entitled: bool,
    pub entitlement_reason: Option<String>,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateProjectWarmupPlanRequest {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub enabled: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub warmup_days: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub daily_start: Option<u32>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectInsuranceEvidence {
    pub project_id: String,
    pub enabled: bool,
    pub ban_insurance_included: bool,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct UpdateProjectInsuranceEvidenceRequest {
    pub enabled: bool,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ProjectHealthSessionAction {
    None,
    Stop,
    SlowDown,
    LogOut,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectHealthPolicyIntegrations {
    pub email_configured: bool,
    pub webhook_configured: bool,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectHealthPolicy {
    pub project_id: String,
    pub version: u64,
    pub enabled: bool,
    pub threshold: f64,
    pub session_action: ProjectHealthSessionAction,
    pub slow_down_mps: Option<f64>,
    pub email_notification: bool,
    pub webhook_notification: bool,
    pub integrations: ProjectHealthPolicyIntegrations,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateProjectHealthPolicyRequest {
    pub version: u64,
    pub enabled: bool,
    pub threshold: f64,
    pub session_action: ProjectHealthSessionAction,
    pub slow_down_mps: Option<f64>,
    pub email_notification: bool,
    pub webhook_notification: bool,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum HybridMergeIneligibleReason {
    DeletionInProgress,
    NotCoexistence,
    DifferentCustomer,
    ConnectionDisabled,
    NotConnected,
    TransitionInProgress,
    PairingInProgress,
    HmsEnabled,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HybridMergeCandidateNumber {
    pub id: String,
    pub name: String,
    pub transport: HybridTransport,
    pub status: String,
    pub can_be_absorbed: bool,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HybridMergeCandidate {
    pub numbers: [HybridMergeCandidateNumber; 2],
    pub eligible: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ineligible_reason: Option<HybridMergeIneligibleReason>,
}
fn project_path(project: &str, setting: &str) -> String {
    format!("/platform/projects/{}/{setting}", encode(project))
}
impl Projects<'_> {
    pub async fn get_safe_mode(
        &self,
        project: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<DataEnvelope<ProjectSafeMode>>> {
        self.0
            .get(&project_path(project, "safe-mode"), options)
            .await
    }
    pub async fn update_safe_mode(
        &self,
        project: &str,
        body: &UpdateProjectSafeModeRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<DataEnvelope<ProjectSafeMode>>> {
        self.0
            .request(
                Method::PUT,
                &project_path(project, "safe-mode"),
                &[],
                Some(body),
                options,
            )
            .await
    }
    pub async fn get_warmup_plan(
        &self,
        project: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<DataEnvelope<ProjectWarmupPlan>>> {
        self.0
            .get(&project_path(project, "warmup-plan"), options)
            .await
    }
    pub async fn update_warmup_plan(
        &self,
        project: &str,
        body: &UpdateProjectWarmupPlanRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<DataEnvelope<ProjectWarmupPlan>>> {
        self.0
            .request(
                Method::PUT,
                &project_path(project, "warmup-plan"),
                &[],
                Some(body),
                options,
            )
            .await
    }
    pub async fn get_insurance_evidence(
        &self,
        project: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<DataEnvelope<ProjectInsuranceEvidence>>> {
        self.0
            .get(&project_path(project, "insurance-evidence"), options)
            .await
    }
    pub async fn update_insurance_evidence(
        &self,
        project: &str,
        body: &UpdateProjectInsuranceEvidenceRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<DataEnvelope<ProjectInsuranceEvidence>>> {
        self.0
            .request(
                Method::PUT,
                &project_path(project, "insurance-evidence"),
                &[],
                Some(body),
                options,
            )
            .await
    }
    pub async fn get_health_policy(
        &self,
        project: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<DataEnvelope<ProjectHealthPolicy>>> {
        self.0
            .get(&project_path(project, "health-policy"), options)
            .await
    }
    pub async fn update_health_policy(
        &self,
        project: &str,
        body: &UpdateProjectHealthPolicyRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<DataEnvelope<ProjectHealthPolicy>>> {
        self.0
            .request(
                Method::PUT,
                &project_path(project, "health-policy"),
                &[],
                Some(body),
                options,
            )
            .await
    }
    pub async fn list_hybrid_merge_candidates(
        &self,
        project: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<DataEnvelope<Vec<HybridMergeCandidate>>>> {
        self.0
            .get(&project_path(project, "hybrid-merge-candidates"), options)
            .await
    }
}
pub struct MessagingBanSafe<'a>(pub(crate) &'a HttpTransport);
fn messaging_project_path(project: &str, setting: &str) -> String {
    format!("/messaging/projects/{}/{setting}", encode(project))
}
impl MessagingBanSafe<'_> {
    pub async fn get_project_safe_mode(
        &self,
        project: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<ProjectSafeMode>>> {
        self.0.server()?;
        self.0
            .get(&messaging_project_path(project, "safe-mode"), options)
            .await
    }
    pub async fn update_project_safe_mode(
        &self,
        project: &str,
        body: &UpdateProjectSafeModeRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<ProjectSafeMode>>> {
        self.0.server()?;
        self.0
            .request(
                Method::PUT,
                &messaging_project_path(project, "safe-mode"),
                &[],
                Some(body),
                options,
            )
            .await
    }
    pub async fn get_project_warmup_plan(
        &self,
        project: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<ProjectWarmupPlan>>> {
        self.0.server()?;
        self.0
            .get(&messaging_project_path(project, "warmup-plan"), options)
            .await
    }
    pub async fn update_project_warmup_plan(
        &self,
        project: &str,
        body: &UpdateProjectWarmupPlanRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<ProjectWarmupPlan>>> {
        self.0.server()?;
        self.0
            .request(
                Method::PUT,
                &messaging_project_path(project, "warmup-plan"),
                &[],
                Some(body),
                options,
            )
            .await
    }
    pub async fn get_project_insurance_evidence(
        &self,
        project: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<ProjectInsuranceEvidence>>> {
        self.0.server()?;
        self.0
            .get(
                &messaging_project_path(project, "insurance-evidence"),
                options,
            )
            .await
    }
    pub async fn update_project_insurance_evidence(
        &self,
        project: &str,
        body: &UpdateProjectInsuranceEvidenceRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<ProjectInsuranceEvidence>>> {
        self.0.server()?;
        self.0
            .request(
                Method::PUT,
                &messaging_project_path(project, "insurance-evidence"),
                &[],
                Some(body),
                options,
            )
            .await
    }
    pub async fn get_project_health_policy(
        &self,
        project: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<ProjectHealthPolicy>>> {
        self.0.server()?;
        self.0
            .get(&messaging_project_path(project, "health-policy"), options)
            .await
    }
    pub async fn update_project_health_policy(
        &self,
        project: &str,
        body: &UpdateProjectHealthPolicyRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<ProjectHealthPolicy>>> {
        self.0.server()?;
        self.0
            .request(
                Method::PUT,
                &messaging_project_path(project, "health-policy"),
                &[],
                Some(body),
                options,
            )
            .await
    }
    pub async fn get_session_safe_mode(
        &self,
        session: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<SessionSafeMode>>> {
        self.0.server()?;
        self.0
            .get(
                &format!("/messaging/{}/safe-mode", encode(session)),
                options,
            )
            .await
    }
    pub async fn update_session_safe_mode(
        &self,
        session: &str,
        body: &UpdateSessionSafeModeRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<SessionSafeMode>>> {
        self.0.server()?;
        self.0
            .request(
                Method::PUT,
                &format!("/messaging/{}/safe-mode", encode(session)),
                &[],
                Some(body),
                options,
            )
            .await
    }
}
