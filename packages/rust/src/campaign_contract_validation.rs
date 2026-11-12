use crate::{campaign_contracts::*, transport::configuration, Result};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::Serialize;
use serde_json::Value;
use std::collections::BTreeSet;
pub(crate) const SAFE: u64 = 9_007_199_254_740_991;
pub(crate) fn ensure(ok: bool, field: &str) -> Result<()> {
    if ok {
        Ok(())
    } else {
        Err(configuration(field))
    }
}
pub(crate) fn uuid(s: &str, field: &str) -> Result<()> {
    ensure(
        s.len() == 36
            && s.bytes().enumerate().all(|(i, b)| {
                if [8, 13, 18, 23].contains(&i) {
                    b == b'-'
                } else {
                    b.is_ascii_hexdigit()
                }
            }),
        field,
    )
}
pub(crate) fn text(s: &str, min: usize, max: usize, field: &str) -> Result<()> {
    ensure((min..=max).contains(&s.encode_utf16().count()), field)
}
fn bytes(s: &str, min: usize, max: usize, field: &str) -> Result<()> {
    ensure((min..=max).contains(&s.len()), field)
}
pub(crate) fn es_space(c: char) -> bool {
    matches!(c,'\u{9}'..='\u{d}'|'\u{20}'|'\u{a0}'|'\u{1680}'|'\u{2000}'..='\u{200a}'|'\u{2028}'|'\u{2029}'|'\u{202f}'|'\u{205f}'|'\u{3000}'|'\u{feff}')
}
fn trim(s: &str) -> &str {
    s.trim_matches(es_space)
}
fn identifier(s: &str, first: impl Fn(u8) -> bool, rest: impl Fn(u8) -> bool, max: usize) -> bool {
    !s.is_empty() && s.len() <= max && first(s.as_bytes()[0]) && s.bytes().skip(1).all(rest)
}
fn node(s: &str) -> bool {
    identifier(
        s,
        |b| b.is_ascii_alphanumeric(),
        |b| b.is_ascii_alphanumeric() || b"._:-".contains(&b),
        64,
    )
}
fn variable(s: &str) -> bool {
    identifier(
        s,
        |b| b.is_ascii_alphanumeric() || b == b'_',
        |b| b.is_ascii_alphanumeric() || b"_.-".contains(&b),
        64,
    )
}
fn ascii_control(s: &str) -> bool {
    s.bytes().any(|b| b < 32 || b == 127)
}
fn message(s: &str, max: usize, multiline: bool) -> Result<()> {
    bytes(s, 1, max, "reply text")?;
    ensure(!multiline || !trim(s).is_empty(), "reply text")?;
    ensure(
        !s.chars()
            .any(|c| c.is_control() && !(multiline && matches!(c, '\n' | '\r' | '\t'))),
        "reply controls",
    )
}
/// ECMAScript fixed/scientific thresholds, independent from JSON wire spelling.
fn number_text(n: f64) -> String {
    if n == 0.0 {
        return "0".into();
    }
    let raw = serde_json::Number::from_f64(n)
        .expect("finite number")
        .to_string();
    let negative = raw.starts_with('-');
    let raw = raw.trim_start_matches('-');
    let (m, e) = raw
        .split_once('e')
        .map(|(a, b)| (a, b.parse::<i32>().unwrap()))
        .unwrap_or((raw, 0));
    let point = m.find('.').unwrap_or(m.len()) as i32;
    let mut digits = m.replace('.', "");
    while digits.len() > 1 && digits.ends_with('0') {
        digits.pop();
    }
    let effective = point + e;
    let sign = if negative { "-" } else { "" };
    if effective > 0 && effective <= 21 {
        if effective as usize >= digits.len() {
            format!(
                "{sign}{digits}{}",
                "0".repeat(effective as usize - digits.len())
            )
        } else {
            let (a, b) = digits.split_at(effective as usize);
            format!("{sign}{a}.{b}")
        }
    } else if effective <= 0 && effective > -6 {
        format!("{sign}0.{}{digits}", "0".repeat((-effective) as usize))
    } else {
        let tail = if digits.len() > 1 {
            format!(".{}", &digits[1..])
        } else {
            String::new()
        };
        let power = effective - 1;
        format!(
            "{sign}{}{tail}e{}{power}",
            &digits[..1],
            if power >= 0 { "+" } else { "" }
        )
    }
}
fn semantic(value: &Value) -> String {
    match value {
        Value::Number(n) => number_text(n.as_f64().unwrap()),
        Value::Array(a) => format!("[{}]", a.iter().map(semantic).collect::<Vec<_>>().join(",")),
        Value::Object(o) => format!(
            "{{{}}}",
            o.iter()
                .map(|(k, v)| format!("{}:{}", serde_json::to_string(k).unwrap(), semantic(v)))
                .collect::<Vec<_>>()
                .join(",")
        ),
        _ => value.to_string(),
    }
}
fn budget<T: Serialize>(v: &T, max: usize, field: &str) -> Result<()> {
    let value = serde_json::to_value(v).map_err(|_| configuration(field))?;
    ensure(semantic(&value).len() <= max, field)
}
fn scalar(v: &CampaignTestVariable) -> Result<()> {
    match v {
        CampaignTestVariable::Number(n) => ensure(n.is_finite(), "finite scalar"),
        _ => Ok(()),
    }
}
fn scalar_text(v: &CampaignTestVariable) -> String {
    match v {
        CampaignTestVariable::String(s) => s.clone(),
        CampaignTestVariable::Number(n) => number_text(*n),
        CampaignTestVariable::Boolean(b) => b.to_string(),
    }
}
fn reply_send(v: &CampaignReplyFlowSend) -> Result<()> {
    match v {
        CampaignReplyFlowSend::Text { text } => message(text, 4096, true),
        CampaignReplyFlowSend::Buttons {
            body,
            footer,
            buttons,
        } => {
            message(body, 1024, true)?;
            if let Some(s) = footer {
                message(s, 60, false)?;
            }
            ensure((1..=3).contains(&buttons.len()), "buttons")?;
            let mut ids = BTreeSet::new();
            for b in buttons {
                ensure(node(&b.id) && ids.insert(&b.id), "button id")?;
                message(&b.text, 20, false)?;
            }
            Ok(())
        }
        CampaignReplyFlowSend::List {
            body,
            button_text,
            footer,
            rows,
        } => {
            message(body, 1024, true)?;
            message(button_text, 20, false)?;
            if let Some(s) = footer {
                message(s, 60, false)?;
            }
            ensure((1..=10).contains(&rows.len()), "rows")?;
            let mut ids = BTreeSet::new();
            for r in rows {
                ensure(node(&r.id) && ids.insert(&r.id), "row id")?;
                message(&r.title, 24, false)?;
                if let Some(s) = &r.description {
                    message(s, 72, false)?;
                }
            }
            Ok(())
        }
        CampaignReplyFlowSend::FlowForm {
            flow_id,
            body,
            button_text,
            footer,
            screen,
        } => {
            uuid(flow_id, "flowId")?;
            message(body, 1024, true)?;
            message(button_text, 20, false)?;
            if let Some(s) = footer {
                message(s, 60, false)?;
            }
            ensure(
                !screen.is_empty()
                    && screen.len() <= 64
                    && screen
                        .bytes()
                        .all(|b| b.is_ascii_alphanumeric() || b == b'_'),
                "screen",
            )
        }
    }
}
pub(crate) fn definition(v: &CampaignReplyFlowDefinition, inbound: bool) -> Result<()> {
    ensure(
        node(&v.entry_node_id) && (2..=12).contains(&v.nodes.len()),
        "definition",
    )?;
    let mut ids = BTreeSet::new();
    for n in &v.nodes {
        ensure(
            node(&n.id) && ids.insert(&n.id) && n.edges.len() <= 3,
            "node",
        )?;
        if let Some(s) = &n.send {
            reply_send(s)?;
        }
        for e in &n.edges {
            ensure(node(&e.to), "edge.to")?;
            match &e.r#match {
                CampaignReplyFlowMatch::Choice { id, .. } => ensure(node(id), "choice")?,
                CampaignReplyFlowMatch::Keyword { value } => {
                    if inbound {
                        text(value, 1, 64, "keyword")?;
                        ensure(!value.chars().any(char::is_control), "keyword")?
                    } else {
                        message(value, 64, false)?
                    }
                }
                CampaignReplyFlowMatch::FlowSubmission => {}
            }
        }
    }
    budget(&v.nodes, 24 * 1024, "graph size")
}
pub(crate) fn reply_create(v: &CreateCampaignReplyFlowRequest) -> Result<()> {
    bytes(&v.name, 1, 128, "name")?;
    if let Some(s) = &v.flow_key {
        uuid(s, "flowKey")?;
    }
    if let Some(n) = v.revision {
        ensure((1..=1_000_000).contains(&n), "revision")?;
    }
    definition(&v.definition, false)
}
pub(crate) fn assignment(v: &SetCampaignReplyFlowRequest) -> Result<()> {
    if let Some(s) = &v.reply_flow_id {
        uuid(s, "replyFlowId")?;
    }
    Ok(())
}
pub(crate) fn test_send(v: &CampaignTestSendRequest) -> Result<()> {
    uuid(&v.session_id, "sessionId")?;
    text(&v.to, 1, 32, "to")?;
    if let Some(s) = &v.sample_recipient_id {
        uuid(s, "sampleRecipientId")?;
    }
    if let Some(vars) = &v.variables {
        ensure(vars.len() <= 50, "variables")?;
        for (k, v) in vars {
            ensure(variable(k), "variable key")?;
            scalar(v)?;
            text(&scalar_text(v), 0, 1024, "variable")?;
        }
    }
    Ok(())
}
pub(crate) fn export_query(
    v: &CampaignRecipientExportParameters,
) -> Result<Vec<(&'static str, String)>> {
    let mut q = Vec::new();
    if let Some(s) = v.status {
        q.push((
            "status",
            serde_json::to_value(s).unwrap().as_str().unwrap().into(),
        ));
    }
    if let Some(s) = v.reason {
        q.push((
            "reason",
            serde_json::to_value(s).unwrap().as_str().unwrap().into(),
        ));
    }
    if let Some(s) = &v.cursor {
        text(s, 1, 256, "cursor")?;
        q.push(("cursor", s.clone()));
    }
    if let Some(n) = v.limit {
        ensure((1..=1000).contains(&n), "limit")?;
        q.push(("limit", n.to_string()));
    }
    ensure(
        (v.status.is_none() && v.reason.is_none())
            || (v.cursor.is_none() && v.limit.is_none_or(|n| n == 1000)),
        "filtered export pagination",
    )?;
    Ok(q)
}
pub(crate) fn phone(s: &str) -> Result<()> {
    let Some(digits) = s.strip_prefix('+') else {
        return Err(configuration("phone"));
    };
    ensure(
        (7..=15).contains(&digits.len())
            && !digits.starts_with('0')
            && digits.bytes().all(|b| b.is_ascii_digit()),
        "phone",
    )
}
pub(crate) fn profile_list(
    v: &ListAudienceProfilesParameters,
) -> Result<Vec<(&'static str, String)>> {
    let base = ListAudienceProfilesParameters {
        cursor: v.cursor.clone(),
        limit: v.limit,
        ..Default::default()
    };
    let mut q = page(&base)?;
    if let Some(tag) = &v.tag {
        bytes(tag, 1, 48, "tag")?;
        ensure(!ascii_control(tag), "tag")?;
        q.push(("tag", tag.clone()));
    }
    if let Some(prefix) = &v.phone_prefix {
        let digits = prefix.strip_prefix('+').unwrap_or("");
        ensure(
            (1..=15).contains(&digits.len()) && digits.bytes().all(|b| b.is_ascii_digit()),
            "phonePrefix",
        )?;
        q.push(("phonePrefix", prefix.clone()));
    }
    Ok(q)
}
pub(crate) fn page(v: &ListAudienceProfilesParameters) -> Result<Vec<(&'static str, String)>> {
    ensure(
        v.tag.is_none() && v.phone_prefix.is_none(),
        "consent filters",
    )?;
    let mut q = Vec::new();
    if let Some(s) = &v.cursor {
        uuid(s, "cursor")?;
        q.push(("cursor", s.clone()));
    }
    if let Some(n) = v.limit {
        ensure((1..=100).contains(&n), "limit")?;
        q.push(("limit", n.to_string()));
    }
    Ok(q)
}
fn reference(s: &str) -> Result<()> {
    bytes(s, 1, 128, "reference")?;
    ensure(!ascii_control(s), "reference")
}
pub(crate) fn profile(v: &PutAudienceProfileRequest) -> Result<()> {
    if let Some(n) = v.expected_revision {
        ensure((1..=SAFE).contains(&n), "expectedRevision")?;
    }
    ensure(
        v.tags.len() <= 20 && v.attributes.len() <= 20,
        "profile collections",
    )?;
    let mut tags = BTreeSet::new();
    for t in &v.tags {
        bytes(t, 1, 48, "tag")?;
        ensure(!ascii_control(t) && tags.insert(t), "tag")?;
    }
    for (k, v) in &v.attributes {
        ensure(
            identifier(
                k,
                |b| b.is_ascii_alphabetic() || b == b'_',
                |b| b.is_ascii_alphanumeric() || b == b'_',
                48,
            ),
            "attribute key",
        )?;
        if let Some(v) = v {
            scalar(v)?;
            if let CampaignTestVariable::String(s) = v {
                bytes(s, 0, 256, "attribute")?;
                ensure(!s.contains('\0'), "attribute")?;
            }
        }
    }
    budget(&v.attributes, 8192, "attributes size")?;
    if let Some(p) = &v.provenance {
        reference(&p.reference)?;
    }
    if let Some(c) = &v.consent {
        reference(&c.reference)?;
        ensure(c.asserted_at <= 8_640_000_000_000_000, "assertedAt")?;
    }
    Ok(())
}
pub(crate) fn import(v: &CreateAudienceProfileImportRequest) -> Result<()> {
    ensure(
        !v.replay_key.is_empty()
            && v.replay_key.len() <= 128
            && v.replay_key
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b"._:-".contains(&b)),
        "replayKey",
    )?;
    ensure(
        !v.csv_base64.is_empty() && v.csv_base64.len() <= 13_981_016,
        "csvBase64",
    )?;
    let data = STANDARD
        .decode(&v.csv_base64)
        .map_err(|_| configuration("csvBase64"))?;
    ensure(
        data.len() <= 10 * 1024 * 1024
            && STANDARD.encode(&data) == v.csv_base64
            && !data.contains(&0)
            && std::str::from_utf8(&data).is_ok(),
        "csvBase64",
    )?;
    if let Some(m) = &v.mapping {
        let mut names = vec![&m.phone, &m.tags, &m.attributes];
        for s in [
            &m.expected_revision,
            &m.provenance_reference,
            &m.consent_allowed,
            &m.consent_asserted_at,
            &m.consent_reference,
        ]
        .into_iter()
        .flatten()
        {
            names.push(s);
        }
        let mut seen = BTreeSet::new();
        for s in names {
            bytes(s, 1, 64, "mapping")?;
            ensure(
                s == trim(s) && !s.chars().any(char::is_control) && seen.insert(s),
                "mapping",
            )?;
        }
    }
    let wire = serde_json::to_vec(v).map_err(|_| configuration("import body"))?;
    ensure(wire.len() <= 14 * 1024 * 1024, "import body size")
}
pub(crate) fn retarget(v: &CreateAudienceFromCampaignRequest) -> Result<()> {
    text(trim(&v.name), 1, 200, "name")?;
    uuid(&v.campaign_id, "campaignId")?;
    if let Some(s) = &v.project_id {
        uuid(s, "projectId")?;
    }
    Ok(())
}
pub(crate) fn confirmation(v: &UpdateStopConfirmationSettingsRequest) -> Result<()> {
    uuid(&v.team_id, "teamId")?;
    ensure(v.revision <= 2_147_483_646, "revision")?;
    ensure(!v.enabled || v.locale.is_some(), "locale")
}
pub(crate) fn custody(n: u64) -> Result<()> {
    ensure(n <= SAFE, "expectedRevision")
}

