//! Credential-free liveness, readiness and API version probes.
use crate::{transport::HttpTransport, ApiResponse, ClientOptions, RequestOptions, Result};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct StatusResponse {
    pub status: String,
    pub uptime: String,
    pub version: String,
    pub env: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VersionResponse {
    pub version: String,
    pub build_time: String,
    pub env: String,
    pub api_version: String,
    pub min_supported_version: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct HealthCheck {
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct HealthResponse {
    pub status: String,
    pub checks: BTreeMap<String, HealthCheck>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PingResponse {
    pub status: String,
}
#[derive(Clone)]
pub struct SystemClient {
    http: HttpTransport,
}
impl SystemClient {
    pub fn new(options: ClientOptions) -> Result<Self> {
        Ok(Self {
            http: HttpTransport::without_credentials(options)?,
        })
    }
    pub async fn status(&self, options: RequestOptions) -> Result<ApiResponse<StatusResponse>> {
        self.http.get("/messaging/info/status", options).await
    }
    pub async fn version(&self, options: RequestOptions) -> Result<ApiResponse<VersionResponse>> {
        self.http.get("/messaging/info/version", options).await
    }
    pub async fn health(&self, options: RequestOptions) -> Result<ApiResponse<HealthResponse>> {
        self.http.get("/health", options).await
    }
    pub async fn ping(&self, options: RequestOptions) -> Result<ApiResponse<PingResponse>> {
        self.http.get("/ping", options).await
    }
}
