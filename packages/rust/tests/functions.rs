#[allow(dead_code)]
mod support;
use polymorfa_sdk::{functions::*, ErrorKind, RequestOptions};
use serde_json::{json, Value};
const PROJECT: &str = "00000000-0000-0000-0000-000000000001";
const FUNCTION: &str = "00000000-0000-0000-0000-000000000002";
const DEPLOYMENT: &str = "00000000-0000-0000-0000-000000000003";
fn definition() -> Value {
    json!({"id":FUNCTION,"projectId":PROJECT,"name":"hello","enabled":true,"revision":2,"activeDeploymentId":DEPLOYMENT,"createdAt":"then","updatedAt":"now"})
}
fn summary() -> Value {
    json!({"id":DEPLOYMENT,"functionId":FUNCTION,"language":"typescript","region":"eu","compatibilityDate":"2026-09-01","sha256":"abc","secretVersionIds":[],"egressOrigins":["https://example.com"],"createdAt":"now"})
}
fn deployment() -> Value {
    let mut v = summary();
    v["source"] = json!("export default {}");
    v
}
fn secret() -> Value {
    json!({"id":DEPLOYMENT,"name":"API_KEY","createdAt":"now","revokedAt":null})
}
fn invocation() -> Value {
    json!({"id":DEPLOYMENT,"functionId":FUNCTION,"deploymentId":DEPLOYMENT,"outcome":"succeeded","trigger":"test","errorCode":null,"durationMs":5.5,"responseBytes":2,"attempt":1,"createdAt":"then","completedAt":"now"})
}
#[tokio::test]
async fn definitions_revision_guard_and_immutable_deployments_native_wire() {
    wire_unwrapped_organization!(
        client,
        "GET",
        "/platform/functions?limit=5&projectId=00000000-0000-0000-0000-000000000001",
        None,
        json!({"data":{"items":[definition()],"nextCursor":"next"}}),
        client.project(PROJECT).unwrap().functions().list(
            &ListFunctionsParameters {
                limit: Some(5),
                before: None
            },
            RequestOptions::default()
        )
    );
    wire_unwrapped_organization!(
        client,
        "POST",
        "/platform/functions",
        Some(json!({"projectId":PROJECT,"functionId":FUNCTION,"name":"hello"})),
        json!({"data":definition()}),
        client.project(PROJECT).unwrap().functions().create(
            &CreateFunctionRequest {
                function_id: Some(FUNCTION.into()),
                name: "hello".into()
            },
            RequestOptions::default()
        )
    );
    wire_unwrapped_organization!(client,"GET","/platform/functions/00000000-0000-0000-0000-000000000002?projectId=00000000-0000-0000-0000-000000000001",None,json!({"data":definition()}),client.project(PROJECT).unwrap().functions().retrieve(FUNCTION,RequestOptions::default()));
    wire_unwrapped_organization!(
        client,
        "PATCH",
        "/platform/functions/00000000-0000-0000-0000-000000000002",
        Some(json!({"projectId":PROJECT,"expectedRevision":1,"enabled":true})),
        json!({"data":definition()}),
        client.project(PROJECT).unwrap().functions().update(
            FUNCTION,
            &UpdateFunctionRequest {
                expected_revision: 1,
                name: None,
                enabled: Some(true)
            },
            RequestOptions::default()
        )
    );
    wire_unwrapped_organization!(client,"DELETE","/platform/functions/00000000-0000-0000-0000-000000000002?expectedRevision=2&projectId=00000000-0000-0000-0000-000000000001",None,json!({"data":{"ok":true}}),client.project(PROJECT).unwrap().functions().delete(FUNCTION,2,RequestOptions::default()));
    wire_unwrapped_organization!(client,"GET","/platform/functions/00000000-0000-0000-0000-000000000002/deployments?before=cursor&limit=5&projectId=00000000-0000-0000-0000-000000000001",None,json!({"data":{"items":[summary()],"nextCursor":null}}),client.project(PROJECT).unwrap().functions().deployments().list(FUNCTION,&ListFunctionsParameters{limit:Some(5),before:Some("cursor".into())},RequestOptions::default()));
    wire_unwrapped_organization!(
        client,
        "POST",
        "/platform/functions/00000000-0000-0000-0000-000000000002/deployments",
        Some(
            json!({"projectId":PROJECT,"deploymentId":DEPLOYMENT,"source":"export default {}","language":"typescript","region":"eu","compatibilityDate":"2026-09-01","egressOrigins":["https://example.com"]})
        ),
        json!({"data":deployment()}),
        client
            .project(PROJECT)
            .unwrap()
            .functions()
            .deployments()
            .create(
                FUNCTION,
                &CreateDeploymentRequest {
                    deployment_id: DEPLOYMENT.into(),
                    source: "export default {}".into(),
                    language: FunctionLanguage::Typescript,
                    region: "eu".into(),
                    compatibility_date: "2026-09-01".into(),
                    secret_version_ids: None,
                    egress_origins: Some(vec!["https://example.com".into()])
                },
                RequestOptions::default()
            )
    );
    wire_unwrapped_organization!(client,"GET","/platform/functions/00000000-0000-0000-0000-000000000002/deployments/00000000-0000-0000-0000-000000000003?projectId=00000000-0000-0000-0000-000000000001",None,json!({"data":deployment()}),client.project(PROJECT).unwrap().functions().deployments().retrieve(FUNCTION,DEPLOYMENT,RequestOptions::default()));
    wire_unwrapped_organization!(
        client,
        "PUT",
        "/platform/functions/00000000-0000-0000-0000-000000000002/promotion",
        Some(json!({"projectId":PROJECT,"deploymentId":DEPLOYMENT,"expectedRevision":2})),
        json!({"data":definition()}),
        client
            .project(PROJECT)
            .unwrap()
            .functions()
            .deployments()
            .promote(
                FUNCTION,
                &PromoteDeploymentRequest {
                    deployment_id: DEPLOYMENT.into(),
                    expected_revision: 2
                },
                RequestOptions::default()
            )
    );
}
#[tokio::test]
async fn secrets_and_nonretained_invocation_receipts_native_wire() {
    wire_unwrapped_organization!(client,"GET","/platform/functions/00000000-0000-0000-0000-000000000002/secrets?projectId=00000000-0000-0000-0000-000000000001",None,json!({"data":{"items":[secret()],"nextCursor":null}}),client.project(PROJECT).unwrap().functions().secrets().list(FUNCTION,&ListFunctionsParameters::default(),RequestOptions::default()));
    wire_unwrapped_organization!(
        client,
        "POST",
        "/platform/functions/00000000-0000-0000-0000-000000000002/secrets",
        Some(json!({"projectId":PROJECT,"name":"API_KEY","value":"example-value"})),
        json!({"data":secret()}),
        client
            .project(PROJECT)
            .unwrap()
            .functions()
            .secrets()
            .create(
                FUNCTION,
                &CreateSecretRequest {
                    name: "API_KEY".into(),
                    value: "example-value".into()
                },
                RequestOptions::default()
            )
    );
    wire_unwrapped_organization!(client,"DELETE","/platform/functions/00000000-0000-0000-0000-000000000002/secrets/00000000-0000-0000-0000-000000000003?projectId=00000000-0000-0000-0000-000000000001",None,json!({"data":{"ok":true}}),client.project(PROJECT).unwrap().functions().secrets().revoke(FUNCTION,DEPLOYMENT,RequestOptions::default()));
    wire_unwrapped_organization!(client,"GET","/platform/functions/00000000-0000-0000-0000-000000000002/invocations?projectId=00000000-0000-0000-0000-000000000001",None,json!({"data":{"items":[invocation()],"nextCursor":"next"}}),client.project(PROJECT).unwrap().functions().invocations().list(FUNCTION,&ListFunctionsParameters::default(),RequestOptions::default()));
    wire_unwrapped_organization!(client,"GET","/platform/functions/00000000-0000-0000-0000-000000000002/invocations/00000000-0000-0000-0000-000000000003?projectId=00000000-0000-0000-0000-000000000001",None,json!({"data":invocation()}),client.project(PROJECT).unwrap().functions().invocations().retrieve(FUNCTION,DEPLOYMENT,RequestOptions::default()));
    wire_unwrapped_organization!(
        client,
        "POST",
        "/platform/functions/00000000-0000-0000-0000-000000000002/invocations",
        Some(
            json!({"projectId":PROJECT,"deploymentId":DEPLOYMENT,"trigger":"test","request":{"method":"POST","url":"https://function.polymorfa.invalid/test","headers":{"content-type":"text/plain"},"bodyBase64":"aGk="}})
        ),
        json!({"data":{"receipt":invocation(),"replayed":false,"response":{"status":200,"headers":{"content-type":"text/plain"},"bodyBase64":"b2s="},"responseRetained":false,"retryable":false}}),
        client
            .project(PROJECT)
            .unwrap()
            .functions()
            .invocations()
            .create(
                FUNCTION,
                &CreateInvocationRequest {
                    deployment_id: Some(DEPLOYMENT.into()),
                    trigger: Some(InvocationTrigger::Test),
                    request: FunctionRequest {
                        method: FunctionRequestMethod::Post,
                        url: "https://function.polymorfa.invalid/test".into(),
                        headers: [("content-type".into(), "text/plain".into())].into(),
                        body_base64: "aGk=".into()
                    }
                },
                RequestOptions {
                    idempotency_key: Some("invocation-key".into()),
                    max_network_retries: Some(10),
                    ..Default::default()
                }
            )
    );
    let client = support::organization("http://127.0.0.1:1".into())
        .project(PROJECT)
        .unwrap();
    assert_eq!(
        client
            .functions()
            .retrieve("NOT-A-UUID", RequestOptions::default())
            .await
            .unwrap_err()
            .kind,
        ErrorKind::Validation
    );
    assert!(client
        .functions()
        .delete(FUNCTION, 0, RequestOptions::default())
        .await
        .is_err());
    assert!(serde_json::from_value::<FunctionInvocationResult>(
        json!({"receipt":invocation(),"replayed":true,"responseRetained":true,"retryable":false})
    )
    .is_err());
}
#[tokio::test]
async fn function_writes_do_not_retry_even_with_keyed_override() {
    use tokio::{
        io::{AsyncReadExt, AsyncWriteExt},
        net::TcpListener,
    };
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let server = tokio::spawn(async move {
        let (mut socket, _) = listener.accept().await.unwrap();
        let mut bytes = vec![0; 8192];
        let _ = socket.read(&mut bytes).await.unwrap();
        socket.write_all(b"HTTP/1.1 503 Service Unavailable\r\nContent-Type: application/json\r\nContent-Length: 31\r\nConnection: close\r\n\r\n{\"error\":{\"message\":\"offline\"}}").await.unwrap();
        assert!(
            tokio::time::timeout(std::time::Duration::from_millis(100), listener.accept())
                .await
                .is_err()
        );
    });
    let client = support::organization(format!("http://{address}"))
        .project(PROJECT)
        .unwrap();
    let error = client
        .functions()
        .create(
            &CreateFunctionRequest {
                function_id: None,
                name: "hello".into(),
            },
            RequestOptions {
                idempotency_key: Some("key".into()),
                max_network_retries: Some(10),
                ..Default::default()
            },
        )
        .await
        .unwrap_err();
    assert_eq!(error.metadata.as_ref().unwrap().attempts, 1);
    server.await.unwrap();
}
