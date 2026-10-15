use crate::*;
use serde_json::{json, Value};
pub const SELF_ID: &str = "self";
pub const CONTENT_FIELDS: &[&str] = &[
    "text",
    "caption",
    "mimeType",
    "fileName",
    "latitude",
    "longitude",
    "displayName",
    "title",
    "pollOptions",
    "extra",
];
pub const MEDIA_SECRET_FIELDS: &[&str] = &[
    "mediaKey",
    "descriptor",
    "directPath",
    "downloadUrl",
    "fileSha256",
    "fileEncSha256",
];
pub(crate) fn text(v: &Value) -> Option<&str> {
    v.as_str().filter(|s| !s.is_empty())
}
pub(crate) fn string(v: &Value) -> Option<Value> {
    text(v).map(|s| json!(s))
}
pub(crate) fn number(v: &Value) -> Option<f64> {
    v.as_f64().filter(|n| n.is_finite())
}
pub(crate) fn array(v: &Value) -> &[Value] {
    v.as_array().map(Vec::as_slice).unwrap_or(&[])
}
pub(crate) fn numeric(v: &Value) -> Option<f64> {
    if let Some(n) = number(v) {
        return Some(n);
    }
    let s = v.as_str()?.trim();
    if s.is_empty() {
        return Some(0.);
    }
    let n = if let Some(s) = s.strip_prefix("0x").or_else(|| s.strip_prefix("0X")) {
        u64::from_str_radix(s, 16).ok().map(|n| n as f64)
    } else if let Some(s) = s.strip_prefix("0b").or_else(|| s.strip_prefix("0B")) {
        u64::from_str_radix(s, 2).ok().map(|n| n as f64)
    } else if let Some(s) = s.strip_prefix("0o").or_else(|| s.strip_prefix("0O")) {
        u64::from_str_radix(s, 8).ok().map(|n| n as f64)
    } else {
        s.parse::<f64>().ok()
    };
    n.filter(|n| n.is_finite())
}
pub fn to_millis(value: Option<f64>) -> Option<f64> {
    value
        .filter(|n| n.is_finite() && *n > 0.)
        .map(|n| (if n < 100_000_000_000. { n * 1000. } else { n }).round())
}
pub(crate) fn iso_millis(value: &str) -> f64 {
    chrono::DateTime::parse_from_rfc3339(value)
        .map(|t| t.timestamp_millis() as f64)
        .unwrap_or(0.)
}
pub(crate) fn put(fields: &mut FieldWrites, name: &str, value: Option<Value>, version: f64) {
    if let Some(value) = value {
        fields.insert(name.into(), FieldWrite { value, version });
    }
}
pub(crate) fn set(fields: &mut FieldWrites, name: &str, value: impl Into<Value>, version: f64) {
    put(fields, name, Some(value.into()), version);
}
pub(crate) fn copy(fields: &mut FieldWrites, name: &str, p: &Value, input: &str, version: f64) {
    put(fields, name, p.get(input).cloned(), version);
}
pub(crate) fn str_field(
    fields: &mut FieldWrites,
    name: &str,
    p: &Value,
    input: &str,
    version: f64,
) {
    put(fields, name, string(&p[input]), version);
}
pub(crate) fn clear(names: &[&str]) -> FieldWrites {
    names
        .iter()
        .map(|s| {
            (
                (*s).into(),
                FieldWrite {
                    value: Value::Null,
                    version: merge::FINAL_VERSION,
                },
            )
        })
        .collect()
}
pub(crate) fn upsert(
    entity: Entity,
    session: &str,
    ids: &[(&str, &str)],
    fields: FieldWrites,
    guard: Option<ChatWatermarkGuard>,
) -> StorageOperation {
    let mut key = RowKey::from([("sessionId".into(), session.into())]);
    key.extend(ids.iter().map(|(k, v)| ((*k).into(), (*v).into())));
    StorageOperation::Upsert {
        entity,
        key,
        fields,
        guard,
    }
}
pub(crate) fn guard(
    session: &str,
    chat: &str,
    timestamp: Option<f64>,
) -> Option<ChatWatermarkGuard> {
    timestamp.map(|timestamp| ChatWatermarkGuard {
        session_id: session.into(),
        chat_id: chat.into(),
        timestamp,
    })
}
pub fn chat_kind(jid: Option<&str>, group: Option<bool>) -> Option<&'static str> {
    if group == Some(true) {
        return Some("group");
    }
    if let Some(jid) = jid {
        for (suffix, kind) in [
            ("@g.us", "group"),
            ("@newsletter", "channel"),
            ("@broadcast", "broadcast"),
            ("@s.whatsapp.net", "direct"),
            ("@lid", "direct"),
            ("@c.us", "direct"),
        ] {
            if jid.ends_with(suffix) {
                return Some(kind);
            }
        }
    }
    (group == Some(false)).then_some("direct")
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MessageStatus {
    Pending,
    Failed,
    Sent,
    Delivered,
    Read,
    Played,
}
impl MessageStatus {
    pub fn rank(self) -> u8 {
        match self {
            Self::Pending => 1,
            Self::Failed => 2,
            Self::Sent => 3,
            Self::Delivered => 4,
            Self::Read => 5,
            Self::Played => 6,
        }
    }
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Pending => "pending",
            Self::Failed => "failed",
            Self::Sent => "sent",
            Self::Delivered => "delivered",
            Self::Read => "read",
            Self::Played => "played",
        }
    }
}
pub(crate) fn status(fields: &mut FieldWrites, state: MessageStatus, at: Option<f64>) {
    set(fields, "status", state.as_str(), state.rank() as f64);
    put(
        fields,
        "statusAt",
        at.map(|n| json!(n)),
        state.rank() as f64,
    );
}
