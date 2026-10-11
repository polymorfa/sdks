//! Project-owned Flow drafts, provider reconciliation and encrypted endpoint metadata.
use crate::{
    models::DataEnvelope,
    transport::{configuration, encode, HttpTransport},
    ApiResponse, Error, ErrorKind, RequestOptions, Result,
};
use reqwest::Method;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
/// Flow JSON is an explicitly open document in the pinned API contract.
pub type FlowDefinition = BTreeMap<String, serde_json::Value>;
macro_rules! model {($name:ident {$($field:ident:$kind:ty),* $(,)?})=>{#[derive(Clone,Debug,Serialize,Deserialize)] #[serde(rename_all="camelCase")] pub struct $name {$(pub $field:$kind),*}};}
macro_rules! optional_model {($name:ident {$($field:ident:$kind:ty),* $(,)?})=>{#[derive(Clone,Debug,Default,Serialize,Deserialize)] #[serde(rename_all="camelCase")] pub struct $name {$(#[serde(skip_serializing_if="Option::is_none")] pub $field:Option<$kind>),*}};}
macro_rules! enumeration {($name:ident {$($variant:ident=>$value:literal),+})=>{#[derive(Clone,Copy,Debug,Serialize,Deserialize)] pub enum $name {$(#[serde(rename=$value)] $variant),+}};}
enumeration!(FlowCategory {SignUp=>"SIGN_UP",SignIn=>"SIGN_IN",AppointmentBooking=>"APPOINTMENT_BOOKING",LeadGeneration=>"LEAD_GENERATION",ContactUs=>"CONTACT_US",CustomerSupport=>"CUSTOMER_SUPPORT",Survey=>"SURVEY",Other=>"OTHER"});
enumeration!(FlowDraftStatus {Draft=>"draft",Ready=>"ready",Archived=>"archived"});
enumeration!(FlowUploadState {Stale=>"stale",Creating=>"creating",Uploading=>"uploading",Valid=>"valid",Invalid=>"invalid",Failed=>"failed"});
enumeration!(ProviderAction {Create=>"create",Upload=>"upload",Publish=>"publish",Deprecate=>"deprecate",Delete=>"delete"});
enumeration!(ProviderState {Pending=>"pending",Succeeded=>"succeeded",Rejected=>"rejected",Uncertain=>"uncertain",Superseded=>"superseded"});
enumeration!(ProviderResolution {Response=>"response",Reconciled=>"reconciled",Superseded=>"superseded"});
enumeration!(FlowEndpointMode {Forward=>"forward",Function=>"function",Direct=>"direct"});
enumeration!(ManagedKeyState {Pending=>"pending",Uncertain=>"uncertain",Active=>"active",Retiring=>"retiring",Retired=>"retired",Failed=>"failed"});
enumeration!(EncryptionCustody {Managed=>"managed",Customer=>"customer"});
enumeration!(ReceiptMode {Forward=>"forward",Function=>"function"});
enumeration!(ReceiptAction {Ping=>"ping",Init=>"INIT",DataExchange=>"data_exchange",Back=>"BACK",ErrorNotification=>"error_notification"});
enumeration!(ReceiptOutcome {Running=>"running",Succeeded=>"succeeded",Rejected=>"rejected",Failed=>"failed",Timeout=>"timeout",Unavailable=>"unavailable"});
optional_model!(ValidationPointer {
    path: String,
    line_start: u32,
    line_end: u32,
    column_start: u32,
    column_end: u32
});
optional_model!(ValidationIssue {line_start:u32,line_end:u32,column_start:u32,column_end:u32,error:String,error_type:String,message:String,pointers:Vec<ValidationPointer>});
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FlowNumberLink {
    pub session: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub session_id: Option<String>,
    pub waba_id: String,
    pub meta_flow_id: String,
    pub status: String,
    pub categories: Vec<String>,
    pub validation_errors: Vec<ValidationIssue>,
    pub upload_state: FlowUploadState,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub preview_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub preview_expires_at: Option<u64>,
    pub last_synced_at: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub definition_digest: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub simulated: Option<bool>,
}
model!(FlowSummary {id:String,name:String,status:FlowDraftStatus,version:String,screen_count:u32,meta_links:Vec<FlowNumberLink>,created_at:u64,updated_at:u64});
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct FlowDraft {
    #[serde(flatten)]
    pub summary: FlowSummary,
    pub definition: FlowDefinition,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateFlowRequest {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub draft_id: Option<String>,
    pub name: String,
    pub definition: FlowDefinition,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateFlowRequest {
    pub expected_updated_at: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<FlowDraftStatus>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub definition: Option<FlowDefinition>,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FlowProviderRequest {
    pub session_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub categories: Option<Vec<FlowCategory>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub request_id: Option<String>,
}
model!(FlowProviderOperation {id:String,request_id:Option<String>,flow_id:String,flow_name:String,session_id:String,session:String,action:ProviderAction,state:ProviderState,resolution:Option<ProviderResolution>,waba_id:Option<String>,meta_flow_id:Option<String>,definition_digest:Option<String>,provider_status:Option<String>,error_code:Option<String>,provider_code:Option<i64>,provider_subcode:Option<i64>,created_at:u64,updated_at:u64,completed_at:Option<u64>});
model!(FlowProviderResult {operation:Option<FlowProviderOperation>,flow:FlowDraft});
model!(FlowEndpoint {id:String,org_id:String,project_id:String,flow_id:String,session_id:String,mode:FlowEndpointMode,url:Option<String>,function_id:Option<String>,deployment_id:Option<String>,enabled:bool,revision:u64,endpoint_uri:String,created_at:u64,updated_at:u64});
model!(ManagedEncryptionKey {id:String,state:ManagedKeyState,fingerprint:String,public_key:String,error_code:Option<String>,created_at:u64,activated_at:Option<u64>,retire_after:Option<u64>});
model!(FlowEncryptionCustody {custody:EncryptionCustody,active_key_id:Option<String>,keys:Vec<ManagedEncryptionKey>});
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct EncryptionKeyRotation {
    #[serde(flatten)]
    pub encryption: FlowEncryptionCustody,
    pub key: ManagedEncryptionKey,
}
model!(FlowEndpointState {endpoint:Option<FlowEndpoint>,encryption:FlowEncryptionCustody});
/// The once-returned signing secret is excluded from Debug.
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FlowEndpointSetResult {
    pub endpoint: FlowEndpoint,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub signing_secret: Option<String>,
    pub encryption: FlowEncryptionCustody,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EndpointCommon {
    pub session_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub enabled: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expected_revision: Option<u64>,
}
#[derive(Clone, Debug, Serialize)]
#[serde(tag = "mode", rename_all = "lowercase")]
pub enum SetFlowEndpointRequest {
    Forward {
        #[serde(flatten)]
        common: EndpointCommon,
        url: String,
        #[serde(
            rename = "rotateSigningSecret",
            skip_serializing_if = "Option::is_none"
        )]
        rotate_signing_secret: Option<bool>,
    },
    Function {
        #[serde(flatten)]
        common: EndpointCommon,
        #[serde(rename = "functionId")]
        function_id: String,
        #[serde(rename = "deploymentId", skip_serializing_if = "Option::is_none")]
        deployment_id: Option<Option<String>>,
    },
    Direct {
        #[serde(flatten)]
        common: EndpointCommon,
        url: String,
    },
}
model!(FlowNumberRequest { session_id: String });
optional_model!(ListEndpointReceiptsParameters {
    session_id: String,
    limit: u32
});
model!(FlowEndpointReceipt {id:String,flow_id:String,endpoint_id:String,session_id:String,mode:ReceiptMode,action:Option<ReceiptAction>,outcome:ReceiptOutcome,http_status:Option<u16>,error_code:Option<String>,key_id:Option<String>,function_invocation_id:Option<String>,duration_ms:Option<f64>,created_at:u64,completed_at:Option<u64>});
fn invalid(message: &str) -> Error {
    Error::local(ErrorKind::Validation, message, "invalid_flow_input")
}
fn path(id: &str) -> Result<String> {
    if id.trim().is_empty() {
        Err(configuration("Flow ID is required"))
    } else {
        Ok(format!("/{}", encode(id)))
    }
}
fn number(value: &str) -> Result<()> {
    if value.trim().is_empty() {
        Err(invalid("sessionId is required"))
    } else {
        Ok(())
    }
}
#[derive(Clone, Copy)]
pub struct Flows<'a> {
    pub(crate) http: &'a HttpTransport,
    pub(crate) project_id: &'a str,
}
impl Flows<'_> {
    async fn request<T: serde::de::DeserializeOwned, B: Serialize>(
        &self,
        method: Method,
        path: &str,
        input: &B,
        mut options: RequestOptions,
    ) -> Result<ApiResponse<T>> {
        let mut value = serde_json::to_value(input).expect("Flow input serialization");
        value
            .as_object_mut()
            .expect("Flow input object")
            .insert("projectId".into(), self.project_id.into());
        if method != Method::GET {
            options.max_network_retries = Some(0);
        }
        let response: ApiResponse<DataEnvelope<T>> =
            if method == Method::GET || method == Method::DELETE {
                let pairs: Vec<(&str, String)> = value
                    .as_object()
                    .unwrap()
                    .iter()
                    .map(|(k, v)| {
                        (
                            k.as_str(),
                            v.as_str()
                                .map(str::to_owned)
                                .unwrap_or_else(|| v.to_string()),
                        )
                    })
                    .collect();
                self.http
                    .request::<_, ()>(method, path, &pairs, None, options)
                    .await?
            } else {
                self.http
                    .request(method, path, &[], Some(&value), options)
                    .await?
            };
        Ok(ApiResponse {
            data: response.data.data,
            metadata: response.metadata,
        })
    }
    pub async fn list(&self, o: RequestOptions) -> Result<ApiResponse<Vec<FlowSummary>>> {
        self.request(Method::GET, "/platform/flows", &serde_json::json!({}), o)
            .await
    }
    pub async fn create(
        &self,
        b: &CreateFlowRequest,
        o: RequestOptions,
    ) -> Result<ApiResponse<FlowDraft>> {
        self.request(Method::POST, "/platform/flows", b, o).await
    }
    pub async fn retrieve(
        &self,
        id: &str,
        o: RequestOptions,
    ) -> Result<ApiResponse<Option<FlowDraft>>> {
        crate::functions::identifier(&id.to_ascii_lowercase())
            .map_err(|_| invalid("flowId must be a valid UUID"))?;
        self.request(
            Method::GET,
            &format!("/platform/flows{}", path(id)?),
            &serde_json::json!({}),
            o,
        )
        .await
    }
    pub async fn update(
        &self,
        id: &str,
        b: &UpdateFlowRequest,
        o: RequestOptions,
    ) -> Result<ApiResponse<FlowDraft>> {
        if !b.expected_updated_at.is_finite() {
            return Err(invalid("expectedUpdatedAt must be finite"));
        }
        self.request(
            Method::PATCH,
            &format!("/platform/flows{}", path(id)?),
            b,
            o,
        )
        .await
    }
    pub async fn delete(
        &self,
        id: &str,
        o: RequestOptions,
    ) -> Result<ApiResponse<crate::functions::FunctionMutationResult>> {
        self.request(
            Method::DELETE,
            &format!("/platform/flows{}", path(id)?),
            &serde_json::json!({}),
            o,
        )
        .await
    }
    pub async fn upload(
        &self,
        id: &str,
        b: &FlowProviderRequest,
        o: RequestOptions,
    ) -> Result<ApiResponse<FlowProviderResult>> {
        self.request(
            Method::POST,
            &format!("/platform/flows{}/upload", path(id)?),
            b,
            o,
        )
        .await
    }
    pub async fn publish(
        &self,
        id: &str,
        b: &FlowProviderRequest,
        o: RequestOptions,
    ) -> Result<ApiResponse<FlowProviderResult>> {
        self.request(
            Method::POST,
            &format!("/platform/flows{}/publish", path(id)?),
            b,
            o,
        )
        .await
    }
    pub async fn deprecate(
        &self,
        id: &str,
        b: &FlowProviderRequest,
        o: RequestOptions,
    ) -> Result<ApiResponse<FlowProviderResult>> {
        self.request(
            Method::POST,
            &format!("/platform/flows{}/deprecate", path(id)?),
            b,
            o,
        )
        .await
    }
    pub async fn discard(
        &self,
        id: &str,
        b: &FlowProviderRequest,
        o: RequestOptions,
    ) -> Result<ApiResponse<FlowProviderResult>> {
        self.request(
            Method::POST,
            &format!("/platform/flows{}/discard", path(id)?),
            b,
            o,
        )
        .await
    }
    pub async fn sync(
        &self,
        id: &str,
        b: &FlowProviderRequest,
        o: RequestOptions,
    ) -> Result<ApiResponse<FlowProviderResult>> {
        self.request(
            Method::POST,
            &format!("/platform/flows{}/sync", path(id)?),
            b,
            o,
        )
        .await
    }
    pub async fn receipts(
        &self,
        id: &str,
        o: RequestOptions,
    ) -> Result<ApiResponse<Vec<FlowProviderOperation>>> {
        self.request(
            Method::GET,
            &format!("/platform/flows{}/receipts", path(id)?),
            &serde_json::json!({}),
            o,
        )
        .await
    }
    pub async fn endpoint(
        &self,
        id: &str,
        p: &FlowNumberRequest,
        o: RequestOptions,
    ) -> Result<ApiResponse<FlowEndpointState>> {
        number(&p.session_id)?;
        self.request(
            Method::GET,
            &format!("/platform/flows{}/endpoint", path(id)?),
            p,
            o,
        )
        .await
    }
    pub async fn set_endpoint(
        &self,
        id: &str,
        b: &SetFlowEndpointRequest,
        o: RequestOptions,
    ) -> Result<ApiResponse<FlowEndpointSetResult>> {
        let common = match b {
            SetFlowEndpointRequest::Forward { common, url, .. }
            | SetFlowEndpointRequest::Direct { common, url } => {
                let parsed = url::Url::parse(url)
                    .map_err(|_| invalid("url must be HTTPS without credentials or fragment"))?;
                if url.len() > 2048
                    || parsed.scheme() != "https"
                    || parsed.host_str().is_none()
                    || !parsed.username().is_empty()
                    || parsed.password().is_some()
                    || parsed.fragment().is_some()
                {
                    return Err(invalid("url must be HTTPS without credentials or fragment"));
                }
                common
            }
            SetFlowEndpointRequest::Function {
                common,
                function_id,
                ..
            } => {
                if function_id.is_empty() {
                    return Err(invalid("functionId is required"));
                }
                common
            }
        };
        number(&common.session_id)?;
        if common.expected_revision == Some(0) {
            return Err(invalid("expectedRevision must be positive"));
        }
        self.request(
            Method::PUT,
            &format!("/platform/flows{}/endpoint", path(id)?),
            b,
            o,
        )
        .await
    }
    pub async fn delete_endpoint(
        &self,
        id: &str,
        p: &FlowNumberRequest,
        o: RequestOptions,
    ) -> Result<ApiResponse<crate::functions::FunctionMutationResult>> {
        number(&p.session_id)?;
        self.request(
            Method::DELETE,
            &format!("/platform/flows{}/endpoint", path(id)?),
            p,
            o,
        )
        .await
    }
    pub async fn endpoint_receipts(
        &self,
        id: &str,
        p: &ListEndpointReceiptsParameters,
        o: RequestOptions,
    ) -> Result<ApiResponse<Vec<FlowEndpointReceipt>>> {
        if p.limit.is_some_and(|v| !(1..=100).contains(&v)) {
            return Err(invalid("limit must be 1 to 100"));
        }
        self.request(
            Method::GET,
            &format!("/platform/flows{}/endpoint/receipts", path(id)?),
            p,
            o,
        )
        .await
    }
    pub async fn encryption_key(
        &self,
        p: &FlowNumberRequest,
        o: RequestOptions,
    ) -> Result<ApiResponse<FlowEncryptionCustody>> {
        number(&p.session_id)?;
        self.request(Method::GET, "/platform/flow-encryption-keys", p, o)
            .await
    }
    pub async fn rotate_encryption_key(
        &self,
        b: &FlowNumberRequest,
        o: RequestOptions,
    ) -> Result<ApiResponse<EncryptionKeyRotation>> {
        number(&b.session_id)?;
        self.request(Method::POST, "/platform/flow-encryption-keys/rotate", b, o)
            .await
    }
}
