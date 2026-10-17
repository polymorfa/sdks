//! Custom ciphertext-only upload transports and wrappers around the native relay/direct transports.
use crate::{
    direct_media::{UploadLocation, WhatsAppMediaResource},
    media_encrypt::{MediaEncryptionOptions, MediaInputStream, UploadMediaType},
    media_upload::{
        prepare_upload, DirectUploadOptions, MediaSource, MediaUploadResult, PreparedUpload,
    },
    transport::{cancelled, configuration},
    RequestOptions, Result,
};
use std::{future::Future, pin::Pin};
use tokio_util::sync::CancellationToken;

pub type UploadTransportFuture<'a> =
    Pin<Box<dyn Future<Output = Result<UploadLocation>> + Send + 'a>>;

/// A transport receives ciphertext, its upload hash/type/length, and cancellation.
/// Plaintext, media keys and Polymorfa credentials are absent from this interface.
///
/// ```compile_fail
/// fn transport_cannot_read_the_key(body: polymorfa_sdk::media_upload_transport::EncryptedUploadBody<'_>) {
///     let _ = body.media_key;
/// }
/// ```
#[derive(Clone)]
pub struct EncryptedUploadBody<'a> {
    prepared: &'a PreparedUpload,
    cancellation: CancellationToken,
}
impl EncryptedUploadBody<'_> {
    pub fn media_type(&self) -> UploadMediaType {
        self.prepared.info.media_type
    }
    pub fn file_enc_sha256(&self) -> [u8; 32] {
        self.prepared.info.file_enc_sha256
    }
    pub fn encrypted_length(&self) -> u64 {
        self.prepared.info.encrypted_length
    }
    /// Reopens verified ciphertext from an offset. The transport owns and drops the returned stream.
    pub async fn open(&self, offset: u64) -> Result<MediaInputStream> {
        tokio::select! { biased;
            _ = self.cancellation.cancelled() => Err(cancelled()),
            opened = self.prepared.open(offset) => opened,
        }
    }
}
pub trait MediaUploadTransport: Send + Sync {
    fn name(&self) -> &str;
    fn upload<'a>(
        &'a self,
        session: &'a str,
        body: EncryptedUploadBody<'a>,
        cancellation: CancellationToken,
    ) -> UploadTransportFuture<'a>;
}

/// Encrypts locally and invokes an application-owned transport without exposing the media key.
/// Transport errors are preserved; cancellation drops the in-progress upload future.
pub async fn upload_with_transport(
    session: &str,
    source: MediaSource,
    options: MediaEncryptionOptions,
    transport: &dyn MediaUploadTransport,
) -> Result<MediaUploadResult> {
    if session.is_empty() || transport.name().is_empty() {
        return Err(configuration("uploadTransport"));
    }
    let egress = transport.name().to_owned();
    let cancellation = options.cancellation.child_token();
    let prepared = tokio::select! { biased;
        _ = cancellation.cancelled() => return Err(cancelled()),
        prepared = prepare_upload(source, options) => prepared?,
    };
    let body = EncryptedUploadBody {
        prepared: &prepared,
        cancellation: cancellation.clone(),
    };
    let location = tokio::select! { biased;
        _ = cancellation.cancelled() => return Err(cancelled()),
        location = transport.upload(session, body, cancellation.clone()) => location?,
    };
    Ok(MediaUploadResult {
        info: prepared.info,
        location,
        egress,
    })
}

enum BuiltinKind {
    Relay,
    Direct(DirectUploadOptions),
}
pub struct BuiltinMediaUploadTransport<'a> {
    resource: WhatsAppMediaResource<'a>,
    kind: BuiltinKind,
    request: RequestOptions,
}
impl MediaUploadTransport for BuiltinMediaUploadTransport<'_> {
    fn name(&self) -> &str {
        match self.kind {
            BuiltinKind::Relay => "relay",
            BuiltinKind::Direct(_) => "direct",
        }
    }
    fn upload<'a>(
        &'a self,
        session: &'a str,
        body: EncryptedUploadBody<'a>,
        cancellation: CancellationToken,
    ) -> UploadTransportFuture<'a> {
        Box::pin(async move {
            let request_cancellation = self.request.cancellation.clone().unwrap_or_default();
            let mut request = self.request.clone();
            request.cancellation = Some(cancellation.clone());
            let upload = async {
                match &self.kind {
                    BuiltinKind::Relay => {
                        self.resource
                            .upload_relay_prepared(session, body.prepared, request)
                            .await
                    }
                    BuiltinKind::Direct(settings) => {
                        let configured_cancellation = settings.cancellation.clone();
                        let mut direct = settings.clone();
                        direct.cancellation = cancellation.clone();
                        tokio::select! { biased;
                            _ = configured_cancellation.cancelled() => Err(cancelled()),
                            result = self.resource.upload_direct_prepared(session, body.prepared, direct, request) => result,
                        }
                    }
                }
            };
            tokio::select! { biased;
                _ = request_cancellation.cancelled() => Err(cancelled()),
                _ = cancellation.cancelled() => Err(cancelled()),
                result = upload => result,
            }
        })
    }
}
impl<'a> WhatsAppMediaResource<'a> {
    pub fn relay_transport(&self, request: RequestOptions) -> BuiltinMediaUploadTransport<'a> {
        BuiltinMediaUploadTransport {
            resource: WhatsAppMediaResource(self.0),
            kind: BuiltinKind::Relay,
            request,
        }
    }
    pub fn direct_transport(
        &self,
        direct: DirectUploadOptions,
        request: RequestOptions,
    ) -> Result<BuiltinMediaUploadTransport<'a>> {
        self.0.server()?;
        if direct.max_attempts == 0 || direct.document_part_size == 0 || direct.timeout.is_zero() {
            return Err(configuration("directUpload"));
        }
        Ok(BuiltinMediaUploadTransport {
            resource: WhatsAppMediaResource(self.0),
            kind: BuiltinKind::Direct(direct),
            request,
        })
    }
}
