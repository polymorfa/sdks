#[allow(dead_code)]
mod support;
use polymorfa_sdk::{sip::*, ErrorKind, RequestOptions};
use serde_json::json;
fn trunk() -> serde_json::Value {
    json!({"id":"trunk","projectId":"project","name":"PBX","enabled":true,"direction":"both","outbound":{"targetUri":"sips:pbx.example.com","transport":"tls","authUsername":"user","hasPassword":true,"fromUser":null},"inbound":{"username":"inbound","realm":"realm","session":"support","allowedAddresses":["192.0.2.0/24"],"allowedDestinations":["1","44"]},"codecs":["PCMU","opus"],"maxConcurrentCalls":10,"revision":3,"createdAt":"2026-10-10T10:00:00Z","updatedAt":"2026-10-11T10:00:00Z"})
}
fn create() -> CreateSipTrunkRequest {
    CreateSipTrunkRequest {
        settings: CreateSipTrunkBase {
            name: "PBX".into(),
            enabled: Some(true),
            codecs: Some(vec![SipCodec::Pcmu, SipCodec::Opus]),
            max_concurrent_calls: Some(10),
        },
        connection: SipTrunkConnectionInput::Both {
            outbound: SipTrunkOutboundInput {
                target_uri: "sips:pbx.example.com".into(),
                transport: SipTransport::Tls,
                auth_username: Some(Some("user".into())),
                auth_password: Some("write-only".into()),
                from_user: Some(None),
            },
            inbound: SipTrunkInboundInput {
                session: Some(Some("support".into())),
                allowed_addresses: vec!["192.0.2.0/24".into()],
                allowed_destinations: Some(vec!["1".into(), "44".into()]),
            },
        },
    }
}
fn create_json() -> serde_json::Value {
    json!({"projectId":"project","name":"PBX","enabled":true,"codecs":["PCMU","opus"],"maxConcurrentCalls":10,"direction":"both","outbound":{"targetUri":"sips:pbx.example.com","transport":"tls","authUsername":"user","authPassword":"write-only","fromUser":null},"inbound":{"session":"support","allowedAddresses":["192.0.2.0/24"],"allowedDestinations":["1","44"]}})
}
#[tokio::test]
async fn organization_sip_trunk_configuration_credentials_and_endpoint_native_wire() {
    wire_unwrapped_organization!(
        client,
        "GET",
        "/platform/sip-trunks?projectId=project",
        None,
        json!({"data":[trunk()]}),
        client
            .sip_trunks()
            .list("project", RequestOptions::default())
    );
    wire_unwrapped_organization!(
        client,
        "POST",
        "/platform/sip-trunks",
        Some(create_json()),
        json!({"data":{"trunk":trunk(),"inboundCredentials":{"username":"inbound","password":"once","realm":"realm"}}}),
        client
            .sip_trunks()
            .create("project", &create(), RequestOptions::default())
    );
    wire_unwrapped_organization!(
        client,
        "GET",
        "/platform/sip-trunks/trunk",
        None,
        json!({"data":trunk()}),
        client
            .sip_trunks()
            .retrieve("trunk", RequestOptions::default())
    );
    wire_unwrapped_organization!(
        client,
        "PATCH",
        "/platform/sip-trunks/trunk",
        Some(
            json!({"expectedRevision":3,"outbound":{"authUsername":null,"fromUser":null},"inbound":{"session":null}})
        ),
        json!({"data":trunk()}),
        client.sip_trunks().update(
            "trunk",
            &UpdateSipTrunkRequest {
                expected_revision: Some(3),
                outbound: Some(SipTrunkOutboundPatch {
                    auth_username: Some(None),
                    from_user: Some(None),
                    ..Default::default()
                }),
                inbound: Some(SipTrunkInboundPatch {
                    session: Some(None),
                    ..Default::default()
                }),
                ..Default::default()
            },
            RequestOptions::default()
        )
    );
    wire_unwrapped_organization!(
        client,
        "DELETE",
        "/platform/sip-trunks/trunk",
        None,
        json!({"data":{"id":"trunk","deleted":true}}),
        client
            .sip_trunks()
            .delete("trunk", RequestOptions::default())
    );
    wire_unwrapped_organization!(
        client,
        "POST",
        "/platform/sip-trunks/trunk/credentials",
        None,
        json!({"data":{"username":"inbound","password":"once","realm":"realm"}}),
        client
            .sip_trunks()
            .rotate_credentials("trunk", RequestOptions::default())
    );
    wire_unwrapped_organization!(
        client,
        "GET",
        "/platform/sip/endpoint",
        None,
        json!({"data":{"status":"hosted","host":"sip.example.com","transports":[{"transport":"tls","port":5061,"srtp":"required"}],"rtp":{"protocol":"udp","portMin":10000,"portMax":20000}}}),
        client.sip_trunks().endpoint(RequestOptions::default())
    );
    wire_unwrapped_organization!(
        client,
        "GET",
        "/platform/sip/endpoint",
        None,
        json!({"data":{"status":"sip_not_hosted","host":null,"transports":[],"rtp":null}}),
        client.sip_trunks().endpoint(RequestOptions::default())
    );
}
#[tokio::test]
async fn immutable_project_sip_methods_and_foreign_project_refusal_native_wire() {
    let expected = json!({"data":[trunk()]});
    let (base, server) = support::wire(
        "GET",
        "/platform/sip-trunks?projectId=project",
        None,
        expected.clone(),
    )
    .await;
    let client = support::organization(base);
    let view = client.project("project").unwrap();
    let response = view
        .sip_trunks()
        .list(RequestOptions::default())
        .await
        .unwrap();
    support::assert_subset(
        &expected["data"],
        &serde_json::to_value(response.data).unwrap(),
    );
    server.await.unwrap();
    let expected = json!({"data":{"trunk":trunk()}});
    let (base, server) = support::wire(
        "POST",
        "/platform/sip-trunks",
        Some(create_json()),
        expected.clone(),
    )
    .await;
    let client = support::organization(base);
    let view = client.project("project").unwrap();
    let response = view
        .sip_trunks()
        .create(&create(), RequestOptions::default())
        .await
        .unwrap();
    support::assert_subset(
        &expected["data"],
        &serde_json::to_value(response.data).unwrap(),
    );
    server.await.unwrap();
    let mut foreign = trunk();
    foreign["projectId"] = json!("other");
    let (base, server) = support::wire(
        "GET",
        "/platform/sip-trunks/trunk",
        None,
        json!({"data":foreign}),
    )
    .await;
    let client = support::organization(base);
    let view = client.project("project").unwrap();
    let error = view
        .sip_trunks()
        .delete(
            "trunk",
            RequestOptions {
                idempotency_key: Some("mutation-key".into()),
                ..Default::default()
            },
        )
        .await
        .unwrap_err();
    assert_eq!(error.kind, ErrorKind::NotFound);
    assert_eq!(error.status, Some(404));
    server.await.unwrap();
}
#[tokio::test]
async fn project_sip_preflight_excludes_write_key_then_permits_matching_revision_change() {
    use tokio::{
        io::{AsyncReadExt, AsyncWriteExt},
        net::TcpListener,
    };
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let base = format!("http://{}", listener.local_addr().unwrap());
    let response = json!({"data":trunk()}).to_string();
    let server = tokio::spawn(async move {
        for index in 0..2 {
            let (mut socket, _) = listener.accept().await.unwrap();
            let mut bytes = Vec::new();
            let mut buffer = [0u8; 4096];
            let (head_end, len) = loop {
                let n = socket.read(&mut buffer).await.unwrap();
                assert!(n > 0);
                bytes.extend_from_slice(&buffer[..n]);
                if let Some(end) = bytes.windows(4).position(|v| v == b"\r\n\r\n") {
                    let head = String::from_utf8_lossy(&bytes[..end]);
                    let len = head
                        .lines()
                        .find_map(|line| {
                            line.strip_prefix("content-length: ")
                                .and_then(|v| v.parse::<usize>().ok())
                        })
                        .unwrap_or(0);
                    break (end + 4, len);
                }
            };
            while bytes.len() < head_end + len {
                let n = socket.read(&mut buffer).await.unwrap();
                assert!(n > 0);
                bytes.extend_from_slice(&buffer[..n]);
            }
            let head = String::from_utf8_lossy(&bytes[..head_end]);
            assert!(head.starts_with(if index == 0 {
                "GET /platform/sip-trunks/trunk HTTP/1.1"
            } else {
                "PATCH /platform/sip-trunks/trunk HTTP/1.1"
            }));
            assert_eq!(head.contains("idempotency-key: mutation-key"), index == 1);
            if index == 1 {
                assert_eq!(
                    serde_json::from_slice::<serde_json::Value>(&bytes[head_end..head_end + len])
                        .unwrap(),
                    json!({"expectedRevision":3,"enabled":false})
                );
            }
            socket.write_all(format!("HTTP/1.1 200 OK\r\ncontent-type: application/json\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{response}",response.len()).as_bytes()).await.unwrap();
        }
    });
    let client = support::organization(base);
    let view = client.project("PROJECT").unwrap();
    let result = view
        .sip_trunks()
        .update(
            "trunk",
            &UpdateSipTrunkRequest {
                expected_revision: Some(3),
                enabled: Some(false),
                ..Default::default()
            },
            RequestOptions {
                idempotency_key: Some("mutation-key".into()),
                ..Default::default()
            },
        )
        .await
        .unwrap();
    assert_eq!(result.data.project_id, "project");
    server.await.unwrap();
}
