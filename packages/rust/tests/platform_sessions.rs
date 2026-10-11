#[allow(dead_code)]
mod support;
use polymorfa_sdk::{configuration::*, platform_sessions::*, RequestOptions};
use serde_json::json;
#[tokio::test]
async fn organization_session_lifecycle_batch_and_configuration_native_wire() {
    let context = SessionProjectContext {
        project_id: Some("project".into()),
    };
    let session = json!({"sessionId":"s","name":"Support","tenantId":"org","type":"linked_device","testMode":false,"status":"CONNECTED","createdAt":"2026-10-11T12:00:00Z","updatedAt":"2026-10-11T12:00:00Z"});
    let platform = json!({"_id":"number","_creationTime":1,"projectId":"project","sessionId":"s","name":"Support","isBusiness":true,"testMode":false,"status":"CONNECTED","messageCount":2});
    wire_organization!(
        client,
        "GET",
        "/platform/sessions?projectId=project",
        None,
        json!({"data":[platform]}),
        client.sessions().list(&context, RequestOptions::default())
    );
    wire_organization!(
        client,
        "GET",
        "/platform/sessions/s%2Fone",
        None,
        json!({"success":true,"data":session}),
        client
            .sessions()
            .retrieve("s/one", RequestOptions::default())
    );
    let update = UpdateSessionRequest {
        configuration: SessionConfigurationPatch::default(),
        revision: 3,
    };
    wire_organization!(
        client,
        "PUT",
        "/platform/sessions/s",
        Some(json!({"configuration":{},"revision":3})),
        json!({"success":true,"data":session}),
        client
            .sessions()
            .update("s", &update, RequestOptions::default())
    );
    wire_organization!(
        client,
        "POST",
        "/platform/sessions/s/start",
        Some(json!({"projectId":"project"})),
        json!({"data":{"starting":true,"sessionId":"s"}}),
        client
            .sessions()
            .start("s", &context, RequestOptions::default())
    );
    wire_organization!(
        client,
        "POST",
        "/platform/sessions/s/stop",
        Some(json!({"projectId":"project"})),
        json!({"data":{"stopping":true,"sessionId":"s"}}),
        client
            .sessions()
            .stop("s", &context, RequestOptions::default())
    );
    let batch = SessionBatchRequest {
        project_id: Some("project".into()),
        session_ids: vec!["s".into(), "s2".into()],
    };
    wire_organization!(
        client,
        "POST",
        "/platform/sessions/stop",
        Some(json!({"projectId":"project","sessionIds":["s","s2"]})),
        json!({"data":{"stopping":2}}),
        client
            .sessions()
            .stop_many(&batch, RequestOptions::default())
    );
    wire_organization!(
        client,
        "DELETE",
        "/platform/sessions/s",
        None,
        json!({"data":{"removed":true,"sessionId":"s"}}),
        client.sessions().delete("s", RequestOptions::default())
    );
    wire_organization!(
        client,
        "POST",
        "/platform/sessions/delete",
        Some(json!({"projectId":"project","sessionIds":["s","s2"]})),
        json!({"data":{"removed":2}}),
        client
            .sessions()
            .delete_many(&batch, RequestOptions::default())
    );
}
#[tokio::test]
async fn reviewed_tier_changes_hybrid_choices_and_safety_native_wire() {
    let quote = json!({"id":"quote","status":"quoted","failureReason":null,"expiresAtMs":1800000000000u64,"quote":{"tier":"pro","tierOverride":"pro","amountCents":12.5,"priceVersion":"v1","action":"upgrade","effectiveAtMs":1800000000000u64,"replacesWindowId":null,"hybridTransition":{"action":"merge","survivingNumberId":"number","absorbNumberId":"other","status":"scheduled","metaDisconnectRequired":false}}});
    let request = NumberTierQuoteRequest {
        project_id: Some("project".into()),
        tier_override: Some(NumberTier::Pro),
        hybrid_resolution: None,
        hybrid_merge: Some(HybridMerge {
            absorb_number_id: "other".into(),
        }),
    };
    wire_organization!(
        client,
        "POST",
        "/platform/sessions/s/tier-quotes",
        Some(
            json!({"projectId":"project","tierOverride":"pro","hybridMerge":{"absorbNumberId":"other"}})
        ),
        json!({"data":quote}),
        client
            .sessions()
            .quote_tier_change("s", &request, RequestOptions::default())
    );
    wire_organization!(
        client,
        "GET",
        "/platform/sessions/s/tier-quotes/q%2Fone",
        None,
        json!({"data":quote}),
        client
            .sessions()
            .retrieve_tier_change("s", "q/one", RequestOptions::default())
    );
    let confirm = SessionTierOverrideRequest {
        project_id: None,
        quote_id: "quote".into(),
    };
    wire_organization!(
        client,
        "PATCH",
        "/platform/sessions/s",
        Some(json!({"quoteId":"quote"})),
        json!({"data":quote}),
        client
            .sessions()
            .set_tier_override("s", &confirm, RequestOptions::default())
    );
    let capabilities = json!({"session":"s","projectId":"project","status":"synced","syncedAt":"2026-10-11T12:00:00Z","checkedAt":null,"accountType":"business","capabilities":[{"kind":"feature","key":"channels","source":"server","unit":null,"value":true},{"kind":"limit","key":"messageEdit.windowSeconds","source":"client_default","unit":"seconds","value":900},{"kind":"feature","key":"futureFeature","source":null,"unit":null,"value":null}]});
    wire_organization!(
        client,
        "GET",
        "/platform/sessions/s/capabilities",
        None,
        json!({"data":capabilities}),
        client
            .sessions()
            .get_capabilities("s", RequestOptions::default())
    );
    let settings = json!({"presence":"dark","typing":"before_text","reads":"replied_chats","pacing":"jittered","onlineStart":9.0,"onlineEnd":18.0});
    let safety = json!({"session":"s","projectId":"project","project":settings,"override":{"presence":"inherit","typing":"off","reads":"inherit","pacing":"inherit"},"effective":settings,"applied":{"observedAt":"2026-10-11T12:00:00Z","presence":"dark","typing":"off","reads":null,"pacing":"jittered"},"mismatch":false,"entitled":true,"entitlementReason":null});
    wire_organization!(
        client,
        "GET",
        "/platform/sessions/s/safe-mode",
        None,
        json!({"data":safety}),
        client
            .sessions()
            .get_safe_mode("s", RequestOptions::default())
    );
    let update = UpdateSessionSafeModeRequest {
        presence: Some(Inheritable::Inherit(InheritSetting::Inherit)),
        pacing: Some(Inheritable::Setting(SafeModePacing::Conversation)),
        ..Default::default()
    };
    wire_organization!(
        client,
        "PUT",
        "/platform/sessions/s/safe-mode",
        Some(json!({"presence":"inherit","pacing":"conversation"})),
        json!({"data":safety}),
        client
            .sessions()
            .update_safe_mode("s", &update, RequestOptions::default())
    );
    // All three server transition shapes decode into closed, tagged native models.
    for transition in [
        json!({"action":"keep","survivingNumberId":"s","keepTransport":"linked_devices"}),
        json!({"action":"split","survivingNumberId":"s","existingNumberTransport":"official_api","newNumberName":"split","newNumberId":"new"}),
        json!({"action":"merge","survivingNumberId":"s","absorbNumberId":"other"}),
    ] {
        let typed: NumberHybridTransition = serde_json::from_value(transition.clone()).unwrap();
        assert_eq!(serde_json::to_value(typed).unwrap(), transition);
    }
}
#[tokio::test]
async fn reviewed_quote_confirmation_rejects_ambiguous_or_missing_choice_before_network() {
    let client = support::organization("http://127.0.0.1:1".into());
    let request = NumberTierQuoteRequest {
        project_id: None,
        tier_override: Some(NumberTier::Pro),
        hybrid_resolution: Some(HybridResolution::Keep {
            transport: HybridTransport::OfficialApi,
        }),
        hybrid_merge: Some(HybridMerge {
            absorb_number_id: "other".into(),
        }),
    };
    assert_eq!(
        client
            .sessions()
            .quote_tier_change("s", &request, RequestOptions::default())
            .await
            .unwrap_err()
            .kind,
        polymorfa_sdk::ErrorKind::Configuration
    );
    assert_eq!(
        client
            .sessions()
            .set_tier_override(
                "s",
                &SessionTierOverrideRequest {
                    project_id: None,
                    quote_id: " ".into()
                },
                RequestOptions::default()
            )
            .await
            .unwrap_err()
            .kind,
        polymorfa_sdk::ErrorKind::Configuration
    );
}
