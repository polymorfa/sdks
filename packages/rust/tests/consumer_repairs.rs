use futures_util::{SinkExt, StreamExt};
use polymorfa_sdk::{
    raw::{DecodedRawPage, RawRequest},
    signal::*,
    ClientOptions, Credential, ErrorKind, MessagingClient, OrganizationClient, RequestOptions,
};
use serde_json::{json, Value};
use std::{
    sync::{Arc, Mutex},
    time::Duration,
};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::{TcpListener, TcpStream},
};
use tokio_tungstenite::{
    accept_hdr_async,
    tungstenite::{
        handshake::server::{Request, Response},
        Message,
    },
};
use tokio_util::sync::CancellationToken;

const KEY: &str = "pmfa_AAECAwQFBgcICQoLDA0ODxAREhM73f-k";
const SECRET: &str = "application-fixture-secret";
async fn listener() -> (TcpListener, String) {
    let peer = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = format!("http://{}", peer.local_addr().unwrap());
    (peer, url)
}
async fn headers(socket: &mut TcpStream, secret: &str) -> String {
    let mut bytes = Vec::new();
    let mut one = [0];
    while !bytes.ends_with(b"\r\n\r\n") {
        socket.read_exact(&mut one).await.unwrap();
        bytes.push(one[0]);
        assert!(bytes.len() < 65536);
    }
    let text = String::from_utf8(bytes).unwrap();
    let lower = text.to_lowercase();
    assert!(text.lines().any(|line| line
        .split_once(':')
        .is_some_and(|(name, value)| name.eq_ignore_ascii_case("authorization")
            && value.trim() == format!("Bearer {secret}"))));
    assert!(!lower.contains("\r\ncookie:") && !lower.contains("\r\norigin:"));
    text
}
async fn reply(socket: &mut TcpStream, status: u16, kind: &str, body: &str) {
    socket.write_all(format!("HTTP/1.1 {status} Fixture\r\ncontent-type: {kind}\r\nx-request-id: repair\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{body}", body.len()).as_bytes()).await.unwrap();
}
fn options(base: String) -> ClientOptions {
    ClientOptions {
        base_url: base,
        max_network_retries: 0,
        ..Default::default()
    }
}
fn signal(base: String, timeout: Duration) -> SignalClient {
    let mut options = SignalClientOptions::new(base, SECRET);
    options.timeout = timeout;
    SignalClient::new(options).unwrap()
}
fn event(session: &str) -> Value {
    json!({"id":"e","type":"message","session_id":session,"chat":"c","sender":"p","message_id":"m","timestamp":1,"is_from_me":false,"redelivered":false,"identity_changed":false,"message_proto":"","text":"private"})
}
fn frame(session: &str) -> String {
    format!("id: e\nevent: message\ndata: {}\n\n", event(session))
}

