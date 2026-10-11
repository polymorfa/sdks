#[allow(dead_code)]
mod support;
use polymorfa_sdk::{flows::*, RequestOptions};
use serde_json::{json, Value};
const PROJECT: &str = "00000000-0000-0000-0000-000000000001";
const FLOW: &str = "00000000-0000-0000-0000-000000000002";
fn summary() -> Value {
    json!({"id":FLOW,"name":"contact","status":"ready","version":"7.3","screenCount":1,"metaLinks":[{"session":"support","sessionId":"sid","wabaId":"waba","metaFlowId":"meta","status":"DRAFT","categories":["CONTACT_US"],"validationErrors":[{"error":"invalid","errorType":"JSON","message":"fix","lineStart":1,"lineEnd":2,"columnStart":1,"columnEnd":5,"pointers":[{"path":"screens[0]","lineStart":1}]}],"uploadState":"valid","previewUrl":"https://preview.example.com","previewExpiresAt":1000,"lastSyncedAt":999,"definitionDigest":"abc","simulated":false}],"createdAt":900,"updatedAt":1000})
}
fn draft() -> Value {
    let mut v = summary();
    v["definition"] = json!({"version":"7.3","screens":[{"id":"CONTACT","layout":{"type":"SingleColumnLayout","children":[]}}]});
    v
}
fn operation() -> Value {
    json!({"id":"operation","requestId":"request","flowId":FLOW,"flowName":"contact","sessionId":"sid","session":"support","action":"upload","state":"uncertain","resolution":null,"wabaId":"waba","metaFlowId":"meta","definitionDigest":"abc","providerStatus":"DRAFT","errorCode":"provider_unavailable","providerCode":503,"providerSubcode":1,"createdAt":1000,"updatedAt":1001,"completedAt":null})
}
fn endpoint() -> Value {
    json!({"id":"endpoint","orgId":"org","projectId":PROJECT,"flowId":FLOW,"sessionId":"sid","mode":"function","url":null,"functionId":"function","deploymentId":null,"enabled":true,"revision":2,"endpointUri":"https://api.example.com/flow","createdAt":1000,"updatedAt":1001})
}
fn key() -> Value {
    json!({"id":"key","state":"active","fingerprint":"abc","publicKey":"PUBLIC KEY","errorCode":null,"createdAt":1000,"activatedAt":1001,"retireAfter":null})
}
fn encryption() -> Value {
    json!({"custody":"managed","activeKeyId":"key","keys":[key()]})
}
#[tokio::test]
async fn drafts_and_provider_reconciliation_native_wire() {
    wire_unwrapped_organization!(
        client,
        "GET",
        "/platform/flows?projectId=00000000-0000-0000-0000-000000000001",
        None,
        json!({"data":[summary()]}),
        client
            .project(PROJECT)
            .unwrap()
            .flows()
            .list(RequestOptions::default())
    );
    let definition: FlowDefinition = serde_json::from_value(draft()["definition"].clone()).unwrap();
    wire_unwrapped_organization!(
        client,
        "POST",
        "/platform/flows",
        Some(json!({"projectId":PROJECT,"draftId":FLOW,"name":"contact","definition":definition})),
        json!({"data":draft()}),
        client.project(PROJECT).unwrap().flows().create(
            &CreateFlowRequest {
                draft_id: Some(FLOW.into()),
                name: "contact".into(),
                definition: definition.clone()
            },
            RequestOptions::default()
        )
    );
    wire_unwrapped_organization!(client,"GET","/platform/flows/00000000-0000-0000-0000-000000000002?projectId=00000000-0000-0000-0000-000000000001",None,json!({"data":draft()}),client.project(PROJECT).unwrap().flows().retrieve(FLOW,RequestOptions::default()));
    wire_unwrapped_organization!(
        client,
        "PATCH",
        "/platform/flows/00000000-0000-0000-0000-000000000002",
        Some(json!({"projectId":PROJECT,"expectedUpdatedAt":1000.0,"status":"ready"})),
        json!({"data":draft()}),
        client.project(PROJECT).unwrap().flows().update(
            FLOW,
            &UpdateFlowRequest {
                expected_updated_at: 1000.0,
                name: None,
                status: Some(FlowDraftStatus::Ready),
                definition: None
            },
            RequestOptions::default()
        )
    );
    wire_unwrapped_organization!(client,"DELETE","/platform/flows/00000000-0000-0000-0000-000000000002?projectId=00000000-0000-0000-0000-000000000001",None,json!({"data":{"ok":true}}),client.project(PROJECT).unwrap().flows().delete(FLOW,RequestOptions::default()));
    let body = FlowProviderRequest {
        session_id: "support".into(),
        categories: Some(vec![FlowCategory::ContactUs]),
        request_id: Some("request".into()),
    };
    wire_unwrapped_organization!(
        client,
        "POST",
        "/platform/flows/00000000-0000-0000-0000-000000000002/upload",
        Some(
            json!({"projectId":PROJECT,"sessionId":"support","categories":["CONTACT_US"],"requestId":"request"})
        ),
        json!({"data":{"operation":operation(),"flow":draft()}}),
        client
            .project(PROJECT)
            .unwrap()
            .flows()
            .upload(FLOW, &body, RequestOptions::default())
    );
    wire_unwrapped_organization!(
        client,
        "POST",
        "/platform/flows/00000000-0000-0000-0000-000000000002/publish",
        Some(
            json!({"projectId":PROJECT,"sessionId":"support","categories":["CONTACT_US"],"requestId":"request"})
        ),
        json!({"data":{"operation":operation(),"flow":draft()}}),
        client
            .project(PROJECT)
            .unwrap()
            .flows()
            .publish(FLOW, &body, RequestOptions::default())
    );
    wire_unwrapped_organization!(
        client,
        "POST",
        "/platform/flows/00000000-0000-0000-0000-000000000002/deprecate",
        Some(
            json!({"projectId":PROJECT,"sessionId":"support","categories":["CONTACT_US"],"requestId":"request"})
        ),
        json!({"data":{"operation":operation(),"flow":draft()}}),
        client
            .project(PROJECT)
            .unwrap()
            .flows()
            .deprecate(FLOW, &body, RequestOptions::default())
    );
    wire_unwrapped_organization!(
        client,
        "POST",
        "/platform/flows/00000000-0000-0000-0000-000000000002/discard",
        Some(
            json!({"projectId":PROJECT,"sessionId":"support","categories":["CONTACT_US"],"requestId":"request"})
        ),
        json!({"data":{"operation":null,"flow":draft()}}),
        client
            .project(PROJECT)
            .unwrap()
            .flows()
            .discard(FLOW, &body, RequestOptions::default())
    );
    wire_unwrapped_organization!(
        client,
        "POST",
        "/platform/flows/00000000-0000-0000-0000-000000000002/sync",
        Some(
            json!({"projectId":PROJECT,"sessionId":"support","categories":["CONTACT_US"],"requestId":"request"})
        ),
        json!({"data":{"operation":operation(),"flow":draft()}}),
        client
            .project(PROJECT)
            .unwrap()
            .flows()
            .sync(FLOW, &body, RequestOptions::default())
    );
    wire_unwrapped_organization!(client,"GET","/platform/flows/00000000-0000-0000-0000-000000000002/receipts?projectId=00000000-0000-0000-0000-000000000001",None,json!({"data":[operation()]}),client.project(PROJECT).unwrap().flows().receipts(FLOW,RequestOptions::default()));
    wire_unwrapped_organization!(client,"GET","/platform/flows/00000000-0000-0000-0000-000000000002?projectId=00000000-0000-0000-0000-000000000001",None,json!({"data":null}),client.project(PROJECT).unwrap().flows().retrieve(FLOW,RequestOptions::default()));
}
#[tokio::test]
async fn endpoint_modes_one_time_secret_encryption_custody_and_receipts_native_wire() {
    let number = FlowNumberRequest {
        session_id: "support".into(),
    };
    wire_unwrapped_organization!(client,"GET","/platform/flows/00000000-0000-0000-0000-000000000002/endpoint?projectId=00000000-0000-0000-0000-000000000001&sessionId=support",None,json!({"data":{"endpoint":endpoint(),"encryption":encryption()}}),client.project(PROJECT).unwrap().flows().endpoint(FLOW,&number,RequestOptions::default()));
    wire_unwrapped_organization!(
        client,
        "PUT",
        "/platform/flows/00000000-0000-0000-0000-000000000002/endpoint",
        Some(
            json!({"projectId":PROJECT,"mode":"function","sessionId":"support","expectedRevision":1,"functionId":"function","deploymentId":null})
        ),
        json!({"data":{"endpoint":endpoint(),"encryption":encryption()}}),
        client.project(PROJECT).unwrap().flows().set_endpoint(
            FLOW,
            &SetFlowEndpointRequest::Function {
                common: EndpointCommon {
                    session_id: "support".into(),
                    enabled: None,
                    expected_revision: Some(1)
                },
                function_id: "function".into(),
                deployment_id: Some(None)
            },
            RequestOptions::default()
        )
    );
    wire_unwrapped_organization!(
        client,
        "PUT",
        "/platform/flows/00000000-0000-0000-0000-000000000002/endpoint",
        Some(
            json!({"projectId":PROJECT,"mode":"forward","sessionId":"support","url":"https://example.com/flow?q=1","rotateSigningSecret":true})
        ),
        json!({"data":{"endpoint":endpoint(),"signingSecret":"one-time-example","encryption":encryption()}}),
        client.project(PROJECT).unwrap().flows().set_endpoint(
            FLOW,
            &SetFlowEndpointRequest::Forward {
                common: EndpointCommon {
                    session_id: "support".into(),
                    enabled: None,
                    expected_revision: None
                },
                url: "https://example.com/flow?q=1".into(),
                rotate_signing_secret: Some(true)
            },
            RequestOptions::default()
        )
    );
    wire_unwrapped_organization!(client,"DELETE","/platform/flows/00000000-0000-0000-0000-000000000002/endpoint?projectId=00000000-0000-0000-0000-000000000001&sessionId=support",None,json!({"data":{"ok":true}}),client.project(PROJECT).unwrap().flows().delete_endpoint(FLOW,&number,RequestOptions::default()));
    wire_unwrapped_organization!(client,"GET","/platform/flows/00000000-0000-0000-0000-000000000002/endpoint/receipts?limit=5&projectId=00000000-0000-0000-0000-000000000001&sessionId=support",None,json!({"data":[{"id":"receipt","flowId":FLOW,"endpointId":"endpoint","sessionId":"sid","mode":"function","action":"INIT","outcome":"succeeded","httpStatus":200,"errorCode":null,"keyId":"key","functionInvocationId":"invocation","durationMs":2.5,"createdAt":1000,"completedAt":1001}]}),client.project(PROJECT).unwrap().flows().endpoint_receipts(FLOW,&ListEndpointReceiptsParameters{session_id:Some("support".into()),limit:Some(5)},RequestOptions::default()));
    wire_unwrapped_organization!(client,"GET","/platform/flow-encryption-keys?projectId=00000000-0000-0000-0000-000000000001&sessionId=support",None,json!({"data":encryption()}),client.project(PROJECT).unwrap().flows().encryption_key(&number,RequestOptions::default()));
    let mut rotation = encryption();
    rotation["key"] = key();
    wire_unwrapped_organization!(
        client,
        "POST",
        "/platform/flow-encryption-keys/rotate",
        Some(json!({"projectId":PROJECT,"sessionId":"support"})),
        json!({"data":rotation}),
        client
            .project(PROJECT)
            .unwrap()
            .flows()
            .rotate_encryption_key(&number, RequestOptions::default())
    );
    let client = support::organization("http://127.0.0.1:1".into())
        .project(PROJECT)
        .unwrap();
    assert!(client
        .flows()
        .retrieve("invalid", RequestOptions::default())
        .await
        .is_err());
    assert!(client
        .flows()
        .update(
            FLOW,
            &UpdateFlowRequest {
                expected_updated_at: f64::NAN,
                name: None,
                status: None,
                definition: None
            },
            RequestOptions::default()
        )
        .await
        .is_err());
    assert!(client
        .flows()
        .set_endpoint(
            FLOW,
            &SetFlowEndpointRequest::Direct {
                common: EndpointCommon {
                    session_id: "support".into(),
                    enabled: None,
                    expected_revision: None
                },
                url: "https://user:password@example.com".into()
            },
            RequestOptions::default()
        )
        .await
        .is_err());
    assert!(client
        .flows()
        .endpoint_receipts(
            FLOW,
            &ListEndpointReceiptsParameters {
                session_id: None,
                limit: Some(101)
            },
            RequestOptions::default()
        )
        .await
        .is_err());
}
