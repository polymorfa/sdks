//! Request-only checks for the existing campaign contracts. Stored results have separate schemas.
use crate::{campaigns::CampaignMessage, Error, ErrorKind, Result};
use serde::Serialize;
use serde_json::Value;
use std::collections::BTreeSet;
pub(crate) fn input_error() -> Error {
    Error::local(
        ErrorKind::Validation,
        "Invalid campaign request field",
        "invalid_parameter",
    )
}
/// ECMAScript WhiteSpace and LineTerminator, excluding NEL and Unicode case folding.
fn ecma_space(c: char) -> bool {
    matches!(c,'\u{0009}'..='\u{000d}'|'\u{0020}'|'\u{00a0}'|'\u{1680}'|'\u{2000}'..='\u{200a}'|'\u{2028}'|'\u{2029}'|'\u{202f}'|'\u{205f}'|'\u{3000}'|'\u{feff}')
}
fn trim(s: &str) -> &str {
    s.trim_matches(ecma_space)
}
fn text(v: &Value, min: usize, max: usize) -> Result<&str> {
    v.as_str()
        .filter(|s| (min..=max).contains(&s.encode_utf16().count()))
        .ok_or_else(input_error)
}
fn object(v: &Value) -> Result<&serde_json::Map<String, Value>> {
    v.as_object().ok_or_else(input_error)
}
fn integer(v: &Value, min: u64, max: u64) -> Result<()> {
    if v.as_u64().is_some_and(|n| (min..=max).contains(&n)) {
        Ok(())
    } else {
        Err(input_error())
    }
}
fn fields(v: &Value, allowed: &[&str]) -> Result<()> {
    if object(v)?.keys().all(|k| allowed.contains(&k.as_str())) {
        Ok(())
    } else {
        Err(input_error())
    }
}
fn name(s: &str) -> bool {
    !s.is_empty()
        && s.len() <= 64
        && s.bytes().enumerate().all(|(i, c)| {
            c.is_ascii_alphanumeric() || c == b'_' || (i > 0 && matches!(c, b'.' | b'-'))
        })
}
fn mapping(v: &Value) -> Result<()> {
    let entries = object(v)?;
    if entries.len() > 50 {
        return Err(input_error());
    }
    for (key, v) in entries {
        if !name(key) {
            return Err(input_error());
        }
        fields(v, &["source", "fallback"])?;
        if v.get("source")
            .is_some_and(|v| v.as_str().is_none_or(|s| !name(s)))
        {
            return Err(input_error());
        }
        if let Some(v) = v.get("fallback") {
            if trim(text(v, 1, 1024)?).is_empty() {
                return Err(input_error());
            }
        }
    }
    Ok(())
}
fn links(v: &Value) -> Result<()> {
    if v.is_null() {
        return Ok(());
    }
    let rows = v
        .as_array()
        .filter(|a| a.len() <= 5)
        .ok_or_else(input_error)?;
    let mut seen = BTreeSet::new();
    for v in rows {
        fields(v, &["key", "url"])?;
        let key = text(&v["key"], 1, 32)?;
        if !key
            .bytes()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == b'_')
            || !seen.insert(key)
        {
            return Err(input_error());
        }
        let raw = text(&v["url"], 1, 2048)?;
        if raw
            .chars()
            .any(|c| ecma_space(c) || (c as u32) < 32 || c == '\u{7f}')
        {
            return Err(input_error());
        }
        let url = url::Url::parse(raw).map_err(|_| input_error())?;
        let host = url.host_str().unwrap_or("");
        let host = host.strip_suffix('.').unwrap_or(host);
        if url.scheme() != "https"
            || !url.username().is_empty()
            || url.password().is_some()
            || url.as_str().encode_utf16().count() > 2048
            || !host.contains('.')
            || host.starts_with('[')
            || host.bytes().all(|c| c.is_ascii_digit() || c == b'.')
            || host
                .rsplit('.')
                .next()
                .is_some_and(|s| !s.is_empty() && s.bytes().all(|c| c.is_ascii_digit()))
            || [".local", ".internal", ".localhost"]
                .iter()
                .any(|s| host.ends_with(s))
        {
            return Err(input_error());
        }
    }
    Ok(())
}
fn follow_up(v: &Value) -> Result<()> {
    if v.is_null() {
        return Ok(());
    }
    fields(v, &["message", "delaySeconds", "expirySeconds"])?;
    let delay = v.get("delaySeconds").cloned().unwrap_or(Value::from(86400));
    let expiry = v
        .get("expirySeconds")
        .cloned()
        .unwrap_or(Value::from(604800));
    integer(&delay, 60, 604800)?;
    integer(&expiry, 86400, 2592000)?;
    if expiry.as_u64() <= delay.as_u64() {
        return Err(input_error());
    }
    let m = &v["message"];
    match m["type"].as_str() {
        Some("text") => {
            fields(m, &["type", "text"])?;
            let s = text(&m["text"], 1, 16384)?;
            if s.match_indices("{{").any(|(i, _)| {
                s[i + 2..]
                    .trim_start_matches(ecma_space)
                    .get(..5)
                    .is_some_and(|p| p.eq_ignore_ascii_case("link:"))
            }) {
                return Err(input_error());
            }
        }
        Some("template") => {
            fields(m, &["type", "templateId"])?;
            if !uuid(text(&m["templateId"], 1, 36)?) {
                return Err(input_error());
            }
        }
        _ => return Err(input_error()),
    }
    Ok(())
}
fn alternatives(v: &Value, variants: bool, platform: bool) -> Result<()> {
    let rows = v
        .as_array()
        .filter(|a| (2..=if variants { 4 } else { 5 }).contains(&a.len()))
        .ok_or_else(input_error)?;
    let mut seen = BTreeSet::new();
    let mut total = 0;
    for row in rows {
        let key = text(&row["key"], 1, 16)?;
        if !key.as_bytes()[0].is_ascii_lowercase()
            || !key
                .bytes()
                .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || matches!(b, b'_' | b'-'))
            || !seen.insert(key)
        {
            return Err(input_error());
        }
        integer(&row["weight"], 1, 99)?;
        total += row["weight"].as_u64().unwrap();
        if variants {
            let label = text(&row["label"], 1, usize::MAX)?;
            let label = if platform { label } else { trim(label) };
            if label.is_empty() || label.encode_utf16().count() > 100 {
                return Err(input_error());
            }
        }
        let b = &row["blueprint"];
        if b["version"] != 2 || trim(text(&b["source"], 1, 4096)?).is_empty() {
            return Err(input_error());
        }
    }
    if total != 100 {
        return Err(input_error());
    }
    Ok(())
}
pub(crate) fn validate_message_extensions(messages: &[CampaignMessage]) -> Result<()> {
    fn reserved(map: &std::collections::BTreeMap<String, Value>, keys: &[&str]) -> Result<()> {
        if keys.iter().any(|k| map.contains_key(*k)) {
            Err(input_error())
        } else {
            Ok(())
        }
    }
    if messages.len() > 10 {
        return Err(input_error());
    }
    for m in messages {
        reserved(
            &m.extensions,
            &[
                "version",
                "source",
                "media",
                "buttons",
                "footer",
                "delayAfterSec",
            ],
        )?;
        if m.delay_after_sec.is_some_and(|n| n > 86400) {
            return Err(input_error());
        }
        if let Some(media) = &m.media {
            reserved(&media.extensions, &["kind", "url", "filename", "caption"])?;
        }
        if let Some(buttons) = &m.buttons {
            for b in buttons {
                reserved(&b.extensions, &["kind", "label", "url", "phone"])?;
            }
        }
    }
    Ok(())
}
pub(crate) fn validate_input<T: Serialize>(body: &T, platform: bool, patch: bool) -> Result<()> {
    let v = serde_json::to_value(body).map_err(|_| input_error())?;
    if let Some(v) = v.get("variableMapping").filter(|v| !v.is_null()) {
        mapping(v)?;
    }
    if let Some(v) = v.get("trackedLinks") {
        links(v)?;
    }
    if let Some(v) = v
        .get("templateId")
        .filter(|_| patch)
        .filter(|v| !v.is_null())
    {
        if !uuid(text(v, 1, 36)?) {
            return Err(input_error());
        }
    }
    if let Some(v) = v.get("followUp") {
        follow_up(v)?;
    }
    for (key, var) in [("variants", true), ("messageVariations", false)] {
        if let Some(v) = v.get(key).filter(|v| !v.is_null()) {
            alternatives(v, var, platform)?;
        }
    }
    if let Some(s) = v.get("variantStrategy").filter(|s| !s.is_null()) {
        integer(&s["holdoutPercent"], 0, 30)?;
        integer(&s["testWindowMinutes"], 15, 1440)?;
        if let Some(n) = s.get("testSlicePercent") {
            integer(n, 5, 50)?;
        }
        if s["autoPromote"] != true {
            return Err(input_error());
        }
    }
    if let Some(v) = v.get("messagesArray") {
        let messages: Vec<CampaignMessage> =
            serde_json::from_value(v.clone()).map_err(|_| input_error())?;
        validate_message_extensions(&messages)?;
    }
    Ok(())
}

pub(crate) fn uuid(s: &str) -> bool {
    s.len() == 36
        && s.bytes().enumerate().all(|(i, b)| {
            if [8, 13, 18, 23].contains(&i) {
                b == b'-'
            } else {
                b.is_ascii_hexdigit()
            }
        })
}
