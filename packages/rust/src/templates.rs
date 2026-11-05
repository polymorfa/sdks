//! Project template drafts and Official API templates have separate catalogs.
use crate::{
    models::{SuccessEnvelope, SuccessResponse},
    transport::{encode, HttpTransport},
    ApiResponse, RequestOptions, Result,
};
use reqwest::Method;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
macro_rules! wire_enum{($name:ident{$($variant:ident=$wire:literal),*$(,)?})=>{#[derive(Clone,Copy,Debug,Deserialize,Serialize)]pub enum $name{$(#[serde(rename=$wire)]$variant),*}}}
wire_enum!(TemplateSurface{Cloud="cloud",Whatsmeow="whatsmeow",Sandbox="sandbox"});
wire_enum!(TemplateCategory{Marketing="MARKETING",Utility="UTILITY",Authentication="AUTHENTICATION"});
wire_enum!(TemplateKind{Standard="standard",Carousel="carousel",Authentication="authentication",LimitedTimeOffer="limited_time_offer"});
wire_enum!(TemplateVariableType{Text="text",Number="number",Currency="currency",DateTime="date_time"});
wire_enum!(OtpType{CopyCode="copy_code",OneTap="one_tap"});
wire_enum!(CloudTemplateStatus{Pending="PENDING",Approved="APPROVED",Rejected="REJECTED",Paused="PAUSED",Disabled="DISABLED",Deleted="DELETED",Archived="ARCHIVED",InAppeal="IN_APPEAL",LimitExceeded="LIMIT_EXCEEDED",PendingDeletion="PENDING_DELETION"});
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TemplateVariable {
    pub name: String,
    pub r#type: TemplateVariableType,
    pub example: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TemplateLocation {
    pub latitude: f64,
    pub longitude: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub address: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "format", rename_all = "lowercase")]
pub enum TemplateMediaHeader {
    Image {
        #[serde(skip_serializing_if = "Option::is_none")]
        example: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        filename: Option<String>,
    },
    Video {
        #[serde(skip_serializing_if = "Option::is_none")]
        example: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        filename: Option<String>,
    },
    Document {
        #[serde(skip_serializing_if = "Option::is_none")]
        example: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        filename: Option<String>,
    },
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(untagged)]
pub enum TemplateHeader {
    Media(TemplateMediaHeader),
    Other(TemplateOtherHeader),
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "format", rename_all = "lowercase")]
pub enum TemplateOtherHeader {
    None,
    Text {
        text: String,
    },
    Location {
        #[serde(skip_serializing_if = "Option::is_none")]
        example: Option<TemplateLocation>,
    },
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum TemplateButton {
    QuickReply {
        text: String,
    },
    Url {
        text: String,
        url: String,
    },
    Phone {
        text: String,
        phone: String,
    },
    CopyCode {
        #[serde(skip_serializing_if = "Option::is_none")]
        text: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        example: Option<String>,
    },
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TemplateCarouselCard {
    pub header: TemplateMediaHeader,
    pub body: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub buttons: Option<Vec<TemplateButton>>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TemplateCarousel {
    pub cards: Vec<TemplateCarouselCard>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TemplateAuthentication {
    pub otp_type: OtpType,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub code_example: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub add_security_recommendation: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub code_expiration_minutes: Option<u32>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TemplateLimitedTimeOffer {
    pub text: String,
    pub has_expiration: bool,
}
#[derive(Clone, Copy, Debug, Default, Serialize, Deserialize)]
#[serde(try_from = "u8", into = "u8")]
pub enum TemplateDefinitionVersion {
    #[default]
    V1,
}
impl From<TemplateDefinitionVersion> for u8 {
    fn from(_: TemplateDefinitionVersion) -> Self {
        1
    }
}
impl TryFrom<u8> for TemplateDefinitionVersion {
    type Error = &'static str;
    fn try_from(value: u8) -> std::result::Result<Self, Self::Error> {
        if value == 1 {
            Ok(Self::V1)
        } else {
            Err("unsupported template definition version")
        }
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TemplateDefinition {
    pub version: TemplateDefinitionVersion,
    pub kind: TemplateKind,
    pub category: TemplateCategory,
    pub language: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub header: Option<TemplateHeader>,
    pub body: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub footer: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub buttons: Option<Vec<TemplateButton>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub carousel: Option<TemplateCarousel>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub authentication: Option<TemplateAuthentication>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub limited_time_offer: Option<TemplateLimitedTimeOffer>,
    pub variables: Vec<TemplateVariable>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectTemplate {
    pub id: String,
    pub name: String,
    pub category: String,
    pub language: String,
    pub status: String,
    pub kind: String,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "crate::configuration::deserialize_present_option"
    )]
    pub definition: Option<Option<TemplateDefinition>>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "crate::configuration::deserialize_present_option"
    )]
    pub sample_values: Option<Option<BTreeMap<String, String>>>,
    pub cloud_links: Vec<serde_json::Value>,
    pub created_at: u64,
    pub updated_at: u64,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateProjectTemplateRequest {
    pub name: String,
    pub definition: TemplateDefinition,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sample_values: Option<BTreeMap<String, String>>,
}
#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateProjectTemplateRequest {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub definition: Option<TemplateDefinition>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sample_values: Option<BTreeMap<String, String>>,
}
#[derive(Clone, Debug, Default, Serialize)]
pub struct PreviewProjectTemplateRequest {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub values: Option<BTreeMap<String, String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub surface: Option<TemplateSurface>,
}
#[derive(Clone, Debug, Serialize)]
pub struct SubmitProjectTemplateRequest {
    pub session: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudTemplate {
    pub id: String,
    pub tenant_id: String,
    pub session: String,
    pub waba_id: String,
    pub name: String,
    pub language: String,
    pub category: TemplateCategory,
    pub status: CloudTemplateStatus,
    pub components: Vec<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub meta_template_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rejection_reason: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub quality_score: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}
#[derive(Clone, Debug, Serialize)]
pub struct CreateCloudTemplateRequest {
    pub name: String,
    pub language: String,
    pub category: TemplateCategory,
    pub components: Vec<serde_json::Value>,
}
#[derive(Clone, Debug, Serialize)]
pub struct EditCloudTemplateRequest {
    pub components: Vec<serde_json::Value>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct EditCloudTemplateAccepted {
    pub accepted: bool,
    pub name: String,
    pub language: String,
}
pub struct Templates<'a>(pub(crate) &'a HttpTransport);
pub struct CloudTemplates<'a>(pub(crate) &'a HttpTransport);
fn project_templates(project: &str) -> String {
    format!("/messaging/projects/{}/templates", encode(project))
}
fn project_template(project: &str, id: &str) -> String {
    format!("{}/{}", project_templates(project), encode(id))
}
fn cloud_templates(session: &str) -> String {
    format!("/messaging/{}/templates", encode(session))
}
fn cloud_template(session: &str, name: &str) -> String {
    format!("{}/{}", cloud_templates(session), encode(name))
}
fn language_query(language: Option<&str>) -> Vec<(&'static str, String)> {
    language
        .map(|v| vec![("language", v.into())])
        .unwrap_or_default()
}
impl Templates<'_> {
    pub async fn list(
        &self,
        project: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<Vec<ProjectTemplate>>>> {
        self.0.get(&project_templates(project), options).await
    }
    pub async fn create(
        &self,
        project: &str,
        body: &CreateProjectTemplateRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<ProjectTemplate>>> {
        self.0
            .request(
                Method::POST,
                &project_templates(project),
                &[],
                Some(body),
                options,
            )
            .await
    }
    pub async fn retrieve(
        &self,
        project: &str,
        id: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<ProjectTemplate>>> {
        self.0.get(&project_template(project, id), options).await
    }
    pub async fn update(
        &self,
        project: &str,
        id: &str,
        body: &UpdateProjectTemplateRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<ProjectTemplate>>> {
        self.0
            .request(
                Method::PATCH,
                &project_template(project, id),
                &[],
                Some(body),
                options,
            )
            .await
    }
    pub async fn delete(
        &self,
        project: &str,
        id: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessResponse>> {
        self.0
            .request::<_, ()>(
                Method::DELETE,
                &project_template(project, id),
                &[],
                None,
                options,
            )
            .await
    }
    pub async fn preview(
        &self,
        project: &str,
        id: &str,
        body: &PreviewProjectTemplateRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<BTreeMap<String, serde_json::Value>>>> {
        self.0
            .request(
                Method::POST,
                &format!("{}/preview", project_template(project, id)),
                &[],
                Some(body),
                options,
            )
            .await
    }
    pub async fn submit(
        &self,
        project: &str,
        id: &str,
        body: &SubmitProjectTemplateRequest,
        mut options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<BTreeMap<String, serde_json::Value>>>> {
        options.max_network_retries = Some(0);
        self.0
            .request(
                Method::POST,
                &format!("{}/submit", project_template(project, id)),
                &[],
                Some(body),
                options,
            )
            .await
    }
}
impl CloudTemplates<'_> {
    pub async fn list(
        &self,
        session: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<Vec<CloudTemplate>>>> {
        self.0.server()?;
        self.0.get(&cloud_templates(session), options).await
    }
    pub async fn retrieve(
        &self,
        session: &str,
        name: &str,
        language: Option<&str>,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<CloudTemplate>>> {
        self.0.server()?;
        self.0
            .request::<_, ()>(
                Method::GET,
                &cloud_template(session, name),
                &language_query(language),
                None,
                options,
            )
            .await
    }
    pub async fn create(
        &self,
        session: &str,
        body: &CreateCloudTemplateRequest,
        mut options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<CloudTemplate>>> {
        self.0.server()?;
        options.max_network_retries = Some(0);
        self.0
            .request(
                Method::POST,
                &cloud_templates(session),
                &[],
                Some(body),
                options,
            )
            .await
    }
    pub async fn update(
        &self,
        session: &str,
        name: &str,
        body: &EditCloudTemplateRequest,
        language: Option<&str>,
        mut options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<EditCloudTemplateAccepted>>> {
        self.0.server()?;
        options.max_network_retries = Some(0);
        self.0
            .request(
                Method::PATCH,
                &cloud_template(session, name),
                &language_query(language),
                Some(body),
                options,
            )
            .await
    }
    pub async fn delete(
        &self,
        session: &str,
        name: &str,
        mut options: RequestOptions,
    ) -> Result<ApiResponse<SuccessResponse>> {
        self.0.server()?;
        options.max_network_retries = Some(0);
        self.0
            .request::<_, ()>(
                Method::DELETE,
                &cloud_template(session, name),
                &[],
                None,
                options,
            )
            .await
    }
}
