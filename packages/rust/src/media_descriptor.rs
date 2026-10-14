//! Standard sends carry the media key to the API. Zero-knowledge sends use `signal_descriptor` locally.
use crate::{
    direct_media::UploadLocation,
    media_encrypt::{EncryptedMediaInfo, UploadMediaType},
    Result,
};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::{Deserialize, Serialize};
#[derive(Clone, Default)]
pub struct MediaSendMetadata {
    pub mimetype: Option<String>,
    pub thumbnail: Option<Vec<u8>>,
    pub dimensions: Option<(u32, u32)>,
    pub seconds: Option<u32>,
    pub waveform: Option<Vec<u8>>,
    pub media_key_timestamp: Option<u64>,
    pub is_animated: Option<bool>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaSendDescriptor {
    pub direct_path: String,
    pub media_key: String,
    pub file_sha256: String,
    pub file_enc_sha256: String,
    pub file_length: u64,
    pub mime_type: String,
    pub url: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub thumbnail: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub width: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub height: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub seconds: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub waveform: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub media_key_timestamp: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_animated: Option<bool>,
}
impl std::fmt::Debug for MediaSendDescriptor {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("MediaSendDescriptor(redacted)")
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DescriptorMediaContent {
    #[serde(flatten)]
    pub descriptor: MediaSendDescriptor,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub caption: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DescriptorFileContent {
    #[serde(flatten)]
    pub descriptor: MediaSendDescriptor,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub caption: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub filename: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DescriptorVoiceContent {
    #[serde(flatten)]
    pub descriptor: MediaSendDescriptor,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ptt: Option<bool>,
}
fn invalid(field: &str) -> crate::Error {
    crate::transport::configuration(field)
}
pub fn media_send_descriptor(
    info: &EncryptedMediaInfo,
    location: &UploadLocation,
    metadata: MediaSendMetadata,
) -> Result<MediaSendDescriptor> {
    let mime = metadata
        .mimetype
        .or_else(|| info.mimetype.clone())
        .ok_or_else(|| invalid("mimetype"))?;
    let descriptor = MediaSendDescriptor {
        direct_path: location.direct_path.clone(),
        media_key: STANDARD.encode(info.media_key),
        file_sha256: STANDARD.encode(info.file_sha256),
        file_enc_sha256: STANDARD.encode(info.file_enc_sha256),
        file_length: info.file_length,
        mime_type: mime,
        url: location.url.clone(),
        thumbnail: metadata.thumbnail.map(|b| STANDARD.encode(b)),
        width: metadata.dimensions.map(|d| d.0),
        height: metadata.dimensions.map(|d| d.1),
        seconds: metadata.seconds,
        waveform: metadata.waveform.map(|b| STANDARD.encode(b)),
        media_key_timestamp: metadata.media_key_timestamp,
        is_animated: metadata.is_animated,
    };
    descriptor.validate(info.media_type)?;
    Ok(descriptor)
}
impl MediaSendDescriptor {
    pub fn validate(&self, kind: UploadMediaType) -> Result<()> {
        if self.mime_type.is_empty()
            || self.mime_type.len() > 255
            || !self.mime_type.bytes().all(|b| (32..=126).contains(&b))
        {
            return Err(invalid("mimetype"));
        }
        if self.direct_path.len() > 2048
            || !self.direct_path.starts_with('/')
            || self.direct_path.starts_with("//")
            || !self.direct_path.bytes().all(|b| (33..=126).contains(&b))
        {
            return Err(invalid("directPath"));
        }
        if self.url.len() > 2048
            || !self.url.starts_with("https://")
            || !self.url.bytes().all(|b| (33..=126).contains(&b))
        {
            return Err(invalid("url"));
        }
        if self.file_length == 0 || self.file_length > 1u64 << 31 {
            return Err(invalid("fileLength"));
        }
        for value in [&self.media_key, &self.file_sha256, &self.file_enc_sha256] {
            if STANDARD.decode(value).map_or(true, |b| b.len() != 32) {
                return Err(invalid("media hashes/key"));
            }
        }
        if self.width.is_some() != self.height.is_some()
            || self.width.is_some_and(|v| v == 0 || v > 65536)
            || self.height.is_some_and(|v| v == 0 || v > 65536)
        {
            return Err(invalid("dimensions"));
        }
        if self.seconds.is_some_and(|v| v > 86400)
            || self
                .media_key_timestamp
                .is_some_and(|v| v == 0 || v > 1u64 << 40)
        {
            return Err(invalid("media timing"));
        }
        if let Some(thumb) = &self.thumbnail {
            if STANDARD.decode(thumb).map_or(true, |b| b.len() > 16384) {
                return Err(invalid("thumbnail"));
            }
        }
        if let Some(wave) = &self.waveform {
            if STANDARD
                .decode(wave)
                .map_or(true, |b| !(64..=192).contains(&b.len()))
                || !matches!(kind, UploadMediaType::Audio | UploadMediaType::Ptt)
            {
                return Err(invalid("waveform"));
            }
        }
        if kind == UploadMediaType::Sticker {
            if self.mime_type != "image/webp"
                || self.thumbnail.is_some()
                || self.seconds.is_some()
                || self.waveform.is_some()
            {
                return Err(invalid("sticker"));
            }
        } else if self.is_animated.is_some() {
            return Err(invalid("isAnimated"));
        }
        Ok(())
    }
    pub fn signal_descriptor(
        &self,
        kind: UploadMediaType,
        caption: Option<String>,
        file_name: Option<String>,
    ) -> Result<crate::signal::SignalMediaDescriptor> {
        self.validate(kind)?;
        if self.thumbnail.is_some() || self.waveform.is_some() || self.is_animated.is_some() {
            return Err(invalid(
                "Signal service metadata is unsupported by this contract",
            ));
        }
        Ok(crate::signal::SignalMediaDescriptor {
            kind: if kind == UploadMediaType::Ptt {
                "audio".into()
            } else {
                kind.as_str().into()
            },
            direct_path: self.direct_path.clone(),
            media_key: self.media_key.clone(),
            file_sha256: self.file_sha256.clone(),
            file_enc_sha256: self.file_enc_sha256.clone(),
            file_length: self.file_length,
            mimetype: self.mime_type.clone(),
            url: Some(self.url.clone()),
            caption,
            file_name,
            width: self.width,
            height: self.height,
            seconds: self.seconds,
            ptt: matches!(kind, UploadMediaType::Audio | UploadMediaType::Ptt)
                .then_some(kind == UploadMediaType::Ptt),
            media_key_timestamp: self.media_key_timestamp.map(|v| v as i64),
        })
    }
}
impl crate::models::MessageContent {
    pub(crate) fn descriptor_kind(&self) -> Option<(&MediaSendDescriptor, UploadMediaType)> {
        match self {
            Self::DescriptorImage { image } => Some((&image.descriptor, UploadMediaType::Image)),
            Self::DescriptorVideo { video } => Some((&video.descriptor, UploadMediaType::Video)),
            Self::DescriptorFile { file } => Some((&file.descriptor, UploadMediaType::Document)),
            Self::DescriptorVoice { voice } => Some((
                &voice.descriptor,
                if voice.ptt.unwrap_or(false) {
                    UploadMediaType::Ptt
                } else {
                    UploadMediaType::Audio
                },
            )),
            Self::Sticker { sticker } => Some((sticker, UploadMediaType::Sticker)),
            _ => None,
        }
    }
}
