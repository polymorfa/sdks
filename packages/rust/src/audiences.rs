//! Organization-owned campaign audiences and paginated member imports.
use crate::{
    campaigns::{CampaignRecipientInput, CampaignRecipientPage, InvalidRecipientRow},
    models::DataEnvelope,
    transport::{encode, HttpTransport},
    ApiResponse, RequestOptions, Result,
};
use reqwest::Method;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
#[derive(Clone, Copy, Debug, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AudienceSource {
    Csv,
    Manual,
    Api,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AudienceImportMapping {
    pub phone: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub variables: Option<BTreeMap<String, String>>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(untagged)]
pub enum CreateAudienceRequest {
    FromFile {
        name: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        source: Option<AudienceSource>,
        #[serde(rename = "fileId")]
        file_id: String,
        mapping: AudienceImportMapping,
    },
    FromMembers {
        name: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        source: Option<AudienceSource>,
        #[serde(skip_serializing_if = "Option::is_none")]
        members: Option<Vec<CampaignRecipientInput>>,
    },
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Audience {
    pub id: String,
    pub name: String,
    pub source: AudienceSource,
    pub recipient_count: u64,
    pub file_id: Option<String>,
    pub columns: Option<Vec<String>>,
    pub sample_row: Option<BTreeMap<String, String>>,
    pub mapping: Option<BTreeMap<String, serde_json::Value>>,
    pub created_at: u64,
    pub updated_at: u64,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudienceImportResult {
    #[serde(flatten)]
    pub audience: Audience,
    pub duplicate_count: u64,
    pub invalid_count: u64,
    pub invalid_rows: Vec<InvalidRecipientRow>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudienceMember {
    pub id: String,
    pub phone: String,
    pub variables: BTreeMap<String, String>,
    pub created_at: u64,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AudienceMembersEnvelope {
    pub data: Vec<AudienceMember>,
    pub page: CampaignRecipientPage,
}
#[derive(Clone, Debug, Default)]
pub struct ListAudienceMembersParameters {
    pub cursor: Option<String>,
    pub limit: Option<u32>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AddAudienceMembersRequest {
    pub members: Vec<CampaignRecipientInput>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddAudienceMembersResult {
    pub list_id: String,
    pub added: u64,
    pub recipient_count: u64,
    pub duplicate_count: u64,
    pub invalid_count: u64,
    pub invalid_rows: Vec<InvalidRecipientRow>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteAudienceMemberResult {
    pub removed: bool,
    pub list_id: String,
    pub phone: String,
    pub recipient_count: u64,
}
/// The pinned TS contract explicitly declares this open object for uploads and
/// legacy audience reads; named result objects above are decoded separately.
pub type AudiencePayload = BTreeMap<String, serde_json::Value>;
pub struct Audiences<'a>(pub(crate) &'a HttpTransport);
fn audience(id: &str) -> String {
    format!("/platform/audiences/{}", encode(id))
}
impl Audiences<'_> {
    pub async fn list(
        &self,
        options: RequestOptions,
    ) -> Result<ApiResponse<DataEnvelope<AudiencePayload>>> {
        self.0.get("/platform/audiences", options).await
    }
    pub async fn create(
        &self,
        body: &CreateAudienceRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<DataEnvelope<AudienceImportResult>>> {
        self.0
            .request(
                Method::POST,
                "/platform/audiences",
                &[],
                Some(body),
                options,
            )
            .await
    }
    pub async fn retrieve(
        &self,
        id: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<DataEnvelope<AudiencePayload>>> {
        self.0.get(&audience(id), options).await
    }
    pub async fn delete(
        &self,
        id: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<DataEnvelope<AudiencePayload>>> {
        self.0
            .request::<_, ()>(Method::DELETE, &audience(id), &[], None, options)
            .await
    }
    pub async fn create_upload(
        &self,
        body: Option<&AudiencePayload>,
        options: RequestOptions,
    ) -> Result<ApiResponse<DataEnvelope<AudiencePayload>>> {
        self.0
            .request(
                Method::POST,
                "/platform/audiences/uploads",
                &[],
                body,
                options,
            )
            .await
    }
    pub async fn add_members(
        &self,
        id: &str,
        body: &AddAudienceMembersRequest,
        mut options: RequestOptions,
    ) -> Result<ApiResponse<DataEnvelope<AddAudienceMembersResult>>> {
        if options.max_network_retries.is_none() {
            options.max_network_retries = Some(0);
        }
        self.0
            .request(
                Method::POST,
                &format!("{}/members", audience(id)),
                &[],
                Some(body),
                options,
            )
            .await
    }
    pub async fn list_members(
        &self,
        id: &str,
        params: &ListAudienceMembersParameters,
        options: RequestOptions,
    ) -> Result<ApiResponse<AudienceMembersEnvelope>> {
        let mut query = Vec::new();
        if let Some(v) = &params.cursor {
            query.push(("cursor", v.clone()));
        }
        if let Some(v) = params.limit {
            query.push(("limit", v.to_string()));
        }
        self.0
            .request::<_, ()>(
                Method::GET,
                &format!("{}/members", audience(id)),
                &query,
                None,
                options,
            )
            .await
    }
    pub async fn delete_member(
        &self,
        id: &str,
        phone: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<DataEnvelope<DeleteAudienceMemberResult>>> {
        self.0
            .request::<_, ()>(
                Method::DELETE,
                &format!("{}/members/{}", audience(id), encode(phone)),
                &[],
                None,
                options,
            )
            .await
    }
}
