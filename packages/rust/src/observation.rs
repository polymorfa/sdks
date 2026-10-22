//! Resolved project and Number observation policies.
use crate::{
    configuration::{LabelObservationMode, ObservationMode},
    models::SuccessEnvelope,
    transport::{encode, HttpTransport},
    ApiResponse, RequestOptions, Result,
};
use serde::{Deserialize, Serialize};
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum SessionObservationMode {
    Off,
    Events,
    Cache,
    Inherit,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum SessionLabelObservationMode {
    Off,
    Events,
    Cache,
    Project,
    Inherit,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectObservationPolicy {
    pub project_id: String,
    pub presence_mode: ObservationMode,
    pub typing_mode: ObservationMode,
    pub label_mode: LabelObservationMode,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub quick_reply_mode: Option<ObservationMode>,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ObservationPolicyValues {
    pub presence_mode: ObservationMode,
    pub typing_mode: ObservationMode,
    pub label_mode: LabelObservationMode,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub quick_reply_mode: Option<ObservationMode>,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ObservationPolicyOverrides {
    pub presence_mode: SessionObservationMode,
    pub typing_mode: SessionObservationMode,
    pub label_mode: SessionLabelObservationMode,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub quick_reply_mode: Option<SessionObservationMode>,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionObservationPolicy {
    pub session_name: String,
    pub project_id: String,
    pub project: ObservationPolicyValues,
    pub r#override: ObservationPolicyOverrides,
    pub effective: ObservationPolicyValues,
}
pub struct ObservationPolicies<'a>(pub(crate) &'a HttpTransport);
impl ObservationPolicies<'_> {
    pub async fn retrieve_for_project(
        &self,
        project: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<ProjectObservationPolicy>>> {
        self.0
            .get(
                &format!("/messaging/projects/{}/observation-policy", encode(project)),
                options,
            )
            .await
    }
    pub async fn retrieve_for_session(
        &self,
        session: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<SessionObservationPolicy>>> {
        self.0
            .get(
                &format!("/messaging/{}/observation-policy", encode(session)),
                options,
            )
            .await
    }
}
