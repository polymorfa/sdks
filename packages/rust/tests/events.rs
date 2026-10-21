#[allow(dead_code)]
mod support;
use futures_util::StreamExt;
use polymorfa_sdk::{
    models::*,
    stream::{EventStreamOptions, SseParser},
    ErrorKind, RequestOptions,
};
use serde_json::json;
use std::{
    sync::{
        atomic::{AtomicUsize, Ordering},
        Arc,
    },
    time::Duration,
};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::TcpListener,
};
use tokio_util::sync::CancellationToken;

fn event(id: &str, project: Option<&str>) -> serde_json::Value {
    json!({"id":id,"organizationId":"org","projectId":project,"type":"message.received","source":"runtime","environment":"development","createdAt":"2026-10-11T12:00:00Z","payloadAvailability":"not_retained","payload":null,"replayableUntil":null,"metadataExpiresAt":"2026-11-11T12:00:00Z"})
}
async fn headers(socket: &mut tokio::net::TcpStream) -> String {
    let mut head = Vec::new();
    loop {
        let mut byte = [0u8; 1];
        socket.read_exact(&mut byte).await.unwrap();
        head.push(byte[0]);
        if head.ends_with(b"\r\n\r\n") {
            break;
        }
    }
    String::from_utf8(head).unwrap()
}
async fn reply(socket: &mut tokio::net::TcpStream, value: serde_json::Value) {
    let body = value.to_string();
    socket.write_all(format!("HTTP/1.1 200 OK\r\ncontent-type: application/json\r\nx-request-id: event_wire\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{body}",body.len()).as_bytes()).await.unwrap();
}

#[tokio::test]
async fn organization_and_project_event_retrieve_replay_ack_native_wire() {
    for (path, project) in [
        ("/platform", None),
        ("/platform/projects/project", Some("project")),
    ] {
        let expected = event("event/one", project);
        let (base, server) = support::wire(
            "GET",
            &format!("{path}/events/event%2Fone?includePayload=true"),
            None,
            json!({"data":expected}),
        )
        .await;
        let organization = support::organization(base);
        let view = organization.project("project").unwrap();
        let resource = if project.is_some() {
            view.events()
        } else {
            organization.events()
        };
        let response = resource
            .retrieve_with_payload("event/one", true, RequestOptions::default())
            .await
            .unwrap();
        support::assert_subset(&expected, &serde_json::to_value(response.data).unwrap());
        server.await.unwrap();
        let (base, server) = support::wire(
            "GET",
            &format!("{path}/events?limit=1"),
            None,
            json!({"data":[expected],"page":{"nextCursor":null,"hasMore":false}}),
        )
        .await;
        let organization = support::organization(base);
        let view = organization.project("project").unwrap();
        let resource = if project.is_some() {
            view.events()
        } else {
            organization.events()
        };
        let page = resource
            .list(
                &EventListParameters {
                    limit: Some(1),
                    ..EventListParameters::default()
                },
                RequestOptions::default(),
            )
            .await
            .unwrap();
        support::assert_subset(&expected, &serde_json::to_value(&page.items[0]).unwrap());
        assert!(!page.has_more());
        server.await.unwrap();
        let receipt = json!({"eventId":"event/one","deliveryId":"delivery","operationId":"operation","idempotency":{"id":"receipt","key":"replay-once","replayed":false,"createdAt":"2026-10-11T12:00:00Z","expiresAt":"2026-10-12T12:00:00Z"}});
        let (base, server) = support::wire(
            "POST",
            &format!("{path}/events/event%2Fone/replays"),
            Some(json!({"webhookId":"hook"})),
            json!({"data":receipt}),
        )
        .await;
        let organization = support::organization(base);
        let view = organization.project("project").unwrap();
        let resource = if project.is_some() {
            view.events()
        } else {
            organization.events()
        };
        let response = resource
            .replay(
                "event/one",
                &ReplayEventRequest {
                    webhook_id: "hook".into(),
                },
                RequestOptions {
                    idempotency_key: Some("replay-once".into()),
                    ..RequestOptions::default()
                },
            )
            .await
            .unwrap();
        support::assert_subset(&receipt, &serde_json::to_value(response.data).unwrap());
        server.await.unwrap();
    }
    let receipt = json!({"streamId":"stream/one","acknowledgedCursor":"cursor","sequence":2,"replayed":false});
    let (base, server) = support::wire(
        "POST",
        "/platform/projects/project/events/stream/stream%2Fone/ack",
        Some(json!({"cursor":"cursor","sequence":2})),
        json!({"data":receipt}),
    )
    .await;
    let response = support::organization(base)
        .project("project")
        .unwrap()
        .events()
        .acknowledge_stream(
            "stream/one",
            &EventStreamAcknowledgement {
                cursor: "cursor".into(),
                sequence: 2,
            },
            RequestOptions::default(),
        )
        .await
        .unwrap();
    support::assert_subset(&receipt, &serde_json::to_value(response.data).unwrap());
    server.await.unwrap();
}

