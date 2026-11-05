//! Customer-owned storage; no control-plane database or credential is used.
// Re-export the canonical core to preserve every existing server public path.
pub use polymorfa_storage_core::*;
use serde_json::Value;
use std::collections::BTreeMap;

pub mod d1;

#[cfg(feature = "storage-sql")]
pub mod sql;

#[cfg(feature = "storage-dynamodb")]
pub mod dynamodb;

#[cfg(feature = "storage-mongodb")]
pub mod mongodb;

#[cfg(feature = "storage-firestore")]
pub mod firestore;
#[cfg(any(feature = "storage-sql", feature = "storage-libsql"))]
mod sql_schema;

#[cfg(feature = "storage-libsql")]
pub mod libsql;
