#[allow(dead_code)]
mod support;
use polymorfa_sdk::{configuration::*, models::*, RequestOptions};
use serde_json::json;

fn configuration() -> serde_json::Value {
    json!({"effective":{"observation":{"presenceMode":"cache","typingMode":"events","labelMode":"project","quickReplyMode":"off"},"historySync":{"mode":"deliver","requestFull":true},"hms":{"enabled":true,"region":"eu","policy":"standard","retentionDays":30,"policyVersion":"1","legalHold":false}},"overrides":{"observation":{"presenceMode":"cache"},"hms":{"enabled":true,"region":"eu","policy":"standard"}},"sources":{"historySync.mode":"consent","historySync.requestFull":"session","hms":"project","observation.presenceMode":"session","observation.typingMode":"team","observation.labelMode":"project","observation.quickReplyMode":"platform"},"requestedHistory":{"mode":"deliver","requestFull":true},"historyConsent":"accepted","revisions":{"team":1,"project":2,"session":3},"application":{"desiredGeneration":4,"appliedGeneration":4,"status":"applied"}})
}
fn session() -> serde_json::Value {
    json!({"sessionId":"s","name":"Support","tenantId":"org","type":"linked_device","testMode":false,"status":"CONNECTED","configuration":configuration(),"createdAt":"2026-10-11T12:00:00Z","updatedAt":"2026-10-11T12:00:00Z"})
}

#[tokio::test]
async fn session_effective_configuration_and_revision_patch_native_wire() {
    wire_messaging!(
        client,
        "GET",
        "/platform/sessions/s",
        None,
        json!({"success":true,"data":session()}),
        client.sessions().retrieve("s", RequestOptions::default())
    );
    let body = UpdateSessionRequest {
        configuration: SessionConfigurationPatch {
            set: Some(SessionConfigurationOverrides {
                observation: Some(ObservationConfigurationPatch {
                    presence_mode: Some(ObservationMode::Off),
                    ..ObservationConfigurationPatch::default()
                }),
                hms: Some(HmsConfiguration::Disabled),
                history_sync: None,
            }),
            reset: Some(vec![
                SessionConfigurationReset::HistorySyncRequestFull,
                SessionConfigurationReset::TypingMode,
            ]),
        },
        revision: 3,
    };
    wire_messaging!(
        client,
        "PUT",
        "/platform/sessions/s",
        Some(
            json!({"configuration":{"set":{"observation":{"presenceMode":"off"},"hms":{"enabled":false}},"reset":["historySync.requestFull","observation.typingMode"]},"revision":3})
        ),
        json!({"success":true,"data":session()}),
        client
            .sessions()
            .update("s", &body, RequestOptions::default())
    );
}

#[tokio::test]
async fn quicklink_configuration_testing_history_and_onboarding_native_wire() {
    let overrides = QuickLinkConfiguration {
        observation: Some(ObservationConfigurationPatch {
            label_mode: Some(LabelObservationMode::Project),
            ..ObservationConfigurationPatch::default()
        }),
        hms: Some(HmsConfiguration::Disabled),
        testing: Some(QuickLinkTestingConfiguration {
            country: Some("US".into()),
            configuration: Some(TestingConfiguration {
                profile: Some(TestingProfile {
                    name: Some("Support".into()),
                    status: Some("Ready".into()),
                }),
                account_type: Some("business".into()),
                reply_behavior: Some("echo".into()),
                failure_scenario: Some("none".into()),
                history_fixture_id: Some("support".into()),
            }),
            editable: Some(vec!["profile.name".into()]),
        }),
        connection_preference: Some("both".into()),
        connection_enforcement: Some("prefer".into()),
        methods: Some(vec!["qr".into(), "code".into()]),
        default_method: Some(None),
        prefill_phone: Some("+15551234567".into()),
        allow_phone_change: Some(false),
        history_sync: Some(QuickLinkHistorySync {
            consent: Some("optional".into()),
            mode: Some("deliver".into()),
            request_full: Some(true),
        }),
    };
    let body = CreateQuickLinkRequest {
        project_id: Some("project".into()),
        configuration: Some(overrides.clone()),
        ..CreateQuickLinkRequest::default()
    };
    let expected = json!({"projectId":"project","configuration":{"observation":{"labelMode":"project"},"hms":{"enabled":false},"testing":{"country":"US","configuration":{"profile":{"name":"Support","status":"Ready"},"accountType":"business","replyBehavior":"echo","failureScenario":"none","historyFixtureId":"support"},"editable":["profile.name"]},"connectionPreference":"both","connectionEnforcement":"prefer","methods":["qr","code"],"defaultMethod":null,"prefillPhone":"+15551234567","allowPhoneChange":false,"historySync":{"consent":"optional","mode":"deliver","requestFull":true}}});
    wire_messaging!(
        client,
        "POST",
        "/messaging/quicklinks",
        Some(expected),
        json!({"success":true,"data":{"id":"link","url":"https://link.polymorfa.com/link","session":"s","purpose":"initial","connectionGoal":"hybrid","expiresAt":null}}),
        client
            .quick_links()
            .create(&body, RequestOptions::default())
    );
    wire_messaging!(
        client,
        "GET",
        "/messaging/quicklinks/link",
        None,
        json!({"success":true,"data":{"id":"link","session":"s","purpose":"initial","connectionGoal":"hybrid","hybridPhase":"linked_pairing","status":"opened","expiresAt":"2026-10-12T12:00:00Z","openedAt":"2026-10-11T12:00:00Z","connectedAt":null,"phone":null,"errorCode":null,"onboarding":{"stage":"linked_pairing","connection":"official_api","coexistence":true,"contactsSync":"complete","historySync":"pending","historyProgress":0.5,"sync":{"contacts":{"request":"accepted","receiptRecorded":true},"history":{"request":"pending","receiptRecorded":false,"delivery":"unconfirmed"}},"errorCode":null}}}),
        client
            .quick_links()
            .retrieve("link", RequestOptions::default())
    );
    let client = support::messaging("http://localhost:1".into());
    let invalid = CreateQuickLinkRequest {
        configuration: Some(overrides),
        billing_controls: Some(BillingControls {
            limit_credits: Some(1.0),
            priority: 1,
        }),
        ..CreateQuickLinkRequest::default()
    };
    assert_eq!(
        client
            .quick_links()
            .create(&invalid, RequestOptions::default())
            .await
            .unwrap_err()
            .kind,
        polymorfa_sdk::ErrorKind::Configuration
    );
}

#[test]
fn hms_atomic_policy_model_requires_region_and_policy_when_enabled() {
    assert!(
        serde_json::from_value::<HmsConfiguration>(json!({"enabled":true,"region":"eu"})).is_err()
    );
    let enabled: HmsConfiguration = serde_json::from_value(
        json!({"enabled":true,"region":"eu","policy":"standard","retentionDays":30}),
    )
    .unwrap();
    assert!(matches!(enabled, HmsConfiguration::Enabled { .. }));
    assert_eq!(
        serde_json::to_value(HmsConfiguration::Disabled).unwrap(),
        json!({"enabled":false})
    );
    let settings: polymorfa_sdk::voip::UpdateSessionCallSettingsRequest =
        serde_json::from_value(json!({"sipTrunkId":null})).unwrap();
    assert_eq!(
        serde_json::to_value(settings).unwrap(),
        json!({"sipTrunkId":null})
    );
    let quicklink: QuickLinkConfiguration =
        serde_json::from_value(json!({"defaultMethod":null})).unwrap();
    assert_eq!(
        serde_json::to_value(quicklink).unwrap(),
        json!({"defaultMethod":null})
    );
}
