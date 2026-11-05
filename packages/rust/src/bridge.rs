//! Project-token regional Bridge route discovery. This module implements no Signal protocol.
use crate::{
    transport::{configuration, HttpTransport},
    ApiResponse, ClientOptions, Credential, RequestOptions, Result,
};
use serde::{Deserialize, Serialize};
#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum BridgeRegion {
    BR,
    US,
    IN,
    Auto,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BridgeKind {
    Sandbox,
    Production,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BridgeSignal {
    Customer,
    Bartender,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BridgeTokenKind {
    Project,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BridgeRoute {
    pub ws_url: String,
    pub region: BridgeRegion,
    pub kind: BridgeKind,
    pub signal: BridgeSignal,
    pub token_kind: BridgeTokenKind,
    pub expires_at: u64,
}
#[derive(Clone)]
pub struct BridgeClient {
    http: HttpTransport,
}
impl BridgeClient {
    pub fn new(credential: Credential, options: ClientOptions) -> Result<Self> {
        if !matches!(credential, Credential::ProjectToken(_)) {
            return Err(configuration("BridgeClient requires a project token"));
        }
        Ok(Self {
            http: HttpTransport::new(credential, options)?,
        })
    }
    pub fn routes(&self) -> BridgeRoutes<'_> {
        BridgeRoutes(&self.http)
    }
}
pub struct BridgeRoutes<'a>(&'a HttpTransport);
impl BridgeRoutes<'_> {
    pub async fn resolve(&self, options: RequestOptions) -> Result<ApiResponse<BridgeRoute>> {
        self.0.get("/messaging/bridge/route", options).await
    }
}
