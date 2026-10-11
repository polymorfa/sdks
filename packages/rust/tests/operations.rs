#[allow(dead_code)]
mod support;
use polymorfa_sdk::{operations::*, ErrorKind, RequestOptions};
use serde_json::json;
use std::time::Duration;
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::TcpListener,
};

fn operation(project: bool, status: &str, sequence: u64) -> serde_json::Value {
    json!({"id":"operation","organizationId":"org","projectId":if project { Some("project") } else { None },"kind":"session_lifecycle","resource":{"type":"session","id":"s"},"status":status,"sequence":sequence,"capabilities":{"cancellable":true,"watchable":true},"progress":{"code":"starting","current":1,"total":2},"result":null,"error":null,"actionRequired":null,"createdAt":"2026-10-11T12:00:00Z","updatedAt":"2026-10-11T12:00:00Z","completedAt":null})
}
#[tokio::test]
async fn organization_and_project_operation_public_methods_native_wire_contracts() {
    for project in [false, true] {
        let prefix = if project {
            "/platform/projects/project"
        } else {
            "/platform"
        };
        let expected = operation(project, "running", 1);
        let (base, server) = support::wire(
            "GET",
            &format!("{prefix}/operations?kind=session_lifecycle&limit=1&status=running"),
            None,
            json!({"data":[expected],"page":{"nextCursor":null,"hasMore":false}}),
        )
        .await;
        let organization = support::organization(base);
        let view = organization.project("project").unwrap();
        let resource = if project {
            view.operations()
        } else {
            organization.operations()
        };
        let page = resource
            .list(
                &ListOperationsParameters {
                    kind: Some("session_lifecycle".into()),
                    limit: Some(1),
                    status: Some("running".into()),
                    ..ListOperationsParameters::default()
                },
                RequestOptions::default(),
            )
            .await
            .unwrap();
        support::assert_subset(&expected, &serde_json::to_value(&page.items[0]).unwrap());
        server.await.unwrap();
        let (base, server) = support::wire(
            "GET",
            &format!("{prefix}/operations/operation%2Fone?afterSequence=0&wait=30"),
            None,
            json!({"data":expected}),
        )
        .await;
        let organization = support::organization(base);
        let view = organization.project("project").unwrap();
        let resource = if project {
            view.operations()
        } else {
            organization.operations()
        };
        let response = resource
            .get(
                "operation/one",
                &RetrieveOperationParameters {
                    wait: Some(30),
                    after_sequence: Some(0),
                    project_id: None,
                },
                RequestOptions::default(),
            )
            .await
            .unwrap();
        support::assert_subset(&expected, &serde_json::to_value(response.data).unwrap());
        server.await.unwrap();
        let transition = json!({"operationId":"operation","sequence":1,"fromStatus":"pending","toStatus":"running","reasonCode":"admitted","occurredAt":"2026-10-11T12:00:00Z","snapshot":{"progress":{"code":"starting","current":1,"total":2},"error":null,"actionRequired":null}});
        let (base, server) = support::wire(
            "GET",
            &format!("{prefix}/operations/operation/transitions?afterSequence=0&limit=1"),
            None,
            json!({"data":[transition],"page":{"nextCursor":null,"hasMore":false}}),
        )
        .await;
        let organization = support::organization(base);
        let view = organization.project("project").unwrap();
        let resource = if project {
            view.operations()
        } else {
            organization.operations()
        };
        let page = resource
            .list_transitions(
                "operation",
                &ListOperationTransitionsParameters {
                    position: Some(OperationTransitionPosition::AfterSequence {
                        after_sequence: 0,
                    }),
                    limit: Some(1),
                },
                RequestOptions::default(),
            )
            .await
            .unwrap();
        support::assert_subset(&transition, &serde_json::to_value(&page.items[0]).unwrap());
        server.await.unwrap();
        let receipt = json!({"operation":expected,"operationId":"operation","idempotency":{"id":"receipt","key":"once","replayed":false,"createdAt":"2026-10-11T12:00:00Z","expiresAt":"2026-10-12T12:00:00Z"}});
        let (base, server) = support::wire(
            "POST",
            &format!("{prefix}/operations/operation/cancel"),
            None,
            json!({"data":receipt}),
        )
        .await;
        let organization = support::organization(base);
        let view = organization.project("project").unwrap();
        let resource = if project {
            view.operations()
        } else {
            organization.operations()
        };
        let response = resource
            .cancel("operation", RequestOptions::default())
            .await
            .unwrap();
        support::assert_subset(&receipt, &serde_json::to_value(response.data).unwrap());
        server.await.unwrap();
    }
}

