//! Organization identity and credential metadata. Bearer key material is never returned.
use crate::{
    models::DataEnvelope,
    transport::{encode, HttpTransport},
    ApiResponse, RequestOptions, Result,
};
use reqwest::Method;
use serde::{Deserialize, Serialize};
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Organization {
    pub id: String,
    pub external_id: String,
    pub name: String,
    pub slug: Option<String>,
    pub email: String,
    pub timezone: Option<String>,
    pub credit_balance_cents: f64,
    pub low_balance_threshold_cents: f64,
    pub billing_email: Option<String>,
    pub status: Option<String>,
    pub plan: Option<String>,
    pub plan_status: Option<String>,
    pub is_active: bool,
    pub created_at: u64,
    pub updated_at: u64,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum OrganizationMemberRole {
    Owner,
    Admin,
    Member,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OrganizationMember {
    #[serde(rename = "_id")]
    pub internal_id: String,
    #[serde(rename = "_creationTime")]
    pub creation_time: f64,
    pub org_id: String,
    pub user_id: String,
    pub email: String,
    pub name: Option<String>,
    pub role: OrganizationMemberRole,
    pub status: String,
    pub invited_at: Option<u64>,
    pub joined_at: Option<u64>,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiKey {
    #[serde(rename = "_id")]
    pub internal_id: String,
    #[serde(rename = "_creationTime")]
    pub creation_time: f64,
    pub id: String,
    pub key_id: String,
    pub start: String,
    pub last4: String,
    pub org_id: String,
    pub label: String,
    pub scopes: u64,
    pub source: String,
    pub expires_at: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_used: Option<u64>,
    pub is_active: bool,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiKeyDeactivation {
    pub ok: bool,
    pub key_id: String,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectToken {
    pub id: String,
    pub start: String,
    pub last4: String,
    pub label: Option<String>,
    pub scopes: u64,
    pub expires_at: Option<u64>,
    pub created_at: u64,
    pub last_used_at: Option<u64>,
    pub revoked_at: Option<u64>,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuditLog {
    pub id: String,
    pub actor_email: String,
    pub actor_user_id: Option<String>,
    pub actor_role: Option<String>,
    pub action: String,
    pub resource: String,
    pub project_id: Option<String>,
    pub project_name: Option<String>,
    pub ip: Option<String>,
    pub user_agent: Option<String>,
    pub duration: Option<f64>,
    pub source: Option<String>,
    pub description: Option<String>,
    pub result: String,
    pub metadata: serde_json::Value,
    pub created_at: u64,
}
#[derive(Clone, Debug, Default)]
pub struct ListAuditLogsParameters {
    pub action: Option<String>,
    pub resource: Option<String>,
    pub limit: Option<u32>,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SecurityIncident {
    pub id: String,
    pub key_id: String,
    pub token_type: String,
    pub source: String,
    pub url: Option<String>,
    pub r#ref: Option<String>,
    pub resolution: String,
    pub detected_at: u64,
    pub acknowledged_at: Option<u64>,
    pub acknowledged_by: Option<String>,
    pub created_at: u64,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct SecurityIncidentAcknowledgement {
    pub acknowledged: bool,
}
pub struct Organizations<'a>(pub(crate) &'a HttpTransport);
pub struct Members<'a>(pub(crate) &'a HttpTransport);
pub struct ApiKeys<'a>(pub(crate) &'a HttpTransport);
pub struct ProjectTokens<'a>(pub(crate) &'a HttpTransport);
pub struct AuditLogs<'a>(pub(crate) &'a HttpTransport);
pub struct SecurityIncidents<'a>(pub(crate) &'a HttpTransport);
impl Organizations<'_> {
    pub async fn retrieve(
        &self,
        options: RequestOptions,
    ) -> Result<ApiResponse<DataEnvelope<Organization>>> {
        self.0.get("/platform/team", options).await
    }
}
impl Members<'_> {
    pub async fn list(
        &self,
        options: RequestOptions,
    ) -> Result<ApiResponse<DataEnvelope<Vec<OrganizationMember>>>> {
        self.0.get("/platform/members", options).await
    }
}
impl ApiKeys<'_> {
    pub async fn list(
        &self,
        options: RequestOptions,
    ) -> Result<ApiResponse<DataEnvelope<Vec<ApiKey>>>> {
        self.0.get("/platform/keys", options).await
    }
    pub async fn deactivate(
        &self,
        key_id: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<DataEnvelope<ApiKeyDeactivation>>> {
        self.0
            .request::<_, ()>(
                Method::DELETE,
                &format!("/platform/keys/{}", encode(key_id)),
                &[],
                None,
                options,
            )
            .await
    }
}
impl ProjectTokens<'_> {
    pub async fn list(
        &self,
        project_id: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<DataEnvelope<Vec<ProjectToken>>>> {
        self.0
            .request::<_, ()>(
                Method::GET,
                "/platform/tokens",
                &[("projectId", project_id.into())],
                None,
                options,
            )
            .await
    }
}
impl AuditLogs<'_> {
    pub async fn list(
        &self,
        params: &ListAuditLogsParameters,
        options: RequestOptions,
    ) -> Result<ApiResponse<DataEnvelope<Vec<AuditLog>>>> {
        let mut query = Vec::new();
        if let Some(v) = &params.action {
            query.push(("action", v.clone()));
        }
        if let Some(v) = &params.resource {
            query.push(("resource", v.clone()));
        }
        if let Some(v) = params.limit {
            query.push(("limit", v.to_string()));
        }
        self.0
            .request::<_, ()>(Method::GET, "/platform/audit", &query, None, options)
            .await
    }
}
impl SecurityIncidents<'_> {
    pub async fn list(
        &self,
        options: RequestOptions,
    ) -> Result<ApiResponse<DataEnvelope<Vec<SecurityIncident>>>> {
        self.0.get("/platform/incidents", options).await
    }
    pub async fn acknowledge(
        &self,
        id: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<DataEnvelope<SecurityIncidentAcknowledgement>>> {
        self.0
            .request::<_, ()>(
                Method::POST,
                &format!("/platform/incidents/{}/acknowledge", encode(id)),
                &[],
                None,
                options,
            )
            .await
    }
}