#[tokio::test]
async fn event_cursor_and_indexed_pagination_follow_native_http_requests() {
    for indexed in [false, true] {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let base = format!("http://{}", listener.local_addr().unwrap());
        let server = tokio::spawn(async move {
            for page in 0..2 {
                let (mut socket, _) = listener.accept().await.unwrap();
                let head = headers(&mut socket).await;
                let query = if indexed {
                    format!("afterOffset={}", if page == 0 { "0" } else { "2" })
                } else if page == 0 {
                    "limit=1".into()
                } else {
                    "cursor=cursor%2Ftwo&limit=1".into()
                };
                assert_eq!(
                    head.lines().next().unwrap(),
                    format!("GET /platform/projects/project/events?{query} HTTP/1.1")
                );
                let metadata = if indexed {
                    json!({"nextCursor":null,"hasMore":page==0,"nextOffset":if page==0 { Some("2") } else { None },"highWatermark":"3"})
                } else {
                    json!({"nextCursor":if page==0 { Some("cursor/two") } else { None },"hasMore":page==0})
                };
                reply(&mut socket,json!({"data":[event(if page==0 { "one" } else { "two" },Some("project"))],"page":metadata})).await;
            }
        });
        let organization = support::organization(base);
        let project = organization.project("project").unwrap();
        let parameters = if indexed {
            EventListParameters {
                after_offset: Some("0".into()),
                ..EventListParameters::default()
            }
        } else {
            EventListParameters {
                limit: Some(1),
                ..EventListParameters::default()
            }
        };
        let first = project
            .events()
            .list(&parameters, RequestOptions::default())
            .await
            .unwrap();
        assert!(first.has_more());
        if indexed {
            assert_eq!(first.high_watermark.as_deref(), Some("3"));
            assert_eq!(first.next_offset.as_deref(), Some("2"));
        }
        let mut stream = Box::pin(first.into_stream());
        assert_eq!(stream.next().await.unwrap().unwrap().id, "one");
        assert_eq!(stream.next().await.unwrap().unwrap().id, "two");
        assert!(stream.next().await.is_none());
        server.await.unwrap();
    }
    let client = support::organization("http://localhost:1".into());
    let invalid = EventListParameters {
        after_offset: Some("0".into()),
        cursor: Some("cursor".into()),
        ..EventListParameters::default()
    };
    assert!(client
        .events()
        .list(&invalid, RequestOptions::default())
        .await
        .is_err());
}

