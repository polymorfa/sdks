//! A number's call history with the other party's identity, read from the
//! number's data region. Client tokens need the `read_calls` action.
use serde::{Deserialize, Serialize};

/// The other party: user ID, phone number or username, as the call reported them.
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionCallPeer {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub phone_number: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub username: Option<String>,
}

/// One call on a number.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionCallRecord {
    pub call_id: String,
    pub project_id: String,
    /// The number's session name.
    pub session_id: String,
    pub direction: String,
    pub upstream: String,
    pub outcome: String,
    pub state: String,
    pub has_video: bool,
    pub peer: Option<SessionCallPeer>,
    pub started_at: String,
    pub connected_at: Option<String>,
    pub ended_at: Option<String>,
    pub duration_seconds: Option<u32>,
    pub end_reason: Option<String>,
}

/// One page of a number's calls, newest first.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionCallsPage {
    pub success: bool,
    pub data: Vec<SessionCallRecord>,
    pub next_cursor: Option<String>,
}

/// Filters for a number's calls. `since` and `until` are ISO 8601 times
/// bounding when a call started.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListSessionCallsParams {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub limit: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cursor: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub direction: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub outcome: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub since: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub until: Option<String>,
}