/// Response-specific checks; outbound transformations are never reapplied.
pub(crate) trait ContractModel: serde::de::DeserializeOwned + Serialize {
    fn validate_response(&self) -> Result<()> {
        Ok(())
    }
}
impl<T: ContractModel> ContractModel for Vec<T> {
    fn validate_response(&self) -> Result<()> {
        for v in self {
            v.validate_response()?;
        }
        Ok(())
    }
}
macro_rules! plain {($($n:ty),*)=>{$(impl ContractModel for $n {})*};}
plain!(
    CampaignTestSend,
    CampaignTrackedLinkReport,
    CampaignLaunchApproval,
    CampaignReplyFlowAssignment,
    AudienceFromCampaignResult,
    StopConfirmationSummary
);
impl ContractModel for CampaignSettings {
    fn validate_response(&self) -> Result<()> {
        ensure(
            self.launch_approval
                .recipient_threshold
                .is_none_or(|v| (1..=1_000_000).contains(&v)),
            "recipientThreshold",
        )
    }
}
impl ContractModel for CampaignReplyFlow {
    fn validate_response(&self) -> Result<()> {
        uuid(&self.id, "id")?;
        uuid(&self.flow_key, "flowKey")?;
        definition(&self.definition, true)
    }
}
impl ContractModel for SignalCustodyDefault {
    fn validate_response(&self) -> Result<()> {
        custody(self.revision)
    }
}
impl ContractModel for AudienceProfile {
    fn validate_response(&self) -> Result<()> {
        phone(&self.phone)?;
        ensure((1..=SAFE).contains(&self.revision), "revision")
    }
}
impl ContractModel for AudienceConsentAssertion {
    fn validate_response(&self) -> Result<()> {
        ensure(
            (1..=SAFE).contains(&self.profile_revision)
                && self.asserted_at <= 8_640_000_000_000_000,
            "consent",
        )
    }
}
impl ContractModel for DeleteAudienceProfileResult {
    fn validate_response(&self) -> Result<()> {
        ensure(
            self.deleted && (2..=SAFE).contains(&self.revision),
            "deletion receipt",
        )
    }
}
impl ContractModel for AudienceProfileImportJob {
    fn validate_response(&self) -> Result<()> {
        ensure(
            self.invalid_samples.len() <= 20
                && self.conflict_samples.len() <= 20
                && self.invalid_samples.iter().all(|v| v.row >= 2)
                && self.conflict_samples.iter().all(|v| v.row >= 2),
            "import samples",
        )
    }
}
impl ContractModel for StopConfirmationSettings {
    fn validate_response(&self) -> Result<()> {
        ensure(
            self.text_revision == 1
                && self.revision <= 2_147_483_647
                && (!self.enabled || self.locale.is_some()),
            "confirmation response",
        )
    }
}
impl<T: ContractModel> ContractModel for AudienceProfilePage<T> {
    fn validate_response(&self) -> Result<()> {
        for v in &self.data {
            v.validate_response()?;
        }
        if let Some(s) = &self.page.next_cursor {
            uuid(s, "nextCursor")?;
        }
        ensure(
            self.page.has_more == self.page.next_cursor.is_some(),
            "page",
        )
    }
}
