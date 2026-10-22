//! Typed resources for the unpublished campaign/profile/custody supplement.
use crate::{
    campaign_contract_validation::{self as v, ContractModel},
    campaign_contracts::*,
    models::{DataEnvelope, SuccessEnvelope},
    transport::{configuration, encode, HttpTransport},
    ApiResponse, Error, ErrorKind, RequestOptions, Result,
};
use reqwest::Method;
use serde::Serialize;
use serde_json::{json, Value};
fn body<T: Serialize>(v: &T) -> Result<Value> {
    serde_json::to_value(v).map_err(|_| configuration("body"))
}
fn options(mut o: RequestOptions, write: bool, replay: bool) -> RequestOptions {
    if o.api_version.is_none() {
        o.api_version = Some("2026-10-14".into());
    }
    if write && !replay && o.max_network_retries.is_none() {
        o.max_network_retries = Some(0);
    }
    if replay {
        o = o.idempotent();
    }
    o
}
fn invalid(metadata: crate::ResponseMetadata) -> Error {
    Error::new(
        ErrorKind::Server,
        "The API returned an invalid contract response.",
        "invalid_response",
    )
    .with_metadata(metadata)
}
#[allow(clippy::too_many_arguments)]
async fn request<T: ContractModel>(
    http: &HttpTransport,
    method: Method,
    path: &str,
    query: &[(&str, String)],
    input: Option<Value>,
    o: RequestOptions,
    messaging: bool,
    page: bool,
    replay: bool,
) -> Result<ApiResponse<T>> {
    if messaging {
        http.server()?;
    }
    let o = options(o, method != Method::GET, replay);
    let r: ApiResponse<Value> = http.request(method, path, query, input.as_ref(), o).await?;
    if r.metadata.status != 200
        || !r.metadata.headers.get("content-type").is_some_and(|s| {
            s.split(';')
                .next()
                .unwrap()
                .trim()
                .eq_ignore_ascii_case("application/json")
        })
    {
        return Err(invalid(r.metadata));
    }
    if messaging && r.data.get("success") != Some(&Value::Bool(true)) {
        return Err(invalid(r.metadata));
    }
    let data = if page {
        r.data
    } else {
        r.data
            .get("data")
            .filter(|v| !v.is_null())
            .cloned()
            .ok_or_else(|| invalid(r.metadata.clone()))?
    };
    let data: T = serde_json::from_value(data).map_err(|_| invalid(r.metadata.clone()))?;
    data.validate_response()
        .map_err(|_| invalid(r.metadata.clone()))?;
    Ok(ApiResponse {
        data,
        metadata: r.metadata,
    })
}
async fn platform<T: ContractModel>(
    h: &HttpTransport,
    m: Method,
    p: &str,
    q: &[(&str, String)],
    b: Option<Value>,
    o: RequestOptions,
    replay: bool,
) -> Result<ApiResponse<DataEnvelope<T>>> {
    let r = request(h, m, p, q, b, o, false, false, replay).await?;
    Ok(ApiResponse {
        data: DataEnvelope { data: r.data },
        metadata: r.metadata,
    })
}
async fn messaging<T: ContractModel>(
    h: &HttpTransport,
    m: Method,
    p: &str,
    b: Option<Value>,
    o: RequestOptions,
    replay: bool,
) -> Result<ApiResponse<SuccessEnvelope<T>>> {
    let r = request(h, m, p, &[], b, o, true, false, replay).await?;
    Ok(ApiResponse {
        data: SuccessEnvelope {
            success: true,
            data: r.data,
        },
        metadata: r.metadata,
    })
}
fn campaign(id: &str) -> Result<String> {
    v::uuid(id, "campaignId")?;
    Ok(format!("/platform/campaigns/{}", encode(id)))
}
fn message_project(project: &str) -> Result<String> {
    v::text(project, 1, usize::MAX, "projectSlug")?;
    Ok(format!("/messaging/projects/{}", encode(project)))
}
async fn export(
    http: &HttpTransport,
    path: &str,
    params: &CampaignRecipientExportParameters,
    project: Option<&str>,
    o: RequestOptions,
    messaging: bool,
) -> Result<ApiResponse<CampaignRecipientExportPage>> {
    if messaging {
        http.server()?;
    }
    let mut q = v::export_query(params)?;
    if let Some(p) = project {
        v::uuid(p, "projectId")?;
        q.push(("projectId", p.into()));
    }
    let r = http
        .request_text(path, &q, options(o, false, false), "text/csv")
        .await?;
    if r.metadata.status != 200
        || !r.metadata.headers.get("content-type").is_some_and(|s| {
            s.split(';')
                .next()
                .unwrap()
                .trim()
                .eq_ignore_ascii_case("text/csv")
        })
    {
        return Err(invalid(r.metadata));
    }
    let next_cursor = r
        .metadata
        .headers
        .get("polymorfa-next-cursor")
        .filter(|s| !s.is_empty())
        .cloned();
    let filename = r
        .metadata
        .headers
        .get("content-disposition")
        .and_then(|s| crate::transport::filename(s));
    Ok(ApiResponse {
        data: CampaignRecipientExportPage {
            csv: r.data,
            next_cursor,
            filename,
        },
        metadata: r.metadata,
    })
}
impl crate::campaigns::MessagingCampaigns<'_> {
    pub async fn get_reply_flow(
        &self,
        project: &str,
        id: &str,
        o: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<CampaignReplyFlow>>> {
        self.0.server()?;
        v::uuid(id, "replyFlowId")?;
        messaging(
            self.0,
            Method::GET,
            &format!(
                "{}/campaign-reply-flows/{}",
                message_project(project)?,
                encode(id)
            ),
            None,
            o,
            false,
        )
        .await
    }
    pub async fn create_reply_flow(
        &self,
        project: &str,
        b: &CreateCampaignReplyFlowRequest,
        o: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<CampaignReplyFlow>>> {
        self.0.server()?;
        v::reply_create(b)?;
        messaging(
            self.0,
            Method::POST,
            &format!("{}/campaign-reply-flows", message_project(project)?),
            Some(body(b)?),
            o,
            false,
        )
        .await
    }
    pub async fn set_reply_flow(
        &self,
        project: &str,
        id: &str,
        b: &SetCampaignReplyFlowRequest,
        o: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<CampaignReplyFlowAssignment>>> {
        self.0.server()?;
        v::uuid(id, "campaignId")?;
        v::assignment(b)?;
        messaging(
            self.0,
            Method::PUT,
            &format!(
                "{}/campaigns/{}/reply-flow",
                message_project(project)?,
                encode(id)
            ),
            Some(body(b)?),
            o,
            false,
        )
        .await
    }
    pub async fn test_send(
        &self,
        project: &str,
        id: &str,
        b: &CampaignTestSendRequest,
        o: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<CampaignTestSend>>> {
        self.0.server()?;
        v::uuid(id, "campaignId")?;
        v::test_send(b)?;
        messaging(
            self.0,
            Method::POST,
            &format!(
                "{}/campaigns/{}/test-send",
                message_project(project)?,
                encode(id)
            ),
            Some(body(b)?),
            o,
            true,
        )
        .await
    }
    pub async fn links(
        &self,
        project: &str,
        id: &str,
        o: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<Vec<CampaignTrackedLinkReport>>>> {
        self.0.server()?;
        v::uuid(id, "campaignId")?;
        messaging(
            self.0,
            Method::GET,
            &format!(
                "{}/campaigns/{}/links",
                message_project(project)?,
                encode(id)
            ),
            None,
            o,
            false,
        )
        .await
    }
    pub async fn export_recipients(
        &self,
        project: &str,
        id: &str,
        p: &CampaignRecipientExportParameters,
        o: RequestOptions,
    ) -> Result<ApiResponse<CampaignRecipientExportPage>> {
        self.0.server()?;
        v::uuid(id, "campaignId")?;
        export(
            self.0,
            &format!(
                "{}/campaigns/{}/recipients/export",
                message_project(project)?,
                encode(id)
            ),
            p,
            None,
            o,
            true,
        )
        .await
    }
}
/// A retained project selection. Inputs cannot override this resource's project.
pub struct ProjectCampaigns<'a> {
    pub(crate) http: &'a HttpTransport,
    pub(crate) project_id: &'a str,
}
impl ProjectCampaigns<'_> {
    fn selected(&self) -> Result<Vec<(&'static str, String)>> {
        v::uuid(self.project_id, "projectId")?;
        Ok(vec![("projectId", self.project_id.into())])
    }
    fn selected_body<T: Serialize>(&self, b: &T) -> Result<Value> {
        v::uuid(self.project_id, "projectId")?;
        let mut b = body(b)?;
        b.as_object_mut()
            .ok_or_else(|| configuration("body"))?
            .insert("projectId".into(), json!(self.project_id));
        Ok(b)
    }
    pub async fn get_reply_flow(
        &self,
        id: &str,
        o: RequestOptions,
    ) -> Result<ApiResponse<DataEnvelope<CampaignReplyFlow>>> {
        v::uuid(id, "replyFlowId")?;
        platform(
            self.http,
            Method::GET,
            &format!("/platform/campaign-reply-flows/{}", encode(id)),
            &self.selected()?,
            None,
            o,
            false,
        )
        .await
    }
    pub async fn create_reply_flow(
        &self,
        b: &CreateCampaignReplyFlowRequest,
        o: RequestOptions,
    ) -> Result<ApiResponse<DataEnvelope<CampaignReplyFlow>>> {
        v::reply_create(b)?;
        platform(
            self.http,
            Method::POST,
            "/platform/campaign-reply-flows",
            &[],
            Some(self.selected_body(b)?),
            o,
            false,
        )
        .await
    }
    pub async fn set_reply_flow(
        &self,
        id: &str,
        b: &SetCampaignReplyFlowRequest,
        o: RequestOptions,
    ) -> Result<ApiResponse<DataEnvelope<CampaignReplyFlowAssignment>>> {
        v::assignment(b)?;
        platform(
            self.http,
            Method::PUT,
            &format!("{}/reply-flow", campaign(id)?),
            &[],
            Some(self.selected_body(b)?),
            o,
            false,
        )
        .await
    }
    pub async fn test_send(
        &self,
        id: &str,
        b: &CampaignTestSendRequest,
        o: RequestOptions,
    ) -> Result<ApiResponse<DataEnvelope<CampaignTestSend>>> {
        v::test_send(b)?;
        platform(
            self.http,
            Method::POST,
            &format!("{}/test-send", campaign(id)?),
            &[],
            Some(self.selected_body(b)?),
            o,
            true,
        )
        .await
    }
    pub async fn links(
        &self,
        id: &str,
        o: RequestOptions,
    ) -> Result<ApiResponse<DataEnvelope<Vec<CampaignTrackedLinkReport>>>> {
        platform(
            self.http,
            Method::GET,
            &format!("{}/links", campaign(id)?),
            &self.selected()?,
            None,
            o,
            false,
        )
        .await
    }
    pub async fn list_launch_approvals(
        &self,
        id: &str,
        o: RequestOptions,
    ) -> Result<ApiResponse<DataEnvelope<Vec<CampaignLaunchApproval>>>> {
        platform(
            self.http,
            Method::GET,
            &format!("{}/approvals", campaign(id)?),
            &self.selected()?,
            None,
            o,
            false,
        )
        .await
    }
    pub async fn export_recipients(
        &self,
        id: &str,
        p: &CampaignRecipientExportParameters,
        o: RequestOptions,
    ) -> Result<ApiResponse<CampaignRecipientExportPage>> {
        export(
            self.http,
            &format!("{}/recipients/export", campaign(id)?),
            p,
            Some(self.project_id),
            o,
            false,
        )
        .await
    }
}
impl crate::platform::ProjectClient {
    pub fn campaigns(&self) -> ProjectCampaigns<'_> {
        ProjectCampaigns {
            http: &self.http,
            project_id: self.project_id(),
        }
    }
    pub fn signal_custody(&self) -> SignalCustodyResource<'_> {
        SignalCustodyResource {
            http: &self.http,
            project_id: self.project_id(),
        }
    }
}
impl crate::campaigns::PlatformCampaigns<'_> {
    pub async fn get_reply_flow(
        &self,
        id: &str,
        p: &CampaignProjectParameters,
        o: RequestOptions,
    ) -> Result<ApiResponse<DataEnvelope<CampaignReplyFlow>>> {
        ProjectCampaigns {
            http: self.0,
            project_id: &p.project_id,
        }
        .get_reply_flow(id, o)
        .await
    }
    pub async fn create_reply_flow(
        &self,
        b: &CreatePlatformCampaignReplyFlowRequest,
        o: RequestOptions,
    ) -> Result<ApiResponse<DataEnvelope<CampaignReplyFlow>>> {
        ProjectCampaigns {
            http: self.0,
            project_id: &b.project_id,
        }
        .create_reply_flow(&b.body, o)
        .await
    }
    pub async fn set_reply_flow(
        &self,
        id: &str,
        b: &SetPlatformCampaignReplyFlowRequest,
        o: RequestOptions,
    ) -> Result<ApiResponse<DataEnvelope<CampaignReplyFlowAssignment>>> {
        ProjectCampaigns {
            http: self.0,
            project_id: &b.project_id,
        }
        .set_reply_flow(id, &b.body, o)
        .await
    }
    pub async fn test_send(
        &self,
        id: &str,
        b: &PlatformCampaignTestSendRequest,
        o: RequestOptions,
    ) -> Result<ApiResponse<DataEnvelope<CampaignTestSend>>> {
        ProjectCampaigns {
            http: self.0,
            project_id: &b.project_id,
        }
        .test_send(id, &b.body, o)
        .await
    }
    pub async fn links(
        &self,
        id: &str,
        p: &CampaignProjectParameters,
        o: RequestOptions,
    ) -> Result<ApiResponse<DataEnvelope<Vec<CampaignTrackedLinkReport>>>> {
        ProjectCampaigns {
            http: self.0,
            project_id: &p.project_id,
        }
        .links(id, o)
        .await
    }
    pub async fn list_launch_approvals(
        &self,
        id: &str,
        p: &CampaignProjectParameters,
        o: RequestOptions,
    ) -> Result<ApiResponse<DataEnvelope<Vec<CampaignLaunchApproval>>>> {
        ProjectCampaigns {
            http: self.0,
            project_id: &p.project_id,
        }
        .list_launch_approvals(id, o)
        .await
    }
    pub async fn export_recipients(
        &self,
        id: &str,
        p: &PlatformCampaignRecipientExportParameters,
        o: RequestOptions,
    ) -> Result<ApiResponse<CampaignRecipientExportPage>> {
        ProjectCampaigns {
            http: self.0,
            project_id: &p.project_id,
        }
        .export_recipients(id, &p.filters, o)
        .await
    }
    pub async fn get_settings(
        &self,
        o: RequestOptions,
    ) -> Result<ApiResponse<DataEnvelope<CampaignSettings>>> {
        platform(
            self.0,
            Method::GET,
            "/platform/campaign-settings",
            &[],
            None,
            o,
            false,
        )
        .await
    }
}
impl crate::audiences::Audiences<'_> {
    pub async fn create_from_campaign(
        &self,
        b: &CreateAudienceFromCampaignRequest,
        o: RequestOptions,
    ) -> Result<ApiResponse<DataEnvelope<AudienceFromCampaignResult>>> {
        v::retarget(b)?;
        platform(
            self.0,
            Method::POST,
            "/platform/audiences/from-campaign",
            &[],
            Some(body(b)?),
            o,
            false,
        )
        .await
    }
}
pub struct AudienceProfiles<'a>(&'a HttpTransport);
pub struct AudienceProfileImports<'a>(&'a HttpTransport);
impl crate::platform::OrganizationClient {
    pub fn audience_profiles(&self) -> AudienceProfiles<'_> {
        AudienceProfiles(&self.http)
    }
}
fn profile_path(phone: &str) -> Result<String> {
    v::phone(phone)?;
    Ok(format!("/platform/audience-profiles/{}", encode(phone)))
}
impl AudienceProfiles<'_> {
    pub fn imports(&self) -> AudienceProfileImports<'_> {
        AudienceProfileImports(self.0)
    }
    pub async fn list(
        &self,
        p: &ListAudienceProfilesParameters,
        o: RequestOptions,
    ) -> Result<ApiResponse<AudienceProfilePage<AudienceProfile>>> {
        request(
            self.0,
            Method::GET,
            "/platform/audience-profiles",
            &v::page(p)?,
            None,
            o,
            false,
            true,
            false,
        )
        .await
    }
    pub async fn retrieve(
        &self,
        phone: &str,
        o: RequestOptions,
    ) -> Result<ApiResponse<DataEnvelope<AudienceProfile>>> {
        platform(
            self.0,
            Method::GET,
            &profile_path(phone)?,
            &[],
            None,
            o,
            false,
        )
        .await
    }
    pub async fn put(
        &self,
        phone: &str,
        b: &PutAudienceProfileRequest,
        o: RequestOptions,
    ) -> Result<ApiResponse<DataEnvelope<AudienceProfile>>> {
        v::profile(b)?;
        platform(
            self.0,
            Method::PUT,
            &profile_path(phone)?,
            &[],
            Some(body(b)?),
            o,
            false,
        )
        .await
    }
    pub async fn delete(
        &self,
        phone: &str,
        expected_revision: u64,
        o: RequestOptions,
    ) -> Result<ApiResponse<DataEnvelope<DeleteAudienceProfileResult>>> {
        v::ensure(
            (1..=v::SAFE).contains(&expected_revision),
            "expectedRevision",
        )?;
        platform(
            self.0,
            Method::DELETE,
            &profile_path(phone)?,
            &[("expectedRevision", expected_revision.to_string())],
            None,
            o,
            false,
        )
        .await
    }
    pub async fn list_consent(
        &self,
        phone: &str,
        p: &ListAudienceProfilesParameters,
        o: RequestOptions,
    ) -> Result<ApiResponse<AudienceProfilePage<AudienceConsentAssertion>>> {
        request(
            self.0,
            Method::GET,
            &format!("{}/consent", profile_path(phone)?),
            &v::page(p)?,
            None,
            o,
            false,
            true,
            false,
        )
        .await
    }
}
impl AudienceProfileImports<'_> {
    pub async fn create(
        &self,
        b: &CreateAudienceProfileImportRequest,
        o: RequestOptions,
    ) -> Result<ApiResponse<DataEnvelope<AudienceProfileImportJob>>> {
        v::import(b)?;
        platform(
            self.0,
            Method::POST,
            "/platform/audience-profile-imports",
            &[],
            Some(body(b)?),
            o,
            false,
        )
        .await
    }
    pub async fn retrieve(
        &self,
        id: &str,
        o: RequestOptions,
    ) -> Result<ApiResponse<DataEnvelope<AudienceProfileImportJob>>> {
        v::uuid(id, "jobId")?;
        platform(
            self.0,
            Method::GET,
            &format!("/platform/audience-profile-imports/{}", encode(id)),
            &[],
            None,
            o,
            false,
        )
        .await
    }
    pub async fn cancel(
        &self,
        id: &str,
        o: RequestOptions,
    ) -> Result<ApiResponse<DataEnvelope<AudienceProfileImportJob>>> {
        v::uuid(id, "jobId")?;
        platform(
            self.0,
            Method::DELETE,
            &format!("/platform/audience-profile-imports/{}", encode(id)),
            &[],
            None,
            o,
            false,
        )
        .await
    }
}
impl crate::organization_controls::OptOuts<'_> {
    pub async fn get_confirmation_settings(
        &self,
        o: RequestOptions,
    ) -> Result<ApiResponse<DataEnvelope<StopConfirmationSettings>>> {
        platform(
            self.0,
            Method::GET,
            "/platform/optouts/confirmation-settings",
            &[],
            None,
            o,
            false,
        )
        .await
    }
    pub async fn update_confirmation_settings(
        &self,
        b: &UpdateStopConfirmationSettingsRequest,
        o: RequestOptions,
    ) -> Result<ApiResponse<DataEnvelope<StopConfirmationSettings>>> {
        v::confirmation(b)?;
        platform(
            self.0,
            Method::PUT,
            "/platform/optouts/confirmation-settings",
            &[],
            Some(body(b)?),
            o,
            false,
        )
        .await
    }
    pub async fn get_confirmation_summary(
        &self,
        o: RequestOptions,
    ) -> Result<ApiResponse<DataEnvelope<StopConfirmationSummary>>> {
        platform(
            self.0,
            Method::GET,
            "/platform/optouts/confirmation-summary",
            &[],
            None,
            o,
            false,
        )
        .await
    }
}
fn custody_path(project: &str, customer: Option<&str>) -> Result<String> {
    v::uuid(project, "projectId")?;
    let mut p = format!("/platform/projects/{}", encode(project));
    if let Some(c) = customer {
        v::uuid(c, "customerId")?;
        p.push_str(&format!("/customers/{}", encode(c)));
    }
    Ok(format!("{p}/signal-custody"))
}
/// Future defaults only, with no existing-Number custody conversion.
pub struct SignalCustodyResource<'a> {
    http: &'a HttpTransport,
    project_id: &'a str,
}
impl SignalCustodyResource<'_> {
    pub async fn retrieve(
        &self,
        o: RequestOptions,
    ) -> Result<ApiResponse<DataEnvelope<SignalCustodyDefault>>> {
        platform(
            self.http,
            Method::GET,
            &custody_path(self.project_id, None)?,
            &[],
            None,
            o,
            false,
        )
        .await
    }
    pub async fn update(
        &self,
        b: &ProjectSignalCustodyUpdate,
        o: RequestOptions,
    ) -> Result<ApiResponse<DataEnvelope<SignalCustodyDefault>>> {
        v::custody(b.expected_revision)?;
        platform(
            self.http,
            Method::PUT,
            &custody_path(self.project_id, None)?,
            &[],
            Some(body(b)?),
            o,
            false,
        )
        .await
    }
    pub async fn retrieve_customer(
        &self,
        customer: &str,
        o: RequestOptions,
    ) -> Result<ApiResponse<DataEnvelope<SignalCustodyDefault>>> {
        platform(
            self.http,
            Method::GET,
            &custody_path(self.project_id, Some(customer))?,
            &[],
            None,
            o,
            false,
        )
        .await
    }
    pub async fn update_customer(
        &self,
        customer: &str,
        b: &CustomerSignalCustodyUpdate,
        o: RequestOptions,
    ) -> Result<ApiResponse<DataEnvelope<SignalCustodyDefault>>> {
        v::custody(b.expected_revision)?;
        platform(
            self.http,
            Method::PUT,
            &custody_path(self.project_id, Some(customer))?,
            &[],
            Some(body(b)?),
            o,
            false,
        )
        .await
    }
}
impl crate::platform::Projects<'_> {
    pub async fn get_signal_custody(
        &self,
        project: &str,
        o: RequestOptions,
    ) -> Result<ApiResponse<DataEnvelope<SignalCustodyDefault>>> {
        SignalCustodyResource {
            http: self.0,
            project_id: project,
        }
        .retrieve(o)
        .await
    }
    pub async fn update_signal_custody(
        &self,
        project: &str,
        b: &ProjectSignalCustodyUpdate,
        o: RequestOptions,
    ) -> Result<ApiResponse<DataEnvelope<SignalCustodyDefault>>> {
        SignalCustodyResource {
            http: self.0,
            project_id: project,
        }
        .update(b, o)
        .await
    }
}
impl crate::customers::Customers<'_> {
    pub async fn get_signal_custody(
        &self,
        project: &str,
        customer: &str,
        o: RequestOptions,
    ) -> Result<ApiResponse<DataEnvelope<SignalCustodyDefault>>> {
        SignalCustodyResource {
            http: self.0,
            project_id: project,
        }
        .retrieve_customer(customer, o)
        .await
    }
    pub async fn update_signal_custody(
        &self,
        project: &str,
        customer: &str,
        b: &CustomerSignalCustodyUpdate,
        o: RequestOptions,
    ) -> Result<ApiResponse<DataEnvelope<SignalCustodyDefault>>> {
        SignalCustodyResource {
            http: self.0,
            project_id: project,
        }
        .update_customer(customer, b, o)
        .await
    }
}
