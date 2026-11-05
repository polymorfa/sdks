//! Stored call diagnostics, aggregate statistics and cursor-safe text exports.
use crate::{
    models::{query_pairs, DataEnvelope, Query},
    pagination::CursorPage,
    transport::{configuration, encode, HttpTransport},
    ApiResponse, Error, ErrorKind, RequestOptions, Result,
};
use futures_util::Stream;
use reqwest::Method;
use serde::{Deserialize, Serialize};
macro_rules! model {($name:ident {$($field:ident:$kind:ty),* $(,)?})=>{#[derive(Clone,Debug,Serialize,Deserialize)] #[serde(rename_all="camelCase")] pub struct $name {$(pub $field:$kind),*}};}
macro_rules! enumeration {($name:ident {$($variant:ident=>$value:literal),+})=>{#[derive(Clone,Copy,Debug,Serialize,Deserialize)] pub enum $name {$(#[serde(rename=$value)] $variant),+}};}
enumeration!(CallDirection {Inbound=>"inbound",Outbound=>"outbound"});
enumeration!(CallUpstream {LinkedDevice=>"linked_device",CloudApi=>"cloud_api"});
enumeration!(CallOutcome {Answered=>"answered",Missed=>"missed",Declined=>"declined",Failed=>"failed",InProgress=>"in_progress"});
enumeration!(CallRecordState {Offered=>"offered",Accepted=>"accepted",Rejected=>"rejected",Missed=>"missed",Ended=>"ended"});
enumeration!(StatsGroupBy {Day=>"day",Hour=>"hour",Session=>"session",Outcome=>"outcome"});
enumeration!(CallExportFormat {Csv=>"csv",Ndjson=>"ndjson"});
enumeration!(ParticipantState {Invited=>"invited",Ringing=>"ringing",Connected=>"connected",Left=>"left"});
enumeration!(ConnectionTransport {Webrtc=>"webrtc",Socket=>"socket",Sip=>"sip",Unknown=>"unknown"});
enumeration!(ConnectionReason {Left=>"left",Replaced=>"replaced",Claimed=>"claimed",CallEnded=>"call_ended",SipBusy=>"sip_busy",SipDeclined=>"sip_declined",SipNoAnswer=>"sip_no_answer",SipUnavailable=>"sip_unavailable",SipAuthFailed=>"sip_auth_failed"});
enumeration!(TelemetryStatus {Reported=>"reported",Unknown=>"unknown"});
enumeration!(TelemetrySource {MediaServer=>"media_server"});
enumeration!(CandidateType {Host=>"host",Srflx=>"srflx",Prflx=>"prflx",Relay=>"relay"});
enumeration!(AppReportsStatus {Reported=>"reported",None=>"none"});
model!(CallRecord {call_id:String,project_id:Option<String>,session_id:String,direction:CallDirection,upstream:CallUpstream,outcome:CallOutcome,state:CallRecordState,has_video:bool,peer_ref:Option<String>,started_at:String,connected_at:Option<String>,ended_at:Option<String>,duration_seconds:Option<f64>,end_reason:Option<String>});
model!(CallEndReason {
    code: String,
    label: String
});
model!(CallParticipant {id:String,state:ParticipantState,first_seen_at:String,updated_at:String,left_reason:Option<String>});
model!(CallConnection {id:String,participant:String,transport:ConnectionTransport,joined_at:Option<String>,left_at:Option<String>,reason:Option<ConnectionReason>});
model!(CallTelemetry {status:TelemetryStatus,source:TelemetrySource,setup_ms:Option<f64>,ring_ms:Option<f64>,codec:Option<String>,jitter_ms:Option<f64>,packets_lost:Option<u64>,rtt_ms:Option<f64>,received_kbps:Option<f64>,sent_kbps:Option<f64>});
model!(AppQuality {reported_at:String,rtt_ms:Option<f64>,jitter_ms:Option<f64>,packets_lost:Option<u64>,packets_received:Option<u64>,audio_codec:Option<String>,video_codec:Option<String>,candidate_type:Option<CandidateType>,reconnects:Option<u32>});
model!(AppError {
    code: String,
    reported_at: String
});
model!(AppConnection {connection_id:String,participant:String,client:Option<crate::voip::CallReportClient>,quality:Option<AppQuality>,errors:Vec<AppError>});
model!(AppReports {status:AppReportsStatus,connections:Vec<AppConnection>,truncated:bool});
model!(CallSummary {call_id:String,session_id:String,project_id:Option<String>,direction:CallDirection,state:CallRecordState,live:bool,backend:String,has_video:bool,peer_ref:Option<String>,started_at:String,connected_at:Option<String>,ended_at:Option<String>,duration_seconds:Option<f64>,end_reason:Option<CallEndReason>,answered_by:Option<String>,exclusive:Option<bool>});
model!(HistoryEvent {
    event_id: String,
    r#type: String,
    occurred_at: String
});
model!(CallHistory {events:Vec<HistoryEvent>,truncated:bool});
model!(CallCorrelation {
    call_id: String,
    session_id: String
});
model!(CallRecordDetail {call:CallSummary,participants:Vec<CallParticipant>,connections:Vec<CallConnection>,telemetry:CallTelemetry,app_reports:AppReports,history:CallHistory,correlation:CallCorrelation});
model!(CallStatsMetrics {calls:u64,answered:u64,missed:u64,declined:u64,failed:u64,in_progress:u64,answer_rate:Option<f64>,total_duration_seconds:f64,average_duration_seconds:Option<f64>});
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CallStatsGroup {
    #[serde(flatten)]
    pub metrics: CallStatsMetrics,
    pub key: String,
    pub start: Option<String>,
}
model!(HeatmapCell {
    day_of_week: u8,
    hour: u8,
    calls: u64,
    answered: u64
});
model!(CallStats {since:String,until:String,timezone:String,group_by:StatsGroupBy,totals:CallStatsMetrics,groups:Vec<CallStatsGroup>,groups_truncated:bool,heatmap:Vec<HeatmapCell>});
model!(CallExportPage {format:CallExportFormat,body:String,next_cursor:Option<String>});
#[derive(Clone, Debug, Default)]
pub struct CallFilters {
    pub project_id: Option<String>,
    pub session_id: Option<String>,
    pub direction: Option<CallDirection>,
    pub upstream: Option<CallUpstream>,
    pub outcome: Option<CallOutcome>,
    pub since: Option<String>,
    pub until: Option<String>,
}
#[derive(Clone, Debug, Default)]
pub struct CallStatsParameters {
    pub filters: CallFilters,
    pub group_by: Option<StatsGroupBy>,
    pub timezone: Option<String>,
}
#[derive(Clone, Debug, Default)]
pub struct ListCallRecordsParameters {
    pub filters: CallFilters,
    pub limit: Option<u32>,
    pub cursor: Option<String>,
}
#[derive(Clone, Debug, Default)]
pub struct ExportCallRecordsParameters {
    pub filters: CallFilters,
    pub format: Option<CallExportFormat>,
    pub limit: Option<u32>,
    pub cursor: Option<String>,
}
fn text(value: &str, max: usize) -> Result<()> {
    if value.trim().is_empty() || value.chars().count() > max {
        Err(configuration("call filter"))
    } else {
        Ok(())
    }
}
fn enum_value<T: Serialize>(v: T) -> String {
    serde_json::to_value(v).unwrap().as_str().unwrap().into()
}
#[derive(Clone, Copy)]
pub struct CallRecords<'a> {
    pub(crate) http: &'a HttpTransport,
    pub(crate) project_id: Option<&'a str>,
}
impl CallRecords<'_> {
    fn filters(&self, p: &CallFilters) -> Result<Query> {
        let mut q = Query::new();
        if let Some(project) = self.project_id {
            if p.project_id.as_deref().is_some_and(|v| v != project) {
                return Err(configuration("project client call scope"));
            }
            q.insert("projectId".into(), project.into());
        } else if let Some(v) = &p.project_id {
            text(v, 64)?;
            q.insert("projectId".into(), v.clone().into());
        }
        if let Some(v) = &p.session_id {
            text(v, 128)?;
            q.insert("sessionId".into(), v.clone().into());
        }
        if let Some(v) = p.direction {
            q.insert("direction".into(), enum_value(v).into());
        }
        if let Some(v) = p.upstream {
            q.insert("upstream".into(), enum_value(v).into());
        }
        if let Some(v) = p.outcome {
            q.insert("outcome".into(), enum_value(v).into());
        }
        for (k, v) in [("since", &p.since), ("until", &p.until)] {
            if let Some(v) = v {
                if chrono::DateTime::parse_from_rfc3339(v).is_err() || !v.contains('T') {
                    return Err(configuration("call timestamp"));
                }
                q.insert(k.into(), v.clone().into());
            }
        }
        Ok(q)
    }
    pub async fn retrieve(
        &self,
        id: &str,
        p: &CallFilters,
        o: RequestOptions,
    ) -> Result<ApiResponse<CallRecordDetail>> {
        if id.is_empty() || id.len() > 128 || !id.bytes().all(|b| (33..=126).contains(&b)) {
            return Err(configuration("callId"));
        }
        let q = self.filters(p)?;
        let v: ApiResponse<DataEnvelope<CallRecordDetail>> = self
            .http
            .request::<_, ()>(
                Method::GET,
                &format!("/platform/calls/{}", encode(id)),
                &query_pairs(&q)?,
                None,
                o,
            )
            .await?;
        Ok(ApiResponse {
            data: v.data.data,
            metadata: v.metadata,
        })
    }
    pub async fn stats(
        &self,
        p: &CallStatsParameters,
        o: RequestOptions,
    ) -> Result<ApiResponse<CallStats>> {
        let mut q = self.filters(&p.filters)?;
        if let Some(v) = p.group_by {
            q.insert("groupBy".into(), enum_value(v).into());
        }
        if let Some(v) = &p.timezone {
            text(v, 64)?;
            q.insert("timezone".into(), v.clone().into());
        }
        let v: ApiResponse<DataEnvelope<CallStats>> = self
            .http
            .request::<_, ()>(
                Method::GET,
                "/platform/calls/stats",
                &query_pairs(&q)?,
                None,
                o,
            )
            .await?;
        Ok(ApiResponse {
            data: v.data.data,
            metadata: v.metadata,
        })
    }
    pub async fn list(
        &self,
        p: &ListCallRecordsParameters,
        o: RequestOptions,
    ) -> Result<CursorPage<CallRecord>> {
        let mut q = self.filters(&p.filters)?;
        if let Some(v) = p.limit {
            if !(1..=100).contains(&v) {
                return Err(configuration("limit"));
            }
            q.insert("limit".into(), (v as i64).into());
        }
        if let Some(v) = &p.cursor {
            text(v, 256)?;
            q.insert("cursor".into(), v.clone().into());
        }
        CursorPage::load(self.http.clone(), "/platform/calls".into(), q, o).await
    }
    pub async fn export(
        &self,
        p: &ExportCallRecordsParameters,
        o: RequestOptions,
    ) -> Result<ApiResponse<CallExportPage>> {
        let mut q = self.filters(&p.filters)?;
        let format = p.format.unwrap_or(CallExportFormat::Csv);
        q.insert("format".into(), enum_value(format).into());
        if let Some(v) = p.limit {
            if !(1..=1000).contains(&v) {
                return Err(configuration("limit"));
            }
            q.insert("limit".into(), (v as i64).into());
        }
        if let Some(v) = &p.cursor {
            text(v, 256)?;
            q.insert("cursor".into(), v.clone().into());
        }
        let mime = match format {
            CallExportFormat::Csv => "text/csv",
            CallExportFormat::Ndjson => "application/x-ndjson",
        };
        let v = self
            .http
            .request_text("/platform/calls/export", &query_pairs(&q)?, o, mime)
            .await?;
        if !v.metadata.headers.get("content-type").is_some_and(|v| {
            v.split(';')
                .next()
                .unwrap()
                .trim()
                .eq_ignore_ascii_case(mime)
        }) {
            return Err(Error::local(
                ErrorKind::Server,
                "Unexpected call export content type",
                "invalid_response",
            )
            .with_metadata(v.metadata));
        }
        let next = v
            .metadata
            .headers
            .get("polymorfa-next-cursor")
            .filter(|v| !v.is_empty())
            .cloned();
        Ok(ApiResponse {
            data: CallExportPage {
                format,
                body: v.data,
                next_cursor: next,
            },
            metadata: v.metadata,
        })
    }
    pub fn export_all(
        &self,
        mut p: ExportCallRecordsParameters,
        o: RequestOptions,
    ) -> impl Stream<Item = Result<String>> + '_ {
        async_stream::try_stream! {let mut seen=std::collections::HashSet::new();if let Some(v)=&p.cursor{seen.insert(v.clone());}let mut first=true;loop{let response=self.export(&p,o.clone()).await?;let v=response.data;if let Some(next)=&v.next_cursor{if !seen.insert(next.clone()){Err(Error::local(ErrorKind::Server,"Repeated call export cursor","invalid_response").with_metadata(response.metadata))?;}}let body=if !first&&matches!(v.format,CallExportFormat::Csv){v.body.split_once('\n').map(|(_,body)|body.to_owned()).unwrap_or_default()}else{v.body};first=false;if !body.is_empty(){yield body;}
        if v.next_cursor.is_none(){break;}p.cursor=v.next_cursor;}}
    }
}
