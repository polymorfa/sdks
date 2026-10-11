#[allow(dead_code)]
mod support;
use polymorfa_sdk::{models::*, RequestOptions};
use serde_json::json;

#[tokio::test]
async fn session_resource_wire_contracts() {
    let session = json!({"sessionId":"s","name":"Support","tenantId":"org","type":"linked_device","testMode":false,"status":"CONNECTED","createdAt":"2026-10-11T12:00:00Z","updatedAt":"2026-10-11T12:00:00Z"});
    let platform = json!({"_id":"number","_creationTime":1,"projectId":"project","sessionId":"s","name":"Support","isBusiness":true,"testMode":false,"status":"CONNECTED","messageCount":2});
    wire_messaging!(
        client,
        "GET",
        "/platform/sessions",
        None,
        json!({"data":[platform]}),
        client.sessions().list(RequestOptions::default())
    );
    wire_messaging!(
        client,
        "GET",
        "/platform/sessions/s%2Fone",
        None,
        json!({"success":true,"data":session}),
        client
            .sessions()
            .retrieve("s/one", RequestOptions::default())
    );
    wire_messaging!(
        client,
        "DELETE",
        "/platform/sessions/s",
        None,
        json!({"data":{"removed":true,"sessionId":"s"}}),
        client.sessions().delete("s", RequestOptions::default())
    );
    wire_messaging!(
        client,
        "POST",
        "/platform/sessions/s/start",
        None,
        json!({"data":{"starting":true,"sessionId":"s"}}),
        client.sessions().start("s", RequestOptions::default())
    );
    wire_messaging!(
        client,
        "POST",
        "/platform/sessions/s/stop",
        None,
        json!({"data":{"stopping":true,"sessionId":"s"}}),
        client.sessions().stop("s", RequestOptions::default())
    );
    wire_messaging!(
        client,
        "POST",
        "/platform/sessions/s/restart",
        None,
        json!({"success":true,"message":"Restarting","operationId":"operation"}),
        client.sessions().restart("s", RequestOptions::default())
    );
    wire_messaging!(
        client,
        "POST",
        "/platform/sessions/s/logout",
        None,
        json!({"success":true,"message":"Logging out","operationId":"operation"}),
        client.sessions().logout("s", RequestOptions::default())
    );
    wire_messaging!(
        client,
        "GET",
        "/platform/sessions/s/me",
        None,
        json!({"success":true,"data":{"id":"user","pushName":"Pat"}}),
        client.sessions().account("s", RequestOptions::default())
    );
    wire_messaging!(
        client,
        "GET",
        "/messaging/s/pair/qr?format=json",
        None,
        json!({"success":true,"data":{"qr":"qr-content"}}),
        client.sessions().qr("s", RequestOptions::default())
    );
    wire_messaging!(
        client,
        "POST",
        "/messaging/s/pair/code",
        Some(json!({"phone":"+1555"})),
        json!({"success":true,"data":{"code":"1234"}}),
        client.sessions().request_pairing_code(
            "s",
            &PairCodeRequest {
                phone: "+1555".into()
            },
            RequestOptions::default()
        )
    );
}
#[tokio::test]
async fn message_resource_wire_contracts() {
    let receipt = json!({"id":"message","whatsapp_ids":{"linked_devices":"provider-message"},"conversation":{"id":"user"},"timestamp":"2026-10-11T12:00:00Z","status":"sent"});
    let mut message = receipt.clone();
    message["type"] = json!("text");
    message["content"] = json!({"text":"Hello"});
    let conversation = ConversationReference::id("user");
    wire_messaging!(
        client,
        "POST",
        "/messaging/s/messages/send",
        Some(json!({"conversation":{"id":"user"},"content":{"text":"Hello"}})),
        json!({"success":true,"data":message}),
        client.messages().send(
            "s",
            &SendMessageRequest::text(conversation.clone(), "Hello"),
            RequestOptions::default()
        )
    );
    wire_messaging!(
        client,
        "POST",
        "/messaging/s/messages/react",
        Some(json!({"conversation":{"id":"user"},"id":"message","reaction":"👍"})),
        json!({"success":true,"data":receipt}),
        client.messages().react(
            "s",
            &ReactRequest {
                conversation: conversation.clone(),
                id: "message".into(),
                reaction: "👍".into(),
                transport: None
            },
            RequestOptions::default()
        )
    );
    wire_messaging!(
        client,
        "POST",
        "/messaging/s/messages/seen",
        Some(json!({"conversation":{"id":"user"},"id":"message"})),
        json!({"success":true,"data":{"status":"OK"}}),
        client.messages().mark_seen(
            "s",
            &SeenRequest {
                conversation: conversation.clone(),
                id: "message".into()
            },
            RequestOptions::default()
        )
    );
    wire_messaging!(
        client,
        "POST",
        "/messaging/s/messages/typing",
        Some(json!({"conversation":{"id":"user"},"id":"message","state":"typing"})),
        json!({"success":true,"data":{"status":"OK"}}),
        client.messages().set_typing(
            "s",
            &TypingRequest {
                conversation: conversation.clone(),
                id: Some("message".into()),
                state: TypingState::Typing
            },
            RequestOptions::default()
        )
    );
    wire_messaging!(
        client,
        "POST",
        "/messaging/s/messages/star",
        Some(json!({"conversation":{"id":"user"},"id":"message","star":true})),
        json!({"success":true,"data":{"status":"OK"}}),
        client.messages().star(
            "s",
            &StarRequest {
                conversation,
                id: "message".into(),
                star: true
            },
            RequestOptions::default()
        )
    );
    wire_messaging!(
        client,
        "GET",
        "/messaging/s/operations/operation%2Fone",
        None,
        json!({"success":true,"data":{"operationId":"operation","status":"completed","receipt":{"whatsapp_ids":{"official_api":"provider-message"},"timestamp":"2026-10-11T12:00:00Z"}}}),
        client
            .messages()
            .operation_status("s", "operation/one", RequestOptions::default())
    );
}
#[tokio::test]
async fn quicklink_resource_wire_contracts() {
    wire_messaging!(
        client,
        "POST",
        "/messaging/quicklinks",
        Some(json!({"projectId":"project"})),
        json!({"success":true,"data":{"id":"link","url":"https://link.polymorfa.com/link","session":"s","purpose":"initial","connectionGoal":"single","expiresAt":null}}),
        client.quick_links().create(
            &CreateQuickLinkRequest {
                project_id: Some("project".into()),
                ..CreateQuickLinkRequest::default()
            },
            RequestOptions::default()
        )
    );
    wire_messaging!(
        client,
        "GET",
        "/messaging/quicklinks/link%2Fone",
        None,
        json!({"success":true,"data":{"id":"link","session":"s","purpose":"initial","connectionGoal":"single","status":"pending"}}),
        client
            .quick_links()
            .retrieve("link/one", RequestOptions::default())
    );
    wire_messaging!(
        client,
        "DELETE",
        "/messaging/quicklinks/link",
        None,
        json!({"success":true,"message":"Cancelled"}),
        client
            .quick_links()
            .cancel("link", RequestOptions::default())
    );
    wire_messaging!(
        client,
        "GET",
        "/messaging/quicklinks/availability?projectId=project&session=s",
        None,
        json!({"success":true,"data":{"allowed":true,"addConnection":"official_api","connections":[{"kind":"linked_devices","status":"connected","enabled":true}],"resumeQuickLinkId":null}}),
        client
            .quick_links()
            .availability("project", "s", RequestOptions::default())
    );
}
#[tokio::test]
async fn webhook_resource_wire_contracts() {
    let webhook = json!({"id":"hook","tenantId":"org","url":"https://example.test/webhook","events":["message.received"],"retries":{"attempts":3,"delaySeconds":2,"policy":"exponential"},"headers":[],"enabled":true,"createdAt":"2026-10-11T12:00:00Z"});
    wire_messaging!(
        client,
        "GET",
        "/messaging/webhooks",
        None,
        json!({"success":true,"data":[webhook]}),
        client.webhooks().list(RequestOptions::default())
    );
    let body = CreateWebhookRequest {
        url: "https://example.test/webhook".into(),
        session: None,
        events: Some(vec!["message.received".into()]),
        hmac_key: None,
        retries: None,
        headers: None,
        format: None,
    };
    wire_messaging!(
        client,
        "POST",
        "/messaging/webhooks",
        Some(json!({"url":"https://example.test/webhook","events":["message.received"]})),
        json!({"success":true,"data":webhook}),
        client.webhooks().create(&body, RequestOptions::default())
    );
    wire_messaging!(
        client,
        "GET",
        "/messaging/webhooks/hook",
        None,
        json!({"success":true,"data":webhook}),
        client
            .webhooks()
            .retrieve("hook", RequestOptions::default())
    );
    wire_messaging!(
        client,
        "PUT",
        "/messaging/webhooks/hook",
        Some(json!({"enabled":false})),
        json!({"success":true,"data":webhook}),
        client.webhooks().update(
            "hook",
            &UpdateWebhookRequest {
                enabled: Some(false),
                ..UpdateWebhookRequest::default()
            },
            RequestOptions::default()
        )
    );
    wire_messaging!(
        client,
        "DELETE",
        "/messaging/webhooks/hook",
        None,
        json!({"success":true}),
        client.webhooks().delete("hook", RequestOptions::default())
    );
}
#[tokio::test]
async fn project_resource_wire_contracts() {
    let project = json!({"id":"project","orgId":"org","name":"Support","slug":"support","icon":{"type":"emoji","value":"🦀"},"defaultTier":"standard","isActive":true,"stage":"development"});
    let mut stats = project.clone();
    stats.as_object_mut().unwrap().remove("id");
    stats["_id"] = json!("project");
    stats["_creationTime"] = json!(1);
    stats["activeSessions"] = json!(1);
    stats["totalSessions"] = json!(2);
    stats["totalMessages"] = json!(3);
    wire_organization!(
        client,
        "GET",
        "/platform/projects",
        None,
        json!({"data":[stats]}),
        client.projects().list(RequestOptions::default())
    );
    wire_organization!(
        client,
        "POST",
        "/platform/projects",
        Some(json!({"name":"Support","defaultTier":"standard"})),
        json!({"data":project}),
        client.projects().create(
            &CreateProjectRequest {
                name: "Support".into(),
                icon: None,
                default_tier: Some(ProjectDefaultTier::Standard)
            },
            RequestOptions::default()
        )
    );
    wire_organization!(
        client,
        "POST",
        "/platform/projects/project/promote",
        Some(
            json!({"business":{"name":"Support","website":"https://example.test","supportEmail":"support@example.test"}})
        ),
        json!({"data":{"id":"project","orgId":"org","name":"Support","slug":"support","stage":"development","operationId":"operation","enrollmentStatus":"requested","billingMode":"payg"}}),
        client.projects().request_production_enrollment(
            "project",
            &ProductionEnrollmentRequest {
                business: ProductionBusiness {
                    name: "Support".into(),
                    website: "https://example.test".into(),
                    support_email: "support@example.test".into()
                }
            },
            RequestOptions::default()
        )
    );
    wire_organization!(
        client,
        "POST",
        "/platform/projects/project/production-enrollments/operation/approve",
        None,
        json!({"data":{"operationId":"operation","action":"approve","accepted":true}}),
        client.projects().approve_production_enrollment(
            "project",
            "operation",
            RequestOptions::default()
        )
    );
    wire_organization!(
        client,
        "POST",
        "/platform/projects/project/production-enrollments/operation/cancel",
        None,
        json!({"data":{"operationId":"operation","action":"cancel","accepted":true}}),
        client.projects().cancel_production_enrollment(
            "project",
            "operation",
            RequestOptions::default()
        )
    );
}
