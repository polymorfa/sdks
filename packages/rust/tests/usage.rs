#[allow(dead_code)]
mod support;
use futures_util::StreamExt;
use polymorfa_sdk::{usage::*, ErrorKind, RequestOptions};
use serde_json::json;
fn record() -> serde_json::Value {
    json!({"id":"usage","meter":"call.duration","quantity":6.5,"unit":"second","dimensions":{"direction":"outbound","participants":2.0,"video":false},"keySource":"none","sourceKind":"call","sourceId":"call","projectId":"project","session":"s","occurredAt":"2026-10-11T12:00:00Z","recordedAt":"2026-10-11T12:00:01Z","revision":2,"pricingState":"unpriced","rateCard":null,"pricedCredits":null})
}
#[tokio::test]
async fn metered_usage_records_and_gate_native_contracts_both_owner_scopes() {
    for project in [false, true] {
        let filter = if project {
            Some("wrong-project".into())
        } else {
            None
        };
        let params = UsageSummaryParams {
            project_id: filter.clone(),
            session: Some("s".into()),
            period: Some("2026-10".into()),
        };
        let path = if project {
            "/platform/usage?period=2026-10&projectId=project&session=s"
        } else {
            "/platform/usage?period=2026-10&session=s"
        };
        let total = json!({"meter":"call.duration","unit":"second","keySource":"none","quantity":6.5,"records":1});
        let summary = json!({"period":"2026-10","start":"2026-10-01T00:00:00Z","end":"2026-11-01T00:00:00Z","projectId":if project {Some("project")} else {None},"session":"s","billingEnabled":false,"meters":[total],"numbers":[{"session":"s","projectId":"project","meters":[total]}],"numbersTruncated":false});
        let (base, server) = support::wire("GET", path, None, json!({"data":summary})).await;
        let org = support::organization(base);
        let view = org.project("project").unwrap();
        let resource = if project { view.usage() } else { org.usage() };
        let response = resource
            .summary(&params, RequestOptions::default())
            .await
            .unwrap();
        support::assert_subset(&summary, &serde_json::to_value(response.data).unwrap());
        assert_eq!(
            response.metadata.request_id.as_deref(),
            Some("wire_fixture")
        );
        server.await.unwrap();
        let params = UsageRecordParams {
            summary: params,
            meter: Some(UsageMeter::CallDuration),
            call_id: Some("call".into()),
            limit: Some(1),
            cursor: Some("cursor".into()),
        };
        let path = if project {
            "/platform/usage/records?callId=call&cursor=cursor&limit=1&meter=call.duration&period=2026-10&projectId=project&session=s"
        } else {
            "/platform/usage/records?callId=call&cursor=cursor&limit=1&meter=call.duration&period=2026-10&session=s"
        };
        let (base, server) = support::wire(
            "GET",
            path,
            None,
            json!({"data":{"records":[record()],"nextCursor":"next"}}),
        )
        .await;
        let org = support::organization(base);
        let view = org.project("project").unwrap();
        let resource = if project { view.usage() } else { org.usage() };
        let response = resource
            .list_records(&params, RequestOptions::default())
            .await
            .unwrap();
        support::assert_subset(
            &record(),
            &serde_json::to_value(&response.data.records[0]).unwrap(),
        );
        assert_eq!(response.data.next_cursor.as_deref(), Some("next"));
        server.await.unwrap();
        let path = if project {
            "/platform/gates?projectId=project&session=s"
        } else {
            "/platform/gates?session=s"
        };
        let gates = json!({"session":"s","gates":[{"key":"calls.outbound_monthly","kind":"quota","subject":"number","mode":"record","active":true,"limit":100.0,"used":6.5,"unit":"second","overLimit":false,"decisions":{"wouldBlock":1,"blocked":0,"evaluationError":0}},{"key":"voice.flows","kind":"capability","subject":"team","mode":"off","active":false,"limit":-1.0,"used":null,"unit":"count","overLimit":null,"decisions":{"wouldBlock":0,"blocked":0,"evaluationError":0}}]});
        let (base, server) = support::wire("GET", path, None, json!({"data":gates})).await;
        let org = support::organization(base);
        let view = org.project("project").unwrap();
        let resource = if project { view.usage() } else { org.usage() };
        let response = resource
            .list_gates(
                &UsageGateParams {
                    project_id: filter,
                    session: Some("s".into()),
                },
                RequestOptions::default(),
            )
            .await
            .unwrap();
        support::assert_subset(&gates, &serde_json::to_value(response.data).unwrap());
        server.await.unwrap();
    }
}
#[tokio::test]
async fn usage_record_iterator_rejects_repeated_cursors_with_response_metadata() {
    use tokio::{
        io::{AsyncReadExt, AsyncWriteExt},
        net::TcpListener,
    };
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let base = format!("http://{}", listener.local_addr().unwrap());
    let server = tokio::spawn(async move {
        for path in [
            "/platform/usage/records",
            "/platform/usage/records?cursor=repeat",
        ] {
            let (mut socket, _) = listener.accept().await.unwrap();
            let mut bytes = Vec::new();
            let mut buffer = [0u8; 4096];
            loop {
                let n = socket.read(&mut buffer).await.unwrap();
                assert!(n > 0);
                bytes.extend_from_slice(&buffer[..n]);
                if bytes.windows(4).any(|w| w == b"\r\n\r\n") {
                    break;
                }
            }
            let head = String::from_utf8_lossy(&bytes);
            assert_eq!(head.lines().next().unwrap(), format!("GET {path} HTTP/1.1"));
            let body = json!({"data":{"records":[record()],"nextCursor":"repeat"}}).to_string();
            socket.write_all(format!("HTTP/1.1 200 OK\r\ncontent-type: application/json\r\nx-request-id: iterator\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{body}",body.len()).as_bytes()).await.unwrap();
        }
    });
    let org = support::organization(base);
    let resource = org.usage();
    let mut stream = resource.iterate_records(Default::default(), RequestOptions::default());
    assert_eq!(stream.next().await.unwrap().unwrap().id, "usage");
    let error = stream.next().await.unwrap().unwrap_err();
    assert_eq!(error.kind, ErrorKind::Server);
    assert_eq!(error.code.as_deref(), Some("invalid_response"));
    assert_eq!(error.request_id.as_deref(), Some("iterator"));
    assert!(stream.next().await.is_none());
    server.await.unwrap();
}
