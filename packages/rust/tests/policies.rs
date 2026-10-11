#[allow(dead_code)]
mod support;
use polymorfa_sdk::{platform_sessions::*, policies::*, RequestOptions};
use serde_json::json;
fn safety() -> serde_json::Value {
    json!({"projectId":"project","ceiling":{"presence":"dark","typing":"before_text","reads":"replied_chats","pacing":"jittered","onlineStart":9.0,"onlineEnd":18.0},"entitled":true,"entitlementReason":null})
}
fn warmup() -> serde_json::Value {
    json!({"projectId":"project","plan":{"enabled":true,"warmupDays":14,"dailyStart":10},"ceiling":100,"curve":[{"day":1,"allowance":10},{"day":14,"allowance":100}],"entitled":true,"entitlementReason":null})
}
fn insurance() -> serde_json::Value {
    json!({"projectId":"project","enabled":true,"banInsuranceIncluded":true})
}
fn health() -> serde_json::Value {
    json!({"projectId":"project","version":3,"enabled":true,"threshold":50.0,"sessionAction":"slow_down","slowDownMps":1.5,"emailNotification":true,"webhookNotification":true,"integrations":{"emailConfigured":true,"webhookConfigured":true}})
}
fn update_safety() -> UpdateProjectSafeModeRequest {
    UpdateProjectSafeModeRequest {
        presence: Some(SafeModePresence::Dark),
        online_start: Some(9.0),
        online_end: Some(18.0),
        ..Default::default()
    }
}
fn update_warmup() -> UpdateProjectWarmupPlanRequest {
    UpdateProjectWarmupPlanRequest {
        enabled: Some(true),
        warmup_days: Some(14),
        daily_start: Some(10),
    }
}
fn update_health() -> UpdateProjectHealthPolicyRequest {
    UpdateProjectHealthPolicyRequest {
        version: 3,
        enabled: true,
        threshold: 50.0,
        session_action: ProjectHealthSessionAction::SlowDown,
        slow_down_mps: Some(1.5),
        email_notification: true,
        webhook_notification: true,
    }
}
#[tokio::test]
async fn platform_project_safety_warmup_insurance_health_and_hybrid_candidates_native_wire() {
    wire_organization!(
        client,
        "GET",
        "/platform/projects/project/safe-mode",
        None,
        json!({"data":safety()}),
        client
            .projects()
            .get_safe_mode("project", RequestOptions::default())
    );
    wire_organization!(
        client,
        "PUT",
        "/platform/projects/project/safe-mode",
        Some(json!({"presence":"dark","onlineStart":9.0,"onlineEnd":18.0})),
        json!({"data":safety()}),
        client
            .projects()
            .update_safe_mode("project", &update_safety(), RequestOptions::default())
    );
    wire_organization!(
        client,
        "GET",
        "/platform/projects/project/warmup-plan",
        None,
        json!({"data":warmup()}),
        client
            .projects()
            .get_warmup_plan("project", RequestOptions::default())
    );
    wire_organization!(
        client,
        "PUT",
        "/platform/projects/project/warmup-plan",
        Some(json!({"enabled":true,"warmupDays":14,"dailyStart":10})),
        json!({"data":warmup()}),
        client.projects().update_warmup_plan(
            "project",
            &update_warmup(),
            RequestOptions::default()
        )
    );
    wire_organization!(
        client,
        "GET",
        "/platform/projects/project/insurance-evidence",
        None,
        json!({"data":insurance()}),
        client
            .projects()
            .get_insurance_evidence("project", RequestOptions::default())
    );
    wire_organization!(
        client,
        "PUT",
        "/platform/projects/project/insurance-evidence",
        Some(json!({"enabled":true})),
        json!({"data":insurance()}),
        client.projects().update_insurance_evidence(
            "project",
            &UpdateProjectInsuranceEvidenceRequest { enabled: true },
            RequestOptions::default()
        )
    );
    wire_organization!(
        client,
        "GET",
        "/platform/projects/project/health-policy",
        None,
        json!({"data":health()}),
        client
            .projects()
            .get_health_policy("project", RequestOptions::default())
    );
    wire_organization!(
        client,
        "PUT",
        "/platform/projects/project/health-policy",
        Some(
            json!({"version":3,"enabled":true,"threshold":50.0,"sessionAction":"slow_down","slowDownMps":1.5,"emailNotification":true,"webhookNotification":true})
        ),
        json!({"data":health()}),
        client.projects().update_health_policy(
            "project",
            &update_health(),
            RequestOptions::default()
        )
    );
    wire_organization!(
        client,
        "GET",
        "/platform/projects/project/hybrid-merge-candidates",
        None,
        json!({"data":[{"numbers":[{"id":"one","name":"Support","transport":"linked_devices","status":"CONNECTED","canBeAbsorbed":true},{"id":"two","name":"Official","transport":"official_api","status":"CONNECTED","canBeAbsorbed":false}],"eligible":false,"ineligibleReason":"hms_enabled"}]}),
        client
            .projects()
            .list_hybrid_merge_candidates("project", RequestOptions::default())
    );
}
#[tokio::test]
async fn messaging_project_and_number_safety_settings_native_wire() {
    wire_messaging!(
        client,
        "GET",
        "/messaging/projects/project/safe-mode",
        None,
        json!({"success":true,"data":safety()}),
        client
            .ban_safe()
            .get_project_safe_mode("project", RequestOptions::default())
    );
    wire_messaging!(
        client,
        "PUT",
        "/messaging/projects/project/safe-mode",
        Some(json!({"presence":"dark","onlineStart":9.0,"onlineEnd":18.0})),
        json!({"success":true,"data":safety()}),
        client.ban_safe().update_project_safe_mode(
            "project",
            &update_safety(),
            RequestOptions::default()
        )
    );
    wire_messaging!(
        client,
        "GET",
        "/messaging/projects/project/warmup-plan",
        None,
        json!({"success":true,"data":warmup()}),
        client
            .ban_safe()
            .get_project_warmup_plan("project", RequestOptions::default())
    );
    wire_messaging!(
        client,
        "PUT",
        "/messaging/projects/project/warmup-plan",
        Some(json!({"enabled":true,"warmupDays":14,"dailyStart":10})),
        json!({"success":true,"data":warmup()}),
        client.ban_safe().update_project_warmup_plan(
            "project",
            &update_warmup(),
            RequestOptions::default()
        )
    );
    wire_messaging!(
        client,
        "GET",
        "/messaging/projects/project/insurance-evidence",
        None,
        json!({"success":true,"data":insurance()}),
        client
            .ban_safe()
            .get_project_insurance_evidence("project", RequestOptions::default())
    );
    wire_messaging!(
        client,
        "PUT",
        "/messaging/projects/project/insurance-evidence",
        Some(json!({"enabled":true})),
        json!({"success":true,"data":insurance()}),
        client.ban_safe().update_project_insurance_evidence(
            "project",
            &UpdateProjectInsuranceEvidenceRequest { enabled: true },
            RequestOptions::default()
        )
    );
    wire_messaging!(
        client,
        "GET",
        "/messaging/projects/project/health-policy",
        None,
        json!({"success":true,"data":health()}),
        client
            .ban_safe()
            .get_project_health_policy("project", RequestOptions::default())
    );
    wire_messaging!(
        client,
        "PUT",
        "/messaging/projects/project/health-policy",
        Some(
            json!({"version":3,"enabled":true,"threshold":50.0,"sessionAction":"slow_down","slowDownMps":1.5,"emailNotification":true,"webhookNotification":true})
        ),
        json!({"success":true,"data":health()}),
        client.ban_safe().update_project_health_policy(
            "project",
            &update_health(),
            RequestOptions::default()
        )
    );
    let safety = json!({"session":"s","projectId":"project","project":safety()["ceiling"],"override":{"presence":"inherit","typing":"inherit","reads":"inherit","pacing":"inherit"},"effective":safety()["ceiling"],"applied":null,"mismatch":false,"entitled":false,"entitlementReason":"access_unavailable"});
    wire_messaging!(
        client,
        "GET",
        "/messaging/s/safe-mode",
        None,
        json!({"success":true,"data":safety}),
        client
            .ban_safe()
            .get_session_safe_mode("s", RequestOptions::default())
    );
    wire_messaging!(
        client,
        "PUT",
        "/messaging/s/safe-mode",
        Some(json!({"typing":"off"})),
        json!({"success":true,"data":safety}),
        client.ban_safe().update_session_safe_mode(
            "s",
            &UpdateSessionSafeModeRequest {
                typing: Some(Inheritable::Setting(SafeModeTyping::Off)),
                ..Default::default()
            },
            RequestOptions::default()
        )
    );
}
