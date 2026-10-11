//! The merged hosted-history contract. Access remains gated by API enrollment and HMS.
use crate::{
    models::{
        ConversationIdentity, MessageTransport, SuccessEnvelope, SuccessResponse,
        WhatsAppMessageIds,
    },
    transport::{encode, DownloadStream, HttpTransport},
    ApiResponse, RequestOptions, Result,
};
use reqwest::Method;
use serde::{Deserialize, Serialize};
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum HistoryChatKind {
    Direct,
    Group,
    Channel,
    Broadcast,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MessageDirection {
    Inbound,
    Outbound,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum HistoryOrder {
    Desc,
    Asc,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct HistoryMessageSummary {
    pub id: String,
    pub whatsapp_ids: WhatsAppMessageIds,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub whatsapp_id: Option<String>,
    pub direction: MessageDirection,
    #[serde(rename = "type")]
    pub message_type: String,
    pub timestamp: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryChat {
    pub conversation: ConversationIdentity,
    pub kind: HistoryChatKind,
    pub last_activity_at: String,
    pub last_message: HistoryMessageSummary,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryMedia {
    pub id: String,
    pub mime_type: String,
    pub file_length: u64,
    pub url: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum HistoryMediaRetrievalState {
    Pending,
    Stored,
    Unavailable,
    Expired,
    TooLarge,
    UnsupportedType,
    Failed,
    Cancelled,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct HistoryMediaRetrieval {
    pub state: HistoryMediaRetrievalState,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct HistoryConversation {
    #[serde(flatten)]
    pub identity: ConversationIdentity,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sender: Option<ConversationIdentity>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct HistoryPollOption {
    pub name: String,
    pub hash: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryMessage {
    #[serde(flatten)]
    pub summary: HistoryMessageSummary,
    pub conversation: HistoryConversation,
    pub from_me: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub push_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub caption: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mime_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub filename: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ptt: Option<bool>,
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
    pub edited: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub unavailable: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub unavailable_reason: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub poll_options: Option<Vec<HistoryPollOption>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub media: Option<Vec<HistoryMedia>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub media_retrieval: Option<HistoryMediaRetrieval>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryPage<T> {
    pub success: bool,
    pub data: Vec<T>,
    pub has_more: bool,
    pub next_cursor: Option<String>,
    pub previous_cursor: Option<String>,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListHistoryChatsParams {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub limit: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cursor: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub kind: Option<HistoryChatKind>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub active_since: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub active_before: Option<String>,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct ListHistoryMessagesParams {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub limit: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cursor: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub order: Option<HistoryOrder>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub since: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub until: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub direction: Option<MessageDirection>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub types: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct EditMessageRequest {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub transport: Option<MessageTransport>,
    pub text: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ServiceWindowState {
    Open,
    Closed,
    Unknown,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ServiceWindowReason {
    NotTracked,
    TrackingStarted,
    NotificationsInterrupted,
    IdentityUnlinked,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomerServiceWindow {
    pub state: ServiceWindowState,
    pub reason: Option<ServiceWindowReason>,
    pub opened_at: Option<String>,
    pub expires_at: Option<String>,
    pub checked_at: String,
}

pub struct Chats<'a>(pub(crate) &'a HttpTransport);
fn chat_path(session: &str, id: &str) -> String {
    format!("/messaging/{}/chats/{}", encode(session), encode(id))
}
fn message_path(session: &str, chat: &str, id: &str) -> String {
    format!("{}/messages/{}", chat_path(session, chat), encode(id))
}
impl Chats<'_> {
    pub async fn get_service_window(
        &self,
        session: &str,
        chat: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<CustomerServiceWindow>>> {
        self.0.credential.server()?;
        self.0
            .get(
                &format!("{}/service-window", chat_path(session, chat)),
                options,
            )
            .await
    }
    pub async fn list(
        &self,
        session: &str,
        params: &ListHistoryChatsParams,
        options: RequestOptions,
    ) -> Result<ApiResponse<HistoryPage<HistoryChat>>> {
        self.0.credential.server()?;
        let query_model = crate::developer::query(params)?;
        let query = crate::models::query_pairs(&query_model)?;
        self.0
            .request::<_, ()>(
                Method::GET,
                &format!("/messaging/{}/chats", encode(session)),
                &query,
                None,
                options,
            )
            .await
    }
    pub async fn retrieve(
        &self,
        session: &str,
        chat: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<HistoryChat>>> {
        self.0.credential.server()?;
        self.0.get(&chat_path(session, chat), options).await
    }
    pub async fn list_messages(
        &self,
        session: &str,
        chat: &str,
        params: &ListHistoryMessagesParams,
        options: RequestOptions,
    ) -> Result<ApiResponse<HistoryPage<HistoryMessage>>> {
        self.0.credential.server()?;
        let query_model = crate::developer::query(params)?;
        let query = crate::models::query_pairs(&query_model)?;
        self.0
            .request::<_, ()>(
                Method::GET,
                &format!("{}/messages", chat_path(session, chat)),
                &query,
                None,
                options,
            )
            .await
    }
    pub async fn retrieve_message(
        &self,
        session: &str,
        chat: &str,
        id: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<HistoryMessage>>> {
        self.0.credential.server()?;
        self.0.get(&message_path(session, chat, id), options).await
    }
    pub async fn download_message_media_stream(
        &self,
        session: &str,
        chat: &str,
        id: &str,
        options: RequestOptions,
    ) -> Result<DownloadStream> {
        self.0.credential.server()?;
        self.0
            .download(
                &format!("{}/media", message_path(session, chat, id)),
                options,
            )
            .await
    }
    pub async fn download_message_media(
        &self,
        session: &str,
        chat: &str,
        id: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<Vec<u8>>> {
        use futures_util::StreamExt;
        let mut response = self
            .download_message_media_stream(session, chat, id, options)
            .await?;
        let mut data = Vec::new();
        while let Some(chunk) = response.body.next().await {
            data.extend_from_slice(&chunk?);
        }
        Ok(ApiResponse {
            data,
            metadata: response.metadata,
        })
    }
    pub async fn edit_message(
        &self,
        session: &str,
        chat: &str,
        id: &str,
        body: &EditMessageRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessResponse>> {
        self.0
            .request(
                Method::PUT,
                &message_path(session, chat, id),
                &[],
                Some(body),
                options.idempotent(),
            )
            .await
    }
    pub async fn delete_message(
        &self,
        session: &str,
        chat: &str,
        id: &str,
        transport: Option<MessageTransport>,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessResponse>> {
        let query = transport
            .map(|t| {
                vec![(
                    "transport",
                    serde_json::to_value(t)
                        .expect("enum is serializable")
                        .as_str()
                        .expect("string enum")
                        .into(),
                )]
            })
            .unwrap_or_default();
        self.0
            .request::<_, ()>(
                Method::DELETE,
                &message_path(session, chat, id),
                &query,
                None,
                options.idempotent(),
            )
            .await
    }
    pub async fn archive(
        &self,
        session: &str,
        chat: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessResponse>> {
        self.0
            .request::<_, ()>(
                Method::POST,
                &format!("{}/archive", chat_path(session, chat)),
                &[],
                None,
                options,
            )
            .await
    }
    pub async fn unarchive(
        &self,
        session: &str,
        chat: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessResponse>> {
        self.0
            .request::<_, ()>(
                Method::POST,
                &format!("{}/unarchive", chat_path(session, chat)),
                &[],
                None,
                options,
            )
            .await
    }
    pub async fn set_disappearing_timer(
        &self,
        session: &str,
        chat: &str,
        body: &crate::account::DisappearingTimerRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessResponse>> {
        self.0
            .request(
                Method::PUT,
                &format!("{}/disappearing", chat_path(session, chat)),
                &[],
                Some(body),
                options,
            )
            .await
    }
}
