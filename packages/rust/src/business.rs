//! Linked Devices business profiles, catalogs and merchant evidence.
use crate::{
    account::AsyncAccepted,
    models::{ConversationIdentity, SuccessEnvelope},
    transport::{encode, HttpTransport},
    ApiResponse, RequestOptions, Result,
};
use reqwest::Method;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
// Field lists are handwritten from the pinned TypeScript contract. Optional fields
// distinguish omitted values from required fields on the native response boundary.
macro_rules! model{($name:ident{$($required:ident:$required_ty:ty),*;$($optional:ident:$optional_ty:ty),*$(,)?})=>{#[derive(Clone,Debug,Serialize,Deserialize)]#[serde(rename_all="camelCase")]pub struct $name{$(pub $required:$required_ty,)*$(#[serde(skip_serializing_if="Option::is_none")]pub $optional:Option<$optional_ty>,)*}}}
model!(BusinessProfileCategory{id:String,name:String;});
model!(BusinessProfileHours{day_of_week:String,mode:String,open_time:String,close_time:String;});
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BusinessProfile {
    #[serde(flatten)]
    pub identity: ConversationIdentity,
    pub address: String,
    pub email: String,
    pub description: String,
    pub websites: Vec<String>,
    pub cover_photo_id: String,
    pub categories: Vec<BusinessProfileCategory>,
    pub options: BTreeMap<String, String>,
    pub hours_time_zone: String,
    pub hours: Vec<BusinessProfileHours>,
}
#[derive(Clone, Copy, Debug, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum BusinessWeekday {
    Sun,
    Mon,
    Tue,
    Wed,
    Thu,
    Fri,
    Sat,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "mode", rename_all = "snake_case")]
