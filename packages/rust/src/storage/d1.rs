//! Signed customer-hosted D1 binding bridge. Never uses D1 administrative REST.
use super::*;
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use futures_util::StreamExt as _;
use hmac::{Hmac, Mac};
use rand::RngCore as _;
use serde::de::DeserializeOwned;
use sha2::Sha256;
use std::{sync::Arc, time::Duration};
const CONTRACT: &str = "polymorfa-d1-storage-v1";
const MAX_BODY: usize = 8 * 1024 * 1024;
pub const SOURCE_BRIDGE_COMMIT: &str = "9ae35e671f7f4868a67c1562422c5af9284b95c1";
#[derive(Clone)]
pub struct D1BridgeOptions {
    pub base_url: String,
    pub authority: String,
    pub table_prefix: String,
    pub application_secret: String,
    pub timeout: Duration,
    pub configure_http:
        Option<Arc<dyn Fn(reqwest::ClientBuilder) -> reqwest::ClientBuilder + Send + Sync>>,
}
impl D1BridgeOptions {
    pub fn new(
        base_url: impl Into<String>,
        authority: impl Into<String>,
        table_prefix: impl Into<String>,
        application_secret: impl Into<String>,
    ) -> Self {
        Self {
            base_url: base_url.into(),
            authority: authority.into(),
            table_prefix: table_prefix.into(),
            application_secret: application_secret.into(),
            timeout: Duration::from_secs(30),
            configure_http: None,
        }
    }
}
pub struct D1BridgeAdapter {
    http: reqwest::Client,
    base: String,
    authority: String,
    prefix: String,
    secret: String,
    timeout: Duration,
    setup_allowed: bool,
}
impl D1BridgeAdapter {
    /// Verifies the signed schema/authority/capability handshake before construction succeeds.
    pub async fn connect(options: D1BridgeOptions) -> StorageResult<Self> {
        let url = url::Url::parse(&options.base_url).map_err(|_| invalid())?;
        let loopback = url.host_str().is_some_and(|h| {
            h == "localhost"
                || h.parse::<std::net::IpAddr>()
                    .is_ok_and(|ip| ip.is_loopback())
        });
        if !(url.scheme() == "https" || url.scheme() == "http" && loopback)
            || !url.username().is_empty()
            || url.password().is_some()
            || url.query().is_some()
            || url.fragment().is_some()
            || url.path() != "/"
            || !valid_name(&options.authority, false)
            || !valid_name(&options.table_prefix, true)
            || !(32..=256).contains(&options.application_secret.len())
            || !options
                .application_secret
                .bytes()
                .all(|b| (b'!'..=b'~').contains(&b))
            || options.timeout.is_zero()
        {
            return Err(invalid());
        }
        let mut builder = reqwest::Client::builder();
        if let Some(configure) = options.configure_http {
            builder = configure(builder);
        }
        let http = builder
            .default_headers(reqwest::header::HeaderMap::new())
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .map_err(|_| invalid())?;
        let mut adapter = Self {
            http,
            base: url.as_str().trim_end_matches('/').into(),
            authority: options.authority,
            prefix: options.table_prefix,
            secret: options.application_secret,
            timeout: options.timeout,
            setup_allowed: false,
        };
        let data: Value = adapter.request("GET", "/handshake", None).await?;
        if data.get("atomicCommit") != Some(&Value::Bool(true))
            || data.get("conditionalDeletes") != Some(&Value::Bool(true))
            || data.get("maxCommitSize").and_then(Value::as_u64) != Some(50)
            || data.get("maxGetSize").and_then(Value::as_u64) != Some(1000)
            || data.get("maxQuerySize").and_then(Value::as_u64) != Some(1000)
            || data.get("maxBodyBytes").and_then(Value::as_u64) != Some(MAX_BODY as u64)
            || !data.get("setupAllowed").is_some_and(Value::is_boolean)
        {
            return Err(untrusted());
        }
        adapter.setup_allowed = data["setupAllowed"] == true;
        Ok(adapter)
    }
    async fn request<T: DeserializeOwned>(
        &self,
        method: &str,
        path: &str,
        payload: Option<Value>,
    ) -> StorageResult<T> {
        let body = payload
            .map(|v| serde_json::to_vec(&v))
            .transpose()
            .map_err(|_| invalid())?
            .unwrap_or_default();
        if body.len() > MAX_BODY {
            return Err(invalid());
        }
        let mut entropy = [0u8; 32];
        rand::rng().fill_bytes(&mut entropy);
        let nonce = URL_SAFE_NO_PAD.encode(entropy);
        let mut content = format!("{nonce}.{method}.{path}.").into_bytes();
        content.extend_from_slice(&body);
        let signature = sign(self.secret.as_bytes(), &content);
        let attempt = async {
            let mut request = self
                .http
                .request(
                    reqwest::Method::from_bytes(method.as_bytes()).map_err(|_| invalid())?,
                    format!("{}{path}", self.base),
                )
                .bearer_auth(&self.secret)
                .header("Polymorfa-Storage-Authority", &self.authority)
                .header("Polymorfa-Storage-Prefix", &self.prefix)
                .header("Polymorfa-Storage-Nonce", &nonce)
                .header("Polymorfa-Storage-Signature", signature)
                .header("Accept", "application/json");
            if method == "POST" {
                request = request
                    .header("Content-Type", "application/json")
                    .body(body);
            }
            let response = request.send().await.map_err(|_| transport())?;
            let status = response.status().as_u16();
            let signed = response
                .headers()
                .get("Polymorfa-Storage-Signature")
                .and_then(|v| v.to_str().ok())
                .unwrap_or("")
                .to_owned();
            if response
                .headers()
                .get("Polymorfa-Storage-Nonce")
                .and_then(|v| v.to_str().ok())
                != Some(nonce.as_str())
                || response
                    .content_length()
                    .is_some_and(|n| n > MAX_BODY as u64)
                || response
                    .headers()
                    .get("Content-Type")
                    .and_then(|v| v.to_str().ok())
                    .and_then(|v| v.split(';').next())
                    .map(str::trim)
                    != Some("application/json")
            {
                return Err(untrusted());
            }
            let mut bytes = Vec::new();
            let mut stream = response.bytes_stream();
            while let Some(part) = stream.next().await {
                let part = part.map_err(|_| transport())?;
                if bytes.len() + part.len() > MAX_BODY {
                    return Err(untrusted());
                }
                bytes.extend_from_slice(&part);
            }
            let mut authenticated = format!("{nonce}.{status}.").into_bytes();
            authenticated.extend_from_slice(&bytes);
            if !verify(self.secret.as_bytes(), &authenticated, &signed) {
                return Err(untrusted());
            }
            let envelope: Value = serde_json::from_slice(&bytes).map_err(|_| untrusted())?;
            if envelope.get("contract").and_then(Value::as_str) != Some(CONTRACT)
                || envelope.get("schemaVersion").and_then(Value::as_u64) != Some(2)
                || envelope.get("authority").and_then(Value::as_str) != Some(&self.authority)
                || envelope.get("tablePrefix").and_then(Value::as_str) != Some(&self.prefix)
            {
                return Err(untrusted());
            }
            if !(200..300).contains(&status) {
                return Err(StorageError::Provider(
                    "Customer storage operation was rejected.",
                ));
            }
            serde_json::from_value(envelope.get("data").ok_or_else(untrusted)?.clone())
                .map_err(|_| untrusted())
        };
        tokio::time::timeout(self.timeout, attempt)
            .await
            .map_err(|_| {
                StorageError::Provider(
                    "Customer storage request timed out; the commit outcome may be unknown.",
                )
            })?
    }
}
fn valid_name(value: &str, prefix: bool) -> bool {
    let maximum = if prefix { 64 } else { 128 };
    let mut chars = value.bytes();
    !value.is_empty()
        && value.len() <= maximum
        && chars
            .next()
            .is_some_and(|b| b.is_ascii_alphabetic() || prefix && b == b'_')
        && chars.all(|b| {
            b.is_ascii_alphanumeric()
                || if prefix {
                    b == b'_'
                } else {
                    b"_.:-".contains(&b)
                }
        })
}
fn sign(secret: &[u8], bytes: &[u8]) -> String {
    let mut mac = Hmac::<Sha256>::new_from_slice(secret).expect("HMAC accepts any key length");
    mac.update(bytes);
    format!("v1={}", hex::encode(mac.finalize().into_bytes()))
}
fn verify(secret: &[u8], bytes: &[u8], signature: &str) -> bool {
    let Some(encoded) = signature.strip_prefix("v1=") else {
        return false;
    };
    if encoded.len() != 64
        || !encoded
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
    {
        return false;
    }
    let Ok(digest) = hex::decode(encoded) else {
        return false;
    };
    let mut mac = Hmac::<Sha256>::new_from_slice(secret).expect("HMAC accepts any key length");
    mac.update(bytes);
    mac.verify_slice(&digest).is_ok()
}
fn invalid() -> StorageError {
    StorageError::Invalid("Invalid customer D1 bridge configuration or request.")
}
fn untrusted() -> StorageError {
    StorageError::Provider("Customer D1 bridge returned an untrusted response.")
}
fn transport() -> StorageError {
    StorageError::Provider("Customer storage request failed; the commit outcome may be unknown.")
}
impl StorageAdapter for D1BridgeAdapter {
    fn name(&self) -> &str {
        "d1-bridge"
    }
    fn capabilities(&self) -> StorageCapabilities {
        StorageCapabilities {
            atomic_commit: true,
            max_commit_size: 50,
        }
    }
    fn setup(&self) -> StorageFuture<'_, ()> {
        Box::pin(async {
            if !self.setup_allowed {
                return Err(StorageError::Invalid("D1 bridge schema setup is disabled."));
            }
            let data: Value = self
                .request("POST", "/setup", Some(serde_json::json!({})))
                .await?;
            if data.get("ok") != Some(&Value::Bool(true)) {
                return Err(untrusted());
            }
            Ok(())
        })
    }
    fn get<'a>(
        &'a self,
        entity: Entity,
        ids: &'a [String],
    ) -> StorageFuture<'a, BTreeMap<String, StoredRow>> {
        Box::pin(async move {
            if ids.len() > 1000 || ids.iter().any(|id| id.is_empty() || id.len() > 4096) {
                return Err(invalid());
            }
            let rows: Vec<StoredRow> = self
                .request(
                    "POST",
                    "/get",
                    Some(serde_json::json!({"entity":entity,"ids":ids})),
                )
                .await?;
            let mut result = BTreeMap::new();
            for row in rows {
                if !ids.contains(&row.id) || result.contains_key(&row.id) {
                    return Err(untrusted());
                }
                memory::validate_commit(
                    &[RowWrite::Put {
                        entity,
                        row: row.clone(),
                        expected_revision: None,
                    }],
                    1,
                )
                .map_err(|_| untrusted())?;
                result.insert(row.id.clone(), row);
            }
            Ok(result)
        })
    }
    fn commit<'a>(&'a self, writes: &'a [RowWrite]) -> StorageFuture<'a, CommitResult> {
        Box::pin(async move {
            memory::validate_commit(writes, 50)?;
            let receipt: CommitResult = self
                .request(
                    "POST",
                    "/commit",
                    Some(serde_json::json!({"writes":writes})),
                )
                .await?;
            if receipt.ok && !receipt.conflicts.is_empty()
                || !receipt.ok && receipt.conflicts.is_empty()
                || receipt.conflicts.iter().any(|id| {
                    !writes.iter().any(|write| match write {
                        RowWrite::Put { row, .. } => &row.id == id,
                        RowWrite::Delete { id: written, .. } => written == id,
                    })
                })
            {
                return Err(untrusted());
            }
            Ok(receipt)
        })
    }
    fn query<'a>(
        &'a self,
        entity: Entity,
        query: &'a IndexQuery,
    ) -> StorageFuture<'a, Vec<StoredRow>> {
        Box::pin(async move {
            memory::validate_query(entity, query)?;
            if query.limit > 1000 {
                return Err(invalid());
            }
            let rows: Vec<StoredRow> = self
                .request(
                    "POST",
                    "/query",
                    Some(serde_json::json!({"entity":entity,"query":query})),
                )
                .await?;
            let mut seen = std::collections::BTreeSet::new();
            for row in &rows {
                if !seen.insert(&row.id) {
                    return Err(untrusted());
                }
                memory::validate_commit(
                    &[RowWrite::Put {
                        entity,
                        row: row.clone(),
                        expected_revision: None,
                    }],
                    1,
                )
                .map_err(|_| untrusted())?;
            }
            let filtered =
                memory::filter_rows(entity, rows.clone(), query).map_err(|_| untrusted())?;
            if filtered
                .iter()
                .map(|r| &r.id)
                .ne(rows.iter().map(|r| &r.id))
            {
                return Err(untrusted());
            }
            Ok(rows)
        })
    }
}
