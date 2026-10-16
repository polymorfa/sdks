//! Voice assets and write-only provider credentials. Access remains server enforced.
use crate::{
    models::{DataEnvelope, Query},
    pagination::CursorPage,
    transport::{configuration, encode, HttpTransport},
    ApiResponse, Credential, Error, ErrorKind, RequestOptions, Result,
};
use reqwest::Method;
use serde::{Deserialize, Serialize};
use std::{collections::BTreeMap, time::Duration};
macro_rules! model {($name:ident {$($field:ident:$kind:ty),* $(,)?})=>{#[derive(Clone,Debug,Serialize,Deserialize)] #[serde(rename_all="camelCase")] pub struct $name {$(pub $field:$kind),*}};}
macro_rules! enumeration {($name:ident {$($variant:ident=>$value:literal),+})=>{#[derive(Clone,Copy,Debug,Serialize,Deserialize)] pub enum $name {$(#[serde(rename=$value)] $variant),+}};}
enumeration!(VoiceStatus {PendingUpload=>"pending_upload",Uploaded=>"uploaded",Transcoding=>"transcoding",Ready=>"ready",Failed=>"failed"});
enumeration!(VoiceProvider {Elevenlabs=>"elevenlabs",Openai=>"openai"});
enumeration!(UploadContentType {Mp3=>"audio/mpeg",Wav=>"audio/wav",XWav=>"audio/x-wav",Ogg=>"audio/ogg",Mp4=>"audio/mp4",XM4a=>"audio/x-m4a"});
enumeration!(ElevenlabsModel {MultilingualV2=>"eleven_multilingual_v2",FlashV25=>"eleven_flash_v2_5",TurboV25=>"eleven_turbo_v2_5"});
enumeration!(OpenaiModel {Gpt4oMiniTts=>"gpt-4o-mini-tts",Tts1=>"tts-1",Tts1Hd=>"tts-1-hd"});
enumeration!(OpenaiVoice {Alloy=>"alloy",Ash=>"ash",Ballad=>"ballad",Coral=>"coral",Echo=>"echo",Fable=>"fable",Nova=>"nova",Onyx=>"onyx",Sage=>"sage",Shimmer=>"shimmer",Verse=>"verse"});
// These response strings deliberately preserve future API values, as the pinned TS unions do.
model!(VoiceTts {provider:String,voice_id:String,model:String,text:String,characters:u64,key_source:String,credential_id:Option<String>});
model!(VoiceAsset {id:String,project_id:String,name:String,source:String,status:String,failure_reason:Option<String>,original_format:Option<String>,original_content_type:Option<String>,size_bytes:Option<u64>,duration_ms:Option<f64>,content_sha256:Option<String>,tts:Option<VoiceTts>,retention_days:Option<u32>,expires_at:Option<String>,in_use_count:u64,revision:u64,created_at:String,updated_at:String,ready_at:Option<String>});
/// Upload/preview URLs are bearer capabilities and do not implement Debug.
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VoiceUpload {
    pub url: String,
    pub method: UploadPost,
    pub headers: BTreeMap<String, String>,
    pub max_bytes: u64,
    pub expires_at: String,
}
enumeration!(UploadPost {Post=>"POST"});
#[derive(Clone, Serialize, Deserialize)]
pub struct VoiceUploadCreated {
    pub asset: VoiceAsset,
    pub upload: VoiceUpload,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VoicePreview {
    pub url: String,
    pub content_type: PreviewContentType,
    pub expires_at: String,
}
enumeration!(PreviewContentType {Ogg=>"audio/ogg"});
model!(ProviderCredential {id:String,project_id:Option<String>,provider:String,label:String,key_fingerprint:String,status:String,verified_at:Option<String>,last_error:Option<String>,revision:u64,created_at:String,updated_at:String});
model!(VoiceDeleted {
    id: String,
    deleted: bool
});
#[derive(Clone, Debug, Default)]
pub struct ListAudioParameters {
    pub status: Option<VoiceStatus>,
    pub cursor: Option<String>,
    pub limit: Option<u32>,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateAudioUploadRequest {
    pub name: String,
    pub content_type: UploadContentType,
    pub size_bytes: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub retention_days: Option<u32>,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SynthesizeCommon {
    pub name: String,
    pub text: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub credential_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub retention_days: Option<u32>,
}
#[derive(Clone, Debug, Serialize)]
#[serde(tag = "provider")]
pub enum SynthesizeAudioRequest {
    #[serde(rename = "elevenlabs")]
    Elevenlabs {
        #[serde(flatten)]
        common: SynthesizeCommon,
        #[serde(rename = "voiceId")]
        voice_id: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        model: Option<ElevenlabsModel>,
    },
    #[serde(rename = "openai")]
    Openai {
        #[serde(flatten)]
        common: SynthesizeCommon,
        #[serde(rename = "voiceId")]
        voice_id: OpenaiVoice,
        #[serde(skip_serializing_if = "Option::is_none")]
        model: Option<OpenaiModel>,
    },
}
#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateAudioRequest {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expected_revision: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub retention_days: Option<Option<u32>>,
}
/// Provider keys are write-only; this type does not implement Debug.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateProviderCredentialRequest {
    pub provider: VoiceProvider,
    pub label: String,
    pub api_key: String,
}
#[derive(Clone, Debug)]
pub struct WaitForAudioOptions {
    pub timeout: Duration,
    pub interval: Duration,
}
impl Default for WaitForAudioOptions {
    fn default() -> Self {
        Self {
            timeout: Duration::from_secs(120),
            interval: Duration::from_secs(2),
        }
    }
}
pub struct OrganizationVoice<'a>(pub(crate) &'a HttpTransport);
pub struct ProjectVoice<'a> {
    pub(crate) http: &'a HttpTransport,
    pub(crate) project_id: &'a str,
}
impl OrganizationVoice<'_> {
    pub fn audio<'a>(&'a self, project_id: &'a str) -> Result<VoiceAudio<'a>> {
        if project_id.trim().is_empty() {
            return Err(configuration("projectId"));
        }
        Ok(VoiceAudio {
            http: self.0,
            project_id,
            confine: false,
        })
    }
    pub fn provider_credentials<'a>(
        &'a self,
        project_id: Option<&'a str>,
    ) -> VoiceProviderCredentials<'a> {
        VoiceProviderCredentials {
            http: self.0,
            project_id,
            confine: false,
        }
    }
}
impl ProjectVoice<'_> {
    pub fn audio(&self) -> VoiceAudio<'_> {
        VoiceAudio {
            http: self.http,
            project_id: self.project_id,
            confine: matches!(
                self.http.credential,
                Some(Credential::OrganizationApiKey(_))
            ),
        }
    }
    pub fn provider_credentials(&self) -> VoiceProviderCredentials<'_> {
        VoiceProviderCredentials {
            http: self.http,
            project_id: Some(self.project_id),
            confine: matches!(
                self.http.credential,
                Some(Credential::OrganizationApiKey(_))
            ),
        }
    }
}
pub struct VoiceAudio<'a> {
    http: &'a HttpTransport,
    project_id: &'a str,
    confine: bool,
}
pub struct VoiceProviderCredentials<'a> {
    http: &'a HttpTransport,
    project_id: Option<&'a str>,
    confine: bool,
}
fn id_path(prefix: &str, id: &str) -> Result<String> {
    if id.trim().is_empty() {
        Err(configuration("resource ID"))
    } else {
        Ok(format!("{prefix}/{}", encode(id)))
    }
}
fn unwrap<T>(v: ApiResponse<DataEnvelope<T>>) -> ApiResponse<T> {
    ApiResponse {
        data: v.data.data,
        metadata: v.metadata,
    }
}
fn missing(id: &str) -> Error {
    Error::local(
        ErrorKind::NotFound,
        "Voice resource not found",
        "resource_not_found",
    )
    .with_local_status(404)
    .with_local_details(serde_json::json!({"id":id}))
}
impl VoiceAudio<'_> {
    /// Create, upload the exact byte slice to credential-free storage, and start
    /// transcoding. Completion does not reuse the create idempotency key.
    pub async fn upload(
        &self,
        request: &CreateAudioUploadRequest,
        bytes: &[u8],
        options: RequestOptions,
    ) -> Result<ApiResponse<VoiceAsset>> {
        if request.size_bytes != bytes.len() as u64 {
            return Err(Error::local(
                ErrorKind::Validation,
                "Declared audio size does not match its byte length.",
                "invalid_parameter",
            ));
        }
        self.upload_body(request, reqwest::Body::from(bytes.to_vec()), options)
            .await
    }
    /// The caller declares a stream's exact size before creating the asset.
    /// Storage validates the stream against the content length; uploads never retry.
    pub async fn upload_stream<S, E>(
        &self,
        request: &CreateAudioUploadRequest,
        stream: S,
        options: RequestOptions,
    ) -> Result<ApiResponse<VoiceAsset>>
    where
        S: futures_util::Stream<Item = std::result::Result<bytes::Bytes, E>> + Send + 'static,
        E: Into<Box<dyn std::error::Error + Send + Sync>> + 'static,
    {
        self.upload_body(request, reqwest::Body::wrap_stream(stream), options)
            .await
    }
    async fn upload_body(
        &self,
        request: &CreateAudioUploadRequest,
        body: reqwest::Body,
        mut options: RequestOptions,
    ) -> Result<ApiResponse<VoiceAsset>> {
        if request.size_bytes == 0 || request.size_bytes > 16_777_216 {
            return Err(Error::local(
                ErrorKind::Validation,
                "Audio uploads require 1 to 16777216 bytes.",
                "invalid_parameter",
            ));
        }
        let created = self.create_upload(request, options.clone()).await?;
        if request.size_bytes > created.data.upload.max_bytes {
            return Err(Error::local(
                ErrorKind::Validation,
                "Audio exceeds the upload's maximum size.",
                "invalid_parameter",
            ));
        }
        self.http
            .send_upload(&created.data.upload, body, request.size_bytes, &options)
            .await?;
        options.idempotency_key = None;
        self.http
            .request::<DataEnvelope<VoiceAsset>, ()>(
                Method::POST,
                &format!(
                    "{}/complete",
                    id_path("/platform/voice/audio", &created.data.asset.id)?
                ),
                &[],
                None,
                options,
            )
            .await
            .map(unwrap)
    }

    async fn check(&self, id: &str, options: RequestOptions) -> Result<()> {
        if self.confine {
            let mut read = options;
            read.idempotency_key = None;
            self.retrieve(id, read).await?;
        }
        Ok(())
    }
    pub async fn list(
        &self,
        p: &ListAudioParameters,
        o: RequestOptions,
    ) -> Result<CursorPage<VoiceAsset>> {
        let mut q = Query::new();
        q.insert("projectId".into(), self.project_id.into());
        if let Some(v) = p.limit {
            q.insert("limit".into(), (v as i64).into());
        }
        if let Some(v) = &p.cursor {
            q.insert("cursor".into(), v.clone().into());
        }
        if let Some(v) = p.status {
            q.insert(
                "status".into(),
                serde_json::to_value(v).unwrap().as_str().unwrap().into(),
            );
        }
        CursorPage::load(self.http.clone(), "/platform/voice/audio".into(), q, o).await
    }
    pub async fn create_upload(
        &self,
        b: &CreateAudioUploadRequest,
        o: RequestOptions,
    ) -> Result<ApiResponse<VoiceUploadCreated>> {
        let mut v = serde_json::to_value(b).unwrap();
        v["projectId"] = self.project_id.into();
        self.http
            .request(Method::POST, "/platform/voice/audio", &[], Some(&v), o)
            .await
            .map(unwrap)
    }
    pub async fn synthesize(
        &self,
        b: &SynthesizeAudioRequest,
        o: RequestOptions,
    ) -> Result<ApiResponse<VoiceAsset>> {
        let mut v = serde_json::to_value(b).unwrap();
        v["projectId"] = self.project_id.into();
        self.http
            .request(Method::POST, "/platform/voice/audio/tts", &[], Some(&v), o)
            .await
            .map(unwrap)
    }
    pub async fn retrieve(&self, id: &str, o: RequestOptions) -> Result<ApiResponse<VoiceAsset>> {
        let response: ApiResponse<DataEnvelope<VoiceAsset>> = self
            .http
            .get(&id_path("/platform/voice/audio", id)?, o)
            .await?;
        if !response
            .data
            .data
            .project_id
            .eq_ignore_ascii_case(self.project_id)
        {
            return Err(missing(id));
        }
        Ok(unwrap(response))
    }
    pub async fn complete(&self, id: &str, o: RequestOptions) -> Result<ApiResponse<VoiceAsset>> {
        self.check(id, o.clone()).await?;
        self.http
            .request::<_, ()>(
                Method::POST,
                &format!("{}/complete", id_path("/platform/voice/audio", id)?),
                &[],
                None,
                o,
            )
            .await
            .map(unwrap)
    }
    pub async fn update(
        &self,
        id: &str,
        b: &UpdateAudioRequest,
        o: RequestOptions,
    ) -> Result<ApiResponse<VoiceAsset>> {
        self.check(id, o.clone()).await?;
        self.http
            .request(
                Method::PATCH,
                &id_path("/platform/voice/audio", id)?,
                &[],
                Some(b),
                o,
            )
            .await
            .map(unwrap)
    }
    pub async fn delete(&self, id: &str, o: RequestOptions) -> Result<ApiResponse<VoiceDeleted>> {
        self.check(id, o.clone()).await?;
        self.http
            .request::<_, ()>(
                Method::DELETE,
                &id_path("/platform/voice/audio", id)?,
                &[],
                None,
                o,
            )
            .await
            .map(unwrap)
    }
    pub async fn preview_url(
        &self,
        id: &str,
        o: RequestOptions,
    ) -> Result<ApiResponse<VoicePreview>> {
        self.check(id, o.clone()).await?;
        self.http
            .get(
                &format!("{}/preview", id_path("/platform/voice/audio", id)?),
                o,
            )
            .await
            .map(unwrap)
    }
    pub async fn wait_until_ready(
        &self,
        id: &str,
        wait: WaitForAudioOptions,
        options: RequestOptions,
    ) -> Result<ApiResponse<VoiceAsset>> {
        let deadline = tokio::time::Instant::now() + wait.timeout;
        let expired = || {
            Error::local(
                ErrorKind::Timeout,
                "Voice audio processing timed out",
                "request_timeout",
            )
        };
        loop {
            let response = tokio::time::timeout_at(deadline, self.retrieve(id, options.clone()))
                .await
                .map_err(|_| expired())??;
            if tokio::time::Instant::now() >= deadline {
                return Err(expired());
            }
            if response.data.status == "ready" || response.data.status == "failed" {
                return Ok(response);
            }
            let pause = tokio::time::sleep_until(std::cmp::min(
                deadline,
                tokio::time::Instant::now() + wait.interval,
            ));
            let token = options.cancellation.clone().unwrap_or_default();
            tokio::select! {_=token.cancelled()=>return Err(Error::local(ErrorKind::Cancelled,"Voice wait cancelled","request_cancelled")),_=pause=>{}}
        }
    }
}
impl VoiceProviderCredentials<'_> {
    fn visible(&self, id: &str, v: &ProviderCredential) -> Result<()> {
        if self.project_id.is_some_and(|p| {
            v.project_id
                .as_ref()
                .is_some_and(|x| !x.eq_ignore_ascii_case(p))
        }) {
            Err(missing(id))
        } else {
            Ok(())
        }
    }
    async fn check(&self, id: &str, o: RequestOptions) -> Result<()> {
        if self.confine {
            let mut read = o;
            read.idempotency_key = None;
            let v = self.retrieve(id, read).await?;
            if v.data.project_id.is_none() {
                return Err(Error::local(
                    ErrorKind::Authorization,
                    "Manage team-wide credentials from the organization client",
                    "permission_denied",
                )
                .with_local_status(403));
            }
        }
        Ok(())
    }
    pub async fn list(&self, o: RequestOptions) -> Result<ApiResponse<Vec<ProviderCredential>>> {
        let q = self
            .project_id
            .map(|p| vec![("projectId", p.to_owned())])
            .unwrap_or_default();
        self.http
            .request::<_, ()>(
                Method::GET,
                "/platform/voice/provider-credentials",
                &q,
                None,
                o,
            )
            .await
            .map(unwrap)
    }
    pub async fn create(
        &self,
        b: &CreateProviderCredentialRequest,
        o: RequestOptions,
    ) -> Result<ApiResponse<ProviderCredential>> {
        if b.api_key.is_empty() {
            return Err(configuration("apiKey"));
        }
        let mut v = serde_json::to_value(b).unwrap();
        if let Some(p) = self.project_id {
            v["projectId"] = p.into();
        }
        self.http
            .request(
                Method::POST,
                "/platform/voice/provider-credentials",
                &[],
                Some(&v),
                o,
            )
            .await
            .map(unwrap)
    }
    pub async fn retrieve(
        &self,
        id: &str,
        o: RequestOptions,
    ) -> Result<ApiResponse<ProviderCredential>> {
        let v: ApiResponse<DataEnvelope<ProviderCredential>> = self
            .http
            .get(&id_path("/platform/voice/provider-credentials", id)?, o)
            .await?;
        self.visible(id, &v.data.data)?;
        Ok(unwrap(v))
    }
    pub async fn verify(
        &self,
        id: &str,
        o: RequestOptions,
    ) -> Result<ApiResponse<ProviderCredential>> {
        self.check(id, o.clone()).await?;
        self.http
            .request::<_, ()>(
                Method::POST,
                &format!(
                    "{}/verify",
                    id_path("/platform/voice/provider-credentials", id)?
                ),
                &[],
                None,
                o,
            )
            .await
            .map(unwrap)
    }
    pub async fn delete(&self, id: &str, o: RequestOptions) -> Result<ApiResponse<VoiceDeleted>> {
        self.check(id, o.clone()).await?;
        self.http
            .request::<_, ()>(
                Method::DELETE,
                &id_path("/platform/voice/provider-credentials", id)?,
                &[],
                None,
                o,
            )
            .await
            .map(unwrap)
    }
}
