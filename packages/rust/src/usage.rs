//! Metered usage, corrected records and gate state. The API owns access and charging policy.
use crate::{
    models::{query_pairs, DataEnvelope, QueryPrimitive, QueryValue},
    transport::HttpTransport,
    ApiResponse, Error, ErrorKind, RequestOptions, Result,
};
use reqwest::Method;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashSet};
#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum UsageMeter {
    #[serde(rename = "call.duration")]
    CallDuration,
    #[serde(rename = "call.cloud_pulses")]
    CallCloudPulses,
    #[serde(rename = "campaign.call")]
    CampaignCall,
    #[serde(rename = "tts.characters")]
    TtsCharacters,
    #[serde(rename = "tts.seconds")]
    TtsSeconds,
    #[serde(rename = "stt.seconds")]
    SttSeconds,
    #[serde(rename = "agent.seconds")]
    AgentSeconds,
    #[serde(rename = "agent.tokens")]
    AgentTokens,
    #[serde(rename = "agent.provider_cost")]
    AgentProviderCost,
    #[serde(rename = "channels.peak")]
    ChannelsPeak,
    #[serde(rename = "storage.byte_days")]
    StorageByteDays,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum UsageUnit {
    Second,
    Pulse,
    Call,
    Character,
    Token,
    ProviderUnit,
    Channel,
    ByteDay,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum UsageKeySource {
    None,
    Managed,
    Customer,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum UsagePricingState {
    Unpriced,
    Priced,
    Waived,
    Settled,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum UsageSourceKind {
    Call,
    Attempt,
    FlowRun,
    Conversation,
    Asset,
    Team,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(untagged)]
pub enum UsageDimension {
    String(String),
    Number(f64),
    Boolean(bool),
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct UsageRateCard {
    pub id: String,
    pub version: u64,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageRecord {
    pub id: String,
    pub meter: UsageMeter,
    pub quantity: f64,
    pub unit: UsageUnit,
    pub dimensions: BTreeMap<String, UsageDimension>,
    pub key_source: UsageKeySource,
    pub source_kind: UsageSourceKind,
    pub source_id: String,
    pub project_id: Option<String>,
    pub session: Option<String>,
    pub occurred_at: String,
    pub recorded_at: String,
    pub revision: u64,
    pub pricing_state: UsagePricingState,
    pub rate_card: Option<UsageRateCard>,
    pub priced_credits: Option<f64>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageRecordPage {
    pub records: Vec<UsageRecord>,
    pub next_cursor: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageMeterTotal {
    pub meter: UsageMeter,
    pub unit: UsageUnit,
    pub key_source: UsageKeySource,
    pub quantity: f64,
    pub records: u64,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NumberUsageTotal {
    pub session: String,
    pub project_id: Option<String>,
    pub meters: Vec<UsageMeterTotal>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageSummary {
    pub period: String,
    pub start: String,
    pub end: String,
    pub project_id: Option<String>,
    pub session: Option<String>,
    pub billing_enabled: bool,
    pub meters: Vec<UsageMeterTotal>,
    pub numbers: Vec<NumberUsageTotal>,
    pub numbers_truncated: bool,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum UsageGateKey {
    #[serde(rename = "calls.outbound_monthly")]
    CallsOutboundMonthly,
    #[serde(rename = "voice.campaigns")]
    VoiceCampaigns,
    #[serde(rename = "voice.campaigns.recipients")]
    VoiceCampaignsRecipients,
    #[serde(rename = "voice.campaigns.calls_monthly")]
    VoiceCampaignsCallsMonthly,
    #[serde(rename = "voice.channels.concurrent")]
    VoiceChannelsConcurrent,
    #[serde(rename = "voice.audio_library")]
    VoiceAudioLibrary,
    #[serde(rename = "voice.audio_library.assets")]
    VoiceAudioLibraryAssets,
    #[serde(rename = "voice.flows")]
    VoiceFlows,
    #[serde(rename = "voice.agents.elevenlabs")]
    VoiceAgentsElevenlabs,
    #[serde(rename = "voice.agents.openai_realtime")]
    VoiceAgentsOpenaiRealtime,
    #[serde(rename = "voice.providers.managed")]
    VoiceProvidersManaged,
    #[serde(rename = "voice.providers.customer_key")]
    VoiceProvidersCustomerKey,
    #[serde(rename = "voice.agent_minutes_monthly")]
    VoiceAgentMinutesMonthly,
    #[serde(rename = "voice.tts_characters_monthly")]
    VoiceTtsCharactersMonthly,
    #[serde(rename = "voice.stt_minutes_monthly")]
    VoiceSttMinutesMonthly,
    #[serde(rename = "voice.storage.recordings")]
    VoiceStorageRecordings,
    #[serde(rename = "voice.storage.transcripts")]
    VoiceStorageTranscripts,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum UsageGateMode {
    Off,
    Record,
    Enforce,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum UsageGateKind {
    Capability,
    Quota,
    Limit,
    Concurrency,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum UsageGateSubject {
    Team,
    Number,
    Project,
    Campaign,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(untagged)]
pub enum UsageGateUnit {
    Usage(UsageUnit),
    Other(UsageGateOtherUnit),
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum UsageGateOtherUnit {
    Count,
    Minute,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageGateDecisions {
    pub would_block: u64,
    pub blocked: u64,
    pub evaluation_error: u64,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageGate {
    pub key: UsageGateKey,
    pub kind: UsageGateKind,
    pub subject: UsageGateSubject,
    pub mode: UsageGateMode,
    pub active: bool,
    pub limit: Option<f64>,
    pub used: Option<f64>,
    pub unit: Option<UsageGateUnit>,
    pub over_limit: Option<bool>,
    pub decisions: UsageGateDecisions,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct UsageGateList {
    pub session: Option<String>,
    pub gates: Vec<UsageGate>,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageSummaryParams {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub project_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub session: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub period: Option<String>,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageRecordParams {
    #[serde(flatten)]
    pub summary: UsageSummaryParams,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub call_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub meter: Option<UsageMeter>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub limit: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cursor: Option<String>,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageGateParams {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub project_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub session: Option<String>,
}
pub struct Usage<'a> {
    pub(crate) http: &'a HttpTransport,
    pub(crate) project_id: Option<&'a str>,
}
impl Usage<'_> {
    pub async fn summary(
        &self,
        params: &UsageSummaryParams,
        options: RequestOptions,
    ) -> Result<ApiResponse<UsageSummary>> {
        self.get("/platform/usage", params, options).await
    }
    pub async fn list_records(
        &self,
        params: &UsageRecordParams,
        options: RequestOptions,
    ) -> Result<ApiResponse<UsageRecordPage>> {
        self.get("/platform/usage/records", params, options).await
    }
    pub async fn list_gates(
        &self,
        params: &UsageGateParams,
        options: RequestOptions,
    ) -> Result<ApiResponse<UsageGateList>> {
        self.get("/platform/gates", params, options).await
    }
    pub fn iterate_records(
        &self,
        mut params: UsageRecordParams,
        options: RequestOptions,
    ) -> std::pin::Pin<Box<dyn futures_util::Stream<Item = Result<UsageRecord>> + Send + '_>> {
        params.cursor = None;
        Box::pin(async_stream::try_stream! {
            let mut seen=HashSet::new();
            loop {
                let response=self.list_records(&params,options.clone()).await?;
                if let Some(next)=&response.data.next_cursor {
                    if !seen.insert(next.clone()) {Err(Error::local(ErrorKind::Server,"The Polymorfa API repeated a usage record cursor.","invalid_response").with_metadata(response.metadata.clone()))?;}
                }
                for record in response.data.records {yield record;}
                match response.data.next_cursor {Some(next)=>params.cursor=Some(next),None=>break}
            }
        })
    }
    async fn get<T: serde::de::DeserializeOwned, P: Serialize>(
        &self,
        path: &str,
        params: &P,
        options: RequestOptions,
    ) -> Result<ApiResponse<T>> {
        let mut query = crate::developer::query(params)?;
        if let Some(id) = self.project_id {
            query.insert(
                "projectId".into(),
                QueryValue::One(QueryPrimitive::String(id.into())),
            );
        }
        let pairs = query_pairs(&query)?;
        let response: ApiResponse<DataEnvelope<T>> = self
            .http
            .request::<_, ()>(Method::GET, path, &pairs, None, options)
            .await?;
        Ok(ApiResponse {
            data: response.data.data,
            metadata: response.metadata,
        })
    }
}
