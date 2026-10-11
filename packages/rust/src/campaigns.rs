//! Typed Messaging and Platform campaigns. Enrollment and send eligibility remain API-owned.
use crate::{
    models::SuccessEnvelope,
    transport::{encode, HttpTransport},
    ApiResponse, Error, ErrorKind, RequestOptions, Result,
};
use reqwest::Method;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
macro_rules! wire_enum{($name:ident{$($variant:ident=$wire:literal),*$(,)?})=>{#[derive(Clone,Copy,Debug,Serialize,Deserialize)]pub enum $name{$(#[serde(rename=$wire)]$variant),*}}}
macro_rules! model{($name:ident{$($field:ident:$ty:ty),*;$($opt:ident:$opt_ty:ty),*$(,)?})=>{#[derive(Clone,Debug,Serialize,Deserialize)]#[serde(rename_all="camelCase")]pub struct $name{$(pub $field:$ty,)*$(#[serde(skip_serializing_if="Option::is_none")]pub $opt:Option<$opt_ty>,)*}}}
wire_enum!(CampaignWinnerCriterion{Delivery="delivery",Read="read",Reply="reply"});
wire_enum!(CampaignWeekday{Monday="monday",Tuesday="tuesday",Wednesday="wednesday",Thursday="thursday",Friday="friday",Saturday="saturday",Sunday="sunday"});
wire_enum!(CampaignRecipientStatus{Queued="queued",Sending="sending",Sent="sent",Delivered="delivered",Read="read",Failed="failed",Skipped="skipped"});
wire_enum!(InvalidRecipientReason{MissingPhone="missing_phone",InvalidPhone="invalid_phone",InvalidVariables="invalid_variables",InvalidEntry="invalid_entry"});
#[derive(Clone, Copy, Debug, Serialize, Deserialize)]
#[serde(try_from = "u8", into = "u8")]
pub enum CampaignBlueprintVersion {
    V2,
}
impl From<CampaignBlueprintVersion> for u8 {
    fn from(_: CampaignBlueprintVersion) -> Self {
        2
    }
}
impl TryFrom<u8> for CampaignBlueprintVersion {
    type Error = &'static str;
    fn try_from(v: u8) -> std::result::Result<Self, Self::Error> {
        if v == 2 {
            Ok(Self::V2)
        } else {
            Err("campaign blueprint version must be 2")
        }
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CampaignVariantMessage {
    pub version: CampaignBlueprintVersion,
    pub source: String,
    #[serde(flatten)]
    pub extensions: BTreeMap<String, serde_json::Value>,
}
pub type CampaignMessageVariationBlueprint = CampaignVariantMessage;
model!(CampaignVariant{key:String,label:String,weight:u8,blueprint:CampaignVariantMessage;});
model!(CampaignVariantStrategy{winner_criterion:CampaignWinnerCriterion,holdout_percent:u8,auto_promote:bool,test_window_minutes:u32;test_slice_percent:u8});
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "state", rename_all = "snake_case")]
pub enum CampaignExperimentOutcome {
    Promoted {
        #[serde(rename = "winnerKey")]
        winner_key: String,
    },
    Inconclusive {
        reason: CampaignInconclusiveReason,
    },
}
wire_enum!(CampaignInconclusiveReason{InsufficientEvidence="insufficient_evidence"});
model!(CampaignExperimentVariantResult{key:String,label:String,weight:u8,assigned:u64,sent:u64,delivered:u64,read:u64,replied:u64,outcome_rate:f64;});
model!(CampaignExperimentResults{criterion:CampaignWinnerCriterion,outcome:Option<CampaignExperimentOutcome>,holdout_count:u64,reserve_count:u64,variants:Vec<CampaignExperimentVariantResult>;});
model!(CampaignMessageVariation{key:String,weight:u8,blueprint:CampaignVariantMessage;});
model!(CampaignSendWindowRange{start:String,end:String;});
model!(CampaignSendWindowRequest{days:Vec<CampaignWeekday>,hours:Vec<CampaignSendWindowRange>;time_zone:String,recipient_time_zone:bool,time_zone_variable:String});
model!(CampaignSendWindow{time_zone:String,days:Vec<CampaignWeekday>,hours:Vec<CampaignSendWindowRange>,recipient_time_zone:bool,time_zone_variable:String;});
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Campaign {
    pub id: String,
    pub name: String,
    pub status: String,
    pub template_id: Option<String>,
    pub recipient_list_id: Option<String>,
    pub recipient_count: u64,
    pub sent_count: u64,
    pub delivered_count: u64,
    pub read_count: u64,
    pub failed_count: u64,
    pub skipped_count: u64,
    pub scheduled_at: Option<u64>,
    pub launched_at: Option<u64>,
    pub completed_at: Option<u64>,
    pub created_at: u64,
    pub updated_at: u64,
    pub send_window: Option<CampaignSendWindow>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub composer_blueprint: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub messages: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub audience_ref: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sender_config: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub compliance_config: Option<serde_json::Value>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "crate::configuration::deserialize_present_option"
    )]
    pub variants: Option<Option<Vec<CampaignVariant>>>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "crate::configuration::deserialize_present_option"
    )]
    pub variant_strategy: Option<Option<CampaignVariantStrategy>>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "crate::configuration::deserialize_present_option"
    )]
    pub experiment_outcome: Option<Option<CampaignExperimentOutcome>>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "crate::configuration::deserialize_present_option"
    )]
    pub message_variations: Option<Option<Vec<CampaignMessageVariation>>>,
    #[serde(flatten)]
    pub extensions: BTreeMap<String, serde_json::Value>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CampaignAnalytics {
    pub campaign_id: String,
    pub recipient_count: u64,
    pub sent_count: u64,
    pub delivered_count: u64,
    pub read_count: u64,
    pub failed_count: u64,
    pub skipped_count: u64,
    pub responded_count: u64,
    pub response_rate: f64,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "crate::configuration::deserialize_present_option"
    )]
    pub experiment: Option<Option<CampaignExperimentResults>>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(untagged)]
