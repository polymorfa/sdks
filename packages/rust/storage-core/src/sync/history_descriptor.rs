use crate::{StorageError, StorageResult};
use serde_json::Value;
fn text(v: &Value, min: usize, max: usize) -> bool {
    v.as_str()
        .is_some_and(|s| (min..=max).contains(&s.encode_utf16().count()))
}
fn ids(v: &Value) -> bool {
    v.as_object().is_some_and(|m| {
        !m.is_empty()
            && m.iter().all(|(k, v)| {
                matches!(k.as_str(), "linked_devices" | "official_api") && text(v, 1, 512)
            })
    })
}
fn integer(v: &Value) -> bool {
    v.as_f64()
        .is_some_and(|n| n.is_finite() && n >= 0.0 && n.fract() == 0.0)
}
fn fields(m: &serde_json::Map<String, Value>, allowed: &[&str]) -> bool {
    m.keys().all(|key| allowed.contains(&key.as_str()))
}
fn datetime(v: &Value) -> bool {
    let Some(s) = v.as_str() else { return false };
    if !s.is_ascii() || !s.ends_with('Z') || s.len() < 17 || s.as_bytes()[10] != b'T' {
        return false;
    }
    let number = |s: &str| {
        if s.bytes().all(|b| b.is_ascii_digit()) {
            s.parse::<u32>().ok()
        } else {
            None
        }
    };
    let (Some(y), Some(m), Some(d)) = (number(&s[0..4]), number(&s[5..7]), number(&s[8..10]))
    else {
        return false;
    };
    if s.as_bytes()[4] != b'-'
        || s.as_bytes()[7] != b'-'
        || chrono::NaiveDate::from_ymd_opt(y as i32, m, d).is_none()
    {
        return false;
    }
    let t: Vec<_> = s[11..s.len() - 1].split(':').collect();
    if !(2..=3).contains(&t.len())
        || t[0].len() != 2
        || t[1].len() != 2
        || number(t[0]).is_none_or(|n| n > 23)
        || number(t[1]).is_none_or(|n| n > 59)
    {
        return false;
    }
    if t.len() == 3 {
        let pieces: Vec<_> = t[2].split('.').collect();
        if pieces.len() > 2
            || pieces[0].len() != 2
            || number(pieces[0]).is_none_or(|n| n > 59)
            || pieces
                .get(1)
                .is_some_and(|v| v.is_empty() || !v.bytes().all(|b| b.is_ascii_digit()))
        {
            return false;
        }
    }
    true
}
/// Descriptor bodies match the strict producer projection. Other events stay raw.
pub(super) fn validate(p: &Value) -> StorageResult<()> {
    let valid = || -> Option<()> {
        let m = p.as_object()?;
        if !fields(
            m,
            &[
                "delivery",
                "whatsapp_ids",
                "original_whatsapp_ids",
                "whatsapp_id",
                "original_whatsapp_id",
                "syncType",
                "fileLength",
                "chunkOrder",
                "progress",
                "oldestMessageAt",
                "peerDataRequestSessionId",
                "media",
                "inline",
            ],
        ) || p["delivery"] != "descriptor"
            || !ids(&p["whatsapp_ids"])
            || !text(&p["syncType"], 1, usize::MAX)
            || !integer(&p["fileLength"])
        {
            return None;
        }
        for k in ["whatsapp_id", "original_whatsapp_id"] {
            if m.get(k).is_some_and(|v| !text(v, 1, 512)) {
                return None;
            }
        }
        if m.get("original_whatsapp_ids").is_some_and(|v| !ids(v)) {
            return None;
        }
        for k in ["chunkOrder", "progress"] {
            if m.get(k).is_some_and(|v| !integer(v)) {
                return None;
            }
        }
        if m.get("progress")
            .is_some_and(|v| v.as_f64().unwrap_or(f64::INFINITY) > 100.0)
            || m.get("oldestMessageAt").is_some_and(|v| !datetime(v))
            || m.get("peerDataRequestSessionId")
                .is_some_and(|v| !v.is_string())
        {
            return None;
        }
        if m.contains_key("media") == m.contains_key("inline") {
            return None;
        }
        if let Some(d) = m.get("media") {
            let d = d.as_object()?;
            if !fields(
                d,
                &[
                    "type",
                    "directPath",
                    "mediaKey",
                    "fileSha256",
                    "fileEncSha256",
                    "encHandle",
                ],
            ) || d.get("type")? != "md-msg-hist"
                || ["directPath", "mediaKey", "fileSha256", "fileEncSha256"]
                    .iter()
                    .any(|k| !text(d.get(*k).unwrap_or(&Value::Null), 1, usize::MAX))
                || d.get("encHandle").is_some_and(|v| !v.is_string())
            {
                return None;
            }
        } else {
            let d = p["inline"].as_object()?;
            if !fields(d, &["encoding", "data"])
                || d.get("encoding")? != "zlib-base64-protobuf"
                || !text(d.get("data")?, 1, usize::MAX)
            {
                return None;
            }
        }
        Some(())
    };
    valid().ok_or(StorageError::Invalid("Invalid history descriptor."))
}
