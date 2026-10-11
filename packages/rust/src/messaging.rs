use crate::{
    models::*,
    transport::{encode, DownloadStream, HttpTransport},
    ApiResponse, ClientOptions, Credential, RequestOptions, Result,
};
use reqwest::Method;

#[derive(Clone)]
pub struct MessagingClient {
    pub(crate) http: HttpTransport,
}
impl MessagingClient {
    pub fn new(credential: Credential, options: ClientOptions) -> Result<Self> {
        Ok(Self {
            http: HttpTransport::new(credential, options)?,
        })
    }
    pub fn ban_safe(&self) -> crate::policies::MessagingBanSafe<'_> {
        crate::policies::MessagingBanSafe(&self.http)
    }
    pub fn sessions(&self) -> Sessions<'_> {
        Sessions(&self.http)
    }
    pub fn channels(&self) -> crate::channels::Channels<'_> {
        crate::channels::Channels(&self.http)
    }
    pub fn groups(&self) -> crate::groups::Groups<'_> {
        crate::groups::Groups(&self.http)
    }
    pub fn chats(&self) -> crate::history::Chats<'_> {
        crate::history::Chats(&self.http)
    }
    pub fn messages(&self) -> Messages<'_> {
        Messages(&self.http)
    }
    pub fn quick_links(&self) -> QuickLinks<'_> {
        QuickLinks(&self.http)
    }
    pub fn webhooks(&self) -> Webhooks<'_> {
        Webhooks(&self.http)
    }
    pub fn media(&self) -> Media<'_> {
        Media(&self.http)
    }
    pub fn contacts(&self) -> crate::account::Contacts<'_> {
        crate::account::Contacts(&self.http)
    }
    pub fn profile(&self) -> crate::account::Profile<'_> {
        crate::account::Profile(&self.http)
    }
    pub fn privacy(&self) -> crate::account::Privacy<'_> {
        crate::account::Privacy(&self.http)
    }
    pub fn presence(&self) -> crate::account::Presence<'_> {
        crate::account::Presence(&self.http)
    }
    pub fn identities(&self) -> crate::account::Identities<'_> {
        crate::account::Identities(&self.http)
    }
    pub fn users(&self) -> crate::account::Users<'_> {
        crate::account::Users(&self.http)
    }
    pub fn labels(&self) -> crate::account::Labels<'_> {
        crate::account::Labels(&self.http)
    }
    pub fn quick_replies(&self) -> crate::account::QuickReplies<'_> {
        crate::account::QuickReplies(&self.http)
    }
    pub fn calls(&self) -> crate::calls::Calls<'_> {
        crate::calls::Calls::new(&self.http)
    }
    pub fn voip(&self) -> crate::voip::Voip<'_> {
        crate::voip::Voip(&self.http)
    }
    pub fn hybrid_link(&self) -> crate::connections::HybridLink<'_> {
        crate::connections::HybridLink(&self.http)
    }
    pub fn client_tokens(&self) -> crate::connections::ClientTokens<'_> {
        crate::connections::ClientTokens(&self.http)
    }
    /// Explicit escape hatch for newly released endpoints; never counts as typed coverage.
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
pub struct Sessions<'a>(pub(crate) &'a HttpTransport);
impl Sessions<'_> {
    pub async fn update(
        &self,
        session: &str,
        body: &crate::configuration::UpdateSessionRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<Session>>> {
        self.0.server()?;
        self.0
            .request(
                Method::PUT,
                &session_path(session),
                &[],
                Some(body),
                options,
            )
            .await
    }
    pub async fn list(
        &self,
        options: RequestOptions,
    ) -> Result<ApiResponse<DataEnvelope<Vec<PlatformSession>>>> {
        self.0.server()?;
        self.0.get("/platform/sessions", options).await
    }
    pub async fn retrieve(
        &self,
        session: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<Session>>> {
        self.0.server()?;
        self.0.get(&session_path(session), options).await
    }
    pub async fn delete(
        &self,
        session: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<DataEnvelope<SessionRemoveResult>>> {
        self.0.server()?;
        self.0
            .request::<_, ()>(Method::DELETE, &session_path(session), &[], None, options)
            .await
    }
    pub async fn start(
        &self,
        session: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<DataEnvelope<SessionStartResult>>> {
        self.0.server()?;
        self.0
            .request::<_, ()>(
                Method::POST,
                &format!("{}/start", session_path(session)),
                &[],
                None,
                options,
            )
            .await
    }
    pub async fn stop(
        &self,
        session: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<DataEnvelope<SessionStopResult>>> {
        self.0.server()?;
        self.0
            .request::<_, ()>(
                Method::POST,
                &format!("{}/stop", session_path(session)),
                &[],
                None,
                options,
            )
            .await
    }
    pub async fn restart(
        &self,
        session: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<OperationAccepted>> {
        self.0.server()?;
        self.0
            .request::<_, ()>(
                Method::POST,
                &format!("{}/restart", session_path(session)),
                &[],
                None,
                options,
            )
            .await
    }
    pub async fn logout(
        &self,
        session: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<OperationAccepted>> {
        self.0.server()?;
        self.0
            .request::<_, ()>(
                Method::POST,
                &format!("{}/logout", session_path(session)),
                &[],
                None,
                options,
            )
            .await
    }
    pub async fn account(
        &self,
        session: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<WhatsAppAccount>>> {
        self.0.server()?;
        self.0
            .get(&format!("{}/me", session_path(session)), options)
            .await
    }
    pub async fn qr(
        &self,
        session: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<QrCode>>> {
        self.0
            .request::<_, ()>(
                Method::GET,
                &format!("/messaging/{}/pair/qr", encode(session)),
                &[("format", "json".into())],
                None,
                options,
            )
            .await
    }
    pub async fn request_pairing_code(
        &self,
        session: &str,
        body: &PairCodeRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<PairCode>>> {
        self.0
            .request(
                Method::POST,
                &format!("/messaging/{}/pair/code", encode(session)),
                &[],
                Some(body),
                options,
            )
            .await
    }
}
fn session_path(session: &str) -> String {
    format!("/platform/sessions/{}", encode(session))
}

pub struct Messages<'a>(&'a HttpTransport);
impl Messages<'_> {
    pub async fn send(
        &self,
        session: &str,
        body: &SendMessageRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<MessageResponse>>> {
        if body.conversation.id.is_none()
            && body.conversation.phone_number.is_none()
            && body.conversation.bsuid.is_none()
        {
            return Err(crate::transport::configuration("conversation"));
        }
        match &body.content {
            MessageContent::OrderDetails { order_details } => {
                let payment = &order_details.payment_settings;
                if payment.pix_dynamic_code.is_none()
                    && payment.payment_link.is_none()
                    && payment.boleto.is_none()
                {
                    return Err(crate::transport::configuration(
                        "content.orderDetails.paymentSettings",
                    ));
                }
                if order_details.order.is_none() && order_details.header_image_url.is_some() {
                    return Err(crate::transport::configuration(
                        "content.orderDetails.headerImageUrl",
                    ));
                }
            }
            MessageContent::OrderStatus { order_status }
                if order_status.order.is_none() && order_status.payment.is_none() =>
            {
                return Err(crate::transport::configuration("content.orderStatus"));
            }
            _ => {}
        }
        self.0
            .request(
                Method::POST,
                &message_path(session, "send"),
                &[],
                Some(body),
                options.idempotent(),
            )
            .await
    }
    pub async fn mark_seen(
        &self,
        session: &str,
        body: &SeenRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<StatusResult>>> {
        self.0
            .request(
                Method::POST,
                &message_path(session, "seen"),
                &[],
                Some(body),
                options,
            )
            .await
    }
    pub async fn set_typing(
        &self,
        session: &str,
        body: &TypingRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<StatusResult>>> {
        self.0
            .request(
                Method::POST,
                &message_path(session, "typing"),
                &[],
                Some(body),
                options,
            )
            .await
    }
    pub async fn react(
        &self,
        session: &str,
        body: &ReactRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<MessageReceipt>>> {
        self.0
            .request(
                Method::POST,
                &message_path(session, "react"),
                &[],
                Some(body),
                options.idempotent(),
            )
            .await
    }
    pub async fn star(
        &self,
        session: &str,
        body: &StarRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<StatusResult>>> {
        self.0
            .request(
                Method::POST,
                &message_path(session, "star"),
                &[],
                Some(body),
                options,
            )
            .await
    }
    pub async fn operation_status(
        &self,
        session: &str,
        operation_id: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<MessageOperation>>> {
        self.0.server()?;
        self.0
            .get(
                &format!(
                    "/messaging/{}/operations/{}",
                    encode(session),
                    encode(operation_id)
                ),
                options,
            )
            .await
    }
}
fn message_path(session: &str, action: &str) -> String {
    format!("/messaging/{}/messages/{action}", encode(session))
}

pub struct QuickLinks<'a>(&'a HttpTransport);
impl QuickLinks<'_> {
    pub async fn create(
        &self,
        body: &CreateQuickLinkRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<QuickLink>>> {
        self.0.server()?;
        if matches!(body.purpose, Some(CreateQuickLinkPurpose::AddConnection))
            && body.session.as_ref().is_none_or(|s| s.is_empty())
        {
            return Err(crate::transport::configuration("session"));
        }
        if let Some(controls) = &body.billing_controls {
            if controls.priority > 1_000_000
                || controls.limit_credits.is_some_and(|v| {
                    !v.is_finite()
                        || !(0.0..=1_000_000.0).contains(&v)
                        || (v * 1_000_000.0).fract() != 0.0
                })
                || matches!(body.purpose, Some(CreateQuickLinkPurpose::AddConnection))
                || body
                    .configuration
                    .as_ref()
                    .is_some_and(|configuration| configuration.testing.is_some())
            {
                return Err(crate::transport::configuration("billingControls"));
            }
        }
        self.0
            .request(
                Method::POST,
                "/messaging/quicklinks",
                &[],
                Some(body),
                options,
            )
            .await
    }
    pub async fn retrieve(
        &self,
        id: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<QuickLinkStatus>>> {
        self.0.server()?;
        self.0
            .get(&format!("/messaging/quicklinks/{}", encode(id)), options)
            .await
    }
    pub async fn cancel(
        &self,
        id: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessResponse>> {
        self.0.server()?;
        self.0
            .request::<_, ()>(
                Method::DELETE,
                &format!("/messaging/quicklinks/{}", encode(id)),
                &[],
                None,
                options,
            )
            .await
    }
    pub async fn availability(
        &self,
        project_id: &str,
        session: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<HybridQuickLinkAvailability>>> {
        self.0.server()?;
        self.0
            .request::<_, ()>(
                Method::GET,
                "/messaging/quicklinks/availability",
                &[
                    ("projectId", project_id.into()),
                    ("session", session.into()),
                ],
                None,
                options,
            )
            .await
    }
}
pub struct Webhooks<'a>(&'a HttpTransport);
impl Webhooks<'_> {
    pub async fn list(
        &self,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<Vec<Webhook>>>> {
        self.0.get("/messaging/webhooks", options).await
    }
    pub async fn create(
        &self,
        body: &CreateWebhookRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<Webhook>>> {
        self.0
            .request(
                Method::POST,
                "/messaging/webhooks",
                &[],
                Some(body),
                options,
            )
            .await
    }
    pub async fn retrieve(
        &self,
        id: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<Webhook>>> {
        self.0
            .get(&format!("/messaging/webhooks/{}", encode(id)), options)
            .await
    }
    pub async fn update(
        &self,
        id: &str,
        body: &UpdateWebhookRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<Webhook>>> {
        self.0
            .request(
                Method::PUT,
                &format!("/messaging/webhooks/{}", encode(id)),
                &[],
                Some(body),
                options,
            )
            .await
    }
    pub async fn delete(
        &self,
        id: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessResponse>> {
        self.0
            .request::<_, ()>(
                Method::DELETE,
                &format!("/messaging/webhooks/{}", encode(id)),
                &[],
                None,
                options,
            )
            .await
    }
}
pub struct Media<'a>(&'a HttpTransport);
impl Media<'_> {
    pub async fn retrieve(
        &self,
        media_id: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessEnvelope<MessagingMediaInfo>>> {
        self.0
            .get(
                &format!("/messaging/media/{}/info", encode(media_id)),
                options,
            )
            .await
    }
    pub async fn persist(
        &self,
        media_id: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessResponse>> {
        self.0
            .request::<_, ()>(
                Method::POST,
                &format!("/messaging/media/{}/download-and-save", encode(media_id)),
                &[],
                None,
                options,
            )
            .await
    }
    pub async fn download_url(
        &self,
        media_id: &str,
        options: RequestOptions,
    ) -> Result<crate::transport::DownloadLocation> {
        self.0
            .download_location(&format!("/messaging/media/{}", encode(media_id)), options)
            .await
    }
    pub async fn download_from_whatsapp(
        &self,
        descriptor: &crate::media::MediaDescriptor,
        options: crate::media::MediaDownloadOptions,
    ) -> Result<crate::media::MediaDownload> {
        crate::media::download(descriptor, options).await
    }
    pub async fn download_stream(
        &self,
        media_id: &str,
        options: RequestOptions,
    ) -> Result<DownloadStream> {
        self.0
            .download(&format!("/messaging/media/{}", encode(media_id)), options)
            .await
    }
    pub async fn download(
        &self,
        media_id: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<Vec<u8>>> {
        use futures_util::StreamExt;
        let mut download = self.download_stream(media_id, options).await?;
        let mut bytes = Vec::new();
        while let Some(chunk) = download.body.next().await {
            bytes.extend_from_slice(&chunk?);
        }
        Ok(ApiResponse {
            data: bytes,
            metadata: download.metadata,
        })
    }
}
