//! Direct media/history endpoints from TS 254fc6a2d073e7fc79420cf95f9b03927d00c04a.
use crate::{
    media_encrypt::UploadMediaType,
    transport::{encode, HttpTransport},
    ApiResponse, Error, ErrorKind, RequestOptions, Result,
};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
#[derive(Clone)]
pub struct UploadGrant {
    pub hosts: Vec<String>,
    pub upload_url: String,
    pub auth: String,
    pub expires_at: chrono::DateTime<chrono::Utc>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UploadLocation {
    pub direct_path: String,
    pub url: String,
    pub handle: Option<String>,
}
#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum HistorySyncType {
    InitialBootstrap,
    InitialStatusV3,
    Full,
    Recent,
    PushName,
    NonBlockingData,
    OnDemand,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryChunkRetry {
    pub sync_type: HistorySyncType,
    pub chunk_order: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub chunk_message_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub regenerate: Option<bool>,
}
#[derive(Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryChunkRetryResult {
    pub request_id: Option<String>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryChunkDelete {
    pub direct_path: String,
    pub file_enc_sha256: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub enc_handle: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub companion_meta_nonce: Option<String>,
}
pub struct WhatsAppMediaResource<'a>(pub(crate) &'a HttpTransport);
pub struct HistorySyncResource<'a>(pub(crate) &'a HttpTransport);
pub const CUSTOMER_OWNED_API_VERSION: &str = "2026-10-14";
fn version(mut options: RequestOptions) -> RequestOptions {
    if options.api_version.is_none() {
        options.api_version = Some(CUSTOMER_OWNED_API_VERSION.into());
    }
    options
}
fn data(value: &Value) -> &Value {
    value.get("data").filter(|v| v.is_object()).unwrap_or(value)
}
fn invalid() -> Error {
    Error::local(
        ErrorKind::Server,
        "The API returned an invalid media/history response.",
        "invalid_response",
    )
}
fn upload_request(kind: UploadMediaType, hash: &[u8; 32]) -> Value {
    let mut body = json!({"type":kind.api_type(),"fileEncSha256":URL_SAFE_NO_PAD.encode(hash)});
    if matches!(kind, UploadMediaType::Audio | UploadMediaType::Ptt) {
        body["ptt"] = json!(kind == UploadMediaType::Ptt);
    }
    body
}
impl WhatsAppMediaResource<'_> {
    pub async fn create_upload_grant(
        &self,
        session: &str,
        kind: UploadMediaType,
        hash: &[u8; 32],
        options: RequestOptions,
    ) -> Result<UploadGrant> {
        let response: ApiResponse<Value> = self
            .0
            .request(
                reqwest::Method::POST,
                &format!("/messaging/{}/media/upload-grants", encode(session)),
                &[],
                Some(&upload_request(kind, hash)),
                version(options),
            )
            .await?;
        let value = data(&response.data);
        let url =
            url::Url::parse(value["uploadUrl"].as_str().unwrap_or("")).map_err(|_| invalid())?;
        let host = value["host"].as_str().ok_or_else(invalid)?;
        let auth = url
            .query_pairs()
            .find(|(k, _)| k == "auth")
            .map(|(_, v)| v.into_owned())
            .filter(|v| !v.is_empty())
            .ok_or_else(invalid)?;
        if !crate::media::is_whatsapp_media_url(url.as_str()) || url.host_str() != Some(host) {
            return Err(invalid());
        }
        let expiry = value["expiresAt"]
            .as_i64()
            .filter(|v| *v > 0)
            .and_then(|v| chrono::DateTime::from_timestamp(v, 0))
            .ok_or_else(invalid)?;
        // The grant must name the exact media/hash requested before any bytes leave the process.
        let token = URL_SAFE_NO_PAD.encode(hash);
        if url.path() != format!("{}/{}", kind.upload_path(), token) {
            return Err(invalid());
        }
        Ok(UploadGrant {
            hosts: vec![host.into()],
            upload_url: url.into(),
            auth,
            expires_at: expiry,
        })
    }
    pub async fn relay_upload(
        &self,
        session: &str,
        kind: UploadMediaType,
        hash: &[u8; 32],
        body: reqwest::Body,
        length: u64,
        options: RequestOptions,
    ) -> Result<UploadLocation> {
        let mut query = vec![
            ("type", kind.api_type().into()),
            ("fileEncSha256", URL_SAFE_NO_PAD.encode(hash)),
        ];
        if matches!(kind, UploadMediaType::Audio | UploadMediaType::Ptt) {
            query.push(("ptt", (kind == UploadMediaType::Ptt).to_string()));
        }
        let response: ApiResponse<Value> = self
            .0
            .request_binary(
                &format!("/messaging/{}/media/uploads", encode(session)),
                &query,
                body,
                length,
                version(options),
            )
            .await?;
        let result: UploadLocation =
            serde_json::from_value(data(&response.data).clone()).map_err(|_| invalid())?;
        if result.direct_path.is_empty() || result.url.is_empty() {
            return Err(invalid());
        }
        Ok(result)
    }
}
impl HistorySyncResource<'_> {
    pub async fn request_chunk_retry(
        &self,
        session: &str,
        request: &HistoryChunkRetry,
        options: RequestOptions,
    ) -> Result<HistoryChunkRetryResult> {
        let response: ApiResponse<Value> = self
            .0
            .request(
                reqwest::Method::POST,
                &format!("/messaging/{}/history/chunks/retry", encode(session)),
                &[],
                Some(request),
                version(options),
            )
            .await?;
        serde_json::from_value(data(&response.data).clone()).map_err(|_| invalid())
    }
    pub async fn delete_chunk(
        &self,
        session: &str,
        request: &HistoryChunkDelete,
        options: RequestOptions,
    ) -> Result<()> {
        self.0
            .request::<Value, _>(
                reqwest::Method::POST,
                &format!("/messaging/{}/history/media/delete", encode(session)),
                &[],
                Some(request),
                version(options),
            )
            .await?;
        Ok(())
    }
}
