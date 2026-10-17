//! Campaign, customer-supplied profile and future custody-default contract types.
//! These source additions consume the unpublished 2026-10-14 contract.
use serde::{Deserialize, Deserializer, Serialize};
use std::collections::BTreeMap;

pub(crate) fn required_nullable<'de, D, T>(d: D) -> std::result::Result<Option<T>, D::Error>
where
    D: Deserializer<'de>,
    T: Deserialize<'de>,
{
    Option::<T>::deserialize(d)
}
pub(crate) fn optional_nonnull<'de, D, T>(d: D) -> std::result::Result<Option<T>, D::Error>
where
    D: Deserializer<'de>,
    T: Deserialize<'de>,
{
    T::deserialize(d).map(Some)
}
macro_rules! enumeration {($n:ident{$($v:ident=$s:literal),+$(,)?})=>{#[derive(Clone,Copy,Debug,PartialEq,Eq,Serialize,Deserialize)]pub enum $n{$(#[serde(rename=$s)]$v),+}};}
macro_rules! model {($n:ident{$($r:ident:$rt:ty),*};{$($z:ident:$zt:ty),*};{$($o:ident:$ot:ty),*})=>{#[derive(Clone,Debug,Serialize,Deserialize)]#[serde(rename_all="camelCase")]pub struct $n{$(pub $r:$rt,)*$(#[serde(deserialize_with="required_nullable")]pub $z:Option<$zt>,)*$(#[serde(default,skip_serializing_if="Option::is_none",deserialize_with="optional_nonnull")]pub $o:Option<$ot>,)*}};}
enumeration!(ReplyChoiceKind{Button="button",List="list"});
enumeration!(CampaignTestStatus{Sent="sent"});
enumeration!(CampaignApprovalAction{Launch="launch",Resume="resume",Reschedule="reschedule"});
enumeration!(CampaignApprovalStatus{Pending="pending",Approved="approved",Rejected="rejected",Superseded="superseded",Expired="expired"});
enumeration!(CampaignApprovalReason{AudienceThreshold="audience_threshold",AgentRequest="agent_request"});
enumeration!(CampaignRetargetOutcome{Delivered="delivered",NotDelivered="not_delivered",Read="read",NotRead="not_read",Replied="replied",NotReplied="not_replied",Failed="failed"});
enumeration!(CampaignAudienceSource{Campaign="campaign"});
enumeration!(AudienceProfileSource{Api="api",Csv="csv",Form="form"});
enumeration!(AudienceConsentPurpose{Campaigns="campaigns"});
enumeration!(AudienceProfileImportState{Queued="queued",Completed="completed",Cancelled="cancelled"});
enumeration!(AudienceProfileConflictReason{Quota="quota",RevisionConflict="revision_conflict"});
enumeration!(StopConfirmationLocale{English="en",Portuguese="pt-BR",Spanish="es"});
enumeration!(SignalCustodyMode{Standard="standard",ZeroKnowledge="zero_knowledge"});
enumeration!(CampaignRecipientFailureReason{OptedOut="opted_out",ColdHeld="cold_held",CampaignCancelled="campaign_cancelled",InvalidRecipient="invalid_recipient",SessionNotConnected="session_not_connected",AckTimeout="ack_timeout",BlockedBySafety="blocked_by_safety",SendFailed="send_failed",MissingVariable="missing_variable",FrequencyCap="frequency_cap",Other="other"});
model!(CampaignReplyButton{id:String,text:String};{};{});
model!(CampaignReplyRow{id:String,title:String};{};{description:String});
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum CampaignReplyFlowSend {
    Text {
        text: String,
    },
    Buttons {
        body: String,
        #[serde(
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "optional_nonnull"
        )]
        footer: Option<String>,
        buttons: Vec<CampaignReplyButton>,
    },
    List {
        body: String,
        #[serde(rename = "buttonText")]
        button_text: String,
        #[serde(
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "optional_nonnull"
        )]
        footer: Option<String>,
        rows: Vec<CampaignReplyRow>,
    },
    FlowForm {
        #[serde(rename = "flowId")]
        flow_id: String,
        body: String,
        #[serde(rename = "buttonText")]
        button_text: String,
        #[serde(
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "optional_nonnull"
        )]
        footer: Option<String>,
        screen: String,
    },
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum CampaignReplyFlowMatch {
    Choice {
        #[serde(rename = "replyKind")]
        reply_kind: ReplyChoiceKind,
        id: String,
    },
    Keyword {
        value: String,
    },
    FlowSubmission,
}
model!(CampaignReplyFlowEdge{r#match:CampaignReplyFlowMatch,to:String};{};{});
model!(CampaignReplyFlowNode{id:String,edges:Vec<CampaignReplyFlowEdge>};{};{send:CampaignReplyFlowSend});
model!(CampaignReplyFlowDefinition{entry_node_id:String,nodes:Vec<CampaignReplyFlowNode>};{};{});
model!(CreateCampaignReplyFlowRequest{name:String,definition:CampaignReplyFlowDefinition};{};{flow_key:String,revision:u64});
model!(CampaignReplyFlow{id:String,flow_key:String,revision:u64,name:String,definition:CampaignReplyFlowDefinition,created_at:u64};{};{});
model!(SetCampaignReplyFlowRequest{};{reply_flow_id:String};{});
model!(CampaignReplyFlowAssignment{campaign_id:String};{reply_flow_id:String};{});
pub use crate::campaigns::CampaignVariableValue as CampaignTestVariable;
pub type AudienceProfileAttribute = Option<CampaignTestVariable>;
model!(CampaignTestSendRequest{session_id:String,to:String};{};{sample_recipient_id:String,variables:BTreeMap<String,CampaignTestVariable>});
model!(CampaignTestSender{session_id:String,phone:String};{};{});
model!(CampaignTestSend{id:String,campaign_id:String,status:CampaignTestStatus,from:CampaignTestSender,to:String,variables:BTreeMap<String,String>,created_at:u64};{message_id:String};{});
model!(CampaignTrackedLinkReport{key:String,url:String,unique_opens:u64,total_opens:u64};{};{});
model!(CampaignApprovalRequester{r#type:String,id:String};{};{});
model!(CampaignLaunchApproval{id:String,campaign_id:String,action:CampaignApprovalAction,status:CampaignApprovalStatus,reasons:Vec<CampaignApprovalReason>,recipient_count:u64,requested_by:CampaignApprovalRequester,requested_at:u64,expires_at:u64};{scheduled_at:u64,decided_by:String,decided_at:u64,operation_id:String};{});
model!(CampaignLaunchApprovalSettings{};{recipient_threshold:u64};{});
model!(CampaignSettings{launch_approval:CampaignLaunchApprovalSettings};{};{});
#[derive(Clone, Debug)]
pub struct CampaignProjectParameters {
    pub project_id: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatePlatformCampaignReplyFlowRequest {
    pub project_id: String,
    #[serde(flatten)]
    pub body: CreateCampaignReplyFlowRequest,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetPlatformCampaignReplyFlowRequest {
    pub project_id: String,
    #[serde(flatten)]
    pub body: SetCampaignReplyFlowRequest,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlatformCampaignTestSendRequest {
    pub project_id: String,
    #[serde(flatten)]
    pub body: CampaignTestSendRequest,
}
#[derive(Clone, Debug, Default)]
pub struct CampaignRecipientExportParameters {
    pub status: Option<crate::campaigns::CampaignRecipientStatus>,
    pub reason: Option<CampaignRecipientFailureReason>,
    pub cursor: Option<String>,
    pub limit: Option<u32>,
}
#[derive(Clone, Debug)]
pub struct PlatformCampaignRecipientExportParameters {
    pub project_id: String,
    pub filters: CampaignRecipientExportParameters,
}
#[derive(Clone, Debug)]
pub struct CampaignRecipientExportPage {
    pub csv: String,
    pub next_cursor: Option<String>,
    pub filename: Option<String>,
}
model!(CreateAudienceFromCampaignRequest{name:String,campaign_id:String,outcome:CampaignRetargetOutcome};{};{project_id:String});
model!(AudienceFromCampaignResult{id:String,name:String,source:CampaignAudienceSource,recipient_count:u64,created_at:u64,updated_at:u64,source_campaign_id:String,outcome:CampaignRetargetOutcome,matched_count:u64,opted_out_count:u64};{file_id:String,columns:Vec<String>,sample_row:BTreeMap<String,String>,mapping:BTreeMap<String,serde_json::Value>};{});
model!(AudienceProfileProvenance{source:AudienceProfileSource,reference:String};{};{});
model!(AudienceProfileConsentInput{purpose:AudienceConsentPurpose,source:AudienceProfileSource,reference:String,allowed:bool,asserted_at:u64};{};{});
model!(AudienceProfile{id:String,phone:String,revision:u64,tags:Vec<String>,attributes:BTreeMap<String,AudienceProfileAttribute>,created_at:u64,updated_at:u64};{provenance:AudienceProfileProvenance};{});
model!(PutAudienceProfileRequest{tags:Vec<String>,attributes:BTreeMap<String,AudienceProfileAttribute>};{};{expected_revision:u64,provenance:AudienceProfileProvenance,consent:AudienceProfileConsentInput});
model!(AudienceConsentAssertion{id:String,profile_revision:u64,purpose:AudienceConsentPurpose,source:AudienceProfileSource,reference:String,allowed:bool,asserted_at:u64,created_at:u64};{};{});
model!(DeleteAudienceProfileResult{deleted:bool,phone:String,revision:u64};{};{});
#[derive(Clone, Debug, Default)]
pub struct ListAudienceProfilesParameters {
    pub cursor: Option<String>,
    pub limit: Option<u32>,
}
model!(AudienceProfilePageMetadata{has_more:bool};{next_cursor:String};{});
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AudienceProfilePage<T> {
    pub data: Vec<T>,
    pub page: AudienceProfilePageMetadata,
}
model!(AudienceProfileImportMapping{phone:String,tags:String,attributes:String};{};{expected_revision:String,provenance_reference:String,consent_allowed:String,consent_asserted_at:String,consent_reference:String});
model!(CreateAudienceProfileImportRequest{replay_key:String,csv_base64:String};{};{mapping:AudienceProfileImportMapping});
model!(AudienceProfileImportInvalidSample{row:u64,reason:String};{};{});
model!(AudienceProfileImportConflictSample{row:u64,reason:AudienceProfileConflictReason};{};{});
model!(AudienceProfileImportJob{id:String,state:AudienceProfileImportState,total_valid:u64,invalid_count:u64,invalid_samples:Vec<AudienceProfileImportInvalidSample>,conflict_samples:Vec<AudienceProfileImportConflictSample>,processed_valid:u64,created_count:u64,updated_count:u64,conflict_count:u64,created_at:u64,updated_at:u64};{completed_at:u64};{});
model!(StopConfirmationSettings{team_id:String,enabled:bool,revision:u64,text_revision:u32};{locale:StopConfirmationLocale,acknowledgement:String,updated_at:u64};{});
model!(UpdateStopConfirmationSettingsRequest{team_id:String,enabled:bool,revision:u64};{locale:StopConfirmationLocale};{});
model!(StopConfirmationCounts{queued:u64,admitted:u64,completed:u64,failed:u64,unknown:u64};{};{});
model!(StopConfirmationSummary{enabled:bool,counts:StopConfirmationCounts};{};{});
model!(SignalCustodyDefault{effective_signal_mode:SignalCustodyMode,revision:u64};{signal_mode_default:SignalCustodyMode};{});
model!(ProjectSignalCustodyUpdate{expected_revision:u64,signal_mode_default:SignalCustodyMode};{};{});
model!(CustomerSignalCustodyUpdate{expected_revision:u64};{signal_mode_default:SignalCustodyMode};{});
