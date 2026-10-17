#[allow(dead_code)]
mod support;
use polymorfa_sdk::{campaigns::CreateCampaignRequest, models::Query, ErrorKind, RequestOptions};
use serde_json::json;
use std::{collections::BTreeMap, time::Duration};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::TcpListener,
};

#[tokio::test]
async fn caller_header_survives_public_calls_and_network_retries() {
    for name in ["Idempotency-Key", "idempotency-key", "IDEMPOTENCY-KEY"] {
        let options = RequestOptions {
            headers: BTreeMap::from([(name.into(), "caller-fixed".into())]),
            max_network_retries: Some(1),
            ..Default::default()
        };
        replay(options.clone(), Some("caller-fixed")).await;
        assert_eq!(options.headers.len(), 1);
        assert_eq!(options.headers[name], "caller-fixed");
    }
}

#[tokio::test]
async fn aliases_explicit_precedence_generated_keys_and_valid_boundaries() {
    replay(
        RequestOptions {
            headers: BTreeMap::from([
                ("Idempotency-Key".into(), "same".into()),
                ("idempotency-key".into(), "same".into()),
            ]),
            max_network_retries: Some(1),
            ..Default::default()
        },
        Some("same"),
    )
    .await;
    replay(
        RequestOptions {
            idempotency_key: Some("explicit".into()),
            headers: BTreeMap::from([
                ("Idempotency-Key".into(), "ignored".into()),
                ("idempotency-key".into(), "different".into()),
            ]),
            max_network_retries: Some(1),
            ..Default::default()
        },
        Some("explicit"),
    )
    .await;
    replay(
        RequestOptions {
            max_network_retries: Some(1),
            ..Default::default()
        },
        None,
    )
    .await;
    for key in ["a".to_owned(), "a".repeat(255)] {
        replay(
            RequestOptions {
                idempotency_key: Some(key.clone()),
                max_network_retries: Some(1),
                ..Default::default()
            },
            Some(&key),
        )
        .await;
    }
}

#[tokio::test]
async fn invalid_and_conflicting_keys_fail_safely_before_network() {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let client = support::messaging(format!("http://{}", listener.local_addr().unwrap()));
    let body: CreateCampaignRequest = serde_json::from_value(json!({"name":"Campaign"})).unwrap();
    let mut options = Vec::new();
    for value in [
        "".into(),
        " ".into(),
        "private\r\nvalue".into(),
        "private\0value".into(),
        "private\u{7f}value".into(),
        "a".repeat(256),
        "é".repeat(128),
    ] {
        options.push(RequestOptions {
            headers: BTreeMap::from([("IDEMPOTENCY-KEY".into(), value.clone())]),
            ..Default::default()
        });
        options.push(RequestOptions {
            idempotency_key: Some(value),
            ..Default::default()
        });
    }
    options.push(RequestOptions {
        headers: BTreeMap::from([
            ("Idempotency-Key".into(), "private-first".into()),
            ("idempotency-key".into(), "private-second".into()),
        ]),
        ..Default::default()
    });
    for options in options {
        let error = client
            .campaigns()
            .create("support", &body, options)
            .await
            .unwrap_err();
        assert_eq!(error.kind, ErrorKind::Configuration);
        assert!(!format!("{error:?}").contains("private"));
    }
    assert!(
        tokio::time::timeout(Duration::from_millis(20), listener.accept())
            .await
            .is_err()
    );
}

