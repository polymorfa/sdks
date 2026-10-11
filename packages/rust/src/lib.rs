#![doc = include_str!("../README.md")]
#![forbid(unsafe_code)]

#[cfg(target_arch = "wasm32")]
compile_error!("polymorfa-sdk is server-only. Use @polymorfa/browser and @polymorfa/elements in browser/WASM applications.");

pub mod account;
pub mod calls;
pub mod calls_protocol;
pub mod configuration;
pub mod connections;
pub mod developer;
pub mod errors;
pub mod media;
pub mod message_content;
pub mod messaging;
pub mod models;
pub mod operations;
pub mod pagination;
pub mod platform;
pub mod stream;
pub mod transport;
pub mod voip;
pub mod webhooks;

pub use errors::{Error, ErrorKind, Result};
pub use messaging::MessagingClient;
pub use platform::{OrganizationClient, ProjectClient};
pub use transport::{ApiResponse, ClientOptions, Credential, RequestOptions, ResponseMetadata};

pub const SDK_VERSION: &str = env!("CARGO_PKG_VERSION");
pub const NATIVE_API_VERSION: &str = "2026-09-22";
