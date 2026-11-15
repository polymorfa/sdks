#![cfg(feature = "storage-sql")]
use polymorfa_sdk::storage::{
    sql::{SqlDialect, SqlStorageAdapter, SqlStorageOptions},
    Entity, StorageAdapter,
};
use sqlx::{Row, SqlitePool};

async fn database() -> (String, SqlitePool) {
    let root = std::env::var_os("POLYMORFA_STORAGE_TEST_DIR")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|| {
            std::path::PathBuf::from(
                std::env::var_os("HOME")
                    .or_else(|| std::env::var_os("USERPROFILE"))
                    .expect("user home directory"),
            )
            .join(".polymorfa-agent-work/sdk-connection-storage-checks")
        });
    std::fs::create_dir_all(&root).unwrap();
    let path =
        std::path::Path::new(&root).join(format!("schema-guard-{}.db", uuid::Uuid::new_v4()));
    let url = format!("sqlite:{}?mode=rwc", path.display());
    let pool = SqlitePool::connect(&url).await.unwrap();
    (url, pool)
}
async fn catalog(db: &SqlitePool) -> Vec<(String, String)> {
    sqlx::query("SELECT name,coalesce(sql,'') AS sql FROM sqlite_master ORDER BY name")
        .fetch_all(db)
        .await
        .unwrap()
        .iter()
        .map(|row| (row.get("name"), row.get("sql")))
        .collect()
}
#[tokio::test]
async fn old_and_future_sql_stores_are_unchanged_after_refusal() {
    for version in [2, 4] {
        let (url, db) = database().await;
        for statement in [
            "CREATE TABLE polymorfa_storage_schema(id text PRIMARY KEY,version integer)",
            &format!("INSERT INTO polymorfa_storage_schema VALUES('storage',{version})"),
            "CREATE TABLE polymorfa_sessions(session_id text)",
            "INSERT INTO polymorfa_sessions VALUES('unchanged-selector')",
        ] {
            sqlx::query(statement).execute(&db).await.unwrap();
        }
        let before = catalog(&db).await;
        let adapter =
            SqlStorageAdapter::connect(SqlDialect::Sqlite, &url, SqlStorageOptions::default())
                .await
                .unwrap();
        assert!(adapter.setup().await.is_err());
        assert_eq!(catalog(&db).await, before);
        assert_eq!(
            sqlx::query_scalar::<_, i64>("SELECT version FROM polymorfa_storage_schema")
                .fetch_one(&db)
                .await
                .unwrap(),
            version
        );
        assert_eq!(
            sqlx::query_scalar::<_, String>("SELECT session_id FROM polymorfa_sessions")
                .fetch_one(&db)
                .await
                .unwrap(),
            "unchanged-selector"
        );
        adapter.close().await;
        db.close().await;
    }
}
#[tokio::test]
async fn unversioned_existing_tables_are_not_initialized() {
    let (url, db) = database().await;
    sqlx::query("CREATE TABLE polymorfa_messages(_id text)")
        .execute(&db)
        .await
        .unwrap();
    let before = catalog(&db).await;
    let adapter =
        SqlStorageAdapter::connect(SqlDialect::Sqlite, &url, SqlStorageOptions::default())
            .await
            .unwrap();
    assert!(adapter.setup().await.is_err());
    assert_eq!(catalog(&db).await, before);
    adapter.close().await;
    db.close().await;
}
#[tokio::test]
async fn an_open_adapter_refuses_reads_after_a_version_change() {
    let (url, db) = database().await;
    let adapter =
        SqlStorageAdapter::connect(SqlDialect::Sqlite, &url, SqlStorageOptions::default())
            .await
            .unwrap();
    adapter.setup().await.unwrap();
    sqlx::query("UPDATE polymorfa_storage_schema SET version=4")
        .execute(&db)
        .await
        .unwrap();
    assert!(adapter.get(Entity::Connections, &[]).await.is_err());
    adapter.close().await;
    db.close().await;
}
