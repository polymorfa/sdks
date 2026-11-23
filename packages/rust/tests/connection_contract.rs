use polymorfa_sdk::models::{Connection, ConnectionMethod, ConnectionType};
use serde_json::json;

fn root() -> serde_json::Value {
    json!({"connectionId":"stable-session-id","name":"support","tenantId":"team","type":"whatsapp","method":"hybrid","testMode":true,"status":"CONNECTED","createdAt":"2026-11-16T00:00:00Z","updatedAt":"2026-11-16T00:00:00Z","phoneNumberId":"provider-phone-id"})
}
#[test]
fn one_root_has_a_platform_type_and_one_scalar_method() {
    for (wire, method) in [
        ("linked_device", ConnectionMethod::LinkedDevice),
        ("cloud_api", ConnectionMethod::CloudApi),
        ("hybrid", ConnectionMethod::Hybrid),
    ] {
        let mut value = root();
        value["method"] = json!(wire);
        let connection: Connection = serde_json::from_value(value).unwrap();
        assert_eq!(connection.connection_type, ConnectionType::Whatsapp);
        assert_eq!(connection.method, method);
        assert_eq!(connection.connection_id, "stable-session-id");
        assert_eq!(
            connection.phone_number_id.as_deref(),
            Some("provider-phone-id")
        );
        let encoded = serde_json::to_value(connection).unwrap();
        assert_eq!(encoded["method"], wire);
        assert!(encoded.get("sessionId").is_none() && encoded.get("methods").is_none());
    }
}
#[test]
fn old_account_shapes_are_refused() {
    let mut old = root();
    old.as_object_mut().unwrap().remove("method");
    assert!(serde_json::from_value::<Connection>(old).is_err());
    let mut old = root();
    old["type"] = json!("linked_device");
    assert!(serde_json::from_value::<Connection>(old).is_err());
    let mut old = root();
    let selector = old.as_object_mut().unwrap().remove("connectionId").unwrap();
    old["sessionId"] = selector;
    assert!(serde_json::from_value::<Connection>(old).is_err());
}
