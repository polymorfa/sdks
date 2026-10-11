//! Server call control and programmatic PCM/video sockets. No browser UI.
use crate::calls_protocol::{
    is_connection_id, is_participant_name, parse_lifecycle_frame, parse_media_control,
    LifecycleFrame, MediaControlFrame, MediaStateUpdate, TrickleCandidate,
};
use crate::{
    models::{DataEnvelope, SuccessResponse},
    transport::{configuration, encode, HttpTransport},
    ApiResponse, Error, ErrorKind, RequestOptions, Result,
};
use futures_util::{SinkExt, StreamExt};
use reqwest::Method;
use serde::{Deserialize, Serialize};
use tokio_tungstenite::{
    tungstenite::{client::IntoClientRequest, Message},
    MaybeTlsStream, WebSocketStream,
};
use tokio_util::sync::CancellationToken;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaceCallRequest {
    pub session: String,
    pub to: String,
    pub video: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub participants: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub group_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub exclusive: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub participant: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaceCallResult {
    pub call_id: String,
}
#[derive(Clone, Debug, Serialize, Deserialize, Default)]
pub struct AcceptCallRequest {
    pub exclusive: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub video: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub participant: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AcceptCallResult {
    pub answered: bool,
    pub answered_by: String,
    pub exclusive: bool,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Participant {
    pub id: String,
    pub phone_number: Option<String>,
    pub bsuid: Option<String>,
    pub username: Option<String>,
    pub audio_muted: bool,
    pub video: bool,
    pub state: String,
    pub hand_raised: Option<bool>,
}
#[derive(Serialize)]
struct LeaveRequest<'a> {
    #[serde(rename = "connectionId")]
    connection_id: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    participant: Option<&'a str>,
}
#[derive(Serialize)]
struct ParticipantRequest<'a> {
    #[serde(skip_serializing_if = "Option::is_none")]
    participant: Option<&'a str>,
}
#[derive(Serialize)]
struct Destination<'a> {
    to: &'a str,
}
pub struct Calls<'a> {
    http: &'a HttpTransport,
}
impl<'a> Calls<'a> {
    pub(crate) fn new(http: &'a HttpTransport) -> Self {
        Self { http }
    }
    pub async fn place(
        &self,
        body: &PlaceCallRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<PlaceCallResult>> {
        self.http.credential.server()?;
        if options
            .idempotency_key
            .as_ref()
            .is_none_or(|k| k.is_empty())
        {
            return Err(configuration("idempotency_key"));
        }
        // TS chooses one destination form, so omit `to` when group/participants is used.
        let mut value = serde_json::to_value(body).map_err(|_| configuration("call"))?;
        if body.group_id.is_some() {
            value.as_object_mut().unwrap().remove("participants");
            value.as_object_mut().unwrap().remove("to");
        } else if body.participants.is_some() {
            value.as_object_mut().unwrap().remove("to");
        }
        unwrap(
            self.http
                .request(
                    Method::POST,
                    "/messaging/voip/calls",
                    &[],
                    Some(&value),
                    options,
                )
                .await?,
        )
    }
    pub async fn accept(
        &self,
        call_id: &str,
        body: &AcceptCallRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<AcceptCallResult>> {
        self.http.credential.server()?;
        unwrap(
            self.http
                .request(
                    Method::POST,
                    &path(call_id, "/accept"),
                    &[],
                    Some(body),
                    options,
                )
                .await?,
        )
    }
    pub async fn reject(
        &self,
        call_id: &str,
        participant: Option<&str>,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessResponse>> {
        self.http.credential.server()?;
        self.http
            .request(
                Method::POST,
                &path(call_id, "/reject"),
                &[],
                participant
                    .map(|participant| ParticipantRequest {
                        participant: Some(participant),
                    })
                    .as_ref(),
                options,
            )
            .await
    }
    pub async fn leave(
        &self,
        call_id: &str,
        connection_id: &str,
        participant: Option<&str>,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessResponse>> {
        self.http.credential.server()?;
        self.http
            .request(
                Method::POST,
                &path(call_id, "/leave"),
                &[],
                Some(&LeaveRequest {
                    connection_id,
                    participant,
                }),
                options,
            )
            .await
    }
    pub async fn end(
        &self,
        call_id: &str,
        mut options: RequestOptions,
    ) -> Result<ApiResponse<SuccessResponse>> {
        self.http.credential.server()?;
        if options.idempotency_key.is_none() {
            options.idempotency_key = Some(format!("voip-end:{call_id}"));
        }
        self.http
            .request::<_, ()>(Method::DELETE, &path(call_id, ""), &[], None, options)
            .await
    }
    pub async fn add_participant(
        &self,
        call_id: &str,
        to: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<Participant>> {
        self.http.credential.server()?;
        unwrap(
            self.http
                .request(
                    Method::POST,
                    &path(call_id, "/participants"),
                    &[],
                    Some(&Destination { to }),
                    options,
                )
                .await?,
        )
    }
    pub async fn ring_participant(
        &self,
        call_id: &str,
        to: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessResponse>> {
        self.http.credential.server()?;
        self.http
            .request(
                Method::POST,
                &path(call_id, "/participants/ring"),
                &[],
                Some(&Destination { to }),
                options,
            )
            .await
    }
    pub async fn reject_incoming(
        &self,
        session: &str,
        call_id: &str,
        from: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<SuccessResponse>> {
        #[derive(Serialize)]
        struct From<'a> {
            from: &'a str,
        }
        self.http
            .request(
                Method::POST,
                &format!(
                    "/messaging/{}/calls/{}/reject",
                    encode(session),
                    encode(call_id)
                ),
                &[],
                Some(&From { from }),
                options,
            )
            .await
    }
    pub async fn open_media(
        &self,
        call_id: &str,
        connection_id: &str,
        participant: Option<&str>,
        cancellation: CancellationToken,
    ) -> Result<MediaSocket> {
        self.http.credential.server()?;
        if !(8..=64).contains(&connection_id.len())
            || !connection_id
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b"_-".contains(&b))
        {
            return Err(configuration("connection_id"));
        }
        if participant.is_some_and(|p| {
            p.is_empty()
                || p.len() > 128
                || !p
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b"._:@-".contains(&b))
        }) {
            return Err(configuration("participant"));
        }
        let mut url =
            url::Url::parse(&self.http.options.base_url).map_err(|_| configuration("base_url"))?;
        url.set_path(&format!("/voip/calls/{}/media", encode(call_id)));
        url.set_query(None);
        let scheme = if url.scheme() == "https" { "wss" } else { "ws" };
        url.set_scheme(scheme)
            .map_err(|_| configuration("socket URL"))?;
        let mut request = url
            .as_str()
            .into_client_request()
            .map_err(|_| configuration("socket"))?;
        request
            .headers_mut()
            .insert("sec-websocket-protocol", "pmfa.calls.v2".parse().unwrap());
        let (mut socket, response) = tokio::select! {
            _ = cancellation.cancelled() => return Err(crate::transport::cancelled()),
            result = tokio::time::timeout(self.http.options.timeout,tokio_tungstenite::connect_async(request)) => result.map_err(|_|Error::local(ErrorKind::Timeout,"Media socket connection timed out.","request_timeout"))?.map_err(|_|Error::local(ErrorKind::Connection,"Cannot open media socket.","connection_error"))?,
        };
        if response
            .headers()
            .get("sec-websocket-protocol")
            .and_then(|v| v.to_str().ok())
            != Some("pmfa.calls.v2")
        {
            return Err(Error::local(
                ErrorKind::Server,
                "Media server did not negotiate pmfa.calls.v2.",
                "invalid_response",
            ));
        }
        let mut frame = serde_json::json!({"type":"auth","token":self.http.credential.value(),"connectionId":connection_id});
        if let Some(participant) = participant {
            frame["participant"] = participant.into();
        }
        socket
            .send(Message::Text(frame.to_string().into()))
            .await
            .map_err(|_| {
                Error::local(
                    ErrorKind::Connection,
                    "Media authentication could not be sent.",
                    "connection_error",
                )
            })?;
        let mut media = MediaSocket {
            socket,
            cancellation,
            sample_rate: 16000,
            video: false,
        };
        tokio::time::timeout(self.http.options.timeout, async {
            loop {
                match media.read().await? {
                    Some(MediaFrame::Control(MediaControlFrame::Ready { .. })) => return Ok(()),
                    None => {
                        return Err(Error::local(
                            ErrorKind::Connection,
                            "Media server closed before readiness.",
                            "connection_error",
                        ))
                    }
                    _ => {}
                }
            }
        })
        .await
        .map_err(|_| {
            Error::local(
                ErrorKind::Timeout,
                "Media authentication timed out.",
                "request_timeout",
            )
        })??;
        Ok(media)
    }
    /// Server lifecycle socket. Only session and participant are sent in the URL.
    pub async fn open_lifecycle(
        &self,
        session: &str,
        participant: Option<&str>,
        cancellation: CancellationToken,
    ) -> Result<LifecycleSocket> {
        self.http.credential.server()?;
        if session.trim().is_empty() || participant.is_some_and(|p| !is_participant_name(p)) {
            return Err(configuration("session or participant"));
        }
        let mut url =
            url::Url::parse(&self.http.options.base_url).map_err(|_| configuration("base_url"))?;
        url.set_path("/voip/ws");
        url.set_query(None);
        url.set_scheme(if url.scheme() == "https" { "wss" } else { "ws" })
            .map_err(|_| configuration("socket URL"))?;
        url.query_pairs_mut().append_pair("session", session);
        if let Some(participant) = participant {
            url.query_pairs_mut()
                .append_pair("participant", participant);
        }
        let (socket, _) = tokio::select! {
            _=cancellation.cancelled()=>return Err(crate::transport::cancelled()),
            result=tokio::time::timeout(self.http.options.timeout,tokio_tungstenite::connect_async(url.as_str()))=>result.map_err(|_|Error::local(ErrorKind::Timeout,"Lifecycle socket connection timed out.","request_timeout"))?.map_err(|_|Error::local(ErrorKind::Connection,"Cannot open lifecycle socket.","connection_error"))?,
        };
        let mut lifecycle = LifecycleSocket {
            socket,
            cancellation,
        };
        lifecycle
            .send(serde_json::json!({"type":"auth","token":self.http.credential.value()}))
            .await?;
        tokio::time::timeout(self.http.options.timeout, async {
            loop {
                match lifecycle.read().await? {
                    Some(LifecycleFrame::Ready { .. }) => return Ok(()),
                    None => {
                        return Err(Error::local(
                            ErrorKind::Connection,
                            "Lifecycle server closed before readiness.",
                            "connection_error",
                        ))
                    }
                    _ => {}
                }
            }
        })
        .await
        .map_err(|_| {
            Error::local(
                ErrorKind::Timeout,
                "Lifecycle authentication timed out.",
                "request_timeout",
            )
        })??;
        Ok(lifecycle)
    }
}
fn path(call_id: &str, suffix: &str) -> String {
    format!("/messaging/voip/calls/{}{suffix}", encode(call_id))
}
fn unwrap<T>(response: ApiResponse<DataEnvelope<T>>) -> Result<ApiResponse<T>> {
    Ok(ApiResponse {
        data: response.data.data,
        metadata: response.metadata,
    })
}

pub struct MediaSocket {
    socket: WebSocketStream<MaybeTlsStream<tokio::net::TcpStream>>,
    cancellation: CancellationToken,
    pub sample_rate: u32,
    pub video: bool,
}
#[derive(Clone, Debug)]
pub enum MediaFrame {
    Audio(Vec<i16>),
    Video(VideoFrame),
    Control(MediaControlFrame),
}
#[derive(Clone, Debug, PartialEq)]
pub struct VideoFrame {
    pub keyframe: bool,
    pub source: u32,
    pub timestamp_us: u64,
    pub data: Vec<u8>,
}
impl MediaSocket {
    pub async fn read(&mut self) -> Result<Option<MediaFrame>> {
        loop {
            if self.cancellation.is_cancelled() {
                return Err(crate::transport::cancelled());
            }
            let frame = tokio::select! { _=self.cancellation.cancelled()=>return Err(crate::transport::cancelled()), next=self.socket.next()=>next };
            match frame {
                Some(Ok(Message::Binary(bytes))) => {
                    if let Some(frame) = decode_media(&bytes) {
                        return Ok(Some(frame));
                    }
                }
                Some(Ok(Message::Text(text))) => {
                    let Some(value) = parse_media_control(&text) else {
                        continue;
                    };
                    if let MediaControlFrame::Ready {
                        sample_rate, video, ..
                    } = &value
                    {
                        self.sample_rate = *sample_rate;
                        self.video = *video;
                    }
                    if let MediaControlFrame::Error { code, .. } = &value {
                        return Err(Error::local(
                            ErrorKind::Api,
                            "Media server refused the connection.",
                            code,
                        ));
                    }
                    return Ok(Some(MediaFrame::Control(value)));
                }
                Some(Ok(Message::Ping(bytes))) => {
                    self.socket.send(Message::Pong(bytes)).await.map_err(|_| {
                        Error::local(
                            ErrorKind::Connection,
                            "Media socket interrupted.",
                            "connection_error",
                        )
                    })?
                }
                Some(Ok(Message::Close(close))) => {
                    if close
                        .as_ref()
                        .is_some_and(|frame| u16::from(frame.code) == 4401)
                    {
                        return Err(Error::local(
                            ErrorKind::Authentication,
                            "Media authorization was revoked.",
                            "authentication_error",
                        ));
                    }
                    return Ok(None);
                }
                None => return Ok(None),
                Some(Err(_)) => {
                    return Err(Error::local(
                        ErrorKind::Connection,
                        "Media socket interrupted.",
                        "connection_error",
                    ))
                }
                _ => {}
            }
        }
    }
    pub async fn write_audio(&mut self, pcm: &[i16]) -> Result<()> {
        self.send(Message::Binary(encode_audio(pcm).into())).await
    }
    pub async fn write_video(&mut self, frame: &VideoFrame) -> Result<()> {
        if !self.video {
            return Err(configuration("video: not negotiated for this connection"));
        }
        self.send(Message::Binary(encode_video(frame).into())).await
    }
    /// Send one media state command. Match its request ID in `read`; never replay
    /// a command after an uncertain timeout.
    pub async fn set_media_state(
        &mut self,
        request_id: &str,
        update: &MediaStateUpdate,
    ) -> Result<()> {
        if !is_connection_id(request_id)
            || update.audio_muted.is_none()
                && update.video_enabled.is_none()
                && update.screen_sharing.is_none()
        {
            return Err(configuration("media state"));
        }
        let mut frame = serde_json::to_value(update).map_err(|_| configuration("media state"))?;
        frame["type"] = "media_state".into();
        frame["requestId"] = request_id.into();
        self.send(Message::Text(frame.to_string().into())).await
    }
    pub async fn ping(&mut self) -> Result<()> {
        self.send(Message::Text("{\"type\":\"ping\"}".into())).await
    }
    pub async fn end_call(&mut self) -> Result<()> {
        self.send(Message::Text("{\"type\":\"end_call\"}".into()))
            .await
    }
    pub async fn leave(&mut self) -> Result<()> {
        self.send(Message::Text("{\"type\":\"leave\"}".into()))
            .await?;
        self.socket.close(None).await.map_err(|_| {
            Error::local(
                ErrorKind::Connection,
                "Media socket close failed.",
                "connection_error",
            )
        })
    }
    async fn send(&mut self, frame: Message) -> Result<()> {
        tokio::select! { _=self.cancellation.cancelled()=>Err(crate::transport::cancelled()), result=self.socket.send(frame)=>result.map_err(|_|Error::local(ErrorKind::Connection,"Media socket write failed.","connection_error")) }
    }
}
pub struct LifecycleSocket {
    socket: WebSocketStream<MaybeTlsStream<tokio::net::TcpStream>>,
    cancellation: CancellationToken,
}
impl LifecycleSocket {
    pub async fn read(&mut self) -> Result<Option<LifecycleFrame>> {
        loop {
            if self.cancellation.is_cancelled() {
                return Err(crate::transport::cancelled());
            }
            let next = tokio::select! { _=self.cancellation.cancelled()=>return Err(crate::transport::cancelled()),next=self.socket.next()=>next };
            match next {
                Some(Ok(Message::Text(text))) => {
                    if let Some(frame) = parse_lifecycle_frame(&text) {
                        if let LifecycleFrame::Error { code, message } = &frame {
                            return Err(Error::local(ErrorKind::Api, message, code));
                        }
                        return Ok(Some(frame));
                    }
                }
                Some(Ok(Message::Ping(bytes))) => {
                    self.socket.send(Message::Pong(bytes)).await.map_err(|_| {
                        Error::local(
                            ErrorKind::Connection,
                            "Lifecycle socket interrupted.",
                            "connection_error",
                        )
                    })?
                }
                Some(Ok(Message::Close(close))) => {
                    if close.as_ref().is_some_and(|f| u16::from(f.code) == 4401) {
                        return Err(Error::local(
                            ErrorKind::Authentication,
                            "Lifecycle authorization was revoked.",
                            "authentication_error",
                        ));
                    }
                    return Ok(None);
                }
                None => return Ok(None),
                Some(Err(_)) => {
                    return Err(Error::local(
                        ErrorKind::Connection,
                        "Lifecycle socket interrupted.",
                        "connection_error",
                    ))
                }
                _ => {}
            }
        }
    }
    pub async fn ping(&mut self) -> Result<()> {
        self.send(serde_json::json!({"type":"ping"})).await
    }
    pub async fn send_candidate(
        &mut self,
        call_id: &str,
        connection_id: &str,
        candidate: &TrickleCandidate,
    ) -> Result<()> {
        if !is_connection_id(connection_id) {
            return Err(configuration("connection_id"));
        }
        self.send(serde_json::json!({"type":"candidate","callId":call_id,"connectionId":connection_id,"candidate":candidate})).await
    }
    pub async fn close(&mut self) -> Result<()> {
        self.socket.close(None).await.map_err(|_| {
            Error::local(
                ErrorKind::Connection,
                "Lifecycle socket close failed.",
                "connection_error",
            )
        })
    }
    async fn send(&mut self, frame: serde_json::Value) -> Result<()> {
        tokio::select! { _=self.cancellation.cancelled()=>Err(crate::transport::cancelled()),result=self.socket.send(Message::Text(frame.to_string().into()))=>result.map_err(|_|Error::local(ErrorKind::Connection,"Lifecycle socket write failed.","connection_error")) }
    }
}

pub fn encode_audio(pcm: &[i16]) -> Vec<u8> {
    let mut out = Vec::with_capacity(1 + pcm.len() * 2);
    out.push(1);
    for sample in pcm {
        out.extend_from_slice(&sample.to_le_bytes());
    }
    out
}
pub fn encode_video(frame: &VideoFrame) -> Vec<u8> {
    let mut out = vec![2, 1, u8::from(frame.keyframe)];
    out.extend_from_slice(&frame.source.to_be_bytes());
    out.extend_from_slice(&frame.timestamp_us.to_be_bytes());
    out.extend_from_slice(&frame.data);
    out
}
pub fn decode_media(bytes: &[u8]) -> Option<MediaFrame> {
    match *bytes.first()? {
        1 if (bytes.len() - 1) % 2 == 0 => Some(MediaFrame::Audio(
            bytes[1..]
                .chunks_exact(2)
                .map(|p| i16::from_le_bytes([p[0], p[1]]))
                .collect(),
        )),
        2 if bytes.len() > 15 && bytes[1] == 1 => Some(MediaFrame::Video(VideoFrame {
            keyframe: bytes[2] & 1 != 0,
            source: u32::from_be_bytes(bytes[3..7].try_into().ok()?),
            timestamp_us: u64::from_be_bytes(bytes[7..15].try_into().ok()?),
            data: bytes[15..].to_vec(),
        })),
        _ => None,
    }
}
