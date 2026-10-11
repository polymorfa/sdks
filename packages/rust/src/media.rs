//! Existing WhatsApp CDN media download and authenticated local decryption.
//! Descriptors and keys deliberately do not implement Debug.
use crate::{Error, ErrorKind, Result};
use aes::cipher::{block_padding::Pkcs7, BlockDecryptMut, KeyIvInit};
use base64::{
    engine::general_purpose::{STANDARD, STANDARD_NO_PAD, URL_SAFE_NO_PAD},
    Engine,
};
use futures_util::StreamExt;
use hmac::{Hmac, Mac};
use sha2::{Digest, Sha256};
use std::{sync::Arc, time::Duration};
use subtle::ConstantTimeEq;
use tokio_util::sync::CancellationToken;

pub const DEFAULT_MAX_BYTES: usize = 256 * 1024 * 1024;
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MediaKind {
    Image,
    Video,
    Audio,
    Document,
    Sticker,
}
impl MediaKind {
    fn info(self) -> &'static [u8] {
        match self {
            Self::Image | Self::Sticker => b"WhatsApp Image Keys",
            Self::Video => b"WhatsApp Video Keys",
            Self::Audio => b"WhatsApp Audio Keys",
            Self::Document => b"WhatsApp Document Keys",
        }
    }
    fn mms(self) -> &'static str {
        match self {
            Self::Image | Self::Sticker => "image",
            Self::Video => "video",
            Self::Audio => "audio",
            Self::Document => "document",
        }
    }
    fn mimetype(self) -> &'static str {
        match self {
            Self::Image => "image/jpeg",
            Self::Video => "video/mp4",
            Self::Audio => "audio/ogg",
            Self::Document => "application/octet-stream",
            Self::Sticker => "image/webp",
        }
    }
    fn fields(self) -> Fields {
        match self {
            Self::Image => Fields {
                url: 1,
                mimetype: 2,
                sha: 4,
                length: 5,
                key: 8,
                encrypted_sha: 9,
                path: 11,
                name: None,
            },
            Self::Video => Fields {
                url: 1,
                mimetype: 2,
                sha: 3,
                length: 4,
                key: 6,
                encrypted_sha: 11,
                path: 13,
                name: None,
            },
            Self::Audio => Fields {
                url: 1,
                mimetype: 2,
                sha: 3,
                length: 4,
                key: 7,
                encrypted_sha: 8,
                path: 9,
                name: None,
            },
            Self::Document => Fields {
                url: 1,
                mimetype: 2,
                sha: 4,
                length: 5,
                key: 7,
                encrypted_sha: 9,
                path: 10,
                name: Some(8),
            },
            Self::Sticker => Fields {
                url: 1,
                mimetype: 5,
                sha: 2,
                length: 9,
                key: 4,
                encrypted_sha: 3,
                path: 8,
                name: None,
            },
        }
    }
}
impl std::str::FromStr for MediaKind {
    type Err = Error;
    fn from_str(value: &str) -> Result<Self> {
        match value {
            "image" => Ok(Self::Image),
            "video" => Ok(Self::Video),
            "audio" => Ok(Self::Audio),
            "document" => Ok(Self::Document),
            "sticker" => Ok(Self::Sticker),
            _ => Err(invalid()),
        }
    }
}
#[derive(Clone)]
pub struct MediaDescriptor {
    pub media_kind: MediaKind,
    pub url: Option<String>,
    pub direct_path: Option<String>,
    pub media_key: [u8; 32],
    pub file_sha256: Option<[u8; 32]>,
    pub file_enc_sha256: Option<[u8; 32]>,
    pub file_length: Option<u64>,
    pub mimetype: Option<String>,
    pub file_name: Option<String>,
}
#[derive(Clone)]
pub struct MediaKeys {
    pub iv: [u8; 16],
    pub cipher_key: [u8; 32],
    pub mac_key: [u8; 32],
}
#[derive(Clone)]
pub struct MediaDownloadOptions {
    pub max_bytes: usize,
    pub timeout: Duration,
    pub cancellation: CancellationToken,
    pub configure_http:
        Option<Arc<dyn Fn(reqwest::ClientBuilder) -> reqwest::ClientBuilder + Send + Sync>>,
}
impl Default for MediaDownloadOptions {
    fn default() -> Self {
        Self {
            max_bytes: DEFAULT_MAX_BYTES,
            timeout: Duration::from_secs(30),
            cancellation: CancellationToken::new(),
            configure_http: None,
        }
    }
}
pub struct MediaDownload {
    pub bytes: Vec<u8>,
    pub media_kind: MediaKind,
    pub mimetype: String,
    pub file_name: Option<String>,
    pub file_length: Option<u64>,
}
struct Fields {
    url: u64,
    mimetype: u64,
    sha: u64,
    length: u64,
    key: u64,
    encrypted_sha: u64,
    path: u64,
    name: Option<u64>,
}
struct ProtoReader<'a> {
    bytes: &'a [u8],
    offset: usize,
}
impl<'a> ProtoReader<'a> {
    fn varint(&mut self) -> Result<u64> {
        let mut value = 0u64;
        for index in 0..10 {
            let byte = *self.bytes.get(self.offset).ok_or_else(invalid)?;
            self.offset += 1;
            if index == 9 && byte > 1 {
                return Err(invalid());
            }
            value |= u64::from(byte & 127) << (index * 7);
            if byte & 128 == 0 {
                return Ok(value);
            }
        }
        Err(invalid())
    }
    fn bytes(&mut self) -> Result<&'a [u8]> {
        let length = usize::try_from(self.varint()?).map_err(|_| invalid())?;
        let end = self
            .offset
            .checked_add(length)
            .filter(|end| *end <= self.bytes.len())
            .ok_or_else(invalid)?;
        let value = &self.bytes[self.offset..end];
        self.offset = end;
        Ok(value)
    }
    fn skip(&mut self, wire: u64) -> Result<()> {
        match wire {
            0 => {
                self.varint()?;
            }
            2 => {
                self.bytes()?;
            }
            1 | 5 => {
                let size = if wire == 1 { 8 } else { 4 };
                self.offset = self
                    .offset
                    .checked_add(size)
                    .filter(|end| *end <= self.bytes.len())
                    .ok_or_else(invalid)?;
            }
            _ => return Err(invalid()),
        }
        Ok(())
    }
}
/// Decode the untrusted base64 protobuf attachment field from a verified webhook.
pub fn decode_descriptor(base64: &str, kind: MediaKind) -> Result<MediaDescriptor> {
    if base64.is_empty() || base64.len() > 1024 * 1024 {
        return Err(invalid());
    }
    let normalized = base64.replace('-', "+").replace('_', "/");
    let bytes = STANDARD
        .decode(&normalized)
        .or_else(|_| STANDARD_NO_PAD.decode(&normalized))
        .map_err(|_| invalid())?;
    let mut reader = ProtoReader {
        bytes: &bytes,
        offset: 0,
    };
    let fields = kind.fields();
    let mut out = MediaDescriptor {
        media_kind: kind,
        url: None,
        direct_path: None,
        media_key: [0; 32],
        file_sha256: None,
        file_enc_sha256: None,
        file_length: None,
        mimetype: None,
        file_name: None,
    };
    let mut key_found = false;
    while reader.offset < bytes.len() {
        let tag = reader.varint()?;
        let field = tag / 8;
        let wire = tag % 8;
        if field == 0 {
            return Err(invalid());
        }
        if field == fields.length && wire == 0 {
            let length = reader.varint()?;
            if length > 9_007_199_254_740_991 {
                return Err(invalid());
            }
            out.file_length = Some(length);
            continue;
        }
        if wire != 2 {
            reader.skip(wire)?;
            continue;
        }
        let value = reader.bytes()?;
        if field == fields.url {
            out.url = Some(text(value, 8192)?);
        } else if field == fields.path {
            out.direct_path = Some(text(value, 8192)?);
        } else if field == fields.mimetype {
            out.mimetype = Some(text(value, 255)?);
        } else if Some(field) == fields.name {
            out.file_name = Some(text(value, 4096)?);
        } else if field == fields.sha {
            out.file_sha256 = Some(value.try_into().map_err(|_| invalid())?);
        } else if field == fields.encrypted_sha {
            out.file_enc_sha256 = Some(value.try_into().map_err(|_| invalid())?);
        } else if field == fields.key {
            out.media_key = value.try_into().map_err(|_| invalid())?;
            key_found = true;
        }
    }
    if !key_found {
        return Err(invalid());
    }
    Ok(out)
}
fn text(bytes: &[u8], limit: usize) -> Result<String> {
    if bytes.len() > limit {
        return Err(invalid());
    }
    Ok(std::str::from_utf8(bytes)
        .map_err(|_| invalid())?
        .to_owned())
}
fn invalid() -> Error {
    Error::local(
        ErrorKind::MediaIntegrity,
        "Invalid WhatsApp media descriptor.",
        "media_invalid_descriptor",
    )
}
fn integrity(code: &str, message: &str) -> Error {
    Error::local(ErrorKind::MediaIntegrity, message, code)
}
pub fn derive_keys(media_key: &[u8; 32], kind: MediaKind) -> Result<MediaKeys> {
    let hkdf = hkdf::Hkdf::<Sha256>::new(None, media_key);
    let mut material = [0u8; 112];
    hkdf.expand(kind.info(), &mut material)
        .map_err(|_| invalid())?;
    Ok(MediaKeys {
        iv: material[..16].try_into().unwrap(),
        cipher_key: material[16..48].try_into().unwrap(),
        mac_key: material[48..80].try_into().unwrap(),
    })
}
/// Verify both hashes and the MAC before exposing any plaintext.
pub fn decrypt(
    encrypted: &[u8],
    keys: &MediaKeys,
    file_sha256: Option<&[u8; 32]>,
    file_enc_sha256: Option<&[u8; 32]>,
    max_bytes: usize,
) -> Result<Vec<u8>> {
    if max_bytes == 0 {
        return Err(crate::transport::configuration("max_bytes"));
    }
    if encrypted.len() <= 10 {
        return Err(integrity(
            "media_too_short",
            "Encrypted media is too short.",
        ));
    }
    if encrypted.len() > encrypted_limit(max_bytes, None)? {
        return Err(integrity(
            "media_too_large",
            "Media exceeds the permitted size.",
        ));
    }
    if file_enc_sha256
        .is_some_and(|expected| !bool::from(Sha256::digest(encrypted).as_slice().ct_eq(expected)))
    {
        return Err(integrity(
            "media_enc_hash_mismatch",
            "Encrypted media hash does not match.",
        ));
    }
    let split = encrypted.len() - 10;
    let ciphertext = &encrypted[..split];
    let mut mac = <Hmac<Sha256> as Mac>::new_from_slice(&keys.mac_key).map_err(|_| invalid())?;
    mac.update(&keys.iv);
    mac.update(ciphertext);
    if !bool::from(mac.finalize().into_bytes()[..10].ct_eq(&encrypted[split..])) {
        return Err(integrity("media_mac_mismatch", "Media MAC does not match."));
    }
    if ciphertext.is_empty() || ciphertext.len() % 16 != 0 {
        return Err(integrity(
            "media_invalid_ciphertext",
            "Ciphertext is not a whole number of blocks.",
        ));
    }
    let plaintext = cbc::Decryptor::<aes::Aes256>::new(&keys.cipher_key.into(), &keys.iv.into())
        .decrypt_padded_vec_mut::<Pkcs7>(ciphertext)
        .map_err(|_| integrity("media_invalid_padding", "Media padding is invalid."))?;
    if plaintext.len() > max_bytes {
        return Err(integrity(
            "media_too_large",
            "Media exceeds the permitted size.",
        ));
    }
    if file_sha256
        .is_some_and(|expected| !bool::from(Sha256::digest(&plaintext).as_slice().ct_eq(expected)))
    {
        return Err(integrity(
            "media_hash_mismatch",
            "Decrypted media hash does not match.",
        ));
    }
    Ok(plaintext)
}
fn encrypted_limit(max_bytes: usize, file_length: Option<u64>) -> Result<usize> {
    if max_bytes == 0 {
        return Err(crate::transport::configuration("max_bytes"));
    }
    if file_length.is_some_and(|length| length > max_bytes as u64) {
        return Err(integrity(
            "media_too_large",
            "Media exceeds the permitted size.",
        ));
    }
    let plain = file_length
        .map(|length| length as usize)
        .unwrap_or(max_bytes)
        .min(max_bytes);
    (plain / 16)
        .checked_add(1)
        .and_then(|blocks| blocks.checked_mul(16))
        .and_then(|bytes| bytes.checked_add(10))
        .ok_or_else(|| crate::transport::configuration("max_bytes"))
}
pub fn is_whatsapp_media_url(value: &str) -> bool {
    let Ok(url) = url::Url::parse(value) else {
        return false;
    };
    url.scheme() == "https"
        && url.port().is_none()
        && url.username().is_empty()
        && url.password().is_none()
        && url
            .host_str()
            .is_some_and(|host| host == "whatsapp.net" || host.ends_with(".whatsapp.net"))
}
pub fn candidate_urls(descriptor: &MediaDescriptor) -> Result<Vec<String>> {
    let mut urls = Vec::new();
    if let Some(url) = descriptor.url.as_ref().filter(|v| !v.is_empty()) {
        if !is_whatsapp_media_url(url) {
            return Err(invalid());
        }
        urls.push(url.clone());
    }
    if let Some(path) = descriptor.direct_path.as_ref().filter(|v| !v.is_empty()) {
        if !path.starts_with('/') || path.starts_with("//") {
            return Err(invalid());
        }
        let hash = descriptor
            .file_enc_sha256
            .as_ref()
            .map(|v| format!("{}=", URL_SAFE_NO_PAD.encode(v)))
            .unwrap_or_default();
        let separator = if path.contains('?') { "&" } else { "?" };
        let fallback = format!(
            "https://mmg.whatsapp.net{path}{separator}hash={}&mms-type={}&__wa-mms=",
            crate::transport::encode(&hash),
            descriptor.media_kind.mms()
        );
        if !is_whatsapp_media_url(&fallback) {
            return Err(invalid());
        }
        if !urls.contains(&fallback) {
            urls.push(fallback);
        }
    }
    if urls.is_empty() {
        return Err(invalid());
    }
    Ok(urls)
}
/// Download directly from allowed WhatsApp hosts without Polymorfa credentials.
/// Errors omit descriptor URLs, keys, ciphertext, and message contents.
pub async fn download(
    descriptor: &MediaDescriptor,
    options: MediaDownloadOptions,
) -> Result<MediaDownload> {
    let limit = encrypted_limit(options.max_bytes, descriptor.file_length)?;
    let sha = descriptor.file_sha256.as_ref().ok_or_else(invalid)?;
    let urls = candidate_urls(descriptor)?;
    let keys = derive_keys(&descriptor.media_key, descriptor.media_kind)?;
    let mut builder = reqwest::Client::builder();
    if let Some(configure) = &options.configure_http {
        builder = configure(builder);
    }
    let client = builder
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|_| crate::transport::configuration("media transport"))?;
    let mut last_error = Error::local(
        ErrorKind::Connection,
        "Cannot reach WhatsApp media.",
        "connection_error",
    );
    for mut current in urls {
        let mut response = None;
        for hop in 0..=3 {
            let request = client
                .get(&current)
                .header("origin", "https://web.whatsapp.com")
                .header("referer", "https://web.whatsapp.com/");
            let result = tokio::select! { _=options.cancellation.cancelled()=>return Err(crate::transport::cancelled()),result=tokio::time::timeout(options.timeout,request.send())=>result };
            let candidate = match result {
                Ok(Ok(response)) => response,
                _ => {
                    last_error = Error::local(
                        ErrorKind::Connection,
                        "Cannot reach WhatsApp media.",
                        "connection_error",
                    );
                    break;
                }
            };
            if matches!(candidate.status().as_u16(), 301 | 302 | 303 | 307 | 308) {
                let location = candidate
                    .headers()
                    .get("location")
                    .and_then(|v| v.to_str().ok())
                    .ok_or_else(invalid)?;
                let next = url::Url::parse(&current)
                    .and_then(|url| url.join(location))
                    .map_err(|_| invalid())?;
                if !is_whatsapp_media_url(next.as_str()) {
                    return Err(invalid());
                }
                if hop == 3 {
                    return Err(Error::local(
                        ErrorKind::Connection,
                        "Too many media redirects.",
                        "connection_error",
                    ));
                }
                current = next.to_string();
                continue;
            }
            if candidate.status().is_success() {
                response = Some(candidate);
            } else {
                last_error = Error::local(
                    ErrorKind::Api,
                    format!(
                        "WhatsApp media returned HTTP {}.",
                        candidate.status().as_u16()
                    ),
                    "media_download_failed",
                );
            }
            break;
        }
        let Some(response) = response else {
            continue;
        };
        if response
            .content_length()
            .is_some_and(|length| length > limit as u64)
        {
            return Err(integrity(
                "media_too_large",
                "Media exceeds the permitted size.",
            ));
        }
        let mut encrypted = Vec::new();
        let mut stream = response.bytes_stream();
        loop {
            let next = tokio::select! { _=options.cancellation.cancelled()=>return Err(crate::transport::cancelled()),result=tokio::time::timeout(options.timeout,stream.next())=>result.map_err(|_|Error::local(ErrorKind::Timeout,"Media stream timed out.","request_timeout"))? };
            match next {
                None => break,
                Some(Ok(bytes)) => {
                    if bytes.len() > limit - encrypted.len() {
                        return Err(integrity(
                            "media_too_large",
                            "Media exceeds the permitted size.",
                        ));
                    }
                    encrypted.extend_from_slice(&bytes);
                }
                Some(Err(_)) => {
                    return Err(Error::local(
                        ErrorKind::Connection,
                        "WhatsApp media stream interrupted.",
                        "connection_error",
                    ))
                }
            }
        }
        let bytes = decrypt(
            &encrypted,
            &keys,
            Some(sha),
            descriptor.file_enc_sha256.as_ref(),
            options.max_bytes,
        )?;
        return Ok(MediaDownload {
            bytes,
            media_kind: descriptor.media_kind,
            mimetype: descriptor
                .mimetype
                .clone()
                .unwrap_or_else(|| descriptor.media_kind.mimetype().into()),
            file_name: descriptor.file_name.clone(),
            file_length: descriptor.file_length,
        });
    }
    Err(last_error)
}
