#[allow(dead_code)]
mod support;
use polymorfa_sdk::{call_records::*, ErrorKind, RequestOptions};
use serde_json::{json, Value};
fn record() -> Value {
    json!({"callId":"call","projectId":"project","sessionId":"support","direction":"inbound","upstream":"linked_device","outcome":"answered","state":"ended","hasVideo":false,"peerRef":"pseudonym","startedAt":"then","connectedAt":"then","endedAt":"now","durationSeconds":10.5,"endReason":"user_hangup"})
}
fn metrics() -> Value {
    json!({"calls":2,"answered":1,"missed":1,"declined":0,"failed":0,"inProgress":0,"answerRate":0.5,"totalDurationSeconds":10.5,"averageDurationSeconds":10.5})
}
#[tokio::test]
async fn call_detail_roster_app_reports_statistics_and_record_cursor_native_wire() {
    wire_unwrapped_organization!(
        client,
        "GET",
        "/platform/calls/call?projectId=project",
        None,
        json!({"data":{"call":{"callId":"call","sessionId":"support","projectId":"project","direction":"inbound","state":"ended","live":false,"backend":"linked_device","hasVideo":false,"peerRef":"pseudonym","startedAt":"then","connectedAt":"then","endedAt":"now","durationSeconds":10.5,"endReason":{"code":"new_reason","label":"Other"},"answeredBy":"client:agent","exclusive":true},"participants":[{"id":"participant","state":"left","firstSeenAt":"then","updatedAt":"now","leftReason":"ended"}],"connections":[{"id":"connection","participant":"client:agent","transport":"socket","joinedAt":"then","leftAt":"now","reason":"call_ended"}],"telemetry":{"status":"reported","source":"media_server","setupMs":20.5,"ringMs":1000.0,"codec":"opus","jitterMs":1.5,"packetsLost":1,"rttMs":5.5,"receivedKbps":64.0,"sentKbps":64.0},"appReports":{"status":"reported","connections":[{"connectionId":"connection","participant":"client:agent","client":{"sdk":"rust","version":"1","platform":"server"},"quality":{"reportedAt":"now","rttMs":5.5,"jitterMs":1.5,"packetsLost":1,"packetsReceived":200,"audioCodec":"opus","videoCodec":null,"candidateType":"relay","reconnects":1},"errors":[{"code":"media_connection_failed","reportedAt":"then"}]}],"truncated":false},"history":{"events":[{"eventId":"event","type":"call.ended","occurredAt":"now"}],"truncated":false},"correlation":{"callId":"call","sessionId":"support"}}}),
        client.calls().retrieve(
            "call",
            &CallFilters {
                project_id: Some("project".into()),
                ..Default::default()
            },
            RequestOptions::default()
        )
    );
    let mut group = metrics();
    group["key"] = json!("support");
    group["start"] = Value::Null;
    wire_unwrapped_organization!(
        client,
        "GET",
        "/platform/calls/stats?groupBy=session&timezone=UTC",
        None,
        json!({"data":{"since":"then","until":"now","timezone":"UTC","groupBy":"session","totals":metrics(),"groups":[group],"groupsTruncated":false,"heatmap":[{"dayOfWeek":1,"hour":0,"calls":2,"answered":1}]}}),
        client.calls().stats(
            &CallStatsParameters {
                filters: Default::default(),
                group_by: Some(StatsGroupBy::Session),
                timezone: Some("UTC".into())
            },
            RequestOptions::default()
        )
    );
    let expected = json!({"data":[record()],"page":{"nextCursor":"next","hasMore":true}});
    let (base, server) = support::wire(
        "GET",
        "/platform/calls?cursor=before&direction=inbound&limit=5&projectId=project",
        None,
        expected.clone(),
    )
    .await;
    let client = support::organization(base).project("project").unwrap();
    let page = client
        .calls()
        .list(
            &ListCallRecordsParameters {
                filters: CallFilters {
                    direction: Some(CallDirection::Inbound),
                    ..Default::default()
                },
                cursor: Some("before".into()),
                limit: Some(5),
            },
            RequestOptions::default(),
        )
        .await
        .unwrap();
    assert_eq!(page.next_cursor.as_deref(), Some("next"));
    support::assert_subset(
        &expected["data"],
        &serde_json::to_value(page.items).unwrap(),
    );
    server.await.unwrap();
    let client = support::organization("http://127.0.0.1:1".into())
        .project("project")
        .unwrap();
    assert!(client
        .calls()
        .stats(
            &CallStatsParameters {
                filters: CallFilters {
                    project_id: Some("other".into()),
                    ..Default::default()
                },
                ..Default::default()
            },
            RequestOptions::default()
        )
        .await
        .is_err());
    assert!(client
        .calls()
        .retrieve(
            "call with spaces",
            &Default::default(),
            RequestOptions::default()
        )
        .await
        .is_err());
    assert!(client
        .calls()
        .list(
            &ListCallRecordsParameters {
                filters: CallFilters {
                    since: Some("2026-02-30T00:00:00Z".into()),
                    ..Default::default()
                },
                ..Default::default()
            },
            RequestOptions::default()
        )
        .await
        .is_err());
}
async fn text_server(
    pages: Vec<(
        &'static str,
        &'static str,
        &'static str,
        Option<&'static str>,
    )>,
) -> (String, tokio::task::JoinHandle<()>) {
    use tokio::{
        io::{AsyncReadExt, AsyncWriteExt},
        net::TcpListener,
    };
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    let task = tokio::spawn(async move {
        for (path, mime, body, next) in pages {
            let (mut socket, _) = listener.accept().await.unwrap();
            let mut bytes = vec![0; 8192];
            let n = socket.read(&mut bytes).await.unwrap();
            let head = String::from_utf8_lossy(&bytes[..n]);
            assert_eq!(
                head.lines().next(),
                Some(format!("GET {path} HTTP/1.1").as_str())
            );
            assert!(head.contains("Bearer pmfa_"));
            let cursor = next
                .map(|s| format!("polymorfa-next-cursor: {s}\r\n"))
                .unwrap_or_default();
            socket.write_all(format!("HTTP/1.1 200 OK\r\nContent-Type: {mime}\r\nContent-Length: {}\r\nX-Request-ID: export\r\n{cursor}Connection: close\r\n\r\n{body}",body.len()).as_bytes()).await.unwrap();
        }
    });
    (format!("http://{addr}"), task)
}
#[tokio::test]
async fn call_export_text_content_type_and_cursor_stream_native_wire() {
    use futures_util::StreamExt;
    let (base, server) = text_server(vec![(
        "/platform/calls/export?format=ndjson&limit=5",
        "application/x-ndjson",
        "{\"callId\":\"call\"}\n",
        Some("next"),
    )])
    .await;
    let client = support::organization(base);
    let v = client
        .calls()
        .export(
            &ExportCallRecordsParameters {
                format: Some(CallExportFormat::Ndjson),
                limit: Some(5),
                ..Default::default()
            },
            RequestOptions::default(),
        )
        .await
        .unwrap();
    assert_eq!(v.data.body, "{\"callId\":\"call\"}\n");
    assert_eq!(v.data.next_cursor.as_deref(), Some("next"));
    assert_eq!(v.metadata.request_id.as_deref(), Some("export"));
    server.await.unwrap();
    let (base, server) = text_server(vec![
        (
            "/platform/calls/export?format=csv",
            "text/csv",
            "callId\r\nfirst\r\n",
            Some("next"),
        ),
        (
            "/platform/calls/export?cursor=next&format=csv",
            "text/csv",
            "callId\r\nsecond\r\n",
            None,
        ),
    ])
    .await;
    let client = support::organization(base);
    let resource = client.calls();
    let stream = resource.export_all(Default::default(), Default::default());
    futures_util::pin_mut!(stream);
    assert_eq!(stream.next().await.unwrap().unwrap(), "callId\r\nfirst\r\n");
    assert_eq!(stream.next().await.unwrap().unwrap(), "second\r\n");
    assert!(stream.next().await.is_none());
    server.await.unwrap();
    let (base, server) = text_server(vec![(
        "/platform/calls/export?format=csv",
        "text/html",
        "<html>proxy</html>",
        None,
    )])
    .await;
    let client = support::organization(base);
    let error = client
        .calls()
        .export(&Default::default(), Default::default())
        .await
        .unwrap_err();
    assert_eq!(error.kind, ErrorKind::Server);
    assert_eq!(error.request_id.as_deref(), Some("export"));
    server.await.unwrap();
    let (base, server) = text_server(vec![(
        "/platform/calls/export?cursor=repeat&format=csv",
        "text/csv",
        "header\r\nrepeat\r\n",
        Some("repeat"),
    )])
    .await;
    let client = support::organization(base);
    let resource = client.calls();
    let stream = resource.export_all(
        ExportCallRecordsParameters {
            cursor: Some("repeat".into()),
            ..Default::default()
        },
        Default::default(),
    );
    futures_util::pin_mut!(stream);
    assert_eq!(
        stream.next().await.unwrap().unwrap_err().code.as_deref(),
        Some("invalid_response")
    );
    server.await.unwrap();
}
