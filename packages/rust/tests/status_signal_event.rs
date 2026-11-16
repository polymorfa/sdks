#[test]
fn remote_status_preserves_its_scope() {
    let event: polymorfa_sdk::signal::SignalEvent = serde_json::from_str(r#"{"id":"authored-status-event","type":"status.received","status_scope":"personal","session_id":"authored-session","chat":"status@broadcast","sender":"123@s.whatsapp.net","message_id":"authored-publication","timestamp":1700000000,"is_from_me":false,"redelivered":false,"identity_changed":false,"message_proto":"CgdmaXh0dXJl","text":"authored publication"}"#).unwrap();
    assert_eq!(event.event_type, "status.received");
    assert_eq!(event.status_scope.as_deref(), Some("personal"));
}

#[test]
fn verified_status_events_require_a_known_scope_while_messages_do_not() {
    use hmac::{Hmac, Mac};
    use polymorfa_sdk::signal::verify_signal_webhook;
    use sha2::Sha256;
    use std::time::Duration;
    for scope in [
        None,
        Some(""),
        Some("future"),
        Some("personal"),
        Some("group"),
        Some("channel"),
    ] {
        for event_type in ["message", "status.received"] {
            let mut value = serde_json::json!({"id":"authored-status-event","type":event_type,"session_id":"authored-session","chat":"status@broadcast","sender":"123@s.whatsapp.net","message_id":"authored-publication","timestamp":1700000000,"is_from_me":false,"redelivered":false,"identity_changed":false,"message_proto":""});
            if let Some(scope) = scope {
                value["status_scope"] = scope.into();
            }
            let body = serde_json::to_vec(&value).unwrap();
            let secret = b"authored-signal-webhook-secret";
            let mut mac = Hmac::<Sha256>::new_from_slice(secret).unwrap();
            mac.update(b"100.");
            mac.update(&body);
            let signature = format!("v1={}", hex::encode(mac.finalize().into_bytes()));
            let result =
                verify_signal_webhook(secret, 100, &body, &signature, 100, Duration::from_secs(5));
            assert_eq!(
                result.is_ok(),
                event_type == "message" || matches!(scope, Some("personal" | "group" | "channel"))
            );
        }
    }
}
