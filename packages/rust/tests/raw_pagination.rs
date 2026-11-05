#[allow(dead_code)]
mod support;
use futures_util::StreamExt;
use polymorfa_sdk::{
    cloud_graph::graph_transport_headers,
    models::MessageTransport,
    raw::{DecodedRawPage, RawRequest},
    ClientOptions, Error, ErrorKind, OrganizationClient, ProjectClient, RequestOptions,
};
use reqwest::Method;
use serde_json::{json, Value};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::TcpListener,
};

fn decode(
    value: &Value,
    metadata: &polymorfa_sdk::ResponseMetadata,
) -> polymorfa_sdk::Result<DecodedRawPage<u64>> {
    assert!(matches!(
        metadata.request_id.as_deref(),
        Some("raw-page" | "wire_fixture")
    ));
    Ok(DecodedRawPage {
        items: value["records"]
            .as_array()
            .ok_or_else(|| Error::new(ErrorKind::Server, "Invalid records", "invalid_response"))?
            .iter()
            .map(|r| r["n"].as_u64().unwrap())
            .collect(),
        next_cursor: value["resume"].as_str().map(String::from),
    })
}
async fn raw_server(prefix: &str) -> (String, tokio::task::JoinHandle<()>) {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let base = format!("http://{}", listener.local_addr().unwrap());
    let prefix = prefix.to_owned();
    let handle = tokio::spawn(async move {
        for (position, records, resume) in [
            ("seed", json!([]), Some("next /+")),
            ("next+%2F%2B", json!([{"n":1},{"n":2}]), Some("last")),
            ("last", json!([{"n":3}]), None),
        ] {
            let (mut socket, _) = listener.accept().await.unwrap();
            let mut header = Vec::new();
            let mut one = [0; 1];
            while !header.ends_with(b"\r\n\r\n") {
                socket.read_exact(&mut one).await.unwrap();
                header.push(one[0]);
                assert!(header.len() < 65536);
            }
            let header = String::from_utf8(header).unwrap();
            assert!(header.starts_with(&format!(
                "POST {prefix}/raw?filter=keep&position={position} HTTP/1.1\r\n"
            )));
            assert!(header
                .to_lowercase()
                .contains("idempotency-key: raw-key\r\n"));
            assert!(header.to_lowercase().contains("x-custom: retained\r\n"));
            let length = header
                .lines()
                .find_map(|line| {
                    line.to_lowercase()
                        .strip_prefix("content-length: ")
                        .map(|v| v.parse::<usize>().unwrap())
                })
                .unwrap();
            let mut body = vec![0; length];
            socket.read_exact(&mut body).await.unwrap();
            assert_eq!(
                serde_json::from_slice::<Value>(&body).unwrap(),
                json!({"scope":"fixture"})
            );
            let response =
                json!({"records":records,"resume":resume,"custom":{"preserved":true}}).to_string();
            socket.write_all(format!("HTTP/1.1 200 OK\r\ncontent-type: application/json\r\nx-request-id: raw-page\r\nconnection: close\r\ncontent-length: {}\r\n\r\n{}",response.len(),response).as_bytes()).await.unwrap();
        }
    });
    (base, handle)
}
fn request(path: &str) -> RawRequest {
    RawRequest {
        method: Method::POST,
        path: path.into(),
        query: [
            ("filter".into(), "keep".into()),
            ("position".into(), "seed".into()),
        ]
        .into(),
        body: Some(json!({"scope":"fixture"})),
        options: RequestOptions {
            idempotency_key: Some("raw-key".into()),
            headers: [("x-custom".into(), "retained".into())].into(),
            ..Default::default()
        },
    }
}
#[tokio::test]
async fn organization_raw_custom_decoder_cursor_body_headers_and_empty_page_iteration() {
    let (base, server) = raw_server("/platform").await;
    let client = support::organization(base);
    let page = client
        .raw_paginate(request("/platform/raw"), decode, Some("position"))
        .await
        .unwrap();
    assert!(page.items.is_empty());
    assert!(page.has_more());
    assert_eq!(page.response.data["custom"]["preserved"], true);
    let stream = page.into_stream();
    tokio::pin!(stream);
    let mut rows = Vec::new();
    while let Some(row) = stream.next().await {
        rows.push(row.unwrap());
    }
    assert_eq!(rows, vec![1, 2, 3]);
    server.await.unwrap();
}
#[tokio::test]
async fn messaging_raw_and_bound_project_raw_preserve_paging_request() {
    let (base, server) = raw_server("/messaging").await;
    let client = support::messaging(base);
    let page = client
        .raw_paginate(request("/messaging/raw"), decode, Some("position"))
        .await
        .unwrap();
    let next = page.next_page().await.unwrap().unwrap();
    assert_eq!(next.items, vec![1, 2]);
    let last = next.next_page().await.unwrap().unwrap();
    assert!(last.next_page().await.unwrap().is_none());
    server.await.unwrap();
    let (base, server) = raw_server("/platform/projects/project").await;
    let client = ProjectClient::new(
        support::credential(),
        "project",
        ClientOptions {
            base_url: base,
            ..Default::default()
        },
    )
    .unwrap();
    let page = client
        .raw_paginate(request("/raw"), decode, Some("position"))
        .await
        .unwrap();
    let next = page.next_page().await.unwrap().unwrap();
    let last = next.next_page().await.unwrap().unwrap();
    assert_eq!(last.items, vec![3]);
    server.await.unwrap();
}
#[tokio::test]
async fn project_raw_rejects_escape_and_authorization_override_before_any_request() {
    let client = ProjectClient::new(
        support::credential(),
        "project",
        ClientOptions {
            base_url: "http://127.0.0.1:1".into(),
            ..Default::default()
        },
    )
    .unwrap();
    for path in [
        "/platform/projects/other/raw",
        "/../raw",
        "/%2e%2e/raw",
        "//other/raw",
        "https://other/raw",
        "/platform/%70rojects/other/raw",
    ] {
        assert!(client
            .raw_paginate(request(path), decode, None)
            .await
            .is_err());
    }
    let mut r = request("/raw");
    r.options
        .headers
        .insert("Authorization".into(), "Bearer replacement".into());
    assert!(client.raw_paginate(r, decode, None).await.is_err());
}
#[tokio::test]
async fn raw_decoder_errors_and_cancelled_next_page_are_preserved() {
    let response = json!({"wrong":true});
    let (base, server) = support::wire("GET", "/raw", None, response).await;
    let client = support::messaging(base);
    let error = client
        .raw_paginate(RawRequest::get("/raw"), decode, None)
        .await
        .err()
        .unwrap();
    assert_eq!(error.code.as_deref(), Some("invalid_response"));
    server.await.unwrap();
    let response = json!({"records":[],"resume":"next"});
    let (base, server) = support::wire("GET", "/raw", None, response).await;
    let client = OrganizationClient::new(
        support::credential(),
        ClientOptions {
            base_url: base,
            ..Default::default()
        },
    )
    .unwrap();
    let cancellation = tokio_util::sync::CancellationToken::new();
    let mut r = RawRequest::get("/raw");
    r.options.cancellation = Some(cancellation.clone());
    let page = client
        .raw_paginate(
            r,
            |v, _| {
                Ok(DecodedRawPage::<u64> {
                    items: vec![],
                    next_cursor: v["resume"].as_str().map(String::from),
                })
            },
            None,
        )
        .await
        .unwrap();
    server.await.unwrap();
    cancellation.cancel();
    assert_eq!(
        page.next_page().await.err().unwrap().kind,
        ErrorKind::Cancelled
    );
}
#[test]
fn graph_transport_headers_match_all_typed_route_choices() {
    for (transport, value) in [
        (MessageTransport::Auto, "auto"),
        (MessageTransport::LinkedDevices, "linked_devices"),
        (MessageTransport::OfficialApi, "official_api"),
    ] {
        assert_eq!(
            graph_transport_headers(transport),
            [("X-Polymorfa-Transport".into(), value.into())].into()
        );
    }
}
