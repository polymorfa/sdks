use crate::{
    models::*,
    transport::{configuration, encode, HttpTransport},
    ApiResponse, ClientOptions, Credential, RequestOptions, Result,
};
use reqwest::Method;

#[derive(Clone)]
pub struct OrganizationClient {
    pub(crate) http: HttpTransport,
}
impl OrganizationClient {
    pub fn new(credential: Credential, options: ClientOptions) -> Result<Self> {
        if !matches!(credential, Credential::OrganizationApiKey(_)) {
            return Err(configuration("credential: organization API key required"));
        }
        Ok(Self {
            http: HttpTransport::new(credential, options)?,
        })
    }
    pub fn project(&self, project_id: impl Into<String>) -> Result<ProjectClient> {
        ProjectClient::from_transport(self.http.clone(), project_id.into())
    }
    pub fn projects(&self) -> Projects<'_> {
        Projects(&self.http)
    }
    pub fn operations(&self) -> crate::operations::Operations<'_> {
        crate::operations::Operations {
            http: &self.http,
            prefix: "/platform".into(),
        }
    }
    pub fn webhooks(&self) -> crate::developer::PlatformWebhooks<'_> {
        crate::developer::PlatformWebhooks {
            http: &self.http,
            prefix: "/platform".into(),
        }
    }
    pub fn webhook_deliveries(&self) -> crate::developer::WebhookDeliveries<'_> {
        crate::developer::WebhookDeliveries {
            http: &self.http,
            prefix: "/platform".into(),
        }
    }
    pub fn events(&self) -> Events<'_> {
        Events {
            http: &self.http,
            prefix: "/platform".into(),
            project_id: None,
        }
    }
    pub async fn raw<T: serde::de::DeserializeOwned>(
        &self,
        method: Method,
        path: &str,
        query: &Query,
        body: Option<&serde_json::Value>,
        options: RequestOptions,
    ) -> Result<ApiResponse<T>> {
        let pairs = query_pairs(query)?;
        self.http.request(method, path, &pairs, body, options).await
    }
}
#[derive(Clone)]
pub struct ProjectClient {
    pub(crate) http: HttpTransport,
    project_id: String,
}
impl ProjectClient {
    pub fn new(
        credential: Credential,
        project_id: impl Into<String>,
        options: ClientOptions,
    ) -> Result<Self> {
        credential.server()?;
        Self::from_transport(HttpTransport::new(credential, options)?, project_id.into())
    }
    fn from_transport(http: HttpTransport, project_id: String) -> Result<Self> {
        if project_id.trim().is_empty() {
            return Err(configuration("project_id"));
        }
        Ok(Self { http, project_id })
    }
    pub fn project_id(&self) -> &str {
        &self.project_id
    }
    pub fn operations(&self) -> crate::operations::Operations<'_> {
        crate::operations::Operations {
            http: &self.http,
            prefix: self.prefix(),
        }
    }
    pub fn webhooks(&self) -> crate::developer::PlatformWebhooks<'_> {
        crate::developer::PlatformWebhooks {
            http: &self.http,
            prefix: self.prefix(),
        }
    }
    pub fn webhook_deliveries(&self) -> crate::developer::WebhookDeliveries<'_> {
        crate::developer::WebhookDeliveries {
            http: &self.http,
            prefix: self.prefix(),
        }
    }
    pub fn project(&self, project_id: impl Into<String>) -> Result<Self> {
        let project_id = project_id.into();
        if matches!(self.http.credential, Credential::ProjectToken(_))
            && self.project_id != project_id
        {
            return Err(configuration("project_id: project token cannot be rebound"));
        }
        Self::from_transport(self.http.clone(), project_id)
    }
    pub fn events(&self) -> Events<'_> {
        Events {
            http: &self.http,
            prefix: self.prefix(),
            project_id: Some(self.project_id.clone()),
        }
    }
    pub(crate) fn prefix(&self) -> String {
        format!("/platform/projects/{}", encode(&self.project_id))
    }
    pub async fn raw<T: serde::de::DeserializeOwned>(
        &self,
        method: Method,
        relative_path: &str,
        query: &Query,
        body: Option<&serde_json::Value>,
        options: RequestOptions,
    ) -> Result<ApiResponse<T>> {
        crate::transport::validate_path(relative_path)?;
        if relative_path.starts_with("/platform/projects/") {
            return Err(configuration("project-relative path"));
        }
        let pairs = query_pairs(query)?;
        self.http
            .request(
                method,
                &format!("{}{relative_path}", self.prefix()),
                &pairs,
                body,
                options,
            )
            .await
    }
}
pub struct Projects<'a>(&'a HttpTransport);
impl Projects<'_> {
    pub async fn list(
        &self,
        options: RequestOptions,
    ) -> Result<ApiResponse<DataEnvelope<Vec<ProjectWithStats>>>> {
        self.0.get("/platform/projects", options).await
    }
    pub async fn create(
        &self,
        body: &CreateProjectRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<DataEnvelope<CreatedProject>>> {
        self.0
            .request(Method::POST, "/platform/projects", &[], Some(body), options)
            .await
    }
    pub async fn request_production_enrollment(
        &self,
        project_id: &str,
        body: &ProductionEnrollmentRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<DataEnvelope<ProductionEnrollmentResult>>> {
        self.0
            .request(
                Method::POST,
                &format!("/platform/projects/{}/promote", encode(project_id)),
                &[],
                Some(body),
                options,
            )
            .await
    }
    pub async fn approve_production_enrollment(
        &self,
        project_id: &str,
        operation_id: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<DataEnvelope<ProductionEnrollmentCommandResult>>> {
        self.0
            .request::<_, ()>(
                Method::POST,
                &format!(
                    "/platform/projects/{}/production-enrollments/{}/approve",
                    encode(project_id),
                    encode(operation_id)
                ),
                &[],
                None,
                options,
            )
            .await
    }
    pub async fn cancel_production_enrollment(
        &self,
        project_id: &str,
        operation_id: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<DataEnvelope<ProductionEnrollmentCommandResult>>> {
        self.0
            .request::<_, ()>(
                Method::POST,
                &format!(
                    "/platform/projects/{}/production-enrollments/{}/cancel",
                    encode(project_id),
                    encode(operation_id)
                ),
                &[],
                None,
                options,
            )
            .await
    }
}
pub struct Events<'a> {
    http: &'a HttpTransport,
    prefix: String,
    project_id: Option<String>,
}
impl Events<'_> {
    pub async fn retrieve(
        &self,
        id: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<EventRecord>> {
        let response: ApiResponse<DataEnvelope<EventRecord>> = self
            .http
            .get(&format!("{}/events/{}", self.prefix, encode(id)), options)
            .await?;
        Ok(ApiResponse {
            data: response.data.data,
            metadata: response.metadata,
        })
    }
    pub async fn list(
        &self,
        parameters: &EventListParameters,
        options: RequestOptions,
    ) -> Result<crate::pagination::CursorPage<EventRecord>> {
        crate::pagination::CursorPage::load(
            self.http.clone(),
            format!("{}/events", self.prefix),
            parameters.query()?,
            options,
        )
        .await
    }
    pub async fn retrieve_with_payload(
        &self,
        id: &str,
        include_payload: bool,
        options: RequestOptions,
    ) -> Result<ApiResponse<EventRecord>> {
        let response: ApiResponse<DataEnvelope<EventRecord>> = self
            .http
            .request::<_, ()>(
                Method::GET,
                &format!("{}/events/{}", self.prefix, encode(id)),
                &[("includePayload", include_payload.to_string())],
                None,
                options,
            )
            .await?;
        Ok(ApiResponse {
            data: response.data.data,
            metadata: response.metadata,
        })
    }
    pub async fn replay(
        &self,
        id: &str,
        body: &ReplayEventRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<EventReplayReceipt>> {
        let response: ApiResponse<DataEnvelope<EventReplayReceipt>> = self
            .http
            .request(
                Method::POST,
                &format!("{}/events/{}/replays", self.prefix, encode(id)),
                &[],
                Some(body),
                options,
            )
            .await?;
        Ok(ApiResponse {
            data: response.data.data,
            metadata: response.metadata,
        })
    }
    pub fn stream(
        &self,
        mut params: crate::stream::EventStreamOptions,
    ) -> Result<crate::stream::EventStream> {
        let project_id = self
            .project_id
            .clone()
            .or(params.project_id.take())
            .ok_or_else(|| configuration("project_id"))?;
        Ok(crate::stream::EventStream::new(
            self.http.clone(),
            format!("/platform/projects/{}/events/stream", encode(&project_id)),
            params,
        ))
    }
    pub async fn acknowledge_stream(
        &self,
        stream_id: &str,
        body: &EventStreamAcknowledgement,
        options: RequestOptions,
    ) -> Result<ApiResponse<EventStreamAcknowledgementReceipt>> {
        let project_id = self
            .project_id
            .as_ref()
            .ok_or_else(|| configuration("project_id: acknowledge via the bound project view"))?;
        let response: ApiResponse<DataEnvelope<EventStreamAcknowledgementReceipt>> = self
            .http
            .request(
                Method::POST,
                &format!(
                    "/platform/projects/{}/events/stream/{}/ack",
                    encode(project_id),
                    encode(stream_id)
                ),
                &[],
                Some(body),
                options,
            )
            .await?;
        Ok(ApiResponse {
            data: response.data.data,
            metadata: response.metadata,
        })
    }
}
