use polymorfa_sdk::Credential;
#[test]
fn opaque_golden_and_rejections() {
    let org = "pmfa_AAECAwQFBgcICQoLDA0ODxAREhM73f-k";
    let project = "pmfa_pt_AAECAwQFBgcICQoLDA0ODxAREhM73f-k";
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
