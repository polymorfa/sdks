//! Historical MESSAGE_EDIT upserts honor chat.clear/chat.delete watermarks like the TS producer.
use polymorfa_sdk::storage::{
    memory::MemoryAdapter,
    merge::canonical_json,
    reducer::{
        events::{reduce_event, StorageEvent},
        history::{reduce_history_chunk, HistoryChunkInput},
    },
    *,
};
use serde_json::Value;
use std::sync::Arc;
fn fixture() -> Value {
    serde_json::from_str(include_str!("fixtures/history-edit-guard/fixture.json")).unwrap()
}
async fn run_case(adapter: Arc<dyn StorageAdapter>, c: &Value) -> Vec<String> {
    adapter.setup().await.unwrap();
    let s = Storage::new(adapter, Default::default()).unwrap();
    let name = c["name"].as_str().unwrap();
    let mut mismatches = Vec::new();
    for (i, step) in c["steps"].as_array().unwrap().iter().enumerate() {
        let b = if let Some(h) = step.get("history") {
            reduce_history_chunk(&HistoryChunkInput {
                session_id: h["sessionId"].as_str().unwrap().into(),
                chunk: serde_json::from_value(h["chunk"].clone()).unwrap(),
                identities: None,
                chunk_id: Some(h["chunkId"].as_str().unwrap().into()),
            })
        } else {
            let e: StorageEvent = serde_json::from_value(step["event"].clone()).unwrap();
            reduce_event(&e)
        };
        if canonical_json(&serde_json::to_value(&b.operations).unwrap())
            != canonical_json(&step["operations"])
        {
            mismatches.push(format!("{name} step {i} operations"));
        }
        assert_eq!(
            s.apply(&b).await.unwrap().applied,
            step["applied"].as_bool().unwrap(),
            "{name} applied {i}"
        );
    }
    for x in c["expect"].as_array().unwrap() {
        let entity: Entity = serde_json::from_value(x["entity"].clone()).unwrap();
        let key: RowKey = serde_json::from_value(x["key"].clone()).unwrap();
        let row = s.get(entity, &key).await.unwrap();
        let text = row
            .and_then(|r| r.get("text").cloned())
            .filter(|v| !v.is_null());
        assert_eq!(
            text.as_ref(),
            x["text"].as_str().map(Value::from).as_ref(),
            "{name} text"
        );
    }
    for (name, rows) in c["rows"].as_object().unwrap() {
        let entity: Entity = serde_json::from_value(Value::from(name.as_str())).unwrap();
        for want in rows.as_array().unwrap() {
            let key: RowKey = entity
                .definition()
                .key
                .iter()
                .map(|k| (k.to_string(), want[*k].as_str().unwrap().to_owned()))
                .collect();
            let got = s.get(entity, &key).await.unwrap().unwrap();
            assert_eq!(
                canonical_json(&serde_json::to_value(got).unwrap()),
                canonical_json(want),
                "{name} rows"
            );
        }
    }
    mismatches
}
#[tokio::test]
async fn history_edit_guard_matches_producer_in_memory() {
    let f = fixture();
    let cases = f["cases"].as_array().unwrap();
    assert_eq!(cases.len(), 13);
    let mut mismatches = Vec::new();
    for c in cases {
        mismatches.extend(run_case(Arc::new(MemoryAdapter::new()), c).await);
    }
    assert!(mismatches.is_empty(), "{mismatches:?}");
}
#[cfg(feature = "storage-sql")]
#[tokio::test]
async fn history_edit_guard_matches_producer_in_sqlite() {
    use polymorfa_sdk::storage::sql::{SqlDialect, SqlStorageAdapter, SqlStorageOptions};
    let f = fixture();
    let mut mismatches = Vec::new();
    for c in f["cases"].as_array().unwrap() {
        let adapter = Arc::new(
            SqlStorageAdapter::connect(
                SqlDialect::Sqlite,
                "sqlite::memory:",
                SqlStorageOptions::default(),
            )
            .await
            .unwrap(),
        );
        mismatches.extend(run_case(adapter.clone(), c).await);
        adapter.close().await;
    }
    assert!(mismatches.is_empty(), "{mismatches:?}");
}
