//! Direct server passkey operations. No ceremony, polling, or automatic confirmation.
use crate::{
    models::SuccessEnvelope,
    transport::{encode, HttpTransport},
    ApiResponse, Error, ErrorKind, RequestOptions, Result,
};
use reqwest::Method;
use serde::{Deserialize, Serialize};
fn invalid(message: &str) -> Error {
    Error::local(ErrorKind::Validation, message, "invalid_parameter")
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IssuePasskeyChallenge {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub challenge_b64_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ttl_seconds: Option<i64>,
    /// Deprecated and ignored by the server; the runner owns this value.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user_verification: Option<String>,
    /// Deprecated and ignored by the server. Milliseconds.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timeout_ms: Option<u64>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PasskeyTicket {
    pub version: u8,
    pub ticket: String,
    pub session: String,
    pub rp_id: String,
    pub challenge_b64_url: String,
    pub user_verification: String,
    pub expires_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timeout_ms: Option<u64>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PasskeyAssertionResponse {
    pub authenticator_data_b64: String,
    #[serde(rename = "clientDataJSONB64")]
    pub client_data_json_b64: String,
    pub signature_b64: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user_handle_b64: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PasskeyAssertion {
    pub id: String,
    pub raw_id_b64_url: String,
    pub response: PasskeyAssertionResponse,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubmitPasskeyAssertion {
    pub ticket_id: String,
    pub assertion: PasskeyAssertion,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PasskeyAssertionResult {
    pub ok: bool,
    pub ticket: String,
    pub session: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfirmPasskey {
    pub ticket_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub code: Option<String>,
}
/// Known status values; unknown response strings remain available for forward compatibility.
pub const PASSKEY_STATUSES: [&str; 9] = [
    "none",
    "challenge_pending",
    "assertion_sending",
    "assertion_submitted",
    "code_available",
    "confirmation_sending",
    "waiting_for_pairing",
    "completed",
    "failed",
];
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PasskeyConfirmation {
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ticket_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub code: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", rename = "skipHandoffUX")]
    pub skip_handoff_ux: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}
pub struct Passkeys<'a>(pub(crate) &'a HttpTransport);
fn text(s: &str, max: usize) -> bool {
    !s.is_empty() && s.encode_utf16().count() <= max
}
impl Passkeys<'_> {
    fn path(&self, session: &str) -> Result<String> {
        self.0.server()?;
        if session.is_empty() {
            return Err(invalid("Provide a Number ID."));
        }
        Ok(format!("/messaging/{}/passkey", encode(session)))
    }
    async fn write<T: serde::de::DeserializeOwned, B: Serialize + ?Sized>(
        &self,
        path: String,
        body: &B,
        mut options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<T>>> {
        let bytes = serde_json::to_vec(body).map_err(|_| invalid("Invalid passkey JSON."))?;
        if bytes.len() > 1048576 {
            return Err(invalid("Passkey request exceeds 1 MiB."));
        }
        options.max_network_retries = Some(0);
        self.0
            .request(Method::POST, &path, &[], Some(body), options)
            .await
    }
    pub async fn issue_challenge(
        &self,
        session: &str,
        body: &IssuePasskeyChallenge,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<PasskeyTicket>>> {
        let path = self.path(session)?;
        if body
            .challenge_b64_url
            .as_ref()
            .is_some_and(|s| s.is_empty())
            || body.timeout_ms == Some(0)
            || body
                .user_verification
                .as_ref()
                .is_some_and(|s| !matches!(s.as_str(), "required" | "preferred" | "discouraged"))
        {
            return Err(invalid("Invalid challenge options."));
        }
        self.write(path + "/challenge", body, options).await
    }
    pub async fn get_challenge(
        &self,
        session: &str,
        ticket: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<PasskeyTicket>>> {
        let path = self.path(session)?;
        if ticket.is_empty() {
            return Err(invalid("Provide a ticket."));
        }
        self.0
            .request::<_, ()>(
                Method::GET,
                &format!("{path}/challenge/{}", encode(ticket)),
                &[],
                None,
                options,
            )
            .await
    }
    pub async fn submit_assertion(
        &self,
        session: &str,
        body: &SubmitPasskeyAssertion,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<PasskeyAssertionResult>>> {
        let path = self.path(session)?;
        let a = &body.assertion;
        let r = &a.response;
        if body.ticket_id.is_empty()
            || !text(&a.id, 1364)
            || !text(&a.raw_id_b64_url, 1364)
            || r.authenticator_data_b64.is_empty()
            || r.client_data_json_b64.is_empty()
            || r.signature_b64.is_empty()
            || r.user_handle_b64
                .as_ref()
                .is_some_and(|s| s.encode_utf16().count() > 86)
        {
            return Err(invalid("Provide the ticket and bounded assertion."));
        }
        self.write(path + "/assertion", body, options).await
    }
    pub async fn get_confirmation(
        &self,
        session: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<PasskeyConfirmation>>> {
        self.0
            .request::<_, ()>(
                Method::GET,
                &(self.path(session)? + "/confirmation"),
                &[],
                None,
                options,
            )
            .await
    }
    pub async fn confirm(
        &self,
        session: &str,
        body: &ConfirmPasskey,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<PasskeyConfirmation>>> {
        let path = self.path(session)?;
        if body.ticket_id.is_empty()
            || body.code.as_ref().is_some_and(|s| {
                s.len() != 9
                    || s.as_bytes()[4] != b'-'
                    || s.bytes()
                        .enumerate()
                        .any(|(i, c)| i != 4 && !c.is_ascii_uppercase() && !c.is_ascii_digit())
            })
        {
            return Err(invalid(
                "Provide the ticket and optional confirmation code.",
            ));
        }
        self.write(path + "/confirmation", body, options).await
    }
}
