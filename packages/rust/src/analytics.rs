//! Typed WhatsApp aggregates and collector text with strict project confinement.
use crate::{
    models::DataEnvelope,
    transport::{encode, HttpTransport},
    ApiResponse, Error, ErrorKind, RequestOptions, Result,
};
use reqwest::Method;
use serde::{Deserialize, Serialize};
macro_rules! model {($name:ident {$($field:ident:$kind:ty),* $(,)?})=>{#[derive(Clone,Debug,Serialize,Deserialize)] #[serde(rename_all="camelCase")] pub struct $name {$(pub $field:$kind),*}};}
macro_rules! enumeration {($name:ident {$($variant:ident=>$value:literal),+})=>{#[derive(Clone,Copy,Debug,Serialize,Deserialize)] pub enum $name {$(#[serde(rename=$value)] $variant),+}};}
enumeration!(EstimatedPlatform {Web=>"web",Android=>"android",Iphone=>"iphone",Ipad=>"ipad",Macos=>"macos",Windows=>"windows",Wearable=>"wearable",ArDevice=>"ar_device",Unknown=>"unknown"});
enumeration!(ReportedDeviceClass {Phone=>"phone",DesktopApp=>"desktop_app",Browser=>"browser",BusinessApi=>"business_api",Unknown=>"unknown"});
enumeration!(RecipientDeviceCount {PrimaryOnly=>"primary_only",OneLinked=>"one_linked",TwoPlusLinked=>"two_plus_linked",Unknown=>"unknown"});
enumeration!(DeviceSource {Primary=>"primary",Linked=>"linked",Unknown=>"unknown"});
enumeration!(MessageDimension {MessageType=>"message_type",TextBand=>"text_band",Origin=>"origin",CallingCode=>"calling_code",CustomerDevices=>"customer_devices"});
enumeration!(MessageType {Text=>"text",Image=>"image",Video=>"video",Audio=>"audio",Document=>"document",Sticker=>"sticker",Interactive=>"interactive",Template=>"template",Other=>"other"});
enumeration!(TextBand {None=>"none",Short=>"short",Medium=>"medium",Long=>"long",VeryLong=>"very_long",Unknown=>"unknown"});
enumeration!(MessageOrigin {Api=>"api",Campaign=>"campaign",Other=>"other"});
enumeration!(CustomerDevices {Single=>"single",Multiple=>"multiple",Unknown=>"unknown"});
enumeration!(DeviceDetector {MessageIdPrefixV1=>"message_id_prefix/v1"});
enumeration!(MetricsFormat {Prometheus=>"prometheus",Openmetrics=>"openmetrics"});
model!(CallOutcomeMetrics {total:u64,answered:u64,missed:u64,declined:u64,failed:u64,ringing:u64,answer_rate:Option<f64>,talk_seconds:f64,timed_answered:u64,timed_pickup:u64,average_talk_seconds:Option<f64>,median_talk_seconds:Option<f64>,p95_talk_seconds:Option<f64>,average_pickup_ms:Option<f64>,p95_pickup_ms:Option<f64>,short_answered:u64,video:u64});
model!(CallDirections {
    inbound: CallOutcomeMetrics,
    outbound: CallOutcomeMetrics
});
model!(MediaQuality {measured_calls:u64,average_jitter_ms:Option<f64>,average_rtt_ms:Option<f64>,packets_lost:Option<u64>});
model!(AppQuality {measured_calls:u64,average_jitter_ms:Option<f64>,average_rtt_ms:Option<f64>,packet_loss_rate:Option<f64>,reconnects:Option<u64>});
model!(CodeCount {
    code: String,
    count: u64
});
model!(CallFollowUp {eligible_missed:u64,returned_within24h:u64,rate:Option<f64>,average_delay_ms:Option<f64>,pending_window:u64,unknown_contact:u64});
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CallBusinessMetrics {
    #[serde(flatten)]
    pub outcomes: CallOutcomeMetrics,
    pub directions: CallDirections,
    pub media_quality: MediaQuality,
    pub app_quality: AppQuality,
    pub end_reasons: Vec<CodeCount>,
    pub app_errors: Vec<CodeCount>,
    pub transports: Vec<CodeCount>,
    pub multi_participant_calls: u64,
    pub follow_up: CallFollowUp,
}
model!(BusinessSegment {dimension:MessageDimension,key:String,send_attempts:u64,sent:u64,send_failures:u64,send_failure_rate:Option<f64>,completed_conversations:u64,delivered_conversations:u64,read_conversations:u64,replied_conversations:u64,delivery_rate:Option<f64>,read_rate:Option<f64>,reply_rate:Option<f64>,average_customer_reply_ms:Option<f64>,read_rate_interval95:Option<[f64;2]>,reply_rate_interval95:Option<[f64;2]>,read_rate_difference:Option<f64>,reply_rate_difference:Option<f64>,share_of_conversations:Option<f64>,share_of_sends:Option<f64>});
model!(Engagement {window_hours:u8,completed_conversations:u64,delivered_conversations:u64,read_conversations:u64,replied_conversations:u64,delivery_rate:Option<f64>,read_rate:Option<f64>,reply_rate:Option<f64>,average_customer_reply_ms:Option<f64>,complete:bool,dropped_conversations:u64,dropped_records:u64,dropped_receipt_joins:u64});
model!(PlatformShare {platform:EstimatedPlatform,messages:u64,share:Option<f64>});
model!(InventoryDevice {device_index:u32,estimated_platform:EstimatedPlatform,reported_class:ReportedDeviceClass,last_active_at:Option<u64>,listed:Option<bool>});
model!(DeviceInventory {list_observed:bool,list_current:bool,observed_at:Option<u64>,device_count:Option<u32>,truncated:bool,devices:Vec<InventoryDevice>});
model!(DeviceAnalytics {detector:DeviceDetector,measured:bool,complete:bool,observed_buckets:u64,customer_messages:Option<u64>,account_messages:Option<u64>,customer_platforms:Vec<PlatformShare>,account_platforms:Vec<PlatformShare>,inventory:Option<DeviceInventory>});
model!(RecipientActivityRow {ts:u64,recipient_country:String,recipient_device_count:RecipientDeviceCount,device_source:DeviceSource,incoming_messages:u64,delivery_receipts:u64,read_receipts:u64,online_signals:u64,offline_signals:u64,typing_signals:u64,last_signal_at:u64,quiet_gaps:u64,quiet_gap_ms:u64,average_quiet_gap_ms:Option<f64>});
model!(RecipientActivity {measured:bool,complete:bool,observed_buckets:u64,dropped_signals:u64,truncated:bool,rows:Vec<RecipientActivityRow>});
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversationGroup {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub recipient_country: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub recipient_device_count: Option<RecipientDeviceCount>,
    pub ts: u64,
    pub message_type: MessageType,
    pub text_band: TextBand,
    pub origin: MessageOrigin,
    pub calling_code: String,
    pub customer_devices: CustomerDevices,
    pub completed_conversations: u64,
    pub delivered_conversations: u64,
    pub read_conversations: u64,
    pub replied_conversations: u64,
    pub reply_latency_sum_ms: f64,
    pub read_rate: Option<f64>,
    pub reply_rate: Option<f64>,
    pub average_customer_reply_ms: Option<f64>,
}
model!(ConversationBucket {
    ts: u64,
    complete: bool
});
model!(ConversationBreakdown {measured:bool,complete:bool,observed_buckets:u64,dropped_conversations:u64,truncated:bool,buckets:Vec<ConversationBucket>,rows:Vec<ConversationGroup>});
model!(MessageAnalysis {complete:bool,segments:Vec<BusinessSegment>});
model!(CustomerActivity {
    observed: bool,
    online_signals: u64,
    offline_signals: u64,
    typing_signals: u64
});
model!(AccountActivity {observed:bool,primary_phone_activity_signals:u64,primary_phone_active_periods:u64,completed_phone_activity_periods:u64,phone_activity_ms:u64,average_phone_activity_ms:Option<f64>,phone_quiet_gaps:u64,phone_quiet_ms:u64,average_phone_quiet_ms:Option<f64>,primary_phone_messages:u64,other_device_messages:u64,primary_phone_replies:u64,other_device_replies:u64,average_primary_phone_response_ms:Option<f64>,average_other_device_response_ms:Option<f64>,last_primary_phone_at:Option<u64>});
model!(ResponseQueue {
    awaiting_reply: u64,
    oldest_waiting_ms: u64,
    observed_at: u64,
    complete: bool
});
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WhatsAppMetrics {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub recipient_activity: Option<RecipientActivity>,
    pub device_analytics: DeviceAnalytics,
    pub conversation_breakdown: ConversationBreakdown,
    pub calls: CallBusinessMetrics,
    pub measured: bool,
    pub observed_hours: u32,
    pub last_observed_at: Option<u64>,
    pub outgoing_messages: u64,
    pub incoming_messages: u64,
    pub send_attempts: u64,
    pub send_failures: u64,
    pub send_failure_rate: Option<f64>,
    pub business_replies: u64,
    pub average_business_response_ms: Option<f64>,
    pub online_ms: u64,
    pub disconnects: u64,
    pub connect_failures: u64,
    pub stream_errors: u64,
    pub keepalive_timeouts: u64,
    pub engagement: Engagement,
    pub message_analysis: MessageAnalysis,
    pub customer_activity: CustomerActivity,
    pub account_activity: AccountActivity,
    pub response_queue: Option<ResponseQueue>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalyticsSummary {
    #[serde(flatten)]
    pub metrics: WhatsAppMetrics,
    pub total_numbers: u32,
    pub measured_numbers: u32,
    pub connected_numbers: u32,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NumberAnalytics {
    #[serde(flatten)]
    pub metrics: WhatsAppMetrics,
    pub session_id: String,
    pub project_id: String,
    pub project_name: String,
    pub name: String,
    pub backend: String,
    pub status: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CallSeries {
    #[serde(flatten)]
    pub metrics: CallOutcomeMetrics,
    pub session_id: String,
    pub ts: u64,
}
model!(AnalyticsSeries {customer_online_signals:u64,customer_typing_signals:u64,primary_phone_messages:u64,other_device_messages:u64,primary_phone_replies:u64,phone_active_periods:u64,completed_phone_activity_periods:u64,phone_activity_ms:u64,phone_quiet_gaps:u64,phone_quiet_ms:u64,session_id:String,ts:u64,outgoing_messages:u64,incoming_messages:u64,send_failures:u64,business_replies:u64,average_business_response_ms:Option<f64>,online_ms:u64,disconnects:u64});
model!(AnalyticsPeriod {
    start: u64,
    end: u64
});
model!(RequestVitals {requests:u64,failures:u64,error_rate:Option<f64>});
model!(WhatsAppAnalytics {call_series:Vec<CallSeries>,enabled:bool,period:AnalyticsPeriod,request_vitals:RequestVitals,summary:Option<AnalyticsSummary>,numbers:Vec<NumberAnalytics>,series:Vec<AnalyticsSeries>});
#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalyticsParameters {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub project_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub session_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub start: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub end: Option<u64>,
}
#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MetricsParameters {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub project_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub session_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub window_hours: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub segments: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub format: Option<MetricsFormat>,
}
fn invalid(message: &str, code: &str) -> Error {
    Error::local(ErrorKind::Validation, message, code)
}
#[derive(Clone, Copy)]
pub struct Analytics<'a> {
    pub(crate) http: &'a HttpTransport,
    pub(crate) project_id: Option<&'a str>,
}
impl Analytics<'_> {
    fn filters(&self, project: Option<&str>, session: Option<&str>) -> Result<()> {
        for v in [project, session].into_iter().flatten() {
            if crate::functions::identifier(&v.to_ascii_lowercase()).is_err() {
                return Err(invalid(
                    "Analytics filters must be UUIDs",
                    "invalid_analytics_filter",
                ));
            }
        }
        if self
            .project_id
            .is_some_and(|p| project.is_some_and(|v| !v.eq_ignore_ascii_case(p)))
        {
            return Err(invalid(
                "Analytics cannot read outside its project",
                "invalid_analytics_filter",
            ));
        }
        Ok(())
    }
    fn path(&self) -> String {
        self.project_id
            .map(|p| format!("/platform/projects/{}/analytics", encode(p)))
            .unwrap_or_else(|| "/platform/analytics".into())
    }
    fn query<P: Serialize>(&self, p: &P) -> Vec<(String, String)> {
        let mut value = serde_json::to_value(p).unwrap();
        if self.project_id.is_some() {
            value.as_object_mut().unwrap().remove("projectId");
        }
        value
            .as_object()
            .unwrap()
            .iter()
            .map(|(k, v)| {
                (
                    k.clone(),
                    v.as_str()
                        .map(str::to_owned)
                        .unwrap_or_else(|| v.to_string()),
                )
            })
            .collect()
    }
    pub async fn get(
        &self,
        p: &AnalyticsParameters,
        o: RequestOptions,
    ) -> Result<ApiResponse<WhatsAppAnalytics>> {
        self.filters(p.project_id.as_deref(), p.session_id.as_deref())?;
        if p.start.is_some_and(|v| v > 9_007_199_254_740_991)
            || p.end.is_some_and(|v| v > 9_007_199_254_740_991)
            || matches!((p.start,p.end),(Some(start),Some(end)) if end<start||end-start>366*86_400_000)
        {
            return Err(invalid(
                "Choose an ordered range of up to 366 days",
                "invalid_analytics_range",
            ));
        }
        let values = self.query(p);
        let pairs: Vec<_> = values
            .iter()
            .map(|(k, v)| (k.as_str(), v.clone()))
            .collect();
        let response: ApiResponse<DataEnvelope<WhatsAppAnalytics>> = self
            .http
            .request::<_, ()>(Method::GET, &self.path(), &pairs, None, o)
            .await?;
        Ok(ApiResponse {
            data: response.data.data,
            metadata: response.metadata,
        })
    }
    pub async fn metrics(
        &self,
        p: &MetricsParameters,
        o: RequestOptions,
    ) -> Result<ApiResponse<String>> {
        self.filters(p.project_id.as_deref(), p.session_id.as_deref())?;
        if p.window_hours.is_some_and(|v| !(1..=168).contains(&v)) {
            return Err(invalid(
                "windowHours must be 1 to 168",
                "invalid_analytics_range",
            ));
        }
        let format = p.format.unwrap_or(MetricsFormat::Prometheus);
        let mut p = p.clone();
        p.format = Some(format);
        let values = self.query(&p);
        let pairs: Vec<_> = values
            .iter()
            .map(|(k, v)| (k.as_str(), v.clone()))
            .collect();
        let mime = match format {
            MetricsFormat::Prometheus => "text/plain",
            MetricsFormat::Openmetrics => "application/openmetrics-text",
        };
        let response = self
            .http
            .request_text(&format!("{}/metrics", self.path()), &pairs, o, mime)
            .await?;
        if !response
            .data
            .lines()
            .any(|v| v == "# TYPE polymorfa_analytics_enabled gauge")
            || !response
                .metadata
                .headers
                .get("content-type")
                .is_some_and(|v| {
                    v.split(';')
                        .next()
                        .unwrap()
                        .trim()
                        .eq_ignore_ascii_case(mime)
                })
            || (matches!(format, MetricsFormat::Openmetrics) && !response.data.ends_with("# EOF\n"))
        {
            return Err(Error::local(
                ErrorKind::Server,
                "Invalid analytics metrics response",
                "invalid_response",
            )
            .with_metadata(response.metadata));
        }
        Ok(response)
    }
}
