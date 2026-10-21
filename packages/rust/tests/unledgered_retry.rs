#[allow(dead_code)]
mod support;
#[allow(dead_code)]
mod support41;
use polymorfa_sdk::{
    direct_media::{HistoryChunkDelete, HistoryChunkRetry, HistorySyncType},
    media_encrypt::UploadMediaType,
    models::{ConversationReference, SendMessageRequest},
    ClientOptions, ErrorKind, MessagingClient, RequestOptions,
};
use serde_json::json;

fn client(base: String) -> MessagingClient {
    MessagingClient::new(
        support::credential(),
        ClientOptions {
            base_url: base,
            max_network_retries: 1,
            ..Default::default()
        },
    )
    .unwrap()
}

// The held producer has no replay ledger for these four API operations.
#[tokio::test]
async fn unledgered_submissions() {
    let mut failures = Vec::new();
    for operation in ["grant", "relay", "retry", "delete"] {
        for status in [0, 429, 503] {
            for policy in ["keyed", "unkeyed", "default"] {
                let body = json!({"error":{"code":"fixture_failure","message":"unknown outcome"}})
                    .to_string();
                let row = (status, body, vec![("retry-after".into(), "0".into())]);
                let wire = support41::Wire::raw(vec![row.clone(), row]).await;
                let client = client(wire.base.clone());
                let options = RequestOptions {
                    max_network_retries: if policy == "default" { None } else { Some(1) },
                    idempotency_key: (policy == "keyed").then(|| "caller-key".into()),
                    headers: [("x-caller".into(), "retained".into())].into(),
                    ..Default::default()
                };
                let result = match operation {
                    "grant" => client
                        .whatsapp_media()
                        .create_upload_grant("s", UploadMediaType::Image, &[0; 32], options)
                        .await
                        .map(|_| ()),
                    "relay" => client
                        .whatsapp_media()
                        .relay_upload(
                            "s",
                            UploadMediaType::Image,
                            &[0; 32],
                            reqwest::Body::from(vec![0; 26]),
                            26,
                            options,
                        )
                        .await
                        .map(|_| ()),
                    "retry" => client
                        .history_sync()
                        .request_chunk_retry(
                            "s",
                            &HistoryChunkRetry {
                                sync_type: HistorySyncType::Recent,
                                chunk_order: 1,
                                chunk_message_id: None,
                                regenerate: None,
                            },
                            options,
                        )
                        .await
                        .map(|_| ()),
                    _ => {
                        client
                            .history_sync()
                            .delete_chunk(
                                "s",
                                &HistoryChunkDelete {
                                    direct_path: "/chunk".into(),
                                    file_enc_sha256: format!("{}=", "A".repeat(43)),
                                    enc_handle: None,
                                    companion_meta_nonce: None,
                                },
                                options,
                            )
                            .await
                    }
                };
                let error = result.expect_err("failure surfaced");
                let records = wire.captured();
                if records.len() != 1 {
                    failures.push(format!(
                        "{operation}/{status}/{policy}: {} submissions",
                        records.len()
                    ));
                    continue;
                }
                let headers = &records[0].headers;
                assert_eq!(headers["x-caller"], "retained");
                assert_eq!(
                    headers["authorization"],
                    format!("Bearer {}", support::credential_token())
                );
                assert_eq!(headers["polymorfa-version"], "2026-10-14");
                assert_eq!(
                    headers.get("idempotency-key").map(String::as_str),
                    if policy == "keyed" {
                        Some("caller-key")
                    } else {
                        None
                    }
                );
                if operation == "relay" {
                    assert_eq!(records[0].bytes.len(), 26);
                }
                if status == 0 {
                    assert_eq!(error.kind, ErrorKind::Connection);
                } else {
                    assert_eq!(error.code.as_deref(), Some("fixture_failure"));
                    assert_eq!(error.status, Some(status));
                    assert_eq!(error.request_id.as_deref(), Some("rust41"));
                    assert_eq!(error.metadata.as_ref().unwrap().attempts, 1);
                }
            }
        }
    }
    assert!(failures.is_empty(), "{}", failures.join("\n"));
}

#[tokio::test]
async fn established_send_and_get_retry() {
    for operation in ["send", "get"] {
        let wire = support41::Wire::raw(vec![
            (503,json!({"error":{"code":"busy"}}).to_string(),vec![("retry-after".into(),"0".into())]),
            (200,json!({"success":true,"data":{"id":"message","status":"sent","type":"text","timestamp":"now","name":"fixture","whatsapp_ids":{},"conversation":{"id":"recipient","type":"individual"}}}).to_string(),vec![]),
        ]).await;
        let client = client(wire.base.clone());
        let options = RequestOptions {
            max_network_retries: Some(1),
            idempotency_key: Some("send-key".into()),
            ..Default::default()
        };
        if operation == "send" {
            client
                .messages()
                .send(
                    "s",
                    &SendMessageRequest::text(ConversationReference::id("recipient"), "fixture"),
                    options,
                )
                .await
                .unwrap();
        } else {
            client.profile().get("s", options).await.unwrap();
        }
        assert_eq!(wire.captured().len(), 2);
    }
}
