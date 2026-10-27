#![cfg(feature = "storage-dynamodb")]
#[path = "support/storage_conformance.rs"]
mod storage_conformance;
use aws_sdk_dynamodb::{
    config::{retry::RetryConfig, timeout::TimeoutConfig, BehaviorVersion, Credentials, Region},
    Client,
};
use polymorfa_sdk::storage::{
    dynamodb::{DynamoStorageAdapter, DynamoStorageOptions},
    *,
};
use std::{collections::BTreeMap, sync::Arc, time::Duration};
fn client(endpoint: &str, access: String, secret: String) -> Client {
    Client::from_conf(
        aws_sdk_dynamodb::Config::builder()
            .behavior_version(BehaviorVersion::latest())
            .credentials_provider(Credentials::new(
                access,
                secret,
                None,
                None,
                "native-fixture",
            ))
            .region(Region::new("us-east-1"))
            .endpoint_url(endpoint)
            .retry_config(RetryConfig::disabled())
            .timeout_config(
                TimeoutConfig::builder()
                    .operation_timeout(Duration::from_secs(15))
                    .build(),
            )
            .build(),
    )
}
#[test]
fn namespace_table_and_read_bounds_are_validated_offline() {
    let client = client(
        "http://127.0.0.1:9",
        "synthetic-test-access".into(),
        "synthetic-test-secret".into(),
    );
    for namespace in ["", "bad/name", "bad\0"] {
        assert!(DynamoStorageAdapter::new(
            client.clone(),
            DynamoStorageOptions::new(namespace, "table")
        )
        .is_err());
    }
    for table in ["", "bad\r\n"] {
        assert!(
            DynamoStorageAdapter::new(client.clone(), DynamoStorageOptions::new("app", table))
                .is_err()
        );
    }
    let mut options = DynamoStorageOptions::new("app", "table");
    options.max_query_rows = 0;
    assert!(DynamoStorageAdapter::new(client, options).is_err());
}
#[tokio::test]
async fn actual_dynamodb_local_official_driver_full_schema2_conformance() {
    let Ok(endpoint) = std::env::var("POLYMORFA_DYNAMODB_ENDPOINT") else {
        eprintln!("SKIP actual DynamoDB Local: independent customer fixture environment required");
        return;
    };
    let client = client(
        &endpoint,
        std::env::var("POLYMORFA_DYNAMODB_ACCESS_KEY").unwrap(),
        std::env::var("POLYMORFA_DYNAMODB_SECRET_KEY").unwrap(),
    );
    let table = format!("native-rust-{}", uuid::Uuid::new_v4().simple());
    let mut options = DynamoStorageOptions::new("rust_native", &table);
    options.create_table = true;
    let adapter = Arc::new(DynamoStorageAdapter::new(client.clone(), options).unwrap());
    storage_conformance::conformance(adapter.clone()).await;
    let other = DynamoStorageAdapter::new(
        client.clone(),
        DynamoStorageOptions::new("another_customer", &table),
    )
    .unwrap();
    assert!(other
        .get(Entity::Messages, &["kscalars:json".into()])
        .await
        .unwrap()
        .is_empty());
    assert!(other
        .query(
            Entity::Messages,
            &IndexQuery {
                index: "by_chat".into(),
                equals: BTreeMap::from([
                    ("sessionId".into(), "scalars".into()),
                    ("chatId".into(), "chat".into())
                ]),
                limit: 10,
                range: None,
                order: None,
                after: None
            }
        )
        .await
        .unwrap()
        .is_empty());
    let mut options = DynamoStorageOptions::new("rust_native", &table);
    options.max_query_rows = 10;
    let bounded = DynamoStorageAdapter::new(client.clone(), options).unwrap();
    assert!(bounded
        .query(
            Entity::Messages,
            &IndexQuery {
                index: "by_chat".into(),
                equals: BTreeMap::from([
                    ("sessionId".into(), "scalars".into()),
                    ("chatId".into(), "chat".into())
                ]),
                limit: 1,
                range: None,
                order: None,
                after: None
            }
        )
        .await
        .is_err());
    let invalid = DynamoStorageAdapter::new(
        client.clone(),
        DynamoStorageOptions::new("safe", "nonexistent-native-fixture-table"),
    )
    .unwrap();
    let error = invalid
        .get(Entity::Messages, &["kmissing:id".into()])
        .await
        .err()
        .unwrap();
    assert!(!error.to_string().contains(&endpoint));
    assert!(!format!("{error:?}").contains("Credential"));
    client
        .delete_table()
        .table_name(&table)
        .send()
        .await
        .unwrap();
    println!("PASS actual DynamoDB Local/official Rust driver: all17entities/JSON scalars, conditional transaction rollback, 2000 history, replay/checkpoint, real expired-writer fence, consistent pagination, namespace isolation/read bounds and redacted provider errors");
}

