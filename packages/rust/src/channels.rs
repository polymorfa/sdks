//! Channels and newsletter messages, update cursors, reactions and subscriptions.
use crate::{
    account::{ActionResponse, AsyncAccepted},
    models::{ConversationIdentity, SuccessEnvelope, WhatsAppMessageIds},
    transport::{encode, HttpTransport},
    ApiResponse, RequestOptions, Result,
};
use reqwest::Method;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Channel {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub profile_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub followers: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub muted: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub preview: Option<bool>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CreateChannelRequest {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub picture: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChannelMessage {
    pub position: u64,
    pub id: String,
    #[serde(rename = "whatsapp_ids")]
    pub whatsapp_ids: WhatsAppMessageIds,
    #[serde(rename = "whatsapp_id", skip_serializing_if = "Option::is_none")]
    pub whatsapp_id: Option<String>,
    pub conversation: ConversationIdentity,
    #[serde(rename = "type")]
    pub message_type: String,
    pub timestamp: String,
    pub views: u64,
    pub reaction_counts: BTreeMap<String, u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct ChannelMessagesParams {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub count: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub before: Option<u64>,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct ChannelMessageUpdatesParams {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub count: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub since: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub after: Option<u64>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ChannelReactionRequest {
    pub reaction: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChannelLiveUpdates {
    pub duration_seconds: u32,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct DeletedChannel {
    pub status: DeletedChannelStatus,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum DeletedChannelStatus {
    #[serde(rename = "DELETED")]
    Deleted,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(untagged)]
pub enum ChannelCreateResponse {
    Accepted(SuccessEnvelope<AsyncAccepted>),
    Created(SuccessEnvelope<Channel>),
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(untagged)]
pub enum ChannelDeleteResponse {
    Accepted(SuccessEnvelope<AsyncAccepted>),
    Deleted(SuccessEnvelope<DeletedChannel>),
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(untagged)]
pub enum ChannelLiveUpdatesResponse {
    Accepted(SuccessEnvelope<AsyncAccepted>),
    Subscribed(SuccessEnvelope<ChannelLiveUpdates>),
}
pub struct Channels<'a>(pub(crate) &'a HttpTransport);
fn root(connection: &str) -> String {
    format!("/messaging/{}/channels", encode(connection))
}
fn path(connection: &str, id: &str) -> String {
    format!("{}/{}", root(connection), encode(id))
}
impl Channels<'_> {
    pub async fn list(
        &self,
        connection: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<Vec<Channel>>>> {
        self.0.get(&root(connection), options).await
    }
    pub async fn create(
        &self,
        connection: &str,
        body: &CreateChannelRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<ChannelCreateResponse>> {
        self.0
            .request(Method::POST, &root(connection), &[], Some(body), options)
            .await
    }
    pub async fn retrieve(
        &self,
        connection: &str,
        id: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<Channel>>> {
        self.0.get(&path(connection, id), options).await
    }
    pub async fn delete(
        &self,
        connection: &str,
        id: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<ChannelDeleteResponse>> {
        self.0
            .request::<_, ()>(Method::DELETE, &path(connection, id), &[], None, options)
            .await
    }
    pub async fn list_messages(
        &self,
        connection: &str,
        id: &str,
        params: &ChannelMessagesParams,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<Vec<ChannelMessage>>>> {
        let model = crate::developer::query(params)?;
        let query = crate::models::query_pairs(&model)?;
        self.0
            .request::<_, ()>(
                Method::GET,
                &format!("{}/messages", path(connection, id)),
                &query,
                None,
                options,
            )
            .await
    }
    pub async fn list_message_updates(
        &self,
        connection: &str,
        id: &str,
        params: &ChannelMessageUpdatesParams,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<Vec<ChannelMessage>>>> {
        let model = crate::developer::query(params)?;
        let query = crate::models::query_pairs(&model)?;
        self.0
            .request::<_, ()>(
                Method::GET,
                &format!("{}/message-updates", path(connection, id)),
                &query,
                None,
                options,
            )
            .await
    }
    pub async fn mark_message_viewed(
        &self,
        connection: &str,
        id: &str,
        message_id: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<ActionResponse>> {
        self.0
            .request::<_, ()>(
                Method::POST,
                &format!(
                    "{}/messages/{}/viewed",
                    path(connection, id),
                    encode(message_id)
                ),
                &[],
                None,
                options,
            )
            .await
    }
    pub async fn react_to_message(
        &self,
        connection: &str,
        id: &str,
        message_id: &str,
        body: &ChannelReactionRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<ActionResponse>> {
        self.0
            .request(
                Method::POST,
                &format!(
                    "{}/messages/{}/reaction",
                    path(connection, id),
                    encode(message_id)
                ),
                &[],
                Some(body),
                options.idempotent(),
            )
            .await
    }
    pub async fn subscribe_to_live_updates(
        &self,
        connection: &str,
        id: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<ChannelLiveUpdatesResponse>> {
        self.0
            .request::<_, ()>(
                Method::POST,
                &format!("{}/live-updates", path(connection, id)),
                &[],
                None,
                options,
            )
            .await
    }
    pub async fn follow(
        &self,
        connection: &str,
        id: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<ActionResponse>> {
        self.action(connection, id, "follow", options).await
    }
    pub async fn unfollow(
        &self,
        connection: &str,
        id: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<ActionResponse>> {
        self.action(connection, id, "unfollow", options).await
    }
    pub async fn mute(
        &self,
        connection: &str,
        id: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<ActionResponse>> {
        self.action(connection, id, "mute", options).await
    }
    pub async fn unmute(
        &self,
        connection: &str,
        id: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<ActionResponse>> {
        self.action(connection, id, "unmute", options).await
    }
    async fn action(
        &self,
        connection: &str,
        id: &str,
        action: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<ActionResponse>> {
        self.0
            .request::<_, ()>(
                Method::POST,
                &format!("{}/{action}", path(connection, id)),
                &[],
                None,
                options,
            )
            .await
    }
}
