//! Immutable owner-bound defaults, QuickLink appearance and team call retention.
use crate::{
    configuration::{SessionConfigurationPatch, SessionConfigurationView},
    developer::request,
    models::DataEnvelope,
    transport::{configuration, HttpTransport},
    ApiResponse, ClientOptions, Credential, RequestOptions, Result,
};
use reqwest::Method;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct UpdateSessionDefaults {
    pub configuration: SessionConfigurationPatch,
    pub revision: u64,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct OwnerInput<'a, T> {
    #[serde(flatten)]
    input: &'a T,
    #[serde(skip_serializing_if = "Option::is_none")]
    project_id: Option<&'a str>,
}
pub struct SessionDefaults<'a> {
    pub(crate) http: &'a HttpTransport,
    pub(crate) project_id: Option<&'a str>,
}
impl SessionDefaults<'_> {
    pub async fn retrieve(
        &self,
        options: RequestOptions,
    ) -> Result<ApiResponse<SessionConfigurationView>> {
        get_owned(
            self.http,
            "/platform/session-configuration",
            self.project_id,
            options,
        )
        .await
    }
    pub async fn update(
        &self,
        body: &UpdateSessionDefaults,
        options: RequestOptions,
    ) -> Result<ApiResponse<SessionConfigurationView>> {
        request(
            self.http,
            Method::PUT,
            "/platform/session-configuration",
            Some(&OwnerInput {
                input: body,
                project_id: self.project_id,
            }),
            options,
        )
        .await
    }
}
pub(crate) async fn get_owned<T: serde::de::DeserializeOwned>(
    http: &HttpTransport,
    path: &str,
    project_id: Option<&str>,
    options: RequestOptions,
) -> Result<ApiResponse<T>> {
    let query = project_id
        .map(|id| vec![("projectId", id.to_owned())])
        .unwrap_or_default();
    let response: ApiResponse<DataEnvelope<T>> = http
        .request::<_, ()>(Method::GET, path, &query, None, options)
        .await?;
    Ok(ApiResponse {
        data: response.data.data,
        metadata: response.metadata,
    })
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum QuickLinkTheme {
    Light,
    Dark,
    System,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum QuickLinkShape {
    Square,
    Rounded,
    Pill,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum QuickLinkLogoMode {
    None,
    Custom,
    Organization,
    Project,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum QuickLinkHistorySync {
    Ask,
    ForceOn,
    ForceOff,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum QuickLinkMethod {
    Qr,
    Pairing,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuickLinkSettings {
    pub id: String,
    pub project_id: Option<String>,
    pub enabled: bool,
    pub success_callback_url: Option<String>,
    pub failure_callback_url: Option<String>,
    pub business_name: Option<String>,
    pub headline: Option<String>,
    pub description: Option<String>,
    pub success_message: Option<String>,
    pub support_url: Option<String>,
    pub privacy_url: Option<String>,
    pub terms_url: Option<String>,
    pub accent: Option<String>,
    pub theme: QuickLinkTheme,
    pub hide_watermark: bool,
    pub allow_phone_change: bool,
    pub shape: Option<QuickLinkShape>,
    pub radius_px: Option<f64>,
    pub logo_mode: QuickLinkLogoMode,
    pub logo_storage_id: Option<String>,
    pub logo_source_storage_id: Option<String>,
    pub logo_url: Option<String>,
    pub history_sync: QuickLinkHistorySync,
    pub methods: Option<Vec<QuickLinkMethod>>,
    pub default_method: Option<QuickLinkMethod>,
    pub created_at: u64,
    pub updated_at: u64,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateQuickLinkSettings {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub enabled: Option<bool>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "crate::configuration::deserialize_present_option"
    )]
    pub success_callback_url: Option<Option<String>>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "crate::configuration::deserialize_present_option"
    )]
    pub failure_callback_url: Option<Option<String>>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "crate::configuration::deserialize_present_option"
    )]
    pub business_name: Option<Option<String>>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "crate::configuration::deserialize_present_option"
    )]
    pub headline: Option<Option<String>>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "crate::configuration::deserialize_present_option"
    )]
    pub description: Option<Option<String>>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "crate::configuration::deserialize_present_option"
    )]
    pub success_message: Option<Option<String>>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "crate::configuration::deserialize_present_option"
    )]
    pub support_url: Option<Option<String>>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "crate::configuration::deserialize_present_option"
    )]
    pub privacy_url: Option<Option<String>>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "crate::configuration::deserialize_present_option"
    )]
    pub terms_url: Option<Option<String>>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "crate::configuration::deserialize_present_option"
    )]
    pub accent: Option<Option<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub theme: Option<QuickLinkTheme>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hide_watermark: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub allow_phone_change: Option<bool>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "crate::configuration::deserialize_present_option"
    )]
    pub shape: Option<Option<QuickLinkShape>>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "crate::configuration::deserialize_present_option"
    )]
    pub radius_px: Option<Option<f64>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub logo_mode: Option<QuickLinkLogoMode>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "crate::configuration::deserialize_present_option"
    )]
    pub logo_storage_id: Option<Option<String>>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "crate::configuration::deserialize_present_option"
    )]
    pub logo_source_storage_id: Option<Option<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub history_sync: Option<QuickLinkHistorySync>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "crate::configuration::deserialize_present_option"
    )]
    pub methods: Option<Option<Vec<QuickLinkMethod>>>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "crate::configuration::deserialize_present_option"
    )]
    pub default_method: Option<Option<QuickLinkMethod>>,
}
pub struct QuickLinkDefaults<'a> {
    pub(crate) http: &'a HttpTransport,
    pub(crate) project_id: Option<&'a str>,
}
impl QuickLinkDefaults<'_> {
    pub async fn retrieve(
        &self,
        options: RequestOptions,
    ) -> Result<ApiResponse<Option<QuickLinkSettings>>> {
        get_owned(self.http, "/platform/quicklink", self.project_id, options).await
    }
    pub async fn update(
        &self,
        body: &UpdateQuickLinkSettings,
        options: RequestOptions,
    ) -> Result<ApiResponse<QuickLinkSettings>> {
        request(
            self.http,
            Method::PUT,
            "/platform/quicklink",
            Some(&OwnerInput {
                input: body,
                project_id: self.project_id,
            }),
            options,
        )
        .await
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CallRetentionPolicy {
    Short,
    Standard,
    Extended,
    Compliance,
    Custom,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CallRetention {
    pub policy: CallRetentionPolicy,
    pub retention_days: u32,
    pub applies_to: Vec<String>,
    pub revision: u64,
    pub updated_at: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(
    tag = "policy",
    rename_all = "snake_case",
    rename_all_fields = "camelCase"
)]
pub enum UpdateCallRetentionRequest {
    Custom {
        retention_days: u32,
        #[serde(skip_serializing_if = "Option::is_none")]
        expected_revision: Option<u64>,
    },
    Short {
        #[serde(skip_serializing_if = "Option::is_none")]
        retention_days: Option<u32>,
        #[serde(skip_serializing_if = "Option::is_none")]
        expected_revision: Option<u64>,
    },
    Standard {
        #[serde(skip_serializing_if = "Option::is_none")]
        retention_days: Option<u32>,
        #[serde(skip_serializing_if = "Option::is_none")]
        expected_revision: Option<u64>,
    },
    Extended {
        #[serde(skip_serializing_if = "Option::is_none")]
        retention_days: Option<u32>,
        #[serde(skip_serializing_if = "Option::is_none")]
        expected_revision: Option<u64>,
    },
    Compliance {
        #[serde(skip_serializing_if = "Option::is_none")]
        retention_days: Option<u32>,
        #[serde(skip_serializing_if = "Option::is_none")]
        expected_revision: Option<u64>,
    },
}
pub struct CallRetentionResource<'a>(pub(crate) &'a HttpTransport);
impl CallRetentionResource<'_> {
    pub async fn retrieve(&self, options: RequestOptions) -> Result<ApiResponse<CallRetention>> {
        request::<_, ()>(
            self.0,
            Method::GET,
            "/platform/call-retention",
            None,
            options,
        )
        .await
    }
    pub async fn update(
        &self,
        body: &UpdateCallRetentionRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<CallRetention>> {
        request(
            self.0,
            Method::PUT,
            "/platform/call-retention",
            Some(body),
            options,
        )
        .await
    }
}
/// A standalone team retention client permits a project token without a project ID.
#[derive(Clone)]
pub struct TeamCallRetentionClient {
    http: HttpTransport,
}
impl TeamCallRetentionClient {
    pub fn new(credential: Credential, options: ClientOptions) -> Result<Self> {
        credential
            .server()
            .map_err(|_| configuration("server credential"))?;
        Ok(Self {
            http: HttpTransport::new(credential, options)?,
        })
    }
    pub fn call_retention(&self) -> CallRetentionResource<'_> {
        CallRetentionResource(&self.http)
    }
}
