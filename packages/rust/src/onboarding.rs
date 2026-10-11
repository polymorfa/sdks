//! Trusted-server continuation of QuickLinks and isolated simulated Test numbers.
use crate::{
    transport::{encode, HttpTransport},
    ApiResponse, Error, ErrorKind, RequestOptions, Result,
};
use reqwest::Method;
use serde::{Deserialize, Serialize};
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EmbeddedSignupRequest {
    pub quicklink_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub project_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<EmbeddedSignupResult>,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EmbeddedSignupResult {
    pub code: String,
    pub waba_id: String,
    pub phone_number_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub coexistence: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub history_sync: Option<bool>,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct EmbeddedSignupResponse {
    pub success: bool,
    pub data: EmbeddedSignupStage,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct EmbeddedSignupStage {
    pub stage: String,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TestingHistoryMessage {
    pub id: String,
    pub sender_phone: String,
    pub text: String,
    pub timestamp: u64,
    pub from_me: bool,
}
#[derive(Clone, Debug, Serialize)]
pub struct CreateHistoryFixtureRequest {
    pub messages: Vec<TestingHistoryMessage>,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryFixtureCreated {
    pub fixture_id: String,
}
macro_rules! wire_enum{($name:ident{$($variant:ident=$wire:literal),*$(,)?})=>{#[derive(Clone,Copy,Debug,Deserialize,Serialize)]pub enum $name{$(#[serde(rename=$wire)]$variant),*}}}
wire_enum!(TestEventFixture{MessageReceived="message.received",MessageAck="message.ack",MessageFailed="message.failed",CallReceived="call.received",CallMissed="call.missed",CallEnded="call.ended",SessionStatus="session.status",SessionRestrictionUpdated="session.restriction_updated",TemplateStatus="template.status"});
wire_enum!(TestMediaType{Image="image",Video="video",Audio="audio",Document="document",Sticker="sticker"});
wire_enum!(TestAckStatus{Delivered="delivered",Read="read",Played="played",Error="error"});
wire_enum!(TestFailureReason{InvalidRecipient="invalid_recipient",SessionNotConnected="session_not_connected",AckTimeout="ack_timeout",SendFailed="send_failed",BlockedBySafety="blocked_by_safety"});
wire_enum!(TestCallEndReason{UserHangup="user_hangup",Timeout="timeout",LostConnection="lost_connection",Rejected="rejected",CallRestricted="call_restricted"});
wire_enum!(TestSessionStatus{Connecting="CONNECTING",Connected="CONNECTED",Disconnected="DISCONNECTED"});
wire_enum!(TestStatusReason{ScanQr="SCAN_QR",AutoReconnect="AUTO_RECONNECT",Failed="FAILED",ManualStop="MANUAL_STOP",QrTimeout="QR_TIMEOUT",LoggedOut="LOGGED_OUT",TemporaryBan="TEMPORARY_BAN",StreamError="STREAM_ERROR"});
wire_enum!(TestTemplateStatus{Approved="APPROVED",Rejected="REJECTED"});
wire_enum!(TestDelivery{Generated="generated",Simulated="simulated"});
wire_enum!(TestEventSource{Test="test",Runtime="runtime"});
wire_enum!(TestOverrideField{Text="text",From="from",PushName="pushName",MediaType="mediaType",Caption="caption",AckStatus="ackStatus",MessageId="messageId",FailureReason="failureReason",Video="video",DurationSeconds="durationSeconds",CallEndReason="callEndReason",RestrictionActive="restrictionActive",Status="status",StatusReason="statusReason",TemplateName="templateName",TemplateStatus="templateStatus",Reason="reason"});
macro_rules! overrides{($($field:ident:$ty:ty),*$(,)?)=>{#[derive(Clone,Debug,Default,Serialize,Deserialize)]#[serde(rename_all="camelCase")]pub struct TestEventOverrides{$(#[serde(skip_serializing_if="Option::is_none")]pub $field:Option<$ty>),*}}}
overrides!(text:String,from:String,push_name:String,media_type:TestMediaType,caption:String,ack_status:TestAckStatus,message_id:String,failure_reason:TestFailureReason,video:bool,duration_seconds:f64,call_end_reason:TestCallEndReason,restriction_active:bool,status:TestSessionStatus,status_reason:TestStatusReason,template_name:String,template_status:TestTemplateStatus,reason:String);
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TriggerTestEventRequest {
    pub session: String,
    pub event: TestEventFixture,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub overrides: Option<TestEventOverrides>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub from_session: Option<String>,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TriggerTestEventResponse {
    pub event: TestEventFixture,
    pub session: String,
    pub delivery: TestDelivery,
    pub event_id: Option<String>,
    pub source: TestEventSource,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct TestEventFixtureInfo {
    pub name: TestEventFixture,
    pub description: String,
    pub overrides: Vec<TestOverrideField>,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct TestEventFixtures {
    pub fixtures: Vec<TestEventFixtureInfo>,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TestingPhoneDevice {
    pub device_id: u8,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct TestingPhone {
    pub session: String,
    pub phone: String,
    pub online: bool,
    pub devices: Vec<TestingPhoneDevice>,
}
#[derive(Clone, Debug, Serialize)]
pub struct SendTestingPhoneMessageRequest {
    pub to: String,
    pub text: String,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SendTestingPhoneMessageResponse {
    pub session: String,
    pub to: String,
    pub message_id: Option<String>,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UnlinkTestingPhoneDeviceResponse {
    pub session: String,
    pub device_id: u8,
    pub unlinked: bool,
}
pub struct CloudOnboarding<'a>(pub(crate) &'a HttpTransport);
pub struct Testing<'a>(pub(crate) &'a HttpTransport);
impl CloudOnboarding<'_> {
    pub async fn advance(
        &self,
        body: &EmbeddedSignupRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<EmbeddedSignupResponse>> {
        self.0.server()?;
        self.0
            .request(
                Method::POST,
                "/messaging/cloud-api/embedded-signup",
                &[],
                Some(body),
                options,
            )
            .await
    }
}
fn project_path(project: &str) -> String {
    format!("/messaging/testing/{}", encode(project))
}
fn phone_path(project: &str, session: &str) -> String {
    format!(
        "{}/numbers/{}/phone",
        project_path(project),
        encode(session)
    )
}
impl Testing<'_> {
    pub async fn create_history_fixture(
        &self,
        project: &str,
        body: &CreateHistoryFixtureRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<HistoryFixtureCreated>> {
        self.0.server()?;
        self.0
            .request(
                Method::POST,
                &format!("{}/history-fixtures", project_path(project)),
                &[],
                Some(body),
                options,
            )
            .await
    }
    pub async fn trigger_event(
        &self,
        project: &str,
        body: &TriggerTestEventRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<TriggerTestEventResponse>> {
        self.0.server()?;
        self.0
            .request(
                Method::POST,
                &format!("{}/events", project_path(project)),
                &[],
                Some(body),
                options,
            )
            .await
    }
    pub async fn list_event_fixtures(
        &self,
        project: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<TestEventFixtures>> {
        self.0.server()?;
        self.0
            .get(
                &format!("{}/events/fixtures", project_path(project)),
                options,
            )
            .await
    }
    pub async fn get_phone(
        &self,
        project: &str,
        session: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<TestingPhone>> {
        self.0.server()?;
        self.0.get(&phone_path(project, session), options).await
    }
    pub async fn send_phone_message(
        &self,
        project: &str,
        session: &str,
        body: &SendTestingPhoneMessageRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<SendTestingPhoneMessageResponse>> {
        self.0.server()?;
        self.0
            .request(
                Method::POST,
                &format!("{}/messages", phone_path(project, session)),
                &[],
                Some(body),
                options,
            )
            .await
    }
    pub async fn unlink_phone_device(
        &self,
        project: &str,
        session: &str,
        device: u8,
        options: RequestOptions,
    ) -> Result<ApiResponse<UnlinkTestingPhoneDeviceResponse>> {
        self.0.server()?;
        if !(1..=99).contains(&device) {
            return Err(Error::local(
                ErrorKind::Validation,
                "deviceId must be a companion device ID from 1 to 99",
                "invalid_device_id",
            ));
        }
        self.0
            .request::<_, ()>(
                Method::POST,
                &format!("{}/devices/{device}/unlink", phone_path(project, session)),
                &[],
                None,
                options,
            )
            .await
    }
}