#[tokio::test]
async fn raw_header_does_not_enable_unsafe_retries() {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let client = support::messaging(format!("http://{}", listener.local_addr().unwrap()));
    let server = tokio::spawn(async move {
        for attempt in 0..2 {
            let (mut socket, _) = listener.accept().await.unwrap();
            let mut bytes = Vec::new();
            let mut byte = [0; 1];
            while !bytes.ends_with(b"\r\n\r\n") {
                assert_eq!(socket.read(&mut byte).await.unwrap(), 1);
                bytes.push(byte[0]);
                assert!(bytes.len() < 65536);
            }
            let head = String::from_utf8(bytes).unwrap();
            let keys: Vec<_> = head
                .lines()
                .filter_map(|line| line.split_once(':'))
                .filter(|(name, _)| name.eq_ignore_ascii_case("idempotency-key"))
                .map(|(_, value)| value.trim())
                .collect();
            assert_eq!(keys, vec!["raw-caller"]);
            let (status, body) = if attempt == 0 {
                (
                    503,
                    "{\"error\":{\"code\":\"service_unavailable\",\"message\":\"retry\"}}",
                )
            } else {
                (200, "{}")
            };
            socket.write_all(format!("HTTP/1.1 {status} Fixture\r\ncontent-type: application/json\r\ncontent-length: {}\r\nretry-after: 0\r\nconnection: close\r\n\r\n{body}",body.len()).as_bytes()).await.unwrap();
        }
    });
    let options = RequestOptions {
        headers: BTreeMap::from([("Idempotency-Key".into(), "raw-caller".into())]),
        max_network_retries: Some(1),
        ..Default::default()
    };
    let run = async {
        let error = client
            .raw::<serde_json::Value>(
                reqwest::Method::POST,
                "/messaging/raw",
                &Query::new(),
                None,
                options.clone(),
            )
            .await
            .unwrap_err();
        assert_eq!(error.kind, ErrorKind::Server);
        assert_eq!(error.metadata.as_ref().unwrap().attempts, 1);
        client
            .raw::<serde_json::Value>(
                reqwest::Method::POST,
                "/messaging/raw",
                &Query::new(),
                None,
                options,
            )
            .await
            .unwrap();
        server.await.unwrap();
    };
    tokio::time::timeout(Duration::from_secs(10), run)
        .await
        .unwrap();
}

async fn replay(options: RequestOptions, expected: Option<&str>) {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let client = support::messaging(format!("http://{}", listener.local_addr().unwrap()));
    let server = tokio::spawn(async move {
        let mut keys = Vec::new();
        for attempt in 0..4 {
            let (mut socket, _) = listener.accept().await.unwrap();
            let mut bytes = Vec::new();
            let mut byte = [0; 1];
            while !bytes.ends_with(b"\r\n\r\n") {
                assert_eq!(socket.read(&mut byte).await.unwrap(), 1);
                bytes.push(byte[0]);
                assert!(bytes.len() < 65536);
            }
            let head = String::from_utf8(bytes).unwrap();
            keys.push(
                head.lines()
                    .filter_map(|line| line.split_once(':'))
                    .filter(|(name, _)| name.eq_ignore_ascii_case("idempotency-key"))
                    .map(|(_, value)| value.trim().to_owned())
                    .collect::<Vec<_>>(),
            );
            let length: usize = head
                .lines()
                .filter_map(|line| line.split_once(':'))
                .find(|(name, _)| name.eq_ignore_ascii_case("content-length"))
                .unwrap()
                .1
                .trim()
                .parse()
                .unwrap();
            let mut input = vec![0; length];
            socket.read_exact(&mut input).await.unwrap();
            assert_eq!(
                serde_json::from_slice::<serde_json::Value>(&input).unwrap(),
                json!({"name":"Campaign"})
            );
            let (status, body) = if attempt % 2 == 0 {
                (
                    503,
                    json!({"error":{"code":"service_unavailable","message":"retry"}}),
                )
            } else {
                (
                    200,
                    json!({"success":true,"data":{"id":"campaign","name":"Campaign","status":"draft","recipientCount":0,"sentCount":0,"deliveredCount":0,"readCount":0,"failedCount":0,"skippedCount":0,"createdAt":1,"updatedAt":1,"trackedLinks":[],"experimentOutcome":null,"followUp":null}}),
                )
            };
            let body = body.to_string();
            socket.write_all(format!("HTTP/1.1 {status} Fixture\r\ncontent-type: application/json\r\ncontent-length: {}\r\nretry-after: 0\r\nconnection: close\r\n\r\n{body}", body.len()).as_bytes()).await.unwrap();
        }
        keys
    });
    let run = async {
        let body: CreateCampaignRequest =
            serde_json::from_value(json!({"name":"Campaign"})).unwrap();
        for _ in 0..2 {
            client
                .campaigns()
                .create("support", &body, options.clone())
                .await
                .unwrap();
        }
        let keys = server.await.unwrap();
        for values in &keys {
            assert_eq!(
                values.len(),
                1,
                "One idempotency identity must be serialized"
            );
            if let Some(expected) = expected {
                assert_eq!(values[0], expected);
            } else {
                uuid::Uuid::parse_str(&values[0]).unwrap();
            }
        }
        if expected.is_none() {
            assert_eq!(keys[0], keys[1]);
            assert_eq!(keys[2], keys[3]);
            assert_ne!(keys[0], keys[2]);
        }
    };
    tokio::time::timeout(Duration::from_secs(10), run)
        .await
        .unwrap();
}
