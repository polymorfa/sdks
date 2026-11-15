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
    #[serde(deserialize_with = "crate::campaign_contracts::required_nullable")]
    pub value: Option<bool>,
    #[serde(deserialize_with = "crate::campaign_contracts::required_nullable")]
    pub source: Option<GroupCapabilitySource>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GroupCapabilities {
    pub status: crate::platform_connections::ConnectionCapabilitiesStatus,
    #[serde(deserialize_with = "crate::campaign_contracts::required_nullable")]
    pub synced_at: Option<String>,
    #[serde(deserialize_with = "crate::campaign_contracts::required_nullable")]
    pub checked_at: Option<String>,
    pub capabilities: Vec<GroupCapability>,
}
pub struct Groups<'a>(pub(crate) &'a HttpTransport);
fn root(connection: &str) -> String {
    format!("/messaging/{}/groups", encode(connection))
}
fn path(connection: &str, id: &str) -> String {
    format!("{}/{}", root(connection), encode(id))
}
impl Groups<'_> {
    pub async fn list(
        &self,
        connection: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<Vec<Group>>>> {
        self.0.get(&root(connection), options).await
    }
    pub async fn create(
        &self,
        connection: &str,
        body: &CreateGroupRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<Group>>> {
        self.0
            .request(Method::POST, &root(connection), &[], Some(body), options)
            .await
    }
    pub async fn get_join_info(
        &self,
        connection: &str,
        code: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<GroupInviteInfo>>> {
        self.0
            .request::<_, ()>(
                Method::GET,
                &format!("{}/join-info", root(connection)),
                &[("code", code.into())],
                None,
                options,
            )
            .await
    }
    pub async fn join(
        &self,
        connection: &str,
        body: &JoinGroupRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessResponse>> {
        self.0
            .request(
                Method::POST,
                &format!("{}/join", root(connection)),
                &[],
                Some(body),
                options,
            )
            .await
    }
    pub async fn retrieve(
        &self,
        connection: &str,
        id: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<Group>>> {
        self.0.get(&path(connection, id), options).await
    }
    pub async fn get_capabilities(
        &self,
        connection: &str,
        id: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<GroupCapabilities>>> {
        let response: ApiResponse<SuccessEnvelope<GroupCapabilities>> = self
            .0
            .get(&format!("{}/capabilities", path(connection, id)), options)
            .await?;
        if response.metadata.status != 200 || !response.data.success {
            return Err(crate::Error::local(
                crate::ErrorKind::Server,
                "Invalid group capabilities response",
                "invalid_response",
            )
            .with_metadata(response.metadata));
        }
        Ok(response)
    }
    pub async fn delete(
        &self,
        connection: &str,
        id: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessResponse>> {
        self.0
            .request::<_, ()>(Method::DELETE, &path(connection, id), &[], None, options)
            .await
    }
    pub async fn leave(
        &self,
        connection: &str,
        id: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessResponse>> {
        self.0
            .request::<_, ()>(
                Method::POST,
                &format!("{}/leave", path(connection, id)),
                &[],
                None,
                options,
            )
            .await
    }
    pub async fn set_subject(
        &self,
        connection: &str,
        id: &str,
        body: &SetGroupFieldRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessResponse>> {
        self.update(connection, id, "subject", body, options).await
    }
    pub async fn set_description(
        &self,
        connection: &str,
        id: &str,
        body: &SetGroupFieldRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessResponse>> {
        self.update(connection, id, "description", body, options)
            .await
    }
    pub async fn get_invite_code(
        &self,
        connection: &str,
        id: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<GroupInviteCode>>> {
        self.0
            .get(&format!("{}/invite-code", path(connection, id)), options)
            .await
    }
    pub async fn revoke_invite_code(
        &self,
        connection: &str,
        id: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<GroupInviteCode>>> {
        self.0
            .request::<_, ()>(
                Method::POST,
                &format!("{}/invite-code/revoke", path(connection, id)),
                &[],
                None,
                options,
            )
            .await
    }
    pub async fn list_participants(
        &self,
        connection: &str,
        id: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<Vec<GroupParticipant>>>> {
        self.0
            .get(&format!("{}/participants", path(connection, id)), options)
            .await
    }
    pub async fn add_participants(
        &self,
        connection: &str,
        id: &str,
        body: &GroupParticipantsRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessResponse>> {
        self.mutate(connection, id, "participants/add", body, options)
            .await
    }
    pub async fn remove_participants(
        &self,
        connection: &str,
        id: &str,
        body: &GroupParticipantsRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessResponse>> {
        self.mutate(connection, id, "participants/remove", body, options)
            .await
    }
    pub async fn promote_participants(
        &self,
        connection: &str,
        id: &str,
        body: &GroupParticipantsRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessResponse>> {
        self.mutate(connection, id, "admin/promote", body, options)
            .await
    }
    pub async fn demote_participants(
        &self,
        connection: &str,
        id: &str,
        body: &GroupParticipantsRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessResponse>> {
        self.mutate(connection, id, "admin/demote", body, options)
            .await
    }
    pub async fn set_picture(
        &self,
        connection: &str,
        id: &str,
        body: &SetGroupPictureRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessResponse>> {
        self.update(connection, id, "picture", body, options).await
    }
    pub async fn set_info_editing(
        &self,
        connection: &str,
        id: &str,
        body: &GroupAdminOnlySettingRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessResponse>> {
        self.update(connection, id, "settings/info-edit", body, options)
            .await
    }
    pub async fn set_messaging(
        &self,
        connection: &str,
        id: &str,
        body: &GroupAdminOnlySettingRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessResponse>> {
        self.update(connection, id, "settings/messages", body, options)
            .await
    }
    pub async fn set_member_add_mode(
        &self,
        connection: &str,
        id: &str,
        body: &GroupMemberAddModeRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessResponse>> {
        self.update(connection, id, "settings/member-add", body, options)
            .await
    }
    pub async fn set_join_approval(
        &self,
        connection: &str,
        id: &str,
        body: &GroupJoinApprovalRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessResponse>> {
        self.update(connection, id, "settings/join-approval", body, options)
            .await
    }
    async fn update<T: Serialize>(
        &self,
        connection: &str,
        id: &str,
        suffix: &str,
        body: &T,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessResponse>> {
        self.0
            .request(
                Method::PUT,
                &format!("{}/{suffix}", path(connection, id)),
                &[],
                Some(body),
                options,
            )
            .await
    }
    async fn mutate<T: Serialize>(
        &self,
        connection: &str,
        id: &str,
        suffix: &str,
        body: &T,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessResponse>> {
        self.0
            .request(
                Method::POST,
                &format!("{}/{suffix}", path(connection, id)),
                &[],
                Some(body),
                options,
            )
            .await
    }
}
