#[test]
fn remote_status_preserves_its_scope() {
    let event: polymorfa_sdk::signal::SignalEvent = serde_json::from_str(r#"{"id":"authored-status-event","type":"status.received","status_scope":"personal","session_id":"authored-session","chat":"status@broadcast","sender":"123@s.whatsapp.net","message_id":"authored-publication","timestamp":1700000000,"is_from_me":false,"redelivered":false,"identity_changed":false,"message_proto":"CgdmaXh0dXJl","text":"authored publication"}"#).unwrap();
    assert_eq!(event.event_type, "status.received");
    assert_eq!(event.status_scope.as_deref(), Some("personal"));
}