#[tokio::test]
async fn native_sse_resumes_checkpoint_retention_gap_and_terminal_revocation() {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let base = format!("http://{}", listener.local_addr().unwrap());
    let server = tokio::spawn(async move {
        for connection in 0..2 {
            let (mut socket, _) = listener.accept().await.unwrap();
            let head = headers(&mut socket).await;
            assert_eq!(
                head.lines().next().unwrap(),
                "GET /platform/projects/project/events/stream?types=message.*&ack=manual HTTP/1.1"
            );
            assert!(head.to_lowercase().contains("accept: text/event-stream"));
            assert!(head.to_lowercase().contains(if connection == 0 {
                "last-event-id: start"
            } else {
                "last-event-id: checkpoint"
            }));
            let record = event(if connection == 0 { "one" } else { "two" }, Some("project"));
            let frame = json!({"type":"event","streamId":"stream","sequence":connection+1,"cursor":if connection==0 { "cursor1" } else { "cursor2" },"event":record});
            let final_frames = if connection == 0 {
                format!(
                    "data: {}\r\n\r\ndata: {}\n\ndata: {}\n\n",
                    json!({"type":"checkpoint","cursor":"checkpoint"}),
                    json!({"type":"gap","reason":"retention_exceeded","missedEvents":2,"requestedCursor":"start"}),
                    json!({"type":"expiry"})
                )
            } else {
                format!("data: {}\n\n", json!({"type":"revoked"}))
            };
            let body = format!(
                ":heartbeat\r\ndata: {}\r\n\r\ndata: {frame}\n\n{final_frames}",
                json!({"type":"ready","heartbeatIntervalMs":500})
            );
            socket.write_all(format!("HTTP/1.1 200 OK\r\ncontent-type: text/event-stream\r\ncontent-length: {}\r\nconnection: close\r\n\r\n",body.len()).as_bytes()).await.unwrap();
            for chunk in body.as_bytes().chunks(7) {
                socket.write_all(chunk).await.unwrap();
            }
        }
    });
    let gaps = Arc::new(AtomicUsize::new(0));
    let observed = gaps.clone();
    let client = support::organization(base);
    let project = client.project("project").unwrap();
    let stream = project
        .events()
        .stream(EventStreamOptions {
            since: Some("start".into()),
            types: vec!["message.*".into()],
            manual_acknowledgements: true,
            initial_delay: Some(Duration::from_millis(1)),
            max_delay: Some(Duration::from_millis(2)),
            on_gap: Some(Arc::new(move |gap| {
                assert_eq!(gap.missed_events, 2);
                observed.fetch_add(1, Ordering::SeqCst);
            })),
            ..EventStreamOptions::default()
        })
        .unwrap();
    let mut events = stream.into_stream();
    assert_eq!(events.next().await.unwrap().unwrap().event.id, "one");
    let second = events.next().await.unwrap().unwrap();
    assert_eq!(second.event.id, "two");
    assert_eq!(second.stream_id, "stream");
    assert_eq!(second.sequence, 2);
    assert_eq!(second.cursor, "cursor2");
    assert_eq!(gaps.load(Ordering::SeqCst), 1);
    assert_eq!(
        events.next().await.unwrap().unwrap_err().kind,
        ErrorKind::Authorization
    );
    server.await.unwrap();
}

#[test]
fn sse_parser_handles_split_utf8_crlf_comments_multiline_and_null_id() {
    let bytes =
        ": comment\r\nevent: custom\r\nid: bad\0id\r\ndata: Hello 🦀\r\ndata: world\r\n\r\n"
            .as_bytes();
    let mut parser = SseParser::default();
    let mut frames = Vec::new();
    for byte in bytes {
        frames.extend(parser.feed(&[*byte]).unwrap());
    }
    assert_eq!(frames.len(), 1);
    assert_eq!(frames[0].event, "custom");
    assert_eq!(frames[0].data, "Hello 🦀\nworld");
    assert!(frames[0].id.is_none());
}

#[tokio::test]
async fn cancelled_stream_ends_cleanly() {
    let cancellation = CancellationToken::new();
    cancellation.cancel();
    let client = support::organization("http://localhost:1".into());
    let project = client.project("project").unwrap();
    let mut stream = project
        .events()
        .stream(EventStreamOptions {
            request_options: RequestOptions {
                cancellation: Some(cancellation),
                ..RequestOptions::default()
            },
            ..EventStreamOptions::default()
        })
        .unwrap()
        .into_stream();
    assert!(stream.next().await.is_none());
}

