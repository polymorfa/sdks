//! Handwritten native webhook payloads. Explicit provider-extension fields preserve unknown JSON.
use crate::{
    models::{ConversationIdentity, WhatsAppMessageIds},
    platform_sessions::SessionCapabilities,
    usage::UsageRecord,
};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
// This local macro applies the same sparse-option encoding to handwritten field lists.
macro_rules! payload {
    ($name:ident { $($field:ident : $kind:ty),* $(,)? } { $($optional:ident : $option_kind:ty),* $(,)? }) => {
        #[derive(Clone,Debug,Serialize,Deserialize)] #[serde(rename_all="camelCase")]
        pub struct $name { $(pub $field:$kind,)* $(#[serde(skip_serializing_if="Option::is_none")]pub $optional:Option<$option_kind>,)* }
    };
}
payload!(EventConversation {id:String} {phone_number:String,bsuid:String,username:String,sender:ConversationIdentity});
payload!(NativeFlowResponse {name:String,params_json:String} {version:u32});
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ReplyChoiceKind {
    Button,
    List,
}
payload!(ReplyChoice {kind:ReplyChoiceKind,id:String} {});
payload!(PollOption {name:String,hash:String} {});
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LinkedDeviceMessageType {
    Text,
    Image,
    Video,
    Audio,
    Document,
    Location,
    Contact,
    PhoneNumberShared,
    NativeFlowResponse,
    ButtonReply,
    ListReply,
    Poll,
    Sticker,
    Reaction,
    Revoke,
    Edited,
    Unknown,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LinkedDeviceMessagePayload {
    pub id: String,
    #[serde(rename = "whatsapp_ids")]
    pub whatsapp_ids: WhatsAppMessageIds,
    #[serde(rename = "whatsapp_id", skip_serializing_if = "Option::is_none")]
    pub whatsapp_id: Option<String>,
    pub conversation: EventConversation,
    pub from_me: bool,
    pub timestamp: u64,
    pub push_name: String,
    pub is_group: bool,
    #[serde(rename = "type")]
    pub message_type: LinkedDeviceMessageType,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub caption: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mime_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ptt: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub filename: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub latitude: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub longitude: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub display_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reaction: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reaction_to: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub revoked_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub media: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub media_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub edited: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub poll_options: Option<Vec<PollOption>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub unavailable: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub unavailable_reason: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub native_flow_response: Option<NativeFlowResponse>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reply_choice: Option<ReplyChoice>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parent_message_id: Option<String>,
    #[serde(flatten)]
    pub extensions: BTreeMap<String, serde_json::Value>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CloudMessageReferral {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ctwa_clid: Option<String>,
    #[serde(flatten)]
    pub extensions: BTreeMap<String, serde_json::Value>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudMessagePayload {
    pub id: String,
    #[serde(rename = "whatsapp_ids")]
    pub whatsapp_ids: WhatsAppMessageIds,
    #[serde(rename = "whatsapp_id", skip_serializing_if = "Option::is_none")]
    pub whatsapp_id: Option<String>,
    pub conversation: EventConversation,
    pub timestamp: String,
    #[serde(rename = "type")]
    pub message_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sender_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub native_flow_response: Option<NativeFlowResponse>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reply_choice: Option<ReplyChoice>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parent_message_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub interactive: Option<BTreeMap<String, serde_json::Value>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub referral: Option<CloudMessageReferral>,
    #[serde(flatten)]
    pub extensions: BTreeMap<String, serde_json::Value>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(untagged)]
pub enum MessageReceivedPayload {
    LinkedDevices(Box<LinkedDeviceMessagePayload>),
    OfficialApi(Box<CloudMessagePayload>),
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MessageSentPayload {
    pub id: String,
    #[serde(rename = "whatsapp_ids")]
    pub whatsapp_ids: WhatsAppMessageIds,
    #[serde(rename = "whatsapp_id", skip_serializing_if = "Option::is_none")]
    pub whatsapp_id: Option<String>,
    pub conversation: EventConversation,
    #[serde(rename = "type")]
    pub message_type: String,
    pub timestamp: u64,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct WebhookMessageId {
    pub id: String,
    pub whatsapp_ids: WhatsAppMessageIds,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub whatsapp_id: Option<String>,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct MetaPricingReport {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub billable: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pricing_model: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub category: Option<String>,
    #[serde(rename = "type", skip_serializing_if = "Option::is_none")]
    pub pricing_type: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct MessageAckPayload {
    pub messages: Vec<WebhookMessageId>,
    pub conversation: EventConversation,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub from: Option<ConversationIdentity>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sender: Option<ConversationIdentity>,
    #[serde(rename = "type")]
    pub ack_type: String,
    pub timestamp: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pricing: Option<MetaPricingReport>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MessageDeletePayload {
    pub from: ConversationIdentity,
    pub sender: ConversationIdentity,
    pub id: String,
    #[serde(rename = "whatsapp_ids")]
    pub whatsapp_ids: WhatsAppMessageIds,
    #[serde(rename = "whatsapp_id", skip_serializing_if = "Option::is_none")]
    pub whatsapp_id: Option<String>,
    pub conversation: EventConversation,
    pub from_me: bool,
}
payload!(PollVotePayload {conversation:EventConversation,poll_message_id:String,voter:ConversationIdentity,selected_hashes:Vec<String>,timestamp:u64} {});
payload!(RuntimeSessionStatusPayload {status:String} {status_reason:String,ban_code:u32,ban_reason:String,ban_expires_at:u64,detail:String});
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CloudAccountNotificationKind {
    AccountAlerts,
    AccountUpdate,
    PhoneNumberNameUpdate,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MetaSource {
    Meta,
}
payload!(CloudAccountStatusPayload {source:MetaSource,kind:CloudAccountNotificationKind,value:BTreeMap<String,serde_json::Value>} {waba_id:String});
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(untagged)]
pub enum SessionStatusPayload {
    Runtime(RuntimeSessionStatusPayload),
    OfficialApi(CloudAccountStatusPayload),
}
payload!(SessionRestrictionUpdatedPayload {r#type:SessionRestrictionType,active:bool,enforcement_type:Option<String>,expires_at:Option<String>,observed_at:String} {});
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PhonePlatform {
    Android,
    Ios,
    MetaCloud,
    Unknown,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WhatsAppAccountType {
    WhatsappApp,
    BusinessApp,
    MetaCloud,
    MetaCoexistence,
}
payload!(SessionConnectedPayload {phone_number:String,push_name:String,phone_platform:PhonePlatform,account_type:WhatsAppAccountType} {id:String,business_name:String});
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SessionLoggedOutReason {
    Banned,
    DeviceRemoved,
    Unknown,
}
payload!(SessionLoggedOutPayload {reason:SessionLoggedOutReason,code:u32} {});
payload!(SessionPhoneOfflinePayload {days_since_last_seen:u32,days_remaining:u32,last_seen:String,action:String} {});
payload!(OfficialGroupError {code:u32} {title:String});
payload!(GroupUpdatePayload {id:String} {new_subject:String,new_description:String,action:String,request_id:String,invite_link:String,join_approval_required:bool,picture_changed:bool,failed_changes:Vec<GroupFailedChange>,errors:Vec<OfficialGroupError>});
payload!(FailedGroupParticipant {participant:ConversationIdentity} {errors:Vec<OfficialGroupError>});
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum JoinRequestState {
    Created,
    Revoked,
}
payload!(GroupJoinRequest {join_request_id:String,user:ConversationIdentity,state:JoinRequestState} {});
payload!(GroupParticipantPayload {id:String} {joined:Vec<ConversationIdentity>,left:Vec<ConversationIdentity>,promoted:Vec<ConversationIdentity>,demoted:Vec<ConversationIdentity>,reason:String,initiated_by:GroupInitiatedBy,request_id:String,failed_participants:Vec<FailedGroupParticipant>,errors:Vec<OfficialGroupError>,join_request:GroupJoinRequest});
payload!(PresenceUpdatePayload {observed_at:u64} {from:ConversationIdentity,sender:ConversationIdentity,state:String,media:String,unavailable:bool,last_seen:u64});
payload!(ContactOptPayload {phone:String,source:ContactOptSource,keyword:String,session:String} {project_id:String});
payload!(ContactUpdatePayload {id:String} {phone_number:String,bsuid:String,full_name:String,first_name:String,push_name:String,old_push_name:String,business_name:String,old_business_name:String,picture_id:String,picture_removed:bool,username:String});
payload!(ChatArchivePayload {from:ConversationIdentity} {archive:bool,pinned:bool});
payload!(ChatMutePayload {from:ConversationIdentity,muted:bool} {mute_end_timestamp:u64});
payload!(ChatReadPayload {from:ConversationIdentity,read:bool} {});
payload!(ChatClearPayload {from:ConversationIdentity} {});
payload!(ChatDeletePayload {from:ConversationIdentity} {});
payload!(WebhookCallCapabilities {video:bool,invite:bool} {});
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MessagingConnection {
    LinkedDevice,
    CloudApi,
}
payload!(CallReceivedPayload {from:ConversationIdentity,call_id:String,has_video:bool} {session_connection:MessagingConnection,capabilities:WebhookCallCapabilities});
payload!(CallMissedPayload {from:ConversationIdentity,call_id:String,reason:String} {});
payload!(CallAcceptedPayload {from:ConversationIdentity,call_id:String} {answered_by:String,exclusive:bool,session_connection:MessagingConnection,capabilities:WebhookCallCapabilities});
payload!(CallRejectedPayload {from:ConversationIdentity,call_id:String} {});
payload!(CallEndedPayload {from:Option<ConversationIdentity>,call_id:String,duration_seconds:f64,reason:String,direction:crate::history::MessageDirection,had_video:bool} {session_connection:MessagingConnection});
payload!(CallTelemetryPayload {call_id:String,setup_ms:f64,ring_ms:f64,duration_seconds:f64,terminate_reason:String,codec:String,jitter_ms:f64,packets_lost:u64,rtt_ms:f64,recv_kbps:f64,send_kbps:f64} {});
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CallParticipantState {
    Invited,
    Ringing,
    Connected,
    Left,
}
payload!(WebhookCallParticipant {id:String,audio_muted:bool,video:bool,state:CallParticipantState} {hand_raised:bool,phone_number:String,bsuid:String,username:String});
payload!(CallParticipantPayload {call_id:String,participant:WebhookCallParticipant} {});
payload!(CallParticipantLeftPayload {call_id:String,participant_id:String} {reason:String});
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CallConnectionTransport {
    Webrtc,
    Socket,
    Sip,
}
payload!(CallConnection {id:String,participant:String,transport:CallConnectionTransport} {});
payload!(CallConnectionJoinedPayload {call_id:String,connection:CallConnection} {});
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CallConnectionLeftReason {
    Left,
    Replaced,
    Claimed,
    CallEnded,
    SipBusy,
    SipDeclined,
    SipNoAnswer,
    SipUnavailable,
    SipAuthFailed,
}
payload!(CallConnectionLeftPayload {call_id:String,connection_id:String,participant:String,reason:CallConnectionLeftReason} {});
payload!(NewsletterUpdatePayload {id:String,action:String} {muted:bool});
payload!(BlocklistChange {action:String,id:String} {phone_number:String,bsuid:String,username:String});
payload!(BlocklistUpdatePayload {action:String,changes:Vec<BlocklistChange>} {});
payload!(LabelsUpdatePayload {action:String} {label_id:String,from:ConversationIdentity,label:String,name:String,color:u32,order_index:u32,deleted:bool,labeled:bool,observed_at:u64,message_id:String,starred:bool});
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct LinkedHistoryMessage {
    pub id: String,
    pub whatsapp_ids: WhatsAppMessageIds,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub whatsapp_id: Option<String>,
    pub conversation: ConversationIdentity,
    #[serde(rename = "fromMe", skip_serializing_if = "Option::is_none")]
    pub from_me: Option<bool>,
}
payload!(EncodedHistory {encoding:HistoryEncoding,data:String} {});
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LinkedHistorySyncPayload {
    #[serde(rename = "whatsapp_ids")]
    pub whatsapp_ids: WhatsAppMessageIds,
    #[serde(rename = "whatsapp_id", skip_serializing_if = "Option::is_none")]
    pub whatsapp_id: Option<String>,
    #[serde(
        rename = "original_whatsapp_ids",
        skip_serializing_if = "Option::is_none"
    )]
    pub original_whatsapp_ids: Option<WhatsAppMessageIds>,
    #[serde(
        rename = "original_whatsapp_id",
        skip_serializing_if = "Option::is_none"
    )]
    pub original_whatsapp_id: Option<String>,
    pub messages: Vec<LinkedHistoryMessage>,
    pub mode: HistoryDeliveryMode,
    pub sync_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub chunk_order: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub progress: Option<u32>,
    pub file_length: u64,
    pub conversation_count: u64,
    pub message_count: u64,
    pub push_name_count: u64,
    pub status_message_count: u64,
    pub whatsapp: EncodedHistory,
}
payload!(CloudHistorySyncPayload {kind:CloudHistoryKind,value:BTreeMap<String,serde_json::Value>} {});
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(untagged)]
pub enum HistorySyncPayload {
    LinkedDevices(Box<LinkedHistorySyncPayload>),
    OfficialApi(CloudHistorySyncPayload),
}
payload!(ContactsSyncPayload {kind:ContactsSyncKind,value:BTreeMap<String,serde_json::Value>} {});
payload!(MessageEchoPayload {source:MessageEchoSource,value:BTreeMap<String,serde_json::Value>} {});
payload!(CommandResultPayload {request_id:String,command:String,success:bool} {data:BTreeMap<String,serde_json::Value>,error:String});
payload!(BusinessQuickReplyUpdatePayload {id:String,shortcut:String,message:String,keywords:Vec<String>,count:u32,deleted:bool,associated_label_ids:Vec<String>,observed_at:u64,from_full_sync:bool} {});
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CustomerEventActorKind {
    BetterAuth,
    OrgKey,
    ProjectToken,
    CliGrant,
    System,
}
payload!(CustomerEventPayload {event_id:String,occurred_at:String,organization_id:String,project_id:String,customer_id:String,actor_kind:CustomerEventActorKind} {});
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomerUpdatedPayload {
    #[serde(flatten)]
    pub customer: CustomerEventPayload,
    pub fields: Vec<CustomerUpdatedField>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum CustomerUpdatedField {
    Name,
    Phone,
    ExternalCustomerId,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomerEnabledPayload {
    #[serde(flatten)]
    pub customer: CustomerEventPayload,
    pub migrated_number_count: u32,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomerArchivingPayload {
    #[serde(flatten)]
    pub customer: CustomerEventPayload,
    pub blocking_number_count: u32,
    pub revoked_pairing_link_count: u32,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomerPairingLinkPayload {
    #[serde(flatten)]
    pub customer: CustomerEventPayload,
    pub pairing_link_id: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomerPairingLinkConnectedPayload {
    #[serde(flatten)]
    pub link: CustomerPairingLinkPayload,
    pub session_id: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomerPairingLinkFailedPayload {
    #[serde(flatten)]
    pub link: CustomerPairingLinkPayload,
    pub error_code: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PairingLinkRevocationReason {
    CustomerArchived,
    PhoneMismatchLimit,
    ExchangeFailureLimit,
    TerminalFailure,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomerPairingLinkRevokedPayload {
    #[serde(flatten)]
    pub link: CustomerPairingLinkPayload,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<PairingLinkRevocationReason>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomerNumberAttachedPayload {
    #[serde(flatten)]
    pub customer: CustomerEventPayload,
    pub session_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pairing_link_id: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomerNumberTransferredPayload {
    #[serde(flatten)]
    pub customer: CustomerEventPayload,
    pub session_id: String,
    pub source_customer_id: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomerNumberDisconnectedPayload {
    #[serde(flatten)]
    pub customer: CustomerEventPayload,
    pub session_id: String,
    pub reason: String,
}
payload!(BanSafeHealthThresholdPayload {session_id:String,project_id:String,health:f64,threshold:f64,health_source:BanSafeHealthSource,estimator_version:String,model_version:Option<String>,evaluated_at:String,policy_version:u64,episode_id:String,action_id:String} {});
payload!(BanSafeRequiredFinding {finding_key:String,title:String,severity:BanSafeSeverity} {});
payload!(BanSafeActionPayload {phone_number:String,action:BanSafeActionKind,scope:BanSafeScope,rung:BanSafeEventRung,previous_rung:Option<BanSafeEventRung>,reason:BanSafeActionReason,health:Option<f64>,health_band:BanSafeHealthBand,requires:Vec<BanSafeRequiredFinding>,throughput_per_minute:Option<f64>,eligible_lift_at:Option<String>,lift_requires:String,appeal_url:String,started_at:String,docs:String} {});
payload!(BanSafeIncidentPayload {id:String,phone_number:String,kind:BanSafeIncidentKind,source:BanSafeIncidentSource,started_at:String,ends_at:Option<String>,belief:f64,resolution:BanSafeIncidentResolution,claim_id:Option<String>,closed_at:Option<String>} {});
payload!(BanSafeClaimPayload {id:String,incident_id:String,phone_number:String,status:BanSafeClaimStatus,verdict:BanSafeClaimVerdict,window_start:String,window_end:String,measured_cents:f64,cap_cents:f64,amount_cents:f64,summary:String,reason:String,decided_at:Option<String>,paid_at:Option<String>} {});
payload!(CallPermissionChangedPayload {conversation:ConversationIdentity,status:CallPermissionStatus,previous_status:CallPermissionStatus,expires_at:Option<String>,source:CallPermissionSource,changed_at:String} {});
payload!(PaymentUpdateBase {reported_by:PaymentReportedBy,provider_event_id:String,reference_id:String,conversation:PaymentConversation} {});
payload!(PaymentConversation {} {id:String,phone_number:String});
payload!(ReportedPaymentAmount {value:f64,offset:f64} {});
payload!(PaymentTransaction {} {id:String,provider_transaction_id:String,provider:String,status:String,method:String,error_code:String});
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(
    tag = "kind",
    rename_all = "snake_case",
    rename_all_fields = "camelCase"
)]
pub enum OrderPaymentUpdatedPayload {
    PaymentStatus {
        #[serde(flatten)]
        base: PaymentUpdateBase,
        status: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        amount: Option<ReportedPaymentAmount>,
        #[serde(skip_serializing_if = "Option::is_none")]
        currency: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        transaction: Option<PaymentTransaction>,
    },
    PaymentMethodSelected {
        #[serde(flatten)]
        base: PaymentUpdateBase,
        message_id: String,
        payment_method: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        last_four_digits: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        credential_id: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        payment_timestamp: Option<u64>,
    },
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MessageFailedReason {
    InvalidRecipient,
    SessionNotConnected,
    AckTimeout,
    SendFailed,
    BlockedBySafety,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MessageFailedPayload {
    pub to: ConversationIdentity,
    #[serde(rename = "type")]
    pub message_type: String,
    pub error: MessageFailedReason,
    pub timestamp: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub code: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub retry_after: Option<u32>,
}
payload!(RuntimeTemplateStatusPayload {template_name:String,template_id:String,status:String,category:String,reason:String,quality_rating:String} {});
payload!(CloudTemplateStatusPayload {kind:CloudTemplateNotificationKind} {event:String,template_id:String,template_name:String,language:String,reason:String,previous_quality_score:String,new_quality_score:String,waba_id:String});
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(untagged)]
pub enum TemplateStatusPayload {
    Runtime(RuntimeTemplateStatusPayload),
    OfficialApi(CloudTemplateStatusPayload),
}
payload!(CampaignLaunchedPayload {campaign_id:String,name:String,recipient_count:u32,scheduled:bool,launched_at:u64} {});
payload!(CampaignPausedPayload {campaign_id:String,sent_count:u32,remaining_count:u32,paused_at:u64} {});
payload!(CampaignRescheduledPayload {campaign_id:String,previous_scheduled_at:Option<u64>,scheduled_at:u64,rescheduled_at:u64} {});
payload!(CampaignResumedPayload {campaign_id:String,sent_count:u32,remaining_count:u32,resumed_at:u64} {});
payload!(CampaignCompletedPayload {campaign_id:String,sent_count:u32,delivered_count:u32,read_count:u32,failed_count:u32,skipped_count:u32,response_count:u32,completed_at:u64,duration_ms:u64} {});
payload!(CampaignFailedPayload {campaign_id:String,reason:String,failed_at:u64} {});
payload!(CampaignStoppedPayload {campaign_id:String,sent_count:u32,abandoned_count:u32,stopped_at:u64} {});
payload!(CampaignRecipientSentPayload {campaign_id:String,recipient_id:String,phone:String,session_key:String,external_message_id:String,variant_key:String,attempt:u32} {});
payload!(CampaignRecipientFailedPayload {campaign_id:String,recipient_id:String,phone:String,attempts:u32,error:String,failed_at:u64} {});
payload!(CampaignRecipientSkippedPayload {campaign_id:String,recipient_id:String,phone:String,reason:String,skipped_at:u64} {});
payload!(CampaignThrottledPayload {campaign_id:String,session_key:String,reason:String,deferred_count:u32,at:u64} {});
payload!(CampaignCapReachedPayload {campaign_id:String,session_key:String,phone:String,cap_type:String,cap_limit:u32,window_resets_at:u64,at:u64} {});
payload!(CampaignColdBlockedPayload {campaign_id:String,recipient_id:String,phone:String,surface:String,reason:String,at:u64} {});
payload!(VoiceAssetEventPayload {event_id:String,occurred_at:String,organization_id:String,project_id:String,asset_id:String,name:String,source:String} {});
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VoiceAssetReadyPayload {
    #[serde(flatten)]
    pub asset: VoiceAssetEventPayload,
    pub duration_ms: u64,
    pub content_sha256: String,
    pub original_format: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VoiceAssetFailedPayload {
    #[serde(flatten)]
    pub asset: VoiceAssetEventPayload,
    pub failure_reason: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionCapabilitiesUpdatedPayload {
    #[serde(flatten)]
    pub state: SessionCapabilities,
    pub changed_keys: Vec<String>,
}
/// A closed event discriminator with typed payloads. Future event names remain
/// available through `WebhookEvent::Unknown` with their full JSON envelope.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "event", content = "payload")]
pub enum KnownWebhookPayload {
    #[serde(rename = "bansafe.action")]
    BanSafeAction(Box<BanSafeActionPayload>),
    #[serde(rename = "bansafe.claim")]
    BanSafeClaim(Box<BanSafeClaimPayload>),
    #[serde(rename = "bansafe.health_threshold")]
    BanSafeHealthThreshold(Box<BanSafeHealthThresholdPayload>),
    #[serde(rename = "bansafe.incident")]
    BanSafeIncident(Box<BanSafeIncidentPayload>),
    #[serde(rename = "blocklist.update")]
    BlocklistUpdate(Box<BlocklistUpdatePayload>),
    #[serde(rename = "business.quick_reply.update")]
    BusinessQuickReplyUpdate(Box<BusinessQuickReplyUpdatePayload>),
    #[serde(rename = "call.accepted")]
    CallAccepted(Box<CallAcceptedPayload>),
    #[serde(rename = "call.connection_joined")]
    CallConnectionJoined(Box<CallConnectionJoinedPayload>),
    #[serde(rename = "call.connection_left")]
    CallConnectionLeft(Box<CallConnectionLeftPayload>),
    #[serde(rename = "call.ended")]
    CallEnded(Box<CallEndedPayload>),
    #[serde(rename = "call.missed")]
    CallMissed(Box<CallMissedPayload>),
    #[serde(rename = "call.participant_joined")]
    CallParticipantJoined(Box<CallParticipantPayload>),
    #[serde(rename = "call.participant_left")]
    CallParticipantLeft(Box<CallParticipantLeftPayload>),
    #[serde(rename = "call.participant_state")]
    CallParticipantState(Box<CallParticipantPayload>),
    #[serde(rename = "call.permission_changed")]
    CallPermissionChanged(Box<CallPermissionChangedPayload>),
    #[serde(rename = "call.received")]
    CallReceived(Box<CallReceivedPayload>),
    #[serde(rename = "call.rejected")]
    CallRejected(Box<CallRejectedPayload>),
    #[serde(rename = "call.telemetry")]
    CallTelemetry(Box<CallTelemetryPayload>),
    #[serde(rename = "campaign.cap_reached")]
    CampaignCapReached(Box<CampaignCapReachedPayload>),
    #[serde(rename = "campaign.cold_blocked")]
    CampaignColdBlocked(Box<CampaignColdBlockedPayload>),
    #[serde(rename = "campaign.completed")]
    CampaignCompleted(Box<CampaignCompletedPayload>),
    #[serde(rename = "campaign.failed")]
    CampaignFailed(Box<CampaignFailedPayload>),
    #[serde(rename = "campaign.launched")]
    CampaignLaunched(Box<CampaignLaunchedPayload>),
    #[serde(rename = "campaign.paused")]
    CampaignPaused(Box<CampaignPausedPayload>),
    #[serde(rename = "campaign.recipient_failed")]
    CampaignRecipientFailed(Box<CampaignRecipientFailedPayload>),
    #[serde(rename = "campaign.recipient_sent")]
    CampaignRecipientSent(Box<CampaignRecipientSentPayload>),
    #[serde(rename = "campaign.recipient_skipped")]
    CampaignRecipientSkipped(Box<CampaignRecipientSkippedPayload>),
    #[serde(rename = "campaign.rescheduled")]
    CampaignRescheduled(Box<CampaignRescheduledPayload>),
    #[serde(rename = "campaign.resumed")]
    CampaignResumed(Box<CampaignResumedPayload>),
    #[serde(rename = "campaign.stopped")]
    CampaignStopped(Box<CampaignStoppedPayload>),
    #[serde(rename = "campaign.throttled")]
    CampaignThrottled(Box<CampaignThrottledPayload>),
    #[serde(rename = "chat.archive")]
    ChatArchive(Box<ChatArchivePayload>),
    #[serde(rename = "chat.clear")]
    ChatClear(Box<ChatClearPayload>),
    #[serde(rename = "chat.delete")]
    ChatDelete(Box<ChatDeletePayload>),
    #[serde(rename = "chat.mute")]
    ChatMute(Box<ChatMutePayload>),
    #[serde(rename = "chat.read")]
    ChatRead(Box<ChatReadPayload>),
    #[serde(rename = "command.result")]
    CommandResult(Box<CommandResultPayload>),
    #[serde(rename = "contact.opted_in")]
    ContactOptedIn(Box<ContactOptPayload>),
    #[serde(rename = "contact.opted_out")]
    ContactOptedOut(Box<ContactOptPayload>),
    #[serde(rename = "contact.sync")]
    ContactsSync(Box<ContactsSyncPayload>),
    #[serde(rename = "contact.update")]
    ContactUpdate(Box<ContactUpdatePayload>),
    #[serde(rename = "customer.archived")]
    CustomerArchived(Box<CustomerEventPayload>),
    #[serde(rename = "customer.archiving")]
    CustomerArchiving(Box<CustomerArchivingPayload>),
    #[serde(rename = "customer.created")]
    CustomerCreated(Box<CustomerEventPayload>),
    #[serde(rename = "customer.enabled")]
    CustomerEnabled(Box<CustomerEnabledPayload>),
    #[serde(rename = "customer.number.attached")]
    CustomerNumberAttached(Box<CustomerNumberAttachedPayload>),
    #[serde(rename = "customer.number.disconnected")]
    CustomerNumberDisconnected(Box<CustomerNumberDisconnectedPayload>),
    #[serde(rename = "customer.number.transferred")]
    CustomerNumberTransferred(Box<CustomerNumberTransferredPayload>),
    #[serde(rename = "customer.pairing_link.connected")]
    CustomerPairingLinkConnected(Box<CustomerPairingLinkConnectedPayload>),
    #[serde(rename = "customer.pairing_link.created")]
    CustomerPairingLinkCreated(Box<CustomerPairingLinkPayload>),
    #[serde(rename = "customer.pairing_link.expired")]
    CustomerPairingLinkExpired(Box<CustomerPairingLinkPayload>),
    #[serde(rename = "customer.pairing_link.failed")]
    CustomerPairingLinkFailed(Box<CustomerPairingLinkFailedPayload>),
    #[serde(rename = "customer.pairing_link.opened")]
    CustomerPairingLinkOpened(Box<CustomerPairingLinkPayload>),
    #[serde(rename = "customer.pairing_link.revoked")]
    CustomerPairingLinkRevoked(Box<CustomerPairingLinkRevokedPayload>),
    #[serde(rename = "customer.restored")]
    CustomerRestored(Box<CustomerEventPayload>),
    #[serde(rename = "customer.updated")]
    CustomerUpdated(Box<CustomerUpdatedPayload>),
    #[serde(rename = "group.participant")]
    GroupParticipant(Box<GroupParticipantPayload>),
    #[serde(rename = "group.update")]
    GroupUpdate(Box<GroupUpdatePayload>),
    #[serde(rename = "history.sync")]
    HistorySync(Box<HistorySyncPayload>),
    #[serde(rename = "labels.update")]
    LabelsUpdate(Box<LabelsUpdatePayload>),
    #[serde(rename = "message.ack")]
    MessageAck(Box<MessageAckPayload>),
    #[serde(rename = "message.delete")]
    MessageDelete(Box<MessageDeletePayload>),
    #[serde(rename = "message.echo")]
    MessageEcho(Box<MessageEchoPayload>),
    #[serde(rename = "message.edited")]
    MessageEdited(Box<LinkedDeviceMessagePayload>),
    #[serde(rename = "message.failed")]
    MessageFailed(Box<MessageFailedPayload>),
    #[serde(rename = "message.reaction")]
    MessageReaction(Box<MessageReceivedPayload>),
    #[serde(rename = "message.received")]
    MessageReceived(Box<MessageReceivedPayload>),
    #[serde(rename = "message.revoked")]
    MessageRevoked(Box<LinkedDeviceMessagePayload>),
    #[serde(rename = "message.sent")]
    MessageSent(Box<MessageSentPayload>),
    #[serde(rename = "message.update")]
    MessageUpdate(Box<LinkedDeviceMessagePayload>),
    #[serde(rename = "message.vote")]
    MessageVote(Box<PollVotePayload>),
    #[serde(rename = "newsletter.update")]
    NewsletterUpdate(Box<NewsletterUpdatePayload>),
    #[serde(rename = "order.payment_updated")]
    OrderPaymentUpdated(Box<OrderPaymentUpdatedPayload>),
    #[serde(rename = "presence.update")]
    PresenceUpdate(Box<PresenceUpdatePayload>),
    #[serde(rename = "session.capabilities_updated")]
    SessionCapabilitiesUpdated(Box<SessionCapabilitiesUpdatedPayload>),
    #[serde(rename = "session.connected")]
    SessionConnected(Box<SessionConnectedPayload>),
    #[serde(rename = "session.logged_out")]
    SessionLoggedOut(Box<SessionLoggedOutPayload>),
    #[serde(rename = "session.phone_offline")]
    SessionPhoneOffline(Box<SessionPhoneOfflinePayload>),
    #[serde(rename = "session.restriction_updated")]
    SessionRestrictionUpdated(Box<SessionRestrictionUpdatedPayload>),
    #[serde(rename = "session.status")]
    SessionStatus(Box<SessionStatusPayload>),
    #[serde(rename = "template.status")]
    TemplateStatus(Box<TemplateStatusPayload>),
    #[serde(rename = "usage.recorded")]
    UsageRecorded(Box<UsageRecord>),
    #[serde(rename = "voice.asset_failed")]
    VoiceAssetFailed(Box<VoiceAssetFailedPayload>),
    #[serde(rename = "voice.asset_ready")]
    VoiceAssetReady(Box<VoiceAssetReadyPayload>),
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SessionRestrictionType {
    ReachoutTimelock,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum GroupFailedChange {
    Subject,
    Description,
    Picture,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum GroupInitiatedBy {
    Business,
    Participant,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum ContactOptSource {
    #[serde(rename = "stop-keyword")]
    StopKeyword,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum HistoryDeliveryMode {
    Deliver,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum HistoryEncoding {
    #[serde(rename = "gzip-base64-protobuf")]
    GzipBase64Protobuf,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CloudHistoryKind {
    History,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ContactsSyncKind {
    Contacts,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MessageEchoSource {
    WhatsappBusinessApp,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BanSafeHealthSource {
    RulesV1,
    MlModel,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BanSafeSeverity {
    Info,
    Warning,
    Critical,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BanSafeEventRung {
    None,
    Notify,
    Throttle,
    BlockCold,
    Suspend,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BanSafeActionKind {
    Applied,
    Changed,
    Lifted,
    DailyAllowanceReached,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BanSafeScope {
    Number,
    Organization,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BanSafeActionReason {
    Health,
    Finding,
    OrgPattern,
    Repeat,
    Restriction,
    Operator,
    HealthModelCutover,
    Warmup,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BanSafeHealthBand {
    Good,
    Fair,
    Poor,
    Failing,
    Unknown,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BanSafeIncidentKind {
    CapWarning,
    CapReached,
    Timelock,
    TemporaryBan,
    PermanentBan,
    ConnectBlocked,
    CustomerReport,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BanSafeIncidentSource {
    Runtime,
    Customer,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BanSafeIncidentResolution {
    Open,
    Corroborated,
    Contradicted,
    PhoneSwitch,
    Final,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BanSafeClaimStatus {
    Filed,
    UnderReview,
    Approved,
    Denied,
    Paid,
    Reversed,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BanSafeClaimVerdict {
    OtherDevice,
    CustomerConduct,
    SharedNetwork,
    Ours,
    Inconclusive,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CallPermissionStatus {
    None,
    Temporary,
    Permanent,
    Revoked,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CallPermissionSource {
    UserAction,
    Automatic,
    Sync,
    CallRefused,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PaymentReportedBy {
    Whatsapp,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CloudTemplateNotificationKind {
    MessageTemplateStatusUpdate,
    MessageTemplateQualityUpdate,
}
