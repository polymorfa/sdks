//! Platform webhook management and delivery evidence for immutable owner scopes.
use crate::{
    models::{
        DataEnvelope, EncodedEventPayload, EventReplayReceipt, IdempotencyReceipt, Query,
        QueryPrimitive, QueryValue,
    },
    pagination::CursorPage,
    transport::{configuration, encode, HttpTransport},
    ApiResponse, RequestOptions, Result,
};
use reqwest::Method;
use serde::{de::DeserializeOwned, Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WebhookRetryPolicy {
    pub maximum_attempts: u32,
    pub backoff: String,
    pub initial_delay_seconds: u32,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct WebhookHeader {
    pub name: String,
    pub value: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct WebhookHeaderMetadata {
    pub name: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WebhookSigningSecretMetadata {
    pub version: u64,
    pub created_at: String,
    pub previous_valid_until: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlatformWebhook {
    pub id: String,
    pub organization_id: String,
    pub owner: String,
    pub project_id: Option<String>,
    pub url: String,
    pub event_types: Vec<String>,
    pub enabled: bool,
    pub format: String,
    pub retry_policy: WebhookRetryPolicy,
    pub headers: Vec<WebhookHeaderMetadata>,
    pub secret: WebhookSigningSecretMetadata,
    pub created_at: String,
    pub updated_at: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateWebhookRequest {
    pub url: String,
    pub event_types: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub enabled: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub format: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub retry_policy: Option<WebhookRetryPolicy>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub headers: Option<Vec<WebhookHeader>>,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateWebhookRequest {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub event_types: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub enabled: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub format: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub retry_policy: Option<WebhookRetryPolicy>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub headers: Option<Vec<WebhookHeader>>,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListWebhooksParameters {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub event_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub enabled: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub limit: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cursor: Option<String>,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RotateWebhookSecretRequest {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub overlap_seconds: Option<u32>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(untagged)]
pub enum TestWebhookRequest {
    Custom {
        body: EncodedEventPayload,
        #[serde(rename = "sessionId")]
        session_id: String,
        #[serde(rename = "eventType", skip_serializing_if = "Option::is_none")]
        event_type: Option<String>,
    },
    Fixture {
        #[serde(rename = "eventType", skip_serializing_if = "Option::is_none")]
        event_type: Option<String>,
    },
}
impl Default for TestWebhookRequest {
    fn default() -> Self {
        Self::Fixture { event_type: None }
    }
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WebhookCreationReceipt {
    pub webhook: PlatformWebhook,
    pub operation_id: Option<String>,
    pub idempotency: IdempotencyReceipt,
    pub secret: Option<String>,
    pub secret_available: bool,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WebhookMutationReceipt {
    pub webhook: PlatformWebhook,
    pub operation_id: Option<String>,
    pub idempotency: IdempotencyReceipt,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WebhookDeletionReceipt {
    pub webhook_id: String,
    pub deleted: bool,
    pub operation_id: Option<String>,
    pub idempotency: IdempotencyReceipt,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WebhookSecretRotationReceipt {
    pub webhook_id: String,
    pub operation_id: Option<String>,
    pub secret: Option<String>,
    pub secret_available: bool,
    pub secret_metadata: WebhookSigningSecretMetadata,
    pub idempotency: IdempotencyReceipt,
}
pub struct PlatformWebhooks<'a> {
    pub(crate) http: &'a HttpTransport,
    pub(crate) prefix: String,
}
impl PlatformWebhooks<'_> {
    pub async fn list(
        &self,
        parameters: &ListWebhooksParameters,
        options: RequestOptions,
    ) -> Result<CursorPage<PlatformWebhook>> {
        CursorPage::load(
            self.http.clone(),
            format!("{}/webhooks", self.prefix),
            query(parameters)?,
            options,
        )
        .await
    }
    pub async fn retrieve(
        &self,
        id: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<PlatformWebhook>> {
        request::<_, ()>(self.http, Method::GET, &self.path(id), None, options).await
    }
    pub async fn create(
        &self,
        body: &CreateWebhookRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<WebhookCreationReceipt>> {
        request(
            self.http,
            Method::POST,
            &format!("{}/webhooks", self.prefix),
            Some(body),
            options,
        )
        .await
    }
    pub async fn update(
        &self,
        id: &str,
        body: &UpdateWebhookRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<WebhookMutationReceipt>> {
        request(
            self.http,
            Method::PATCH,
            &self.path(id),
            Some(body),
            options,
        )
        .await
    }
    pub async fn delete(
        &self,
        id: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<WebhookDeletionReceipt>> {
        request::<_, ()>(self.http, Method::DELETE, &self.path(id), None, options).await
    }
    pub async fn test(
        &self,
        id: &str,
        body: &TestWebhookRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<EventReplayReceipt>> {
        if self.prefix == "/platform" && matches!(body, TestWebhookRequest::Custom { .. }) {
            return Err(configuration(
                "organization webhook test: custom body unavailable",
            ));
        }
        request(
            self.http,
            Method::POST,
            &format!("{}/tests", self.path(id)),
            Some(body),
            options,
        )
        .await
    }
    pub async fn rotate_secret(
        &self,
        id: &str,
        body: &RotateWebhookSecretRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<WebhookSecretRotationReceipt>> {
        request(
            self.http,
            Method::POST,
            &format!("{}/secret-rotations", self.path(id)),
            Some(body),
            options,
        )
        .await
    }
    fn path(&self, id: &str) -> String {
        format!("{}/webhooks/{}", self.prefix, encode(id))
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct DeliveryCapabilities {
    pub retryable: bool,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeliveryOutcome {
    pub status_code: Option<u16>,
    pub error_code: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WebhookDelivery {
    pub id: String,
    pub organization_id: String,
    pub project_id: Option<String>,
    pub event_id: String,
    pub webhook_id: String,
    pub status: String,
    pub attempt_count: u64,
    pub capabilities: DeliveryCapabilities,
    pub payload_availability: String,
    pub replayable_until: Option<String>,
    pub metadata_expires_at: String,
    pub next_attempt_at: Option<String>,
    pub last_attempt_at: Option<String>,
    pub completed_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub last_outcome: Option<DeliveryOutcome>,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListDeliveriesParameters {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub webhook_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub event_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub since: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub until: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub limit: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cursor: Option<String>,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct ListDeliveryAttemptsParameters {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub limit: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cursor: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeliveryAttemptResponse {
    pub content_type: String,
    pub excerpt: String,
    pub truncated: bool,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WebhookDeliveryAttempt {
    pub id: String,
    pub organization_id: String,
    pub project_id: Option<String>,
    pub delivery_id: String,
    pub number: u32,
    pub status: String,
    pub started_at: Option<String>,
    pub completed_at: Option<String>,
    pub next_retry_at: Option<String>,
    pub duration_ms: Option<u64>,
    pub status_code: Option<u16>,
    pub error_code: Option<String>,
    pub response: Option<DeliveryAttemptResponse>,
    pub metadata_expires_at: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeliveryRetryReceipt {
    pub delivery_id: String,
    pub attempt_id: String,
    pub operation_id: String,
    pub idempotency: IdempotencyReceipt,
}
pub struct WebhookDeliveries<'a> {
    pub(crate) http: &'a HttpTransport,
    pub(crate) prefix: String,
}
impl WebhookDeliveries<'_> {
    pub async fn list(
        &self,
        parameters: &ListDeliveriesParameters,
        options: RequestOptions,
    ) -> Result<CursorPage<WebhookDelivery>> {
        CursorPage::load(
            self.http.clone(),
            format!("{}/webhook-deliveries", self.prefix),
            query(parameters)?,
            options,
        )
        .await
    }
    pub async fn retrieve(
        &self,
        id: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<WebhookDelivery>> {
        request::<_, ()>(self.http, Method::GET, &self.path(id), None, options).await
    }
    pub async fn list_attempts(
        &self,
        id: &str,
        parameters: &ListDeliveryAttemptsParameters,
        options: RequestOptions,
    ) -> Result<CursorPage<WebhookDeliveryAttempt>> {
        CursorPage::load(
            self.http.clone(),
            format!("{}/attempts", self.path(id)),
            query(parameters)?,
            options,
        )
        .await
    }
    pub async fn retrieve_attempt(
        &self,
        id: &str,
        attempt_id: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<WebhookDeliveryAttempt>> {
        request::<_, ()>(
            self.http,
            Method::GET,
            &format!("{}/attempts/{}", self.path(id), encode(attempt_id)),
            None,
            options,
        )
        .await
    }
    pub async fn retry(
        &self,
        id: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<DeliveryRetryReceipt>> {
        request(
            self.http,
            Method::POST,
            &format!("{}/retry", self.path(id)),
            Some(&std::collections::BTreeMap::<String, String>::new()),
            options,
        )
        .await
    }
    fn path(&self, id: &str) -> String {
        format!("{}/webhook-deliveries/{}", self.prefix, encode(id))
    }
}
pub(crate) async fn request<T: DeserializeOwned, B: Serialize>(
    http: &HttpTransport,
    method: Method,
    path: &str,
    body: Option<&B>,
    options: RequestOptions,
) -> Result<ApiResponse<T>> {
    let response: ApiResponse<DataEnvelope<T>> =
        http.request(method, path, &[], body, options).await?;
    Ok(ApiResponse {
        data: response.data.data,
        metadata: response.metadata,
    })
}
pub(crate) fn query<T: Serialize>(parameters: &T) -> Result<Query> {
    let value = serde_json::to_value(parameters).map_err(|_| configuration("parameters"))?;
    let mut query = Query::new();
    for (key, value) in value
        .as_object()
        .ok_or_else(|| configuration("parameters"))?
    {
        let primitive = match value {
            serde_json::Value::String(s) => QueryPrimitive::String(s.clone()),
            serde_json::Value::Bool(b) => QueryPrimitive::Boolean(*b),
            serde_json::Value::Number(n) => {
                QueryPrimitive::Integer(n.as_i64().ok_or_else(|| configuration("parameters"))?)
            }
            serde_json::Value::Null => continue,
            _ => return Err(configuration("parameters")),
        };
        query.insert(key.clone(), QueryValue::One(primitive));
    }
    Ok(query)
}
