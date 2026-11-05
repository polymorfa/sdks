//! Typed Messaging and Platform campaigns. Enrollment and send eligibility remain API-owned.
use crate::campaign_contracts::{
    optional_nonnull, required_nullable, CampaignRecipientFailureReason,
};
use crate::campaign_existing::{input_error, validate_input, validate_message_extensions};
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

/// A recipient-variable binding. Empty bindings and numeric mapping keys are valid.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CampaignVariableBinding {
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "optional_nonnull"
    )]
    pub source: Option<String>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "optional_nonnull"
    )]
    pub fallback: Option<String>,
}
pub type CampaignVariableMapping = BTreeMap<String, CampaignVariableBinding>;
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CampaignTrackedLink {
    pub key: String,
    pub url: String,
}

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
#[derive(Clone, Debug, Deserialize)]
pub struct CampaignVariantMessage {
    pub version: CampaignBlueprintVersion,
    pub source: String,
    #[serde(flatten)]
    pub extensions: BTreeMap<String, serde_json::Value>,
}
impl Serialize for CampaignVariantMessage {
    fn serialize<S: serde::Serializer>(&self, s: S) -> std::result::Result<S::Ok, S::Error> {
        use serde::ser::{Error, SerializeMap};
        if ["version", "source"]
            .iter()
            .any(|k| self.extensions.contains_key(*k))
        {
            return Err(S::Error::custom("Reserved campaign blueprint field"));
        }
        let mut map = s.serialize_map(Some(2 + self.extensions.len()))?;
        map.serialize_entry("version", &self.version)?;
        map.serialize_entry("source", &self.source)?;
        for (k, v) in &self.extensions {
            map.serialize_entry(k, v)?;
        }
        map.end()
    }
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
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CampaignExperimentResults {
    pub criterion: CampaignWinnerCriterion,
    #[serde(deserialize_with = "required_nullable")]
    pub outcome: Option<CampaignExperimentOutcome>,
    pub holdout_count: u64,
    pub reserve_count: u64,
    pub variants: Vec<CampaignExperimentVariantResult>,
}
model!(CampaignMessageVariation{key:String,weight:u8,blueprint:CampaignVariantMessage;});
/// A follow-up sends either text or a project-scoped template.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case", deny_unknown_fields)]
pub enum CampaignFollowUpMessage {
    Text {
        text: String,
    },
    Template {
        #[serde(rename = "templateId")]
        template_id: String,
    },
}
// Receipt-timed beta follow-up. Timing stays optional even in returned configuration.
// Enrollment, defaults, bounds, and send eligibility remain API-owned.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CampaignFollowUp {
    pub message: CampaignFollowUpMessage,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "optional_nonnull"
    )]
    pub delay_seconds: Option<u32>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "optional_nonnull"
    )]
    pub expiry_seconds: Option<u32>,
}
wire_enum!(CampaignFollowUpStatus{WaitingReceipt="waiting_receipt",Scheduled="scheduled",Sending="sending",Sent="sent",Cancelled="cancelled",Expired="expired",Failed="failed",OutcomeUnknown="outcome_unknown"});
wire_enum!(CampaignFollowUpAnchorKind{Delivered="delivered",Read="read"});
// Receipt and outcome times are Unix milliseconds, with null for absent receipts.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CampaignFollowUpSummary {
    pub id: String,
    pub number_id: String,
    pub status: CampaignFollowUpStatus,
    #[serde(deserialize_with = "required_nullable")]
    pub anchor_kind: Option<CampaignFollowUpAnchorKind>,
    #[serde(deserialize_with = "required_nullable")]
    pub first_delivered_at: Option<u64>,
    #[serde(deserialize_with = "required_nullable")]
    pub first_read_at: Option<u64>,
    #[serde(deserialize_with = "required_nullable")]
    pub due_at: Option<u64>,
    pub expires_at: u64,
    #[serde(deserialize_with = "required_nullable")]
    pub sent_at: Option<u64>,
    #[serde(deserialize_with = "required_nullable")]
    pub delivered_at: Option<u64>,
    #[serde(deserialize_with = "required_nullable")]
    pub read_at: Option<u64>,
    #[serde(deserialize_with = "required_nullable")]
    pub replied_at: Option<u64>,
    #[serde(deserialize_with = "required_nullable")]
    pub reason: Option<String>,
    #[serde(deserialize_with = "required_nullable")]
    pub command_id: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CampaignFollowUpReport {
    pub total: u64,
    pub waiting: u64,
    pub scheduled: u64,
    pub sending: u64,
    pub sent: u64,
    pub delivered: u64,
    pub read: u64,
    pub replied: u64,
    pub cancelled: u64,
    pub expired: u64,
    pub failed: u64,
    pub unknown: u64,
    #[serde(deserialize_with = "required_nullable")]
    pub next_due_at: Option<u64>,
}

