//! Verified direct history, without normalization or Signal-core dependencies.
//! Cellar 1049950004 WAMediaHkdfInfo.js:14; WAWebHandleHistorySyncChunk.js:134-136.
use crate::{
    media::{MediaDescriptor, MediaDownloadOptions, MediaKeys, MediaKind},
    Error, ErrorKind, Result,
};
use futures_util::StreamExt as _;
use sha2::Sha256;
use std::io::Read;
pub const DEFAULT_MAX_INFLATED_BYTES: usize = 512 * 1024 * 1024;
/// A field preserves its exact wire bytes, including unknown fields and full-width integers.
#[derive(Clone)]
pub struct ProtoField {
    pub number: u32,
    pub wire_type: u8,
    pub encoded: Vec<u8>,
    pub varint: Option<u64>,
    pub bytes: Option<Vec<u8>>,
}
#[derive(Clone)]
pub struct ProtoMessage {
    pub encoded: Vec<u8>,
    pub fields: Vec<ProtoField>,
}
impl ProtoMessage {
    pub fn decode(bytes: &[u8]) -> Result<Self> {
        fn varint(bytes: &[u8], offset: &mut usize) -> Result<u64> {
            let mut n = 0;
            for shift in (0..70).step_by(7) {
                let byte = *bytes.get(*offset).ok_or_else(invalid)?;
                *offset += 1;
                if shift == 63 && byte > 1 {
                    return Err(invalid());
                }
                n |= u64::from(byte & 127) << shift;
                if byte & 128 == 0 {
                    return Ok(n);
                }
            }
            Err(invalid())
        }
        fn skip_group(bytes: &[u8], offset: &mut usize, number: u32, depth: usize) -> Result<()> {
            if depth >= 64 {
                return Err(invalid());
            }
            loop {
                let tag = varint(bytes, offset)?;
                let field = u32::try_from(tag >> 3)
                    .ok()
                    .filter(|n| *n > 0 && *n < 1 << 29)
                    .ok_or_else(invalid)?;
                match tag & 7 {
                    0 => {
                        varint(bytes, offset)?;
                    }
                    1 | 5 => {
                        let size = if tag & 7 == 1 { 8 } else { 4 };
                        *offset = offset
                            .checked_add(size)
                            .filter(|e| *e <= bytes.len())
                            .ok_or_else(invalid)?;
                    }
                    2 => {
                        let size =
                            usize::try_from(varint(bytes, offset)?).map_err(|_| invalid())?;
                        *offset = offset
                            .checked_add(size)
                            .filter(|e| *e <= bytes.len())
                            .ok_or_else(invalid)?;
                    }
                    3 => skip_group(bytes, offset, field, depth + 1)?,
                    4 => {
                        if field != number {
                            return Err(invalid());
                        }
                        return Ok(());
                    }
                    _ => return Err(invalid()),
                }
            }
        }
        let mut offset = 0;
        let mut fields = Vec::new();
        while offset < bytes.len() {
            let start = offset;
            let tag = varint(bytes, &mut offset)?;
            let number = u32::try_from(tag >> 3)
                .ok()
                .filter(|n| *n > 0 && *n < 1 << 29)
                .ok_or_else(invalid)?;
            let wire_type = (tag & 7) as u8;
            let (mut value, mut payload) = (None, None);
            match wire_type {
                0 => value = Some(varint(bytes, &mut offset)?),
                1 | 5 => {
                    let size = if wire_type == 1 { 8 } else { 4 };
                    let end = offset
                        .checked_add(size)
                        .filter(|e| *e <= bytes.len())
                        .ok_or_else(invalid)?;
                    payload = Some(bytes[offset..end].to_vec());
                    offset = end;
                }
                2 => {
                    let size =
                        usize::try_from(varint(bytes, &mut offset)?).map_err(|_| invalid())?;
                    let end = offset
                        .checked_add(size)
                        .filter(|e| *e <= bytes.len())
                        .ok_or_else(invalid)?;
                    payload = Some(bytes[offset..end].to_vec());
                    offset = end;
                }
                3 => skip_group(bytes, &mut offset, number, 0)?,
                _ => return Err(invalid()),
            }
            fields.push(ProtoField {
                number,
                wire_type,
                encoded: bytes[start..offset].to_vec(),
                varint: value,
                bytes: payload,
            });
        }
        Ok(Self {
            encoded: bytes.to_vec(),
            fields,
        })
    }
    pub fn uint64(&self, number: u32) -> Option<u64> {
        self.fields
            .iter()
            .rev()
            .find(|f| f.number == number && f.wire_type == 0)
            .and_then(|f| f.varint)
    }
    pub fn bytes(&self, number: u32) -> Option<&[u8]> {
        self.fields
            .iter()
            .rev()
            .find(|f| f.number == number && f.wire_type == 2)
            .and_then(|f| f.bytes.as_deref())
    }
    pub fn string(&self, number: u32) -> Result<Option<String>> {
        self.bytes(number)
            .map(|b| String::from_utf8(b.to_vec()).map_err(|_| invalid()))
            .transpose()
    }
    pub fn messages(&self, number: u32) -> Result<Vec<Self>> {
        self.fields
            .iter()
            .filter(|f| f.number == number && f.wire_type == 2)
            .map(|f| Self::decode(f.bytes.as_deref().unwrap_or_default()))
            .collect()
    }
}
/// Common typed fields plus every original field. `proto.encoded` can enter a caller's full-schema decoder.
#[derive(Clone)]
pub struct HistoryChunk {
    pub sync_type: u64,
    pub chunk_order: Option<u64>,
    pub progress: Option<u64>,
    pub conversations: Vec<HistoryConversation>,
    pub status_v3_messages: Vec<ProtoMessage>,
    pub pushnames: Vec<HistoryPushname>,
    pub proto: ProtoMessage,
}
#[derive(Clone)]
pub struct HistoryConversation {
    pub id: String,
    pub name: Option<String>,
    pub last_message_timestamp: Option<u64>,
    pub unread_count: Option<u64>,
    pub messages: Vec<ProtoMessage>,
    pub proto: ProtoMessage,
}
#[derive(Clone)]
pub struct HistoryPushname {
    pub id: Option<String>,
    pub pushname: Option<String>,
    pub proto: ProtoMessage,
}
impl HistoryChunk {
    pub fn decode_with<T>(&self, decoder: impl FnOnce(&[u8]) -> Result<T>) -> Result<T> {
        decoder(&self.proto.encoded)
    }
    pub fn from_proto(proto: ProtoMessage) -> Result<Self> {
        let conversations = proto
            .messages(2)?
            .into_iter()
            .map(|p| {
                Ok(HistoryConversation {
                    id: p.string(1)?.unwrap_or_default(),
                    name: p.string(13)?,
                    last_message_timestamp: p.uint64(5),
                    unread_count: p.uint64(6),
                    messages: p.messages(2)?,
                    proto: p,
                })
            })
            .collect::<Result<_>>()?;
        let pushnames = proto
            .messages(7)?
            .into_iter()
            .map(|p| {
                Ok(HistoryPushname {
                    id: p.string(1)?,
                    pushname: p.string(2)?,
                    proto: p,
                })
            })
            .collect::<Result<_>>()?;
        Ok(Self {
            sync_type: proto.uint64(1).unwrap_or(0),
            chunk_order: proto.uint64(5),
            progress: proto.uint64(6),
            conversations,
            status_v3_messages: proto.messages(3)?,
            pushnames,
            proto,
        })
    }
}
#[derive(Clone)]
pub struct HistoryChunkDescriptor {
    pub direct_path: String,
    pub media_key: [u8; 32],
    pub file_sha256: [u8; 32],
    pub file_enc_sha256: [u8; 32],
    pub file_length: Option<u64>,
}
pub enum HistoryChunkInput {
    Descriptor(HistoryChunkDescriptor),
    Inline(Vec<u8>),
}
#[derive(Clone)]
pub struct HistoryChunkOptions {
    pub media: MediaDownloadOptions,
    pub max_inflated_bytes: usize,
}
impl Default for HistoryChunkOptions {
    fn default() -> Self {
        Self {
            media: Default::default(),
            max_inflated_bytes: DEFAULT_MAX_INFLATED_BYTES,
        }
    }
}
fn invalid() -> Error {
    Error::local(
        ErrorKind::MediaIntegrity,
        "Invalid compressed history or protobuf payload.",
        "media_invalid_ciphertext",
    )
}
fn limit() -> Error {
    Error::local(
        ErrorKind::MediaIntegrity,
        "History exceeds its permitted size.",
        "media_too_large",
    )
}
pub fn decode_history_payload(compressed: &[u8], maximum: usize) -> Result<HistoryChunk> {
    if compressed.is_empty() {
        return Err(invalid());
    }
    if maximum == 0 || maximum > isize::MAX as usize {
        return Err(crate::transport::configuration("maxInflatedBytes"));
    }
    let reader: Box<dyn Read> = if compressed.starts_with(&[0x1f, 0x8b]) {
        Box::new(flate2::read::GzDecoder::new(compressed))
    } else if compressed.len() >= 2
        && compressed[0] & 15 == 8
        && ((u16::from(compressed[0]) << 8) | u16::from(compressed[1])) % 31 == 0
    {
        Box::new(flate2::read::ZlibDecoder::new(compressed))
    } else {
        Box::new(flate2::read::DeflateDecoder::new(compressed))
    };
    let mut inflated = Vec::new();
    reader
        .take(maximum as u64 + 1)
        .read_to_end(&mut inflated)
        .map_err(|_| invalid())?;
    if inflated.len() > maximum {
        return Err(limit());
    }
    HistoryChunk::from_proto(ProtoMessage::decode(&inflated)?)
}
pub async fn download_history_chunk(
    input: HistoryChunkInput,
    options: HistoryChunkOptions,
) -> Result<HistoryChunk> {
    if options.media.cancellation.is_cancelled() {
        return Err(crate::transport::cancelled());
    }
    if options.media.max_bytes == 0 {
        return Err(crate::transport::configuration("maxBytes"));
    }
    let compressed = match input {
        HistoryChunkInput::Inline(bytes) => {
            if bytes.len() > options.media.max_bytes {
                return Err(limit());
            }
            bytes
        }
        HistoryChunkInput::Descriptor(descriptor) => {
            let mut material = [0; 112];
            hkdf::Hkdf::<Sha256>::new(None, &descriptor.media_key)
                .expand(b"WhatsApp History Keys", &mut material)
                .map_err(|_| invalid())?;
            let keys = MediaKeys {
                iv: material[..16].try_into().unwrap(),
                cipher_key: material[16..48].try_into().unwrap(),
                mac_key: material[48..80].try_into().unwrap(),
            };
            let media = MediaDescriptor {
                media_kind: MediaKind::Document,
                media_key: descriptor.media_key,
                url: None,
                direct_path: Some(descriptor.direct_path),
                file_sha256: Some(descriptor.file_sha256),
                file_enc_sha256: Some(descriptor.file_enc_sha256),
                file_length: descriptor.file_length,
                mimetype: None,
                file_name: None,
            };
            let mut config = options.media.clone();
            config.verify = crate::media_stream::MediaVerifyMode::BeforeRelease;
            let mut stream =
                crate::media::download_blob(&media, config, keys, "md-msg-hist").await?;
            let mut bytes = Vec::new();
            while let Some(chunk) = stream.body.next().await {
                bytes.extend_from_slice(&chunk?);
            }
            bytes
        }
    };
    if options.media.cancellation.is_cancelled() {
        return Err(crate::transport::cancelled());
    }
    {
        let chunk = decode_history_payload(&compressed, options.max_inflated_bytes)?;
        if options.media.cancellation.is_cancelled() {
            return Err(crate::transport::cancelled());
        }
        Ok(chunk)
    }
}
