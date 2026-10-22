//! Organization suppression, media upload metadata and session ban evidence.
use crate::{
    models::DataEnvelope,
    transport::{encode, HttpTransport},
    ApiResponse, RequestOptions, Result,
};
use reqwest::Method;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
/// An explicitly open JSON object in the pinned TS legacy resource contract.
pub type PlatformPayload = BTreeMap<String, serde_json::Value>;
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OptOutSettings {
    pub enabled: bool,
    pub opt_out_keywords: Vec<String>,
    pub opt_in_keywords: Vec<String>,
    pub updated_at: Option<u64>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateOptOutSettingsRequest {
    pub enabled: bool,
    pub opt_out_keywords: Vec<String>,
    pub opt_in_keywords: Vec<String>,
}
#[derive(Clone, Copy, Debug, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SessionBanStatus {
    Active,
    Lifted,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionBan {
    pub id: String,
    pub session_name: String,
    pub ban_code: Option<u32>,
    pub ban_reason: Option<String>,
    pub ban_expires_at: Option<u64>,
    pub occurred_at: u64,
    pub status: SessionBanStatus,
}
pub struct OptOuts<'a>(pub(crate) &'a HttpTransport);
pub struct PlatformMedia<'a>(pub(crate) &'a HttpTransport);
pub struct SessionBans<'a>(pub(crate) &'a HttpTransport);
impl OptOuts<'_> {
    pub async fn list(
        &self,
        options: RequestOptions,
    ) -> Result<ApiResponse<DataEnvelope<PlatformPayload>>> {
        self.0.get("/platform/optouts", options).await
    }
    pub async fn create(
        &self,
        body: Option<&PlatformPayload>,
        options: RequestOptions,
    ) -> Result<ApiResponse<DataEnvelope<PlatformPayload>>> {
        self.0
            .request(Method::POST, "/platform/optouts", &[], body, options)
            .await
    }
    pub async fn create_batch(
        &self,
        body: Option<&PlatformPayload>,
        options: RequestOptions,
    ) -> Result<ApiResponse<DataEnvelope<PlatformPayload>>> {
        self.0
            .request(Method::POST, "/platform/optouts/batch", &[], body, options)
            .await
    }
    pub async fn delete(
        &self,
        phone: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<DataEnvelope<PlatformPayload>>> {
        self.0
            .request::<_, ()>(
                Method::DELETE,
                &format!("/platform/optouts/{}", encode(phone)),
                &[],
                None,
                options,
            )
            .await
    }
    pub async fn get_settings(
        &self,
        options: RequestOptions,
    ) -> Result<ApiResponse<DataEnvelope<OptOutSettings>>> {
        self.0.get("/platform/optouts/settings", options).await
    }
    pub async fn update_settings(
        &self,
        body: &UpdateOptOutSettingsRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<DataEnvelope<OptOutSettings>>> {
        self.0
            .request(
                Method::PUT,
                "/platform/optouts/settings",
                &[],
                Some(body),
                options,
            )
            .await
    }
}
impl PlatformMedia<'_> {
    pub async fn retrieve(
        &self,
        id: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<DataEnvelope<PlatformPayload>>> {
        self.0
            .get(&format!("/platform/media/{}", encode(id)), options)
            .await
    }
    pub async fn delete(
        &self,
        id: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<DataEnvelope<PlatformPayload>>> {
        self.0
            .request::<_, ()>(
                Method::DELETE,
                &format!("/platform/media/{}", encode(id)),
                &[],
                None,
                options,
            )
            .await
    }
    pub async fn create_upload(
        &self,
        body: Option<&PlatformPayload>,
        options: RequestOptions,
    ) -> Result<ApiResponse<DataEnvelope<PlatformPayload>>> {
        self.0
            .request(Method::POST, "/platform/media/uploads", &[], body, options)
            .await
    }
}
impl SessionBans<'_> {
    pub async fn list(
        &self,
        options: RequestOptions,
    ) -> Result<ApiResponse<DataEnvelope<Vec<SessionBan>>>> {
        self.0.get("/platform/bans", options).await
    }
    pub async fn list_active(
        &self,
        options: RequestOptions,
    ) -> Result<ApiResponse<DataEnvelope<Vec<SessionBan>>>> {
        self.0.get("/platform/bans/active", options).await
    }
}
