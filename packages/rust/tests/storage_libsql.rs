#![cfg(feature = "storage-libsql")]
#[path = "support/storage_conformance.rs"]
mod storage_conformance;
use polymorfa_sdk::storage::{
    libsql::{schema_statements, LibsqlStorageAdapter, LibsqlStorageOptions},
    merge::empty_row,
    *,
};
use std::sync::Arc;
use tokio::io::{AsyncReadExt, AsyncWriteExt};

async fn connection(url: String, token: String) -> ::libsql::Connection {
    ::libsql::Builder::new_remote(url, token)
        .build()
        .await
        .unwrap()
        .connect()
        .unwrap()
}
fn options() -> LibsqlStorageOptions {
    LibsqlStorageOptions {
        table_prefix: format!("rs_libsql_{}_", uuid::Uuid::new_v4().simple()),
        ..Default::default()
    }
}
fn row(id: &str) -> StoredRow {
    let mut row = empty_row(
        Entity::Messages,
        &RowKey::from([
            ("sessionId".into(), "native-libsql".into()),
            ("messageId".into(), id.into()),
        ]),
    )
    .unwrap();
    row.revision = 1;
    row
}
fn put(row: StoredRow, expected_revision: Option<u64>) -> RowWrite {
    RowWrite::Put {
        entity: Entity::Messages,
        row,
        expected_revision,
    }
}
#[test]
fn schema2_identifiers_and_seventeen_entities() {
    let sql = schema_statements(&LibsqlStorageOptions::default())
        .unwrap()
        .join("\n");
    assert_eq!(sql.matches("CREATE TABLE IF NOT EXISTS").count(), 18);
    assert!(sql.contains("leases") && sql.contains("storage_schema"));
    for prefix in ["bad; DROP TABLE x", "", "bad-name", &"a".repeat(65)] {
        assert!(schema_statements(&LibsqlStorageOptions {
            table_prefix: prefix.into(),
            ..Default::default()
        })
        .is_err());
    }
}
#[tokio::test]
async fn native_remote_libsql_schema2_conformance_and_rollback() {
    let Ok(url) = std::env::var("POLYMORFA_STORAGE_LIBSQL_URL") else {
        return;
    };
    let token = std::env::var("POLYMORFA_STORAGE_LIBSQL_TOKEN").unwrap_or_default();
    let opts = options();
    let conn = connection(url.clone(), token.clone()).await;
    let adapter = Arc::new(LibsqlStorageAdapter::new(conn.clone(), opts.clone()).unwrap());
    storage_conformance::conformance(adapter.clone()).await;

    // A late duplicate insert must roll back a prior successful insert.
    let existing = row("duplicate");
    assert!(
        adapter
            .commit(&[put(existing.clone(), None)])
            .await
            .unwrap()
            .ok
    );
    let first = row("rolled-back");
    let result = adapter
        .commit(&[put(first.clone(), None), put(existing.clone(), None)])
        .await
        .unwrap();
    assert!(!result.ok);
    assert!(adapter
        .get(Entity::Messages, std::slice::from_ref(&first.id))
        .await
        .unwrap()
        .is_empty());

    // Independently connected native clients race on the same expected revision.
    let other =
        Arc::new(LibsqlStorageAdapter::new(connection(url, token).await, opts.clone()).unwrap());
    let mut update = existing.clone();
    update.revision = 2;
    let a = [put(update.clone(), Some(1))];
    let b = [put(update, Some(1))];
    let (a, b) = tokio::join!(adapter.commit(&a), other.commit(&b));
    assert_ne!(a.unwrap().ok, b.unwrap().ok);

    // A provider error after one mutation also rolls back, and stays sanitized.
    let bad_table = format!("{}contacts", opts.table_prefix);
    conn.execute(&format!("DROP TABLE \"{bad_table}\""), ())
        .await
        .unwrap();
    let contact = empty_row(
        Entity::Contacts,
        &RowKey::from([
            ("sessionId".into(), "native-libsql".into()),
            ("contactId".into(), "private-row".into()),
        ]),
    )
    .unwrap();
    let mut contact = contact;
    contact.revision = 1;
    let error = adapter
        .commit(&[
            put(first.clone(), None),
            RowWrite::Put {
                entity: Entity::Contacts,
                row: contact,
                expected_revision: None,
            },
        ])
        .await
        .err()
        .unwrap();
    assert!(!error.to_string().contains(&bad_table));
    assert!(!error.to_string().contains("private-row"));
    assert!(adapter
        .get(Entity::Messages, &[first.id])
        .await
        .unwrap()
        .is_empty());
}
#[tokio::test]
async fn native_wire_customer_credentials_and_redacted_html_failure() {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = format!("http://{}", listener.local_addr().unwrap());
    let server = tokio::spawn(async move {
        let (mut socket, _) = listener.accept().await.unwrap();
        let mut request = Vec::new();
        loop {
            let mut bytes = [0; 8192];
            let n = socket.read(&mut bytes).await.unwrap();
            request.extend_from_slice(&bytes[..n]);
            if n == 0 || request.windows(4).any(|w| w == b"\r\n\r\n") {
                break;
            }
        }
        let text = String::from_utf8(request).unwrap();
        assert!(text
            .to_lowercase()
            .contains("authorization: bearer independent-customer-token"));
        assert!(!text.contains("polymorfa-api-key"));
        let body = "<html>private-endpoint independent-customer-token private-row</html>";
        socket.write_all(format!("HTTP/1.1 502 Bad Gateway\r\nContent-Type: text/html\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len()).as_bytes()).await.unwrap();
    });
    let adapter = LibsqlStorageAdapter::new(
        connection(url, "independent-customer-token".into()).await,
        options(),
    )
    .unwrap();
    let error = adapter.setup().await.unwrap_err();
    for private in [
        "private-endpoint",
        "independent-customer-token",
        "private-row",
        "http://",
    ] {
        assert!(!format!("{error:?}").contains(private));
    }
    server.await.unwrap();
    // Validation rejects an oversized commit before contacting the now-closed server.
    let writes: Vec<_> = (0..501)
        .map(|i| put(row(&format!("oversize-{i}")), None))
        .collect();
    assert!(matches!(
        adapter.commit(&writes).await,
        Err(StorageError::Invalid(_))
    ));
    let query = IndexQuery {
        index: "by_chat".into(),
        equals: RowKey::new(),
        range: None,
        order: None,
        limit: 10,
        after: None,
    };
    assert!(matches!(
        adapter.query(Entity::Messages, &query).await,
        Err(StorageError::Invalid(_))
    ));
}
