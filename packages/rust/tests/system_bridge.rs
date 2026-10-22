#[allow(dead_code)]
mod support;
use polymorfa_sdk::{BridgeClient, ClientOptions, Credential, RequestOptions, SystemClient};
use serde_json::json;
#[tokio::test]
async fn credential_free_system_probes_native_request_response_contracts() {
    for (path, expected) in [
        (
            "/messaging/info/status",
            json!({"status":"up","uptime":"1h","version":"1","env":"test"}),
        ),
        (
            "/messaging/info/version",
            json!({"version":"1","buildTime":"2026-10-11T12:00:00Z","env":"test","apiVersion":"2026-09-22","minSupportedVersion":"2026-09-22"}),
        ),
        (
            "/health",
            json!({"status":"healthy","checks":{"database":{"status":"up"},"provider":{"status":"degraded","error":"unavailable"}}}),
        ),
        ("/ping", json!({"status":"pong"})),
    ] {
        let (base, server) =
            support::wire_authorization("GET", path, None, expected.clone(), None).await;
        let client = SystemClient::new(ClientOptions {
            base_url: base,
            ..Default::default()
        })
        .unwrap();
        let (decoded, metadata) = match path {
            "/messaging/info/status" => {
                let result = client.status(RequestOptions::default()).await.unwrap();
                (serde_json::to_value(result.data).unwrap(), result.metadata)
            }
            "/messaging/info/version" => {
                let result = client.version(RequestOptions::default()).await.unwrap();
                (serde_json::to_value(result.data).unwrap(), result.metadata)
            }
            "/health" => {
                let result = client.health(RequestOptions::default()).await.unwrap();
                (serde_json::to_value(result.data).unwrap(), result.metadata)
            }
            _ => {
                let result = client.ping(RequestOptions::default()).await.unwrap();
                (serde_json::to_value(result.data).unwrap(), result.metadata)
            }
        };
        support::assert_subset(&expected, &decoded);
        assert_eq!(metadata.request_id.as_deref(), Some("wire_fixture"));
        server.await.unwrap();
    }
}
#[tokio::test]
async fn project_token_bridge_route_discovery_native_wire_and_principal_guards() {
    let token = format!("pmfa_pt_{}A", "a".repeat(93));
    let expected = json!({"wsUrl":"wss://bridge.example.com/connect","region":"BR","kind":"sandbox","signal":"bartender","tokenKind":"project","expiresAt":1800000000000u64});
    let (base, server) = support::wire_authorization(
        "GET",
        "/messaging/bridge/route",
        None,
        expected.clone(),
        Some(token.clone()),
    )
    .await;
    let client = BridgeClient::new(
        Credential::project_token(token).unwrap(),
        ClientOptions {
            base_url: base,
            ..Default::default()
        },
    )
    .unwrap();
    let response = client
        .routes()
        .resolve(RequestOptions::default())
        .await
        .unwrap();
    support::assert_subset(&expected, &serde_json::to_value(response.data).unwrap());
    assert_eq!(
        response.metadata.request_id.as_deref(),
        Some("wire_fixture")
    );
    server.await.unwrap();
    assert!(BridgeClient::new(support::credential(), Default::default()).is_err());
    assert!(BridgeClient::new(
        Credential::client_token("pmfa_ct_client").unwrap(),
        Default::default()
    )
    .is_err());
}
