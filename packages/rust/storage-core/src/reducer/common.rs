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
// ECMAScript WhiteSpace + LineTerminator. Native Unicode trim also accepts NEL.
fn proto_space(c: char) -> bool {
    matches!(c, '\u{0009}'..='\u{000d}' | '\u{0020}' | '\u{00a0}' | '\u{1680}' | '\u{2000}'..='\u{200a}' | '\u{2028}' | '\u{2029}' | '\u{202f}' | '\u{205f}' | '\u{3000}' | '\u{feff}')
}
fn proto_decimal(s: &[u8]) -> bool {
    let mut at = usize::from(matches!(s.first(), Some(b'+' | b'-')));
    let start = at;
    while s.get(at).is_some_and(u8::is_ascii_digit) {
        at += 1;
    }
    let mut digits = at - start;
    if s.get(at) == Some(&b'.') {
        at += 1;
        let start = at;
        while s.get(at).is_some_and(u8::is_ascii_digit) {
            at += 1;
        }
        digits += at - start;
    }
    if digits == 0 {
        return false;
    }
    if matches!(s.get(at), Some(b'e' | b'E')) {
        at += 1;
        if matches!(s.get(at), Some(b'+' | b'-')) {
            at += 1;
        }
        let start = at;
        while s.get(at).is_some_and(u8::is_ascii_digit) {
            at += 1;
        }
        if at == start {
            return false;
        }
    }
    at == s.len()
}
fn proto_radix(digits: &[u8], width: u32) -> Option<f64> {
    if digits.is_empty() {
        return None;
    }
    let mut length = 0_u32;
    let mut head = 0_u64;
    let mut guard = false;
    let mut sticky = false;
    for &c in digits {
        let digit = match c {
            b'0'..=b'9' => c - b'0',
            b'a'..=b'f' => c - b'a' + 10,
            b'A'..=b'F' => c - b'A' + 10,
            _ => return None,
        };
        if u32::from(digit) >= 1 << width {
            return None;
        }
        for shift in (0..width).rev() {
            let bit = u64::from((digit >> shift) & 1);
            if length == 0 && bit == 0 {
                continue;
            }
            // Saturation bounds counters while still validating every digit.
            length = (length + 1).min(1025);
            if length <= 53 {
                head = (head << 1) | bit;
            } else if length == 54 {
                guard = bit != 0;
            } else {
                sticky |= bit != 0;
            }
        }
    }
    if length > 1024 {
        return None;
    }
    if length <= 53 {
        return Some(head as f64);
    }
    if guard && (sticky || head & 1 != 0) {
        head += 1;
    }
    Some((head as f64) * 2_f64.powi((length - 53) as i32)).filter(|n| n.is_finite())
}
pub(crate) fn numeric(v: &Value) -> Option<f64> {
    if let Some(n) = number(v) {
        return Some(n);
    }
    let s = v.as_str()?.trim_matches(proto_space);
    if s.is_empty() {
        return Some(0.);
    }
    let b = s.as_bytes();
    if b.first() == Some(&b'0') {
        let width = match b.get(1) {
            Some(b'x' | b'X') => 4,
            Some(b'o' | b'O') => 3,
            Some(b'b' | b'B') => 1,
            _ => 0,
        };
        if width != 0 {
            return proto_radix(&b[2..], width);
        }
    }
    if !proto_decimal(b) {
        return None;
    }
    s.parse::<f64>().ok().filter(|n| n.is_finite())
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
