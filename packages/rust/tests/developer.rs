#[allow(dead_code)]
mod support;
use polymorfa_sdk::{developer::*, RequestOptions};
use serde_json::json;

macro_rules! webhook_wire {
    ($project:expr,$prefix:expr,$method:expr,$suffix:expr,$body:expr,$response:expr,$resource:ident,$call:expr)=>{{
        let expected=($response).clone();let (base,server)=support::wire($method,&format!("{}{}",$prefix,$suffix),$body,json!({"data":expected})).await;
        let organization=support::organization(base);let view=organization.project("project").unwrap();let $resource=if $project { view.webhooks() } else { organization.webhooks() };
        let result=$call.await.unwrap();support::assert_subset(&expected,&serde_json::to_value(result.data).unwrap());assert_eq!(result.metadata.request_id.as_deref(),Some("wire_fixture"));server.await.unwrap();
    }};
}
macro_rules! delivery_wire {
    ($project:expr,$prefix:expr,$method:expr,$suffix:expr,$body:expr,$response:expr,$resource:ident,$call:expr)=>{{
        let expected=($response).clone();let (base,server)=support::wire($method,&format!("{}{}",$prefix,$suffix),$body,json!({"data":expected})).await;
        let organization=support::organization(base);let view=organization.project("project").unwrap();let $resource=if $project { view.webhook_deliveries() } else { organization.webhook_deliveries() };
        let result=$call.await.unwrap();support::assert_subset(&expected,&serde_json::to_value(result.data).unwrap());assert_eq!(result.metadata.request_id.as_deref(),Some("wire_fixture"));server.await.unwrap();
    }};
}
fn receipt() -> serde_json::Value {
    json!({"id":"receipt","key":"once","replayed":false,"createdAt":"2026-10-11T12:00:00Z","expiresAt":"2026-10-12T12:00:00Z"})
}

#[tokio::test]
async fn organization_and_project_webhook_public_methods_native_wire_contracts() {
    for project in [false, true] {
        let prefix = if project {
            "/platform/projects/project"
        } else {
            "/platform"
        };
        let secret =
            json!({"version":1,"createdAt":"2026-10-11T12:00:00Z","previousValidUntil":null});
        let webhook = json!({"id":"hook","organizationId":"org","owner":if project { "project" } else { "organization" },"projectId":if project { Some("project") } else { None },"url":"https://example.test/webhook","eventTypes":["message.received"],"enabled":true,"format":"native","retryPolicy":{"maximumAttempts":3,"backoff":"exponential","initialDelaySeconds":5},"headers":[{"name":"x-custom"}],"secret":secret,"createdAt":"2026-10-11T12:00:00Z","updatedAt":"2026-10-11T12:00:00Z"});
        let (base, server) = support::wire(
            "GET",
            &format!("{prefix}/webhooks?enabled=true&eventType=message.received&limit=1"),
            None,
            json!({"data":[webhook],"page":{"nextCursor":null,"hasMore":false}}),
        )
        .await;
        let organization = support::organization(base);
        let view = organization.project("project").unwrap();
        let resource = if project {
            view.webhooks()
        } else {
            organization.webhooks()
        };
        let page = resource
            .list(
                &ListWebhooksParameters {
                    enabled: Some(true),
                    event_type: Some("message.received".into()),
                    limit: Some(1),
                    cursor: None,
                },
                RequestOptions::default(),
            )
            .await
            .unwrap();
        support::assert_subset(&webhook, &serde_json::to_value(&page.items[0]).unwrap());
        assert!(!page.has_more());
        server.await.unwrap();
        webhook_wire!(
            project,
            prefix,
            "GET",
            "/webhooks/hook%2Fone",
            None,
            webhook,
            resource,
            resource.retrieve("hook/one", RequestOptions::default())
        );
        let input = CreateWebhookRequest {
            url: "https://example.test/webhook".into(),
            event_types: vec!["message.received".into()],
            enabled: None,
            format: None,
            retry_policy: Some(WebhookRetryPolicy {
                maximum_attempts: 3,
                backoff: "exponential".into(),
                initial_delay_seconds: 5,
            }),
            headers: Some(vec![WebhookHeader {
                name: "x-custom".into(),
                value: "configured-value".into(),
            }]),
        };
        webhook_wire!(
            project,
            prefix,
            "POST",
            "/webhooks",
            Some(
                json!({"url":"https://example.test/webhook","eventTypes":["message.received"],"retryPolicy":{"maximumAttempts":3,"backoff":"exponential","initialDelaySeconds":5},"headers":[{"name":"x-custom","value":"configured-value"}]})
            ),
            json!({"webhook":webhook,"operationId":null,"idempotency":receipt(),"secret":"fixture-signing-secret","secretAvailable":true}),
            resource,
            resource.create(
                &input,
                RequestOptions {
                    idempotency_key: Some("once".into()),
                    ..RequestOptions::default()
                }
            )
        );
        webhook_wire!(
            project,
            prefix,
            "PATCH",
            "/webhooks/hook",
            Some(json!({"enabled":false})),
            json!({"webhook":webhook,"operationId":null,"idempotency":receipt()}),
            resource,
            resource.update(
                "hook",
                &UpdateWebhookRequest {
                    enabled: Some(false),
                    ..UpdateWebhookRequest::default()
                },
                RequestOptions::default()
            )
        );
        webhook_wire!(
            project,
            prefix,
            "DELETE",
            "/webhooks/hook",
            None,
            json!({"webhookId":"hook","deleted":true,"operationId":null,"idempotency":receipt()}),
            resource,
            resource.delete("hook", RequestOptions::default())
        );
        webhook_wire!(
            project,
            prefix,
            "POST",
            "/webhooks/hook/tests",
            Some(json!({"eventType":"message.received"})),
            json!({"eventId":"event","deliveryId":"delivery","operationId":"operation","idempotency":receipt()}),
            resource,
            resource.test(
                "hook",
                &TestWebhookRequest::Fixture {
                    event_type: Some("message.received".into())
                },
                RequestOptions::default()
            )
        );
        webhook_wire!(
            project,
            prefix,
            "POST",
            "/webhooks/hook/secret-rotations",
            Some(json!({"overlapSeconds":60})),
            json!({"webhookId":"hook","operationId":null,"secret":null,"secretAvailable":false,"secretMetadata":secret,"idempotency":receipt()}),
            resource,
            resource.rotate_secret(
                "hook",
                &RotateWebhookSecretRequest {
                    overlap_seconds: Some(60)
                },
                RequestOptions::default()
            )
        );
    }
    let organization = support::organization("http://localhost:1".into());
    let error = organization
        .webhooks()
        .test(
            "hook",
            &TestWebhookRequest::Custom {
                body: polymorfa_sdk::models::EncodedEventPayload {
                    encoding: "base64".into(),
                    content_type: "application/json".into(),
                    data: "e30=".into(),
                },
                session_id: "s".into(),
                event_type: None,
            },
            RequestOptions::default(),
        )
        .await;
    assert!(error.is_err());
}

