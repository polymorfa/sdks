#[allow(
    dead_code,
    reason = "shared integration-test support; this target uses only part of it"
)]
mod support;
use polymorfa_sdk::{passkeys::*, RequestOptions};
use serde_json::{json, Value};
fn fixture() -> Value {
    serde_json::from_str(include_str!(
        "../../../contracts/fixtures/passkeys.candidate.json"
    ))
    .unwrap()
}
#[tokio::test]
async fn five_public_operations() {
    let f = fixture();
    let cases = [
        (
            "POST",
            "/challenge",
            Some(f["issue"].clone()),
            f["ticket"].clone(),
        ),
        ("GET", "/challenge/ticket%2F%3F", None, f["ticket"].clone()),
        (
            "POST",
            "/assertion",
            Some(f["assertion"].clone()),
            f["assertionResult"].clone(),
        ),
        (
            "GET",
            "/confirmation",
            None,
            json!({"status":"code_available","code":"ABCD-EF12","skipHandoffUX":false}),
        ),
        (
            "POST",
            "/confirmation",
            Some(f["confirm"].clone()),
            json!({"status":"waiting_for_pairing"}),
        ),
    ];
    for (i, (method, suffix, body, data)) in cases.into_iter().enumerate() {
        let reply = json!({"success":true,"data":data});
        let (base, server) = support::wire(
            method,
            &format!("/messaging/desk%2F1/passkey{suffix}"),
            body.clone(),
            reply.clone(),
        )
        .await;
        let c = support::messaging(base);
        let r = c.passkeys();
        let actual = match i {
            0 => serde_json::to_value(
                r.issue_challenge(
                    "desk/1",
                    &serde_json::from_value(body.unwrap()).unwrap(),
                    RequestOptions::default(),
                )
                .await
                .unwrap()
                .data,
            )
            .unwrap(),
            1 => serde_json::to_value(
                r.get_challenge("desk/1", "ticket/?", RequestOptions::default())
                    .await
                    .unwrap()
                    .data,
            )
            .unwrap(),
            2 => serde_json::to_value(
                r.submit_assertion(
                    "desk/1",
                    &serde_json::from_value(body.unwrap()).unwrap(),
                    RequestOptions::default(),
                )
                .await
                .unwrap()
                .data,
            )
            .unwrap(),
            3 => serde_json::to_value(
                r.get_confirmation("desk/1", RequestOptions::default())
                    .await
                    .unwrap()
                    .data,
            )
            .unwrap(),
            _ => serde_json::to_value(
                r.confirm(
                    "desk/1",
                    &serde_json::from_value(body.unwrap()).unwrap(),
                    RequestOptions::default(),
                )
                .await
                .unwrap()
                .data,
            )
            .unwrap(),
        };
        assert_eq!(actual, reply);
        server.await.unwrap();
    }
}
#[tokio::test]
async fn outcomes_and_write_retry_override() {
    let f = fixture();
    for status in f["statuses"].as_array().unwrap() {
        let reply = json!({"success":true,"data":{"status":status}});
        let (base, server) = support::wire(
            "GET",
            "/messaging/desk/passkey/confirmation",
            None,
            reply.clone(),
        )
        .await;
        let c = support::messaging(base);
        assert_eq!(
            serde_json::to_value(
                c.passkeys()
                    .get_confirmation("desk", RequestOptions::default())
                    .await
                    .unwrap()
                    .data
            )
            .unwrap(),
            reply
        );
        server.await.unwrap();
    }
    for (i, suffix) in ["challenge", "assertion", "confirmation"]
        .iter()
        .enumerate()
    {
        let key = ["issue", "assertion", "confirm"][i];
        let (base, server) = support::wire_status(
            503,
            "POST",
            &format!("/messaging/desk/passkey/{suffix}"),
            Some(f[key].clone()),
            json!({"error":{"code":"future_passkey","message":"refused"}}),
        )
        .await;
        let c = support::messaging(base);
        let o = RequestOptions {
            max_network_retries: Some(3),
            idempotency_key: Some("caller-key".into()),
            ..Default::default()
        };
        let r = c.passkeys();
        let err = match i {
            0 => r
                .issue_challenge("desk", &serde_json::from_value(f[key].clone()).unwrap(), o)
                .await
                .err()
                .unwrap(),
            1 => r
                .submit_assertion("desk", &serde_json::from_value(f[key].clone()).unwrap(), o)
                .await
                .err()
                .unwrap(),
            _ => r
                .confirm("desk", &serde_json::from_value(f[key].clone()).unwrap(), o)
                .await
                .err()
                .unwrap(),
        };
        assert_eq!(err.code.as_deref(), Some("future_passkey"));
        server.await.unwrap();
    }
    let c = support::messaging("http://127.0.0.1:1".into());
    let mut bad: SubmitPasskeyAssertion = serde_json::from_value(f["assertion"].clone()).unwrap();
    bad.assertion.id = "a".repeat(1365);
    assert!(c
        .passkeys()
        .submit_assertion("desk", &bad, RequestOptions::default())
        .await
        .is_err());
}

