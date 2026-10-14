#![cfg(feature = "storage-sql")]
#[path = "support/storage_conformance.rs"]
mod storage_conformance;
use polymorfa_sdk::storage::sql::{
    schema_statements, SqlDialect, SqlStorageAdapter, SqlStorageOptions,
};
use std::sync::Arc;
use storage_conformance::conformance;
#[tokio::test]
async fn actual_sqlite_atomic_schema2_and_2000_message_engine() {
    let adapter = Arc::new(
        SqlStorageAdapter::connect(
            SqlDialect::Sqlite,
            "sqlite::memory:",
            SqlStorageOptions::default(),
        )
        .await
        .unwrap(),
    );
    conformance(adapter.clone()).await;
    adapter.close().await;
}
#[test]
fn schema_names_are_closed_and_all_dialects_include_fenced_schema2() {
    for dialect in [SqlDialect::Postgres, SqlDialect::MySql, SqlDialect::Sqlite] {
        let ddl = schema_statements(dialect, &SqlStorageOptions::default())
            .unwrap()
            .join("\n");
        assert!(ddl.contains("leases"));
        assert!(ddl.contains("_rev"));
        assert!(ddl.contains("storage_schema"));
        assert!(schema_statements(
            dialect,
            &SqlStorageOptions {
                table_prefix: "bad; DROP TABLE x".into(),
                ..Default::default()
            }
        )
        .is_err());
    }
}
#[tokio::test]
async fn configured_postgres_mysql_actual_driver_conformance() {
    for (dialect, name) in [
        (SqlDialect::Postgres, "POLYMORFA_STORAGE_POSTGRES_URL"),
        (SqlDialect::MySql, "POLYMORFA_STORAGE_MYSQL_URL"),
    ] {
        if let Ok(url) = std::env::var(name) {
            let options = SqlStorageOptions {
                table_prefix: format!("rs_{}_", uuid::Uuid::new_v4().simple()),
                ..Default::default()
            };
            let adapter = Arc::new(
                SqlStorageAdapter::connect(dialect, &url, options)
                    .await
                    .unwrap(),
            );
            conformance(adapter.clone()).await;
            adapter.close().await;
        }
    }
}
