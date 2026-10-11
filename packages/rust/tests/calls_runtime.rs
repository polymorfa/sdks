use futures_util::{SinkExt, StreamExt};
use polymorfa_sdk::{
    calls_protocol::MediaStateUpdate, calls_runtime::*, calls_token::*, Credential, ErrorKind,
};
use serde_json::{json, Value};
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
use tokio_tungstenite::{
    accept_async, accept_hdr_async,
    tungstenite::{
        handshake::server::{Request, Response},
        protocol::{frame::coding::CloseCode, CloseFrame},
        Message,
    },
};
fn credential(ch: char) -> Credential {
    Credential::organization_api_key(format!("pmfa_{}", ch.to_string().repeat(72))).unwrap()
}
fn options(base: String) -> CallsClientOptions {
    let mut o = CallsClientOptions::new("support");
    o.client.base_url = base;
    o.client.max_network_retries = 0;
    o.client.timeout = Duration::from_secs(1);
    o.lifecycle_backoff = Duration::from_millis(5);
    o.media_backoff = Duration::from_millis(5);
    o.lifecycle_heartbeat = Duration::ZERO;
    o.media_heartbeat = Duration::ZERO;
    o.media_control_timeout = Duration::from_millis(30);
    o.diagnostics = false;
    o
}
async fn auth(ws: &mut tokio_tungstenite::WebSocketStream<tokio::net::TcpStream>) -> Value {
    let frame = ws.next().await.unwrap().unwrap();
    assert!(frame.is_text());
    let auth: Value = serde_json::from_str(frame.to_text().unwrap()).unwrap();
    assert_eq!(auth["type"], "auth");
    auth
}
async fn receive(rx: &mut tokio::sync::broadcast::Receiver<CallsEvent>) -> CallsEvent {
    tokio::time::timeout(Duration::from_secs(2), rx.recv())
        .await
        .unwrap()
        .unwrap()
}
// tungstenite defines this callback signature with an unboxed HTTP error.
#[allow(clippy::result_large_err)]
fn lifecycle_protocol(
    request: &Request,
    response: Response,
) -> std::result::Result<Response, tokio_tungstenite::tungstenite::handshake::server::ErrorResponse>
{
    assert_eq!(request.uri().path(), "/voip/ws");
    assert_eq!(request.uri().query(), Some("session=support"));
    assert!(!request.headers().contains_key("authorization"));
    Ok(response)
}
#[tokio::test]
async fn lifecycle_refresh_reconnect_bounded_pending_and_duplicate_received() {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    let provider_hits = Arc::new(AtomicUsize::new(0));
    let source = CallsTokenSource::new(Arc::new({
        let hits = provider_hits.clone();
        move |request| {
            let hits = hits.clone();
            Box::pin(async move {
                let index = hits.fetch_add(1, Ordering::SeqCst);
                assert_eq!(request.refresh, index == 1);
                Ok(CallsToken {
                    credential: credential(if index == 0 { 'a' } else { 'b' }),
                    expires_at: None,
                })
            })
        }
    }));
    let server = tokio::spawn(async move {
        for index in 0..2 {
            let (stream, _) = listener.accept().await.unwrap();
            let mut socket = accept_hdr_async(stream, lifecycle_protocol).await.unwrap();
            let value = auth(&mut socket).await;
            assert!(value["token"]
                .as_str()
                .unwrap()
                .ends_with(if index == 0 { 'a' } else { 'b' }));
            socket
                .send(Message::Text(
                    json!({"type":"ready","session":"support","participant":"server:default"})
                        .to_string()
                        .into(),
                ))
                .await
                .unwrap();
            if index == 0 {
                for (event, payload) in [
                    ("call.ended", json!({"reason":"remote_hangup"})),
                    ("call.received", json!({"from":"peer","hasVideo":false})),
                ] {
                    socket.send(Message::Text(json!({"type":"event","event":event,"callId":"early-terminal","payload":payload,"timestamp":"now"}).to_string().into())).await.unwrap();
                }
                socket
                    .close(Some(CloseFrame {
                        code: CloseCode::from(4401),
                        reason: "expired".into(),
                    }))
                    .await
                    .unwrap();
            } else {
                for _ in 0..2 {
                    socket.send(Message::Text(json!({"type":"event","event":"call.received","callId":"incoming","payload":{"from":"peer","hasVideo":true,"capabilities":{"video":false,"invite":false}},"timestamp":"now"}).to_string().into())).await.unwrap();
                }
                let _ = socket.next().await;
            }
        }
    });
    let client = CallsClient::new(source, options(format!("http://{addr}"))).unwrap();
    let mut events = client.subscribe();
    client.connect().await.unwrap();
    let mut incoming = 0;
    let call = loop {
        if let CallsEvent::Incoming(call) = receive(&mut events).await {
            assert_eq!(call.id(), "incoming");
            incoming += 1;
            break call;
        }
    };
    let snapshot = call.snapshot().await;
    assert_eq!(snapshot.state, CallState::Incoming);
    assert!(!snapshot.has_video);
    assert!(!snapshot.capabilities.invite);
    assert_eq!(
        client
            .get_call("early-terminal")
            .await
            .unwrap()
            .snapshot()
            .await
            .state,
        CallState::Ended
    );
    tokio::time::sleep(Duration::from_millis(10)).await;
    while let Ok(event) = events.try_recv() {
        if matches!(event, CallsEvent::Incoming(_)) {
            incoming += 1;
        }
    }
    assert_eq!(incoming, 1);
    assert_eq!(provider_hits.load(Ordering::SeqCst), 2);
    client.disconnect().await.unwrap();
    server.await.unwrap();
}
// Tungstenite requires its handshake error response by value in this callback.
#[allow(clippy::result_large_err)]
fn media_protocol(
    request: &Request,
    mut response: Response,
) -> std::result::Result<Response, tokio_tungstenite::tungstenite::handshake::server::ErrorResponse>
{
    assert!(!request.headers().contains_key("authorization"));
    assert_eq!(request.headers()["sec-websocket-protocol"], "pmfa.calls.v2");
    response
        .headers_mut()
        .insert("sec-websocket-protocol", "pmfa.calls.v2".parse().unwrap());
    Ok(response)
}
async fn http(mut stream: tokio::net::TcpStream, response: Value) -> (String, Value, String) {
    let mut bytes = Vec::new();
    let split = loop {
        let mut chunk = [0; 4096];
        let n = stream.read(&mut chunk).await.unwrap();
        assert_ne!(n, 0);
        bytes.extend_from_slice(&chunk[..n]);
        if let Some(i) = bytes.windows(4).position(|v| v == b"\r\n\r\n") {
            break i + 4;
        }
    };
    let head = String::from_utf8(bytes[..split].to_vec()).unwrap();
    let length = head
        .lines()
        .find_map(|line| {
            line.to_ascii_lowercase()
                .strip_prefix("content-length: ")
                .and_then(|v| v.parse::<usize>().ok())
        })
        .unwrap_or(0);
    while bytes.len() < split + length {
        let mut chunk = [0; 4096];
        let n = stream.read(&mut chunk).await.unwrap();
        bytes.extend_from_slice(&chunk[..n]);
    }
    let body = if length > 0 {
        serde_json::from_slice(&bytes[split..split + length]).unwrap()
    } else {
        Value::Null
    };
    let encoded = response.to_string();
    stream.write_all(format!("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{encoded}",encoded.len()).as_bytes()).await.unwrap();
    (head.lines().next().unwrap().into(), body, head)
}
#[tokio::test]
async fn outbound_early_accept_media_state_pcm_auth_refresh_same_connection_and_leave() {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    let hits = Arc::new(AtomicUsize::new(0));
    let source = CallsTokenSource::new(Arc::new({
        let hits = hits.clone();
        move |request| {
            let hits = hits.clone();
            Box::pin(async move {
                let n = hits.fetch_add(1, Ordering::SeqCst);
                assert_eq!(request.refresh, n == 1);
                Ok(CallsToken {
                    credential: credential(if n == 0 { 'a' } else { 'b' }),
                    expires_at: None,
                })
            })
        }
    }));
    let (close_tx, close_rx) = tokio::sync::oneshot::channel();
    let server = tokio::spawn(async move {
        let (stream, _) = listener.accept().await.unwrap();
        let mut lifecycle = accept_async(stream).await.unwrap();
        auth(&mut lifecycle).await;
        lifecycle
            .send(Message::Text("{\"type\":\"ready\"}".into()))
            .await
            .unwrap();
        let (stream, _) = listener.accept().await.unwrap();
        // The acceptance intentionally arrives before the placement response.
        lifecycle.send(Message::Text(json!({"type":"event","event":"call.accepted","callId":"outbound","payload":{"answeredBy":"server:default","exclusive":false},"timestamp":"now"}).to_string().into())).await.unwrap();
        tokio::time::sleep(Duration::from_millis(5)).await;
        let (head, body, headers) = http(stream, json!({"data":{"callId":"outbound"}})).await;
        assert_eq!(head, "POST /messaging/voip/calls HTTP/1.1");
        assert_eq!(body["session"], "support");
        assert_eq!(body["to"], "+15551234567");
        assert!(headers.to_ascii_lowercase().contains("idempotency-key:"));
        let mut connection = None;
        for index in 0..2 {
            let (stream, _) = listener.accept().await.unwrap();
            let mut media = accept_hdr_async(stream, media_protocol).await.unwrap();
            let a = auth(&mut media).await;
            assert!(a["token"]
                .as_str()
                .unwrap()
                .ends_with(if index == 0 { 'a' } else { 'b' }));
            let current = a["connectionId"].as_str().unwrap().to_owned();
            if let Some(connection) = &connection {
                assert_eq!(&current, connection);
            } else {
                connection = Some(current);
            }
            media
                .send(Message::Text(
                    json!({"type":"ready","sampleRate":16000,"video":false})
                        .to_string()
                        .into(),
                ))
                .await
                .unwrap();
            media
                .send(Message::Binary(vec![1, 1, 0, 255, 255].into()))
                .await
                .unwrap();
            let command: Value =
                serde_json::from_str(media.next().await.unwrap().unwrap().to_text().unwrap())
                    .unwrap();
            assert_eq!(command["type"], "media_state");
            assert_eq!(command["audioMuted"], true);
            media.send(Message::Text(json!({"type":"media_state","requestId":command["requestId"],"audioMuted":true,"videoEnabled":false}).to_string().into())).await.unwrap();
            if index == 0 {
                media
                    .close(Some(CloseFrame {
                        code: CloseCode::from(4401),
                        reason: "expired".into(),
                    }))
                    .await
                    .unwrap();
            } else {
                let binary = media.next().await.unwrap().unwrap();
                assert_eq!(binary.into_data().as_ref(), [1, 3, 0, 253, 255]);
                let (stream, _) = listener.accept().await.unwrap();
                let (head, body, _) = http(stream, json!({"success":true})).await;
                assert_eq!(head, "POST /messaging/voip/calls/outbound/leave HTTP/1.1");
                assert_eq!(body["connectionId"], connection.as_ref().unwrap().as_str());
                let _ = close_tx.send(());
                let _ = media.next().await;
                break;
            }
        }
        let _ = lifecycle.next().await;
    });
    let client = CallsClient::new(source, options(format!("http://{addr}"))).unwrap();
    let mut events = client.subscribe();
    client.connect().await.unwrap();
    let call = client
        .place(
            CallDestination::Phone("+15551234567".into()),
            Default::default(),
        )
        .await
        .unwrap();
    loop {
        if let CallsEvent::State {
            state: CallState::Connected,
            ..
        } = receive(&mut events).await
        {
            break;
        }
    }
    let state = call
        .set_media_state(MediaStateUpdate {
            audio_muted: Some(true),
            ..Default::default()
        })
        .await
        .unwrap();
    assert_eq!(state.audio_muted, Some(true));
    loop {
        if let CallsEvent::State {
            state: CallState::Connected,
            ..
        } = receive(&mut events).await
        {
            if call.snapshot().await.reconnects == 1 {
                break;
            }
        }
    }
    call.write_audio(vec![3, -3]).await.unwrap();
    call.leave().await.unwrap();
    close_rx.await.unwrap();
    assert_eq!(call.snapshot().await.end_reason, Some(CallEndReason::Left));
    assert_eq!(hits.load(Ordering::SeqCst), 2);
    client.disconnect().await.unwrap();
    tokio::time::timeout(Duration::from_secs(2), server)
        .await
        .unwrap()
        .unwrap();
}
#[tokio::test]
async fn group_shape_and_join_policy_fail_before_transport() {
    let client = CallsClient::new(
        CallsTokenSource::static_credential(credential('a')).unwrap(),
        options("http://127.0.0.1:1".into()),
    )
    .unwrap();
    assert_eq!(
        client
            .place(CallDestination::Group("0".into()), Default::default())
            .await
            .unwrap_err()
            .kind,
        ErrorKind::Configuration
    );
    assert!(client
        .place(
            CallDestination::Participants(vec!["duplicate".into(), "duplicate".into()]),
            Default::default()
        )
        .await
        .is_err());
}
#[tokio::test]
async fn lifecycle_http_connect_proxy_keeps_bearer_out_of_tunnel_and_handshake() {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    let server = tokio::spawn(async move {
        let (mut stream, _) = listener.accept().await.unwrap();
        let mut header = Vec::new();
        while !header.ends_with(b"\r\n\r\n") {
            header.push(stream.read_u8().await.unwrap());
        }
        let header = String::from_utf8(header).unwrap();
        assert!(header.starts_with("CONNECT 127.0.0.1:1 HTTP/1.1\r\n"));
        assert!(header.contains("Proxy-Authorization: Basic dXNlcjpwYXNz"));
        assert!(!header.contains("pmfa_"));
        stream
            .write_all(b"HTTP/1.1 200 Connection Established\r\n\r\n")
            .await
            .unwrap();
        let mut socket = accept_async(stream).await.unwrap();
        assert_eq!(
            auth(&mut socket).await["token"],
            format!("pmfa_{}", "a".repeat(72))
        );
        socket
            .send(Message::Text(json!({"type":"ready"}).to_string().into()))
            .await
            .unwrap();
        let _ = socket.next().await;
    });
    let mut opts = options("http://127.0.0.1:1".into());
    opts.client.proxy = Some(format!("http://user:pass@{addr}"));
    let client = CallsClient::new(
        CallsTokenSource::static_credential(credential('a')).unwrap(),
        opts,
    )
    .unwrap();
    client.connect().await.unwrap();
    client.disconnect().await.unwrap();
    server.await.unwrap();
}
