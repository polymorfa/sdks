use polymorfa_sdk::Credential;
#[test]
fn signed_v2_golden_and_rejections() {
    let org="pmfa_AlsicmZjODAzMi10ZXN0LW9ubHkiLCJ0ZXN0IiwiaHR0cHM6Ly9wbGF0Zm9ybS5leGFtcGxlLnRlc3QiLCJwb2x5bW9yZmEtYXBpIiwia2V5IiwiMTExMTExMTEtMTExMS00MTExLTgxMTEtMTExMTExMTExMTExIixudWxsXbjN-6gasxNDFbo2VaQINFS9h-9IDV4h2FAnK4ji8ByM53uN7XQ6MPjmBq13cVl96c-KYIU14G-UZynW-8KxGw8";
    let project="pmfa_pt_AlsicmZjODAzMi10ZXN0LW9ubHkiLCJ0ZXN0IiwiaHR0cHM6Ly9wbGF0Zm9ybS5leGFtcGxlLnRlc3QiLCJwb2x5bW9yZmEtYXBpIiwicHJvamVjdCIsIjIyMjIyMjIyLTIyMjItNDIyMi04MjIyLTIyMjIyMjIyMjIyMiIsbnVsbF35YUtyQHHoF1XFbKgPs7VdbBDzqsuY-qE64Aai_khRLdsvB9SBCsw4YPnmdjSVA6rW4CdtP6NKuj-KlYMZDuAL";
    assert!(Credential::organization_api_key(org).is_ok());
    assert!(Credential::project_token(project).is_ok());
    for invalid in [
        format!("{org}="),
        format!("{org}\n"),
        format!("pmfa_{}", "A".repeat(72)),
        "A".repeat(16385),
    ] {
        assert!(Credential::organization_api_key(invalid).is_err());
    }
    assert!(Credential::project_token(format!("pmfa_pt_{}", "A".repeat(94))).is_err());
}