model!(CampaignSendWindowRange{start:String,end:String;});
model!(CampaignSendWindowRequest{days:Vec<CampaignWeekday>,hours:Vec<CampaignSendWindowRange>;time_zone:String,recipient_time_zone:bool,time_zone_variable:String});
model!(CampaignSendWindow{time_zone:String,days:Vec<CampaignWeekday>,hours:Vec<CampaignSendWindowRange>,recipient_time_zone:bool,time_zone_variable:String;});
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Campaign {
    pub tracked_links: Vec<CampaignTrackedLink>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "crate::configuration::deserialize_present_option"
    )]
    pub variable_mapping: Option<Option<CampaignVariableMapping>>,
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
    #[serde(deserialize_with = "required_nullable")]
    pub experiment_outcome: Option<CampaignExperimentOutcome>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "crate::configuration::deserialize_present_option"
    )]
    pub message_variations: Option<Option<Vec<CampaignMessageVariation>>>,
    #[serde(deserialize_with = "required_nullable")]
    pub follow_up: Option<CampaignFollowUp>,
    /// This campaign's own cap; `Some(None)` when only the team cap applies.
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "crate::configuration::deserialize_present_option"
    )]
    pub frequency_cap: Option<Option<CampaignFrequencyCap>>,
    /// `Some(None)` for a campaign that is not a drip.
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "crate::configuration::deserialize_present_option"
    )]
    pub drip: Option<Option<CampaignDrip>>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "crate::configuration::deserialize_present_option"
    )]
    pub enrollment_open: Option<Option<bool>>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "crate::configuration::deserialize_present_option"
    )]
    pub pause_reason: Option<Option<String>>,
    /// Read-only on the Messaging API; choose segments through the Platform API.
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "crate::configuration::deserialize_present_option"
    )]
    pub segment_id: Option<Option<String>>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "crate::configuration::deserialize_present_option"
    )]
    pub segment_snapshot: Option<Option<CampaignSegmentSnapshot>>,
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
    #[serde(deserialize_with = "required_nullable")]
    pub average_response_time_ms: Option<f64>,
    #[serde(deserialize_with = "required_nullable")]
    pub min_response_time_ms: Option<f64>,
    #[serde(deserialize_with = "required_nullable")]
    pub max_response_time_ms: Option<f64>,
    #[serde(deserialize_with = "required_nullable")]
    pub experiment: Option<CampaignExperimentResults>,
    pub follow_ups: CampaignFollowUpReport,
    /// Recipients with a message skipped by the contact frequency cap.
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "optional_nonnull"
    )]
    pub frequency_cap: Option<CampaignFrequencyCapAnalytics>,
    /// Per-step drip results; `Some(None)` for a campaign that is not a drip.
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "crate::configuration::deserialize_present_option"
    )]
    pub drip: Option<Option<CampaignDripStats>>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(untagged)]
