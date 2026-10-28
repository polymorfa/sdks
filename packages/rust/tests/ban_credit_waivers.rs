use serde_json::json;

#[test]
fn ban_credit_waiver_verdicts_and_evidence_round_trip() {
    for (value, verdict) in [
        (
            "linked_device_interactive",
            polymorfa_sdk::bansafe::ClaimVerdict::LinkedDeviceInteractive,
        ),
        (
            "referral_group_send",
            polymorfa_sdk::bansafe::ClaimVerdict::ReferralGroupSend,
        ),
    ] {
        let decoded: polymorfa_sdk::bansafe::ClaimVerdict =
            serde_json::from_value(json!(value)).unwrap();
        assert_eq!(decoded, verdict);
        assert_eq!(serde_json::to_value(decoded).unwrap(), json!(value));
        let webhook: polymorfa_sdk::webhook_payloads::BanSafeClaimVerdict =
            serde_json::from_value(json!(value)).unwrap();
        assert_eq!(serde_json::to_value(webhook).unwrap(), json!(value));
    }
    let evidence: polymorfa_sdk::bansafe::ClaimEvidence = serde_json::from_value(json!({"attributionRuleVersion":3,"windowDays":30,"deviceEvidence":false,"otherDevices":0,"restrictedInWindow":false,"criticalFindingDays":0,"sharedConnection":false,"simultaneousCalls":false,"linkedDeviceInteractive":true,"referralGroupSend":true,"measuredHours":0})).unwrap();
    assert_eq!(evidence.attribution_rule_version, Some(3));
    assert!(evidence.linked_device_interactive);
    assert!(evidence.referral_group_send);
    let encoded = serde_json::to_value(&evidence).unwrap();
    assert_eq!(encoded["linkedDeviceInteractive"], json!(true));
    assert_eq!(encoded["referralGroupSend"], json!(true));
}
