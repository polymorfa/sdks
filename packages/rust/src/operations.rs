//! Durable Platform operations. A successful admission is not runtime completion.
use crate::{
    developer::query,
    models::{query_pairs, DataEnvelope, IdempotencyReceipt, QueryPrimitive, QueryValue},
    pagination::CursorPage,
    transport::{configuration, encode, HttpTransport},
    ApiResponse, RequestOptions, Result,
};
use reqwest::Method;
use serde::{Deserialize, Serialize};
use std::{collections::BTreeMap, time::Duration};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct OperationProgress {
    pub code: String,
    pub current: Option<u64>,
    pub total: Option<u64>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct OperationError {
    pub code: String,
    pub retryable: bool,
    pub details: Option<BTreeMap<String, serde_json::Value>>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct OperationActionRequired {
    pub code: String,
    pub details: Option<BTreeMap<String, serde_json::Value>>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct OperationResource {
    #[serde(rename = "type")]
    pub resource_type: String,
    pub id: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct OperationCapabilities {
    pub cancellable: bool,
    pub watchable: bool,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Operation {
    pub id: String,
    pub organization_id: String,
    pub project_id: Option<String>,
    pub kind: String,
    pub resource: OperationResource,
    pub status: String,
    pub sequence: u64,
    pub capabilities: OperationCapabilities,
    pub progress: Option<OperationProgress>,
    pub result: serde_json::Value,
    pub error: Option<OperationError>,
    pub action_required: Option<OperationActionRequired>,
    pub created_at: String,
    pub updated_at: String,
    pub completed_at: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OperationSnapshot {
    pub progress: Option<OperationProgress>,
    pub error: Option<OperationError>,
    pub action_required: Option<OperationActionRequired>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OperationTransition {
    pub operation_id: String,
    pub sequence: u64,
    pub from_status: Option<String>,
    pub to_status: String,
    pub reason_code: Option<String>,
    pub occurred_at: String,
    pub snapshot: OperationSnapshot,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OperationCancellationReceipt {
    pub operation: Operation,
    pub operation_id: String,
    pub idempotency: IdempotencyReceipt,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListOperationsParameters {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub kind: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub resource_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub resource_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub since: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub until: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub limit: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cursor: Option<String>,
    /// Organization reads only; use an immutable project view for project tokens.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub project_id: Option<String>,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RetrieveOperationParameters {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub wait: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub after_sequence: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub project_id: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(untagged)]
pub enum OperationTransitionPosition {
    AfterSequence {
        #[serde(rename = "afterSequence")]
        after_sequence: u64,
    },
    Cursor {
        cursor: String,
    },
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct ListOperationTransitionsParameters {
    #[serde(flatten, skip_serializing_if = "Option::is_none")]
    pub position: Option<OperationTransitionPosition>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub limit: Option<u32>,
}
#[derive(Clone, Default)]
pub struct WaitForOperationOptions {
    pub max_wait: Option<Duration>,
    pub after_sequence: Option<u64>,
    pub project_id: Option<String>,
    pub request_options: RequestOptions,
}
pub struct Operations<'a> {
    pub(crate) http: &'a HttpTransport,
    pub(crate) prefix: String,
}
impl Operations<'_> {
    fn project_filter(&self, project_id: Option<&String>) -> Result<()> {
        if self.prefix != "/platform" && project_id.is_some() {
            return Err(configuration(
                "project_id: already bound in the project path",
            ));
        }
        Ok(())
    }
    pub async fn list(
        &self,
        parameters: &ListOperationsParameters,
        options: RequestOptions,
    ) -> Result<CursorPage<Operation>> {
        self.project_filter(parameters.project_id.as_ref())?;
        CursorPage::load(
            self.http.clone(),
            format!("{}/operations", self.prefix),
            query(parameters)?,
            options,
        )
        .await
    }
    pub async fn get(
        &self,
        id: &str,
        parameters: &RetrieveOperationParameters,
        mut options: RequestOptions,
    ) -> Result<ApiResponse<Operation>> {
        self.project_filter(parameters.project_id.as_ref())?;
        let wait = parameters.wait.unwrap_or(0);
        if wait > 30 {
            return Err(configuration("wait: must be between 0 and 30 seconds"));
        }
        if wait > 0 && options.timeout.is_none() {
            options.timeout = Some(Duration::from_secs(u64::from(wait) + 15));
        }
        // These sequence fields are uint64; serialize decimal strings when they
        // exceed i64, preserving the wire query without a float conversion.
        let mut parameters_query = query(&RetrieveOperationParameters {
            after_sequence: None,
            ..parameters.clone()
        })?;
        if let Some(sequence) = parameters.after_sequence {
            parameters_query.insert(
                "afterSequence".into(),
                QueryValue::One(QueryPrimitive::String(sequence.to_string())),
            );
        }
        let pairs = query_pairs(&parameters_query)?;
        let response: ApiResponse<DataEnvelope<Operation>> = self
            .http
            .request::<_, ()>(Method::GET, &self.path(id), &pairs, None, options)
            .await?;
        Ok(ApiResponse {
            data: response.data.data,
            metadata: response.metadata,
        })
    }
    pub async fn list_transitions(
        &self,
        id: &str,
        parameters: &ListOperationTransitionsParameters,
        options: RequestOptions,
    ) -> Result<CursorPage<OperationTransition>> {
        let mut parameters_query = query(&ListOperationTransitionsParameters {
            position: None,
            limit: parameters.limit,
        })?;
        match &parameters.position {
            Some(OperationTransitionPosition::AfterSequence { after_sequence }) => {
                parameters_query.insert("afterSequence".into(), after_sequence.to_string().into());
            }
            Some(OperationTransitionPosition::Cursor { cursor }) => {
                parameters_query.insert("cursor".into(), cursor.clone().into());
            }
            None => {}
        }
        CursorPage::load(
            self.http.clone(),
            format!("{}/transitions", self.path(id)),
            parameters_query,
            options,
        )
        .await
    }
    pub async fn cancel(
        &self,
        id: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<OperationCancellationReceipt>> {
        crate::developer::request::<_, ()>(
            self.http,
            Method::POST,
            &format!("{}/cancel", self.path(id)),
            None,
            options.idempotent(),
        )
        .await
    }
    /// Return the latest state when terminal, after the requested sequence, or
    /// when the wait budget ends. Cancellation remains an error.
    pub async fn wait(
        &self,
        id: &str,
        options: WaitForOperationOptions,
    ) -> Result<ApiResponse<Operation>> {
        self.project_filter(options.project_id.as_ref())?;
        let budget = options.max_wait.unwrap_or(Duration::from_secs(300));
        let started = tokio::time::Instant::now();
        let mut latest = None;
        loop {
            if options
                .request_options
                .cancellation
                .as_ref()
                .is_some_and(|token| token.is_cancelled())
            {
                return Err(crate::transport::cancelled());
            }
            let remaining = budget.saturating_sub(started.elapsed());
            let wait = remaining.as_secs().min(30) as u32;
            let parameters = RetrieveOperationParameters {
                wait: Some(wait),
                after_sequence: options.after_sequence,
                project_id: options.project_id.clone(),
            };
            let response = match tokio::time::timeout(
                remaining.max(Duration::from_secs(1)),
                self.get(id, &parameters, options.request_options.clone()),
            )
            .await
            {
                Ok(response) => response?,
                Err(_) => {
                    return latest.ok_or_else(|| {
                        crate::Error::local(
                            crate::ErrorKind::Timeout,
                            "Operation wait exceeded its budget.",
                            "request_timeout",
                        )
                    })
                }
            };
            let stop = matches!(
                response.data.status.as_str(),
                "succeeded" | "failed" | "cancelled"
            ) || options
                .after_sequence
                .is_some_and(|sequence| response.data.sequence > sequence)
                || wait == 0
                || started.elapsed() >= budget;
            if stop {
                return Ok(response);
            }
            latest = Some(response);
        }
    }
    fn path(&self, id: &str) -> String {
        format!("{}/operations/{}", self.prefix, encode(id))
    }
}