pub enum CampaignVariableValue {
    String(String),
    Number(f64),
    Boolean(bool),
}
model!(CampaignRecipientInput{phone:String;variables:BTreeMap<String,CampaignVariableValue>});
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CampaignRecipient {
    pub id: String,
    pub phone: String,
    pub variables: BTreeMap<String, serde_json::Value>,
    pub status: CampaignRecipientStatus,
    pub attempts: u32,
    pub queued_at: u64,
    pub messages_sent: u64,
    #[serde(deserialize_with = "required_nullable")]
    pub variant_key: Option<String>,
    #[serde(deserialize_with = "required_nullable")]
    pub last_error: Option<String>,
    #[serde(deserialize_with = "required_nullable")]
    pub external_message_id: Option<String>,
    #[serde(deserialize_with = "required_nullable")]
    pub sent_at: Option<u64>,
    #[serde(deserialize_with = "required_nullable")]
    pub delivered_at: Option<u64>,
    #[serde(deserialize_with = "required_nullable")]
    pub read_at: Option<u64>,
    #[serde(deserialize_with = "required_nullable")]
    pub failed_at: Option<u64>,
    #[serde(deserialize_with = "required_nullable")]
    pub responded_at: Option<u64>,
    #[serde(deserialize_with = "required_nullable")]
    pub failure_reason: Option<CampaignRecipientFailureReason>,
    #[serde(deserialize_with = "required_nullable")]
    pub next_message_at: Option<f64>,
    #[serde(deserialize_with = "required_nullable")]
    pub sequence_error: Option<String>,
    #[serde(deserialize_with = "required_nullable")]
    pub follow_up: Option<CampaignFollowUpSummary>,
}

