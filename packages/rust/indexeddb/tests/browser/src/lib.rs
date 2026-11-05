#![allow(clippy::arc_with_non_send_sync)]
#[path = "../../../../tests/support/storage_conformance.rs"]
mod storage_conformance;
use polymorfa_storage_core::{merge::empty_row, *};
use polymorfa_storage_indexeddb::{IndexedDbOptions, IndexedDbStorageAdapter};
use std::sync::Arc;
use wasm_bindgen::prelude::*;
fn adapter(owner: &str, name: &str) -> IndexedDbStorageAdapter {
    IndexedDbStorageAdapter::new(IndexedDbOptions {
        database_name: Some(name.into()),
        ..IndexedDbOptions::new(owner)
    })
    .unwrap()
}
fn row(id: &str) -> StoredRow {
    let mut row = empty_row(
        Entity::Messages,
        &RowKey::from([
            ("sessionId".into(), "browser".into()),
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
#[wasm_bindgen]
pub async fn run_conformance(name: String) -> Result<String, JsValue> {
    for invalid in ["", "-owner", "owner.other", "💎", &"a".repeat(65)] {
        assert!(IndexedDbStorageAdapter::new(IndexedDbOptions::new(invalid)).is_err());
    }
    let store = Arc::new(adapter("browser_acceptance", &name));
    storage_conformance::conformance(store.clone()).await;
    let existing = row("persisted");
    assert!(
        store
            .commit(&[put(existing.clone(), None)])
            .await
            .unwrap()
            .ok
    );
    store.close();
    let reopened = adapter("browser_acceptance", &name);
    assert_eq!(
        reopened
            .get(Entity::Messages, &[existing.id.clone()])
            .await
            .unwrap()[&existing.id]
            .revision,
        1
    );
    let mut updated = existing.clone();
    updated.revision = 2;
    let a = [put(updated.clone(), Some(1))];
    let b = [put(updated, Some(1))];
    let (a, b) = futures_util::future::join(store.commit(&a), reopened.commit(&b)).await;
    assert_ne!(a.unwrap().ok, b.unwrap().ok);
    let mismatch = adapter("different_owner", &name);
    assert!(mismatch.setup().await.is_err());
    let bounded = IndexedDbStorageAdapter::new(IndexedDbOptions {
        namespace: "browser_acceptance".into(),
        database_name: Some(name.clone()),
        max_query_rows: 1,
    })
    .unwrap();
    assert!(bounded
        .query(
            Entity::Messages,
            &IndexQuery {
                index: "by_chat".into(),
                equals: RowKey::from([
                    ("sessionId".into(), "s".into()),
                    ("chatId".into(), "c".into())
                ]),
                range: None,
                order: None,
                after: None,
                limit: 10
            }
        )
        .await
        .is_err());
    // Starting an operation and then dropping its polled future must not create a row.
    let cancelled = row("cancelled");
    let writes = [put(cancelled.clone(), None)];
    let mut future = store.commit(&writes);
    assert!(futures_util::poll!(future.as_mut()).is_pending());
    wasm_bindgen_futures::JsFuture::from(js_sys::Promise::resolve(&JsValue::UNDEFINED))
        .await
        .unwrap();
    drop(future);
    // Waiting on a read also lets the aborted transaction settle.
    assert!(store
        .get(Entity::Messages, &[cancelled.id])
        .await
        .unwrap()
        .is_empty());
    store.close();
    reopened.close();
    bounded.close();
    mismatch.close();
    Ok("all17,json,2000,pagination,rollback,replay,checkpoint,clear,lease,CAS,reopen,namespace,bounds,cancel".into())
}
#[wasm_bindgen]
pub async fn denied_storage() -> Result<bool, JsValue> {
    let store = adapter("denied", "private-database-name");
    let error = store
        .setup()
        .await
        .err()
        .ok_or_else(|| JsValue::from_str("Storage was unexpectedly available"))?;
    let text = format!("{error:?}");
    Ok(!text.contains("private-database-name") && !text.contains("SecurityError"))
}

#[wasm_bindgen]
pub fn entity_names() -> String {
    serde_json::to_string(
        &schema::ALL_ENTITIES
            .iter()
            .map(|e| e.definition().name)
            .collect::<Vec<_>>(),
    )
    .unwrap()
}
#[wasm_bindgen]
pub async fn provider_rollback(name: String) -> Result<bool, JsValue> {
    let adapter = adapter("rollback", &name);
    adapter.setup().await.unwrap();
    let mut a = row("private-first");
    a.fields
        .insert("text".into(), "private-duplicate-index-value".into());
    let mut b = row("private-second");
    b.fields
        .insert("text".into(), "private-duplicate-index-value".into());
    let result = adapter
        .commit(&[put(a.clone(), None), put(b.clone(), None)])
        .await;
    let error = result
        .err()
        .ok_or_else(|| JsValue::from_str("Unique index failure was not returned"))?;
    assert!(!error.to_string().contains("private-duplicate"));
    assert!(adapter
        .get(Entity::Messages, &[a.id, b.id])
        .await
        .unwrap()
        .is_empty());
    adapter.close();
    Ok(true)
}
#[wasm_bindgen]
pub async fn persisted_revision(name: String) -> Result<u32, JsValue> {
    let adapter = adapter("browser_acceptance", &name);
    let existing = row("persisted");
    let result = adapter
        .get(Entity::Messages, &[existing.id.clone()])
        .await
        .unwrap()[&existing.id]
        .revision;
    adapter.close();
    Ok(result as u32)
}

#[path = "../../../../storage-core/tests/support/reducers_sync.rs"]
mod reducers_sync;
#[wasm_bindgen]
pub async fn run_reducers_and_sync(name: String) -> Result<bool, JsValue> {
    let store = Arc::new(adapter("reducers_sync", &name));
    reducers_sync::reducers(store.clone()).await;
    reducers_sync::synchronization(store.clone()).await;
    store.close();
    Ok(true)
}
