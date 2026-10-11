use polymorfa_sdk::{
    models::*, webhooks, ClientOptions, Credential, ErrorKind, MessagingClient, RequestOptions,
};
use serde_json::{json, Value};
use std::{
    collections::BTreeMap,
    io::{BufRead, BufReader},
    process::{Command, Stdio},
    time::Duration,
};
use tokio_util::sync::CancellationToken;

#[tokio::test]
async fn language_neutral_behavior_fixtures() {
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
    let fixtures: Value = serde_json::from_slice(
        &std::fs::read(root.join("contracts/fixtures/behavior.json")).unwrap(),
    )
    .unwrap();
    let mut process = Command::new("node")
        .arg(root.join("scripts/sdk-fixture-server.mjs"))
        .args(["--port", "0"])
        .stdout(Stdio::piped())
        .spawn()
        .unwrap();
    struct ChildGuard(std::process::Child);
    impl Drop for ChildGuard {
        fn drop(&mut self) {
            let _ = self.0.kill();
            let _ = self.0.wait();
        }
    }
    let mut output = BufReader::new(process.stdout.take().unwrap());
    let mut line = String::new();
    output.read_line(&mut line).unwrap();
    let server: Value = serde_json::from_str(line.trim()).unwrap();
    let base = server["url"].as_str().unwrap().to_owned();
    let _guard = ChildGuard(process);
    for fixture in fixtures["scenarios"].as_array().unwrap() {
        let id = fixture["id"].as_str().unwrap();
        let client = MessagingClient::new(
            Credential::organization_api_key(fixtures["organizationCredential"].as_str().unwrap())
                .unwrap(),
            ClientOptions {
                base_url: base.clone(),
                ..ClientOptions::default()
            },
        )
        .unwrap();
        let mut options = RequestOptions::default();
        options
            .headers
            .insert("x-polymorfa-fixture".into(), id.into());
        options.max_network_retries = fixture["outcome"]["maxNetworkRetries"]
            .as_u64()
            .map(|v| v as u32);
        if let Some(value) = fixture["request"]["headers"]["idempotency-key"].as_str() {
            options.idempotency_key = Some(value.into());
        }
        if id == "request-version" {
            options.api_version = Some(
                fixture["request"]["headers"]["polymorfa-version"]
                    .as_str()
                    .unwrap()
                    .into(),
            );
        }
        if id == "timeout" {
            options.timeout = Some(Duration::from_millis(10));
            options.max_network_retries = Some(0);
        }
        if id == "cancellation" {
            let token = CancellationToken::new();
            options.cancellation = Some(token.clone());
            options.max_network_retries = Some(0);
            tokio::spawn(async move {
                tokio::time::sleep(Duration::from_millis(10)).await;
                token.cancel();
            });
        }
        let query: Query = fixture["request"]["query"]
            .as_object()
            .map(|object| {
                object
                    .iter()
                    .map(|(key, value)| {
                        (
                            key.clone(),
                            match value {
                                Value::Array(values) => QueryValue::Many(
                                    values
                                        .iter()
                                        .map(|v| QueryPrimitive::String(v.as_str().unwrap().into()))
                                        .collect(),
                                ),
                                _ => QueryValue::from(value.as_str().unwrap()),
                            },
                        )
                    })
                    .collect()
            })
            .unwrap_or_default();
        let result = match id {
            "sessions-list" => client.sessions().list(options).await.map(|r| {
                assert_eq!(r.data.data[0].name, "support");
                (r.metadata.attempts, json!(r.data))
            }),
            "message-send" => client
                .messages()
                .send(
                    "support",
                    &SendMessageRequest::text(
                        ConversationReference::phone("+15551234567"),
                        "Hello",
                    ),
                    options,
                )
                .await
                .map(|r| {
                    assert_eq!(r.data.data.receipt.id, "msg_fixture");
                    (r.metadata.attempts, json!(r.data))
                }),
            _ => client
                .raw::<Value>(
                    reqwest::Method::from_bytes(
                        fixture["request"]["method"].as_str().unwrap().as_bytes(),
                    )
                    .unwrap(),
                    fixture["request"]["path"].as_str().unwrap(),
                    &query,
                    fixture["request"].get("body"),
                    options,
                )
                .await
                .map(|r| (r.metadata.attempts, r.data)),
        };
        match fixture["outcome"]["error"].as_str() {
            Some(kind) => {
                let error = result.unwrap_err();
                let expected = match kind {
                    "authentication" => ErrorKind::Authentication,
                    "authorization" => ErrorKind::Authorization,
                    "payment_required" => ErrorKind::PaymentRequired,
                    "validation" => ErrorKind::Validation,
                    "not_found" => ErrorKind::NotFound,
                    "conflict" => ErrorKind::Conflict,
                    "rate_limit" => ErrorKind::RateLimit,
                    "timeout" => ErrorKind::Timeout,
                    "cancelled" => ErrorKind::Cancelled,
                    "server" => ErrorKind::Server,
                    _ => panic!("Unknown expected type {kind}"),
                };
                assert_eq!(error.kind, expected, "{id}: {error:?}");
                if let Some(code) = fixture["outcome"]["code"].as_str() {
                    assert_eq!(error.code.as_deref(), Some(code), "{id}");
                }
                if let Some(request_id) = fixture["outcome"]["requestId"].as_str() {
                    assert_eq!(error.request_id.as_deref(), Some(request_id), "{id}");
                }
            }
            None => {
                let (attempts, _) = result.unwrap_or_else(|error| panic!("{id}: {error:?}"));
                assert_eq!(
                    attempts as u64,
                    fixture["outcome"]["attempts"].as_u64().unwrap(),
                    "{id}"
                );
            }
        }
        if matches!(id, "timeout" | "cancellation") {
            tokio::time::sleep(Duration::from_millis(20)).await;
        }
        let state: Value = reqwest::get(format!("{base}/__fixtures/{id}/state"))
            .await
            .unwrap()
            .json()
            .await
            .unwrap();
        assert_eq!(state["mismatches"], json!([]), "{id}: {state}");
        assert_eq!(state["attempts"], fixture["outcome"]["attempts"], "{id}");
    }
    for fixture in fixtures["webhooks"].as_array().unwrap() {
        let body = fixture["body"].as_str().unwrap().as_bytes();
        let signature = fixture["signature"].as_str().unwrap();
        let secret = fixture["secret"].as_str().unwrap();
        let valid = fixture["valid"].as_bool().unwrap();
        if fixture["protocol"] == "native" {
            assert_eq!(webhooks::verify_signature(body, signature, secret), valid);
        } else {
            assert_eq!(
                webhooks::construct_local_event(
                    body,
                    signature,
                    secret,
                    fixture["nowUnixSeconds"].as_u64().unwrap(),
                    fixture["toleranceSeconds"].as_u64().unwrap()
                )
                .is_ok(),
                valid
            );
        }
    }
    let fixture = &fixtures["webhooks"][0];
    let event = webhooks::construct_event(
        fixture["body"].as_str().unwrap().as_bytes(),
        fixture["signature"].as_str().unwrap(),
        fixture["secret"].as_str().unwrap(),
    )
    .unwrap();
    assert!(matches!(event, webhooks::WebhookEvent::Unknown(_)));
    assert_eq!(event.envelope().payload["capability"], 42);
}

