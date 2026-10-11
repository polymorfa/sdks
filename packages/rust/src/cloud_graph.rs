//! Typed project-owned Official API Graph helpers; provider observations grant no access.
use crate::{
    models::{DataEnvelope, SuccessResponse},
    transport::{configuration, encode, HttpTransport},
    ApiResponse, RequestOptions, Result,
};
use reqwest::Method;
use serde::{Deserialize, Serialize};
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CloudProductCatalog {
    pub id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CloudCatalogProduct {
    pub id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub retailer_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub availability: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CloudCatalogCursors {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub before: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub after: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CloudCatalogPaging {
    pub cursors: CloudCatalogCursors,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CloudCatalogPage<T> {
    pub data: Vec<T>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub paging: Option<CloudCatalogPaging>,
}
#[derive(Clone, Debug)]
pub struct ListCloudCatalogsParameters {
    pub version: String,
    pub limit: Option<u32>,
    pub after: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CloudMarketingStatus {
    pub id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub marketing_messages_lite_api_status: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub marketing_messages_onboarding_status: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct FlowEncryptionKey {
    pub business_public_key: String,
    pub business_public_key_signature_status: String,
}
#[derive(Clone, Debug, Serialize)]
pub struct RegisterFlowEncryptionKeyRequest {
    #[serde(rename = "business_public_key")]
    pub business_public_key: String,
}
pub struct CloudCatalogs<'a>(pub(crate) &'a HttpTransport);
pub struct CloudMarketing<'a>(pub(crate) &'a HttpTransport);
pub struct FlowEncryption<'a>(pub(crate) &'a HttpTransport);
fn graph_path(id: &str, version: &str, suffix: &str) -> Result<String> {
    if id.trim().is_empty() || version.trim().is_empty() {
        return Err(configuration(
            "Provide a Meta resource ID and Graph version",
        ));
    }
    Ok(format!(
        "/graph/whatsapp/{}/{}/{}",
        encode(version),
        encode(id),
        suffix
    ))
}
impl ListCloudCatalogsParameters {
    fn query(&self) -> Vec<(&'static str, String)> {
        let mut query = Vec::new();
        if let Some(v) = self.limit {
            query.push(("limit", v.to_string()));
        }
        if let Some(v) = &self.after {
            query.push(("after", v.clone()));
        }
        query
    }
}
impl CloudCatalogs<'_> {
    pub async fn list(
        &self,
        waba: &str,
        params: &ListCloudCatalogsParameters,
        options: RequestOptions,
    ) -> Result<ApiResponse<CloudCatalogPage<CloudProductCatalog>>> {
        self.0.server()?;
        self.0
            .request::<_, ()>(
                Method::GET,
                &graph_path(waba, &params.version, "product_catalogs")?,
                &params.query(),
                None,
                options,
            )
            .await
    }
    pub async fn list_products(
        &self,
        waba: &str,
        catalog: &str,
        params: &ListCloudCatalogsParameters,
        options: RequestOptions,
    ) -> Result<ApiResponse<CloudCatalogPage<CloudCatalogProduct>>> {
        self.0.server()?;
        if catalog.is_empty() || !catalog.bytes().all(|c| c.is_ascii_digit()) {
            return Err(configuration("Provide a numeric catalog ID"));
        }
        self.0
            .request::<_, ()>(
                Method::GET,
                &graph_path(
                    waba,
                    &params.version,
                    &format!("product_catalogs/{catalog}/products"),
                )?,
                &params.query(),
                None,
                options,
            )
            .await
    }
}
impl CloudMarketing<'_> {
    pub async fn status(
        &self,
        waba: &str,
        version: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<CloudMarketingStatus>> {
        self.0.server()?;
        self.0
            .get(
                &graph_path(waba, version, "marketing_messages/status")?,
                options,
            )
            .await
    }
}
impl FlowEncryption<'_> {
    pub async fn retrieve(
        &self,
        phone: &str,
        version: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<DataEnvelope<Vec<FlowEncryptionKey>>>> {
        self.0.server()?;
        self.0
            .get(
                &graph_path(phone, version, "whatsapp_business_encryption")?,
                options,
            )
            .await
    }
    pub async fn register(
        &self,
        phone: &str,
        body: &RegisterFlowEncryptionKeyRequest,
        version: &str,
        mut options: RequestOptions,
    ) -> Result<ApiResponse<SuccessResponse>> {
        self.0.server()?;
        options.max_network_retries = Some(0);
        self.0
            .request(
                Method::POST,
                &graph_path(phone, version, "whatsapp_business_encryption")?,
                &[],
                Some(body),
                options,
            )
            .await
    }
}