pub enum BusinessProfileDay {
    SpecificHours {
        #[serde(rename = "dayOfWeek")]
        day_of_week: BusinessWeekday,
        #[serde(rename = "openTime")]
        open_time: u16,
        #[serde(rename = "closeTime")]
        close_time: u16,
    },
    #[serde(rename = "open_24h")]
    Open24h {
        #[serde(rename = "dayOfWeek")]
        day_of_week: BusinessWeekday,
    },
    AppointmentOnly {
        #[serde(rename = "dayOfWeek")]
        day_of_week: BusinessWeekday,
    },
}
model!(BusinessProfileHoursUpdate{time_zone:String,days:Vec<BusinessProfileDay>;});
#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BusinessProfileUpdateRequest {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub address: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub email: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub websites: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hours: Option<BusinessProfileHoursUpdate>,
}
#[derive(Clone, Debug, Serialize)]
#[serde(untagged)]
pub enum BusinessCoverPhotoRequest {
    Url { url: String },
    Base64 { base64: String },
}
model!(BusinessProfileStatus{status:String;});
model!(BusinessCoverPhotoResult{cover_photo_id:String;});
model!(BusinessActionSuccess{success:bool;});
#[derive(Clone, Debug)]
pub struct BusinessCatalogParameters {
    pub id: String,
    pub after: Option<String>,
    pub limit: Option<u32>,
    pub width: Option<u32>,
    pub height: Option<u32>,
}
pub type BusinessCollectionParameters = BusinessCatalogParameters;
#[derive(Clone, Debug)]
pub struct BusinessCollectionsParameters {
    pub id: String,
    pub after: Option<String>,
    pub collection_limit: Option<u32>,
    pub item_limit: Option<u32>,
    pub width: Option<u32>,
    pub height: Option<u32>,
}
#[derive(Clone, Debug, Serialize)]
#[serde(untagged)]
pub enum BusinessProductImageSource {
    Url {
        url: String,
    },
    Base64 {
        base64: String,
    },
    MediaUrl {
        #[serde(rename = "mediaUrl")]
        media_url: String,
    },
}
model!(BusinessAddress{;street1:String,street2:String,city:String,region:String,postal_code:String,country_code:String});
model!(BusinessComplianceInfo{;country_code_origin:String,importer_name:String,importer_address:BusinessAddress});
pub type BusinessProductImporterAddress = BusinessAddress;
pub type BusinessProductCompliance = BusinessComplianceInfo;
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BusinessProductMutationRequest {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub currency: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub price: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sale_price: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub retailer_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hidden: Option<bool>,
    pub images: Vec<BusinessProductImageSource>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub video_urls: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub compliance_category: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub compliance: Option<BusinessProductCompliance>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub width: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub height: Option<u32>,
}
model!(BusinessProductImage{id:String;original_url:String,request_url:String});
model!(BusinessProductVideo{id:String;original_url:String,thumbnail_url:String});
model!(BusinessProductMedia{images:Vec<BusinessProductImage>,videos:Vec<BusinessProductVideo>;});
model!(BusinessSalePrice{price:String;start_date:String,end_date:String});
model!(BusinessProductStatus{can_appeal:bool;status:String});
model!(BusinessDimensions{;width:u32,height:u32});
model!(BusinessVariantThumbnail{original_dimensions:BusinessDimensions;id:String,original_url:String,request_url:String});
model!(BusinessVariantProperty{name:String,value:String;});
model!(BusinessVariantAvailabilityItem{available:bool,options:Vec<BusinessVariantProperty>;product_id:String});
model!(BusinessVariantAvailability{listings:Vec<BusinessVariantAvailabilityItem>;});
model!(BusinessVariantListing{;description:String,lowest_price:String,multi_price:String});
model!(BusinessVariantOption{value:String;thumbnail:BusinessVariantThumbnail});
model!(BusinessVariantType{name:String,options:Vec<BusinessVariantOption>;});
model!(BusinessProductVariant{availability:BusinessVariantAvailability,listing_details:BusinessVariantListing,types:Vec<BusinessVariantType>,properties:Vec<BusinessVariantProperty>;});
model!(BusinessProduct{id:String,name:String,price:String,currency:String,hidden:bool,sanctioned:bool,media:BusinessProductMedia,status:BusinessProductStatus;retailer_id:String,belongs_to:String,description:String,url:String,shimmed_url:String,max_available:u32,availability:String,compliance_category:String,compliance:BusinessComplianceInfo,sale_price:BusinessSalePrice,variant:BusinessProductVariant});
model!(BusinessCatalogPage{products:Vec<BusinessProduct>;next:String,previous:String});
model!(BusinessProductDeleteResult{deleted_count:u32;});
model!(BusinessCartSettingRequest{enabled:bool;});
model!(BusinessProductVisibilityRequest{hidden:bool;});
model!(BusinessCatalogAppealRequest{reason:String;});
model!(BusinessCollectionStatus{can_appeal:bool;status:String,commerce_url:String,reject_reason:String});
model!(BusinessCollection{id:String,name:String,products:Vec<BusinessProduct>,status:BusinessCollectionStatus;});
model!(BusinessCollectionPage{collections:Vec<BusinessCollection>;next:String});
model!(BusinessCollectionCreateRequest{name:String,product_ids:Vec<String>;});
#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BusinessCollectionUpdateRequest {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub add_product_ids: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub remove_product_ids: Option<Vec<String>>,
}
model!(BusinessCollectionMutationResult{id:String,review_status:String;});
model!(BusinessCollectionMove{collection_id:String,from_index:u32,to_index:u32;});
model!(BusinessCollectionReorderRequest{moves:Vec<BusinessCollectionMove>;});
#[derive(Clone, Serialize)]
pub struct BusinessOrderLookupRequest {
    pub token: String,
}
model!(BusinessOrderPrice{subtotal:String,total:String,currency:String;price_status:String});
model!(BusinessOrderProduct{id:String,price:String,currency:String,name:String,quantity:u32;image_id:String,image_url:String,variant_properties:String});
model!(BusinessOrder{id:String,created_at:u64,price:BusinessOrderPrice,products:Vec<BusinessOrderProduct>;catalog_id:String});
#[derive(Clone, Copy, Debug, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum BusinessMerchantEntityType {
    SoleProprietorship,
    Partnership,
    PrivateCompany,
    PublicCompany,
    LimitedLiabilityPartnership,
    Other,
}
model!(BusinessMerchantContact{email:String,landline_number:String,mobile_number:String;});
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct BusinessMerchantOfficer {
    pub name: String,
    #[serde(flatten)]
    pub contact: BusinessMerchantContact,
}
model!(BusinessMerchantCompliance{entity_name:String,entity_type:BusinessMerchantEntityType,is_registered:bool,entity_type_custom:String,customer_care:BusinessMerchantContact,grievance_officer:BusinessMerchantOfficer;});
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BusinessAdStatus {
    #[serde(rename = "hasActiveCTWAAd")]
    pub has_active_ctwa_ad: bool,
    pub has_created_ad: bool,
}
#[derive(Clone, Copy, Debug, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum BusinessAccountSync {
    Disable,
    Import,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BusinessFacebookPage {
    #[serde(flatten)]
    pub ad_status: BusinessAdStatus,
    pub id: String,
    pub display_name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub profile_sync: Option<BusinessAccountSync>,
    pub profile_picture_url: String,
    pub show_on_profile: bool,
    #[serde(rename = "whatsAppAsPageButton")]
    pub whatsapp_as_page_button: bool,
}
model!(BusinessFacebookBusiness{id:String,display_name:String;catalog_id:String,catalog_state:BusinessAccountSync});
model!(BusinessInstagramProfessional{handle:String,display_name:String,profile_picture_url:String,show_on_profile:bool;});
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct BusinessWhatsAppAdIdentity {
    pub id: String,
    #[serde(flatten)]
    pub ad_status: BusinessAdStatus,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BusinessLinkedAccounts {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub facebook_page: Option<BusinessFacebookPage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub facebook_business: Option<BusinessFacebookBusiness>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub instagram_professional: Option<BusinessInstagramProfessional>,
    #[serde(rename = "whatsAppAdIdentity", skip_serializing_if = "Option::is_none")]
    pub whatsapp_ad_identity: Option<BusinessWhatsAppAdIdentity>,
}
#[derive(Clone, Copy, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BusinessFeature {
    MetaVerified,
    MarketingMessages,
    Genai,
    GenaiImage,
    MetaOne,
    BbPro,
}
model!(BusinessFeatureEligibility{feature:BusinessFeature,status:String;expiration:u64,additional_params:String,show_privacy_interstitial_to_new_users:bool,v1_enabled:bool});
model!(BusinessEligibility{features:Vec<BusinessFeatureEligibility>;});
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(untagged)]
pub enum BusinessCommandResponse<T> {
    Accepted(SuccessEnvelope<AsyncAccepted>),
    Completed(SuccessEnvelope<T>),
}
pub struct Business<'a>(pub(crate) &'a HttpTransport);
fn business(session: &str) -> String {
    format!("/messaging/{}/business", encode(session))
}
fn resource(session: &str, kind: &str, id: &str) -> String {
    format!("{}/{}/{}", business(session), kind, encode(id))
}
impl BusinessCatalogParameters {
    fn query(&self) -> Vec<(&'static str, String)> {
        let mut query = vec![("id", self.id.clone())];
        if let Some(v) = &self.after {
            query.push(("after", v.clone()));
        }
        for (k, v) in [
            ("limit", self.limit),
            ("width", self.width),
            ("height", self.height),
        ] {
            if let Some(v) = v {
                query.push((k, v.to_string()));
            }
        }
        query
    }
}
impl BusinessCollectionsParameters {
    fn query(&self) -> Vec<(&'static str, String)> {
        let mut query = vec![("id", self.id.clone())];
        if let Some(v) = &self.after {
            query.push(("after", v.clone()));
        }
        for (k, v) in [
            ("collectionLimit", self.collection_limit),
            ("itemLimit", self.item_limit),
            ("width", self.width),
            ("height", self.height),
        ] {
            if let Some(v) = v {
                query.push((k, v.to_string()));
            }
        }
        query
    }
}
impl Business<'_> {
    pub async fn get_profile(
        &self,
        session: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<BusinessProfile>>> {
        self.0
            .get(&format!("{}/profile", business(session)), options)
            .await
    }
    pub async fn update_profile(
        &self,
        session: &str,
        body: &BusinessProfileUpdateRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<BusinessCommandResponse<BusinessProfileStatus>>> {
        self.0
            .request(
                Method::PATCH,
                &format!("{}/profile", business(session)),
                &[],
                Some(body),
                options,
            )
            .await
    }
    pub async fn set_cover_photo(
        &self,
        session: &str,
        body: &BusinessCoverPhotoRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<BusinessCommandResponse<BusinessCoverPhotoResult>>> {
        self.0
            .request(
                Method::PUT,
                &format!("{}/profile/cover-photo", business(session)),
                &[],
                Some(body),
                options,
            )
            .await
    }
    pub async fn delete_cover_photo(
        &self,
        session: &str,
        id: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<BusinessCommandResponse<BusinessProfileStatus>>> {
        self.0
            .request::<_, ()>(
                Method::DELETE,
                &format!("{}/profile/cover-photo/{}", business(session), encode(id)),
                &[],
                None,
                options,
            )
            .await
    }
    pub async fn get_catalog(
        &self,
        session: &str,
        params: &BusinessCatalogParameters,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<BusinessCatalogPage>>> {
        self.0
            .request::<_, ()>(
                Method::GET,
                &format!("{}/catalog", business(session)),
                &params.query(),
                None,
                options,
            )
            .await
    }
    pub async fn create_catalog(
        &self,
        session: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<BusinessCommandResponse<BusinessActionSuccess>>> {
        self.0
            .request::<_, ()>(
                Method::POST,
                &format!("{}/catalog", business(session)),
                &[],
                None,
                options,
            )
            .await
    }
    pub async fn set_cart_enabled(
        &self,
        session: &str,
        body: &BusinessCartSettingRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<BusinessCommandResponse<BusinessActionSuccess>>> {
        self.0
            .request(
                Method::PATCH,
                &format!("{}/catalog/cart", business(session)),
                &[],
                Some(body),
                options,
            )
            .await
    }
    pub async fn get_product(
        &self,
        session: &str,
        product_id: &str,
        business_id: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<BusinessProduct>>> {
        self.0
            .request::<_, ()>(
                Method::GET,
                &resource(session, "products", product_id),
                &[("id", business_id.into())],
                None,
                options,
            )
            .await
    }
    pub async fn create_product(
        &self,
        session: &str,
        body: &BusinessProductMutationRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<BusinessCommandResponse<BusinessProduct>>> {
        self.0
            .request(
                Method::POST,
                &format!("{}/products", business(session)),
                &[],
                Some(body),
                options,
            )
            .await
    }
    pub async fn update_product(
        &self,
        session: &str,
        id: &str,
        body: &BusinessProductMutationRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<BusinessCommandResponse<BusinessProduct>>> {
        self.0
            .request(
                Method::PUT,
                &resource(session, "products", id),
                &[],
                Some(body),
                options,
            )
            .await
    }
    pub async fn delete_product(
        &self,
        session: &str,
        id: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<BusinessCommandResponse<BusinessProductDeleteResult>>> {
        self.0
            .request::<_, ()>(
                Method::DELETE,
                &resource(session, "products", id),
                &[],
                None,
                options,
            )
            .await
    }
    pub async fn set_product_visibility(
        &self,
        session: &str,
        id: &str,
        body: &BusinessProductVisibilityRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<BusinessCommandResponse<BusinessActionSuccess>>> {
        self.0
            .request(
                Method::PATCH,
                &format!("{}/visibility", resource(session, "products", id)),
                &[],
                Some(body),
                options,
            )
            .await
    }
    pub async fn appeal_product(
        &self,
        session: &str,
        id: &str,
        body: &BusinessCatalogAppealRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<BusinessCommandResponse<BusinessActionSuccess>>> {
        self.0
            .request(
                Method::POST,
                &format!("{}/appeal", resource(session, "products", id)),
                &[],
                Some(body),
                options,
            )
            .await
    }
    pub async fn list_collections(
        &self,
        session: &str,
        params: &BusinessCollectionsParameters,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<BusinessCollectionPage>>> {
        self.0
            .request::<_, ()>(
                Method::GET,
                &format!("{}/collections", business(session)),
                &params.query(),
                None,
                options,
            )
            .await
    }
    pub async fn get_collection(
        &self,
        session: &str,
        id: &str,
        params: &BusinessCollectionParameters,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<BusinessCollection>>> {
        self.0
            .request::<_, ()>(
                Method::GET,
                &resource(session, "collections", id),
                &params.query(),
                None,
                options,
            )
            .await
    }
    pub async fn create_collection(
        &self,
        session: &str,
        body: &BusinessCollectionCreateRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<BusinessCommandResponse<BusinessCollectionMutationResult>>> {
        self.0
            .request(
                Method::POST,
                &format!("{}/collections", business(session)),
                &[],
                Some(body),
                options,
            )
            .await
    }
    pub async fn update_collection(
        &self,
        session: &str,
        id: &str,
        body: &BusinessCollectionUpdateRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<BusinessCommandResponse<BusinessCollectionMutationResult>>> {
        self.0
            .request(
                Method::PATCH,
                &resource(session, "collections", id),
                &[],
                Some(body),
                options,
            )
            .await
    }
    pub async fn delete_collection(
        &self,
        session: &str,
        id: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<BusinessCommandResponse<BusinessActionSuccess>>> {
        self.0
            .request::<_, ()>(
                Method::DELETE,
                &resource(session, "collections", id),
                &[],
                None,
                options,
            )
            .await
    }
    pub async fn reorder_collections(
        &self,
        session: &str,
        body: &BusinessCollectionReorderRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<BusinessCommandResponse<BusinessActionSuccess>>> {
        self.0
            .request(
                Method::POST,
                &format!("{}/collections/reorder", business(session)),
                &[],
                Some(body),
                options,
            )
            .await
    }
    pub async fn appeal_collection(
        &self,
        session: &str,
        id: &str,
        body: &BusinessCatalogAppealRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<BusinessCommandResponse<BusinessActionSuccess>>> {
        self.0
            .request(
                Method::POST,
                &format!("{}/appeal", resource(session, "collections", id)),
                &[],
                Some(body),
                options,
            )
            .await
    }
    pub async fn get_order(
        &self,
        session: &str,
        id: &str,
        body: &BusinessOrderLookupRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<BusinessCommandResponse<BusinessOrder>>> {
        self.0
            .request(
                Method::POST,
                &format!("{}/lookup", resource(session, "orders", id)),
                &[],
                Some(body),
                options,
            )
            .await
    }
    pub async fn get_merchant_compliance(
        &self,
        session: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<BusinessMerchantCompliance>>> {
        self.0
            .get(&format!("{}/compliance", business(session)), options)
            .await
    }
    pub async fn set_merchant_compliance(
        &self,
        session: &str,
        body: &BusinessMerchantCompliance,
        options: RequestOptions,
    ) -> Result<ApiResponse<BusinessCommandResponse<BusinessMerchantCompliance>>> {
        self.0
            .request(
                Method::PUT,
                &format!("{}/compliance", business(session)),
                &[],
                Some(body),
                options,
            )
            .await
    }
    pub async fn get_linked_accounts(
        &self,
        session: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<BusinessLinkedAccounts>>> {
        self.0
            .get(&format!("{}/linked-accounts", business(session)), options)
            .await
    }
    pub async fn get_eligibility(
        &self,
        session: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<BusinessEligibility>>> {
        self.0
            .get(&format!("{}/eligibility", business(session)), options)
            .await
    }
}
