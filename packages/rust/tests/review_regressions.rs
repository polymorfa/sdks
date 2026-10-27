#[allow(dead_code)]
mod support;
use futures_util::StreamExt as _;
use polymorfa_sdk::{
    calls::PlaceCallRequest, ClientOptions, Credential, ErrorKind, MessagingClient,
    OrganizationClient, RequestOptions,
};
use serde_json::json;
use std::time::Duration;
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::TcpListener,
};
#[test]
fn specialized_secrets_cannot_impersonate_organization_keys_even_when_padded() {
    for prefix in [
        "pmfa_pt_",
        "pmfa_ct_",
        "pmfa_ls_",
        "pmfa_at_",
        "pmfa_wst_",
        "pmfa_sd_",
    ] {
        let value = format!("{}{}", prefix, "a".repeat(77 - prefix.len()));
        assert!(Credential::organization_api_key(value.clone()).is_err());
        assert!(OrganizationClient::new(
            Credential::OrganizationApiKey(value),
            ClientOptions::default()
        )
        .is_err());
    }
    assert!(
        Credential::organization_api_key("pmfa_AAECAwQFBgcICQoLDA0ODxAREhM73f-k".to_string())
            .is_ok()
    );
}
#[tokio::test]
async fn download_stream_deadline_covers_a_body_that_stalls_after_headers() {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let base = format!("http://{}", listener.local_addr().unwrap());
    let server = tokio::spawn(async move {
        let (mut socket, _) = listener.accept().await.unwrap();
        let mut request = Vec::new();
        let mut one = [0];
        while !request.ends_with(b"\r\n\r\n") {
            socket.read_exact(&mut one).await.unwrap();
            request.push(one[0]);
        }
        socket.write_all(b"HTTP/1.1 200 OK\r\ncontent-type: application/octet-stream\r\ncontent-length: 100\r\nconnection: close\r\n\r\n").await.unwrap();
        tokio::time::sleep(Duration::from_secs(5)).await;
    });
    let mut download = support::messaging(base)
        .media()
        .download_stream(
            "m",
            RequestOptions {
                timeout: Some(Duration::from_millis(50)),
                ..Default::default()
            },
        )
        .await
        .unwrap();
    let error = tokio::time::timeout(Duration::from_secs(1), download.body.next())
        .await
        .unwrap()
        .unwrap()
        .unwrap_err();
    assert_eq!(error.kind, ErrorKind::Timeout);
    assert_eq!(error.code.as_deref(), Some("request_timeout"));
    server.abort();
}
#[tokio::test]
async fn participant_group_and_client_calls_need_no_dummy_fields_and_preserve_video_default() {
    for (body, wire) in [
        (
            PlaceCallRequest {
                session: Some("s".into()),
                participants: Some(vec!["+15551234567".into(), "+15551234568".into()]),
                ..Default::default()
            },
            json!({"session":"s","participants":["+15551234567","+15551234568"]}),
        ),
        (
            PlaceCallRequest {
                session: Some("s".into()),
                group_id: Some("123@g.us".into()),
                ..Default::default()
            },
            json!({"session":"s","groupId":"123@g.us"}),
        ),
    ] {
        let (base, server) = support::wire(
            "POST",
            "/messaging/voip/calls",
            Some(wire),
            json!({"data":{"callId":"call"}}),
        )
        .await;
        support::messaging(base)
            .calls()
            .place(
                &body,
                RequestOptions {
                    idempotency_key: Some("once".into()),
                    ..Default::default()
                },
            )
            .await
            .unwrap();
        server.await.unwrap();
    }
    let (base, server) = support::wire_authorization(
        "POST",
        "/messaging/voip/calls",
        Some(json!({"to":"+15551234567"})),
        json!({"data":{"callId":"call"}}),
        Some("pmfa_ct_Zml4dHVyZQ".into()),
    )
    .await;
    let client = MessagingClient::new(
        Credential::client_token("pmfa_ct_Zml4dHVyZQ").unwrap(),
        ClientOptions {
            base_url: base,
            max_network_retries: 0,
            ..Default::default()
        },
    )
    .unwrap();
    client
        .calls()
        .place(
            &PlaceCallRequest {
                to: Some("+15551234567".into()),
                ..Default::default()
            },
            RequestOptions {
                idempotency_key: Some("once".into()),
                ..Default::default()
            },
        )
        .await
        .unwrap();
    server.await.unwrap();
}
