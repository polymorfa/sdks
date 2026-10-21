//! Direct media/history contracts at API f97ad78, reconciled with TS c9448b6.
use crate::{
    media_encrypt::UploadMediaType,
    transport::{encode, HttpTransport},
    ApiResponse, Error, ErrorKind, RequestOptions, Result,
};
use base64::{
    engine::{
        general_purpose::{GeneralPurpose, GeneralPurposeConfig, URL_SAFE_NO_PAD},
        DecodePaddingMode,
    },
    Engine as _,
};
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
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct HistoryChunkRetry {
    pub sync_type: HistorySyncType,
    pub chunk_order: u32,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "crate::campaign_contracts::optional_nonnull"
    )]
    pub chunk_message_id: Option<String>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "crate::campaign_contracts::optional_nonnull"
    )]
    pub regenerate: Option<bool>,
}
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryChunkRetryResult {
    pub request_id: String,
    pub status: HistoryChunkRetryStatus,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum HistoryChunkRetryStatus {
    #[serde(rename = "requested")]
    Requested,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct HistoryChunkDelete {
    pub direct_path: String,
    pub file_enc_sha256: String,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "crate::campaign_contracts::optional_nonnull"
    )]
    pub enc_handle: Option<String>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "crate::campaign_contracts::optional_nonnull"
    )]
    pub companion_meta_nonce: Option<String>,
}
pub struct WhatsAppMediaResource<'a>(pub(crate) &'a HttpTransport);
pub struct HistorySyncResource<'a>(pub(crate) &'a HttpTransport);
pub const CUSTOMER_OWNED_API_VERSION: &str = "2026-10-14";
fn version(mut options: RequestOptions) -> RequestOptions {
    // Held API routes have no replay ledger, even with a caller key.
    options.max_network_retries = Some(0);
    if options.api_version.is_none() {
        options.api_version = Some(CUSTOMER_OWNED_API_VERSION.into());
    }
    options
}
fn data(response: &ApiResponse<Value>) -> Result<&Value> {
    if response.metadata.status != 200 || response.data.get("success") != Some(&Value::Bool(true)) {
        return Err(invalid().with_metadata(response.metadata.clone()));
    }
    response
        .data
        .get("data")
        .filter(|v| v.is_object())
        .ok_or_else(|| invalid().with_metadata(response.metadata.clone()))
}
fn session_valid(session: &str) -> Result<()> {
    if session.is_empty() {
        Err(crate::transport::configuration("session"))
    } else {
        Ok(())
    }
}
fn token_valid(s: &str, max: usize, allowed: &str) -> bool {
    !s.is_empty()
        && s.len() <= max
        && s.bytes()
            .all(|b| b.is_ascii_alphanumeric() || allowed.as_bytes().contains(&b))
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
        self.0.server()?;
        session_valid(session)?;
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
        let value = data(&response)?;
        let url = url::Url::parse(value["uploadUrl"].as_str().unwrap_or(""))
            .map_err(|_| invalid().with_metadata(response.metadata.clone()))?;
        let host = value["host"]
            .as_str()
            .ok_or_else(|| invalid().with_metadata(response.metadata.clone()))?;
        let auth = url
            .query_pairs()
            .find(|(k, _)| k == "auth")
            .map(|(_, v)| v.into_owned())
            .filter(|v| !v.is_empty())
            .ok_or_else(|| invalid().with_metadata(response.metadata.clone()))?;
        if !crate::media::is_whatsapp_media_url(url.as_str()) || url.host_str() != Some(host) {
            return Err(invalid().with_metadata(response.metadata.clone()));
        }
        let expiry = value["expiresAt"]
            .as_i64()
            .filter(|v| *v > 0)
            .and_then(|v| chrono::DateTime::from_timestamp(v, 0))
            .ok_or_else(|| invalid().with_metadata(response.metadata.clone()))?;
        // The grant must name the exact media/hash requested before any bytes leave the process.
        let token = URL_SAFE_NO_PAD.encode(hash);
        if url.path() != format!("{}/{}", kind.upload_path(), token) {
            return Err(invalid().with_metadata(response.metadata.clone()));
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
        session_valid(session)?;
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
        let result: UploadLocation = serde_json::from_value(data(&response)?.clone())
            .map_err(|_| invalid().with_metadata(response.metadata.clone()))?;
        if result.direct_path.is_empty() || result.url.is_empty() {
            return Err(invalid().with_metadata(response.metadata));
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
        self.0.server()?;
        session_valid(session)?;
        if request
            .chunk_message_id
            .as_ref()
            .is_some_and(|s| !token_valid(s, 128, "._:-"))
        {
            return Err(crate::transport::configuration("chunkMessageId"));
        }
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
        let result: HistoryChunkRetryResult = serde_json::from_value(data(&response)?.clone())
            .map_err(|_| invalid().with_metadata(response.metadata.clone()))?;
        if result.request_id.is_empty() {
            return Err(invalid().with_metadata(response.metadata));
        }
        Ok(result)
    }
    pub async fn delete_chunk(
        &self,
        session: &str,
        request: &HistoryChunkDelete,
        options: RequestOptions,
    ) -> Result<()> {
        self.0.server()?;
        session_valid(session)?;
        let hash = &request.file_enc_sha256;
        // The producer permits nonzero unused padding bits. Validate the original alphabet and decoded length.
        let decoder = GeneralPurpose::new(
            &base64::alphabet::STANDARD,
            GeneralPurposeConfig::new()
                .with_decode_padding_mode(DecodePaddingMode::RequireCanonical)
                .with_decode_allow_trailing_bits(true),
        );
        if !request.direct_path.starts_with('/')
            || !token_valid(&request.direct_path[1..], 1023, "._~%/=&?+-")
            || !hash.is_ascii()
            || hash.len() != 44
            || !hash.ends_with('=')
            || !hash[..43]
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'+' | b'/'))
            || decoder.decode(hash).map_or(true, |v| v.len() != 32)
            || request
                .enc_handle
                .as_ref()
                .is_some_and(|s| !token_valid(s, 512, "._~%/=+-"))
            || request
                .companion_meta_nonce
                .as_ref()
                .is_some_and(|s| !token_valid(s, 512, "._~%/=+-"))
        {
            return Err(crate::transport::configuration("historyMedia"));
        }
        let response = self
            .0
            .request::<Value, _>(
                reqwest::Method::POST,
                &format!("/messaging/{}/history/media/delete", encode(session)),
                &[],
                Some(request),
                version(options),
            )
            .await?;
        if data(&response)?["status"] != "deleted" {
            return Err(invalid().with_metadata(response.metadata));
        }
        Ok(())
    }
}
