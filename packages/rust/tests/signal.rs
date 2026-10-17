use futures_util::StreamExt as _;
use hmac::{Hmac, Mac};
use polymorfa_sdk::{signal::*, ErrorKind};
use sha2::Sha256;
use std::{
    sync::{
        atomic::{AtomicUsize, Ordering},
        Arc,
    },
    time::Duration,
};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::{TcpListener, TcpStream},
};
use tokio_util::sync::CancellationToken;
const SECRET: &str = "application-fixture-secret";
fn event() -> serde_json::Value {
    serde_json::json!({"id":"event-fixture","type":"message","session_id":"s","chat":"111@s.whatsapp.net","sender":"111:1@s.whatsapp.net","message_id":"m","timestamp":100,"is_from_me":false,"redelivered":false,"identity_changed":false,"message_proto":"","text":"private text ✓","future":{"retained":true}})
}
async fn request(socket: &mut TcpStream) -> (String, serde_json::Value) {
    let mut bytes = Vec::new();
    let mut one = [0];
    while !bytes.ends_with(b"\r\n\r\n") {
        socket.read_exact(&mut one).await.unwrap();
        bytes.push(one[0]);
        assert!(bytes.len() < 65536);
    }
    let header = String::from_utf8(bytes).unwrap();
    let lower = header.to_lowercase();
    assert!(lower.contains(&format!("authorization: bearer {SECRET}\r\n")));
    assert!(!lower.contains("\r\norigin:"));
    assert!(!lower.contains("\r\ncookie:"));
    let length = header
        .lines()
        .find_map(|l| {
            l.to_lowercase()
                .strip_prefix("content-length: ")
                .map(|n| n.parse::<usize>().unwrap())
        })
        .unwrap_or(0);
    let mut bytes = vec![0; length];
    socket.read_exact(&mut bytes).await.unwrap();
    (
        header,
        if bytes.is_empty() {
            serde_json::Value::Null
        } else {
            serde_json::from_slice(&bytes).unwrap()
        },
    )
}
async fn respond(socket: &mut TcpStream, status: u16, kind: &str, body: &str, extra: &str) {
    socket.write_all(format!("HTTP/1.1 {status} Fixture\r\ncontent-type: {kind}\r\ncontent-length: {}\r\nconnection: close\r\n{extra}\r\n",body.len()).as_bytes()).await.unwrap();
    for part in body.as_bytes().chunks(7) {
        socket.write_all(part).await.unwrap();
    }
}
#[tokio::test]
async fn native_sidecar_sends_and_streams_without_automatic_ack() {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = format!("http://{}", listener.local_addr().unwrap());
    let acks = Arc::new(AtomicUsize::new(0));
    let seen = acks.clone();
    let server = tokio::spawn(async move {
        let (mut socket, _) = listener.accept().await.unwrap();
        let (header, _) = request(&mut socket).await;
        assert!(header.starts_with("GET /v1/sessions "));
        respond(&mut socket,200,"application/json",r#"{"node_id":"node","sessions":[{"id":"s","lease_generation":2,"claimed":true,"has_device_keys":true,"state":"connected","pn":null,"lid":null}]}"#,"").await;
        let (mut socket, _) = listener.accept().await.unwrap();
        let (header, body) = request(&mut socket).await;
        assert!(header.starts_with("POST /v1/sessions/s%2F1/messages "));
        assert_eq!(
            body,
            serde_json::json!({"to":"111@s.whatsapp.net","text":"private"})
        );
        respond(
            &mut socket,
            200,
            "application/json",
            r#"{"message_id":"m","server_timestamp":100,"resent":false}"#,
            "",
        )
        .await;
        let (mut socket, _) = listener.accept().await.unwrap();
        let (header, _) = request(&mut socket).await;
        assert!(header.starts_with("GET /v1/events?session_id=s%20one "));
        respond(
            &mut socket,
            200,
            "text/event-stream",
            &format!(
                ": keepalive\r\n\r\nid: event-fixture\r\nevent: message\r\ndata: {}\r\n\r\n",
                {
                    let mut value = event();
                    value["session_id"] = "s one".into();
                    value
                }
            ),
            "",
        )
        .await;
        let (mut socket, _) = listener.accept().await.unwrap();
        let (header, _) = request(&mut socket).await;
        assert!(header.starts_with("POST /v1/events/event-fixture/ack "));
        seen.fetch_add(1, Ordering::SeqCst);
        respond(&mut socket, 204, "application/json", "", "").await;
    });
    let client = SignalClient::new(SignalClientOptions::new(url, SECRET)).unwrap();
    let stop = CancellationToken::new();
    assert_eq!(
        client.sessions(&stop).await.unwrap().sessions[0].lease_generation,
        2
    );
    assert_eq!(
        client
            .send(
                "s/1",
                &SignalSendRequest::Text {
                    to: "111@s.whatsapp.net".into(),
                    text: "private".into()
                },
                &stop
            )
            .await
            .unwrap()
            .message_id,
        "m"
    );
    let mut events = client.events(Some("s one"), stop.clone());
    let received = events.next().await.unwrap().unwrap();
    assert_eq!(received.text.as_deref(), Some("private text ✓"));
    assert_eq!(received.additional["future"]["retained"], true);
    tokio::time::sleep(Duration::from_millis(25)).await;
    assert_eq!(acks.load(Ordering::SeqCst), 0);
    client.acknowledge(&received.id, &stop).await.unwrap();
    assert_eq!(acks.load(Ordering::SeqCst), 1);
    server.await.unwrap();
}
#[tokio::test]
async fn sidecar_rejects_auth_errors_and_never_follows_redirects() {
    for status in [401, 403, 307] {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let url = format!("http://{}", listener.local_addr().unwrap());
        let forbidden = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let location = format!(
            "Location: http://{}/capture\r\n",
            forbidden.local_addr().unwrap()
        );
        let server = tokio::spawn(async move {
            let (mut socket, _) = listener.accept().await.unwrap();
            request(&mut socket).await;
            respond(
                &mut socket,
                status,
                "text/html",
                "<html>private-signed-url?secret=value</html>",
                &location,
            )
            .await;
        });
        let client = SignalClient::new(SignalClientOptions::new(url, SECRET)).unwrap();
        let error = match client.sessions(&CancellationToken::new()).await {
            Ok(_) => panic!("non-success accepted"),
            Err(e) => e,
        };
        assert_eq!(error.status, Some(status));
        assert!(!error.to_string().contains("secret"));
        if status == 401 {
            assert_eq!(error.kind, ErrorKind::Authentication);
        }
        if status == 403 {
            assert_eq!(error.kind, ErrorKind::Authorization);
        }
        assert!(
            tokio::time::timeout(Duration::from_millis(50), forbidden.accept())
                .await
                .is_err()
        );
        server.await.unwrap();
    }
}
#[test]
fn webhook_mac_uses_exact_bytes_timestamp_and_preserves_extensions() {
    let body = serde_json::to_vec(&event()).unwrap();
    let mut mac = Hmac::<Sha256>::new_from_slice(SECRET.as_bytes()).unwrap();
    mac.update(b"100.");
    mac.update(&body);
    let signature = format!("v1={}", hex::encode(mac.finalize().into_bytes()));
    let parsed = verify_signal_webhook(
        SECRET.as_bytes(),
        100,
        &body,
        &signature,
        105,
        Duration::from_secs(5),
    )
    .unwrap();
    assert_eq!(parsed.id, "event-fixture");
    assert_eq!(parsed.additional["future"]["retained"], true);
    assert!(verify_signal_webhook(
        SECRET.as_bytes(),
        100,
        &body,
        &signature,
        106,
        Duration::from_secs(5)
    )
    .is_err());
    let mut changed = body.clone();
    changed.push(b' ');
    assert!(verify_signal_webhook(
        SECRET.as_bytes(),
        100,
        &changed,
        &signature,
        100,
        Duration::from_secs(5)
    )
    .is_err());
    for (url, secret) in [
        ("http://remote.invalid", SECRET),
        ("https://u:pass@remote.invalid", SECRET),
        ("https://remote.invalid?secret=x", SECRET),
        ("https://remote.invalid", "spaces are forbidden"),
    ] {
        assert!(SignalClient::new(SignalClientOptions::new(url, secret)).is_err());
    }
    let mut parser = polymorfa_sdk::stream::SseParser::default();
    assert!(parser.feed(&vec![b'x'; 4 * 1024 * 1024 + 1]).is_err());
}

fn signed(key: &[u8], timestamp: i64, body: &[u8]) -> String {
    let mut mac = Hmac::<Sha256>::new_from_slice(key).unwrap();
    mac.update(format!("{timestamp}.").as_bytes());
    mac.update(body);
    format!("v1={}", hex::encode(mac.finalize().into_bytes()))
}
#[test]
fn webhook_rejects_weak_or_reserved_keys_before_authentication() {
    let body = serde_json::to_vec(&event()).unwrap();
    let verify = |key: &[u8], body: &[u8], signature: &str, now: i64| {
        verify_signal_webhook(key, 100, body, signature, now, Duration::from_secs(5))
    };
    // Correctly signed with the weak or reserved key itself: still rejected as configuration.
    let mut rejected: Vec<Vec<u8>> = vec![vec![], vec![b'k'], vec![b'k'; 15], vec![0xff; 15]];
    for prefix in [
        "pmfa_",
        "pmfa_pt_",
        "pmfa_ct_",
        "pmfa_ls_",
        "pmfa_wst_",
        "pmfa_sd_",
    ] {
        rejected.push(format!("{prefix}synthetic-fixture-key-0000").into_bytes());
    }
    for key in &rejected {
        let error = verify(key, &body, &signed(key, 100, &body), 100)
            .map(|_| ())
            .unwrap_err();
        assert_eq!(
            error.kind,
            ErrorKind::Configuration,
            "key length {}",
            key.len()
        );
        assert_eq!(error.code.as_deref(), Some("invalid_configuration"));
    }
    // Exact 16 bytes, longer ASCII and arbitrary non-ASCII byte keys remain valid.
    for key in [
        vec![b'k'; 16],
        b"application-fixture-secret".to_vec(),
        vec![0xff; 32],
        b"PMFA_uppercase-is-not-reserved".to_vec(),
        b"xpmfa_not-a-prefix-fixture".to_vec(),
    ] {
        let Ok(parsed) = verify(&key, &body, &signed(&key, 100, &body), 104) else {
            panic!("valid key rejected")
        };
        assert_eq!(parsed.id, "event-fixture");
        let wrong = signed(b"another-fixture-secret", 100, &body);
        let error = verify(&key, &body, &wrong, 100).map(|_| ()).unwrap_err();
        assert_eq!(error.code.as_deref(), Some("invalid_signature"));
        let error = verify(&key, &body, &signed(&key, 100, &body), 106)
            .map(|_| ())
            .unwrap_err();
        assert_eq!(error.code.as_deref(), Some("invalid_signature"));
    }
    let key = vec![b'k'; 16];
    let invalid = b"{not json".to_vec();
    let error = verify(&key, &invalid, &signed(&key, 100, &invalid), 100)
        .map(|_| ())
        .unwrap_err();
    assert_eq!(error.code.as_deref(), Some("invalid_response"));
    let large = vec![b' '; 4 * 1024 * 1024 + 1];
    let error = verify(&key, &large, &signed(&key, 100, &large), 100)
        .map(|_| ())
        .unwrap_err();
    assert_eq!(error.code.as_deref(), Some("invalid_response"));
}

/// Optional integration against the exact private producer's synthetic local HTTP harness.
#[tokio::test]
async fn actual_service_auth_and_sessions_contract() {
    let Ok(directory) = std::env::var("POLYMORFA_SIGNAL_FIXTURE_DIRECTORY") else {
        return;
    };
    let bytes = tokio::fs::read(std::path::Path::new(&directory).join("metadata.json"))
        .await
        .unwrap();
    let meta: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
    assert_eq!(meta["sourceCommit"], SIGNAL_SERVICE_CONTRACT);
    assert_eq!(meta["syntheticOnly"], true);
    let base = meta["url"].as_str().unwrap();
    let secret = meta["applicationSecret"].as_str().unwrap();
    let client = SignalClient::new(SignalClientOptions::new(base, secret)).unwrap();
    let sessions = client.sessions(&CancellationToken::new()).await.unwrap();
    assert_eq!(sessions.sessions[0].id, meta["sessionId"].as_str().unwrap());
    assert!(sessions.sessions[0].claimed);
    let wrong = SignalClient::new(SignalClientOptions::new(
        base,
        "incorrect-synthetic-application-secret",
    ))
    .unwrap();
    assert_eq!(
        match wrong.sessions(&CancellationToken::new()).await {
            Err(error) => error.kind,
            Ok(_) => panic!("Incorrect application secret accepted"),
        },
        ErrorKind::Authentication
    );
    let http = reqwest::Client::new();
    let response = http
        .get(format!("{base}/v1/sessions"))
        .bearer_auth(secret)
        .header("Origin", "null")
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 403);
    let health: serde_json::Value = http
        .get(format!("{base}/healthz"))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(health, serde_json::json!({"status":"ok"}));
    if std::env::var("POLYMORFA_SIGNAL_FIXTURE_INJECT").as_deref() != Ok("1") {
        return;
    }
    let root = std::path::Path::new(&directory);
    let receipt = root.join("receipt.json");
    if let Err(error) = tokio::fs::remove_file(&receipt).await {
        assert_eq!(error.kind(), std::io::ErrorKind::NotFound);
    }
    let id = format!("rust-native-{}", uuid::Uuid::new_v4());
    let stop = CancellationToken::new();
    let mut events = client.events(Some(meta["sessionId"].as_str().unwrap()), stop.clone());
    let receive = tokio::spawn(async move { events.next().await.unwrap().unwrap() });
    tokio::time::sleep(Duration::from_millis(100)).await;
    tokio::fs::write(
        root.join("inject.json"),
        serde_json::to_vec(&serde_json::json!({"messageId":id,"text":"rust-native-synthetic"}))
            .unwrap(),
    )
    .await
    .unwrap();
    let event = tokio::time::timeout(Duration::from_secs(4), receive)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(event.message_id, id);
    assert_eq!(event.text.as_deref(), Some("rust-native-synthetic"));
    assert_eq!(event.timestamp, 1720000000);
    assert_eq!(event.sender_alt.as_deref(), Some("123456@lid"));
    assert!(!event.message_proto.is_empty());
    assert!(!receipt.exists());
    let mut file = tokio::fs::File::create(root.join("rust-received.json"))
        .await
        .unwrap();
    file.write_all(&serde_json::to_vec(&serde_json::json!({"id":event.id,"messageProto":event.message_proto,"text":event.text})).unwrap()).await.unwrap();
    file.sync_all().await.unwrap();
    client
        .acknowledge(&event.id, &CancellationToken::new())
        .await
        .unwrap();
    tokio::time::timeout(Duration::from_secs(3), async {
        loop {
            if let Ok(bytes) = tokio::fs::read(&receipt).await {
                let receipt: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
                assert_eq!(receipt["acknowledged"], true);
                break;
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .unwrap();
    stop.cancel();
}
#[tokio::test]
async fn client_rejects_reserved_polymorfa_secrets_before_requests() {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = format!("http://{}", listener.local_addr().unwrap());
    // Synthetic values shaped like Polymorfa credentials. None is a real secret.
    for secret in [
        "pmfa_AgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA".to_string(),
        "pmfa_pt_AgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA".to_string(),
        "pmfa_ct_synthetic-client-token-value".to_owned(),
        "pmfa_ls_synthetic-link-session-value".to_owned(),
        "pmfa_at_synthetic-special-purpose-value".to_owned(),
        "pmfa_wst_synthetic-socket-ticket-value".to_owned(),
        "pmfa_sd_synthetic-session-device-value".to_owned(),
        "pmfa_independent_looking_but_reserved".to_owned(),
    ] {
        let Err(error) = SignalClient::new(SignalClientOptions::new(url.clone(), secret.clone()))
        else {
            panic!("reserved Signal application secret accepted")
        };
        assert_eq!(error.kind, ErrorKind::Configuration);
        assert!(!error.to_string().contains(&secret));
    }
    assert!(
        tokio::time::timeout(Duration::from_millis(50), listener.accept())
            .await
            .is_err(),
        "reserved secret configuration reached the network"
    );
    for valid in [
        "PMFA_uppercase-is-not-reserved",
        "xpmfa_not-a-prefix-fixture",
    ] {
        assert!(SignalClient::new(SignalClientOptions::new(url.clone(), valid)).is_ok());
    }
}
