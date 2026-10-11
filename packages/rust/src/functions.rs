//! Project-owned function definitions, immutable deployments, secrets and invocation receipts.
use crate::{
    models::DataEnvelope,
    transport::{encode, HttpTransport},
    ApiResponse, Error, ErrorKind, RequestOptions, Result,
};
use reqwest::Method;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
macro_rules! model {($name:ident {$($field:ident:$kind:ty),* $(,)?})=>{#[derive(Clone,Debug,Serialize,Deserialize)] #[serde(rename_all="camelCase")] pub struct $name {$(pub $field:$kind),*}};}
macro_rules! enumeration {($name:ident {$($variant:ident=>$value:literal),+})=>{#[derive(Clone,Copy,Debug,Serialize,Deserialize)] pub enum $name {$(#[serde(rename=$value)] $variant),+}};}
model!(FunctionDefinition {id:String,project_id:String,name:String,enabled:bool,revision:u64,active_deployment_id:Option<String>,created_at:String,updated_at:String});
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FunctionPage<T> {
    pub items: Vec<T>,
    pub next_cursor: Option<String>,
}
#[derive(Clone, Debug, Default, Serialize)]
pub struct ListFunctionsParameters {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub limit: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub before: Option<String>,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateFunctionRequest {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub function_id: Option<String>,
    pub name: String,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateFunctionRequest {
    pub expected_revision: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub enabled: Option<bool>,
}
enumeration!(FunctionLanguage {Javascript=>"javascript",Typescript=>"typescript",Visual=>"visual"});
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateDeploymentRequest {
    pub deployment_id: String,
    pub source: String,
    pub language: FunctionLanguage,
    pub region: String,
    pub compatibility_date: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub secret_version_ids: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub egress_origins: Option<Vec<String>>,
}
model!(FunctionDeploymentSummary {id:String,function_id:String,language:FunctionLanguage,region:String,compatibility_date:String,sha256:String,secret_version_ids:Vec<String>,egress_origins:Vec<String>,created_at:String});
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct FunctionDeployment {
    #[serde(flatten)]
    pub metadata: FunctionDeploymentSummary,
    pub source: String,
}
model!(PromoteDeploymentRequest {
    deployment_id: String,
    expected_revision: u64
});
model!(FunctionSecretVersion {id:String,name:String,created_at:String,revoked_at:Option<String>});
/// Secret values intentionally do not implement Debug.
#[derive(Clone, Serialize)]
pub struct CreateSecretRequest {
    pub name: String,
    pub value: String,
}
enumeration!(FunctionRequestMethod {Get=>"GET",Head=>"HEAD",Post=>"POST",Put=>"PUT",Patch=>"PATCH",Delete=>"DELETE",Options=>"OPTIONS"});
model!(FunctionRequest {method:FunctionRequestMethod,url:String,headers:BTreeMap<String,String>,body_base64:String});
model!(FunctionResponse {status:u16,headers:BTreeMap<String,String>,body_base64:String});
enumeration!(FunctionOutcome {Running=>"running",Succeeded=>"succeeded",Failed=>"failed",Unknown=>"unknown",Unavailable=>"unavailable"});
enumeration!(FunctionTrigger {Http=>"http",Flow=>"flow",Test=>"test"});
enumeration!(InvocationTrigger {Http=>"http",Test=>"test"});
model!(FunctionInvocation {id:String,function_id:String,deployment_id:String,outcome:FunctionOutcome,trigger:FunctionTrigger,error_code:Option<String>,duration_ms:Option<f64>,response_bytes:Option<u64>,attempt:u32,created_at:String,completed_at:Option<String>});
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateInvocationRequest {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub deployment_id: Option<String>,
    pub request: FunctionRequest,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub trigger: Option<InvocationTrigger>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FunctionInvocationResult {
    pub receipt: FunctionInvocation,
    pub replayed: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub response: Option<FunctionResponse>,
    pub response_retained: ResponseNotRetained,
    pub retryable: bool,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct ResponseNotRetained;
impl Serialize for ResponseNotRetained {
    fn serialize<S: serde::Serializer>(&self, s: S) -> std::result::Result<S::Ok, S::Error> {
        s.serialize_bool(false)
    }
}
impl<'de> Deserialize<'de> for ResponseNotRetained {
    fn deserialize<D: serde::Deserializer<'de>>(d: D) -> std::result::Result<Self, D::Error> {
        if bool::deserialize(d)? {
            Err(serde::de::Error::custom(
                "function responses are never retained",
            ))
        } else {
            Ok(Self)
        }
    }
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct FunctionMutationResult;
impl Serialize for FunctionMutationResult {
    fn serialize<S: serde::Serializer>(&self, s: S) -> std::result::Result<S::Ok, S::Error> {
        use serde::ser::SerializeStruct;
        let mut v = s.serialize_struct("FunctionMutationResult", 1)?;
        v.serialize_field("ok", &true)?;
        v.end()
    }
}
impl<'de> Deserialize<'de> for FunctionMutationResult {
    fn deserialize<D: serde::Deserializer<'de>>(d: D) -> std::result::Result<Self, D::Error> {
        #[derive(Deserialize)]
        struct V {
            ok: bool,
        }
        if V::deserialize(d)?.ok {
            Ok(Self)
        } else {
            Err(serde::de::Error::custom(
                "expected successful function mutation",
            ))
        }
    }
}
fn invalid(message: &str) -> Error {
    Error::local(ErrorKind::Validation, message, "invalid_function_input")
}
pub(crate) fn identifier(value: &str) -> Result<&str> {
    let bytes = value.as_bytes();
    if bytes.len() != 36
        || !bytes.iter().enumerate().all(|(i, b)| {
            if [8, 13, 18, 23].contains(&i) {
                *b == b'-'
            } else {
                b.is_ascii_digit() || (b'a'..=b'f').contains(b)
            }
        })
    {
        Err(invalid("A canonical Functions UUID is required"))
    } else {
        Ok(value)
    }
}
fn revision(value: u64) -> Result<()> {
    if value == 0 || value > 9_007_199_254_740_991 {
        Err(invalid("A positive Function revision is required"))
    } else {
        Ok(())
    }
}
#[derive(Clone, Copy)]
pub struct Functions<'a> {
    pub(crate) http: &'a HttpTransport,
    pub(crate) project_id: &'a str,
}
impl Functions<'_> {
    async fn request<T: serde::de::DeserializeOwned, B: Serialize>(
        &self,
        method: Method,
        path: &str,
        input: &B,
        mut options: RequestOptions,
    ) -> Result<ApiResponse<T>> {
        identifier(self.project_id)?;
        let mut value = serde_json::to_value(input).expect("function input serialization");
        value
            .as_object_mut()
            .expect("function input object")
            .insert("projectId".into(), self.project_id.into());
        let path = format!("/platform/functions{path}");
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
                    .request::<_, ()>(method, &path, &pairs, None, options)
                    .await?
            } else {
                self.http
                    .request(method, &path, &[], Some(&value), options)
                    .await?
            };
        Ok(ApiResponse {
            data: response.data.data,
            metadata: response.metadata,
        })
    }
    pub fn deployments(&self) -> FunctionDeployments<'_> {
        FunctionDeployments(*self)
    }
    pub fn secrets(&self) -> FunctionSecrets<'_> {
        FunctionSecrets(*self)
    }
    pub fn invocations(&self) -> FunctionInvocations<'_> {
        FunctionInvocations(*self)
    }
    pub async fn list(
        &self,
        p: &ListFunctionsParameters,
        o: RequestOptions,
    ) -> Result<ApiResponse<FunctionPage<FunctionDefinition>>> {
        self.request(Method::GET, "", p, o).await
    }
    pub async fn create(
        &self,
        b: &CreateFunctionRequest,
        o: RequestOptions,
    ) -> Result<ApiResponse<FunctionDefinition>> {
        if let Some(id) = &b.function_id {
            identifier(id)?;
        }
        self.request(Method::POST, "", b, o).await
    }
    pub async fn retrieve(
        &self,
        id: &str,
        o: RequestOptions,
    ) -> Result<ApiResponse<FunctionDefinition>> {
        self.request(
            Method::GET,
            &format!("/{}", encode(identifier(id)?)),
            &serde_json::json!({}),
            o,
        )
        .await
    }
    pub async fn update(
        &self,
        id: &str,
        b: &UpdateFunctionRequest,
        o: RequestOptions,
    ) -> Result<ApiResponse<FunctionDefinition>> {
        revision(b.expected_revision)?;
        self.request(Method::PATCH, &format!("/{}", identifier(id)?), b, o)
            .await
    }
    pub async fn delete(
        &self,
        id: &str,
        expected_revision: u64,
        o: RequestOptions,
    ) -> Result<ApiResponse<FunctionMutationResult>> {
        revision(expected_revision)?;
        self.request(
            Method::DELETE,
            &format!("/{}", identifier(id)?),
            &serde_json::json!({"expectedRevision":expected_revision}),
            o,
        )
        .await
    }
}
pub struct FunctionDeployments<'a>(Functions<'a>);
impl FunctionDeployments<'_> {
    pub async fn list(
        &self,
        id: &str,
        p: &ListFunctionsParameters,
        o: RequestOptions,
    ) -> Result<ApiResponse<FunctionPage<FunctionDeploymentSummary>>> {
        self.0
            .request(
                Method::GET,
                &format!("/{}/deployments", identifier(id)?),
                p,
                o,
            )
            .await
    }
    pub async fn create(
        &self,
        id: &str,
        b: &CreateDeploymentRequest,
        o: RequestOptions,
    ) -> Result<ApiResponse<FunctionDeployment>> {
        identifier(&b.deployment_id)?;
        self.0
            .request(
                Method::POST,
                &format!("/{}/deployments", identifier(id)?),
                b,
                o,
            )
            .await
    }
    pub async fn retrieve(
        &self,
        id: &str,
        deployment: &str,
        o: RequestOptions,
    ) -> Result<ApiResponse<FunctionDeployment>> {
        self.0
            .request(
                Method::GET,
                &format!(
                    "/{}/deployments/{}",
                    identifier(id)?,
                    identifier(deployment)?
                ),
                &serde_json::json!({}),
                o,
            )
            .await
    }
    pub async fn promote(
        &self,
        id: &str,
        b: &PromoteDeploymentRequest,
        o: RequestOptions,
    ) -> Result<ApiResponse<FunctionDefinition>> {
        identifier(&b.deployment_id)?;
        revision(b.expected_revision)?;
        self.0
            .request(
                Method::PUT,
                &format!("/{}/promotion", identifier(id)?),
                b,
                o,
            )
            .await
    }
}
pub struct FunctionSecrets<'a>(Functions<'a>);
impl FunctionSecrets<'_> {
    pub async fn list(
        &self,
        id: &str,
        p: &ListFunctionsParameters,
        o: RequestOptions,
    ) -> Result<ApiResponse<FunctionPage<FunctionSecretVersion>>> {
        self.0
            .request(Method::GET, &format!("/{}/secrets", identifier(id)?), p, o)
            .await
    }
    pub async fn create(
        &self,
        id: &str,
        b: &CreateSecretRequest,
        o: RequestOptions,
    ) -> Result<ApiResponse<FunctionSecretVersion>> {
        self.0
            .request(Method::POST, &format!("/{}/secrets", identifier(id)?), b, o)
            .await
    }
    pub async fn revoke(
        &self,
        id: &str,
        version: &str,
        o: RequestOptions,
    ) -> Result<ApiResponse<FunctionMutationResult>> {
        self.0
            .request(
                Method::DELETE,
                &format!("/{}/secrets/{}", identifier(id)?, identifier(version)?),
                &serde_json::json!({}),
                o,
            )
            .await
    }
}
pub struct FunctionInvocations<'a>(Functions<'a>);
impl FunctionInvocations<'_> {
    pub async fn list(
        &self,
        id: &str,
        p: &ListFunctionsParameters,
        o: RequestOptions,
    ) -> Result<ApiResponse<FunctionPage<FunctionInvocation>>> {
        self.0
            .request(
                Method::GET,
                &format!("/{}/invocations", identifier(id)?),
                p,
                o,
            )
            .await
    }
    pub async fn retrieve(
        &self,
        id: &str,
        invocation: &str,
        o: RequestOptions,
    ) -> Result<ApiResponse<FunctionInvocation>> {
        self.0
            .request(
                Method::GET,
                &format!(
                    "/{}/invocations/{}",
                    identifier(id)?,
                    identifier(invocation)?
                ),
                &serde_json::json!({}),
                o,
            )
            .await
    }
    pub async fn create(
        &self,
        id: &str,
        b: &CreateInvocationRequest,
        o: RequestOptions,
    ) -> Result<ApiResponse<FunctionInvocationResult>> {
        if !o.idempotency_key.as_ref().is_some_and(|k| {
            !k.is_empty() && k.len() <= 128 && k.bytes().all(|b| (33..=126).contains(&b))
        }) {
            return Err(invalid("A valid invocation idempotency key is required"));
        }
        if let Some(id) = &b.deployment_id {
            identifier(id)?;
        }
        self.0
            .request(
                Method::POST,
                &format!("/{}/invocations", identifier(id)?),
                b,
                o,
            )
            .await
    }
}
