#![forbid(unsafe_code)]
//! Portable customer-owned storage schema, merge rules and fenced engine.
//! Contract source: 3bacf46f9c4213426314001586f5bae43aaa77de.
pub const SOURCE_STORAGE_COMMIT: &str = "3bacf46f9c4213426314001586f5bae43aaa77de";
mod runtime;
pub mod schema;
pub use schema::Entity;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{collections::BTreeMap, future::Future, pin::Pin};
pub type StorageResult<T> = std::result::Result<T, StorageError>;
#[derive(Clone, PartialEq)]
pub enum StorageError {
    Invalid(&'static str),
    Conflict(Vec<String>),
    LeaseLost,
    CheckpointConflict,
    Provider(&'static str),
}
impl std::fmt::Display for StorageError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Invalid(message) | Self::Provider(message) => f.write_str(message),
            Self::Conflict(ids) => write!(f, "Storage kept conflicting ({} rows).", ids.len()),
            Self::LeaseLost => {
                f.write_str("Storage lease expired or changed; resume from the saved checkpoint.")
            }
            Self::CheckpointConflict => {
                f.write_str("Storage checkpoint changed; resume from the saved checkpoint.")
            }
        }
    }
}
impl std::error::Error for StorageError {}
pub type RowKey = BTreeMap<String, String>;
pub type FieldWrites = BTreeMap<String, FieldWrite>;
#[derive(Clone, Serialize, Deserialize)]
pub struct FieldWrite {
    pub value: Value,
    pub version: f64,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatWatermarkGuard {
    pub session_id: String,
    pub chat_id: String,
    pub timestamp: f64,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum StorageOperation {
    Upsert {
        entity: Entity,
        key: RowKey,
        fields: FieldWrites,
        #[serde(skip_serializing_if = "Option::is_none")]
        guard: Option<ChatWatermarkGuard>,
    },
    Patch {
        entity: Entity,
        key: RowKey,
        fields: FieldWrites,
        #[serde(skip_serializing_if = "Option::is_none")]
        guard: Option<ChatWatermarkGuard>,
    },
    Delete {
        entity: Entity,
        key: RowKey,
    },
    ClearChat {
        #[serde(rename = "sessionId")]
        session_id: String,
        #[serde(rename = "chatId")]
        chat_id: String,
        #[serde(rename = "upTo")]
        up_to: f64,
    },
    Checkpoint {
        #[serde(rename = "sessionId")]
        session_id: String,
        stream: String,
        cursor: String,
        #[serde(
            rename = "expectedCursor",
            default,
            deserialize_with = "nullable_cursor",
            skip_serializing_if = "Option::is_none"
        )]
        expected_cursor: Option<Option<String>>,
        #[serde(skip_serializing_if = "Option::is_none")]
        position: Option<Value>,
        #[serde(rename = "updatedAt", skip_serializing_if = "Option::is_none")]
        updated_at: Option<f64>,
    },
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OperationBatch {
    pub session_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub event_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub event_type: Option<String>,
    pub operations: Vec<StorageOperation>,
}
#[derive(Clone, Serialize, Deserialize)]
pub struct StoredRow {
    #[serde(rename = "_id")]
    pub id: String,
    #[serde(rename = "_rev")]
    pub revision: u64,
    #[serde(rename = "_v")]
    pub versions: BTreeMap<String, f64>,
    #[serde(flatten)]
    pub fields: BTreeMap<String, Value>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum RowWrite {
    Put {
        entity: Entity,
        row: StoredRow,
        #[serde(rename = "expectedRev")]
        expected_revision: Option<u64>,
    },
    Delete {
        entity: Entity,
        id: String,
        #[serde(rename = "expectedRev", skip_serializing_if = "Option::is_none")]
        expected_revision: Option<u64>,
    },
}
#[derive(Clone, Serialize, Deserialize)]
pub struct CommitResult {
    pub ok: bool,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub conflicts: Vec<String>,
}
#[derive(Clone, Copy)]
pub struct StorageCapabilities {
    pub atomic_commit: bool,
    pub max_commit_size: usize,
}
#[derive(Clone, Default, Serialize, Deserialize)]
pub struct IndexRange {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub gt: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub gte: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub lt: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub lte: Option<f64>,
}
#[derive(Clone, Serialize, Deserialize)]
pub struct IndexCursor {
    pub sort: f64,
    pub id: String,
}
#[derive(Clone, Serialize, Deserialize)]
pub struct IndexQuery {
    pub index: String,
    pub equals: RowKey,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub range: Option<IndexRange>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub order: Option<String>,
    pub limit: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub after: Option<IndexCursor>,
}
#[cfg(not(target_arch = "wasm32"))]
pub type StorageFuture<'a, T> = Pin<Box<dyn Future<Output = StorageResult<T>> + Send + 'a>>;
#[cfg(target_arch = "wasm32")]
pub type StorageFuture<'a, T> = Pin<Box<dyn Future<Output = StorageResult<T>> + 'a>>;
#[cfg(not(target_arch = "wasm32"))]
pub trait AdapterBounds: Send + Sync {}
#[cfg(not(target_arch = "wasm32"))]
impl<T: Send + Sync + ?Sized> AdapterBounds for T {}
#[cfg(target_arch = "wasm32")]
pub trait AdapterBounds {}
#[cfg(target_arch = "wasm32")]
impl<T: ?Sized> AdapterBounds for T {}
pub trait StorageAdapter: AdapterBounds {
    fn name(&self) -> &str;
    fn capabilities(&self) -> StorageCapabilities;
    fn setup(&self) -> StorageFuture<'_, ()> {
        Box::pin(async { Ok(()) })
    }
    fn get<'a>(
        &'a self,
        entity: Entity,
        ids: &'a [String],
    ) -> StorageFuture<'a, BTreeMap<String, StoredRow>>;
    fn commit<'a>(&'a self, writes: &'a [RowWrite]) -> StorageFuture<'a, CommitResult>;
    fn query<'a>(
        &'a self,
        entity: Entity,
        query: &'a IndexQuery,
    ) -> StorageFuture<'a, Vec<StoredRow>>;
}

fn nullable_cursor<'de, D: serde::Deserializer<'de>>(
    deserializer: D,
) -> std::result::Result<Option<Option<String>>, D::Error> {
    Option::<String>::deserialize(deserializer).map(Some)
}

pub mod memory;
pub mod merge;

pub mod engine;
pub use engine::{Storage, StorageOptions};

impl std::fmt::Debug for StorageError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        std::fmt::Display::fmt(self, f)
    }
}

pub mod reducer;
pub mod sync;
