//! Test-number account modes. This operation is restricted to trusted servers.
pub use crate::webhook_payloads::WhatsAppAccountType;
use crate::{
    transport::{encode, HttpTransport},
    ApiResponse, RequestOptions, Result,
};
use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TestingPrimaryPlatform {
    Android,
    Ios,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ContactEncryption {
    EndToEnd,
    Hybrid,
    NotEndToEnd,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TestingAccountModeRequest {
    pub account_type: WhatsAppAccountType,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub primary_platform: Option<TestingPrimaryPlatform>,
}
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TestingAccountMode {
    pub session: String,
    pub account_type: WhatsAppAccountType,
    #[serde(deserialize_with = "crate::campaign_contracts::required_nullable")]
    pub primary_platform: Option<TestingPrimaryPlatform>,
    pub changed: bool,
    pub unlinked_devices: Vec<i64>,
}
pub(crate) fn validate(
    account: Option<&WhatsAppAccountType>,
    platform: Option<&TestingPrimaryPlatform>,
) -> Result<()> {
    if matches!(account, Some(WhatsAppAccountType::MetaCloud)) && platform.is_some() {
        return Err(crate::transport::configuration("primaryPlatform"));
    }
    Ok(())
}
impl crate::onboarding::Testing<'_> {
    pub async fn set_account_mode(
        &self,
        session: &str,
        input: &TestingAccountModeRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<TestingAccountMode>> {
        let http: &HttpTransport = self.0;
        http.server()?;
        crate::campaign_contract_validation::text(session, 1, 256, "session")?;
        validate(Some(&input.account_type), input.primary_platform.as_ref())?;
        let response: ApiResponse<TestingAccountMode> = http
            .request(
                reqwest::Method::PUT,
                &format!("/messaging/{}/phone/account-mode", encode(session)),
                &[],
                Some(input),
                options,
            )
            .await?;
        crate::onboarding::phone_response(response, 200, true)
    }
}
