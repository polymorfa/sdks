#[cfg(test)]
#[path = "../../support/reducers_sync.rs"]
mod shared;
#[tokio::test]
async fn actual_sqlite_exact_producer_reducers_and_ordered_sync() {
    use polymorfa_sdk::storage::sql::*;
    let adapter = std::sync::Arc::new(
        SqlStorageAdapter::connect(
            SqlDialect::Sqlite,
            "sqlite::memory:",
            SqlStorageOptions::default(),
        )
        .await
        .unwrap(),
    );
    shared::reducers(adapter.clone()).await;
    shared::synchronization(adapter.clone()).await;
    adapter.close().await;
}
