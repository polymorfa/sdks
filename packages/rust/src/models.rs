//! Handwritten request and response models. Unknown fields are ignored by serde.
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct DataEnvelope<T> {
    pub data: T,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SuccessEnvelope<T> {
    pub success: bool,
    pub data: T,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SuccessResponse {
    pub success: bool,
    pub message: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OperationAccepted {
    pub success: bool,
    pub message: String,
    pub operation_id: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct StatusResult {
    pub status: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    pub session_id: String,
    pub name: String,
    pub external_id: Option<String>,
    pub tenant_id: String,
    #[serde(rename = "type")]
    pub connection_type: String,
    pub test_mode: bool,
    pub status: String,
    pub status_reason: Option<String>,
    pub configuration: Option<serde_json::Value>,
    pub new_chat_capping: Option<NewChatCapping>,
    pub created_at: String,
    pub updated_at: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewChatCapping {
    pub enabled: Option<bool>,
    pub pacing: bool,
    pub status: Option<String>,
    pub capped: bool,
    pub limit: Option<u64>,
    pub used: Option<u64>,
    pub remaining: Option<u64>,
    pub cycle_starts_at: Option<String>,
    pub resets_at: Option<String>,
    pub observed_at: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlatformSession {
    #[serde(rename = "_id")]
    pub id: String,
    #[serde(rename = "_creationTime")]
    pub creation_time: u64,
    pub project_id: String,
    pub session_id: String,
    pub name: String,
    pub phone: Option<String>,
    pub platform: Option<String>,
    pub is_business: bool,
    pub test_mode: bool,
    pub tier_override: Option<String>,
    pub status: String,
    pub message_count: u64,
    pub last_active_at: Option<u64>,
    pub paid_until: Option<u64>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionStartResult {
    pub starting: bool,
    pub session_id: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionStopResult {
    pub stopping: bool,
    pub session_id: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionRemoveResult {
    pub removed: bool,
    pub session_id: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PairCodeRequest {
    pub phone: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PairCode {
    pub code: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct QrCode {
    pub qr: Option<String>,
    pub event: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WhatsAppAccount {
    pub id: Option<String>,
    pub bsuid: Option<String>,
    pub username: Option<String>,
    pub phone_number: Option<String>,
    pub push_name: String,
    pub business_name: Option<String>,
    pub phone_platform: Option<String>,
    pub account_type: Option<String>,
    pub profile_pic_url: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ConversationReference {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub phone_number: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bsuid: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub username: Option<String>,
}
impl ConversationReference {
    pub fn id(value: impl Into<String>) -> Self {
        Self {
            id: Some(value.into()),
            ..Self::default()
        }
    }
    pub fn phone(value: impl Into<String>) -> Self {
        Self {
            phone_number: Some(value.into()),
            ..Self::default()
        }
    }
    pub fn bsuid(value: impl Into<String>) -> Self {
        Self {
            bsuid: Some(value.into()),
            ..Self::default()
        }
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MessageTransport {
    Auto,
    LinkedDevices,
    OfficialApi,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct QuotedMessage {
    pub id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub participant: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SendMessageRequest {
    pub conversation: ConversationReference,
    pub content: MessageContent,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub transport: Option<MessageTransport>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_forwarded: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mentions: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub quoted_message: Option<QuotedMessage>,
}
impl SendMessageRequest {
    pub fn text(conversation: ConversationReference, text: impl Into<String>) -> Self {
        Self {
            conversation,
            content: MessageContent::Text { text: text.into() },
            transport: None,
            is_forwarded: None,
            mentions: None,
            quoted_message: None,
        }
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(untagged)]
pub enum MessageContent {
    Text { text: String },
    Image { image: MediaContent },
    Video { video: MediaContent },
    File { file: FileMediaContent },
    Voice { voice: VoiceMediaContent },
    Poll { poll: PollContent },
    Location { location: LocationContent },
    Contact { contact: ContactContent },
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(untagged)]
pub enum MediaSource {
    Url { url: String },
    Base64 { base64: String },
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaContent {
    #[serde(flatten)]
    pub source: MediaSource,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mime_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub caption: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct FileMediaContent {
    #[serde(flatten)]
    pub media: MediaContent,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub filename: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct VoiceMediaContent {
    #[serde(flatten)]
    pub media: MediaContent,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ptt: Option<bool>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PollContent {
    pub title: String,
    pub options: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub multi_select: Option<bool>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct LocationContent {
    pub lat: f64,
    pub long: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub address: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ContactContent {
    pub vcard: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct WhatsAppMessageIds {
    pub linked_devices: Option<String>,
    pub official_api: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct MessageReceipt {
    pub id: String,
    pub whatsapp_ids: WhatsAppMessageIds,
    pub conversation: ConversationReference,
    pub timestamp: String,
    pub status: String,
    pub transport: Option<MessageTransport>,
    #[serde(rename = "routingReason")]
    pub routing_reason: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct MessageResponse {
    #[serde(flatten)]
    pub receipt: MessageReceipt,
    #[serde(rename = "type")]
    pub message_type: String,
    pub content: Option<MessageContent>,
    #[serde(rename = "mediaId")]
    pub media_id: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SeenRequest {
    pub conversation: ConversationReference,
    pub id: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TypingRequest {
    pub conversation: ConversationReference,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    pub state: TypingState,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TypingState {
    Typing,
    Recording,
    Paused,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ReactRequest {
    pub conversation: ConversationReference,
    pub id: String,
    pub reaction: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub transport: Option<MessageTransport>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct StarRequest {
    pub conversation: ConversationReference,
    pub id: String,
    pub star: bool,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MessageOperation {
    pub operation_id: String,
    pub status: String,
    pub transport: Option<MessageTransport>,
    pub rejection_code: Option<String>,
    pub receipt: Option<MessageOperationReceipt>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct MessageOperationReceipt {
    pub whatsapp_ids: WhatsAppMessageIds,
    pub timestamp: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CreateQuickLinkRequest {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub purpose: Option<QuickLinkPurpose>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub session: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub project_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub customer_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub external_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub connection_goal: Option<ConnectionGoal>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub add_connection: Option<ConnectionKind>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub configuration: Option<QuickLinkConfiguration>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub billing_controls: Option<BillingControls>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum QuickLinkPurpose {
    Initial,
    AddConnection,
    Reauthorization,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ConnectionKind {
    LinkedDevices,
    OfficialApi,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ConnectionGoal {
    Single,
    Hybrid,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BillingControls {
    pub limit_credits: Option<f64>,
    pub priority: u32,
}
#[derive(Clone, Debug, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct QuickLinkConfiguration {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub connection_preference: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub connection_enforcement: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub methods: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub default_method: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub prefill_phone: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub allow_phone_change: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub history_sync: Option<QuickLinkHistorySync>,
}
#[derive(Clone, Debug, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct QuickLinkHistorySync {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub consent: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mode: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub request_full: Option<bool>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuickLink {
    pub purpose: QuickLinkPurpose,
    pub connection_goal: ConnectionGoal,
    pub add_connection: Option<ConnectionKind>,
    pub id: String,
    pub url: String,
    pub session: String,
    pub expires_at: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuickLinkStatus {
    pub purpose: QuickLinkPurpose,
    pub connection_goal: ConnectionGoal,
    pub add_connection: Option<ConnectionKind>,
    pub hybrid_phase: Option<String>,
    pub id: String,
    pub status: String,
    pub session: String,
    pub expires_at: Option<String>,
    pub opened_at: Option<String>,
    pub connected_at: Option<String>,
    pub phone: Option<String>,
    pub error_code: Option<String>,
    pub onboarding: Option<serde_json::Value>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HybridQuickLinkAvailability {
    pub allowed: bool,
    pub add_connection: Option<ConnectionKind>,
    pub connections: Vec<ConnectionStatus>,
    pub resume_quick_link_id: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ConnectionStatus {
    pub kind: ConnectionKind,
    pub status: String,
    pub enabled: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WebhookRetryConfig {
    pub attempts: u32,
    pub delay_seconds: u32,
    pub policy: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct WebhookHeader {
    pub name: String,
    pub value: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Webhook {
    pub id: String,
    pub tenant_id: String,
    pub session: Option<String>,
    pub url: String,
    pub events: Vec<String>,
    pub retries: WebhookRetryConfig,
    pub headers: Vec<WebhookHeader>,
    pub enabled: bool,
    pub format: Option<String>,
    pub created_at: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateWebhookRequest {
    pub url: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub session: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub events: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hmac_key: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub retries: Option<WebhookRetryConfig>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub headers: Option<Vec<WebhookHeader>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub format: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct UpdateWebhookRequest {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub events: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hmac_key: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub retries: Option<WebhookRetryConfig>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub headers: Option<Vec<WebhookHeader>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub enabled: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub format: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectIcon {
    #[serde(rename = "type")]
    pub icon_type: String,
    pub value: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub storage_id: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateProjectRequest {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub icon: Option<ProjectIcon>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub default_tier: Option<ProjectDefaultTier>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ProjectDefaultTier {
    Free,
    Standard,
    Pro,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatedProject {
    pub id: String,
    pub org_id: String,
    pub name: String,
    pub slug: String,
    pub icon: ProjectIcon,
    pub default_tier: ProjectDefaultTier,
    pub is_active: bool,
    pub stage: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectWithStats {
    #[serde(rename = "_id")]
    pub id: String,
    #[serde(rename = "_creationTime")]
    pub creation_time: u64,
    pub org_id: String,
    pub name: String,
    pub slug: String,
    pub icon: ProjectIcon,
    pub default_tier: String,
    pub is_active: bool,
    pub stage: String,
    pub active_sessions: u64,
    pub total_sessions: u64,
    pub total_messages: u64,
    pub last_activity: Option<u64>,
    pub icon_url: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProductionBusiness {
    pub name: String,
    pub website: String,
    pub support_email: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ProductionEnrollmentRequest {
    pub business: ProductionBusiness,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProductionEnrollmentResult {
    pub id: String,
    pub org_id: String,
    pub name: String,
    pub slug: String,
    pub stage: String,
    pub operation_id: String,
    pub enrollment_status: String,
    pub billing_mode: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProductionEnrollmentCommandResult {
    pub operation_id: String,
    pub action: String,
    pub accepted: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EventRecord {
    pub id: String,
    pub organization_id: String,
    pub project_id: Option<String>,
    #[serde(rename = "type")]
    pub event_type: String,
    pub source: String,
    pub environment: String,
    pub created_at: String,
    pub payload_availability: String,
    pub payload: Option<EncodedEventPayload>,
    pub replayable_until: Option<String>,
    pub metadata_expires_at: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct EncodedEventPayload {
    pub encoding: String,
    #[serde(rename = "contentType")]
    pub content_type: String,
    pub data: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EventStreamAcknowledgement {
    pub cursor: String,
    pub sequence: u64,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EventStreamAcknowledgementReceipt {
    pub stream_id: String,
    pub acknowledged_cursor: String,
    pub sequence: u64,
    pub replayed: bool,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CursorEnvelope<T> {
    pub data: Vec<T>,
    pub page: Option<CursorInfo>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CursorInfo {
    pub next_cursor: Option<String>,
    pub has_more: bool,
    pub next_offset: Option<String>,
    pub high_watermark: Option<String>,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EventListParameters {
    #[serde(rename = "type", skip_serializing_if = "Option::is_none")]
    pub event_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub since: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub until: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub limit: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cursor: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub after_offset: Option<String>,
}
impl EventListParameters {
    pub(crate) fn query(&self) -> crate::Result<Query> {
        if let Some(offset) = &self.after_offset {
            if self.cursor.is_some()
                || self.since.is_some()
                || self.until.is_some()
                || !valid_offset(offset)
            {
                return Err(crate::transport::configuration("after_offset"));
            }
        }
        let mut query = Query::new();
        for (key, value) in [
            ("type", &self.event_type),
            ("since", &self.since),
            ("until", &self.until),
            ("cursor", &self.cursor),
            ("afterOffset", &self.after_offset),
        ] {
            if let Some(value) = value {
                query.insert(key.into(), value.clone().into());
            }
        }
        if let Some(limit) = self.limit {
            query.insert("limit".into(), i64::from(limit).into());
        }
        Ok(query)
    }
}
pub(crate) fn valid_offset(offset: &str) -> bool {
    (offset == "0"
        || offset.bytes().next().is_some_and(|b| b != b'0')
            && offset.bytes().all(|b| b.is_ascii_digit()))
        && offset.parse::<u64>().is_ok_and(|n| n <= i64::MAX as u64)
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReplayEventRequest {
    pub webhook_id: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IdempotencyReceipt {
    pub id: String,
    pub key: String,
    pub replayed: bool,
    pub created_at: String,
    pub expires_at: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EventReplayReceipt {
    pub event_id: String,
    pub delivery_id: String,
    pub operation_id: String,
    pub idempotency: IdempotencyReceipt,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MessagingMediaInfo {
    pub id: String,
    pub session: String,
    pub message_id: String,
    pub mime_type: String,
    pub file_length: u64,
    pub persisted: bool,
    pub s3_url: Option<String>,
}
#[derive(Clone, Debug)]
pub enum QueryPrimitive {
    String(String),
    Integer(i64),
    Number(f64),
    Boolean(bool),
}
impl From<String> for QueryPrimitive {
    fn from(value: String) -> Self {
        Self::String(value)
    }
}
impl From<&str> for QueryPrimitive {
    fn from(value: &str) -> Self {
        Self::String(value.into())
    }
}
impl From<bool> for QueryPrimitive {
    fn from(value: bool) -> Self {
        Self::Boolean(value)
    }
}
impl From<i64> for QueryPrimitive {
    fn from(value: i64) -> Self {
        Self::Integer(value)
    }
}
#[derive(Clone, Debug)]
pub enum QueryValue {
    One(QueryPrimitive),
    Many(Vec<QueryPrimitive>),
    Null,
}
impl From<String> for QueryValue {
    fn from(value: String) -> Self {
        Self::One(value.into())
    }
}
impl From<&str> for QueryValue {
    fn from(value: &str) -> Self {
        Self::One(value.into())
    }
}
impl From<bool> for QueryValue {
    fn from(value: bool) -> Self {
        Self::One(value.into())
    }
}
impl From<i64> for QueryValue {
    fn from(value: i64) -> Self {
        Self::One(value.into())
    }
}
pub type Query = BTreeMap<String, QueryValue>;
pub(crate) fn query_pairs(query: &Query) -> crate::Result<Vec<(&str, String)>> {
    fn text(value: &QueryPrimitive) -> crate::Result<String> {
        Ok(match value {
            QueryPrimitive::String(s) => s.clone(),
            QueryPrimitive::Integer(n) => n.to_string(),
            QueryPrimitive::Number(n) if n.is_finite() => n.to_string(),
            QueryPrimitive::Boolean(b) => b.to_string(),
            _ => return Err(crate::transport::configuration("query")),
        })
    }
    let mut pairs = Vec::new();
    for (key, value) in query {
        match value {
            QueryValue::One(value) => pairs.push((key.as_str(), text(value)?)),
            QueryValue::Many(values) => {
                for value in values {
                    pairs.push((key.as_str(), text(value)?));
                }
            }
            QueryValue::Null => {}
        }
    }
    Ok(pairs)
}
