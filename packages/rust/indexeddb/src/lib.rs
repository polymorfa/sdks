#![forbid(unsafe_code)]
//! Browser-local IndexedDB storage. Contains no HTTP client, API principal or Signal integration.
pub use polymorfa_storage_core as core;
#[cfg(target_arch = "wasm32")]
mod browser;
#[cfg(target_arch = "wasm32")]
pub use browser::{IndexedDbOptions, IndexedDbStorageAdapter};