#[tokio::test]
async fn organization_and_project_delivery_public_methods_native_wire_contracts() {
    for project in [false, true] {
        let prefix = if project {
            "/platform/projects/project"
        } else {
            "/platform"
        };
        let delivery = json!({"id":"delivery","organizationId":"org","projectId":if project { Some("project") } else { None },"eventId":"event","webhookId":"hook","status":"failed","attemptCount":1,"capabilities":{"retryable":true},"payloadAvailability":"available","replayableUntil":"2026-10-12T12:00:00Z","metadataExpiresAt":"2026-11-11T12:00:00Z","nextAttemptAt":null,"lastAttemptAt":"2026-10-11T12:00:00Z","completedAt":"2026-10-11T12:00:00Z","createdAt":"2026-10-11T12:00:00Z","updatedAt":"2026-10-11T12:00:00Z","lastOutcome":{"statusCode":503,"errorCode":"remote_error"}});
        let attempt = json!({"id":"attempt","organizationId":"org","projectId":if project { Some("project") } else { None },"deliveryId":"delivery","number":1,"status":"failed","startedAt":"2026-10-11T12:00:00Z","completedAt":"2026-10-11T12:00:00Z","nextRetryAt":null,"durationMs":20,"statusCode":503,"errorCode":"remote_error","response":{"contentType":"text/plain","excerpt":"Service unavailable","truncated":false},"metadataExpiresAt":"2026-11-11T12:00:00Z"});
        let (base, server) = support::wire(
            "GET",
            &format!("{prefix}/webhook-deliveries?status=failed&webhookId=hook"),
            None,
            json!({"data":[delivery],"page":{"nextCursor":null,"hasMore":false}}),
        )
        .await;
        let organization = support::organization(base);
        let view = organization.project("project").unwrap();
        let resource = if project {
            view.webhook_deliveries()
        } else {
            organization.webhook_deliveries()
        };
        let page = resource
            .list(
                &ListDeliveriesParameters {
                    status: Some("failed".into()),
                    webhook_id: Some("hook".into()),
                    ..ListDeliveriesParameters::default()
                },
                RequestOptions::default(),
            )
            .await
            .unwrap();
        support::assert_subset(&delivery, &serde_json::to_value(&page.items[0]).unwrap());
        server.await.unwrap();
        delivery_wire!(
            project,
            prefix,
            "GET",
            "/webhook-deliveries/delivery%2Fone",
            None,
            delivery,
            resource,
            resource.retrieve("delivery/one", RequestOptions::default())
        );
        let (base, server) = support::wire(
            "GET",
            &format!("{prefix}/webhook-deliveries/delivery/attempts?limit=1"),
            None,
            json!({"data":[attempt],"page":{"nextCursor":null,"hasMore":false}}),
        )
        .await;
        let organization = support::organization(base);
        let view = organization.project("project").unwrap();
        let resource = if project {
            view.webhook_deliveries()
        } else {
            organization.webhook_deliveries()
        };
        let page = resource
            .list_attempts(
                "delivery",
                &ListDeliveryAttemptsParameters {
                    limit: Some(1),
                    cursor: None,
                },
                RequestOptions::default(),
            )
            .await
            .unwrap();
        support::assert_subset(&attempt, &serde_json::to_value(&page.items[0]).unwrap());
        server.await.unwrap();
        delivery_wire!(
            project,
            prefix,
            "GET",
            "/webhook-deliveries/delivery/attempts/attempt%2Fone",
            None,
            attempt,
            resource,
            resource.retrieve_attempt("delivery", "attempt/one", RequestOptions::default())
        );
        delivery_wire!(
            project,
            prefix,
            "POST",
            "/webhook-deliveries/delivery/retry",
            Some(json!({})),
            json!({"deliveryId":"delivery","attemptId":"attempt2","operationId":"operation","idempotency":receipt()}),
            resource,
            resource.retry("delivery", RequestOptions::default())
        );
    }
}
