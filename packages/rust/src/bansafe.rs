//! Typed BanSafe observations, explanations, enforcement and incident receipts.
use crate::{
    models::{CursorEnvelope, DataEnvelope},
    transport::{encode, HttpTransport},
    ApiResponse, RequestOptions, Result,
};
use reqwest::Method;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
macro_rules! enumeration { ($name:ident {$($variant:ident => $value:literal),+ $(,)?}) => { #[derive(Clone,Copy,Debug,Serialize,Deserialize,PartialEq,Eq)] pub enum $name { $(#[serde(rename=$value)] $variant),+ } }; }
macro_rules! model { ($name:ident {$($field:ident : $kind:ty),* $(,)?}) => { #[derive(Clone,Debug,Serialize,Deserialize)] #[serde(rename_all="camelCase")] pub struct $name { $(pub $field:$kind),* } }; }
enumeration!(HealthBand {Good=>"good",Fair=>"fair",Poor=>"poor",Failing=>"failing",Unknown=>"unknown"});
enumeration!(HealthState {Healthy=>"healthy",Limited=>"limited",Restricted=>"restricted",Banned=>"banned"});
enumeration!(HealthSource {RulesV1=>"rules_v1",MlModel=>"ml_model",Unavailable=>"unavailable"});
enumeration!(HealthReliability {RulesBased=>"rules_based",Validated=>"validated",Unavailable=>"unavailable"});
enumeration!(HealthUnavailableReason {NoActiveModel=>"no_active_model",InvalidActiveModel=>"invalid_active_model",InsufficientFreshFeatures=>"insufficient_fresh_features"});
enumeration!(EnforcementRung {None=>"none",Notify=>"notify",Throttle=>"throttle",BlockCold=>"block_cold",Suspend=>"suspend"});
enumeration!(AppealState {None=>"none",Requested=>"requested",Granted=>"granted",Denied=>"denied"});
enumeration!(ExplanationGroup {DirectCondition=>"direct_condition",Delivery=>"delivery",Connection=>"connection",Conduct=>"conduct",Cadence=>"cadence"});
enumeration!(ObservedSource {AccountCheck=>"account_check",RestrictionEvent=>"restriction_event"});
enumeration!(EnforcementSource {Automatic=>"automatic",Operator=>"operator"});
enumeration!(EnforcementState {Applied=>"applied",Applying=>"applying"});
enumeration!(WarmupTenure {History=>"history",Link=>"link",Plan=>"plan"});
enumeration!(FindingStatus {Open=>"open",Acknowledged=>"acknowledged",Resolved=>"resolved",NotMeasured=>"not_measured"});
enumeration!(FindingQueryStatus {Open=>"open",Acknowledged=>"acknowledged",Resolved=>"resolved"});
enumeration!(FindingSeverity {Info=>"info",Warning=>"warning",Critical=>"critical"});
enumeration!(ResolveReason {Clean=>"clean",KeyRetired=>"key_retired",NumberRemoved=>"number_removed",Stale=>"stale"});
enumeration!(IncidentKind {CapWarning=>"cap_warning",CapReached=>"cap_reached",Timelock=>"timelock",TemporaryBan=>"temporary_ban",PermanentBan=>"permanent_ban",ConnectBlocked=>"connect_blocked",CustomerReport=>"customer_report"});
enumeration!(IncidentSource {Runtime=>"runtime",Customer=>"customer"});
enumeration!(ClaimStatus {Filed=>"filed",UnderReview=>"under_review",Approved=>"approved",Denied=>"denied",Paid=>"paid",Reversed=>"reversed"});
enumeration!(ClaimVerdict {OtherDevice=>"other_device",CustomerConduct=>"customer_conduct",SharedNetwork=>"shared_network",Ours=>"ours",Inconclusive=>"inconclusive"});
enumeration!(SignalKind {Number=>"number",Boolean=>"boolean",Enum=>"enum",Histogram=>"histogram",CodeCounts=>"code_counts"});
enumeration!(SignalUnit {Count=>"count",Milliseconds=>"milliseconds",UnixMilliseconds=>"unix_milliseconds",Ratio=>"ratio",None=>"none"});
enumeration!(CollectionState {Fresh=>"fresh",Stale=>"stale",NotCollected=>"not_collected",Unsupported=>"unsupported"});
enumeration!(HealthActionMode {Apply=>"apply",Clear=>"clear"});
enumeration!(HealthActionKind {Stop=>"stop",SlowDown=>"slow_down",LogOut=>"log_out",Email=>"email",Webhook=>"webhook"});
enumeration!(HealthActionStatus {Pending=>"pending",Running=>"running",Succeeded=>"succeeded",Failed=>"failed",Cancelled=>"cancelled"});
enumeration!(HealthActionOutcome {Applied=>"applied",Cleared=>"cleared",NotificationQueued=>"notification_queued",Superseded=>"superseded",Expired=>"expired",NotApplied=>"not_applied",DeliveryFailed=>"delivery_failed"});
enumeration!(HealthActionSource {RulesV1=>"rules_v1",MlModel=>"ml_model"});
model!(HealthProbabilities {
    healthy: f64,
    limited: f64,
    restricted: f64,
    banned: f64
});
model!(ExplanationFactor {
    group: ExplanationGroup,
    key: String,
    penalty: f64,
    observed_value: f64,
    sample_size: u64
});
model!(ExplanationPenalties {
    conduct: f64,
    delivery: f64,
    connection: f64,
    restriction: f64,
    total: f64
});
model!(HealthExplanation {penalties:ExplanationPenalties,factors:Vec<ExplanationFactor>,measured_groups:Vec<ExplanationGroup>,missing_groups:Vec<ExplanationGroup>});
model!(ObservedAccountState {
    state: HealthState,
    observed_at: String,
    source: ObservedSource
});
model!(HealthProjection {health:Option<f64>,band:HealthBand,health_source:HealthSource,health_estimator_version:Option<String>,health_model_version:Option<String>,health_evaluated_at:Option<String>,health_feature_coverage:Option<f64>,health_reliability:HealthReliability,health_unavailable_reason:Option<HealthUnavailableReason>,health_probabilities:Option<HealthProbabilities>,most_likely_health_state:Option<HealthState>,health_explanation:Option<HealthExplanation>,observed_account_state:Option<ObservedAccountState>});
model!(NumberEnforcement {rung:EnforcementRung,previous_rung:EnforcementRung,organization_floor:EnforcementRung,reason:String,source:EnforcementSource,throughput_per_minute:Option<f64>,blocks_unsolicited:bool,suspended:bool,started_at:String,eligible_lift_at:Option<String>,exit_progress:f64,blocking_findings:Vec<String>,operator_hold:bool,appeal_state:AppealState,state:EnforcementState});
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BanSafeNumber {
    #[serde(flatten)]
    pub health: HealthProjection,
    pub session_id: String,
    pub session: String,
    pub phone_number: String,
    pub project_id: String,
    pub enforcement: Option<NumberEnforcement>,
}
model!(NumberWarmup {enabled:bool,tenure_source:Option<WarmupTenure>,tenure_day:u32,allowance:Option<u64>,sent_today:Option<u64>,resets_at:Option<String>,curve:Vec<crate::policies::WarmupCurvePoint>});
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NumberDetail {
    #[serde(flatten)]
    pub number: BanSafeNumber,
    pub warmup: NumberWarmup,
    pub findings: Vec<Finding>,
    pub lift_requires: Option<String>,
    pub appeal_state: AppealState,
}
model!(HealthPoint {health:Option<f64>,band:Option<HealthBand>,health_source:HealthSource,health_estimator_version:Option<String>,health_model_version:Option<String>,health_evaluated_at:String,health_feature_coverage:Option<f64>,health_reliability:HealthReliability,health_unavailable_reason:Option<HealthUnavailableReason>,health_probabilities:Option<HealthProbabilities>,most_likely_health_state:Option<HealthState>,health_explanation:Option<HealthExplanation>,observed_account_state:Option<ObservedAccountState>});
model!(HealthHistory {session_id:String,session:String,points:Vec<HealthPoint>});
model!(Finding {id:Option<String>,key:String,title:String,summary:String,fix:String,status:FindingStatus,severity:Option<FindingSeverity>,occurrences:u64,reopened_count:u64,evidence:BTreeMap<String,f64>,session_id:String,session:String,phone_number:String,first_seen_at:Option<String>,last_seen_at:Option<String>,acknowledged_at:Option<String>,acknowledged_by:Option<String>,acknowledgement_note:Option<String>,snoozed_until:Option<String>,resolved_at:Option<String>,resolve_reason:Option<ResolveReason>});
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnforcementSummary {
    #[serde(flatten)]
    pub health: HealthProjection,
    pub session_id: String,
    pub session: String,
    pub phone_number: String,
    pub project_id: String,
    pub rung: EnforcementRung,
    pub previous_rung: EnforcementRung,
    pub organization_floor: EnforcementRung,
    pub reason: String,
    pub source: EnforcementSource,
    pub throughput_per_minute: Option<f64>,
    pub blocks_unsolicited: bool,
    pub suspended: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub enforcement: Option<NumberEnforcement>,
    pub blocking_findings: Vec<String>,
    pub started_at: String,
    pub eligible_lift_at: Option<String>,
    pub lift_requires: String,
    pub operator_hold: bool,
    pub appeal_state: AppealState,
    pub state: EnforcementState,
}
model!(Incident {id:String,session_id:String,session:String,phone_number:String,project_id:String,kind:IncidentKind,source:IncidentSource,resolution:String,ambiguous:bool,started_at:String,ends_at:Option<String>,closed_at:Option<String>,closed_by:Option<String>,claim_id:Option<String>,note:Option<String>,reported_by:Option<String>,created_at:String});
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReportIncidentRequest {
    pub session: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub occurred_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
}
model!(IncidentReceipt {
    incident_id: String,
    created: bool,
    session_id: String,
    session: String,
    occurred_at: String
});
model!(ClaimEvidence {attribution_rule_version:Option<u32>,window_days:u32,device_evidence:bool,other_devices:u32,restricted_in_window:bool,critical_finding_days:u32,shared_connection:bool,measured_hours:u32});
model!(Claim {id:String,incident_id:String,session_id:String,session:String,phone_number:String,project_id:String,status:ClaimStatus,verdict:ClaimVerdict,window_start:String,window_end:String,measured_cents:f64,cap_cents:f64,amount_cents:f64,evidence:ClaimEvidence,summary:String,reason:String,decided_at:Option<String>,paid_at:Option<String>,created_at:String});
model!(SignalDefinition {
    key: String,
    label: String,
    group: String,
    kind: SignalKind,
    unit: SignalUnit,
    description: String
});
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(untagged)]
pub enum SignalValue {
    Number(f64),
    Boolean(bool),
    Text(String),
    Histogram(Vec<f64>),
}
model!(SignalCode {
    code: i64,
    count: u64
});
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Signal {
    #[serde(flatten)]
    pub definition: SignalDefinition,
    pub measured: bool,
    pub value: Option<SignalValue>,
    pub sample_size: Option<u64>,
    pub codes: Option<Vec<SignalCode>>,
}
model!(CollectionStatus {state:CollectionState,latest_flushed_at:Option<String>,latest_received_at:Option<String>,fresh_until:Option<String>,record_version:Option<u32>,collector_version:Option<u32>,partial:Option<bool>,dropped_records:Option<u64>});
model!(TelemetrySnapshot {bucket_start:String,flushed_at:String,received_at:String,partial:bool,record_version:Option<u32>,signals:Vec<Signal>});
model!(CollectionSession {
    session_id: String,
    session: String,
    project_id: String,
    collection: CollectionStatus
});
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TelemetryDetail {
    #[serde(flatten)]
    pub session: CollectionSession,
    pub snapshot: Option<TelemetrySnapshot>,
}
model!(HealthAction {id:String,session_id:String,session:String,project_id:String,mode:HealthActionMode,action:HealthActionKind,status:HealthActionStatus,health:f64,threshold:f64,health_source:HealthActionSource,estimator_version:String,model_version:Option<String>,slow_down_mps:Option<f64>,evaluated_at:String,created_at:String,completed_at:Option<String>,outcome:Option<HealthActionOutcome>});
macro_rules! parameters {($name:ident {$($field:ident:$kind:ty),* $(,)?})=>{#[derive(Clone,Debug,Default,Serialize)] #[serde(rename_all="camelCase")] pub struct $name {$(#[serde(skip_serializing_if="Option::is_none")] pub $field:Option<$kind>),*}};}
parameters!(ListHealthParameters {
    project_id: String,
    cursor: String,
    limit: u32
});
parameters!(ListHealthHistoryParameters {
    since: String,
    limit: u32
});
parameters!(ListFindingsParameters {
    project_id: String,
    cursor: String,
    limit: u32,
    session: String,
    status: FindingQueryStatus,
    severity: FindingSeverity
});
parameters!(ListEnforcementParameters {
    project_id: String,
    cursor: String,
    limit: u32,
    rung: EnforcementRung
});
parameters!(ListIncidentsParameters {
    project_id: String,
    cursor: String,
    limit: u32,
    session: String
});
parameters!(ListClaimsParameters {
    project_id: String,
    cursor: String,
    limit: u32,
    session: String,
    status: ClaimStatus
});
parameters!(ListTelemetryHistoryParameters {
    since: String,
    until: String,
    cursor: String,
    limit: u32
});
parameters!(ListHealthActionsParameters {
    project_id: String,
    cursor: String,
    limit: u32,
    session: String,
    status: HealthActionStatus
});
pub type ListCollectionParameters = ListHealthParameters;
pub struct BanSafe<'a>(pub(crate) &'a HttpTransport);
impl BanSafe<'_> {
    async fn get<T: serde::de::DeserializeOwned, P: Serialize>(
        &self,
        path: &str,
        parameters: &P,
        options: RequestOptions,
    ) -> Result<ApiResponse<T>> {
        // All callers supply closed parameter structs containing only scalar query values.
        let object = serde_json::to_value(parameters).expect("scalar BanSafe query serialization");
        let pairs: Vec<(&str, String)> = object
            .as_object()
            .expect("query object")
            .iter()
            .map(|(k, v)| {
                (
                    k.as_str(),
                    v.as_str()
                        .map(str::to_owned)
                        .unwrap_or_else(|| v.to_string()),
                )
            })
            .collect();
        self.0
            .request::<T, ()>(Method::GET, path, &pairs, None, options)
            .await
    }
    pub async fn list_health(
        &self,
        parameters: &ListHealthParameters,
        options: RequestOptions,
    ) -> Result<ApiResponse<CursorEnvelope<BanSafeNumber>>> {
        self.get("/platform/bansafe/health", parameters, options)
            .await
    }
    pub async fn get_health(
        &self,
        session: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<DataEnvelope<NumberDetail>>> {
        self.0
            .get(
                &format!("/platform/bansafe/health/{}", encode(session)),
                options,
            )
            .await
    }
    pub async fn list_health_history(
        &self,
        session: &str,
        parameters: &ListHealthHistoryParameters,
        options: RequestOptions,
    ) -> Result<ApiResponse<DataEnvelope<HealthHistory>>> {
        self.get(
            &format!("/platform/bansafe/health/{}/history", encode(session)),
            parameters,
            options,
        )
        .await
    }
    pub async fn list_signals(
        &self,
        options: RequestOptions,
    ) -> Result<ApiResponse<DataEnvelope<Vec<SignalDefinition>>>> {
        self.0.get("/platform/bansafe/signals", options).await
    }
    pub async fn get_telemetry(
        &self,
        session: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<DataEnvelope<TelemetryDetail>>> {
        self.0
            .get(
                &format!("/platform/bansafe/telemetry/{}", encode(session)),
                options,
            )
            .await
    }
    pub async fn list_telemetry_history(
        &self,
        session: &str,
        parameters: &ListTelemetryHistoryParameters,
        options: RequestOptions,
    ) -> Result<ApiResponse<CursorEnvelope<TelemetrySnapshot>>> {
        self.get(
            &format!("/platform/bansafe/telemetry/{}/history", encode(session)),
            parameters,
            options,
        )
        .await
    }
    pub async fn list_collection(
        &self,
        parameters: &ListCollectionParameters,
        options: RequestOptions,
    ) -> Result<ApiResponse<CursorEnvelope<CollectionSession>>> {
        self.get("/platform/bansafe/collection", parameters, options)
            .await
    }
    pub async fn list_health_actions(
        &self,
        parameters: &ListHealthActionsParameters,
        options: RequestOptions,
    ) -> Result<ApiResponse<CursorEnvelope<HealthAction>>> {
        self.get("/platform/bansafe/health-actions", parameters, options)
            .await
    }
    pub async fn list_findings(
        &self,
        parameters: &ListFindingsParameters,
        options: RequestOptions,
    ) -> Result<ApiResponse<CursorEnvelope<Finding>>> {
        self.get("/platform/bansafe/findings", parameters, options)
            .await
    }
    pub async fn list_enforcement(
        &self,
        parameters: &ListEnforcementParameters,
        options: RequestOptions,
    ) -> Result<ApiResponse<CursorEnvelope<EnforcementSummary>>> {
        self.get("/platform/bansafe/enforcement", parameters, options)
            .await
    }
    pub async fn list_incidents(
        &self,
        parameters: &ListIncidentsParameters,
        options: RequestOptions,
    ) -> Result<ApiResponse<CursorEnvelope<Incident>>> {
        self.get("/platform/bansafe/incidents", parameters, options)
            .await
    }
    pub async fn create_incident(
        &self,
        body: &ReportIncidentRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<DataEnvelope<IncidentReceipt>>> {
        self.0
            .request(
                Method::POST,
                "/platform/bansafe/incidents",
                &[],
                Some(body),
                options,
            )
            .await
    }
    pub async fn retract_incident(
        &self,
        id: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<DataEnvelope<Incident>>> {
        self.0
            .request::<_, ()>(
                Method::POST,
                &format!("/platform/bansafe/incidents/{}/retract", encode(id)),
                &[],
                None,
                options,
            )
            .await
    }
    pub async fn list_claims(
        &self,
        parameters: &ListClaimsParameters,
        options: RequestOptions,
    ) -> Result<ApiResponse<CursorEnvelope<Claim>>> {
        self.get("/platform/bansafe/claims", parameters, options)
            .await
    }
    pub async fn get_claim(
        &self,
        id: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<DataEnvelope<Claim>>> {
        self.0
            .get(&format!("/platform/bansafe/claims/{}", encode(id)), options)
            .await
    }
}
