//! Project request logs, cursor following, and cancellable polling.
use crate::{
    transport::{configuration, encode, HttpTransport},
    ApiResponse, Error, ErrorKind, RequestOptions, ResponseMetadata, Result,
};
use reqwest::Method;
use serde::{Deserialize, Serialize};
use std::time::{Duration, SystemTime};
#[derive(Clone, Copy, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RequestLogSource {
    Api,
    Mcp,
}
#[derive(Clone, Copy, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RequestLogCredentialType {
    TeamKey,
    ProjectToken,
    ClientToken,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RequestLogCredential {
    pub r#type: RequestLogCredentialType,
    pub id: Option<String>,
    pub last4: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RequestLog {
    pub id: String,
    pub project_id: String,
    pub created_at: String,
    pub method: String,
    pub route: String,
    pub status: Option<u16>,
    pub duration_ms: Option<f64>,
    pub result: RequestLogResult,
    pub source: RequestLogSource,
    pub request_id: Option<String>,
    pub trace_id: Option<String>,
    pub error_code: Option<String>,
    pub mcp_tool: Option<String>,
    pub credential: Option<RequestLogCredential>,
}
#[derive(Clone, Copy, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RequestLogResult {
    Success,
    Failure,
}
#[derive(Clone, Copy, Debug, Serialize)]
pub enum RequestLogMethod {
    GET,
    POST,
    PUT,
    PATCH,
    DELETE,
}
#[derive(Clone, Debug, Default)]
pub struct RequestLogFilters {
    pub status: Vec<String>,
    pub method: Vec<RequestLogMethod>,
    pub route: Option<String>,
    pub source: Option<RequestLogSource>,
    pub credential_id: Option<String>,
    pub request_id: Option<String>,
    pub trace_id: Option<String>,
    pub since: Option<String>,
    pub until: Option<String>,
}
impl RequestLogFilters {
    fn query(&self) -> Vec<(&'static str, String)> {
        let mut q = Vec::new();
        if !self.status.is_empty() {
            q.push(("status", self.status.join(",")));
        }
        if !self.method.is_empty() {
            q.push((
                "method",
                self.method
                    .iter()
                    .map(|m| {
                        serde_json::to_value(m)
                            .unwrap()
                            .as_str()
                            .unwrap()
                            .to_owned()
                    })
                    .collect::<Vec<_>>()
                    .join(","),
            ));
        }
        if let Some(source) = self.source {
            q.push((
                "source",
                serde_json::to_value(source)
                    .unwrap()
                    .as_str()
                    .unwrap()
                    .into(),
            ));
        }
        for (name, value) in [
            ("route", &self.route),
            ("credentialId", &self.credential_id),
            ("requestId", &self.request_id),
            ("traceId", &self.trace_id),
            ("since", &self.since),
            ("until", &self.until),
        ] {
            if let Some(value) = value {
                q.push((name, value.clone()));
            }
        }
        q
    }
}
#[derive(Clone, Debug, Default)]
pub struct ListRequestLogs {
    pub project_id: Option<String>,
    pub limit: Option<u32>,
    pub cursor: Option<String>,
    pub filters: RequestLogFilters,
}
#[derive(Clone, Debug)]
pub struct FollowRequestLogs {
    pub project_id: Option<String>,
    pub after: String,
    pub limit: Option<u32>,
}
#[derive(Clone, Debug)]
pub struct TailRequestLogs {
    pub project_id: Option<String>,
    pub filters: RequestLogFilters,
    pub interval: Duration,
    pub backfill: u32,
}
impl Default for TailRequestLogs {
    fn default() -> Self {
        Self {
            project_id: None,
            filters: Default::default(),
            interval: Duration::from_secs(2),
            backfill: 0,
        }
    }
}
#[derive(Clone, Debug)]
pub struct RequestLogPage {
    pub items: Vec<RequestLog>,
    pub has_more: bool,
    pub next_cursor: Option<String>,
    pub follow_cursor: String,
    pub metadata: ResponseMetadata,
}
#[derive(Clone)]
pub struct RequestLogs {
    pub(crate) http: HttpTransport,
    pub(crate) project_id: Option<String>,
}
impl RequestLogs {
    fn project<'a>(&'a self, selection: Option<&'a str>) -> Result<&'a str> {
        match self.project_id.as_deref() {
            Some(project) => {
                if selection.is_some_and(|s| s != project) {
                    return Err(Error::local(
                        ErrorKind::Validation,
                        "This client reads only its project's request log.",
                        "invalid_parameter",
                    ));
                }
                Ok(project)
            }
            None => selection
                .filter(|s| !s.is_empty())
                .ok_or_else(|| configuration("projectId")),
        }
    }
    pub async fn list(&self, p: &ListRequestLogs, o: RequestOptions) -> Result<RequestLogPage> {
        let mut q = p.filters.query();
        if p.cursor.is_some() && !q.is_empty() {
            return Err(Error::local(
                ErrorKind::Validation,
                "A request-log cursor cannot be combined with filters.",
                "invalid_parameter",
            ));
        }
        if let Some(cursor) = &p.cursor {
            q.push(("cursor", cursor.clone()));
        }
        if let Some(limit) = p.limit {
            q.push(("limit", limit.to_string()));
        }
        self.read(p.project_id.as_deref(), q, o).await
    }
    pub async fn follow(&self, p: &FollowRequestLogs, o: RequestOptions) -> Result<RequestLogPage> {
        let mut q = vec![("after", p.after.clone())];
        if let Some(limit) = p.limit {
            q.push(("limit", limit.to_string()));
        }
        self.read(p.project_id.as_deref(), q, o).await
    }
    async fn read(
        &self,
        project: Option<&str>,
        q: Vec<(&'static str, String)>,
        o: RequestOptions,
    ) -> Result<RequestLogPage> {
        let response: ApiResponse<serde_json::Value> = self
            .http
            .request::<_, ()>(
                Method::GET,
                &format!(
                    "/platform/projects/{}/request-logs",
                    encode(self.project(project)?)
                ),
                &q,
                None,
                o,
            )
            .await?;
        let body = &response.data;
        let page = &body["page"];
        let invalid = || {
            Error::local(
                ErrorKind::Server,
                "The API returned an invalid request log page.",
                "invalid_response",
            )
            .with_metadata(response.metadata.clone())
        };
        if !body["data"].is_array()
            || !page["hasMore"].is_boolean()
            || !page["followCursor"].is_string()
            || !(page
                .get("nextCursor")
                .is_some_and(|c| c.is_null() || c.is_string()))
        {
            return Err(invalid());
        }
        let items = serde_json::from_value(body["data"].clone()).map_err(|_| invalid())?;
        Ok(RequestLogPage {
            items,
            has_more: page["hasMore"].as_bool().unwrap(),
            next_cursor: page["nextCursor"].as_str().map(str::to_owned),
            follow_cursor: page["followCursor"].as_str().unwrap().into(),
            metadata: response.metadata,
        })
    }
    pub fn tail(
        &self,
        p: TailRequestLogs,
        o: RequestOptions,
    ) -> impl futures_util::Stream<Item = Result<RequestLog>> + Send + 'static {
        let resource = self.clone();
        async_stream::try_stream! {
         if p.interval<Duration::from_secs(1)||p.interval>Duration::from_secs(60)||p.backfill>100 {Err(Error::local(ErrorKind::Validation,"Polling interval must be 1 to 60 seconds and backfill 0 to 100.","invalid_parameter"))?;}
         let token=o.cancellation.clone().unwrap_or_default();let mut first=true;let mut after=String::new();
         loop {if token.is_cancelled(){break;}let page=loop {let result=if first {resource.list(&ListRequestLogs{project_id:p.project_id.clone(),limit:Some(p.backfill.max(1)),cursor:None,filters:p.filters.clone()},o.clone()).await}else{resource.follow(&FollowRequestLogs{project_id:p.project_id.clone(),after:after.clone(),limit:Some(100)},o.clone()).await};match result {Ok(page)=>break Some(page),Err(error)if token.is_cancelled()||error.kind==ErrorKind::Cancelled=>break None,Err(error)if error.kind==ErrorKind::RateLimit=>{let delay=request_log_retry_after(error.metadata.as_ref().and_then(|m|m.headers.get("retry-after")).map(String::as_str),SystemTime::now());tokio::select!{_=token.cancelled()=>break None,_=tokio::time::sleep(delay)=>{}}},Err(error)=>Err(error)?}};
          let Some(mut page)=page else{break;};after=page.follow_cursor;if first{if p.backfill>0 {page.items.reverse();for log in page.items {if token.is_cancelled(){break;}yield log;}}first=false;continue;}
          for log in page.items {if token.is_cancelled(){break;}yield log;}if !page.has_more {tokio::select!{_=token.cancelled()=>break,_=tokio::time::sleep(p.interval)=>{}}}
         }
        }
    }
}
/// A log follower's idle retry budget: five minutes maximum, sixty seconds default.
pub fn request_log_retry_after(header: Option<&str>, now: SystemTime) -> Duration {
    let value = header.map(str::trim);
    if let Some(value) = value {
        if !value.is_empty() && value.bytes().all(|b| b.is_ascii_digit()) {
            if let Ok(seconds) = value.parse::<u64>() {
                return Duration::from_secs(seconds.min(300));
            }
            return Duration::from_secs(300);
        }
        if let Ok(date) = httpdate::parse_http_date(value) {
            return date
                .duration_since(now)
                .unwrap_or_default()
                .min(Duration::from_secs(300));
        }
    }
    Duration::from_secs(60)
}
