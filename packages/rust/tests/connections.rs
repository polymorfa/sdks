#[allow(dead_code)]
mod support;
use polymorfa_sdk::{connections::*, RequestOptions};
use serde_json::json;

#[tokio::test]
async fn official_api_credential_and_pricing_native_wire_contracts() {
    wire_messaging!(
        client,
        "GET",
        "/messaging/s/cloud-credentials",
        None,
        json!({"success":true,"data":{"status":"healthy","checkedAt":"2026-10-11T12:00:00Z","nextCheckAt":"2026-10-12T12:00:00Z","token":{"status":"valid","expiresAt":null},"missingPermissions":[],"phoneRegistration":"registered","webhookSubscription":"subscribed","failureCode":null}}),
        client
            .sessions()
            .get_cloud_credential_health("s", RequestOptions::default())
    );
    wire_messaging!(
        client,
        "POST",
        "/messaging/s/cloud-credentials/reauthorize",
        None,
        json!({"success":true,"data":{"quicklinkId":"link","url":"https://link.polymorfa.com/link","session":"s"}}),
        client
            .sessions()
            .reauthorize_cloud_credentials("s", RequestOptions::default())
    );
    wire_messaging!(
        client,
        "GET",
        "/messaging/s/meta-pricing?since=2026-10-01&until=2026-10-11",
        None,
        json!({"success":true,"data":{"source":"meta","since":"2026-10-01","until":"2026-10-11","messages":5,"groups":[{"category":"marketing","pricingModel":"PMP","pricingType":"regular","billable":true,"messages":5}]}}),
        client.sessions().get_meta_pricing(
            "s",
            &MetaPricingParameters {
                since: Some("2026-10-01".into()),
                until: Some("2026-10-11".into())
            },
            RequestOptions::default()
        )
    );
}

#[tokio::test]
async fn hybrid_link_native_wire_contracts() {
    let policy = json!({"scope":"project","revision":"rev1","prefer":"official_api","allowedTransports":["official_api","linked_devices"]});
    wire_messaging!(
        client,
        "GET",
        "/messaging/routing/hybrid?scope=project&projectId=project",
        None,
        json!({"success":true,"data":policy}),
        client.hybrid_link().get_policy(
            &HybridPolicyScope::Project {
                project_id: "project".into()
            },
            RequestOptions::default()
        )
    );
    wire_messaging!(
        client,
        "PUT",
        "/messaging/routing/hybrid?scope=session&projectId=project&session=s",
        Some(
            json!({"expectedRevision":"rev0","prefer":null,"allowedTransports":["linked_devices"]})
        ),
        json!({"success":true,"data":{"scope":"session","revision":"rev1","prefer":null,"allowedTransports":["linked_devices"]}}),
        client.hybrid_link().set_policy(
            &HybridPolicyScope::Session {
                project_id: "project".into(),
                session: "s".into()
            },
            &SetHybridRoutingPolicyRequest {
                expected_revision: "rev0".into(),
                prefer: None,
                allowed_transports: vec![HybridConnectionKind::LinkedDevices]
            },
            RequestOptions::default()
        )
    );
    wire_messaging!(
        client,
        "GET",
        "/messaging/s/hybrid-link",
        None,
        json!({"success":true,"data":{"revision":"rev1","paused":false,"connections":[{"kind":"linked_devices","status":"connected","enabled":true}]}}),
        client.hybrid_link().state("s", RequestOptions::default())
    );
    wire_messaging!(
        client,
        "PUT",
        "/messaging/s/hybrid-link",
        Some(json!({"expectedRevision":"rev1","paused":true})),
        json!({"success":true,"data":{"revision":"rev2","paused":true}}),
        client.hybrid_link().set_paused(
            "s",
            &SetHybridLinkPausedRequest {
                expected_revision: "rev1".into(),
                paused: true
            },
            RequestOptions::default()
        )
    );
}

#[tokio::test]
async fn client_token_mint_and_rules_native_wire_contracts() {
    wire_messaging!(
        client,
        "POST",
        "/platform/client-tokens",
        Some(json!({"ephemeralId":"visitor","ttlSeconds":300,"session":"s"})),
        json!({"success":true,"data":{"token":"pmfa_ct_fixture","expiresAt":"2026-10-11T12:05:00Z"}}),
        client.client_tokens().mint(
            &MintClientTokenRequest {
                ephemeral_id: "visitor".into(),
                ttl_seconds: Some(300),
                target: ClientTokenTarget::Session {
                    session: "s".into()
                }
            },
            RequestOptions::default()
        )
    );
    wire_messaging!(
        client,
        "POST",
        "/platform/client-tokens",
        Some(
            json!({"ephemeralId":"visitor","customer":"customer","allow":["send_message","read_contact"]})
        ),
        json!({"success":true,"data":{"token":"pmfa_ct_fixture","expiresAt":"2026-10-11T12:05:00Z"}}),
        client.client_tokens().mint(
            &MintClientTokenRequest {
                ephemeral_id: "visitor".into(),
                ttl_seconds: None,
                target: ClientTokenTarget::Customer {
                    customer: "customer".into(),
                    allow: Some(vec![
                        CustomerClientAction::SendMessage,
                        CustomerClientAction::ReadContact
                    ])
                }
            },
            RequestOptions::default()
        )
    );
    wire_messaging!(
        client,
        "GET",
        "/platform/sessions/s/client-rules",
        None,
        json!({"success":true,"data":{"recipientMode":"conversation","allowedActions":"send_message","rateLimit":1,"maxDaily":10,"allowedOrigins":"https://example.test","conversationTtlSeconds":86400,"maxConcurrency":1,"maxSetupsPerMinute":10,"allowedNumber":"+15551234567","enabled":true}}),
        client
            .client_tokens()
            .retrieve_rules("s", RequestOptions::default())
    );
    let body:SetClientRulesRequest=serde_json::from_value(json!({"recipientMode":"conversation","enabled":true,"allowedActions":"send_message","conversationTtlSeconds":86400})).unwrap();
    wire_messaging!(
        client,
        "PUT",
        "/platform/sessions/s/client-rules",
        Some(
            json!({"recipientMode":"conversation","enabled":true,"allowedActions":"send_message","conversationTtlSeconds":86400})
        ),
        json!({"success":true}),
        client
            .client_tokens()
            .update_rules("s", &body, RequestOptions::default())
    );
    wire_messaging!(
        client,
        "DELETE",
        "/platform/sessions/s/client-rules",
        None,
        json!({"success":true}),
        client
            .client_tokens()
            .delete_rules("s", RequestOptions::default())
    );
}