#[tokio::test]
async fn operation_wait_long_polls_until_terminal_and_zero_budget_still_reads() {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let base = format!("http://{}", listener.local_addr().unwrap());
    let server = tokio::spawn(async move {
        for sequence in 1..=2 {
            let (mut socket, _) = listener.accept().await.unwrap();
            let mut request = Vec::new();
            let mut bytes = [0u8; 1024];
            while !request.windows(4).any(|window| window == b"\r\n\r\n") {
                let count = socket.read(&mut bytes).await.unwrap();
                assert_ne!(count, 0);
                request.extend_from_slice(&bytes[..count]);
            }
            assert_eq!(
                String::from_utf8_lossy(&request).lines().next().unwrap(),
                "GET /platform/projects/project/operations/operation?wait=2 HTTP/1.1"
            );
            let body=json!({"data":operation(true,if sequence==1 { "running" } else { "succeeded" },sequence)}).to_string();
            socket.write_all(format!("HTTP/1.1 200 OK\r\ncontent-type: application/json\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{body}",body.len()).as_bytes()).await.unwrap();
        }
    });
    let organization = support::organization(base);
    let view = organization.project("project").unwrap();
    let result = view
        .operations()
        .wait(
            "operation",
            WaitForOperationOptions {
                max_wait: Some(Duration::from_millis(2500)),
                ..WaitForOperationOptions::default()
            },
        )
        .await
        .unwrap();
    assert_eq!(result.data.status, "succeeded");
    assert_eq!(result.data.sequence, 2);
    server.await.unwrap();
    let (base, server) = support::wire(
        "GET",
        "/platform/operations/operation?wait=0",
        None,
        json!({"data":operation(false,"running",1)}),
    )
    .await;
    let result = support::organization(base)
        .operations()
        .wait(
            "operation",
            WaitForOperationOptions {
                max_wait: Some(Duration::ZERO),
                ..WaitForOperationOptions::default()
            },
        )
        .await
        .unwrap();
    assert_eq!(result.data.status, "running");
    server.await.unwrap();
}

#[tokio::test]
async fn operation_wait_and_owner_filters_fail_closed_before_network() {
    let organization = support::organization("http://localhost:1".into());
    let project = organization.project("project").unwrap();
    assert!(project
        .operations()
        .get(
            "operation",
            &RetrieveOperationParameters {
                project_id: Some("other".into()),
                ..RetrieveOperationParameters::default()
            },
            RequestOptions::default()
        )
        .await
        .is_err());
    assert!(organization
        .operations()
        .get(
            "operation",
            &RetrieveOperationParameters {
                wait: Some(31),
                ..RetrieveOperationParameters::default()
            },
            RequestOptions::default()
        )
        .await
        .is_err());
    let cancellation = tokio_util::sync::CancellationToken::new();
    cancellation.cancel();
    let error = project
        .operations()
        .wait(
            "operation",
            WaitForOperationOptions {
                request_options: RequestOptions {
                    cancellation: Some(cancellation),
                    ..RequestOptions::default()
                },
                ..WaitForOperationOptions::default()
            },
        )
        .await
        .unwrap_err();
    assert_eq!(error.kind, ErrorKind::Cancelled);
}
