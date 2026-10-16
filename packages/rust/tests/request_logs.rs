#[allow(dead_code)]
mod support;
use polymorfa_sdk::{request_logs::*, ErrorKind};
use serde_json::json;
fn log(id: &str) -> serde_json::Value {
    json!({"id":id,"projectId":"project","createdAt":"2026-10-11T00:00:00Z","method":"POST","route":"/messaging/:session/messages","status":503,"durationMs":10.125,"result":"failure","source":"api","requestId":"req","traceId":"trace","errorCode":"upstream","mcpTool":null,"credential":{"type":"project_token","id":"token-id","last4":"abcd"}})
}
fn page() -> serde_json::Value {
    json!({"data":[log("log")],"page":{"nextCursor":null,"hasMore":false,"followCursor":"follow"}})
}
#[tokio::test]
async fn list_follow_decode_full_typed_payload_and_encode_filters() {
    let (base,server)=support::wire("GET","/platform/projects/project/request-logs?status=404%2C5xx&method=GET%2CPOST&source=api&route=%2Fmessaging%2F%3Asession%2Fmessages&credentialId=key&requestId=req&traceId=trace&since=2026-10-11T00%3A00%3A00Z&until=2026-10-12T00%3A00%3A00Z&limit=5",None,page()).await;
    let client = support::organization(base);
    let result = client
        .request_logs()
        .list(
            &ListRequestLogs {
                project_id: Some("project".into()),
                limit: Some(5),
                filters: RequestLogFilters {
                    status: vec!["404".into(), "5xx".into()],
                    method: vec![RequestLogMethod::GET, RequestLogMethod::POST],
                    source: Some(RequestLogSource::Api),
                    route: Some("/messaging/:session/messages".into()),
                    credential_id: Some("key".into()),
                    request_id: Some("req".into()),
                    trace_id: Some("trace".into()),
                    since: Some("2026-10-11T00:00:00Z".into()),
                    until: Some("2026-10-12T00:00:00Z".into()),
                },
                ..Default::default()
            },
            Default::default(),
        )
        .await
        .unwrap();
    assert_eq!(result.items[0].duration_ms, Some(10.125));
    assert_eq!(
        result.items[0]
            .credential
            .as_ref()
            .unwrap()
            .last4
            .as_deref(),
        Some("abcd")
    );
    assert_eq!(result.metadata.request_id.as_deref(), Some("wire_fixture"));
    server.await.unwrap();
    let (base, server) = support::wire(
        "GET",
        "/platform/projects/project/request-logs?after=after%2Fcursor&limit=10",
        None,
        page(),
    )
    .await;
    let client = support::organization(base).project("project").unwrap();
    let result = client
        .request_logs()
        .follow(
            &FollowRequestLogs {
                project_id: None,
                after: "after/cursor".into(),
                limit: Some(10),
            },
            Default::default(),
        )
        .await
        .unwrap();
    assert_eq!(result.follow_cursor, "follow");
    server.await.unwrap();
}
#[tokio::test]
async fn cursor_filters_and_foreign_project_fail_before_http_and_bad_page_keeps_metadata() {
    let client = support::organization("http://127.0.0.1:1".into())
        .project("project")
        .unwrap();
    let logs = client.request_logs();
    for p in [
        ListRequestLogs {
            project_id: Some("other".into()),
            ..Default::default()
        },
        ListRequestLogs {
            cursor: Some("cursor".into()),
            filters: RequestLogFilters {
                status: vec!["5xx".into()],
                ..Default::default()
            },
            ..Default::default()
        },
    ] {
        assert_eq!(
            logs.list(&p, Default::default()).await.unwrap_err().kind,
            ErrorKind::Validation
        );
    }
    let (base, server) = support::wire(
        "GET",
        "/platform/projects/project/request-logs",
        None,
        json!({"data":[],"page":{"hasMore":false,"followCursor":"next"}}),
    )
    .await;
    let error = support::organization(base)
        .project("project")
        .unwrap()
        .request_logs()
        .list(&Default::default(), Default::default())
        .await
        .unwrap_err();
    assert_eq!(error.code.as_deref(), Some("invalid_response"));
    assert_eq!(error.request_id.as_deref(), Some("wire_fixture"));
    server.await.unwrap();
}
#[tokio::test]
async fn tail_yields_backfill_oldest_first_and_stops_on_cancellation() {
    use futures_util::{pin_mut, StreamExt};
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let base = format!("http://{}", listener.local_addr().unwrap());
    let server = tokio::spawn(async move {
        for (path, body) in [
            (
                "/platform/projects/project/request-logs?limit=2",
                json!({"data":[log("newer"),log("older")],"page":{"nextCursor":null,"hasMore":false,"followCursor":"first"}}),
            ),
            (
                "/platform/projects/project/request-logs?after=first&limit=100",
                json!({"data":[log("live")],"page":{"nextCursor":null,"hasMore":true,"followCursor":"next"}}),
            ),
        ] {
            let (mut socket, _) = listener.accept().await.unwrap();
            let mut bytes = [0; 4096];
            let n = socket.read(&mut bytes).await.unwrap();
            assert!(String::from_utf8_lossy(&bytes[..n]).starts_with(&format!("GET {path} ")));
            let body = body.to_string();
            socket
                .write_all(
                    format!(
                        "HTTP/1.1 200 OK\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{body}",
                        body.len()
                    )
                    .as_bytes(),
                )
                .await
                .unwrap();
        }
    });
    let client = support::organization(base).project("project").unwrap();
    let cancel = tokio_util::sync::CancellationToken::new();
    let stream = client.request_logs().tail(
        TailRequestLogs {
            backfill: 2,
            ..Default::default()
        },
        polymorfa_sdk::RequestOptions {
            cancellation: Some(cancel.clone()),
            ..Default::default()
        },
    );
    pin_mut!(stream);
    for id in ["older", "newer", "live"] {
        assert_eq!(stream.next().await.unwrap().unwrap().id, id);
    }
    cancel.cancel();
    assert!(stream.next().await.is_none());
    server.await.unwrap();
}
#[test]
fn retry_after_budget_keeps_zero_dates_default_and_cap() {
    use std::time::{Duration, SystemTime};
    let now = SystemTime::UNIX_EPOCH + Duration::from_secs(1000);
    assert_eq!(request_log_retry_after(Some("0"), now), Duration::ZERO);
    assert_eq!(
        request_log_retry_after(Some("999999"), now),
        Duration::from_secs(300)
    );
    assert_eq!(
        request_log_retry_after(
            Some(&httpdate::fmt_http_date(now + Duration::from_secs(12))),
            now
        ),
        Duration::from_secs(12)
    );
    assert_eq!(request_log_retry_after(None, now), Duration::from_secs(60));
}
