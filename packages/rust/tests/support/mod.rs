use polymorfa_sdk::{ClientOptions, Credential, MessagingClient, OrganizationClient};
use serde_json::Value;
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::TcpListener,
    task::JoinHandle,
};

pub fn credential() -> Credential {
    Credential::organization_api_key(format!("pmfa_{}", "a".repeat(72))).unwrap()
}
pub fn messaging(base: String) -> MessagingClient {
    MessagingClient::new(
        credential(),
        ClientOptions {
            base_url: base,
            max_network_retries: 0,
            ..ClientOptions::default()
        },
    )
    .unwrap()
}
pub fn organization(base: String) -> OrganizationClient {
    OrganizationClient::new(
        credential(),
        ClientOptions {
            base_url: base,
            max_network_retries: 0,
            ..ClientOptions::default()
        },
    )
    .unwrap()
}

pub async fn wire(
    method: &str,
    path: &str,
    body: Option<Value>,
    response: Value,
) -> (String, JoinHandle<()>) {
    wire_authorization(
        method,
        path,
        body,
        response,
        Some(format!("pmfa_{}", "a".repeat(72))),
    )
    .await
}

pub async fn wire_authorization(
    method: &str,
    path: &str,
    body: Option<Value>,
    response: Value,
    authorization: Option<String>,
) -> (String, JoinHandle<()>) {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = format!("http://{}", listener.local_addr().unwrap());
    let method = method.to_owned();
    let path = path.to_owned();
    let handle = tokio::spawn(async move {
        let (mut socket, _) = listener.accept().await.unwrap();
        let mut request = Vec::new();
        let mut buffer = [0u8; 4096];
        let (head_end, content_length) = loop {
            let read = socket.read(&mut buffer).await.unwrap();
            assert_ne!(read, 0, "request closed before headers");
            request.extend_from_slice(&buffer[..read]);
            if let Some(end) = request.windows(4).position(|w| w == b"\r\n\r\n") {
                let head = String::from_utf8_lossy(&request[..end]);
                let length = head
                    .lines()
                    .find_map(|line| {
                        line.to_ascii_lowercase()
                            .strip_prefix("content-length:")
                            .and_then(|v| v.trim().parse::<usize>().ok())
                    })
                    .unwrap_or(0);
                break (end + 4, length);
            }
        };
        while request.len() < head_end + content_length {
            let read = socket.read(&mut buffer).await.unwrap();
            assert_ne!(read, 0);
            request.extend_from_slice(&buffer[..read]);
        }
        let encoded = response.to_string();
        socket.write_all(format!("HTTP/1.1 200 OK\r\ncontent-type: application/json\r\nx-request-id: wire_fixture\r\npolymorfa-version: 2026-09-22\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{encoded}",encoded.len()).as_bytes()).await.unwrap();
        let head = String::from_utf8_lossy(&request[..head_end]).to_string();
        assert_eq!(
            head.lines().next().unwrap(),
            format!("{method} {path} HTTP/1.1")
        );
        match authorization {
            Some(token) => assert!(head.to_ascii_lowercase().contains(&format!(
                "authorization: bearer {}",
                token.to_ascii_lowercase()
            ))),
            None => assert!(!head.to_ascii_lowercase().contains("authorization:")),
        }
        assert!(head
            .to_ascii_lowercase()
            .contains("polymorfa-version: 2026-09-22"));
        assert!(head
            .to_ascii_lowercase()
            .contains("user-agent: polymorfa-rust/"));
        match body {
            Some(body) => assert_eq!(
                serde_json::from_slice::<Value>(&request[head_end..head_end + content_length])
                    .unwrap(),
                body
            ),
            None => assert_eq!(content_length, 0),
        }
    });
    (url, handle)
}

pub fn assert_subset(expected: &Value, actual: &Value) {
    match expected {
        Value::Object(fields) => {
            for (key, value) in fields {
                assert_subset(value, &actual[key]);
            }
        }
        Value::Array(items) => {
            assert_eq!(actual.as_array().unwrap().len(), items.len());
            for (expected, actual) in items.iter().zip(actual.as_array().unwrap()) {
                assert_subset(expected, actual);
            }
        }
        _ => assert_eq!(expected, actual),
    }
}

#[macro_export]
macro_rules! wire_messaging {
    ($client:ident,$method:expr,$path:expr,$body:expr,$response:expr,$call:expr) => {{
        let expected = $response;
        let (base, server) = $crate::support::wire($method, $path, $body, expected.clone()).await;
        let $client = $crate::support::messaging(base);
        let response = $call.await.unwrap();
        assert_eq!(
            response.metadata.request_id.as_deref(),
            Some("wire_fixture")
        );
        $crate::support::assert_subset(&expected, &serde_json::to_value(response.data).unwrap());
        server.await.unwrap();
    }};
}
#[macro_export]
macro_rules! wire_organization {
    ($client:ident,$method:expr,$path:expr,$body:expr,$response:expr,$call:expr) => {{
        let expected = $response;
        let (base, server) = $crate::support::wire($method, $path, $body, expected.clone()).await;
        let $client = $crate::support::organization(base);
        let response = $call.await.unwrap();
        assert_eq!(
            response.metadata.request_id.as_deref(),
            Some("wire_fixture")
        );
        $crate::support::assert_subset(&expected, &serde_json::to_value(response.data).unwrap());
        server.await.unwrap();
    }};
}
