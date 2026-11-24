#[allow(dead_code)]
mod support;
use polymorfa_sdk::{configuration::*, platform_connections::*, RequestOptions};
use serde_json::json;
#[tokio::test]
async fn team_connection_lifecycle_batch_and_configuration_native_wire() {
    let context = ConnectionProjectContext {
        project_id: Some("project".into()),
    };
    let connection = json!({"connectionId":"s","name":"Support","tenantId":"team","type":"whatsapp","method":"linked_device","testMode":false,"status":"CONNECTED","createdAt":"2026-10-11T12:00:00Z","updatedAt":"2026-10-11T12:00:00Z"});
    let platform = json!({"_id":"number","_creationTime":1,"projectId":"project","connectionId":"s","name":"Support","isBusiness":true,"testMode":false,"status":"CONNECTED","messageCount":2});
    wire_team!(
        client,
        "GET",
        "/platform/connections?projectId=project",
        None,
        json!({"data":[platform]}),
        client
            .connections()
            .list(&context, RequestOptions::default())
    );
    wire_team!(
        client,
        "GET",
        "/platform/connections/s%2Fone",
        None,
        json!({"success":true,"data":connection}),
        client
            .connections()
            .retrieve("s/one", RequestOptions::default())
    );
    let update = UpdateConnectionRequest {
        configuration: ConnectionConfigurationPatch::default(),
        revision: 3,
    };
    wire_team!(
        client,
        "PUT",
        "/platform/connections/s",
        Some(json!({"configuration":{},"revision":3})),
        json!({"success":true,"data":connection}),
        client
            .connections()
            .update("s", &update, RequestOptions::default())
    );
    wire_team!(
        client,
        "POST",
        "/platform/connections/s/start",
        Some(json!({"projectId":"project"})),
        json!({"data":{"starting":true,"connectionId":"s"}}),
        client
            .connections()
            .start("s", &context, RequestOptions::default())
    );
    wire_team!(
        client,
        "POST",
        "/platform/connections/s/stop",
        Some(json!({"projectId":"project"})),
        json!({"data":{"stopping":true,"connectionId":"s"}}),
        client
            .connections()
            .stop("s", &context, RequestOptions::default())
    );
    let batch = ConnectionBatchRequest {
        project_id: Some("project".into()),
        connection_ids: vec!["s".into(), "s2".into()],
    };
    wire_team!(
        client,
        "POST",
        "/platform/connections/stop",
        Some(json!({"projectId":"project","connectionIds":["s","s2"]})),
        json!({"data":{"stopping":2}}),
        client
            .connections()
            .stop_many(&batch, RequestOptions::default())
    );
    wire_team!(
        client,
        "DELETE",
        "/platform/connections/s",
        None,
        json!({"data":{"removed":true,"connectionId":"s"}}),
        client.connections().delete("s", RequestOptions::default())
    );
    wire_team!(
        client,
        "POST",
        "/platform/connections/delete",
        Some(json!({"projectId":"project","connectionIds":["s","s2"]})),
        json!({"data":{"removed":2}}),
        client
            .connections()
            .delete_many(&batch, RequestOptions::default())
    );
}
#[tokio::test]
async fn reviewed_tier_changes_hybrid_choices_and_safety_native_wire() {
    let quote = json!({"id":"quote","status":"quoted","failureReason":null,"expiresAtMs":1800000000000u64,"quote":{"tier":"pro","tierOverride":"pro","amountCents":12.5,"priceVersion":"v1","action":"upgrade","effectiveAtMs":1800000000000u64,"replacesWindowId":null,"hybridTransition":{"action":"merge","survivingConnectionId":"number","absorbConnectionId":"other","status":"scheduled","metaDisconnectRequired":false}}});
    let request = ConnectionTierQuoteRequest {
        project_id: Some("project".into()),
        tier_override: Some(ConnectionTier::Pro),
        hybrid_resolution: None,
        hybrid_merge: Some(HybridMerge {
            absorb_connection_id: "other".into(),
        }),
    };
    wire_team!(
        client,
        "POST",
        "/platform/connections/s/tier-quotes",
        Some(
            json!({"projectId":"project","tierOverride":"pro","hybridMerge":{"absorbConnectionId":"other"}})
        ),
        json!({"data":quote}),
        client
            .connections()
            .quote_tier_change("s", &request, RequestOptions::default())
    );
    wire_team!(
        client,
        "GET",
        "/platform/connections/s/tier-quotes/q%2Fone",
        None,
        json!({"data":quote}),
        client
            .connections()
            .retrieve_tier_change("s", "q/one", RequestOptions::default())
    );
    let confirm = ConnectionTierOverrideRequest {
        project_id: None,
        quote_id: "quote".into(),
    };
    wire_team!(
        client,
        "PATCH",
        "/platform/connections/s",
        Some(json!({"quoteId":"quote"})),
        json!({"data":quote}),
        client
            .connections()
            .set_tier_override("s", &confirm, RequestOptions::default())
    );
    let capabilities = json!({"connection":"s","projectId":"project","status":"synced","syncedAt":"2026-10-11T12:00:00Z","checkedAt":null,"accountType":"business","capabilities":[{"kind":"feature","key":"channels","source":"server","unit":null,"value":true},{"kind":"limit","key":"messageEdit.windowSeconds","source":"client_default","unit":"seconds","value":900},{"kind":"feature","key":"futureFeature","source":null,"unit":null,"value":null}]});
    wire_team!(
        client,
        "GET",
        "/platform/connections/s/capabilities",
        None,
        json!({"data":capabilities}),
        client
            .connections()
            .get_capabilities("s", RequestOptions::default())
    );
    let settings = json!({"presence":"dark","typing":"before_text","reads":"replied_chats","pacing":"jittered","onlineStart":9.0,"onlineEnd":18.0});
    let safety = json!({"connection":"s","projectId":"project","project":settings,"override":{"presence":"inherit","typing":"off","reads":"inherit","pacing":"inherit"},"effective":settings,"applied":{"observedAt":"2026-10-11T12:00:00Z","presence":"dark","typing":"off","reads":null,"pacing":"jittered"},"mismatch":false,"entitled":true,"entitlementReason":null});
    wire_team!(
        client,
        "GET",
        "/platform/connections/s/safe-mode",
        None,
        json!({"data":safety}),
        client
            .connections()
            .get_safe_mode("s", RequestOptions::default())
    );
    let update = UpdateConnectionSafeModeRequest {
        presence: Some(Inheritable::Inherit(InheritSetting::Inherit)),
        pacing: Some(Inheritable::Setting(SafeModePacing::Conversation)),
        ..Default::default()
    };
    wire_team!(
        client,
        "PUT",
        "/platform/connections/s/safe-mode",
        Some(json!({"presence":"inherit","pacing":"conversation"})),
        json!({"data":safety}),
        client
            .connections()
            .update_safe_mode("s", &update, RequestOptions::default())
    );
    // All three server transition shapes decode into closed, tagged native models.
    for transition in [
        json!({"action":"keep","survivingConnectionId":"s","keepTransport":"linked_devices"}),
        json!({"action":"split","survivingConnectionId":"s","existingConnectionTransport":"official_api","newConnectionName":"split","newConnectionId":"new"}),
        json!({"action":"merge","survivingConnectionId":"s","absorbConnectionId":"other"}),
    ] {
        let typed: ConnectionHybridTransition = serde_json::from_value(transition.clone()).unwrap();
        assert_eq!(serde_json::to_value(typed).unwrap(), transition);
    }
}
#[tokio::test]
async fn reviewed_quote_confirmation_rejects_ambiguous_or_missing_choice_before_network() {
    let client = support::team("http://127.0.0.1:1".into());
    let request = ConnectionTierQuoteRequest {
        project_id: None,
        tier_override: Some(ConnectionTier::Pro),
        hybrid_resolution: Some(HybridResolution::Keep {
            transport: HybridTransport::OfficialApi,
        }),
        hybrid_merge: Some(HybridMerge {
            absorb_connection_id: "other".into(),
        }),
    };
    assert_eq!(
        client
            .connections()
            .quote_tier_change("s", &request, RequestOptions::default())
            .await
            .unwrap_err()
            .kind,
        polymorfa_sdk::ErrorKind::Configuration
    );
    assert_eq!(
        client
            .connections()
            .set_tier_override(
                "s",
                &ConnectionTierOverrideRequest {
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