#[test]
fn credential_and_runtime_configuration_fail_closed() {
    assert!(Credential::organization_api_key("pmfa_ls_listener").is_err());
    assert!(Credential::organization_api_key("pmfa_ct_client").is_err());
    assert!(Credential::project_token(format!("pmfa_pt_{}B", "a".repeat(93))).is_err());
    assert!(Credential::client_token("pmfa_ct_").is_err());
    let credential = Credential::organization_api_key(format!("pmfa_{}", "a".repeat(72))).unwrap();
    assert!(MessagingClient::new(
        credential.clone(),
        ClientOptions {
            base_url: "http://untrusted.example".into(),
            ..ClientOptions::default()
        }
    )
    .is_err());
    assert!(MessagingClient::new(
        credential,
        ClientOptions {
            timeout: Duration::ZERO,
            ..ClientOptions::default()
        }
    )
    .is_err());
}

#[tokio::test]
async fn immutable_project_views_and_raw_path_guards() {
    use polymorfa_sdk::{OrganizationClient, ProjectClient};
    let key = Credential::organization_api_key(format!("pmfa_{}", "a".repeat(72))).unwrap();
    let organization = OrganizationClient::new(key, ClientOptions::default()).unwrap();
    let first = organization.project("one").unwrap();
    let second = first.project("two").unwrap();
    assert_eq!(first.project_id(), "one");
    assert_eq!(second.project_id(), "two");
    let token = Credential::project_token(format!("pmfa_pt_{}A", "a".repeat(93))).unwrap();
    assert!(OrganizationClient::new(token.clone(), ClientOptions::default()).is_err());
    let project = ProjectClient::new(token, "one", ClientOptions::default()).unwrap();
    assert!(project.project("two").is_err());
    for path in [
        "//external.test",
        "/../events",
        "/%2e%2e/events",
        "/x\\events",
        "https://external.test",
        "/platform/projects/other/events",
    ] {
        assert!(
            project
                .raw::<Value>(
                    reqwest::Method::GET,
                    path,
                    &BTreeMap::new(),
                    None,
                    RequestOptions::default()
                )
                .await
                .is_err(),
            "{path}"
        );
    }
}
