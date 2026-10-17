use super::*;
use serde_json::json;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
#[tokio::test]
async fn real_app_login_uses_opaque_cookie_and_server_assignment_for_native_token_mint() {
    let api = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let api_url = format!("http://{}", api.local_addr().unwrap());
    let upstream = tokio::spawn(async move {
        let (mut stream, _) = api.accept().await.unwrap();
        let mut bytes = Vec::new();
        let mut buffer = [0; 4096];
        let (end, length) = loop {
            let n = stream.read(&mut buffer).await.unwrap();
            assert!(n > 0);
            bytes.extend_from_slice(&buffer[..n]);
            if let Some(end) = bytes.windows(4).position(|w| w == b"\r\n\r\n") {
                let head = String::from_utf8_lossy(&bytes[..end]);
                let length = head
                    .lines()
                    .find_map(|l| {
                        l.to_ascii_lowercase()
                            .strip_prefix("content-length:")
                            .and_then(|s| s.trim().parse::<usize>().ok())
                    })
                    .unwrap();
                break (end + 4, length);
            }
        };
        while bytes.len() < end + length {
            let n = stream.read(&mut buffer).await.unwrap();
            assert!(n > 0);
            bytes.extend_from_slice(&buffer[..n]);
        }
        let head = String::from_utf8_lossy(&bytes[..end]);
        assert!(head.starts_with("POST /platform/client-tokens HTTP/1.1"));
        assert!(head.to_lowercase().contains("authorization: bearer pmfa_"));
        assert_eq!(
            serde_json::from_slice::<serde_json::Value>(&bytes[end..]).unwrap(),
            json!({"ephemeralId":"example:app-user-id","session":"authorized-support","ttlSeconds":600})
        );
        let body=json!({"success":true,"data":{"token":"pmfa_ct_browser_fixture","expiresAt":"2030-01-01T00:00:00Z"}}).to_string();
        stream.write_all(format!("HTTP/1.1 200 OK\r\ncontent-type: application/json\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{body}",body.len()).as_bytes()).await.unwrap();
    });
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let origin = format!("http://{}", listener.local_addr().unwrap());
    let app = Arc::new(App {
        client: MessagingClient::new(
            Credential::organization_api_key(format!("pmfa_{}", "a".repeat(72))).unwrap(),
            ClientOptions {
                base_url: api_url,
                max_network_retries: 0,
                ..Default::default()
            },
        )
        .unwrap(),
        username_hash: digest("example-user"),
        password_hash: digest("test-only-password"),
        user_id: "app-user-id".into(),
        session: "authorized-support".into(),
        origin: origin.clone(),
        users: Mutex::new(HashMap::new()),
    });
    let router = router(app.clone());
    let server = tokio::spawn(async move {
        axum::serve(listener, router).await.unwrap();
    });
    let client = reqwest::Client::new();
    assert_eq!(
        client
            .post(format!("{origin}/api/polymorfa/token"))
            .header("origin", &origin)
            .send()
            .await
            .unwrap()
            .status(),
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(
        client
            .post(format!("{origin}/api/polymorfa/token"))
            .header("origin", "https://evil.invalid")
            .send()
            .await
            .unwrap()
            .status(),
        StatusCode::FORBIDDEN
    );
    assert_eq!(
        client
            .post(format!("{origin}/api/login"))
            .header("origin", &origin)
            .json(&json!({"username":"example-user","password":"wrong"}))
            .send()
            .await
            .unwrap()
            .status(),
        StatusCode::UNAUTHORIZED
    );
    let login = client
        .post(format!("{origin}/api/login"))
        .header("origin", &origin)
        .json(&json!({"username":"example-user","password":"test-only-password"}))
        .send()
        .await
        .unwrap();
    assert_eq!(login.status(), StatusCode::NO_CONTENT);
    let cookie = login.headers()["set-cookie"].to_str().unwrap().to_owned();
    assert!(cookie.contains("HttpOnly; SameSite=Strict"));
    let cookie = cookie.split(';').next().unwrap();
    assert!(!cookie.contains("app-user-id"));
    assert_eq!(
        client
            .post(format!("{origin}/api/polymorfa/token"))
            .header("origin", &origin)
            .header("cookie", "polymorfa_example_session=forged")
            .send()
            .await
            .unwrap()
            .status(),
        StatusCode::UNAUTHORIZED
    );
    let minted = client
        .post(format!("{origin}/api/polymorfa/token"))
        .header("origin", &origin)
        .header("cookie", cookie)
        .header("x-example-authenticated-user", "evil")
        .json(&json!({"session":"foreign","customer":"foreign","ephemeralId":"evil"}))
        .send()
        .await
        .unwrap();
    assert_eq!(minted.status(), StatusCode::OK);
    assert_eq!(minted.headers()["cache-control"], "no-store");
    assert_eq!(
        minted.json::<serde_json::Value>().await.unwrap(),
        json!({"value":"pmfa_ct_browser_fixture","audience":"browser","expiresAt":1893456000000i64,"scopes":["read_messages","connect_whatsapp"],"grant":{"session":"authorized-support","conversations":[],"allow":["read_messages","connect_whatsapp"]}})
    );
    upstream.await.unwrap();
    assert_eq!(
        client
            .post(format!("{origin}/api/logout"))
            .header("origin", &origin)
            .header("cookie", cookie)
            .send()
            .await
            .unwrap()
            .status(),
        StatusCode::NO_CONTENT
    );
    assert_eq!(
        client
            .post(format!("{origin}/api/polymorfa/token"))
            .header("origin", &origin)
            .header("cookie", cookie)
            .send()
            .await
            .unwrap()
            .status(),
        StatusCode::UNAUTHORIZED
    );
    assert!(app.users.lock().unwrap().is_empty());
    server.abort();
}
#[tokio::test]
async fn connect_and_empty_history_require_app_session_and_keep_assignment_on_server() {
    let api = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let api_url = format!("http://{}", api.local_addr().unwrap());
    let upstream = tokio::spawn(async move {
        let (mut stream, _) = api.accept().await.unwrap();
        let mut bytes = Vec::new();
        let mut buffer = [0; 4096];
        loop {
            let n = stream.read(&mut buffer).await.unwrap();
            assert!(n > 0);
            bytes.extend_from_slice(&buffer[..n]);
            if let Some(end) = bytes.windows(4).position(|w| w == b"\r\n\r\n") {
                let head = String::from_utf8_lossy(&bytes[..end]);
                let length = head
                    .lines()
                    .find_map(|l| {
                        l.to_lowercase()
                            .strip_prefix("content-length:")
                            .and_then(|v| v.trim().parse::<usize>().ok())
                    })
                    .unwrap_or(0);
                if bytes.len() >= end + 4 + length {
                    assert!(head.starts_with("POST /messaging/quicklinks HTTP/1.1"));
                    assert_eq!(
                        serde_json::from_slice::<serde_json::Value>(&bytes[end + 4..]).unwrap(),
                        json!({"purpose":"add_connection","session":"authorized-support","addConnection":"linked_devices","connectionGoal":"hybrid"})
                    );
                    break;
                }
            }
        }
        let body=json!({"success":true,"data":{"purpose":"add_connection","connectionGoal":"hybrid","addConnection":"linked_devices","id":"link","url":"https://quick.example.com/link","session":"authorized-support","expiresAt":null}}).to_string();
        stream.write_all(format!("HTTP/1.1 200 OK\r\ncontent-type: application/json\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{body}",body.len()).as_bytes()).await.unwrap();
    });
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let origin = format!("http://{}", listener.local_addr().unwrap());
    let app = Arc::new(App {
        client: MessagingClient::new(
            Credential::organization_api_key(format!("pmfa_{}", "a".repeat(72))).unwrap(),
            ClientOptions {
                base_url: api_url,
                max_network_retries: 0,
                ..Default::default()
            },
        )
        .unwrap(),
        username_hash: digest("user"),
        password_hash: digest("fixture"),
        user_id: "app-user".into(),
        session: "authorized-support".into(),
        origin: origin.clone(),
        users: Mutex::new(HashMap::from([(
            "opaque-app-session".into(),
            AppSession {
                user_id: "app-user".into(),
                expires: Instant::now() + Duration::from_secs(60),
            },
        )])),
    });
    let server = tokio::spawn(async move {
        axum::serve(listener, router(app)).await.unwrap();
    });
    let client = reqwest::Client::new();
    assert_eq!(
        client
            .get(format!("{origin}/api/polymorfa/history/conversations"))
            .send()
            .await
            .unwrap()
            .status(),
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(
        client
            .get(format!("{origin}/api/polymorfa/history/conversations"))
            .header("cookie", "polymorfa_example_session=opaque-app-session")
            .send()
            .await
            .unwrap()
            .json::<serde_json::Value>()
            .await
            .unwrap(),
        json!({"data":[],"nextCursor":null})
    );
    assert_eq!(
        client
            .post(format!("{origin}/api/polymorfa/connect"))
            .header("origin", &origin)
            .send()
            .await
            .unwrap()
            .status(),
        StatusCode::UNAUTHORIZED
    );
    let link = client
        .post(format!("{origin}/api/polymorfa/connect"))
        .header("origin", &origin)
        .header("cookie", "polymorfa_example_session=opaque-app-session")
        .json(&json!({"session":"foreign"}))
        .send()
        .await
        .unwrap();
    assert_eq!(link.status(), StatusCode::OK);
    assert_eq!(
        link.json::<serde_json::Value>().await.unwrap(),
        json!({"data":{"id":"link","url":"https://quick.example.com/link","expiresAt":null}})
    );
    upstream.await.unwrap();
    server.abort();
}
