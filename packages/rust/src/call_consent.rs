//! Organization-wide call policy and do-not-call list.
use crate::{
    models::{DataEnvelope, Query},
    pagination::CursorPage,
    transport::{configuration, encode, HttpTransport},
    ApiResponse, Error, ErrorKind, RequestOptions, Result,
};
use reqwest::Method;
use serde::{Deserialize, Serialize};
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CallPolicy {
    pub blocked_country_codes: Vec<String>,
    pub opt_out_count: u64,
    pub revision: u64,
    pub updated_at: Option<String>,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCallPolicyRequest {
    pub blocked_country_codes: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expected_revision: Option<u64>,
}
#[derive(Clone, Copy, Debug, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CallOptOutSource {
    Api,
    Console,
    Import,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CallOptOut {
    pub id: String,
    pub phone_number: Option<String>,
    pub bsuid: Option<String>,
    pub note: Option<String>,
    pub source: CallOptOutSource,
    pub created_at: String,
}
#[derive(Clone, Debug, Default)]
pub struct ListCallOptOutsParameters {
    pub limit: Option<u32>,
    pub cursor: Option<String>,
    pub phone_number: Option<String>,
    pub bsuid: Option<String>,
}
#[derive(Clone, Debug, Serialize)]
#[serde(untagged)]
pub enum CreateCallOptOutRequest {
    Phone {
        #[serde(rename = "phoneNumber")]
        phone_number: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        note: Option<String>,
    },
    Bsuid {
        bsuid: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        note: Option<String>,
    },
}
#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CallOptOutImportEntry {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub phone_number: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bsuid: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
}
#[derive(Clone, Debug, Serialize)]
pub struct ImportCallOptOutsRequest {
    pub entries: Vec<CallOptOutImportEntry>,
}
#[derive(Clone, Copy, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CallOptOutRejectionReason {
    InvalidPhoneNumber,
    InvalidBsuid,
    MissingIdentifier,
    MultipleIdentifiers,
    InvalidNote,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CallOptOutRejectedEntry {
    pub index: u32,
    pub reason: CallOptOutRejectionReason,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CallOptOutImportResult {
    pub added: u64,
    pub existing: u64,
    pub rejected: Vec<CallOptOutRejectedEntry>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CallOptOutDeleted {
    pub id: String,
    pub deleted: bool,
}
pub struct CallPolicyResource<'a>(pub(crate) &'a HttpTransport);
pub struct CallOptOuts<'a>(pub(crate) &'a HttpTransport);
fn invalid(message: &str) -> Error {
    Error::local(ErrorKind::Validation, message, "invalid_call_policy")
}
impl CallPolicyResource<'_> {
    pub async fn retrieve(&self, options: RequestOptions) -> Result<ApiResponse<CallPolicy>> {
        let result: ApiResponse<DataEnvelope<CallPolicy>> =
            self.0.get("/platform/call-policy", options).await?;
        Ok(ApiResponse {
            data: result.data.data,
            metadata: result.metadata,
        })
    }
    pub async fn update(
        &self,
        body: &UpdateCallPolicyRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<CallPolicy>> {
        if body.blocked_country_codes.len() > 300
            || body.blocked_country_codes.iter().any(|c| {
                !(1..=4).contains(&c.len())
                    || !c.starts_with(['1', '2', '3', '4', '5', '6', '7', '8', '9'])
                    || !c.bytes().all(|v| v.is_ascii_digit())
            })
        {
            return Err(invalid(
                "Each blocked country code is 1 to 4 digits without +; at most 300 codes",
            ));
        }
        if body
            .expected_revision
            .is_some_and(|v| v > 9_007_199_254_740_991)
        {
            return Err(invalid(
                "expectedRevision must be a non-negative safe integer",
            ));
        }
        let result: ApiResponse<DataEnvelope<CallPolicy>> = self
            .0
            .request(
                Method::PUT,
                "/platform/call-policy",
                &[],
                Some(body),
                options,
            )
            .await?;
        Ok(ApiResponse {
            data: result.data.data,
            metadata: result.metadata,
        })
    }
}
impl CallOptOuts<'_> {
    pub async fn list(
        &self,
        params: &ListCallOptOutsParameters,
        options: RequestOptions,
    ) -> Result<CursorPage<CallOptOut>> {
        if params.phone_number.is_some() && params.bsuid.is_some() {
            return Err(invalid("Filter by phoneNumber or bsuid, not both"));
        }
        let mut query = Query::new();
        if let Some(v) = params.limit {
            query.insert("limit".into(), (v as i64).into());
        }
        for (k, v) in [
            ("cursor", &params.cursor),
            ("phoneNumber", &params.phone_number),
            ("bsuid", &params.bsuid),
        ] {
            if let Some(v) = v {
                query.insert(k.into(), v.clone().into());
            }
        }
        CursorPage::load(
            self.0.clone(),
            "/platform/call-opt-outs".into(),
            query,
            options,
        )
        .await
    }
    pub async fn create(
        &self,
        body: &CreateCallOptOutRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<CallOptOut>> {
        let identifier = match body {
            CreateCallOptOutRequest::Phone { phone_number, .. } => phone_number,
            CreateCallOptOutRequest::Bsuid { bsuid, .. } => bsuid,
        };
        if identifier.is_empty() {
            return Err(invalid("Supply one nonempty phoneNumber or bsuid"));
        }
        let result: ApiResponse<DataEnvelope<CallOptOut>> = self
            .0
            .request(
                Method::POST,
                "/platform/call-opt-outs",
                &[],
                Some(body),
                options,
            )
            .await?;
        Ok(ApiResponse {
            data: result.data.data,
            metadata: result.metadata,
        })
    }
    pub async fn import(
        &self,
        body: &ImportCallOptOutsRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<CallOptOutImportResult>> {
        if !(1..=5000).contains(&body.entries.len()) {
            return Err(invalid("entries must hold 1 to 5000 entries"));
        }
        let result: ApiResponse<DataEnvelope<CallOptOutImportResult>> = self
            .0
            .request(
                Method::POST,
                "/platform/call-opt-outs/import",
                &[],
                Some(body),
                options,
            )
            .await?;
        Ok(ApiResponse {
            data: result.data.data,
            metadata: result.metadata,
        })
    }
    pub async fn delete(
        &self,
        id: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<CallOptOutDeleted>> {
        if id.trim().is_empty() {
            return Err(configuration("A call opt-out id is required"));
        }
        let result: ApiResponse<DataEnvelope<CallOptOutDeleted>> = self
            .0
            .request::<_, ()>(
                Method::DELETE,
                &format!("/platform/call-opt-outs/{}", encode(id)),
                &[],
                None,
                options,
            )
            .await?;
        Ok(ApiResponse {
            data: result.data.data,
            metadata: result.metadata,
        })
    }
}