model!(CampaignRecipientPage{next_cursor:Option<String>,has_more:bool;});
model!(ListCampaignRecipientsResponse{success:bool,data:Vec<CampaignRecipient>,page:CampaignRecipientPage;});
model!(PlatformCampaignRecipientsEnvelope{data:Vec<CampaignRecipient>,page:CampaignRecipientPage;});
#[derive(Clone, Debug, Default)]
pub struct ListCampaignRecipientsParameters {
    pub reason: Option<CampaignRecipientFailureReason>,
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
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LaunchCampaignRequest {
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "optional_nonnull"
    )]
    pub skip_missing_variables: Option<bool>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "optional_nonnull"
    )]
    pub scheduled_at: Option<f64>,
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
nullable!(template_id:String,variable_mapping:CampaignVariableMapping,tracked_links:Vec<CampaignTrackedLink>,recipient_list_id:String,scheduled_at:u64,send_window:CampaignSendWindowRequest,message_variations:Vec<CampaignMessageVariation>,variants:Vec<CampaignVariant>,variant_strategy:CampaignVariantStrategy,follow_up:CampaignFollowUp,frequency_cap:CampaignFrequencyCap,drip:CampaignDripPatch);
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateCampaignRequest {
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "optional_nonnull"
    )]
    pub variable_mapping: Option<CampaignVariableMapping>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "crate::configuration::deserialize_present_option"
    )]
    pub tracked_links: Option<Option<Vec<CampaignTrackedLink>>>,
    pub name: String,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "optional_nonnull"
    )]
    pub template_id: Option<String>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "optional_nonnull"
    )]
    pub recipient_list_id: Option<String>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "optional_nonnull"
    )]
    pub sender_config: Option<BTreeMap<String, serde_json::Value>>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "optional_nonnull"
    )]
    pub scheduled_at: Option<u64>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "crate::configuration::deserialize_present_option"
    )]
    pub send_window: Option<Option<CampaignSendWindowRequest>>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "optional_nonnull"
    )]
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
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "crate::configuration::deserialize_present_option"
    )]
    pub follow_up: Option<Option<CampaignFollowUp>>,
    /// Beta campaign cap stricter than the team cap; `Some(None)` uses the team cap.
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "crate::configuration::deserialize_present_option"
    )]
    pub frequency_cap: Option<Option<CampaignFrequencyCap>>,
    /// Beta drip; `Some(None)` creates an ordinary campaign.
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "crate::configuration::deserialize_present_option"
    )]
    pub drip: Option<Option<CampaignDripInput>>,
}
impl ListCampaignRecipientsParameters {
    fn validate(&self) -> Result<()> {
        if self.limit.is_some_and(|n| !(1..=100).contains(&n))
            || self
                .cursor
                .as_ref()
                .is_some_and(|s| s.is_empty() || s.encode_utf16().count() > 256)
        {
            return Err(Error::local(
                ErrorKind::Validation,
                "Invalid campaign recipient query",
                "invalid_parameter",
            ));
        }
        Ok(())
    }
    fn query(&self) -> Vec<(&'static str, String)> {
        let mut query = Vec::new();
        if let Some(v) = self.reason {
            query.push((
                "reason",
                serde_json::to_value(v).unwrap().as_str().unwrap().into(),
            ));
        }
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
        validate_input(body, false, false)?;
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
        validate_input(body, false, true)?;
        if body.name.is_none()
            && body.sender_config.is_none()
            && body.recipient_list_id.is_none()
            && body.scheduled_at.is_none()
            && body.send_window.is_none()
            && body.message_variations.is_none()
            && body.variants.is_none()
            && body.variant_strategy.is_none()
            && body.follow_up.is_none()
            && body.template_id.is_none()
            && body.variable_mapping.is_none()
            && body.tracked_links.is_none()
            && body.frequency_cap.is_none()
            && body.drip.is_none()
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
        if body.scheduled_at.is_some_and(|n| !n.is_finite()) {
            return Err(input_error());
        }
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
        params.validate()?;
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
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "optional_nonnull"
    )]
    pub variable_mapping: Option<CampaignVariableMapping>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "crate::configuration::deserialize_present_option"
    )]
    pub tracked_links: Option<Option<Vec<CampaignTrackedLink>>>,
    pub project_id: String,
    pub name: String,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "optional_nonnull"
    )]
    pub template_id: Option<String>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "optional_nonnull"
    )]
    pub recipient_list_id: Option<String>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "optional_nonnull"
    )]
    pub sender_config: Option<BTreeMap<String, serde_json::Value>>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "optional_nonnull"
    )]
    pub scheduled_at: Option<u64>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "crate::configuration::deserialize_present_option"
    )]
    pub send_window: Option<Option<CampaignSendWindowRequest>>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "optional_nonnull"
    )]
    pub recipients: Option<Vec<CampaignRecipientInput>>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "optional_nonnull"
    )]
    pub recipient_count: Option<u64>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "optional_nonnull"
    )]
    pub composer_blueprint: Option<serde_json::Value>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "optional_nonnull"
    )]
    pub messages_array: Option<Vec<CampaignMessage>>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "optional_nonnull"
    )]
    pub audience_ref: Option<serde_json::Value>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "optional_nonnull"
    )]
    pub compliance_config: Option<serde_json::Value>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "optional_nonnull"
    )]
    pub variants: Option<Vec<CampaignVariant>>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "optional_nonnull"
    )]
    pub variant_strategy: Option<CampaignVariantStrategy>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "optional_nonnull"
    )]
    pub message_variations: Option<Vec<CampaignMessageVariation>>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "crate::configuration::deserialize_present_option"
    )]
    pub follow_up: Option<Option<CampaignFollowUp>>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "crate::configuration::deserialize_present_option"
    )]
    pub frequency_cap: Option<Option<CampaignFrequencyCap>>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "crate::configuration::deserialize_present_option"
    )]
    pub drip: Option<Option<CampaignDripInput>>,
    /// Beta saved segment evaluated at launch. Create permits omission, not null.
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "optional_nonnull"
    )]
    pub segment_id: Option<String>,
}
// The open update body names the documented fields, preserving any later API field.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct UpdatePlatformCampaignRequest {
    #[serde(
        rename = "messagesArray",
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "optional_nonnull"
    )]
    pub messages_array: Option<Vec<CampaignMessage>>,
    /// `Some(None)` clears the saved segment. Unlaunched drafts only.
    #[serde(
        rename = "segmentId",
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "crate::configuration::deserialize_present_option"
    )]
    pub segment_id: Option<Option<String>>,
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
    pub reason: Option<CampaignRecipientFailureReason>,
    pub status: Option<CampaignRecipientStatus>,
    pub cursor: Option<String>,
    pub limit: Option<u32>,
}
model!(AddPlatformCampaignRecipientsRequest{project_id:String,recipients:Vec<CampaignRecipientInput>;});
pub type AddPlatformCampaignRecipientsResult = AddCampaignRecipientsResult;
pub type PlatformCampaignAnalytics = CampaignAnalytics;
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

