use crate::core::{memory, schema::ALL_ENTITIES, *};
use js_sys::Promise;
use serde::de::DeserializeOwned;
use std::collections::BTreeMap;
use wasm_bindgen::prelude::*;
use wasm_bindgen_futures::JsFuture;
#[wasm_bindgen(module = "/src/indexeddb.js")]
extern "C" {
    type NativeDb;
    #[wasm_bindgen(catch, js_name = newIndexedDb)]
    fn new_db(owner: &str, name: &str, entities: &str, maximum: usize)
        -> Result<NativeDb, JsValue>;
    #[wasm_bindgen(method, catch)]
    fn setup(this: &NativeDb, signal: &web_sys::AbortSignal) -> Result<Promise, JsValue>;
    #[wasm_bindgen(method, catch)]
    fn get(
        this: &NativeDb,
        entity: &str,
        ids: &str,
        signal: &web_sys::AbortSignal,
    ) -> Result<Promise, JsValue>;
    #[wasm_bindgen(method, catch)]
    fn commit(
        this: &NativeDb,
        writes: &str,
        signal: &web_sys::AbortSignal,
    ) -> Result<Promise, JsValue>;
    #[wasm_bindgen(method, catch)]
    fn scan(
        this: &NativeDb,
        entity: &str,
        signal: &web_sys::AbortSignal,
    ) -> Result<Promise, JsValue>;
    #[wasm_bindgen(method)]
    fn close(this: &NativeDb);
}
#[derive(Clone)]
pub struct IndexedDbOptions {
    pub namespace: String,
    pub database_name: Option<String>,
    pub max_query_rows: usize,
}
impl IndexedDbOptions {
    pub fn new(namespace: impl Into<String>) -> Self {
        Self {
            namespace: namespace.into(),
            database_name: None,
            max_query_rows: 100_000,
        }
    }
}
pub struct IndexedDbStorageAdapter {
    native: NativeDb,
}
struct AbortOnDrop(Option<web_sys::AbortController>);
impl AbortOnDrop {
    fn new() -> StorageResult<Self> {
        Ok(Self(Some(
            web_sys::AbortController::new().map_err(|_| provider())?,
        )))
    }
    fn signal(&self) -> web_sys::AbortSignal {
        self.0.as_ref().expect("live operation controller").signal()
    }
    async fn finish<T: DeserializeOwned>(
        mut self,
        promise: Result<Promise, JsValue>,
    ) -> StorageResult<T> {
        let value = JsFuture::from(promise.map_err(|_| provider())?)
            .await
            .map_err(|_| provider())?;
        self.0 = None;
        serde_json::from_str(&value.as_string().ok_or_else(provider)?).map_err(|_| provider())
    }
}
impl Drop for AbortOnDrop {
    fn drop(&mut self) {
        if let Some(controller) = &self.0 {
            controller.abort();
        }
    }
}
fn provider() -> StorageError {
    StorageError::Provider(
        "Customer IndexedDB storage operation failed; a completed commit may need reconciliation.",
    )
}
fn encode(value: &impl serde::Serialize) -> StorageResult<String> {
    serde_json::to_string(value).map_err(|_| provider())
}
impl IndexedDbStorageAdapter {
    pub fn new(options: IndexedDbOptions) -> StorageResult<Self> {
        schema::namespace(&options.namespace)?;
        if options.max_query_rows == 0
            || options.max_query_rows > 1_000_000
            || options
                .database_name
                .as_ref()
                .is_some_and(|s| s.is_empty() || s.len() > 256)
        {
            return Err(StorageError::Invalid(
                "Invalid IndexedDB namespace, name or query bound.",
            ));
        }
        let name = options
            .database_name
            .unwrap_or_else(|| format!("polymorfa_{}", options.namespace));
        let entities = ALL_ENTITIES
            .iter()
            .map(|e| e.definition().name)
            .collect::<Vec<_>>();
        let native = new_db(
            &options.namespace,
            &name,
            &encode(&entities)?,
            options.max_query_rows,
        )
        .map_err(|_| provider())?;
        Ok(Self { native })
    }
    /// Close this adapter's connection. Later operations reopen the same database.
    pub fn close(&self) {
        self.native.close();
    }
    fn validate_rows(entity: Entity, rows: &[StoredRow]) -> StorageResult<()> {
        for row in rows {
            memory::validate_commit(
                &[RowWrite::Put {
                    entity,
                    row: row.clone(),
                    expected_revision: None,
                }],
                1,
            )
            .map_err(|_| provider())?;
        }
        Ok(())
    }
}
impl Drop for IndexedDbStorageAdapter {
    fn drop(&mut self) {
        self.native.close();
    }
}
impl StorageAdapter for IndexedDbStorageAdapter {
    fn name(&self) -> &str {
        "indexeddb"
    }
    fn capabilities(&self) -> StorageCapabilities {
        StorageCapabilities {
            atomic_commit: true,
            max_commit_size: 1000,
        }
    }
    fn setup(&self) -> StorageFuture<'_, ()> {
        Box::pin(async {
            let guard = AbortOnDrop::new()?;
            let promise = self.native.setup(&guard.signal());
            let _: bool = guard.finish(promise).await?;
            Ok(())
        })
    }
    fn get<'a>(
        &'a self,
        entity: Entity,
        ids: &'a [String],
    ) -> StorageFuture<'a, BTreeMap<String, StoredRow>> {
        Box::pin(async move {
            let guard = AbortOnDrop::new()?;
            let promise =
                self.native
                    .get(entity.definition().name, &encode(&ids)?, &guard.signal());
            let rows: Vec<StoredRow> = guard.finish(promise).await?;
            Self::validate_rows(entity, &rows)?;
            let mut result = BTreeMap::new();
            for row in rows {
                if !ids.contains(&row.id) || result.contains_key(&row.id) {
                    return Err(provider());
                }
                result.insert(row.id.clone(), row);
            }
            Ok(result)
        })
    }
    fn commit<'a>(&'a self, writes: &'a [RowWrite]) -> StorageFuture<'a, CommitResult> {
        Box::pin(async move {
            memory::validate_commit(writes, 1000)?;
            if writes.is_empty() {
                return Ok(CommitResult {
                    ok: true,
                    conflicts: vec![],
                });
            }
            let guard = AbortOnDrop::new()?;
            let promise = self.native.commit(&encode(&writes)?, &guard.signal());
            guard.finish(promise).await
        })
    }
    fn query<'a>(
        &'a self,
        entity: Entity,
        query: &'a IndexQuery,
    ) -> StorageFuture<'a, Vec<StoredRow>> {
        Box::pin(async move {
            memory::validate_query(entity, query)?;
            let guard = AbortOnDrop::new()?;
            let promise = self.native.scan(entity.definition().name, &guard.signal());
            let rows: Vec<StoredRow> = guard.finish(promise).await?;
            Self::validate_rows(entity, &rows)?;
            memory::filter_rows(entity, rows, query)
        })
    }
}