#[tokio::test]
async fn refusal_statuses_and_optional_serialization() {
    let f = fixture();
    for status in f["errors"].as_array().unwrap() {
        let status = status.as_u64().unwrap() as u16;
        let (base, server) = support::wire_status(
            status,
            "POST",
            "/messaging/desk/passkey/confirmation",
            Some(f["confirm"].clone()),
            json!({"error":{"code":"future_passkey","message":"refused"}}),
        )
        .await;
        let c = support::messaging(base);
        let err = c
            .passkeys()
            .confirm(
                "desk",
                &serde_json::from_value(f["confirm"].clone()).unwrap(),
                RequestOptions {
                    max_network_retries: Some(3),
                    idempotency_key: Some("caller".into()),
                    ..Default::default()
                },
            )
            .await
            .err()
            .unwrap();
        assert_eq!(err.status, Some(status));
        assert_eq!(err.code.as_deref(), Some("future_passkey"));
        server.await.unwrap();
    }
    assert_eq!(
        serde_json::to_value(IssuePasskeyChallenge::default()).unwrap(),
        json!({})
    );
    assert_eq!(
        serde_json::to_value(ConfirmPasskey {
            ticket_id: "t".into(),
            code: None
        })
        .unwrap(),
        json!({"ticketId":"t"})
    );
    let mut max: SubmitPasskeyAssertion = serde_json::from_value(f["assertion"].clone()).unwrap();
    max.assertion.id = "x".repeat(1364);
    max.assertion.raw_id_b64_url = "x".repeat(1364);
    max.assertion.response.user_handle_b64 = Some("x".repeat(86));
    let body = serde_json::to_value(&max).unwrap();
    let (base, server) = support::wire(
        "POST",
        "/messaging/s/passkey/assertion",
        Some(body),
        json!({"success":true,"data":f["assertionResult"]}),
    )
    .await;
    let c = support::messaging(base);
    c.passkeys()
        .submit_assertion("s", &max, RequestOptions::default())
        .await
        .unwrap();
    server.await.unwrap();
    max.assertion.response.signature_b64 = "x".repeat(1048576);
    assert!(c
        .passkeys()
        .submit_assertion("s", &max, RequestOptions::default())
        .await
        .is_err());
}

#[tokio::test]
async fn uncertain_upload_and_non_json_do_not_repeat() {
    use std::sync::{
        atomic::{AtomicUsize, Ordering},
        Arc,
    };
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    let f = fixture();
    for non_json in [false, true] {
        for i in 0..3 {
            let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
            let base = format!("http://{}", listener.local_addr().unwrap());
            let count = Arc::new(AtomicUsize::new(0));
            let seen = count.clone();
            let server = tokio::spawn(async move {
                while let Ok((mut socket, _)) = listener.accept().await {
                    let mut bytes = Vec::new();
                    let mut buf = [0u8; 4096];
                    let (end, length) = loop {
                        let n = socket.read(&mut buf).await.unwrap();
                        if n == 0 {
                            return;
                        }
                        bytes.extend_from_slice(&buf[..n]);
                        if let Some(end) = bytes.windows(4).position(|w| w == b"\r\n\r\n") {
                            let h = String::from_utf8_lossy(&bytes[..end]);
                            let length = h
                                .lines()
                                .find_map(|l| {
                                    l.to_ascii_lowercase()
                                        .strip_prefix("content-length:")
                                        .and_then(|s| s.trim().parse::<usize>().ok())
                                })
                                .unwrap_or(0);
                            break (end + 4, length);
                        }
                    };
                    while bytes.len() < end + length {
                        let n = socket.read(&mut buf).await.unwrap();
                        if n == 0 {
                            break;
                        }
                        bytes.extend_from_slice(&buf[..n]);
                    }
                    seen.fetch_add(1, Ordering::SeqCst);
                    if non_json {
                        let body = "<html>unavailable</html>";
                        let _=socket.write_all(format!("HTTP/1.1 502 Bad Gateway\r\ncontent-type: text/html\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{body}",body.len()).as_bytes()).await;
                    }
                }
            });
            let c = support::messaging(base);
            let r = c.passkeys();
            let o = RequestOptions {
                max_network_retries: Some(3),
                idempotency_key: Some("caller".into()),
                ..Default::default()
            };
            let err = match i {
                0 => r
                    .issue_challenge("s", &serde_json::from_value(f["issue"].clone()).unwrap(), o)
                    .await
                    .err(),
                1 => r
                    .submit_assertion(
                        "s",
                        &serde_json::from_value(f["assertion"].clone()).unwrap(),
                        o,
                    )
                    .await
                    .err(),
                _ => r
                    .confirm(
                        "s",
                        &serde_json::from_value(f["confirm"].clone()).unwrap(),
                        o,
                    )
                    .await
                    .err(),
            };
            server.abort();
            let _ = server.await;
            assert!(err.is_some());
            assert_eq!(count.load(Ordering::SeqCst), 1);
        }
    }
}
