//! Official API beta group operations. The API owns enrollment and participant limits.
use crate::{
    models::{ConversationIdentity, SuccessEnvelope},
    transport::{encode, HttpTransport},
    ApiResponse, RequestOptions, Result,
};
use reqwest::Method;
use serde::{Deserialize, Serialize};
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct OfficialGroupCursors {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub before: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub after: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OfficialGroupSummary {
    pub id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub subject: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub created_at: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OfficialGroupList {
    pub groups: Vec<OfficialGroupSummary>,
    pub cursors: OfficialGroupCursors,
    pub has_more: bool,
}
macro_rules! optional_fields{($($field:ident:$ty:ty),*$(,)?)=>{#[derive(Clone,Debug,Serialize,Deserialize)]#[serde(rename_all="camelCase")]pub struct OfficialGroup{pub id:String,$(#[serde(skip_serializing_if="Option::is_none")]pub $field:Option<$ty>,)*pub participants:Vec<ConversationIdentity>}}}
optional_fields!(subject:String,description:String,suspended:bool,created_at:String,participant_count:u32,join_approval_required:bool);
#[derive(Clone, Debug, Default)]
pub struct ListOfficialGroupsParameters {
    pub limit: Option<u32>,
    pub before: Option<String>,
    pub after: Option<String>,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateOfficialGroupRequest {
    pub subject: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub join_approval_required: Option<bool>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateOfficialGroupResult {
    pub request_id: String,
}
#[derive(Clone, Debug, Default, Serialize)]
pub struct UpdateOfficialGroupRequest {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub subject: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct OfficialGroupChangeAccepted {
    pub accepted: bool,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OfficialGroupInviteLink {
    pub invite_link: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OfficialGroupJoinRequest {
    pub join_request_id: String,
    pub user: ConversationIdentity,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub created_at: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OfficialGroupJoinRequestList {
    pub items: Vec<OfficialGroupJoinRequest>,
    pub cursors: OfficialGroupCursors,
    pub has_more: bool,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct OfficialGroupJoinRequestError {
    pub code: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OfficialGroupJoinRequestFailure {
    pub join_request_id: String,
    pub errors: Vec<OfficialGroupJoinRequestError>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct OfficialGroupJoinRequestDecision {
    pub succeeded: Vec<String>,
    pub failed: Vec<OfficialGroupJoinRequestFailure>,
}
#[derive(Clone, Debug, Serialize)]
#[serde(tag = "operation", rename_all = "lowercase")]
pub enum PinOfficialGroupMessageRequest {
    Pin {
        #[serde(rename = "messageId")]
        message_id: String,
        #[serde(rename = "expirationDays")]
        expiration_days: u8,
    },
    Unpin {
        #[serde(rename = "messageId")]
        message_id: String,
    },
}
#[derive(Serialize)]
struct Participants<'a> {
    participants: &'a [String],
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct JoinRequestIds<'a> {
    join_request_ids: &'a [String],
}
pub struct OfficialGroups<'a>(pub(crate) &'a HttpTransport);
fn groups(session: &str) -> String {
    format!("/messaging/{}/official-groups", encode(session))
}
fn group(session: &str, id: &str) -> String {
    format!("{}/{}", groups(session), encode(id))
}
impl OfficialGroups<'_> {
    pub async fn list(
        &self,
        session: &str,
        params: &ListOfficialGroupsParameters,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<OfficialGroupList>>> {
        self.0.server()?;
        let mut query = Vec::new();
        if let Some(v) = params.limit {
            query.push(("limit", v.to_string()));
        }
        if let Some(v) = &params.before {
            query.push(("before", v.clone()));
        }
        if let Some(v) = &params.after {
            query.push(("after", v.clone()));
        }
        self.0
            .request::<_, ()>(Method::GET, &groups(session), &query, None, options)
            .await
    }
    pub async fn create(
        &self,
        session: &str,
        body: &CreateOfficialGroupRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<CreateOfficialGroupResult>>> {
        self.write(Method::POST, &groups(session), Some(body), options)
            .await
    }
    pub async fn retrieve(
        &self,
        session: &str,
        id: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<OfficialGroup>>> {
        self.0.server()?;
        self.0.get(&group(session, id), options).await
    }
    pub async fn update(
        &self,
        session: &str,
        id: &str,
        body: &UpdateOfficialGroupRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<OfficialGroupChangeAccepted>>> {
        self.write(Method::PATCH, &group(session, id), Some(body), options)
            .await
    }
    pub async fn delete(
        &self,
        session: &str,
        id: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<OfficialGroupChangeAccepted>>> {
        self.write::<_, ()>(Method::DELETE, &group(session, id), None, options)
            .await
    }
    pub async fn get_invite_link(
        &self,
        session: &str,
        id: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<OfficialGroupInviteLink>>> {
        self.0.server()?;
        self.0
            .get(&format!("{}/invite-link", group(session, id)), options)
            .await
    }
    pub async fn reset_invite_link(
        &self,
        session: &str,
        id: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<OfficialGroupInviteLink>>> {
        self.write::<_, ()>(
            Method::POST,
            &format!("{}/invite-link/reset", group(session, id)),
            None,
            options,
        )
        .await
    }
    pub async fn remove_participants(
        &self,
        session: &str,
        id: &str,
        participants: &[String],
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<OfficialGroupChangeAccepted>>> {
        self.write(
            Method::POST,
            &format!("{}/participants/remove", group(session, id)),
            Some(&Participants { participants }),
            options,
        )
        .await
    }
    pub async fn list_join_requests(
        &self,
        session: &str,
        id: &str,
        params: &OfficialGroupCursors,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<OfficialGroupJoinRequestList>>> {
        self.0.server()?;
        let mut query = Vec::new();
        if let Some(v) = &params.before {
            query.push(("before", v.clone()));
        }
        if let Some(v) = &params.after {
            query.push(("after", v.clone()));
        }
        self.0
            .request::<_, ()>(
                Method::GET,
                &format!("{}/join-requests", group(session, id)),
                &query,
                None,
                options,
            )
            .await
    }
    pub async fn approve_join_requests(
        &self,
        session: &str,
        id: &str,
        join_request_ids: &[String],
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<OfficialGroupJoinRequestDecision>>> {
        self.write(
            Method::POST,
            &format!("{}/join-requests/approve", group(session, id)),
            Some(&JoinRequestIds { join_request_ids }),
            options,
        )
        .await
    }
    pub async fn reject_join_requests(
        &self,
        session: &str,
        id: &str,
        join_request_ids: &[String],
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<OfficialGroupJoinRequestDecision>>> {
        self.write(
            Method::POST,
            &format!("{}/join-requests/reject", group(session, id)),
            Some(&JoinRequestIds { join_request_ids }),
            options,
        )
        .await
    }
    pub async fn pin(
        &self,
        session: &str,
        id: &str,
        body: &PinOfficialGroupMessageRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<OfficialGroupChangeAccepted>>> {
        self.write(
            Method::POST,
            &format!("{}/pins", group(session, id)),
            Some(body),
            options,
        )
        .await
    }
    async fn write<T: serde::de::DeserializeOwned, B: Serialize + ?Sized>(
        &self,
        method: Method,
        path: &str,
        body: Option<&B>,
        mut options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<T>>> {
        self.0.server()?;
        options.max_network_retries = Some(0);
        self.0.request(method, path, &[], body, options).await
    }
}