pub enum CampaignVariableValue {
    String(String),
    Number(f64),
    Boolean(bool),
}
model!(CampaignRecipientInput{phone:String;variables:BTreeMap<String,CampaignVariableValue>});
model!(CampaignRecipient{id:String,phone:String,variables:BTreeMap<String,serde_json::Value>,variant_key:Option<String>,status:CampaignRecipientStatus,attempts:u32,last_error:Option<String>,external_message_id:Option<String>,queued_at:u64,sent_at:Option<u64>,delivered_at:Option<u64>,read_at:Option<u64>,failed_at:Option<u64>,responded_at:Option<u64>;});
model!(CampaignRecipientPage{next_cursor:Option<String>,has_more:bool;});
model!(ListCampaignRecipientsResponse{success:bool,data:Vec<CampaignRecipient>,page:CampaignRecipientPage;});
model!(PlatformCampaignRecipientsEnvelope{data:Vec<CampaignRecipient>,page:CampaignRecipientPage;});
#[derive(Clone, Debug, Default)]
pub struct ListCampaignRecipientsParameters {
    pub status: Option<CampaignRecipientStatus>,
    pub cursor: Option<String>,
    pub limit: Option<u32>,
}
model!(InvalidRecipientRow{row:u32,reason:InvalidRecipientReason;});
model!(AddCampaignRecipientsRequest{recipients:Vec<CampaignRecipientInput>;});
model!(AddCampaignRecipientsResult{campaign_id:String,added:u64,recipient_count:u64,duplicate_count:u64,invalid_count:u64,invalid_rows:Vec<InvalidRecipientRow>;});
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CampaignOperation {
    #[serde(flatten)]
    pub campaign: Campaign,
    pub operation_id: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CampaignStopOperation {
    #[serde(flatten)]
    pub campaign: Campaign,
    pub operation_id: Option<String>,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchCampaignRequest {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub scheduled_at: Option<u64>,
}
model!(RescheduleCampaignRequest{scheduled_at:Option<u64>;});
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RequeueCampaignRequest {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub include_skipped_error: Option<bool>,
}
model!(CampaignRequeueResult{requeued:u64;});
macro_rules! nullable{($($field:ident:$ty:ty),*$(,)?)=>{#[derive(Clone,Debug,Default,Serialize,Deserialize)]#[serde(rename_all="camelCase")]pub struct UpdateCampaignRequest{#[serde(skip_serializing_if="Option::is_none")]pub name:Option<String>,#[serde(skip_serializing_if="Option::is_none")]pub sender_config:Option<BTreeMap<String,serde_json::Value>>,$(#[serde(default,skip_serializing_if="Option::is_none",deserialize_with="crate::configuration::deserialize_present_option")]pub $field:Option<Option<$ty>>,)*}}}
nullable!(recipient_list_id:String,scheduled_at:u64,send_window:CampaignSendWindowRequest,message_variations:Vec<CampaignMessageVariation>,variants:Vec<CampaignVariant>,variant_strategy:CampaignVariantStrategy);
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateCampaignRequest {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub template_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub recipient_list_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sender_config: Option<BTreeMap<String, serde_json::Value>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub scheduled_at: Option<u64>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "crate::configuration::deserialize_present_option"
    )]
    pub send_window: Option<Option<CampaignSendWindowRequest>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub recipients: Option<Vec<CampaignRecipientInput>>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "crate::configuration::deserialize_present_option"
    )]
    pub message_variations: Option<Option<Vec<CampaignMessageVariation>>>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "crate::configuration::deserialize_present_option"
    )]
    pub variants: Option<Option<Vec<CampaignVariant>>>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "crate::configuration::deserialize_present_option"
    )]
    pub variant_strategy: Option<Option<CampaignVariantStrategy>>,
}
impl ListCampaignRecipientsParameters {
    fn query(&self) -> Vec<(&'static str, String)> {
        let mut query = Vec::new();
        if let Some(v) = self.status {
            query.push((
                "status",
                serde_json::to_value(v).unwrap().as_str().unwrap().into(),
            ));
        }
        if let Some(v) = &self.cursor {
            query.push(("cursor", v.clone()));
        }
        if let Some(v) = self.limit {
            query.push(("limit", v.to_string()));
        }
        query
    }
}
fn without_automatic_retry(mut options: RequestOptions) -> RequestOptions {
    if options.max_network_retries.is_none() {
        options.max_network_retries = Some(0);
    }
    options
}
pub struct MessagingCampaigns<'a>(pub(crate) &'a HttpTransport);
fn messaging_campaigns(project: &str) -> String {
    format!("/messaging/projects/{}/campaigns", encode(project))
}
fn messaging_campaign(project: &str, id: &str) -> String {
    format!("{}/{}", messaging_campaigns(project), encode(id))
}
impl MessagingCampaigns<'_> {
    pub async fn list(
        &self,
        project: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<Vec<Campaign>>>> {
        self.0.get(&messaging_campaigns(project), options).await
    }
    pub async fn create(
        &self,
        project: &str,
        body: &CreateCampaignRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<Campaign>>> {
        self.0
            .request(
                Method::POST,
                &messaging_campaigns(project),
                &[],
                Some(body),
                options.idempotent(),
            )
            .await
    }
    pub async fn retrieve(
        &self,
        project: &str,
        id: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<Campaign>>> {
        self.0.get(&messaging_campaign(project, id), options).await
    }
    pub async fn update(
        &self,
        project: &str,
        id: &str,
        body: &UpdateCampaignRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<Campaign>>> {
        if body.name.is_none()
            && body.sender_config.is_none()
            && body.recipient_list_id.is_none()
            && body.scheduled_at.is_none()
            && body.send_window.is_none()
            && body.message_variations.is_none()
            && body.variants.is_none()
            && body.variant_strategy.is_none()
        {
            return Err(Error::local(
                ErrorKind::Validation,
                "At least one campaign field must be supplied",
                "invalid_campaign_update",
            ));
        }
        self.0
            .request(
                Method::PATCH,
                &messaging_campaign(project, id),
                &[],
                Some(body),
                without_automatic_retry(options),
            )
            .await
    }
    pub async fn analytics(
        &self,
        project: &str,
        id: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<CampaignAnalytics>>> {
        self.0
            .get(
                &format!("{}/analytics", messaging_campaign(project, id)),
                options,
            )
            .await
    }
    pub async fn launch(
        &self,
        project: &str,
        id: &str,
        body: &LaunchCampaignRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<CampaignOperation>>> {
        self.0
            .request(
                Method::POST,
                &format!("{}/launch", messaging_campaign(project, id)),
                &[],
                Some(body),
                options.idempotent(),
            )
            .await
    }
    pub async fn reschedule(
        &self,
        project: &str,
        id: &str,
        body: &RescheduleCampaignRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<CampaignOperation>>> {
        self.0
            .request(
                Method::POST,
                &format!("{}/reschedule", messaging_campaign(project, id)),
                &[],
                Some(body),
                options.idempotent(),
            )
            .await
    }
    pub async fn pause(
        &self,
        project: &str,
        id: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<CampaignOperation>>> {
        self.0
            .request::<_, ()>(
                Method::POST,
                &format!("{}/pause", messaging_campaign(project, id)),
                &[],
                None,
                options.idempotent(),
            )
            .await
    }
    pub async fn resume(
        &self,
        project: &str,
        id: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<CampaignOperation>>> {
        self.0
            .request::<_, ()>(
                Method::POST,
                &format!("{}/resume", messaging_campaign(project, id)),
                &[],
                None,
                options.idempotent(),
            )
            .await
    }
    pub async fn stop(
        &self,
        project: &str,
        id: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<CampaignStopOperation>>> {
        self.0
            .request::<_, ()>(
                Method::POST,
                &format!("{}/stop", messaging_campaign(project, id)),
                &[],
                None,
                options.idempotent(),
            )
            .await
    }
    pub async fn list_recipients(
        &self,
        project: &str,
        id: &str,
        params: &ListCampaignRecipientsParameters,
        options: RequestOptions,
    ) -> Result<ApiResponse<ListCampaignRecipientsResponse>> {
        self.0
            .request::<_, ()>(
                Method::GET,
                &format!("{}/recipients", messaging_campaign(project, id)),
                &params.query(),
                None,
                options,
            )
            .await
    }
    pub async fn add_recipients(
        &self,
        project: &str,
        id: &str,
        body: &AddCampaignRecipientsRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<AddCampaignRecipientsResult>>> {
        self.0
            .request(
                Method::POST,
                &format!("{}/recipients", messaging_campaign(project, id)),
                &[],
                Some(body),
                without_automatic_retry(options),
            )
            .await
    }
    pub async fn requeue(
        &self,
        project: &str,
        id: &str,
        body: &RequeueCampaignRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<CampaignRequeueResult>>> {
        self.0
            .request(
                Method::POST,
                &format!("{}/requeue", messaging_campaign(project, id)),
                &[],
                Some(body),
                options,
            )
            .await
    }
}
/// Platform deliberately permits unnamed campaign result fields; they are preserved
/// by `Campaign::extensions` after all documented fields are decoded.
pub type PlatformCampaign = Campaign;
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatePlatformCampaignRequest {
    pub project_id: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub template_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub recipient_list_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sender_config: Option<BTreeMap<String, serde_json::Value>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub scheduled_at: Option<u64>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "crate::configuration::deserialize_present_option"
    )]
    pub send_window: Option<Option<CampaignSendWindowRequest>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub recipients: Option<Vec<CampaignRecipientInput>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub recipient_count: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub composer_blueprint: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub messages_array: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub audience_ref: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub compliance_config: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub variants: Option<Vec<CampaignVariant>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub variant_strategy: Option<CampaignVariantStrategy>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message_variations: Option<Vec<CampaignMessageVariation>>,
}
// The open update body names the documented fields, preserving any later API field.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct UpdatePlatformCampaignRequest {
    #[serde(flatten)]
    pub changes: UpdateCampaignRequest,
    #[serde(flatten)]
    pub extensions: BTreeMap<String, serde_json::Value>,
}
model!(ListCampaignsParameters{project_id:String;project_slug:String});
model!(PlatformCampaignParameters{project_id:String;});
model!(ReschedulePlatformCampaignRequest{project_id:String,scheduled_at:Option<u64>;});
#[derive(Clone, Debug)]
pub struct ListPlatformCampaignRecipientsParameters {
    pub project_id: String,
    pub status: Option<CampaignRecipientStatus>,
    pub cursor: Option<String>,
    pub limit: Option<u32>,
}
model!(AddPlatformCampaignRecipientsRequest{project_id:String,recipients:Vec<CampaignRecipientInput>;});
pub type AddPlatformCampaignRecipientsResult = AddCampaignRecipientsResult;
model!(PlatformCampaignAnalytics{campaign_id:String,recipient_count:u64,sent_count:u64,delivered_count:u64,read_count:u64,failed_count:u64,skipped_count:u64,responded_count:u64,response_rate:f64,average_response_time_ms:Option<f64>,min_response_time_ms:Option<f64>,max_response_time_ms:Option<f64>,experiment:Option<CampaignExperimentResults>;});
model!(CampaignConversionValue{amount_minor:u64,currency:String;});
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordCampaignConversionRequest {
    pub project_id: String,
    pub recipient_id: String,
    pub event_id: String,
    pub event_type: String,
    pub occurred_at: String,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "crate::configuration::deserialize_present_option"
    )]
    pub value: Option<Option<CampaignConversionValue>>,
}
wire_enum!(CampaignConversionOutcome{Attributed="attributed",OutsideWindow="outside_window",NotSent="not_sent",OptedOut="opted_out"});
wire_enum!(CampaignConversionEvidence{CustomerReported="customer_reported"});
model!(CampaignConversionAttribution{outcome:CampaignConversionOutcome,touch_at:Option<String>,window_days:u8;});
model!(CampaignConversion{id:String,campaign_id:String,recipient_id:Option<String>,event_type:String,occurred_at:String,value:Option<CampaignConversionValue>,evidence:CampaignConversionEvidence,attribution:CampaignConversionAttribution,recorded_at:String,replayed:bool;});
model!(CampaignConversionCurrencyTotal{currency:String,evidence:CampaignConversionEvidence,attributed_conversions:u64,attributed_amount_minor:String,unattributed_conversions:u64,unattributed_amount_minor:String;});
wire_enum!(CampaignConversionTouch{RecipientSent="recipient_sent"});
wire_enum!(CampaignConversionCorrelation{ExplicitRecipient="explicit_recipient"});
model!(CampaignConversionModel{touch:CampaignConversionTouch,window_days:u8,correlation:CampaignConversionCorrelation;});
model!(CampaignConversionCounts{total:u64,attributed:u64,outside_window:u64,not_sent:u64,opted_out:u64;});
model!(CampaignConversionReport{campaign_id:String,model:CampaignConversionModel,sent_count:u64,conversions:CampaignConversionCounts,converted_recipients:u64,conversion_rate:f64,values:Vec<CampaignConversionCurrencyTotal>;});
pub type PlatformCampaignPayload = BTreeMap<String, serde_json::Value>;
pub struct PlatformCampaigns<'a>(pub(crate) &'a HttpTransport);
fn platform_campaign(id: &str) -> String {
    format!("/platform/campaigns/{}", encode(id))
}
impl PlatformCampaigns<'_> {
    pub async fn list(
        &self,
        params: &ListCampaignsParameters,
        options: RequestOptions,
    ) -> Result<ApiResponse<crate::models::DataEnvelope<Vec<PlatformCampaign>>>> {
        let mut query = vec![("projectId", params.project_id.clone())];
        if let Some(v) = &params.project_slug {
            query.push(("projectSlug", v.clone()));
        }
        self.0
            .request::<_, ()>(Method::GET, "/platform/campaigns", &query, None, options)
            .await
    }
    pub async fn create(
        &self,
        body: &CreatePlatformCampaignRequest,
        mut options: RequestOptions,
    ) -> Result<ApiResponse<crate::models::DataEnvelope<PlatformCampaign>>> {
        options.max_network_retries = Some(0);
        options.idempotency_key = None;
        self.0
            .request(
                Method::POST,
                "/platform/campaigns",
                &[],
                Some(body),
                options,
            )
            .await
    }
    pub async fn retrieve(
        &self,
        id: &str,
        params: &PlatformCampaignParameters,
        options: RequestOptions,
    ) -> Result<ApiResponse<crate::models::DataEnvelope<Option<PlatformCampaign>>>> {
        self.0
            .request::<_, ()>(
                Method::GET,
                &platform_campaign(id),
                &[("projectId", params.project_id.clone())],
                None,
                options,
            )
            .await
    }
    pub async fn update(
        &self,
        id: &str,
        body: Option<&UpdatePlatformCampaignRequest>,
        params: &PlatformCampaignParameters,
        options: RequestOptions,
    ) -> Result<ApiResponse<crate::models::DataEnvelope<PlatformCampaign>>> {
        self.0
            .request(
                Method::PATCH,
                &platform_campaign(id),
                &[("projectId", params.project_id.clone())],
                body,
                options,
            )
            .await
    }
    pub async fn delete(
        &self,
        id: &str,
        params: &PlatformCampaignParameters,
        options: RequestOptions,
    ) -> Result<ApiResponse<crate::models::DataEnvelope<PlatformCampaignPayload>>> {
        self.0
            .request::<_, ()>(
                Method::DELETE,
                &platform_campaign(id),
                &[("projectId", params.project_id.clone())],
                None,
                options,
            )
            .await
    }
    pub async fn launch(
        &self,
        id: &str,
        body: Option<&PlatformCampaignPayload>,
        options: RequestOptions,
    ) -> Result<ApiResponse<crate::models::DataEnvelope<PlatformCampaignPayload>>> {
        self.action(id, "launch", body, options.idempotent()).await
    }
    pub async fn pause(
        &self,
        id: &str,
        body: Option<&PlatformCampaignPayload>,
        options: RequestOptions,
    ) -> Result<ApiResponse<crate::models::DataEnvelope<PlatformCampaignPayload>>> {
        self.action(id, "pause", body, options.idempotent()).await
    }
    pub async fn resume(
        &self,
        id: &str,
        body: Option<&PlatformCampaignPayload>,
        options: RequestOptions,
    ) -> Result<ApiResponse<crate::models::DataEnvelope<PlatformCampaignPayload>>> {
        self.action(id, "resume", body, options.idempotent()).await
    }
    pub async fn stop(
        &self,
        id: &str,
        body: Option<&PlatformCampaignPayload>,
        options: RequestOptions,
    ) -> Result<ApiResponse<crate::models::DataEnvelope<PlatformCampaignPayload>>> {
        self.action(id, "stop", body, options.idempotent()).await
    }
    pub async fn archive(
        &self,
        id: &str,
        body: Option<&PlatformCampaignPayload>,
        options: RequestOptions,
    ) -> Result<ApiResponse<crate::models::DataEnvelope<PlatformCampaignPayload>>> {
        self.action(id, "archive", body, options).await
    }
    pub async fn duplicate(
        &self,
        id: &str,
        body: Option<&PlatformCampaignPayload>,
        options: RequestOptions,
    ) -> Result<ApiResponse<crate::models::DataEnvelope<PlatformCampaignPayload>>> {
        self.action(id, "duplicate", body, options).await
    }
    pub async fn requeue(
        &self,
        id: &str,
        body: Option<&PlatformCampaignPayload>,
        options: RequestOptions,
    ) -> Result<ApiResponse<crate::models::DataEnvelope<PlatformCampaignPayload>>> {
        self.action(id, "requeue", body, options).await
    }
    pub async fn reschedule(
        &self,
        id: &str,
        body: &ReschedulePlatformCampaignRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<crate::models::DataEnvelope<PlatformCampaignPayload>>> {
        self.0
            .request(
                Method::POST,
                &format!("{}/reschedule", platform_campaign(id)),
                &[],
                Some(body),
                options.idempotent(),
            )
            .await
    }
    pub async fn analytics(
        &self,
        id: &str,
        params: &PlatformCampaignParameters,
        options: RequestOptions,
    ) -> Result<ApiResponse<crate::models::DataEnvelope<PlatformCampaignAnalytics>>> {
        self.0
            .request::<_, ()>(
                Method::GET,
                &format!("{}/analytics", platform_campaign(id)),
                &[("projectId", params.project_id.clone())],
                None,
                options,
            )
            .await
    }
    pub async fn events(
        &self,
        id: &str,
        params: &PlatformCampaignParameters,
        options: RequestOptions,
    ) -> Result<ApiResponse<crate::models::DataEnvelope<PlatformCampaignPayload>>> {
        self.0
            .request::<_, ()>(
                Method::GET,
                &format!("{}/events", platform_campaign(id)),
                &[("projectId", params.project_id.clone())],
                None,
                options,
            )
            .await
    }
    pub async fn recipients(
        &self,
        id: &str,
        params: &ListPlatformCampaignRecipientsParameters,
        options: RequestOptions,
    ) -> Result<ApiResponse<PlatformCampaignRecipientsEnvelope>> {
        let mut query = vec![("projectId", params.project_id.clone())];
        query.extend(
            ListCampaignRecipientsParameters {
                status: params.status,
                cursor: params.cursor.clone(),
                limit: params.limit,
            }
            .query(),
        );
        self.0
            .request::<_, ()>(
                Method::GET,
                &format!("{}/recipients", platform_campaign(id)),
                &query,
                None,
                options,
            )
            .await
    }
    pub async fn add_recipients(
        &self,
        id: &str,
        body: &AddPlatformCampaignRecipientsRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<crate::models::DataEnvelope<AddPlatformCampaignRecipientsResult>>> {
        self.0
            .request(
                Method::POST,
                &format!("{}/recipients", platform_campaign(id)),
                &[],
                Some(body),
                without_automatic_retry(options),
            )
            .await
    }
    pub async fn record_conversion(
        &self,
        id: &str,
        body: &RecordCampaignConversionRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<crate::models::DataEnvelope<CampaignConversion>>> {
        self.0
            .request(
                Method::POST,
                &format!("{}/conversions", platform_campaign(id)),
                &[],
                Some(body),
                options,
            )
            .await
    }
    pub async fn conversions(
        &self,
        id: &str,
        params: &PlatformCampaignParameters,
        options: RequestOptions,
    ) -> Result<ApiResponse<crate::models::DataEnvelope<CampaignConversionReport>>> {
        self.0
            .request::<_, ()>(
                Method::GET,
                &format!("{}/conversions", platform_campaign(id)),
                &[("projectId", params.project_id.clone())],
                None,
                options,
            )
            .await
    }
    async fn action(
        &self,
        id: &str,
        action: &str,
        body: Option<&PlatformCampaignPayload>,
        options: RequestOptions,
    ) -> Result<ApiResponse<crate::models::DataEnvelope<PlatformCampaignPayload>>> {
        self.0
            .request(
                Method::POST,
                &format!("{}/{action}", platform_campaign(id)),
                &[],
                body,
                options,
            )
            .await
    }
}
