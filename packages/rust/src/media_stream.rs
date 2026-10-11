//! Incremental WhatsApp CBC decryption and verified atomic file output.
//! Streaming verification releases unverified plaintext; discard it on any error.
use crate::{
    media::{MediaKeys, DEFAULT_MAX_BYTES},
    transport::{cancelled, configuration},
    Error, ErrorKind, Result,
};
use aes::cipher::{BlockDecrypt, KeyInit};
use bytes::Bytes;
use futures_util::{Stream, StreamExt};
use hmac::{Hmac, Mac};
use sha2::{Digest, Sha256};
use std::{
    path::{Path, PathBuf},
    pin::Pin,
};
use subtle::ConstantTimeEq;
use tokio::io::AsyncWriteExt;
use tokio_util::sync::CancellationToken;

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum MediaVerifyMode {
    /// Buffer plaintext until the MAC and optional hashes have all verified.
    #[default]
    BeforeRelease,
    /// Emit plaintext incrementally. A terminal error invalidates every emitted byte.
    Streaming,
}
#[derive(Clone)]
pub struct MediaDecryptOptions {
    pub file_sha256: Option<[u8; 32]>,
    pub file_enc_sha256: Option<[u8; 32]>,
    pub file_length: Option<u64>,
    pub max_bytes: usize,
    pub verify: MediaVerifyMode,
    pub cancellation: CancellationToken,
}
impl Default for MediaDecryptOptions {
    fn default() -> Self {
        Self {
            file_sha256: None,
            file_enc_sha256: None,
            file_length: None,
            max_bytes: DEFAULT_MAX_BYTES,
            verify: MediaVerifyMode::BeforeRelease,
            cancellation: CancellationToken::new(),
        }
    }
}
pub type MediaByteStream = Pin<Box<dyn Stream<Item = Result<Bytes>> + Send>>;
fn integrity(code: &str, message: &str) -> Error {
    Error::local(ErrorKind::MediaIntegrity, message, code)
}
/// The native incremental backend. Keys, ciphertext, and plaintext omit Debug.
pub struct MediaDecryptor {
    cipher: aes::Aes256,
    previous: [u8; 16],
    mac: Hmac<Sha256>,
    encrypted_hash: Sha256,
    plain_hash: Sha256,
    pending: Vec<u8>,
    retained: Vec<u8>,
    encrypted_bytes: usize,
    plain_bytes: usize,
    encrypted_limit: usize,
    options: MediaDecryptOptions,
    finished: bool,
}
impl MediaDecryptor {
    pub fn new(keys: &MediaKeys, options: MediaDecryptOptions) -> Result<Self> {
        let encrypted_limit =
            crate::media::encrypted_limit(options.max_bytes, options.file_length)?;
        let mut mac = <Hmac<Sha256> as Mac>::new_from_slice(&keys.mac_key)
            .map_err(|_| configuration("media keys"))?;
        mac.update(&keys.iv);
        Ok(Self {
            cipher: aes::Aes256::new(&keys.cipher_key.into()),
            previous: keys.iv,
            mac,
            encrypted_hash: Sha256::new(),
            plain_hash: Sha256::new(),
            pending: Vec::new(),
            retained: Vec::new(),
            encrypted_bytes: 0,
            plain_bytes: 0,
            encrypted_limit,
            options,
            finished: false,
        })
    }
    pub fn update(&mut self, chunk: &[u8]) -> Result<Vec<u8>> {
        if self.finished {
            return Err(configuration("media decryptor already finished"));
        }
        if self.options.cancellation.is_cancelled() {
            return Err(cancelled());
        }
        if chunk.len() > self.encrypted_limit.saturating_sub(self.encrypted_bytes) {
            self.finished = true;
            return Err(integrity(
                "media_too_large",
                "Media exceeds the permitted size.",
            ));
        }
        self.encrypted_bytes += chunk.len();
        self.encrypted_hash.update(chunk);
        self.pending.extend_from_slice(chunk);
        // Keep the last CBC block and MAC10 until finalization. At most 41 bytes
        // remain between updates, independent of chunk boundaries.
        let blocks = self.pending.len().saturating_sub(26) / 16;
        let count = blocks * 16;
        let input: Vec<u8> = self.pending.drain(..count).collect();
        let mut output = Vec::with_capacity(count);
        for block in input.chunks_exact(16) {
            output.extend_from_slice(&self.block(block));
        }
        self.emit(output)
    }
    fn block(&mut self, ciphertext: &[u8]) -> [u8; 16] {
        self.mac.update(ciphertext);
        let mut block = aes::cipher::Block::<aes::Aes256>::clone_from_slice(ciphertext);
        self.cipher.decrypt_block(&mut block);
        for (byte, previous) in block.iter_mut().zip(self.previous) {
            *byte ^= previous;
        }
        self.previous.copy_from_slice(ciphertext);
        block.into()
    }
    fn emit(&mut self, bytes: Vec<u8>) -> Result<Vec<u8>> {
        if bytes.len() > self.options.max_bytes.saturating_sub(self.plain_bytes) {
            self.finished = true;
            return Err(integrity(
                "media_too_large",
                "Media exceeds the permitted size.",
            ));
        }
        self.plain_bytes += bytes.len();
        self.plain_hash.update(&bytes);
        if self.options.verify == MediaVerifyMode::BeforeRelease {
            self.retained.extend_from_slice(&bytes);
            Ok(Vec::new())
        } else {
            Ok(bytes)
        }
    }
    pub fn finish(mut self) -> Result<Vec<u8>> {
        if self.finished {
            return Err(configuration("media decryptor already finished"));
        }
        self.finished = true;
        if self.options.cancellation.is_cancelled() {
            return Err(cancelled());
        }
        if self.encrypted_bytes <= 10 {
            return Err(integrity(
                "media_too_short",
                "Encrypted media is too short.",
            ));
        }
        if self.options.file_enc_sha256.is_some_and(|hash| {
            !bool::from(
                self.encrypted_hash
                    .clone()
                    .finalize()
                    .as_slice()
                    .ct_eq(&hash),
            )
        }) {
            return Err(integrity(
                "media_enc_hash_mismatch",
                "Encrypted media hash does not match.",
            ));
        }
        if self.pending.len() != 26 {
            return Err(integrity(
                "media_invalid_ciphertext",
                "Ciphertext is not a whole number of blocks.",
            ));
        }
        let tail: [u8; 16] = self.pending[..16].try_into().unwrap();
        let plaintext = self.block(&tail);
        if !bool::from(self.mac.clone().finalize().into_bytes()[..10].ct_eq(&self.pending[16..])) {
            return Err(integrity("media_mac_mismatch", "Media MAC does not match."));
        }
        let pad = usize::from(plaintext[15]);
        if pad == 0
            || pad > 16
            || plaintext[16 - pad..]
                .iter()
                .any(|byte| usize::from(*byte) != pad)
        {
            return Err(integrity(
                "media_invalid_padding",
                "Media padding is invalid.",
            ));
        }
        let output = self.emit(plaintext[..16 - pad].to_vec())?;
        if self
            .options
            .file_sha256
            .is_some_and(|hash| !bool::from(self.plain_hash.finalize().as_slice().ct_eq(&hash)))
        {
            return Err(integrity(
                "media_hash_mismatch",
                "Decrypted media hash does not match.",
            ));
        }
        if self.options.verify == MediaVerifyMode::BeforeRelease {
            Ok(self.retained)
        } else {
            Ok(output)
        }
    }
}
/// Read once. Default verification yields no bytes before final verification.
pub fn decrypt_stream(
    source: MediaByteStream,
    keys: MediaKeys,
    options: MediaDecryptOptions,
) -> Result<MediaByteStream> {
    let cancellation = options.cancellation.clone();
    let mut decryptor = MediaDecryptor::new(&keys, options)?;
    let stream = async_stream::try_stream! {
        let mut source = source;
        loop {
            let chunk = tokio::select! { _=cancellation.cancelled()=>Err(cancelled()), chunk=source.next()=>Ok(chunk) }?;
            let Some(chunk) = chunk else { break; };
            let output = decryptor.update(&chunk?)?;
            if !output.is_empty() { yield Bytes::from(output); }
        }
        let output = decryptor.finish()?;
        if !output.is_empty() { yield Bytes::from(output); }
    };
    Ok(Box::pin(stream))
}
struct PartialFile(PathBuf);
impl Drop for PartialFile {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.0);
    }
}
fn file_error() -> Error {
    Error::local(
        ErrorKind::Connection,
        "Cannot write the verified media file.",
        "media_file_error",
    )
}
#[derive(Clone)]
pub struct MediaFileOptions {
    pub max_bytes: usize,
    pub cancellation: CancellationToken,
}
impl Default for MediaFileOptions {
    fn default() -> Self {
        Self {
            max_bytes: DEFAULT_MAX_BYTES,
            cancellation: CancellationToken::new(),
        }
    }
}
/// Write a sibling private partial file, then atomically rename after complete
/// source completion. Pass `decrypt_stream` for integrity verification; its
/// terminal error prevents promotion. Errors, cancellation, and dropped futures
/// remove the partial file on Unix. Existing targets remain intact on failure.
pub async fn write_to_file(
    mut body: MediaByteStream,
    destination: impl AsRef<Path>,
    options: MediaFileOptions,
) -> Result<()> {
    if options.max_bytes == 0 {
        return Err(configuration("max_bytes"));
    }
    let cancellation = options.cancellation;
    if cancellation.is_cancelled() {
        return Err(cancelled());
    }
    let destination = destination.as_ref();
    let parent = destination
        .parent()
        .filter(|p| !p.as_os_str().is_empty())
        .unwrap_or_else(|| Path::new("."));
    let partial =
        PartialFile(parent.join(format!(".polymorfa-media-{}.part", uuid::Uuid::new_v4())));
    let mut file_options = std::fs::OpenOptions::new();
    file_options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        file_options.mode(0o600);
    }
    let mut file =
        tokio::fs::File::from_std(file_options.open(&partial.0).map_err(|_| file_error())?);
    let mut written = 0usize;
    loop {
        let chunk = tokio::select! { _=cancellation.cancelled()=>return Err(cancelled()),chunk=body.next()=>chunk };
        let Some(chunk) = chunk else {
            break;
        };
        let bytes = chunk?;
        if bytes.len() > options.max_bytes.saturating_sub(written) {
            return Err(integrity(
                "media_too_large",
                "Media exceeds the permitted size.",
            ));
        }
        written += bytes.len();
        tokio::select! { _=cancellation.cancelled()=>return Err(cancelled()),result=file.write_all(&bytes)=>result.map_err(|_|file_error())? }
    }
    file.sync_all().await.map_err(|_| file_error())?;
    if cancellation.is_cancelled() {
        return Err(cancelled());
    }
    drop(file);
    tokio::fs::rename(&partial.0, destination)
        .await
        .map_err(|_| file_error())?;
    Ok(())
}
