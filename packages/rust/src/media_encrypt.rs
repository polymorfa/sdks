//! WhatsApp media encryption. Cellar 1049950004 WAMediaCrypto.js:75-101.
//! AES-CBC/PKCS#7, HMAC(iv || ciphertext) truncated to ten bytes; hash the complete upload.
use crate::{
    media::{MediaKeys, MediaKind, DEFAULT_MAX_BYTES},
    Error, ErrorKind, Result,
};
use aes::{
    cipher::{BlockEncrypt, KeyInit},
    Aes256,
};
use futures_util::{Stream, StreamExt as _};
use hmac::{Hmac, Mac};
use sha2::{Digest, Sha256};
use std::pin::Pin;
use tokio_util::sync::CancellationToken;
#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum UploadMediaType {
    Image,
    Video,
    Audio,
    Ptt,
    Document,
    Sticker,
}
impl UploadMediaType {
    pub fn media_kind(self) -> MediaKind {
        match self {
            Self::Image => MediaKind::Image,
            Self::Video => MediaKind::Video,
            Self::Audio | Self::Ptt => MediaKind::Audio,
            Self::Document => MediaKind::Document,
            Self::Sticker => MediaKind::Sticker,
        }
    }
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Image => "image",
            Self::Video => "video",
            Self::Audio => "audio",
            Self::Ptt => "ptt",
            Self::Document => "document",
            Self::Sticker => "sticker",
        }
    }
    pub(crate) fn upload_path(self) -> &'static str {
        match self {
            Self::Image => "/mms/image",
            Self::Video => "/mms/video",
            Self::Audio => "/mms/audio",
            Self::Ptt => "/mms/ptt",
            Self::Document => "/mms/document",
            Self::Sticker => "/mms/sticker",
        }
    }
    pub(crate) fn api_type(self) -> &'static str {
        match self {
            Self::Audio | Self::Ptt => "voice",
            Self::Document => "file",
            _ => self.as_str(),
        }
    }
}
#[derive(Clone)]
pub struct MediaEncryptionOptions {
    pub media_type: UploadMediaType,
    pub media_key: Option<[u8; 32]>,
    pub mimetype: Option<String>,
    pub max_bytes: usize,
    pub cancellation: CancellationToken,
}
impl MediaEncryptionOptions {
    pub fn new(media_type: UploadMediaType) -> Self {
        Self {
            media_type,
            media_key: None,
            mimetype: None,
            max_bytes: DEFAULT_MAX_BYTES,
            cancellation: CancellationToken::new(),
        }
    }
}
/// Media keys, descriptors, bodies and digests deliberately omit Debug.
#[derive(Clone)]
pub struct EncryptedMediaInfo {
    pub media_type: UploadMediaType,
    pub media_key: [u8; 32],
    pub file_sha256: [u8; 32],
    pub file_enc_sha256: [u8; 32],
    pub file_length: u64,
    pub encrypted_length: u64,
    pub mimetype: Option<String>,
}
pub struct EncryptedMedia {
    pub info: EncryptedMediaInfo,
    pub ciphertext: Vec<u8>,
}
pub type MediaInputStream = Pin<Box<dyn Stream<Item = Result<bytes::Bytes>> + Send>>;
pub struct EncryptedMediaStream {
    pub body: MediaInputStream,
    pub info: tokio::sync::oneshot::Receiver<Result<EncryptedMediaInfo>>,
}
pub fn encrypted_length(length: u64) -> Result<u64> {
    length
        .checked_div(16)
        .and_then(|n| n.checked_add(1))
        .and_then(|n| n.checked_mul(16))
        .and_then(|n| n.checked_add(10))
        .ok_or_else(|| crate::transport::configuration("media length"))
}
pub fn generate_media_key() -> [u8; 32] {
    rand::random()
}
struct Encryptor {
    cipher: Aes256,
    previous: [u8; 16],
    pending: Vec<u8>,
    mac: Hmac<Sha256>,
    plain: Sha256,
    encrypted: Sha256,
    length: u64,
    maximum: usize,
}
impl Encryptor {
    fn new(keys: MediaKeys, maximum: usize) -> Result<Self> {
        if maximum == 0 {
            return Err(crate::transport::configuration("maxBytes"));
        }
        let mut mac = <Hmac<Sha256> as Mac>::new_from_slice(&keys.mac_key)
            .expect("HMAC accepts every key length");
        mac.update(&keys.iv);
        Ok(Self {
            cipher: Aes256::new_from_slice(&keys.cipher_key).expect("32-byte AES key"),
            previous: keys.iv,
            pending: Vec::new(),
            mac,
            plain: Sha256::new(),
            encrypted: Sha256::new(),
            length: 0,
            maximum,
        })
    }
    fn block(&mut self, block: &[u8]) -> Vec<u8> {
        let mut value = self.previous;
        for (i, b) in block.iter().enumerate() {
            value[i] ^= b;
        }
        self.cipher.encrypt_block((&mut value).into());
        self.previous = value;
        self.mac.update(&value);
        self.encrypted.update(value);
        value.to_vec()
    }
    fn update(&mut self, input: &[u8]) -> Result<Vec<u8>> {
        self.length = self.length.saturating_add(input.len() as u64);
        if self.length > self.maximum as u64 {
            return Err(too_large());
        }
        self.plain.update(input);
        let mut output = Vec::with_capacity(input.len() + 16);
        let mut offset = 0;
        if !self.pending.is_empty() {
            let need = (16 - self.pending.len()).min(input.len());
            self.pending.extend_from_slice(&input[..need]);
            offset = need;
            if self.pending.len() == 16 {
                let block = std::mem::take(&mut self.pending);
                output.extend_from_slice(&self.block(&block));
            }
        }
        while input.len() - offset >= 16 {
            output.extend_from_slice(&self.block(&input[offset..offset + 16]));
            offset += 16;
        }
        self.pending.extend_from_slice(&input[offset..]);
        Ok(output)
    }
    fn finish(mut self) -> (Vec<u8>, [u8; 32], [u8; 32], u64) {
        let mut padding = std::mem::take(&mut self.pending);
        let n = 16 - padding.len();
        padding.resize(16, n as u8);
        let mut tail = self.block(&padding);
        let mac = self.mac.finalize().into_bytes();
        tail.extend_from_slice(&mac[..10]);
        self.encrypted.update(&mac[..10]);
        (
            tail,
            self.plain.finalize().into(),
            self.encrypted.finalize().into(),
            self.length,
        )
    }
}
fn too_large() -> Error {
    Error::local(
        ErrorKind::MediaIntegrity,
        "Media exceeds the permitted size.",
        "media_too_large",
    )
}
pub fn encrypt_media_stream(
    mut source: MediaInputStream,
    options: MediaEncryptionOptions,
) -> Result<EncryptedMediaStream> {
    if options.cancellation.is_cancelled() {
        return Err(crate::transport::cancelled());
    }
    let key = options.media_key.unwrap_or_else(generate_media_key);
    let keys = crate::media::derive_keys(&key, options.media_type.media_kind())?;
    let mut encryptor = Encryptor::new(keys, options.max_bytes)?;
    let (tx, rx) = tokio::sync::oneshot::channel();
    let body = async_stream::stream! {
        loop {
            let next=tokio::select! {biased;_=options.cancellation.cancelled()=>Some(Err(crate::transport::cancelled())),next=source.next()=>next};
            match next {
                Some(Ok(input))=>match encryptor.update(&input) {Ok(output)=>if !output.is_empty(){yield Ok(bytes::Bytes::from(output));},Err(error)=>{let _=tx.send(Err(error.clone()));yield Err(error);return;}},
                Some(Err(error))=>{let _=tx.send(Err(error.clone()));yield Err(error);return;},
                None=>break,
            }
        }
        if options.cancellation.is_cancelled(){let error=crate::transport::cancelled();let _=tx.send(Err(error.clone()));yield Err(error);return;}
        let(tail,file_sha256,file_enc_sha256,file_length)=encryptor.finish();
        let info=EncryptedMediaInfo {media_type:options.media_type,media_key:key,file_sha256,file_enc_sha256,file_length,encrypted_length:(file_length/16+1)*16+10,mimetype:options.mimetype};
        yield Ok(bytes::Bytes::from(tail));let _=tx.send(Ok(info));
    };
    Ok(EncryptedMediaStream {
        body: Box::pin(body),
        info: rx,
    })
}
pub async fn encrypt_media(
    input: &[u8],
    options: MediaEncryptionOptions,
) -> Result<EncryptedMedia> {
    if input.len() > options.max_bytes {
        return Err(too_large());
    }
    let source = Box::pin(futures_util::stream::iter([Ok(
        bytes::Bytes::copy_from_slice(input),
    )]));
    let mut encrypted = encrypt_media_stream(source, options)?;
    let mut ciphertext = Vec::new();
    while let Some(chunk) = encrypted.body.next().await {
        ciphertext.extend_from_slice(&chunk?);
    }
    let info = encrypted
        .info
        .await
        .map_err(|_| crate::transport::cancelled())??;
    Ok(EncryptedMedia { info, ciphertext })
}
