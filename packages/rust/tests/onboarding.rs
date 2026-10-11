#[allow(dead_code)]
mod support;
use polymorfa_sdk::{onboarding::*, ErrorKind, RequestOptions};
use serde_json::json;
#[tokio::test]
async fn embedded_signup_and_simulated_event_history_resources_native_wire() {
    wire_messaging!(
        client,
        "POST",
        "/messaging/cloud-api/embedded-signup",
        Some(
            json!({"quicklinkId":"quicklink","projectId":"project","result":{"code":"code","wabaId":"waba","phoneNumberId":"number","coexistence":true,"historySync":true}})
        ),
        json!({"success":true,"data":{"stage":"ready"}}),
        client.cloud_onboarding().advance(
            &EmbeddedSignupRequest {
                quicklink_id: "quicklink".into(),
                project_id: Some("project".into()),
                result: Some(EmbeddedSignupResult {
                    code: "code".into(),
                    waba_id: "waba".into(),
                    phone_number_id: "number".into(),
                    coexistence: Some(true),
                    history_sync: Some(true)
                })
            },
            RequestOptions::default()
        )
    );
    wire_messaging!(
        client,
        "POST",
        "/messaging/testing/project/history-fixtures",
        Some(
            json!({"messages":[{"id":"message","senderPhone":"+15551234567","text":"History","timestamp":1000,"fromMe":false}]})
        ),
        json!({"fixtureId":"fixture"}),
        client.testing().create_history_fixture(
            "project",
            &CreateHistoryFixtureRequest {
                messages: vec![TestingHistoryMessage {
                    id: "message".into(),
                    sender_phone: "+15551234567".into(),
                    text: "History".into(),
                    timestamp: 1000,
                    from_me: false
                }]
            },
            RequestOptions::default()
        )
    );
    wire_messaging!(
        client,
        "POST",
        "/messaging/testing/project/events",
        Some(
            json!({"session":"support","event":"message.received","overrides":{"text":"Hello","mediaType":"image","caption":"Caption"},"fromSession":"other"})
        ),
        json!({"event":"message.received","session":"support","delivery":"simulated","eventId":null,"source":"runtime"}),
        client.testing().trigger_event(
            "project",
            &TriggerTestEventRequest {
                session: "support".into(),
                event: TestEventFixture::MessageReceived,
                overrides: Some(TestEventOverrides {
                    text: Some("Hello".into()),
                    media_type: Some(TestMediaType::Image),
                    caption: Some("Caption".into()),
                    ..Default::default()
                }),
                from_session: Some("other".into())
            },
            RequestOptions::default()
        )
    );
    wire_messaging!(
        client,
        "GET",
        "/messaging/testing/project/events/fixtures",
        None,
        json!({"fixtures":[{"name":"message.received","description":"Inbound message","overrides":["text","from","mediaType","caption"]},{"name":"session.status","description":"Status","overrides":["status","statusReason"]}]}),
        client
            .testing()
            .list_event_fixtures("project", RequestOptions::default())
    );
}
#[tokio::test]
async fn simulated_phone_supplemental_native_wire_and_invalid_device_guard() {
    wire_messaging!(
        client,
        "GET",
        "/messaging/testing/project/numbers/support/phone",
        None,
        json!({"session":"support","phone":"+15551234567","online":true,"devices":[{"deviceId":1},{"deviceId":2}]}),
        client
            .testing()
            .get_phone("project", "support", RequestOptions::default())
    );
    wire_messaging!(
        client,
        "POST",
        "/messaging/testing/project/numbers/support/phone/messages",
        Some(json!({"to":"+15551234568","text":"Hello"})),
        json!({"session":"support","to":"+15551234568","messageId":"wamessage"}),
        client.testing().send_phone_message(
            "project",
            "support",
            &SendTestingPhoneMessageRequest {
                to: "+15551234568".into(),
                text: "Hello".into()
            },
            RequestOptions::default()
        )
    );
    wire_messaging!(
        client,
        "POST",
        "/messaging/testing/project/numbers/support/phone/devices/2/unlink",
        None,
        json!({"session":"support","deviceId":2,"unlinked":true}),
        client
            .testing()
            .unlink_phone_device("project", "support", 2, RequestOptions::default())
    );
    let client = support::messaging("http://127.0.0.1:1".into());
    for device in [0, 100] {
        assert_eq!(
            client
                .testing()
                .unlink_phone_device("project", "support", device, RequestOptions::default())
                .await
                .unwrap_err()
                .kind,
            ErrorKind::Validation
        );
    }
}
#[tokio::test]
async fn resolved_project_and_session_observation_policies_native_wire() {
    wire_messaging!(
        client,
        "GET",
        "/messaging/projects/project/observation-policy",
        None,
        json!({"success":true,"data":{"projectId":"project","presenceMode":"events","typingMode":"off","labelMode":"project","quickReplyMode":"cache"}}),
        client
            .observation_policies()
            .retrieve_for_project("project", RequestOptions::default())
    );
    wire_messaging!(
        client,
        "GET",
        "/messaging/support/observation-policy",
        None,
        json!({"success":true,"data":{"sessionName":"support","projectId":"project","project":{"presenceMode":"events","typingMode":"off","labelMode":"project","quickReplyMode":"cache"},"override":{"presenceMode":"inherit","typingMode":"cache","labelMode":"events","quickReplyMode":"off"},"effective":{"presenceMode":"events","typingMode":"cache","labelMode":"events","quickReplyMode":"off"}}}),
        client
            .observation_policies()
            .retrieve_for_session("support", RequestOptions::default())
    );
}