#[tokio::test]
async fn native_aws_wire_rejects_foreign_duplicate_corrupt_and_nonprogressing_rows() {
    use serde_json::json;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    for mode in [
        "namespace",
        "identity",
        "number",
        "duplicate",
        "unprocessed",
        "cursor",
    ] {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let url = format!("http://{}", listener.local_addr().unwrap());
        let mut item = json!({"pk":{"S":"app:messages"},"sk":{"S":"ks:m"},"row":{"M":{"_id":{"S":"ks:m"},"_rev":{"N":"1"},"_v":{"M":{}},"sessionId":{"S":"s"},"messageId":{"S":"m"}}}});
        match mode {
            "namespace" => item["pk"]["S"] = json!("foreign:messages"),
            "identity" => item["row"]["M"]["_id"]["S"] = json!("ks:other"),
            "number" => item["row"]["M"]["_rev"]["N"] = json!("true"),
            _ => {}
        }
        let response=match mode{"duplicate"=>json!({"Responses":{"table":[item.clone(),item]}}),"unprocessed"=>json!({"UnprocessedKeys":{"foreign-table":{"Keys":[{"pk":{"S":"app:messages"},"sk":{"S":"ks:m"}}]}}}),"cursor"=>json!({"Items":[],"LastEvaluatedKey":{"pk":{"S":"app:messages"},"sk":{"S":"ks:m"}}}),_=>json!({"Responses":{"table":[item]}})}.to_string();
        let task = tokio::spawn(async move {
            let (mut socket, _) = listener.accept().await.unwrap();
            let mut raw = Vec::new();
            let mut buffer = [0; 4096];
            let (end, length) = loop {
                let n = socket.read(&mut buffer).await.unwrap();
                assert!(n > 0);
                raw.extend_from_slice(&buffer[..n]);
                if let Some(end) = raw.windows(4).position(|w| w == b"\r\n\r\n") {
                    let head = String::from_utf8_lossy(&raw[..end]).to_ascii_lowercase();
                    assert!(head.contains("authorization: aws4-hmac-sha256"));
                    assert!(
                        !head.contains("pmfa_")
                            && !head.contains("cookie:")
                            && !head.contains("origin:")
                            && !head.contains("polymorfa-version:")
                    );
                    let length = head
                        .lines()
                        .find_map(|line| {
                            line.strip_prefix("content-length:")
                                .map(|value| value.trim().parse::<usize>().unwrap())
                        })
                        .unwrap();
                    break (end + 4, length);
                }
            };
            while raw.len() < end + length {
                let n = socket.read(&mut buffer).await.unwrap();
                assert!(n > 0);
                raw.extend_from_slice(&buffer[..n]);
            }
            socket.write_all(format!("HTTP/1.1 200 OK\r\nContent-Type: application/x-amz-json-1.0\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{response}",response.len()).as_bytes()).await.unwrap();
            drop(socket);
            assert!(
                tokio::time::timeout(Duration::from_millis(150), listener.accept())
                    .await
                    .is_err(),
                "Invalid DynamoDB response triggered another provider request"
            );
        });
        let client = client(
            &url,
            "synthetic-test-access".into(),
            "synthetic-test-secret".into(),
        );
        let adapter =
            DynamoStorageAdapter::new(client, DynamoStorageOptions::new("app", "table")).unwrap();
        let failed = if mode == "cursor" {
            adapter
                .query(
                    Entity::Messages,
                    &IndexQuery {
                        index: "by_chat".into(),
                        equals: BTreeMap::from([
                            ("sessionId".into(), "s".into()),
                            ("chatId".into(), "chat".into()),
                        ]),
                        limit: 1,
                        range: None,
                        order: None,
                        after: None,
                    },
                )
                .await
                .is_err()
        } else {
            adapter
                .get(Entity::Messages, &["ks:m".into()])
                .await
                .is_err()
        };
        assert!(failed, "Corrupt DynamoDB response was accepted: {mode}");
        task.await.unwrap();
    }
}
