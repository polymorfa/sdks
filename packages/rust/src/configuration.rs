//! Typed effective settings, source attribution, revisions and sparse patches.
use serde::{Deserialize, Serialize};
pub(crate) fn deserialize_present_option<'de, D, T>(
    deserializer: D,
) -> std::result::Result<Option<Option<T>>, D::Error>
where
    D: serde::Deserializer<'de>,
    T: Deserialize<'de>,
{
    Option::<T>::deserialize(deserializer).map(Some)
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ObservationMode {
    Off,
    Events,
    Cache,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LabelObservationMode {
    Off,
    Events,
    Cache,
    Project,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ObservationConfiguration {
    pub presence_mode: ObservationMode,
    pub typing_mode: ObservationMode,
    pub label_mode: LabelObservationMode,
    pub quick_reply_mode: ObservationMode,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ObservationConfigurationPatch {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub presence_mode: Option<ObservationMode>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub typing_mode: Option<ObservationMode>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label_mode: Option<LabelObservationMode>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub quick_reply_mode: Option<ObservationMode>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum HistorySyncMode {
    MetadataOnly,
    Deliver,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistorySyncPolicy {
    pub mode: HistorySyncMode,
    pub request_full: bool,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistorySyncPolicyPatch {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mode: Option<HistorySyncMode>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub request_full: Option<bool>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum HmsPolicy {
    Short,
    Standard,
    Extended,
    Compliance,
    EnterpriseArchive,
}
#[derive(Clone, Debug)]
pub enum HmsConfiguration {
    Disabled,
    Enabled {
        region: String,
        policy: HmsPolicy,
        retention_days: Option<u32>,
        policy_version: Option<String>,
        legal_hold: Option<bool>,
    },
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct HmsWire {
    enabled: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    region: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    policy: Option<HmsPolicy>,
    #[serde(skip_serializing_if = "Option::is_none")]
    retention_days: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    policy_version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    legal_hold: Option<bool>,
}
impl Serialize for HmsConfiguration {
    fn serialize<S: serde::Serializer>(
        &self,
        serializer: S,
    ) -> std::result::Result<S::Ok, S::Error> {
        let wire = match self {
            Self::Disabled => HmsWire {
                enabled: false,
                region: None,
                policy: None,
                retention_days: None,
                policy_version: None,
                legal_hold: None,
            },
            Self::Enabled {
                region,
                policy,
                retention_days,
                policy_version,
                legal_hold,
            } => HmsWire {
                enabled: true,
                region: Some(region.clone()),
                policy: Some(policy.clone()),
                retention_days: *retention_days,
                policy_version: policy_version.clone(),
                legal_hold: *legal_hold,
            },
        };
        wire.serialize(serializer)
    }
}
impl<'de> Deserialize<'de> for HmsConfiguration {
    fn deserialize<D: serde::Deserializer<'de>>(
        deserializer: D,
    ) -> std::result::Result<Self, D::Error> {
        let wire = HmsWire::deserialize(deserializer)?;
        if !wire.enabled {
            return Ok(Self::Disabled);
        }
        Ok(Self::Enabled {
            region: wire
                .region
                .ok_or_else(|| serde::de::Error::missing_field("region"))?,
            policy: wire
                .policy
                .ok_or_else(|| serde::de::Error::missing_field("policy"))?,
            retention_days: wire.retention_days,
            policy_version: wire.policy_version,
            legal_hold: wire.legal_hold,
        })
    }
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionConfigurationOverrides {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub observation: Option<ObservationConfigurationPatch>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub history_sync: Option<HistorySyncPolicyPatch>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hms: Option<HmsConfiguration>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EffectiveSessionConfiguration {
    pub observation: ObservationConfiguration,
    pub history_sync: HistorySyncPolicy,
    pub hms: HmsConfiguration,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ConfigurationSource {
    Platform,
    Team,
    Project,
    Session,
    Consent,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ConfigurationSources {
    #[serde(rename = "historySync.mode")]
    pub history_sync_mode: ConfigurationSource,
    #[serde(rename = "historySync.requestFull")]
    pub history_sync_request_full: ConfigurationSource,
    pub hms: ConfigurationSource,
    #[serde(rename = "observation.presenceMode")]
    pub presence_mode: ConfigurationSource,
    #[serde(rename = "observation.typingMode")]
    pub typing_mode: ConfigurationSource,
    #[serde(rename = "observation.labelMode")]
    pub label_mode: ConfigurationSource,
    #[serde(rename = "observation.quickReplyMode")]
    pub quick_reply_mode: ConfigurationSource,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ConfigurationRevisions {
    pub team: u64,
    pub project: u64,
    pub session: u64,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigurationApplication {
    pub desired_generation: u64,
    pub applied_generation: u64,
    pub status: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionConfigurationView {
    pub effective: EffectiveSessionConfiguration,
    pub overrides: SessionConfigurationOverrides,
    pub sources: ConfigurationSources,
    pub requested_history: HistorySyncPolicy,
    pub history_consent: Option<String>,
    pub revisions: ConfigurationRevisions,
    pub application: Option<ConfigurationApplication>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum SessionConfigurationReset {
    #[serde(rename = "historySync")]
    HistorySync,
    #[serde(rename = "historySync.mode")]
    HistorySyncMode,
    #[serde(rename = "historySync.requestFull")]
    HistorySyncRequestFull,
    #[serde(rename = "hms")]
    Hms,
    #[serde(rename = "observation")]
    Observation,
    #[serde(rename = "observation.presenceMode")]
    PresenceMode,
    #[serde(rename = "observation.typingMode")]
    TypingMode,
    #[serde(rename = "observation.labelMode")]
    LabelMode,
    #[serde(rename = "observation.quickReplyMode")]
    QuickReplyMode,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct SessionConfigurationPatch {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub set: Option<SessionConfigurationOverrides>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reset: Option<Vec<SessionConfigurationReset>>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct UpdateSessionRequest {
    pub configuration: SessionConfigurationPatch,
    pub revision: u64,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct TestingProfile {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<String>,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TestingConfiguration {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub profile: Option<TestingProfile>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub account_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reply_behavior: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub failure_scenario: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub history_fixture_id: Option<String>,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct QuickLinkTestingConfiguration {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub country: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub configuration: Option<TestingConfiguration>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub editable: Option<Vec<String>>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudContactSyncStatus {
    pub request: String,
    pub receipt_recorded: bool,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudHistorySyncStatus {
    pub request: String,
    pub receipt_recorded: bool,
    pub delivery: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CloudSyncStatus {
    pub contacts: CloudContactSyncStatus,
    pub history: CloudHistorySyncStatus,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuickLinkOnboarding {
    pub stage: String,
    pub connection: Option<String>,
    pub coexistence: Option<bool>,
    pub contacts_sync: String,
    pub history_sync: String,
    pub history_progress: f64,
    pub sync: CloudSyncStatus,
    pub error_code: Option<String>,
}