#[tokio::test]
async fn live_source_pushes_retained_bodies_with_cursor_and_isolates_unsubscribe() {
    use base64::{engine::general_purpose::STANDARD, Engine};
    use polymorfa_sdk::stream::EventSubscriptionOptions;
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let base = format!("http://{}", listener.local_addr().unwrap());
    let server = tokio::spawn(async move {
        for index in 0..2 {
            let (mut socket, _) = listener.accept().await.unwrap();
            let head = headers(&mut socket).await;
            assert!(head.to_lowercase().contains(if index == 0 {
                "last-event-id: seed"
            } else {
                "last-event-id: second"
            }));
            let envelope = json!({"id":"webhook","session":"support","timestamp":"now","event":"future.event","payload":{"preserved":true}});
            let mut retained = event("retained", Some("project"));
            retained["payloadAvailability"] = json!("retained");
            retained["payload"] = json!({"contentType":"application/json","encoding":"base64","data":STANDARD.encode(envelope.to_string())});
            let mut body = format!(
                "data: {}\r\rdata: {}\r\n\r\n",
                json!({"type":"event","streamId":"stream","sequence":1,"cursor":"skip","event":event("not-retained",Some("project"))}),
                json!({"type":"event","streamId":"stream","sequence":2,"cursor":"delivered","event":retained})
            );
            if index == 0 {
                body.push_str(&format!("data: {}\n\n", json!({"type":"revoked"})));
            }
            socket.write_all(format!("HTTP/1.1 200 OK\r\ncontent-type: text/event-stream\r\ncontent-length: {}\r\nconnection: close\r\n\r\n", if index == 0 { body.len() } else { body.len()+4096 }).as_bytes()).await.unwrap();
            for chunk in body.as_bytes().chunks(3) {
                socket.write_all(chunk).await.unwrap();
            }
            if index == 1 {
                let mut byte = [0];
                assert_eq!(
                    tokio::time::timeout(Duration::from_secs(2), socket.read(&mut byte))
                        .await
                        .unwrap()
                        .unwrap(),
                    0
                );
            }
        }
    });
    let parent_cancel = CancellationToken::new();
    let source = support::organization(base)
        .project("project")
        .unwrap()
        .events()
        .live_source(EventStreamOptions {
            request_options: RequestOptions {
                cancellation: Some(parent_cancel.clone()),
                ..Default::default()
            },
            ..Default::default()
        })
        .unwrap();
    let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel();
    let (errors, mut errors_rx) = tokio::sync::mpsc::unbounded_channel();
    let subscription = source
        .subscribe(
            Arc::new(move |event, cursor| {
                let _ = tx.send((event, cursor));
            }),
            EventSubscriptionOptions {
                cursor: Some("seed".into()),
                on_error: Some(Arc::new(move |error| {
                    let _ = errors.send(error);
                })),
            },
        )
        .unwrap();
    let (webhook, cursor) = tokio::time::timeout(Duration::from_secs(2), rx.recv())
        .await
        .unwrap()
        .unwrap();
    assert_eq!(webhook.id, "webhook");
    assert_eq!(webhook.payload["preserved"], true);
    assert_eq!(cursor, "delivered");
    assert_eq!(
        tokio::time::timeout(Duration::from_secs(2), errors_rx.recv())
            .await
            .unwrap()
            .unwrap()
            .code
            .as_deref(),
        Some("stream_revoked")
    );
    subscription.close().await;
    assert!(rx.try_recv().is_err());
    assert!(!parent_cancel.is_cancelled());
    let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel();
    let next = source
        .subscribe(
            Arc::new(move |event, cursor| {
                let _ = tx.send((event, cursor));
            }),
            EventSubscriptionOptions {
                cursor: Some("second".into()),
                ..Default::default()
            },
        )
        .unwrap();
    assert!(tokio::time::timeout(Duration::from_secs(2), rx.recv())
        .await
        .unwrap()
        .is_some());
    next.close().await;
    assert!(!parent_cancel.is_cancelled());
    server.await.unwrap();
}

#[test]
fn project_sse_frames_bound_utf8_incomplete_lines_multiline_and_comments() {
    const LIMIT: usize = 4 * 1024 * 1024;
    for segment in ["x", "🦀", "data: \n", ": beat\n"] {
        let wire = segment.repeat(LIMIT / segment.len() + 1);
        let mut parser = SseParser::default();
        let mut failure = None;
        for chunk in wire.as_bytes().chunks(4093) {
            match parser.feed(chunk) {
                Ok(_) => {}
                Err(error) => {
                    failure = Some(error);
                    break;
                }
            }
        }
        assert_eq!(failure.unwrap().code.as_deref(), Some("invalid_response"));
    }
    let tail = "\ndata: boundary\n\n";
    let padding = LIMIT - tail.len() - 1;
    let wire = format!(
        ":{}{}{tail}",
        "🦀".repeat(padding / 4),
        "x".repeat(padding % 4)
    );
    assert_eq!(wire.len(), LIMIT);
    let mut parser = SseParser::default();
    let mut frames = Vec::new();
    for chunk in format!("{wire}{wire}").as_bytes().chunks(4093) {
        frames.extend(parser.feed(chunk).unwrap());
    }
    assert_eq!(
        frames
            .iter()
            .map(|frame| frame.data.as_str())
            .collect::<Vec<_>>(),
        ["boundary", "boundary"]
    );
}