wire_enum!(CampaignMessageMediaKind{Image="image",Video="video",Audio="audio",Document="document"});
wire_enum!(CampaignMessageButtonKind{Reply="reply",Link="link",Call="call"});
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CampaignMessageMedia {
    pub kind: CampaignMessageMediaKind,
    pub url: String,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "optional_nonnull"
    )]
    pub filename: Option<String>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "optional_nonnull"
    )]
    pub caption: Option<String>,
    #[serde(flatten)]
    pub extensions: BTreeMap<String, serde_json::Value>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CampaignMessageButton {
    pub kind: CampaignMessageButtonKind,
    pub label: String,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "optional_nonnull"
    )]
    pub url: Option<String>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "optional_nonnull"
    )]
    pub phone: Option<String>,
    #[serde(flatten)]
    pub extensions: BTreeMap<String, serde_json::Value>,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CampaignMessage {
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "optional_nonnull"
    )]
    pub version: Option<CampaignBlueprintVersion>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "optional_nonnull"
    )]
    pub source: Option<String>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "optional_nonnull"
    )]
    pub media: Option<CampaignMessageMedia>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "optional_nonnull"
    )]
    pub buttons: Option<Vec<CampaignMessageButton>>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "optional_nonnull"
    )]
    pub footer: Option<String>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "optional_nonnull"
    )]
    pub delay_after_sec: Option<u32>,
    /// Display unit; the delay must be a whole multiple of it.
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "optional_nonnull"
    )]
    pub delay_unit: Option<CampaignDelayUnit>,
    /// Later drip steps only; `Some(None)` removes a step window.
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "crate::configuration::deserialize_present_option"
    )]
    pub send_window: Option<Option<CampaignStepWindow>>,
    #[serde(flatten)]
    pub extensions: BTreeMap<String, serde_json::Value>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LaunchPlatformCampaignRequest {
    pub project_id: String,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "optional_nonnull"
    )]
    pub scheduled_at: Option<f64>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "optional_nonnull"
    )]
    pub skip_missing_variables: Option<bool>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlatformCampaignLaunchResult {
    pub id: String,
    pub status: String,
    pub operation_id: String,
    #[serde(flatten)]
    pub extensions: BTreeMap<String, serde_json::Value>,
}

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
        if let Some(messages) = &body.messages_array {
            let drip = matches!(body.drip, Some(Some(_)));
            validate_message_extensions(messages, drip)?;
        }
        validate_input(body, true, false)?;
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
        #[derive(Deserialize)]
        struct NullableCampaignData {
            #[serde(deserialize_with = "required_nullable")]
            data: Option<PlatformCampaign>,
        }
        let response: ApiResponse<NullableCampaignData> = self
            .0
            .request::<_, ()>(
                Method::GET,
                &platform_campaign(id),
                &[("projectId", params.project_id.clone())],
                None,
                options,
            )
            .await?;
        Ok(ApiResponse {
            data: crate::models::DataEnvelope {
                data: response.data.data,
            },
            metadata: response.metadata,
        })
    }
    pub async fn update(
        &self,
        id: &str,
        body: Option<&UpdatePlatformCampaignRequest>,
        params: &PlatformCampaignParameters,
        options: RequestOptions,
    ) -> Result<ApiResponse<crate::models::DataEnvelope<PlatformCampaign>>> {
        if let Some(body) = body {
            for key in [
                "projectId",
                "id",
                "name",
                "senderConfig",
                "templateId",
                "variableMapping",
                "trackedLinks",
                "recipientListId",
                "scheduledAt",
                "sendWindow",
                "messageVariations",
                "variants",
                "variantStrategy",
                "followUp",
                "messagesArray",
                "frequencyCap",
                "drip",
                "segmentId",
            ] {
                if body.extensions.contains_key(key) {
                    return Err(input_error());
                }
            }
            if let Some(messages) = &body.messages_array {
                validate_message_extensions(messages, true)?;
            }
            validate_input(body, true, true)?;
        }
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
        body: &LaunchPlatformCampaignRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<crate::models::DataEnvelope<PlatformCampaignLaunchResult>>> {
        if !crate::campaign_existing::uuid(&body.project_id)
            || body.scheduled_at.is_some_and(|n| !n.is_finite())
        {
            return Err(input_error());
        }
        self.0
            .request(
                Method::POST,
                &format!("{}/launch", platform_campaign(id)),
                &[],
                Some(body),
                options.idempotent(),
            )
            .await
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
        ListCampaignRecipientsParameters {
            reason: params.reason,
            status: params.status,
            cursor: params.cursor.clone(),
            limit: params.limit,
        }
        .validate()?;
        let mut query = vec![("projectId", params.project_id.clone())];
        query.extend(
            ListCampaignRecipientsParameters {
                reason: params.reason,
                status: params.status,
                cursor: params.cursor.clone(),
                limit: params.limit,
            }
            .query(),
        );
        let response: ApiResponse<PlatformCampaignRecipientsEnvelope> = self
            .0
            .request::<_, ()>(
                Method::GET,
                &format!("{}/recipients", platform_campaign(id)),
                &query,
                None,
                options,
            )
            .await?;
        if response.data.data.iter().any(|r| {
            r.next_message_at
                .is_some_and(|n| !n.is_finite() || n.fract() != 0.0)
        }) {
            return Err(Error::local(
                ErrorKind::Server,
                "Invalid Platform recipient time",
                "invalid_response",
            )
            .with_metadata(response.metadata));
        }
        Ok(response)
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

/// Rolling per-contact limits; `None` means no additional limit for that window.
/// `max_per_24_hours` is 1..50 and cannot exceed `max_per_7_days` (1..200).
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CampaignFrequencyCap {
    #[serde(deserialize_with = "required_nullable")]
    pub max_per_24_hours: Option<u32>,
    #[serde(deserialize_with = "required_nullable")]
    pub max_per_7_days: Option<u32>,
}
/// The team cap. `revision` is 0 and `updated_at` is `None` until first saved.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CampaignFrequencyCapSettings {
    pub team_id: String,
    #[serde(deserialize_with = "required_nullable")]
    pub max_per_24_hours: Option<u32>,
    #[serde(deserialize_with = "required_nullable")]
    pub max_per_7_days: Option<u32>,
    pub revision: u64,
    #[serde(deserialize_with = "required_nullable")]
    pub updated_at: Option<u64>,
}
/// Complete replacement with the revision from the last read.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCampaignFrequencyCapRequest {
    pub max_per_24_hours: Option<u32>,
    pub max_per_7_days: Option<u32>,
    pub revision: u64,
}
model!(CampaignFrequencyCapAnalytics{skipped_recipient_count:u64;});
wire_enum!(CampaignDripEnrollment{Audience="audience",Continuous="continuous"});
/// Stored drip settings. A GET of a tracked link counts as a click, including
/// link previews and scanners.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CampaignDrip {
    pub enrollment: CampaignDripEnrollment,
    pub exit_on_reply: bool,
    pub exit_on_link_click: bool,
}
/// Create settings; the API applies audience, true and false to omitted fields.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CampaignDripInput {
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "optional_nonnull"
    )]
    pub enrollment: Option<CampaignDripEnrollment>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "optional_nonnull"
    )]
    pub exit_on_reply: Option<bool>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "optional_nonnull"
    )]
    pub exit_on_link_click: Option<bool>,
}
/// Partial settings. Omitted fields keep their stored values; no defaults apply.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CampaignDripPatch {
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "optional_nonnull"
    )]
    pub enrollment: Option<CampaignDripEnrollment>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "optional_nonnull"
    )]
    pub exit_on_reply: Option<bool>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "optional_nonnull"
    )]
    pub exit_on_link_click: Option<bool>,
}
model!(CampaignDripStepStats{step:u32,entered:u64,waiting:u64,sent:u64,delivered:u64,read:u64,replied:u64,exited:u64,failed:u64;});
model!(CampaignDripStats{enrollment:CampaignDripEnrollment,enrolled:u64,enrolled_by_api:u64,active:u64,completed:u64,exited:u64,steps:Vec<CampaignDripStepStats>;});
/// Values that appear in `CampaignRecipient::sequence_error`; arbitrary send
/// failure codes also occur there.
pub const CAMPAIGN_DRIP_EXIT_REASONS: [&str; 3] = ["replied", "link_clicked", "opted_out"];
model!(CampaignSegmentSnapshot{revision:u64,evaluated_at:u64,matched_count:u64;});
wire_enum!(CampaignDelayUnit{Minutes="minutes",Hours="hours",Days="days"});
/// Replaces the campaign weekdays and hours for a later drip step; at most four ranges.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CampaignStepWindow {
    pub days: Vec<CampaignWeekday>,
    pub hours: Vec<CampaignSendWindowRange>,
}
/// A phone already in the drip returns `created: false` and never restarts.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnrollCampaignContactRequest {
    pub phone: String,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "optional_nonnull"
    )]
    pub variables: Option<BTreeMap<String, CampaignVariableValue>>,
}
/// Team keys select the owning project explicitly.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnrollPlatformCampaignContactRequest {
    pub project_id: String,
    #[serde(flatten)]
    pub contact: EnrollCampaignContactRequest,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CampaignEnrollment {
    pub campaign_id: String,
    pub recipient_id: String,
    pub phone: String,
    pub created: bool,
    pub status: String,
    /// Unix milliseconds.
    pub enrolled_at: f64,
}
fn sent_once(mut options: RequestOptions) -> RequestOptions {
    options.max_network_retries = Some(0);
    options
}
const FREQUENCY_CAP: &str = "/platform/campaign-settings/frequency-cap";
impl PlatformCampaigns<'_> {
    /// Team cap. Team key with campaigns:read.
    pub async fn get_frequency_cap(
        &self,
        options: RequestOptions,
    ) -> Result<ApiResponse<crate::models::DataEnvelope<CampaignFrequencyCapSettings>>> {
        self.0.get(FREQUENCY_CAP, options).await
    }
    /// Replaces both limits with the last read revision. A stale revision returns
    /// `ErrorKind::Conflict`; read again and reconcile. Limits require beta access.
    /// Sent once: reconcile a lost response with a fresh read.
    pub async fn update_frequency_cap(
        &self,
        body: &UpdateCampaignFrequencyCapRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<crate::models::DataEnvelope<CampaignFrequencyCapSettings>>> {
        self.0
            .request(
                Method::PUT,
                FREQUENCY_CAP,
                &[],
                Some(body),
                sent_once(options),
            )
            .await
    }
    /// Adds a contact to a running or paused continuous drip. Sent once: per-phone
    /// server idempotency does not make an ambiguous retry safe.
    pub async fn enroll(
        &self,
        id: &str,
        body: &EnrollPlatformCampaignContactRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<crate::models::DataEnvelope<CampaignEnrollment>>> {
        if !crate::campaign_existing::uuid(&body.project_id) {
            return Err(input_error());
        }
        self.0
            .request(
                Method::POST,
                &format!("{}/enrollments", platform_campaign(id)),
                &[],
                Some(body),
                sent_once(options),
            )
            .await
    }
}
impl MessagingCampaigns<'_> {
    /// Adds a contact to a running or paused continuous drip; sent once.
    pub async fn enroll(
        &self,
        project: &str,
        id: &str,
        body: &EnrollCampaignContactRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<CampaignEnrollment>>> {
        self.0
            .request(
                Method::POST,
                &format!("{}/enrollments", messaging_campaign(project, id)),
                &[],
                Some(body),
                sent_once(options),
            )
            .await
    }
}
