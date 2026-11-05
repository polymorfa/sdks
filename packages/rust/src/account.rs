//! Linked Devices profile, presence, contacts, privacy, labels and quick replies.
use crate::{
    models::*,
    transport::{encode, HttpTransport},
    ApiResponse, RequestOptions, Result,
};
use reqwest::Method;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Contact {
    pub id: String,
    pub bsuid: Option<String>,
    pub phone_number: Option<String>,
    pub username: Option<String>,
    pub name: String,
    pub push_name: String,
    pub business_name: Option<String>,
    pub profile_url: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckContactResult {
    pub exists: bool,
    pub bsuid: Option<String>,
    pub phone_number: Option<String>,
    pub id: Option<String>,
    pub username: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ContactBlocklist {
    pub hash: String,
    pub contacts: Vec<ConversationReference>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ContactProfilePicture {
    pub url: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContactUserInfo {
    pub id: String,
    pub bsuid: Option<String>,
    pub status: String,
    pub picture_id: String,
    pub verified_name: String,
    pub devices: Vec<UserDevice>,
    pub phone_number: Option<String>,
    pub username: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct UserDevice {
    #[serde(flatten)]
    pub identity: ConversationReference,
    pub device: u32,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct BusinessProfileCategory {
    pub id: String,
    pub name: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BusinessProfileHours {
    pub day_of_week: String,
    pub mode: String,
    pub open_time: String,
    pub close_time: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BusinessProfile {
    #[serde(flatten)]
    pub identity: ConversationReference,
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
pub struct Contacts<'a>(pub(crate) &'a HttpTransport);
impl Contacts<'_> {
    pub async fn list(
        &self,
        session: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<Vec<Contact>>>> {
        self.0.get(&path(session, "contacts"), options).await
    }
    pub async fn check(
        &self,
        session: &str,
        phones: &[String],
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<Vec<CheckContactResult>>>> {
        self.0
            .request::<_, ()>(
                Method::GET,
                &path(session, "contacts/check"),
                &[("phone", phones.join(","))],
                None,
                options,
            )
            .await
    }
    pub async fn blocklist(
        &self,
        session: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<ContactBlocklist>>> {
        self.0
            .get(&path(session, "contacts/blocked"), options)
            .await
    }
    pub async fn retrieve(
        &self,
        session: &str,
        contact_id: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<Contact>>> {
        self.0
            .get(&contact_path(session, contact_id), options)
            .await
    }
    pub async fn picture(
        &self,
        session: &str,
        contact_id: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<ContactProfilePicture>>> {
        self.0
            .get(
                &format!("{}/picture", contact_path(session, contact_id)),
                options,
            )
            .await
    }
    pub async fn info(
        &self,
        session: &str,
        contact_id: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<ContactUserInfo>>> {
        self.0
            .get(
                &format!("{}/info", contact_path(session, contact_id)),
                options,
            )
            .await
    }
    pub async fn devices(
        &self,
        session: &str,
        contact_id: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<Vec<String>>>> {
        self.0
            .get(
                &format!("{}/devices", contact_path(session, contact_id)),
                options,
            )
            .await
    }
    pub async fn business_profile(
        &self,
        session: &str,
        contact_id: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<BusinessProfile>>> {
        self.0
            .get(
                &format!("{}/business-profile", contact_path(session, contact_id)),
                options,
            )
            .await
    }
    pub async fn block(
        &self,
        session: &str,
        contact_id: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessResponse>> {
        self.0
            .request::<_, ()>(
                Method::POST,
                &format!("{}/block", contact_path(session, contact_id)),
                &[],
                None,
                options,
            )
            .await
    }
    pub async fn unblock(
        &self,
        session: &str,
        contact_id: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessResponse>> {
        self.0
            .request::<_, ()>(
                Method::POST,
                &format!("{}/unblock", contact_path(session, contact_id)),
                &[],
                None,
                options,
            )
            .await
    }
}
fn contact_path(session: &str, id: &str) -> String {
    path(session, &format!("contacts/{}", encode(id)))
}
fn path(session: &str, suffix: &str) -> String {
    format!("/messaging/{}/{suffix}", encode(session))
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileData {
    pub name: String,
    pub status: String,
    pub profile_pic_url: Option<String>,
    pub phone_platform: Option<String>,
    pub account_type: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SetProfileNameRequest {
    pub name: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SetProfileStatusRequest {
    pub status: String,
}
#[derive(Clone, Debug, Serialize, Deserialize, Default)]
pub struct SetPictureRequest {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub base64: Option<String>,
}
pub struct Profile<'a>(pub(crate) &'a HttpTransport);
impl Profile<'_> {
    pub async fn get(
        &self,
        session: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<ProfileData>>> {
        self.0.get(&path(session, "profile"), options).await
    }
    pub async fn set_name(
        &self,
        session: &str,
        body: &SetProfileNameRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessResponse>> {
        self.0
            .request(
                Method::PUT,
                &path(session, "profile/name"),
                &[],
                Some(body),
                options,
            )
            .await
    }
    pub async fn set_status(
        &self,
        session: &str,
        body: &SetProfileStatusRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessResponse>> {
        self.0
            .request(
                Method::PUT,
                &path(session, "profile/status"),
                &[],
                Some(body),
                options,
            )
            .await
    }
    pub async fn set_picture(
        &self,
        session: &str,
        body: &SetPictureRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessResponse>> {
        self.0
            .request(
                Method::PUT,
                &path(session, "profile/picture"),
                &[],
                Some(body),
                options,
            )
            .await
    }
    pub async fn delete_picture(
        &self,
        session: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessResponse>> {
        self.0
            .request::<_, ()>(
                Method::DELETE,
                &path(session, "profile/picture"),
                &[],
                None,
                options,
            )
            .await
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrivacySettings {
    pub group_add: String,
    pub last_seen: String,
    pub status: String,
    pub profile: String,
    pub read_receipts: String,
    pub online: String,
    pub call_add: String,
    pub messages: String,
    pub defense: String,
    pub stickers: String,
}
#[derive(Clone, Debug)]
pub enum StandardPrivacyAudience {
    All,
    Contacts,
    ContactBlacklist,
    None,
}
impl StandardPrivacyAudience {
    fn value(&self) -> &'static str {
        match self {
            Self::All => "all",
            Self::Contacts => "contacts",
            Self::ContactBlacklist => "contact_blacklist",
            Self::None => "none",
        }
    }
}
#[derive(Clone, Debug)]
pub enum PrivacyMutation {
    GroupAdd(StandardPrivacyAudience),
    LastSeen(StandardPrivacyAudience),
    Status(StandardPrivacyAudience),
    Profile(StandardPrivacyAudience),
    ReadReceipts(bool),
    OnlineMatchLastSeen(bool),
    CallsKnownOnly(bool),
    MessagesContactsOnly(bool),
    Defense(bool),
    Stickers(StickerPrivacy),
}
#[derive(Clone, Debug)]
pub enum StickerPrivacy {
    Contacts,
    ContactAllowlist,
    None,
}
impl PrivacyMutation {
    fn wire(&self) -> (&'static str, &'static str) {
        match self {
            Self::GroupAdd(v) => ("groupadd", v.value()),
            Self::LastSeen(v) => ("last", v.value()),
            Self::Status(v) => ("status", v.value()),
            Self::Profile(v) => ("profile", v.value()),
            Self::ReadReceipts(v) => ("readreceipts", if *v { "all" } else { "none" }),
            Self::OnlineMatchLastSeen(v) => ("online", if *v { "match_last_seen" } else { "all" }),
            Self::CallsKnownOnly(v) => ("calladd", if *v { "known" } else { "all" }),
            Self::MessagesContactsOnly(v) => ("messages", if *v { "contacts" } else { "all" }),
            Self::Defense(v) => ("defense", if *v { "on_standard" } else { "off" }),
            Self::Stickers(v) => (
                "stickers",
                match v {
                    StickerPrivacy::Contacts => "contacts",
                    StickerPrivacy::ContactAllowlist => "contact_allowlist",
                    StickerPrivacy::None => "none",
                },
            ),
        }
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DisappearingTimerRequest {
    pub duration_seconds: u32,
}
pub struct Privacy<'a>(pub(crate) &'a HttpTransport);
impl Privacy<'_> {
    pub async fn get(
        &self,
        session: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<PrivacySettings>>> {
        self.0.get(&path(session, "privacy"), options).await
    }
    pub async fn set(
        &self,
        session: &str,
        mutation: &PrivacyMutation,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<PrivacySettings>>> {
        #[derive(Serialize)]
        struct Value<'a> {
            value: &'a str,
        }
        let (setting, value) = mutation.wire();
        self.0
            .request(
                Method::PUT,
                &path(session, &format!("privacy/{setting}")),
                &[],
                Some(&Value { value }),
                options,
            )
            .await
    }
    pub async fn set_default_disappearing_timer(
        &self,
        session: &str,
        body: &DisappearingTimerRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessResponse>> {
        self.0
            .request(
                Method::PUT,
                &path(session, "privacy/disappearing/default"),
                &[],
                Some(body),
                options,
            )
            .await
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SetPresenceRequest {
    pub presence: PresenceState,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PresenceState {
    Available,
    Unavailable,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PresenceData {
    pub desired: Option<PresenceState>,
    pub desired_at: Option<String>,
    pub last_sent: Option<PresenceState>,
    pub last_sent_at: Option<String>,
    pub authoritative: bool,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatPresenceData {
    pub policy: String,
    pub status: String,
    pub unknown_reason: Option<String>,
    pub available: Option<bool>,
    pub last_seen: Option<String>,
    pub observed_at: Option<String>,
    pub subscription_expires_at: Option<String>,
    pub stale: bool,
    pub typing_policy: String,
    pub typing_status: String,
    pub typing_unknown_reason: Option<String>,
    pub chat_state: Option<PresenceChatState>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PresenceChatState {
    pub sender: String,
    pub state: String,
    pub media: Option<String>,
    pub observed_at: String,
    pub stale: bool,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PresenceSubscription {
    pub status: String,
    pub expires_at: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AsyncAccepted {
    pub request_id: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(untagged)]
pub enum ActionResponse {
    Completed(SuccessEnvelope<StatusResult>),
    Accepted(SuccessEnvelope<AsyncAccepted>),
    Success(SuccessResponse),
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(untagged)]
pub enum SubscribePresenceResponse {
    Completed(SuccessEnvelope<PresenceSubscription>),
    Accepted(SuccessEnvelope<AsyncAccepted>),
}
pub struct Presence<'a>(pub(crate) &'a HttpTransport);
impl Presence<'_> {
    pub async fn get(
        &self,
        session: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<PresenceData>>> {
        self.0.get(&path(session, "presence"), options).await
    }
    pub async fn set(
        &self,
        session: &str,
        body: &SetPresenceRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<ActionResponse>> {
        self.0
            .request(
                Method::POST,
                &path(session, "presence"),
                &[],
                Some(body),
                options,
            )
            .await
    }
    pub async fn get_for_chat(
        &self,
        session: &str,
        chat_id: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<ChatPresenceData>>> {
        self.0
            .get(
                &path(session, &format!("presence/{}", encode(chat_id))),
                options,
            )
            .await
    }
    pub async fn subscribe(
        &self,
        session: &str,
        chat_id: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<SubscribePresenceResponse>> {
        self.0
            .request::<_, ()>(
                Method::POST,
                &path(session, &format!("presence/{}/subscribe", encode(chat_id))),
                &[],
                None,
                options,
            )
            .await
    }
}
#[derive(Clone, Debug)]
pub enum ResolveIdentityParams {
    PhoneNumber(String),
    Id(String),
    Username {
        username: String,
        key: Option<String>,
    },
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolveIdentityResult {
    pub id: Option<String>,
    pub bsuid: Option<String>,
    pub phone_number: Option<String>,
    pub username: Option<String>,
    pub key_required: Option<bool>,
}
pub struct Identities<'a>(pub(crate) &'a HttpTransport);
impl Identities<'_> {
    pub async fn resolve(
        &self,
        session: &str,
        params: &ResolveIdentityParams,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<ResolveIdentityResult>>> {
        let query = match params {
            ResolveIdentityParams::PhoneNumber(v) => vec![("phoneNumber", v.clone())],
            ResolveIdentityParams::Id(v) => vec![("id", v.clone())],
            ResolveIdentityParams::Username { username, key } => {
                let mut q = vec![("username", username.clone())];
                if let Some(key) = key {
                    q.push(("usernameKey", key.clone()));
                }
                q
            }
        };
        self.0
            .request::<_, ()>(
                Method::GET,
                &path(session, "identities/resolve"),
                &query,
                None,
                options,
            )
            .await
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserSecurityCode {
    pub id: String,
    pub phone_number: Option<String>,
    pub username: Option<String>,
    pub numeric_code: String,
    pub qr_code: String,
}
pub struct Users<'a>(pub(crate) &'a HttpTransport);
impl Users<'_> {
    pub async fn get_security_code(
        &self,
        session: &str,
        user_id: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<UserSecurityCode>>> {
        self.0
            .get(
                &path(session, &format!("users/{}/security-code", encode(user_id))),
                options,
            )
            .await
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Label {
    pub id: String,
    pub name: String,
    pub color: u32,
    pub order_index: Option<u32>,
    pub chat_count: Option<u64>,
    pub observed_at: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LabelCollection {
    pub policy: String,
    pub status: String,
    pub unknown_reason: Option<String>,
    pub observed_at: Option<String>,
    pub expires_at: Option<String>,
    pub labels: Vec<Label>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(untagged)]
pub enum LabelReadData {
    Labels(Vec<Label>),
    Collection(LabelCollection),
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CreateLabelRequest {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color: Option<u32>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(untagged)]
pub enum UpdateLabelRequest {
    Name {
        name: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        color: Option<u32>,
    },
    Color {
        color: u32,
        #[serde(skip_serializing_if = "Option::is_none")]
        name: Option<String>,
    },
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ReplaceChatLabelsRequest {
    pub labels: Vec<String>,
}
pub struct Labels<'a>(pub(crate) &'a HttpTransport);
impl Labels<'_> {
    pub async fn list(
        &self,
        session: &str,
        include_observation: Option<bool>,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<LabelReadData>>> {
        let query = include_observation
            .map(|v| vec![("includeObservation", v.to_string())])
            .unwrap_or_default();
        self.0
            .request::<_, ()>(Method::GET, &path(session, "labels"), &query, None, options)
            .await
    }
    pub async fn create(
        &self,
        session: &str,
        body: &CreateLabelRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<Label>>> {
        self.0
            .request(
                Method::POST,
                &path(session, "labels"),
                &[],
                Some(body),
                options,
            )
            .await
    }
    pub async fn update(
        &self,
        session: &str,
        id: &str,
        body: &UpdateLabelRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessResponse>> {
        self.0
            .request(
                Method::PUT,
                &path(session, &format!("labels/{}", encode(id))),
                &[],
                Some(body),
                options,
            )
            .await
    }
    pub async fn delete(
        &self,
        session: &str,
        id: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessResponse>> {
        self.0
            .request::<_, ()>(
                Method::DELETE,
                &path(session, &format!("labels/{}", encode(id))),
                &[],
                None,
                options,
            )
            .await
    }
    pub async fn list_for_chat(
        &self,
        session: &str,
        chat_id: &str,
        include_observation: Option<bool>,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<LabelReadData>>> {
        let query = include_observation
            .map(|v| vec![("includeObservation", v.to_string())])
            .unwrap_or_default();
        self.0
            .request::<_, ()>(
                Method::GET,
                &path(session, &format!("labels/chats/{}", encode(chat_id))),
                &query,
                None,
                options,
            )
            .await
    }
    pub async fn replace_for_chat(
        &self,
        session: &str,
        chat_id: &str,
        body: &ReplaceChatLabelsRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessResponse>> {
        self.0
            .request(
                Method::PUT,
                &path(session, &format!("labels/chats/{}", encode(chat_id))),
                &[],
                Some(body),
                options,
            )
            .await
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct BusinessQuickReplyMutation {
    pub shortcut: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub keywords: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub count: Option<u64>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct BusinessQuickReply {
    pub id: String,
    #[serde(flatten)]
    pub reply: BusinessQuickReplyMutation,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BusinessQuickReplyObserved {
    #[serde(flatten)]
    pub reply: BusinessQuickReply,
    pub associated_label_ids: Vec<String>,
    pub observed_at: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BusinessQuickReplyCollection {
    pub policy: String,
    pub status: String,
    pub unknown_reason: Option<String>,
    pub observed_at: Option<String>,
    pub quick_replies: Vec<BusinessQuickReplyObserved>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct DeletedBusinessQuickReply {
    pub id: String,
    pub status: String,
}
pub struct QuickReplies<'a>(pub(crate) &'a HttpTransport);
impl QuickReplies<'_> {
    pub async fn list(
        &self,
        session: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<BusinessQuickReplyCollection>>> {
        self.0
            .get(&path(session, "business/quick-replies"), options)
            .await
    }
    pub async fn create(
        &self,
        session: &str,
        body: &BusinessQuickReplyMutation,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<BusinessQuickReply>>> {
        self.0
            .request(
                Method::POST,
                &path(session, "business/quick-replies"),
                &[],
                Some(body),
                options,
            )
            .await
    }
    pub async fn replace(
        &self,
        session: &str,
        id: &str,
        body: &BusinessQuickReplyMutation,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<BusinessQuickReply>>> {
        self.0
            .request(
                Method::PUT,
                &path(session, &format!("business/quick-replies/{}", encode(id))),
                &[],
                Some(body),
                options,
            )
            .await
    }
    pub async fn delete(
        &self,
        session: &str,
        id: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<DeletedBusinessQuickReply>>> {
        self.0
            .request::<_, ()>(
                Method::DELETE,
                &path(session, &format!("business/quick-replies/{}", encode(id))),
                &[],
                None,
                options,
            )
            .await
    }
}
