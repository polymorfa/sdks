//! Linked Devices groups, settings, membership and stored capability observations.
use crate::{
    models::{SuccessEnvelope, SuccessResponse},
    transport::{encode, HttpTransport},
    ApiResponse, RequestOptions, Result,
};
use reqwest::Method;
use serde::{Deserialize, Serialize};
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GroupParticipant {
    pub id: String,
    pub is_admin: bool,
    pub is_super_admin: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bsuid: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub phone_number: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub username: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Group {
    pub id: String,
    pub name: String,
    pub description: String,
    pub created_at: u64,
    pub participants: Vec<GroupParticipant>,
    pub owner_id: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GroupInviteInfo {
    pub id: String,
    pub subject: String,
    pub created_at: u64,
    pub size: u32,
    pub participants: Vec<GroupParticipant>,
    pub creator_id: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct GroupInviteCode {
    pub code: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CreateGroupRequest {
    pub name: String,
    pub participants: Vec<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SetGroupFieldRequest {
    pub value: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct GroupParticipantsRequest {
    pub participants: Vec<String>,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct SetGroupPictureRequest {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub base64: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct JoinGroupRequest {
    pub code: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GroupAdminOnlySettingRequest {
    pub admins_only: bool,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum GroupMemberAddMode {
    AdminAdd,
    AllMemberAdd,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct GroupMemberAddModeRequest {
    pub mode: GroupMemberAddMode,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct GroupJoinApprovalRequest {
    pub required: bool,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum GroupCapabilityKey {
    #[serde(rename = "polls.endTime")]
    PollsEndTime,
    #[serde(rename = "polls.hideVoters")]
    PollsHideVoters,
    #[serde(rename = "polls.creatorEdit")]
    PollsCreatorEdit,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum GroupCapabilityKind {
    Feature,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum GroupCapabilitySource {
    Server,
    ClientDefault,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct GroupCapability {
    pub key: GroupCapabilityKey,
    pub kind: GroupCapabilityKind,
    pub unit: (),
    pub value: Option<bool>,
    pub source: Option<GroupCapabilitySource>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GroupCapabilities {
    pub status: crate::platform_sessions::SessionCapabilitiesStatus,
    pub synced_at: Option<String>,
    pub checked_at: Option<String>,
    pub capabilities: Vec<GroupCapability>,
}
pub struct Groups<'a>(pub(crate) &'a HttpTransport);
fn root(session: &str) -> String {
    format!("/messaging/{}/groups", encode(session))
}
fn path(session: &str, id: &str) -> String {
    format!("{}/{}", root(session), encode(id))
}
impl Groups<'_> {
    pub async fn list(
        &self,
        session: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<Vec<Group>>>> {
        self.0.get(&root(session), options).await
    }
    pub async fn create(
        &self,
        session: &str,
        body: &CreateGroupRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<Group>>> {
        self.0
            .request(Method::POST, &root(session), &[], Some(body), options)
            .await
    }
    pub async fn get_join_info(
        &self,
        session: &str,
        code: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<GroupInviteInfo>>> {
        self.0
            .request::<_, ()>(
                Method::GET,
                &format!("{}/join-info", root(session)),
                &[("code", code.into())],
                None,
                options,
            )
            .await
    }
    pub async fn join(
        &self,
        session: &str,
        body: &JoinGroupRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessResponse>> {
        self.0
            .request(
                Method::POST,
                &format!("{}/join", root(session)),
                &[],
                Some(body),
                options,
            )
            .await
    }
    pub async fn retrieve(
        &self,
        session: &str,
        id: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<Group>>> {
        self.0.get(&path(session, id), options).await
    }
    pub async fn get_capabilities(
        &self,
        session: &str,
        id: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<GroupCapabilities>>> {
        self.0
            .get(&format!("{}/capabilities", path(session, id)), options)
            .await
    }
    pub async fn delete(
        &self,
        session: &str,
        id: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessResponse>> {
        self.0
            .request::<_, ()>(Method::DELETE, &path(session, id), &[], None, options)
            .await
    }
    pub async fn leave(
        &self,
        session: &str,
        id: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessResponse>> {
        self.0
            .request::<_, ()>(
                Method::POST,
                &format!("{}/leave", path(session, id)),
                &[],
                None,
                options,
            )
            .await
    }
    pub async fn set_subject(
        &self,
        session: &str,
        id: &str,
        body: &SetGroupFieldRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessResponse>> {
        self.update(session, id, "subject", body, options).await
    }
    pub async fn set_description(
        &self,
        session: &str,
        id: &str,
        body: &SetGroupFieldRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessResponse>> {
        self.update(session, id, "description", body, options).await
    }
    pub async fn get_invite_code(
        &self,
        session: &str,
        id: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<GroupInviteCode>>> {
        self.0
            .get(&format!("{}/invite-code", path(session, id)), options)
            .await
    }
    pub async fn revoke_invite_code(
        &self,
        session: &str,
        id: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<GroupInviteCode>>> {
        self.0
            .request::<_, ()>(
                Method::POST,
                &format!("{}/invite-code/revoke", path(session, id)),
                &[],
                None,
                options,
            )
            .await
    }
    pub async fn list_participants(
        &self,
        session: &str,
        id: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<Vec<GroupParticipant>>>> {
        self.0
            .get(&format!("{}/participants", path(session, id)), options)
            .await
    }
    pub async fn add_participants(
        &self,
        session: &str,
        id: &str,
        body: &GroupParticipantsRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessResponse>> {
        self.mutate(session, id, "participants/add", body, options)
            .await
    }
    pub async fn remove_participants(
        &self,
        session: &str,
        id: &str,
        body: &GroupParticipantsRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessResponse>> {
        self.mutate(session, id, "participants/remove", body, options)
            .await
    }
    pub async fn promote_participants(
        &self,
        session: &str,
        id: &str,
        body: &GroupParticipantsRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessResponse>> {
        self.mutate(session, id, "admin/promote", body, options)
            .await
    }
    pub async fn demote_participants(
        &self,
        session: &str,
        id: &str,
        body: &GroupParticipantsRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessResponse>> {
        self.mutate(session, id, "admin/demote", body, options)
            .await
    }
    pub async fn set_picture(
        &self,
        session: &str,
        id: &str,
        body: &SetGroupPictureRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessResponse>> {
        self.update(session, id, "picture", body, options).await
    }
    pub async fn set_info_editing(
        &self,
        session: &str,
        id: &str,
        body: &GroupAdminOnlySettingRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessResponse>> {
        self.update(session, id, "settings/info-edit", body, options)
            .await
    }
    pub async fn set_messaging(
        &self,
        session: &str,
        id: &str,
        body: &GroupAdminOnlySettingRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessResponse>> {
        self.update(session, id, "settings/messages", body, options)
            .await
    }
    pub async fn set_member_add_mode(
        &self,
        session: &str,
        id: &str,
        body: &GroupMemberAddModeRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessResponse>> {
        self.update(session, id, "settings/member-add", body, options)
            .await
    }
    pub async fn set_join_approval(
        &self,
        session: &str,
        id: &str,
        body: &GroupJoinApprovalRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessResponse>> {
        self.update(session, id, "settings/join-approval", body, options)
            .await
    }
    async fn update<T: Serialize>(
        &self,
        session: &str,
        id: &str,
        suffix: &str,
        body: &T,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessResponse>> {
        self.0
            .request(
                Method::PUT,
                &format!("{}/{suffix}", path(session, id)),
                &[],
                Some(body),
                options,
            )
            .await
    }
    async fn mutate<T: Serialize>(
        &self,
        session: &str,
        id: &str,
        suffix: &str,
        body: &T,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessResponse>> {
        self.0
            .request(
                Method::POST,
                &format!("{}/{suffix}", path(session, id)),
                &[],
                Some(body),
                options,
            )
            .await
    }
}
