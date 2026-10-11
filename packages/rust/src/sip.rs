//! Typed SIP trunks and owner-confined project views.
use crate::{
    models::DataEnvelope,
    transport::{configuration, encode, HttpTransport},
    ApiResponse, Credential, Error, ErrorKind, RequestOptions, Result,
};
use reqwest::Method;
use serde::{Deserialize, Serialize};
macro_rules! wire_enum{($name:ident{$($variant:ident=$wire:literal),*$(,)?})=>{#[derive(Clone,Copy,Debug,Serialize,Deserialize)]pub enum $name{$(#[serde(rename=$wire)]$variant),*}}}
wire_enum!(SipTrunkDirection{Outbound="outbound",Inbound="inbound",Both="both"});
wire_enum!(SipTransport{Udp="udp",Tcp="tcp",Tls="tls"});
wire_enum!(SipCodec{Pcmu="PCMU",Pcma="PCMA",Opus="opus"});
wire_enum!(SipSrtp{Required="required",NotSupported="not_supported"});
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SipTrunkOutbound {
    pub target_uri: String,
    pub transport: SipTransport,
    pub auth_username: Option<String>,
    pub has_password: bool,
    pub from_user: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SipTrunkInbound {
    pub username: String,
    pub realm: String,
    pub session: Option<String>,
    pub allowed_addresses: Vec<String>,
    pub allowed_destinations: Vec<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SipTrunk {
    pub id: String,
    pub project_id: String,
    pub name: String,
    pub enabled: bool,
    pub direction: SipTrunkDirection,
    pub outbound: Option<SipTrunkOutbound>,
    pub inbound: Option<SipTrunkInbound>,
    pub codecs: Vec<SipCodec>,
    pub max_concurrent_calls: u32,
    pub revision: u64,
    pub created_at: String,
    pub updated_at: String,
}
/// Digest password is returned only once. Deliberately omits Debug.
#[derive(Clone, Serialize, Deserialize)]
pub struct SipTrunkCredentials {
    pub username: String,
    pub password: String,
    pub realm: String,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SipTrunkCreated {
    pub trunk: SipTrunk,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub inbound_credentials: Option<SipTrunkCredentials>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SipEndpointTransport {
    pub transport: SipTransport,
    pub port: u16,
    pub srtp: SipSrtp,
}
wire_enum!(SipRtpProtocol{Udp="udp"});
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SipEndpointRtp {
    pub protocol: SipRtpProtocol,
    pub port_min: u16,
    pub port_max: u16,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "status")]
pub enum SipEndpoint {
    #[serde(rename = "hosted")]
    Hosted {
        host: String,
        transports: Vec<SipEndpointTransport>,
        rtp: SipEndpointRtp,
    },
    #[serde(rename = "sip_not_hosted")]
    NotHosted {
        host: (),
        transports: [SipEndpointTransport; 0],
        rtp: (),
    },
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SipTrunkDeleted {
    pub id: String,
    pub deleted: bool,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SipTrunkOutboundInput {
    pub target_uri: String,
    pub transport: SipTransport,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "crate::configuration::deserialize_present_option"
    )]
    pub auth_username: Option<Option<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub auth_password: Option<String>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "crate::configuration::deserialize_present_option"
    )]
    pub from_user: Option<Option<String>>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SipTrunkInboundInput {
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "crate::configuration::deserialize_present_option"
    )]
    pub session: Option<Option<String>>,
    pub allowed_addresses: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub allowed_destinations: Option<Vec<String>>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateSipTrunkBase {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub enabled: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub codecs: Option<Vec<SipCodec>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_concurrent_calls: Option<u32>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(tag = "direction", rename_all = "lowercase")]
pub enum SipTrunkConnectionInput {
    Outbound {
        outbound: SipTrunkOutboundInput,
    },
    Inbound {
        inbound: SipTrunkInboundInput,
    },
    Both {
        outbound: SipTrunkOutboundInput,
        inbound: SipTrunkInboundInput,
    },
}
#[derive(Clone, Serialize, Deserialize)]
pub struct CreateSipTrunkRequest {
    #[serde(flatten)]
    pub settings: CreateSipTrunkBase,
    #[serde(flatten)]
    pub connection: SipTrunkConnectionInput,
}
#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SipTrunkOutboundPatch {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub target_uri: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub transport: Option<SipTransport>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "crate::configuration::deserialize_present_option"
    )]
    pub auth_username: Option<Option<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub auth_password: Option<String>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "crate::configuration::deserialize_present_option"
    )]
    pub from_user: Option<Option<String>>,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SipTrunkInboundPatch {
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "crate::configuration::deserialize_present_option"
    )]
    pub session: Option<Option<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub allowed_addresses: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub allowed_destinations: Option<Vec<String>>,
}
#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateSipTrunkRequest {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expected_revision: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub enabled: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub direction: Option<SipTrunkDirection>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub outbound: Option<SipTrunkOutboundPatch>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub inbound: Option<SipTrunkInboundPatch>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub codecs: Option<Vec<SipCodec>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_concurrent_calls: Option<u32>,
}
pub struct SipTrunks<'a> {
    pub(crate) http: &'a HttpTransport,
    pub(crate) project_id: Option<&'a str>,
}
pub struct OrganizationSipTrunks<'a>(pub(crate) SipTrunks<'a>);
pub struct ProjectSipTrunks<'a>(pub(crate) SipTrunks<'a>);
impl<'a> std::ops::Deref for OrganizationSipTrunks<'a> {
    type Target = SipTrunks<'a>;
    fn deref(&self) -> &Self::Target {
        &self.0
    }
}
impl<'a> std::ops::Deref for ProjectSipTrunks<'a> {
    type Target = SipTrunks<'a>;
    fn deref(&self) -> &Self::Target {
        &self.0
    }
}
impl OrganizationSipTrunks<'_> {
    pub async fn list(
        &self,
        project: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<Vec<SipTrunk>>> {
        self.0.list_for(project, options).await
    }
    pub async fn create(
        &self,
        project: &str,
        body: &CreateSipTrunkRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<SipTrunkCreated>> {
        self.0.create_for(project, body, options).await
    }
}
impl ProjectSipTrunks<'_> {
    pub async fn list(&self, options: RequestOptions) -> Result<ApiResponse<Vec<SipTrunk>>> {
        self.0
            .list_for(self.0.project_id.expect("project-bound resource"), options)
            .await
    }
    pub async fn create(
        &self,
        body: &CreateSipTrunkRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<SipTrunkCreated>> {
        self.0
            .create_for(
                self.0.project_id.expect("project-bound resource"),
                body,
                options,
            )
            .await
    }
}
fn trunk_path(id: &str) -> Result<String> {
    if id.trim().is_empty() {
        return Err(configuration("A SIP trunk id is required"));
    }
    Ok(format!("/platform/sip-trunks/{}", encode(id)))
}
fn unwrapped<T>(response: ApiResponse<DataEnvelope<T>>) -> ApiResponse<T> {
    ApiResponse {
        data: response.data.data,
        metadata: response.metadata,
    }
}
impl SipTrunks<'_> {
    async fn list_for(
        &self,
        project: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<Vec<SipTrunk>>> {
        if project.trim().is_empty() {
            return Err(configuration(
                "A projectId is required for organization clients",
            ));
        }
        Ok(unwrapped(
            self.http
                .request::<_, ()>(
                    Method::GET,
                    "/platform/sip-trunks",
                    &[("projectId", project.into())],
                    None,
                    options,
                )
                .await?,
        ))
    }
    async fn create_for(
        &self,
        project: &str,
        body: &CreateSipTrunkRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<SipTrunkCreated>> {
        if project.trim().is_empty() {
            return Err(configuration(
                "A projectId is required for organization clients",
            ));
        }
        #[derive(Serialize)]
        struct ScopedBody<'a> {
            #[serde(rename = "projectId")]
            project_id: &'a str,
            #[serde(flatten)]
            input: &'a CreateSipTrunkRequest,
        }
        Ok(unwrapped(
            self.http
                .request(
                    Method::POST,
                    "/platform/sip-trunks",
                    &[],
                    Some(&ScopedBody {
                        project_id: project,
                        input: body,
                    }),
                    options,
                )
                .await?,
        ))
    }
    pub async fn endpoint(&self, options: RequestOptions) -> Result<ApiResponse<SipEndpoint>> {
        Ok(unwrapped(
            self.http.get("/platform/sip/endpoint", options).await?,
        ))
    }
    pub async fn retrieve(
        &self,
        id: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<SipTrunk>> {
        let response: ApiResponse<SipTrunk> =
            unwrapped(self.http.get(&trunk_path(id)?, options).await?);
        self.assert_project(id, &response.data)?;
        Ok(response)
    }
    pub async fn update(
        &self,
        id: &str,
        body: &UpdateSipTrunkRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<SipTrunk>> {
        self.confine(id, &options).await?;
        Ok(unwrapped(
            self.http
                .request(Method::PATCH, &trunk_path(id)?, &[], Some(body), options)
                .await?,
        ))
    }
    pub async fn delete(
        &self,
        id: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<SipTrunkDeleted>> {
        self.confine(id, &options).await?;
        Ok(unwrapped(
            self.http
                .request::<_, ()>(Method::DELETE, &trunk_path(id)?, &[], None, options)
                .await?,
        ))
    }
    pub async fn rotate_credentials(
        &self,
        id: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<SipTrunkCredentials>> {
        self.confine(id, &options).await?;
        Ok(unwrapped(
            self.http
                .request::<_, ()>(
                    Method::POST,
                    &format!("{}/credentials", trunk_path(id)?),
                    &[],
                    None,
                    options,
                )
                .await?,
        ))
    }
    async fn confine(&self, id: &str, options: &RequestOptions) -> Result<()> {
        if self.project_id.is_some()
            && matches!(
                self.http.credential,
                Some(Credential::OrganizationApiKey(_))
            )
        {
            let mut read = options.clone();
            read.idempotency_key = None;
            self.retrieve(id, read).await?;
        }
        Ok(())
    }
    fn assert_project(&self, id: &str, trunk: &SipTrunk) -> Result<()> {
        if self
            .project_id
            .is_some_and(|project| !project.eq_ignore_ascii_case(&trunk.project_id))
        {
            return Err(Error::local(
                ErrorKind::NotFound,
                "SIP trunk not found",
                "resource_not_found",
            )
            .with_local_status(404)
            .with_local_details(serde_json::json!({"trunkId":id})));
        }
        Ok(())
    }
}
