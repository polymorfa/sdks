#[allow(dead_code)]
mod support;
use polymorfa_sdk::{
    voip::{SessionCallSettings, UpdateSessionCallSettingsRequest},
    RequestOptions,
};
use serde_json::{json, Value};

#[tokio::test]
async fn coverage_end_is_a_nullable_response_only_projection() {
    let fixture: Value = serde_json::from_slice(include_bytes!(
        "../../../contracts/fixtures/calls-coverage-end.candidate.json"
    ))
    .unwrap();
    for case in fixture["cases"].as_array().unwrap() {
        let mut settings = fixture["settings"].clone();
        settings["simultaneousCalls"] = case["on"].clone();
        settings["simultaneousCallsCoverageExcludedUntil"] = case["until"].clone();
        wire_messaging!(
            client,
            "GET",
            "/platform/sessions/support/call-settings",
            None,
            json!({"success":true,"data":settings}),
            client
                .voip()
                .retrieve_call_settings("support", RequestOptions::default())
        );
        wire_messaging!(
            client,
            "PUT",
            "/platform/sessions/support/call-settings",
            Some(json!({"callsEnabled":false})),
            json!({"success":true,"data":settings}),
            client.voip().update_call_settings(
                "support",
                &UpdateSessionCallSettingsRequest {
                    calls_enabled: Some(false),
                    ..Default::default()
                },
                RequestOptions::default()
            )
        );
    }
    let old: SessionCallSettings = serde_json::from_value(fixture["settings"].clone()).unwrap();
    assert_eq!(old.simultaneous_calls_coverage_excluded_until, None);
    let literal = SessionCallSettings {
        calls_enabled: true,
        conference_mode: false,
        inbound_route: "clients".into(),
        sip_trunk_id: None,
        sip_claim: false,
        host_cloud_api_calls: false,
        simultaneous_calls: false,
        simultaneous_calls_coverage_excluded_until: Some("2026-11-22T12:34:56.789Z".into()),
        revision: 2,
        updated_at: None,
    };
    assert_eq!(
        serde_json::to_value(literal).unwrap()["simultaneousCallsCoverageExcludedUntil"],
        "2026-11-22T12:34:56.789Z"
    );
    let write = serde_json::to_value(UpdateSessionCallSettingsRequest {
        calls_enabled: Some(false),
        ..Default::default()
    })
    .unwrap();
    assert_eq!(write, json!({"callsEnabled":false}));
}