#[tokio::test]
async fn api_base_prefix_and_escaped_query_are_retained() {
    for prefix in ["/nested/api", "/nested/api/", "/escaped%20prefix/v1/", ""] {
        let (peer, base) = listener().await;
        let expected = format!(
            "GET {}/raw?filter=a+%2F%2B HTTP/1.1",
            prefix.trim_end_matches('/')
        );
        let task = tokio::spawn(async move {
            let (mut socket, _) = peer.accept().await.unwrap();
            let seen = headers(&mut socket, KEY).await;
            reply(&mut socket, 200, "application/json", "{}").await;
            seen
        });
        let client = OrganizationClient::new(
            Credential::organization_api_key(KEY).unwrap(),
            options(format!("{base}{prefix}")),
        )
        .unwrap();
        let response = client
            .raw::<Value>(
                reqwest::Method::GET,
                "/raw",
                &[("filter".into(), "a /+".into())].into(),
                None,
                RequestOptions::default(),
            )
            .await
            .unwrap();
        assert_eq!(response.metadata.request_id.as_deref(), Some("repair"));
        assert!(task.await.unwrap().starts_with(&expected));
    }
}
// The native handshake callback uses tungstenite's fixed ErrorResponse ABI.
#[allow(clippy::result_large_err)]
#[tokio::test]
async fn calls_base_prefix_and_first_frame_authority_are_retained() {
    for prefix in ["/nested/api", "/nested/api/", "/escaped%20prefix/v1/", ""] {
        for media in [false, true] {
            for client_token in [false, true] {
                let (peer, base) = listener().await;
                let target = Arc::new(Mutex::new(String::new()));
                let seen = target.clone();
                let secret = if client_token {
                    "pmfa_ct_Zml4dHVyZQ"
                } else {
                    KEY
                };
                let task = tokio::spawn(async move {
                    let (socket, _) = peer.accept().await.unwrap();
                    let mut ws =
                        accept_hdr_async(socket, |request: &Request, mut response: Response| {
                            assert!(
                                !request.headers().contains_key("authorization")
                                    && !request.headers().contains_key("cookie")
                                    && !request.headers().contains_key("origin")
                            );
                            *seen.lock().unwrap() = request.uri().to_string();
                            if media {
                                assert_eq!(
                                    request.headers()["sec-websocket-protocol"],
                                    "pmfa.calls.v2"
                                );
                                response.headers_mut().insert(
                                    "sec-websocket-protocol",
                                    "pmfa.calls.v2".parse().unwrap(),
                                );
                            }
                            Ok(response)
                        })
                        .await
                        .unwrap();
                    let auth: Value =
                        serde_json::from_str(ws.next().await.unwrap().unwrap().to_text().unwrap())
                            .unwrap();
                    assert_eq!(auth["type"], "auth");
                    assert_eq!(auth["token"], secret);
                    if media {
                        assert_eq!(auth["connectionId"], "connection_1");
                        assert_eq!(
                            auth.get("participant").and_then(Value::as_str),
                            if client_token {
                                None
                            } else {
                                Some("agent:one@example.test")
                            }
                        );
                    }
                    ws.send(Message::Text(
                        if media {
                            json!({"type":"ready","sampleRate":16000,"video":false})
                        } else {
                            json!({"type":"ready"})
                        }
                        .to_string()
                        .into(),
                    ))
                    .await
                    .unwrap();
                });
                let credential = if client_token {
                    Credential::client_token(secret).unwrap()
                } else {
                    Credential::organization_api_key(secret).unwrap()
                };
                let client =
                    MessagingClient::new(credential, options(format!("{base}{prefix}"))).unwrap();
                if media {
                    let _socket = client
                        .calls()
                        .open_media(
                            "call /?+",
                            "connection_1",
                            Some("agent:one@example.test"),
                            CancellationToken::new(),
                        )
                        .await
                        .unwrap();
                } else {
                    let _socket = client
                        .calls()
                        .open_lifecycle(
                            "session/a ?&b",
                            Some("agent:one@example.test"),
                            CancellationToken::new(),
                        )
                        .await
                        .unwrap();
                }
                task.await.unwrap();
                let suffix = if media {
                    "/voip/calls/call%20%2F%3F%2B/media"
                } else if client_token {
                    "/voip/ws"
                } else {
                    "/voip/ws?session=session%2Fa+%3F%26b&participant=agent%3Aone%40example.test"
                };
                assert_eq!(
                    *target.lock().unwrap(),
                    format!("{}{suffix}", prefix.trim_end_matches('/'))
                );
            }
        }
    }
}
#[tokio::test]
async fn raw_cursor_cycles_stop_before_a_repeated_request() {
    for cursors in [
        vec!["again", "again"],
        vec!["a", "b", "a"],
        vec!["seed"],
        vec!["", ""],
    ] {
        let (peer, base) = listener().await;
        let observed = Arc::new(Mutex::new(Vec::new()));
        let seen = observed.clone();
        let limit = cursors.len();
        let task = tokio::spawn(async move {
            for n in 0..5 {
                let (mut socket, _) = peer.accept().await.unwrap();
                let header = headers(&mut socket, KEY).await;
                seen.lock().unwrap().push(header);
                reply(
                    &mut socket,
                    200,
                    "application/json",
                    &json!({"items":[], "next":cursors[n.min(cursors.len()-1)]}).to_string(),
                )
                .await;
            }
        });
        let client = OrganizationClient::new(
            Credential::organization_api_key(KEY).unwrap(),
            options(base),
        )
        .unwrap();
        let mut request = RawRequest::get("/raw");
        request.query.insert("position".into(), "seed".into());
        let page = client
            .raw_paginate(
                request,
                |v, _| {
                    Ok(DecodedRawPage::<u64> {
                        items: vec![],
                        next_cursor: v["next"].as_str().map(str::to_owned),
                    })
                },
                Some("position"),
            )
            .await
            .unwrap();
        let stream = page.into_stream();
        tokio::pin!(stream);
        let result = tokio::time::timeout(Duration::from_millis(500), stream.next()).await;
        task.abort();
        let _ = task.await;
        let error = result
            .expect("raw stream kept requesting cursor")
            .unwrap()
            .unwrap_err();
        assert_eq!(error.kind, ErrorKind::Server);
        assert_eq!(error.code.as_deref(), Some("invalid_response"));
        assert_eq!(error.request_id.as_deref(), Some("repair"));
        assert!(observed.lock().unwrap().len() <= limit);
    }
}
#[tokio::test]
async fn signal_finite_response_has_one_header_and_body_deadline() {
    let (peer, base) = listener().await;
    let task = tokio::spawn(async move {
        let (mut socket, _) = peer.accept().await.unwrap();
        headers(&mut socket, SECRET).await;
        tokio::time::sleep(Duration::from_millis(100)).await;
        socket.write_all(b"HTTP/1.1 200 OK\r\ncontent-type: application/json\r\ntransfer-encoding: chunked\r\n\r\n").await.unwrap();
        for _ in 0..12 {
            tokio::time::sleep(Duration::from_millis(60)).await;
            if socket.write_all(b"1\r\n \r\n").await.is_err() {
                break;
            }
        }
    });
    let client = signal(base, Duration::from_millis(180));
    let start = tokio::time::Instant::now();
    let error = match tokio::time::timeout(
        Duration::from_millis(500),
        client.sessions(&CancellationToken::new()),
    )
    .await
    {
        Ok(Err(error)) => error,
        _ => panic!("finite Signal request outlived whole-response deadline"),
    };
    assert_eq!(error.kind, ErrorKind::Timeout);
    assert!(start.elapsed() < Duration::from_millis(400));
    assert!(!error.to_string().contains(SECRET));
    task.abort();
    let _ = task.await;
}
#[tokio::test]
async fn signal_stream_rejects_cross_session_events() {
    let (peer, base) = listener().await;
    let task = tokio::spawn(async move {
        let (mut socket, _) = peer.accept().await.unwrap();
        assert!(headers(&mut socket, SECRET)
            .await
            .starts_with("GET /v1/events?session_id=assigned%20%2F%2B "));
        reply(&mut socket, 200, "text/event-stream", &frame("other")).await;
    });
    let mut events =
        signal(base, Duration::from_secs(2)).events(Some("assigned /+"), CancellationToken::new());
    let error = events
        .next()
        .await
        .unwrap()
        .err()
        .expect("cross-session event escaped");
    assert_eq!(error.code.as_deref(), Some("invalid_response"));
    task.await.unwrap();
}
#[tokio::test]
async fn signal_stream_reports_truncated_frames_and_preserves_clean_eof() {
    for body in [
        "id: e".to_owned(),
        "id: e\nevent: message\n".to_owned(),
        frame("s").trim_end_matches('\n').to_owned(),
        format!("{}id: next\ndata: partial", frame("s")),
    ] {
        let (peer, base) = listener().await;
        let valid_first = body.starts_with(&frame("s"));
        let task = tokio::spawn(async move {
            let (mut socket, _) = peer.accept().await.unwrap();
            headers(&mut socket, SECRET).await;
            reply(&mut socket, 200, "text/event-stream", &body).await;
        });
        let mut events =
            signal(base, Duration::from_secs(2)).events(Some("s"), CancellationToken::new());
        if valid_first {
            assert!(events.next().await.unwrap().is_ok());
        }
        let error = events
            .next()
            .await
            .expect("truncated frame ended normally")
            .err()
            .expect("truncated frame escaped");
        assert_eq!(error.code.as_deref(), Some("invalid_response"));
        task.await.unwrap();
    }
    for session in [None, Some("s")] {
        let (peer, base) = listener().await;
        let task = tokio::spawn(async move {
            let (mut socket, _) = peer.accept().await.unwrap();
            headers(&mut socket, SECRET).await;
            reply(
                &mut socket,
                200,
                "text/event-stream",
                &format!(": keepalive\r\n\r\n{}", frame("s")),
            )
            .await;
        });
        let mut events =
            signal(base, Duration::from_secs(2)).events(session, CancellationToken::new());
        assert!(events.next().await.unwrap().is_ok());
        assert!(events.next().await.is_none());
        task.await.unwrap();
    }
}
#[tokio::test]
async fn signal_ack_requires_exact_204_without_replay() {
    for status in [200, 201, 202, 205, 206, 299, 204] {
        let (peer, base) = listener().await;
        let task = tokio::spawn(async move {
            let (mut socket, _) = peer.accept().await.unwrap();
            assert!(headers(&mut socket, SECRET)
                .await
                .starts_with("POST /v1/events/e%20%2F%2B/ack "));
            reply(
                &mut socket,
                status,
                "text/html",
                if status == 204 { "" } else { "private" },
            )
            .await;
            assert!(
                tokio::time::timeout(Duration::from_millis(30), peer.accept())
                    .await
                    .is_err()
            );
        });
        let result = signal(base, Duration::from_secs(2))
            .acknowledge("e /+", &CancellationToken::new())
            .await;
        if status == 204 {
            result.unwrap();
        } else {
            let error = result.expect_err("non-204 ACK accepted");
            assert_eq!(error.status, Some(status));
            assert_eq!(error.code.as_deref(), Some("invalid_response"));
            assert!(!error.to_string().contains("private"));
        }
        task.await.unwrap();
    }
}

