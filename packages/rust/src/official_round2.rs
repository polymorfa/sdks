//! Beta Number cache, readiness and delivery contracts. No provider access grant.
use crate::{
    models::SuccessEnvelope,
    transport::{encode, HttpTransport},
    ApiResponse, Error, ErrorKind, RequestOptions, Result,
};
use reqwest::Method;
use serde::{Deserialize, Serialize};
use std::time::Duration;
fn invalid(message: &str) -> Error {
    Error::local(ErrorKind::Validation, message, "invalid_parameter")
}
macro_rules! model {($name:ident {$($field:ident:$ty:ty),*} {$($opt:ident:$ot:ty),*})=>{
 #[derive(Clone,Debug,Serialize,Deserialize)] #[serde(rename_all="camelCase")]
 pub struct $name {$(pub $field:$ty,)* $(#[serde(skip_serializing_if="Option::is_none")]pub $opt:Option<$ot>,)*}
};}
model!(CloudCatalogAttempt {started_at:String,finished_at:Option<String>,outcome:String} {meta_error_code:i64});
model!(CloudCatalogSync {catalog_id:String,synced_at:Option<String>,stale:bool,product_count:u64,last_attempt:CloudCatalogAttempt} {});
model!(CloudCatalogCacheProduct {id:String} {retailer_id:String,name:String,description:String,price:String,currency:String,availability:String,review_status:String,visibility:String,image_url:String,url:String});
model!(CloudCatalogCacheList {catalogs:Vec<CloudCatalogSync>} {});
model!(CloudCatalogProductPage {catalog:CloudCatalogSync,products:Vec<CloudCatalogCacheProduct>} {next_cursor:String});
#[derive(Clone, Debug, Default)]
pub struct CatalogProductsParameters {
    pub limit: Option<u32>,
    pub cursor: Option<String>,
}
pub struct Catalogs<'a>(pub(crate) &'a HttpTransport);
fn path(session: &str, id: Option<&str>) -> Result<String> {
    if session.trim().is_empty() {
        return Err(invalid("Provide a Number ID."));
    }
    let mut path = format!("/messaging/{}/catalogs", encode(session));
    if let Some(id) = id {
        if id.is_empty() || id.len() > 32 || !id.bytes().all(|b| b.is_ascii_digit()) {
            return Err(invalid("catalogId must contain 1 to 32 digits."));
        }
        path.push('/');
        path.push_str(id)
    }
    Ok(path)
}
impl Catalogs<'_> {
    pub async fn list(
        &self,
        session: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<CloudCatalogCacheList>>> {
        self.0.server()?;
        self.0
            .request::<_, ()>(Method::GET, &path(session, None)?, &[], None, options)
            .await
    }
    pub async fn retrieve(
        &self,
        session: &str,
        id: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<CloudCatalogSync>>> {
        self.0.server()?;
        self.0
            .request::<_, ()>(Method::GET, &path(session, Some(id))?, &[], None, options)
            .await
    }
    pub async fn list_products(
        &self,
        session: &str,
        id: &str,
        p: &CatalogProductsParameters,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<CloudCatalogProductPage>>> {
        self.0.server()?;
        if p.limit.is_some_and(|n| !(1..=100).contains(&n))
            || p.cursor.as_ref().is_some_and(|s| {
                s.is_empty()
                    || s.len() > 256
                    || !s
                        .bytes()
                        .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
            })
        {
            return Err(invalid("Invalid catalog pagination."));
        }
        let mut query = vec![];
        if let Some(n) = p.limit {
            query.push(("limit", n.to_string()))
        }
        if let Some(s) = &p.cursor {
            query.push(("cursor", s.clone()))
        }
        self.0
            .request::<_, ()>(
                Method::GET,
                &format!("{}/products", path(session, Some(id))?),
                &query,
                None,
                options,
            )
            .await
    }
    pub async fn sync(
        &self,
        session: &str,
        id: &str,
        mut options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<CloudCatalogSync>>> {
        self.0.server()?;
        options.max_network_retries = Some(0);
        options.timeout.get_or_insert(Duration::from_secs(60));
        self.0
            .request::<_, ()>(
                Method::POST,
                &format!("{}/sync", path(session, Some(id))?),
                &[],
                None,
                options,
            )
            .await
    }
}
model!(MarketingOnboarding {status:String,meta_status:Option<String>} {});
model!(MarketingTerms {status:String,meta_status:Option<String>,date:Option<String>} {});
model!(MarketingMessagesStatus {waba_id:String,onboarding:MarketingOnboarding,terms:MarketingTerms,cloud_api_marketing_disabled:Option<bool>,next_action:String,guide_url:String,observed_at:String} {});
model!(CloudOrderItem {product_retailer_id:String,quantity:u64,item_price:f64,currency:String} {});
model!(CloudOrder {catalog_id:String,items:Vec<CloudOrderItem>} {text:String});
model!(ContactPreviousIdentity {} {id:String,bsuid:String,parent_bsuid:String});
model!(ContactIdentityChange {reason:String,message_id:String} {previous:ContactPreviousIdentity});
model!(MarketingOnboardingUpdatedPayload {kind:String,waba_id:String,meta_event:String} {owner_business_id:String});
model!(ContactMarketingPreferencePayload {wa_id:String,preference:String,category:String} {phone_number_id:String});
// QuickLink errorCode remains an open nullable string.
pub const CLOUD_READINESS_FAILURE_CODES: &[&str] = &[
    "meta_credentials_invalid",
    "meta_phone_not_registered",
    "meta_webhook_not_subscribed",
    "meta_payment_method_missing",
    "meta_quality_flagged",
    "meta_readiness_unknown",
];
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WebhookBatchingInput {
    pub enabled: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_events: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub window_ms: Option<u32>,
}
model!(WebhookBatching {enabled:bool,max_events:u32,window_ms:u32} {});
pub(crate) fn validate_batching(
    b: Option<&WebhookBatchingInput>,
    format: Option<&str>,
) -> Result<()> {
    if let Some(b) = b {
        if b.max_events.is_some_and(|n| !(2..=100).contains(&n))
            || b.window_ms.is_some_and(|n| !(100..=1000).contains(&n))
            || b.enabled && format == Some("meta")
        {
            return Err(invalid("Invalid native webhook batching settings."));
        }
    }
    Ok(())
}
