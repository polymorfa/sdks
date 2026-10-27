use polymorfa_sdk::webhooks::*;
use serde_json::json;

// Expected HMACs computed independently with Node's createHmac, not SDK signing.
const FLOW_HASH: &str = "40c0699cf9bbda7dcf00f63eaab05da212817dafa6278fc2dd3aeefa47c38108";
#[test]
fn forwarded_flow_signature_preserves_exact_timestamp_body_and_ecmascript_grammar() {
    let body = br#"{"action":"ping"}"#;
    let header = format!("t=001700000000,v1={FLOW_HASH}");
    let options = VerifyFlowForwardSignatureOptions {
        now_millis: Some(1_700_000_000_000.0),
        ..Default::default()
    };
    assert_eq!(FLOW_FORWARD_SIGNATURE_HEADER, "x-polymorfa-flow-signature");
    assert!(verify_flow_forward_signature(
        body,
        Some(&header),
        "endpoint-secret",
        options
    ));
    assert!(verify_flow_forward_signature(
        body,
        Some(&format!(
            "\u{feff} \t{}\r\n",
            header
                .to_uppercase()
                .replace("T=", "t=")
                .replace(",V1=", ",v1=")
        )),
        "endpoint-secret",
        options
    ));
    for malformed in [
        header.replace("001700000000", "1700000000"),
        header.replace("001700000000", "0001700000000"),
        format!("{header},v2=ignored"),
        format!("\u{0085}{header}"),
        header.replace("v1=", "v1=sha256="),
        "t=,v1=".into(),
    ] {
        assert!(!verify_flow_forward_signature(
            body,
            Some(&malformed),
            "endpoint-secret",
            options
        ));
    }
    assert!(!verify_flow_forward_signature(
        br#"{"action":"ping"} "#,
        Some(&header),
        "endpoint-secret",
        options
    ));
    assert!(!verify_flow_forward_signature(
        body,
        None,
        "endpoint-secret",
        options
    ));
    assert!(!verify_flow_forward_signature(
        body,
        Some(&header),
        "",
        options
    ));
    assert!(!verify_flow_forward_signature(
        body,
        Some(&header),
        "wrong-secret",
        options
    ));
    for skew in [-300.0, 300.0] {
        assert!(verify_flow_forward_signature(
            body,
            Some(&header),
            "endpoint-secret",
            VerifyFlowForwardSignatureOptions {
                now_millis: Some((1_700_000_000.0 + skew) * 1000.0),
                ..options
            }
        ));
    }
    for skew in [-300.001, 300.001] {
        assert!(!verify_flow_forward_signature(
            body,
            Some(&header),
            "endpoint-secret",
            VerifyFlowForwardSignatureOptions {
                now_millis: Some((1_700_000_000.0 + skew) * 1000.0),
                ..options
            }
        ));
    }
    assert!(verify_flow_forward_signature(
        body,
        Some(&header),
        "endpoint-secret",
        VerifyFlowForwardSignatureOptions {
            now_millis: Some(1_700_000_000_250.0),
            tolerance_seconds: 0.25
        }
    ));
    for tolerance in [-1.0, f64::NAN, f64::INFINITY] {
        assert!(!verify_flow_forward_signature(
            body,
            Some(&header),
            "endpoint-secret",
            VerifyFlowForwardSignatureOptions {
                tolerance_seconds: tolerance,
                ..options
            }
        ));
    }
    for now in [f64::NAN, f64::INFINITY, f64::NEG_INFINITY] {
        assert!(!verify_flow_forward_signature(
            body,
            Some(&header),
            "endpoint-secret",
            VerifyFlowForwardSignatureOptions {
                now_millis: Some(now),
                ..options
            }
        ));
    }
    assert!(!verify_signature(body, &header, "endpoint-secret"));
}

#[test]
fn webhook_fixture_has_exact_json_headers_independent_signature_and_tamper_refusal() {
    let event = WebhookEvent::Unknown(WebhookEnvelope {
        id: "event".into(),
        session: "".into(),
        external_id: None,
        timestamp: "2026-10-11T00:00:00Z".into(),
        event: "future.event".into(),
        payload: json!({"opaque":true}),
    });
    let fixture = create_fixture(&event, "fixture-secret").unwrap();
    assert_eq!(fixture.body, br#"{"id":"event","session":"","externalId":null,"timestamp":"2026-10-11T00:00:00Z","event":"future.event","payload":{"opaque":true}}"#);
    assert_eq!(fixture.content_type, "application/json");
    assert_eq!(
        fixture.signature,
        "072d86fd11b622a36cdb1166e4124bbbb6121640dec3c989ca98316e73d3d8eb"
    );
    assert_eq!(fixture.headers.len(), 2);
    assert_eq!(fixture.headers["content-type"], "application/json");
    assert_eq!(fixture.headers["x-webhook-signature"], fixture.signature);
    let verified = construct_event(&fixture.body, &fixture.signature, "fixture-secret").unwrap();
    assert!(matches!(verified, WebhookEvent::Unknown(_)));
    assert_eq!(verified.envelope().payload, event.envelope().payload);
    let mut tampered = fixture.body.clone();
    tampered.push(b' ');
    assert!(!verify_signature(
        &tampered,
        &fixture.signature,
        "fixture-secret"
    ));
    assert_eq!(
        create_fixture(&event, "").unwrap().signature,
        "44f7dc1eb2c249ff96b383a9e230271e2cb07e12771687796e7f8ef7d8ea496c"
    );
    // Known, typed payloads use the same verified fixture path.
    let known = parse_verified_event(br#"{"id":"known","session":"s","timestamp":"now","event":"session.status","payload":{"status":"connected"}}"#).unwrap();
    let fixture = create_fixture(&known, "fixture-secret").unwrap();
    assert!(matches!(
        construct_event(&fixture.body, &fixture.signature, "fixture-secret").unwrap(),
        WebhookEvent::SessionStatus { .. }
    ));
}