#[tokio::test]
async fn usage_iteration_honors_starting_cursor_and_seeds_cycle_detection() {
    for repeated in [false, true] {
        let (peer, base) = listener().await;
        let observed = Arc::new(Mutex::new(Vec::new()));
        let seen = observed.clone();
        let task = tokio::spawn(async move {
            while let Ok(Ok((mut socket, _))) =
                tokio::time::timeout(Duration::from_millis(100), peer.accept()).await
            {
                let header = headers(&mut socket, KEY).await;
                seen.lock().unwrap().push(header);
                reply(&mut socket, 200, "application/json", &json!({"data":{"records":[],"nextCursor":if repeated {Some("seed /+")} else {None}}}).to_string()).await;
                if seen.lock().unwrap().len() > 3 {
                    break;
                }
            }
        });
        let client = OrganizationClient::new(
            Credential::organization_api_key(KEY).unwrap(),
            options(base),
        )
        .unwrap();
        let usage = client.usage();
        let mut stream = usage.iterate_records(
            polymorfa_sdk::usage::UsageRecordParams {
                cursor: Some("seed /+".into()),
                ..Default::default()
            },
            RequestOptions::default(),
        );
        let result = tokio::time::timeout(Duration::from_secs(1), stream.next())
            .await
            .unwrap();
        if repeated {
            let error = result.unwrap().unwrap_err();
            assert_eq!(error.code.as_deref(), Some("invalid_response"));
            assert_eq!(error.request_id.as_deref(), Some("repair"));
        } else {
            assert!(result.is_none());
        }
        task.await.unwrap();
        let requests = observed.lock().unwrap();
        assert_eq!(requests.len(), 1);
        assert!(requests[0].starts_with("GET /platform/usage/records?cursor=seed+%2F%2B HTTP/1.1"));
    }
}
