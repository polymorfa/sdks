//! Programmatic server Calls client with lifecycle ownership, claims and bounded media recovery.
use crate::{
    calls::{
        AcceptCallRequest, MediaFrame, MediaSocket, Participant, PlaceCallRequest, VideoFrame,
    },
    calls_protocol::{
        create_connection_id, is_participant_name, LifecycleFrame, MediaControlFrame,
        MediaStateUpdate,
    },
    calls_token::{CallsToken, CallsTokenRequest, CallsTokenSource},
    transport::{cancelled, configuration},
    ClientOptions, Error, ErrorKind, MessagingClient, RequestOptions, Result,
};
use std::{
    collections::{BTreeMap, VecDeque},
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Arc,
    },
    time::{Duration, SystemTime},
};
use tokio::sync::{broadcast, mpsc, oneshot, Mutex};
use tokio_util::sync::CancellationToken;
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CallState {
    Incoming,
    Ringing,
    Connecting,
    Connected,
    Reconnecting,
    Ended,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CallDirection {
    Inbound,
    Outbound,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CallEndReason {
    Hangup,
    Left,
    Claimed,
    RemoteHangup,
    Rejected,
    Missed,
    Busy,
    Timeout,
    ConnectionFailed,
    PodLost,
    Capacity,
    CallRestricted,
    Unknown,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct CallCapabilities {
    pub video: bool,
    pub invite: bool,
}
impl Default for CallCapabilities {
    fn default() -> Self {
        Self {
            video: true,
            invite: true,
        }
    }
}
#[derive(Clone, Debug)]
pub struct CallClaim {
    pub answered: bool,
    pub answered_by: Option<String>,
    pub exclusive: bool,
    pub claimed_by_other: bool,
    pub can_join: bool,
}
#[derive(Clone, Debug)]
pub struct CallSnapshot {
    pub state: CallState,
    pub direction: CallDirection,
    pub peer: String,
    pub has_video: bool,
    pub capabilities: CallCapabilities,
    pub claim: CallClaim,
    pub participants: Vec<Participant>,
    pub started_at: SystemTime,
    pub connected_at: Option<SystemTime>,
    pub ended_at: Option<SystemTime>,
    pub end_reason: Option<CallEndReason>,
    pub sample_rate: u32,
    pub remote_audio_muted: Option<bool>,
    pub hand_raised: bool,
    pub social_supported: bool,
    pub reconnects: u32,
}
/// Broadcasts are bounded. A lagged subscriber must refresh `Call::snapshot`.
#[derive(Clone, Debug)]
pub enum CallsEvent {
    Ready,
    Disconnected,
    Known(Call),
    Incoming(Call),
    State {
        call_id: String,
        state: CallState,
    },
    Ended {
        call: Call,
        reason: CallEndReason,
    },
    Media {
        call_id: String,
        frame: MediaFrame,
    },
    Error {
        call_id: Option<String>,
        error: Error,
    },
}
#[derive(Clone)]
pub struct CallsClientOptions {
    pub session: String,
    pub participant: Option<String>,
    pub client: ClientOptions,
    pub reconnect_attempts: u32,
    pub lifecycle_backoff: Duration,
    pub media_backoff: Duration,
    pub lifecycle_heartbeat: Duration,
    pub media_heartbeat: Duration,
    pub refresh_before_expiry: Duration,
    pub media_control_timeout: Duration,
    pub diagnostics: bool,
}
impl CallsClientOptions {
    pub fn new(session: impl Into<String>) -> Self {
        Self {
            session: session.into(),
            participant: None,
            client: ClientOptions::default(),
            reconnect_attempts: 3,
            lifecycle_backoff: Duration::from_secs(1),
            media_backoff: Duration::from_secs(1),
            lifecycle_heartbeat: Duration::from_secs(15),
            media_heartbeat: Duration::from_secs(5),
            refresh_before_expiry: Duration::from_secs(60),
            media_control_timeout: Duration::from_secs(5),
            diagnostics: true,
        }
    }
}
#[derive(Clone, Debug)]
pub enum CallDestination {
    Phone(String),
    Participants(Vec<String>),
    Group(String),
}
#[derive(Clone, Default)]
pub struct PlaceOptions {
    pub video: bool,
    pub exclusive: bool,
    pub request: RequestOptions,
}
#[derive(Clone, Copy, Debug, Default)]
pub struct AnswerOptions {
    pub exclusive: bool,
    pub video: Option<bool>,
}
struct Registry {
    calls: BTreeMap<String, Call>,
    ended: VecDeque<String>,
    pending: BTreeMap<String, VecDeque<LifecycleFrame>>,
    pending_order: VecDeque<String>,
}
struct ClientInner {
    options: CallsClientOptions,
    tokens: CallsTokenSource,
    registry: Mutex<Registry>,
    events: broadcast::Sender<CallsEvent>,
    run: Mutex<Option<CancellationToken>>,
    generation: AtomicU64,
    connected: AtomicBool,
}
#[derive(Clone)]
pub struct CallsClient(Arc<ClientInner>, Option<Arc<ClientOwner>>);
struct ClientOwner(std::sync::Weak<ClientInner>);
impl Drop for ClientOwner {
    fn drop(&mut self) {
        if let (Some(inner), Ok(runtime)) =
            (self.0.upgrade(), tokio::runtime::Handle::try_current())
        {
            runtime.spawn(async move {
                if let Some(run) = inner.run.lock().await.take() {
                    run.cancel();
                }
                let calls = {
                    let mut registry = inner.registry.lock().await;
                    let calls: Vec<_> = registry.calls.values().cloned().collect();
                    registry.calls.clear();
                    registry.pending.clear();
                    calls
                };
                for call in calls {
                    let _ = tokio::time::timeout(Duration::from_secs(5), call.leave()).await;
                    call.finish(CallEndReason::Left).await;
                }
            });
        }
    }
}
struct CallInner {
    id: String,
    connection_id: String,
    offered_video: bool,
    reporter: Option<crate::calls_diagnostics::CallReporter>,
    client: Arc<ClientInner>,
    snapshot: Mutex<CallSnapshot>,
    operation: Mutex<()>,
    media: Mutex<Option<mpsc::Sender<MediaCommand>>>,
    cancel: CancellationToken,
    accepted: AtomicBool,
    claimed: AtomicBool,
}
#[derive(Clone)]
pub struct Call(Arc<CallInner>);
impl std::fmt::Debug for Call {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Call").field("id", &self.0.id).finish()
    }
}
enum MediaCommand {
    Audio(Vec<i16>, oneshot::Sender<Result<()>>),
    Video(VideoFrame, oneshot::Sender<Result<()>>),
    State(MediaStateUpdate, oneshot::Sender<Result<MediaStateUpdate>>),
}
fn invalid(code: &str, message: &str) -> Error {
    Error::local(ErrorKind::Api, message, code)
}
impl ClientInner {
    async fn api(
        &self,
        refresh: bool,
        cancellation: Option<CancellationToken>,
    ) -> Result<(MessagingClient, CallsToken)> {
        let token = self
            .tokens
            .get(CallsTokenRequest {
                refresh,
                cancellation,
            })
            .await?;
        token.credential.server()?;
        let client = MessagingClient::new(token.credential.clone(), self.options.client.clone())?;
        Ok((client, token))
    }
    fn emit(&self, event: CallsEvent) {
        let _ = self.events.send(event);
    }
}
impl CallsClient {
    pub fn new(tokens: CallsTokenSource, options: CallsClientOptions) -> Result<Self> {
        if options.session.trim().is_empty()
            || options
                .participant
                .as_deref()
                .is_some_and(|p| !is_participant_name(p))
            || options.reconnect_attempts > 10
            || options.media_control_timeout.is_zero()
        {
            return Err(configuration("Calls client options"));
        }
        let (events, _) = broadcast::channel(256);
        let inner = Arc::new(ClientInner {
            options,
            tokens,
            registry: Mutex::new(Registry {
                calls: BTreeMap::new(),
                ended: VecDeque::new(),
                pending: BTreeMap::new(),
                pending_order: VecDeque::new(),
            }),
            events,
            run: Mutex::new(None),
            generation: AtomicU64::new(0),
            connected: AtomicBool::new(false),
        });
        let owner = Arc::new(ClientOwner(Arc::downgrade(&inner)));
        Ok(Self(inner, Some(owner)))
    }
    pub fn subscribe(&self) -> broadcast::Receiver<CallsEvent> {
        let _owner = &self.1;
        self.0.events.subscribe()
    }
    pub fn connected(&self) -> bool {
        self.0.connected.load(Ordering::Acquire)
    }
    pub async fn get_call(&self, id: &str) -> Option<Call> {
        self.0.registry.lock().await.calls.get(id).cloned()
    }
    pub async fn calls(&self) -> Vec<Call> {
        let calls: Vec<_> = self
            .0
            .registry
            .lock()
            .await
            .calls
            .values()
            .cloned()
            .collect();
        let mut active = Vec::new();
        for call in calls {
            if call.snapshot().await.state != CallState::Ended {
                active.push(call);
            }
        }
        active
    }
    /// Returns when the first lifecycle attempt authenticates or fails. The owner
    /// task then retries until disconnect; failures are also emitted to subscribers.
    pub async fn connect(&self) -> Result<()> {
        let mut run = self.0.run.lock().await;
        if run.is_some() {
            return Ok(());
        }
        let cancel = CancellationToken::new();
        *run = Some(cancel.clone());
        let inner = self.0.clone();
        let (first_tx, first_rx) = oneshot::channel();
        tokio::spawn(async move {
            lifecycle_worker(inner, cancel, first_tx).await;
        });
        drop(run);
        first_rx
            .await
            .map_err(|_| invalid("connection_error", "Lifecycle owner stopped"))?
    }
    pub async fn disconnect(&self) -> Result<()> {
        self.0.generation.fetch_add(1, Ordering::AcqRel);
        if let Some(cancel) = self.0.run.lock().await.take() {
            cancel.cancel();
        }
        let calls = self.calls().await;
        let mut first_error = None;
        for call in calls {
            if let Err(error) = call.leave().await {
                first_error.get_or_insert(error);
                call.finish(CallEndReason::Left).await;
            }
        }
        self.0.connected.store(false, Ordering::Release);
        {
            let mut registry = self.0.registry.lock().await;
            registry.calls.clear();
            registry.ended.clear();
            registry.pending.clear();
            registry.pending_order.clear();
        }
        if let Some(error) = first_error {
            Err(error)
        } else {
            Ok(())
        }
    }
    pub async fn place(&self, destination: CallDestination, options: PlaceOptions) -> Result<Call> {
        let generation = self.0.generation.load(Ordering::Acquire);
        let (to, participants, group_id) = match destination {
            CallDestination::Phone(to) => (to, None, None),
            CallDestination::Participants(participants) => {
                if !(2..=31).contains(&participants.len())
                    || participants.iter().any(|p| p.trim().is_empty())
                    || participants
                        .iter()
                        .collect::<std::collections::HashSet<_>>()
                        .len()
                        != participants.len()
                {
                    return Err(configuration("2 to 31 distinct call participants"));
                }
                (participants[0].clone(), Some(participants), None)
            }
            CallDestination::Group(id) => {
                if id.is_empty()
                    || id.len() > 19
                    || id.starts_with('0')
                    || !id.bytes().all(|b| b.is_ascii_digit())
                {
                    return Err(configuration("public numeric group ID"));
                }
                (id.clone(), None, Some(id))
            }
        };
        let (api, _) = self
            .0
            .api(false, options.request.cancellation.clone())
            .await?;
        let request = options.request.idempotent();
        let response = api
            .calls()
            .place(
                &PlaceCallRequest {
                    session: self.0.options.session.clone(),
                    to: to.clone(),
                    video: options.video,
                    participants,
                    group_id,
                    exclusive: Some(options.exclusive),
                    participant: self.0.options.participant.clone(),
                },
                request.clone(),
            )
            .await?;
        let call = self
            .track(
                response.data.call_id,
                CallDirection::Outbound,
                to,
                options.video,
                options.exclusive,
                None,
            )
            .await;
        if generation != self.0.generation.load(Ordering::Acquire)
            || request
                .cancellation
                .as_ref()
                .is_some_and(CancellationToken::is_cancelled)
        {
            let _ = call.end().await;
            return Err(cancelled());
        }
        Ok(call)
    }
    async fn track(
        &self,
        id: String,
        direction: CallDirection,
        peer: String,
        video: bool,
        exclusive: bool,
        capabilities: Option<CallCapabilities>,
    ) -> Call {
        let mut registry = self.0.registry.lock().await;
        if let Some(call) = registry.calls.get(&id) {
            return call.clone();
        }
        let capabilities = capabilities.unwrap_or_default();
        let connection_id = create_connection_id();
        let reporter = self.0.options.diagnostics.then(|| {
            let inner = Arc::downgrade(&self.0);
            let call_id = id.clone();
            crate::calls_diagnostics::CallReporter::new(
                connection_id.clone(),
                crate::voip::CallReportClient {
                    sdk: "polymorfa-rust".into(),
                    version: crate::SDK_VERSION.into(),
                    platform: "other".into(),
                },
                Arc::new(move |mut report| {
                    let inner = inner.clone();
                    let call_id = call_id.clone();
                    Box::pin(async move {
                        let Some(inner) = inner.upgrade() else {
                            return Ok(());
                        };
                        report.participant = inner.options.participant.clone();
                        let (api, _) = inner.api(false, None).await?;
                        api.voip()
                            .report(
                                &call_id,
                                &report,
                                RequestOptions {
                                    max_network_retries: Some(0),
                                    timeout: Some(Duration::from_secs(5)),
                                    ..Default::default()
                                },
                            )
                            .await
                            .map(|_| ())
                    })
                }),
            )
            .expect("generated Calls report identity")
        });
        let call = Call(Arc::new(CallInner {
            id: id.clone(),
            connection_id,
            offered_video: video,
            reporter,
            client: self.0.clone(),
            snapshot: Mutex::new(CallSnapshot {
                state: if direction == CallDirection::Inbound {
                    CallState::Incoming
                } else {
                    CallState::Ringing
                },
                direction,
                peer,
                has_video: video && capabilities.video,
                capabilities,
                claim: CallClaim {
                    answered: false,
                    answered_by: None,
                    exclusive,
                    claimed_by_other: false,
                    can_join: false,
                },
                participants: Vec::new(),
                started_at: SystemTime::now(),
                connected_at: None,
                ended_at: None,
                end_reason: None,
                sample_rate: 16000,
                remote_audio_muted: None,
                hand_raised: false,
                social_supported: false,
                reconnects: 0,
            }),
            operation: Mutex::new(()),
            media: Mutex::new(None),
            cancel: CancellationToken::new(),
            accepted: AtomicBool::new(direction == CallDirection::Outbound),
            claimed: AtomicBool::new(exclusive),
        }));
        registry.calls.insert(id.clone(), call.clone());
        let pending = registry.pending.remove(&id).unwrap_or_default();
        registry
            .pending_order
            .retain(|pending_id| pending_id != &id);
        drop(registry);
        self.0.emit(CallsEvent::Known(call.clone()));
        for frame in pending {
            call.apply(frame).await;
        }
        call
    }
    async fn receive(&self, frame: LifecycleFrame) {
        let LifecycleFrame::Event {
            ref event,
            ref call_id,
            ref payload,
            ..
        } = frame
        else {
            return;
        };
        if event == "call.received" {
            if payload["direction"] == "outgoing" || self.get_call(call_id).await.is_some() {
                return;
            }
            let peer = payload["from"]
                .as_str()
                .map(str::to_owned)
                .or_else(|| payload["from"]["phoneNumber"].as_str().map(str::to_owned))
                .unwrap_or_default();
            let video = payload["hasVideo"] == true || payload["has_video"] == true;
            let call = self
                .track(
                    call_id.clone(),
                    CallDirection::Inbound,
                    peer,
                    video,
                    false,
                    Some(capabilities_from(
                        &payload["capabilities"],
                        CallCapabilities::default(),
                    )),
                )
                .await;
            if call.snapshot().await.state != CallState::Ended {
                self.0.emit(CallsEvent::Incoming(call));
            }
            return;
        }
        if let Some(call) = self.get_call(call_id).await {
            call.apply(frame).await;
            return;
        }
        if ![
            "call.accepted",
            "call.ended",
            "call.missed",
            "call.rejected",
            "call.participant_joined",
            "call.participant_state",
            "call.participant_left",
        ]
        .contains(&event.as_str())
        {
            return;
        }
        let mut registry = self.0.registry.lock().await;
        if !registry.pending.contains_key(call_id) {
            if registry.pending.len() >= 128 {
                if let Some(old) = registry.pending_order.pop_front() {
                    registry.pending.remove(&old);
                }
            }
            registry.pending_order.push_back(call_id.clone());
        }
        let queue = registry.pending.entry(call_id.clone()).or_default();
        if queue.iter().any(terminal_frame) {
            return;
        }
        if terminal_frame(&frame) {
            queue.clear();
        }
        if queue.len() >= 32 {
            queue.pop_front();
        }
        queue.push_back(frame);
    }
}
fn terminal_frame(frame: &LifecycleFrame) -> bool {
    matches!(frame,LifecycleFrame::Event{event,..} if ["call.ended","call.missed","call.rejected"].contains(&event.as_str()))
}
fn capabilities_from(value: &serde_json::Value, fallback: CallCapabilities) -> CallCapabilities {
    CallCapabilities {
        video: value["video"].as_bool().unwrap_or(fallback.video),
        invite: value["invite"].as_bool().unwrap_or(fallback.invite),
    }
}
impl Call {
    pub fn id(&self) -> &str {
        &self.0.id
    }
    pub fn connection_id(&self) -> &str {
        &self.0.connection_id
    }
    pub async fn snapshot(&self) -> CallSnapshot {
        self.0.snapshot.lock().await.clone()
    }
    async fn transition(&self, state: CallState) {
        let mut snapshot = self.0.snapshot.lock().await;
        if snapshot.state == CallState::Ended || snapshot.state == state {
            return;
        }
        snapshot.state = state;
        if state == CallState::Connected && snapshot.connected_at.is_none() {
            snapshot.connected_at = Some(SystemTime::now());
        }
        drop(snapshot);
        self.0.client.emit(CallsEvent::State {
            call_id: self.0.id.clone(),
            state,
        });
    }
    async fn finish(&self, reason: CallEndReason) {
        let mut snapshot = self.0.snapshot.lock().await;
        if snapshot.state == CallState::Ended {
            return;
        }
        snapshot.state = CallState::Ended;
        snapshot.ended_at = Some(SystemTime::now());
        snapshot.end_reason = Some(reason);
        drop(snapshot);
        self.0.cancel.cancel();
        self.0.media.lock().await.take();
        self.0.client.emit(CallsEvent::Ended {
            call: self.clone(),
            reason,
        });
        let mut registry = self.0.client.registry.lock().await;
        registry.ended.push_back(self.0.id.clone());
        while registry.ended.len() > 256 {
            if let Some(id) = registry.ended.pop_front() {
                registry.calls.remove(&id);
            }
        }
    }
    pub async fn answer(&self, options: AnswerOptions) -> Result<()> {
        let _operation = self.0.operation.lock().await;
        let snapshot = self.snapshot().await;
        if snapshot.state != CallState::Incoming {
            return Err(invalid("invalid_state", "Call is not incoming"));
        }
        if snapshot.claim.claimed_by_other {
            return Err(invalid(
                "call_claimed",
                "Another participant claimed the call",
            ));
        }
        self.transition(CallState::Connecting).await;
        let (api, _) = match self.0.client.api(false, None).await {
            Ok(api) => api,
            Err(error) => {
                self.transition(CallState::Incoming).await;
                return Err(error);
            }
        };
        let accepted = api
            .calls()
            .accept(
                &self.0.id,
                &AcceptCallRequest {
                    exclusive: options.exclusive,
                    video: Some(options.video.unwrap_or(snapshot.has_video)),
                    participant: self.0.client.options.participant.clone(),
                },
                Default::default(),
            )
            .await;
        let result = match accepted {
            Ok(result) => result.data,
            Err(error) => {
                self.transition(CallState::Incoming).await;
                if error.code.as_deref() == Some("call_claimed") {
                    let mut s = self.0.snapshot.lock().await;
                    s.claim.claimed_by_other = true;
                    s.claim.answered = true;
                    s.claim.exclusive = true;
                }
                return Err(error);
            }
        };
        self.0.accepted.store(true, Ordering::Release);
        self.0.claimed.store(result.exclusive, Ordering::Release);
        {
            let mut snapshot = self.0.snapshot.lock().await;
            snapshot.claim.answered = result.answered;
            snapshot.claim.answered_by = Some(result.answered_by);
            snapshot.claim.exclusive = result.exclusive;
            snapshot.claim.can_join = false;
        }
        if self.0.cancel.is_cancelled() {
            self.release().await;
            return Err(cancelled());
        }
        self.attach().await
    }
    pub async fn join(&self, video: Option<bool>) -> Result<()> {
        if !self.snapshot().await.claim.can_join {
            return Err(invalid("call_not_answered", "The call is not open to join"));
        }
        self.answer(AnswerOptions {
            exclusive: false,
            video,
        })
        .await
    }
    pub async fn reject(&self) -> Result<()> {
        let _operation = self.0.operation.lock().await;
        let s = self.snapshot().await;
        if s.state != CallState::Incoming || s.claim.answered {
            return Err(invalid("call_not_ringing", "Call is no longer ringing"));
        }
        let (api, _) = self.0.client.api(false, None).await?;
        api.calls()
            .reject(
                &self.0.id,
                self.0.client.options.participant.as_deref(),
                Default::default(),
            )
            .await?;
        self.finish(CallEndReason::Rejected).await;
        Ok(())
    }
    pub async fn leave(&self) -> Result<()> {
        let _operation = self.0.operation.lock().await;
        let s = self.snapshot().await;
        if s.state == CallState::Ended {
            return Ok(());
        }
        if s.direction == CallDirection::Outbound && s.state == CallState::Ringing {
            return self.end_inner().await;
        }
        if self.0.accepted.load(Ordering::Acquire) {
            let (api, _) = self.0.client.api(false, None).await?;
            api.calls()
                .leave(
                    &self.0.id,
                    &self.0.connection_id,
                    self.0.client.options.participant.as_deref(),
                    Default::default(),
                )
                .await?;
        }
        self.finish(CallEndReason::Left).await;
        Ok(())
    }
    async fn end_inner(&self) -> Result<()> {
        if self.snapshot().await.state == CallState::Ended {
            return Ok(());
        }
        let (api, _) = self.0.client.api(false, None).await?;
        api.calls().end(&self.0.id, Default::default()).await?;
        self.finish(CallEndReason::Hangup).await;
        Ok(())
    }
    pub async fn end(&self) -> Result<()> {
        let _operation = self.0.operation.lock().await;
        self.end_inner().await
    }
    pub async fn add_participant(&self, to: &str) -> Result<Participant> {
        let s = self.snapshot().await;
        if s.state == CallState::Ended || !s.capabilities.invite {
            return Err(invalid("invalid_state", "Invitations unavailable"));
        }
        let (api, _) = self.0.client.api(false, None).await?;
        Ok(api
            .calls()
            .add_participant(&self.0.id, to, Default::default())
            .await?
            .data)
    }
    pub async fn ring_participant(&self, to: &str) -> Result<()> {
        if self.snapshot().await.state == CallState::Ended {
            return Err(invalid("invalid_state", "Call ended"));
        }
        let (api, _) = self.0.client.api(false, None).await?;
        api.calls()
            .ring_participant(&self.0.id, to, Default::default())
            .await?;
        Ok(())
    }
    async fn command<T>(
        &self,
        build: impl FnOnce(oneshot::Sender<Result<T>>) -> MediaCommand,
    ) -> Result<T> {
        if self.snapshot().await.state != CallState::Connected {
            return Err(invalid(
                "media_control_unavailable",
                "Media is not connected",
            ));
        }
        let sender = self
            .0
            .media
            .lock()
            .await
            .clone()
            .ok_or_else(|| invalid("media_control_unavailable", "No media is attached"))?;
        let (tx, rx) = oneshot::channel();
        sender.try_send(build(tx)).map_err(|_| {
            invalid(
                "media_control_unavailable",
                "Media command queue is full or closed",
            )
        })?;
        rx.await.map_err(|_| {
            invalid(
                "media_control_unknown",
                "Media connection closed before confirmation",
            )
        })?
    }
    pub async fn write_audio(&self, pcm: Vec<i16>) -> Result<()> {
        self.command(|reply| MediaCommand::Audio(pcm, reply)).await
    }
    pub async fn write_video(&self, frame: VideoFrame) -> Result<()> {
        self.command(|reply| MediaCommand::Video(frame, reply))
            .await
    }
    pub async fn set_media_state(&self, update: MediaStateUpdate) -> Result<MediaStateUpdate> {
        self.command(|reply| MediaCommand::State(update, reply))
            .await
    }
    pub async fn send_reaction(&self, emoji: &str) -> Result<()> {
        let s = self.snapshot().await;
        if s.state != CallState::Connected || !s.social_supported {
            return Err(invalid("invalid_state", "Reactions unavailable"));
        }
        let (api, _) = self.0.client.api(false, None).await?;
        api.voip()
            .send_reaction(
                &self.0.id,
                &crate::voip::CallReactionRequest {
                    connection_id: self.0.connection_id.clone(),
                    participant: self.0.client.options.participant.clone(),
                    emoji: emoji.into(),
                },
                Default::default(),
            )
            .await?;
        Ok(())
    }
    pub async fn set_hand_raised(&self, raised: bool) -> Result<()> {
        let s = self.snapshot().await;
        if s.state != CallState::Connected || !s.social_supported {
            return Err(invalid("invalid_state", "Hand controls unavailable"));
        }
        let (api, _) = self.0.client.api(false, None).await?;
        api.voip()
            .set_hand_raised(
                &self.0.id,
                &crate::voip::HandRaisedRequest {
                    connection_id: self.0.connection_id.clone(),
                    participant: self.0.client.options.participant.clone(),
                    raised,
                },
                Default::default(),
            )
            .await?;
        Ok(())
    }
    fn report_failure(&self, error: &Error) {
        use crate::calls_diagnostics::CallErrorCode;
        if error.code.as_deref() == Some("call_claimed") {
            return;
        }
        if let Some(reporter) = &self.0.reporter {
            reporter.error(if error.kind == ErrorKind::Authentication {
                CallErrorCode::TokenRefreshFailed
            } else if error.kind == ErrorKind::Timeout {
                CallErrorCode::MediaTimeout
            } else {
                CallErrorCode::Other
            });
        }
    }
    async fn attach(&self) -> Result<()> {
        let (api, _) = self
            .0
            .client
            .api(false, Some(self.0.cancel.clone()))
            .await?;
        let socket = match api
            .calls()
            .open_media(
                &self.0.id,
                &self.0.connection_id,
                self.0.client.options.participant.as_deref(),
                self.0.cancel.clone(),
            )
            .await
        {
            Ok(socket) => socket,
            Err(error) => {
                self.report_failure(&error);
                self.release().await;
                self.finish(if error.code.as_deref() == Some("call_claimed") {
                    CallEndReason::Claimed
                } else {
                    CallEndReason::ConnectionFailed
                })
                .await;
                return Err(error);
            }
        };
        if self.0.cancel.is_cancelled() {
            self.release().await;
            return Err(cancelled());
        }
        {
            let mut s = self.0.snapshot.lock().await;
            s.sample_rate = socket.sample_rate;
        }
        let (tx, rx) = mpsc::channel(16);
        *self.0.media.lock().await = Some(tx);
        self.transition(CallState::Connected).await;
        let call = self.clone();
        tokio::spawn(async move {
            media_worker(call, socket, rx).await;
        });
        Ok(())
    }
    async fn release(&self) {
        if !self.0.accepted.load(Ordering::Acquire) {
            return;
        }
        let request = async {
            if let Ok((api, _)) = self.0.client.api(false, None).await {
                let options = RequestOptions {
                    timeout: Some(Duration::from_secs(5)),
                    max_network_retries: Some(0),
                    ..Default::default()
                };
                if self.0.claimed.load(Ordering::Acquire) {
                    let _ = api.calls().end(&self.0.id, options).await;
                } else {
                    let _ = api
                        .calls()
                        .leave(
                            &self.0.id,
                            &self.0.connection_id,
                            self.0.client.options.participant.as_deref(),
                            options,
                        )
                        .await;
                }
            }
        };
        let _ = tokio::time::timeout(Duration::from_secs(5), request).await;
    }
    async fn apply(&self, frame: LifecycleFrame) {
        let LifecycleFrame::Event { event, payload, .. } = frame else {
            return;
        };
        if self.snapshot().await.state == CallState::Ended {
            return;
        }
        match event.as_str() {
            "call.accepted" => {
                let mut s = self.0.snapshot.lock().await;
                s.capabilities = capabilities_from(&payload["capabilities"], s.capabilities);
                s.has_video = self.0.offered_video && s.capabilities.video;
                s.claim.answered = true;
                s.claim.answered_by = payload["answeredBy"].as_str().map(str::to_owned);
                s.claim.exclusive =
                    payload["exclusive"] == true || self.0.claimed.load(Ordering::Acquire);
                let own = format!(
                    "server:{}",
                    self.0
                        .client
                        .options
                        .participant
                        .as_deref()
                        .unwrap_or("default")
                );
                s.claim.claimed_by_other = s.claim.exclusive
                    && s.claim.answered_by.as_deref().is_some_and(|p| p != own)
                    && !self.0.accepted.load(Ordering::Acquire);
                s.claim.can_join = s.state == CallState::Incoming && !s.claim.exclusive;
                let attach =
                    s.direction == CallDirection::Outbound && s.state == CallState::Ringing;
                drop(s);
                if attach {
                    self.transition(CallState::Connecting).await;
                    let call = self.clone();
                    tokio::spawn(async move {
                        if let Err(error) = call.attach().await {
                            call.0.client.emit(CallsEvent::Error {
                                call_id: Some(call.0.id.clone()),
                                error,
                            });
                        }
                    });
                }
            }
            "call.ended" => self.finish(reason(payload["reason"].as_str())).await,
            "call.missed" => self.finish(CallEndReason::Missed).await,
            "call.rejected" => self.finish(CallEndReason::Rejected).await,
            "call.participant_joined" | "call.participant_state" => {
                if let Ok(p) = serde_json::from_value::<Participant>(payload["participant"].clone())
                {
                    let mut s = self.0.snapshot.lock().await;
                    if let Some(existing) = s.participants.iter_mut().find(|v| v.id == p.id) {
                        *existing = p;
                    } else {
                        s.participants.push(p);
                    }
                }
            }
            "call.participant_left" => {
                if let Some(id) = payload["participantId"].as_str() {
                    self.0
                        .snapshot
                        .lock()
                        .await
                        .participants
                        .retain(|p| p.id != id);
                }
            }
            _ => {}
        }
    }
}
fn reason(reason: Option<&str>) -> CallEndReason {
    match reason {
        Some("user_hangup" | "remote_hangup") => CallEndReason::RemoteHangup,
        Some("busy") => CallEndReason::Busy,
        Some("ring_timeout" | "timeout") => CallEndReason::Timeout,
        Some("pod_lost") => CallEndReason::PodLost,
        Some("capacity") => CallEndReason::Capacity,
        Some("call_restricted") => CallEndReason::CallRestricted,
        _ => CallEndReason::Unknown,
    }
}
fn refresh_delay(token: &CallsToken, lead: Duration) -> Duration {
    let Some(expiry) = token.expires_at else {
        return Duration::from_secs(86400 * 365);
    };
    let remaining = expiry.duration_since(SystemTime::now()).unwrap_or_default();
    std::cmp::max(
        Duration::from_secs(1),
        if remaining > lead.saturating_mul(2) {
            remaining.saturating_sub(lead)
        } else {
            remaining / 2
        },
    )
}
async fn cancellable_pause(cancel: &CancellationToken, delay: Duration) -> bool {
    tokio::select! {_=cancel.cancelled()=>false,_=tokio::time::sleep(delay)=>true}
}
async fn lifecycle_worker(
    inner: Arc<ClientInner>,
    cancel: CancellationToken,
    first: oneshot::Sender<Result<()>>,
) {
    let client = CallsClient(inner.clone(), None);
    let mut first = Some(first);
    let mut refresh = false;
    let mut attempt = 0_u32;
    while !cancel.is_cancelled() {
        let opened = async {
            let (api, token) = inner.api(refresh, Some(cancel.clone())).await?;
            let socket = api
                .calls()
                .open_lifecycle(
                    &inner.options.session,
                    inner.options.participant.as_deref(),
                    cancel.clone(),
                )
                .await?;
            Ok::<_, Error>((socket, token))
        }
        .await;
        let (mut socket, mut token) = match opened {
            Ok(value) => value,
            Err(error) => {
                if let Some(first) = first.take() {
                    let _ = first.send(Err(error.clone()));
                }
                if cancel.is_cancelled() {
                    break;
                }
                refresh = error.kind == ErrorKind::Authentication;
                let refused = error.code.as_deref() == Some("invalid_request");
                inner.emit(CallsEvent::Error {
                    call_id: None,
                    error,
                });
                if refused {
                    break;
                }
                attempt = attempt.saturating_add(1);
                if !cancellable_pause(
                    &cancel,
                    std::cmp::min(
                        Duration::from_secs(30),
                        inner
                            .options
                            .lifecycle_backoff
                            .saturating_mul(2_u32.saturating_pow(attempt.saturating_sub(1).min(8))),
                    ),
                )
                .await
                {
                    break;
                }
                continue;
            }
        };
        attempt = 0;
        refresh = false;
        inner.connected.store(true, Ordering::Release);
        inner.emit(CallsEvent::Ready);
        if let Some(first) = first.take() {
            let _ = first.send(Ok(()));
        }
        let mut awaiting_pong = false;
        let heartbeat = if inner.options.lifecycle_heartbeat.is_zero() {
            Duration::from_secs(86400 * 365)
        } else {
            inner.options.lifecycle_heartbeat
        };
        let mut next_beat = tokio::time::Instant::now() + heartbeat;
        let mut next_refresh = tokio::time::Instant::now()
            + refresh_delay(&token, inner.options.refresh_before_expiry);
        let error = loop {
            tokio::select! {_=cancel.cancelled()=>{let _=socket.close().await;break None;},frame=socket.read()=>match frame{Ok(Some(LifecycleFrame::Pong))=>awaiting_pong=false,Ok(Some(frame))=>client.receive(frame).await,Ok(None)=>break Some(invalid("connection_error","Lifecycle socket closed")),Err(error)=>break Some(error)},_=tokio::time::sleep_until(next_beat)=>{if awaiting_pong{break Some(invalid("connection_error","Lifecycle heartbeat timed out"));}
            if let Err(error)=socket.ping().await{break Some(error);}awaiting_pong=true;next_beat=tokio::time::Instant::now()+heartbeat;},_=tokio::time::sleep_until(next_refresh)=>{match inner.tokens.get(CallsTokenRequest{refresh:true,cancellation:Some(cancel.clone())}).await{Ok(replacement)=>{if let Err(error)=socket.replace_token(&replacement.credential).await{break Some(error);}token=replacement;next_refresh=tokio::time::Instant::now()+refresh_delay(&token,inner.options.refresh_before_expiry);},Err(error)=>{inner.emit(CallsEvent::Error{call_id:None,error});next_refresh=tokio::time::Instant::now()+Duration::from_secs(5);}}}}
        };
        inner.connected.store(false, Ordering::Release);
        inner.emit(CallsEvent::Disconnected);
        if let Some(error) = error {
            refresh = error.kind == ErrorKind::Authentication;
            if refresh {
                inner.tokens.invalidate().await;
            }
            let refused = error.code.as_deref() == Some("invalid_request");
            inner.emit(CallsEvent::Error {
                call_id: None,
                error,
            });
            if refused {
                break;
            }
        }
        if !cancellable_pause(&cancel, inner.options.lifecycle_backoff).await {
            break;
        }
    }
    inner.connected.store(false, Ordering::Release);
    cancel.cancel();
    let mut run = inner.run.lock().await;
    if run.as_ref().is_some_and(CancellationToken::is_cancelled) {
        run.take();
    }
}
struct PendingState {
    id: String,
    update: MediaStateUpdate,
    reply: oneshot::Sender<Result<MediaStateUpdate>>,
    deadline: tokio::time::Instant,
}
async fn media_worker(
    call: Call,
    mut socket: MediaSocket,
    mut commands: mpsc::Receiver<MediaCommand>,
) {
    let mut preferences = MediaStateUpdate::default();
    let mut pending: Option<PendingState> = None;
    let heartbeat = if call.0.client.options.media_heartbeat.is_zero() {
        Duration::from_secs(86400 * 365)
    } else {
        call.0.client.options.media_heartbeat
    };
    let mut awaiting_pong = false;
    let mut next_beat = tokio::time::Instant::now() + heartbeat;
    loop {
        let deadline = pending
            .as_ref()
            .map(|p| p.deadline)
            .unwrap_or(tokio::time::Instant::now() + Duration::from_secs(86400 * 365));
        let outcome = tokio::select! {
        _=call.0.cancel.cancelled()=>{let _=socket.leave().await;break;},
        _=tokio::time::sleep_until(deadline),if pending.is_some()=>{if let Some(p)=pending.take(){let _=p.reply.send(Err(invalid("media_control_unknown","Media control timed out; its outcome is unknown")));}continue;},
        _=tokio::time::sleep_until(next_beat)=>{if awaiting_pong{Err(invalid("media_lost","Media heartbeat timed out"))}else{match socket.ping().await{Ok(())=>{awaiting_pong=true;next_beat=tokio::time::Instant::now()+heartbeat;continue;},Err(error)=>Err(error)}}},
        command=commands.recv(),if pending.is_none()=>{match command{Some(MediaCommand::Audio(pcm,reply))=>{let result=socket.write_audio(&pcm).await;let fatal=result.as_ref().err().cloned();let _=reply.send(result);if let Some(error)=fatal{Err(error)}else{continue;}},Some(MediaCommand::Video(frame,reply))=>{let result=socket.write_video(&frame).await;let fatal=result.as_ref().err().filter(|e|e.kind==ErrorKind::Connection).cloned();let _=reply.send(result);if let Some(error)=fatal{Err(error)}else{continue;}},Some(MediaCommand::State(update,reply))=>{let id=create_connection_id();match socket.set_media_state(&id,&update).await {Ok(())=>{pending=Some(PendingState{id,update,reply,deadline:tokio::time::Instant::now()+call.0.client.options.media_control_timeout});continue;},Err(error)=>{let fatal=(error.kind==ErrorKind::Connection).then(||error.clone());let _=reply.send(Err(error));if let Some(error)=fatal{Err(error)}else{continue;}}}},None=>break,}},
        frame=socket.read()=>match frame{Ok(Some(frame))=>Ok(frame),Ok(None)=>{call.finish(CallEndReason::RemoteHangup).await;break;},Err(error)=>Err(error)}
        };
        match outcome {
            Ok(frame) => {
                if let MediaFrame::Control(control) = &frame {
                    match control {
                        MediaControlFrame::Pong => awaiting_pong = false,
                        MediaControlFrame::MediaState {
                            request_id,
                            audio_muted,
                            video_enabled,
                            screen_sharing,
                        } => {
                            if pending.as_ref().is_some_and(|p| p.id == *request_id) {
                                let p = pending.take().unwrap();
                                let state = MediaStateUpdate {
                                    audio_muted: Some(*audio_muted),
                                    video_enabled: Some(*video_enabled),
                                    screen_sharing: Some(screen_sharing.unwrap_or(false)),
                                };
                                if p.update.audio_muted.is_none_or(|v| v == *audio_muted)
                                    && p.update.video_enabled.is_none_or(|v| v == *video_enabled)
                                    && p.update
                                        .screen_sharing
                                        .is_none_or(|v| v == screen_sharing.unwrap_or(false))
                                {
                                    preferences = state.clone();
                                    let _ = p.reply.send(Ok(state));
                                } else {
                                    let _ = p.reply.send(Err(invalid(
                                        "media_control_failed",
                                        "Media control was not confirmed",
                                    )));
                                }
                            }
                        }
                        MediaControlFrame::MediaError { request_id, code } => {
                            if pending.as_ref().is_some_and(|p| p.id == *request_id) {
                                let _ = pending
                                    .take()
                                    .unwrap()
                                    .reply
                                    .send(Err(invalid(code, "Media control refused")));
                            }
                        }
                        MediaControlFrame::RemoteMedia { audio_muted } => {
                            call.0.snapshot.lock().await.remote_audio_muted = *audio_muted
                        }
                        MediaControlFrame::HandState { raised, supported } => {
                            let mut s = call.0.snapshot.lock().await;
                            s.hand_raised = *raised;
                            s.social_supported = *supported;
                        }
                        MediaControlFrame::ParticipantJoined { participant }
                        | MediaControlFrame::ParticipantState { participant } => {
                            let mut s = call.0.snapshot.lock().await;
                            if let Some(existing) =
                                s.participants.iter_mut().find(|p| p.id == participant.id)
                            {
                                *existing = participant.clone();
                            } else {
                                s.participants.push(participant.clone());
                            }
                        }
                        MediaControlFrame::ParticipantLeft { participant_id, .. } => call
                            .0
                            .snapshot
                            .lock()
                            .await
                            .participants
                            .retain(|p| p.id != *participant_id),
                        _ => {}
                    }
                }
                call.0.client.emit(CallsEvent::Media {
                    call_id: call.0.id.clone(),
                    frame,
                });
            }
            Err(error) => {
                if let Some(p) = pending.take() {
                    let _ = p.reply.send(Err(invalid(
                        "media_control_unknown",
                        "Media disconnected before confirmation",
                    )));
                }
                // Commands already queued for this connection are refused rather than replayed
                // after a socket drop, so a caller never mistakes an uncertain write for a retry.
                while let Ok(command) = commands.try_recv() {
                    match command {
                        MediaCommand::Audio(_, reply) | MediaCommand::Video(_, reply) => {
                            let _ = reply.send(Err(invalid(
                                "media_control_unknown",
                                "Media connection dropped",
                            )));
                        }
                        MediaCommand::State(_, reply) => {
                            let _ = reply.send(Err(invalid(
                                "media_control_unknown",
                                "Media connection dropped",
                            )));
                        }
                    }
                }
                if call.0.cancel.is_cancelled() {
                    break;
                }
                if error.code.as_deref() == Some("call_claimed") {
                    call.finish(CallEndReason::Claimed).await;
                    break;
                }
                if error.code.as_deref() == Some("call_ended") {
                    call.finish(CallEndReason::RemoteHangup).await;
                    break;
                }
                if !matches!(
                    error.kind,
                    ErrorKind::Connection | ErrorKind::Authentication | ErrorKind::Timeout
                ) {
                    call.report_failure(&error);
                    call.release().await;
                    call.finish(CallEndReason::ConnectionFailed).await;
                    call.0.client.emit(CallsEvent::Error {
                        call_id: Some(call.0.id.clone()),
                        error,
                    });
                    break;
                }
                let mut refresh = error.kind == ErrorKind::Authentication;
                if refresh {
                    call.0.client.tokens.invalidate().await;
                }
                call.transition(CallState::Reconnecting).await;
                let mut recovered = None;
                let mut last_error = error;
                for attempt in 0..call.0.client.options.reconnect_attempts {
                    if !cancellable_pause(
                        &call.0.cancel,
                        std::cmp::min(
                            Duration::from_secs(8),
                            call.0
                                .client
                                .options
                                .media_backoff
                                .saturating_mul(2_u32.saturating_pow(attempt)),
                        ),
                    )
                    .await
                    {
                        break;
                    }
                    let opened = async {
                        let (api, _) = call
                            .0
                            .client
                            .api(refresh, Some(call.0.cancel.clone()))
                            .await?;
                        api.calls()
                            .open_media(
                                &call.0.id,
                                &call.0.connection_id,
                                call.0.client.options.participant.as_deref(),
                                call.0.cancel.clone(),
                            )
                            .await
                    }
                    .await;
                    match opened {
                        Ok(media) => {
                            recovered = Some(media);
                            break;
                        }
                        Err(error) => {
                            refresh |= error.kind == ErrorKind::Authentication;
                            let retryable = matches!(
                                error.kind,
                                ErrorKind::Connection
                                    | ErrorKind::Authentication
                                    | ErrorKind::Timeout
                            );
                            last_error = error;
                            if !retryable {
                                break;
                            }
                        }
                    }
                }
                if let Some(media) = recovered {
                    socket = media;
                    {
                        let mut s = call.0.snapshot.lock().await;
                        s.reconnects += 1;
                        s.sample_rate = socket.sample_rate;
                    }
                    awaiting_pong = false;
                    next_beat = tokio::time::Instant::now() + heartbeat;
                    if preferences.audio_muted.is_some()
                        || preferences.video_enabled.is_some()
                        || preferences.screen_sharing.is_some()
                    {
                        let _ = socket
                            .set_media_state(&create_connection_id(), &preferences)
                            .await;
                    }
                    call.transition(CallState::Connected).await;
                } else {
                    if !call.0.cancel.is_cancelled() {
                        call.report_failure(&last_error);
                        if last_error.code.as_deref() != Some("call_claimed") {
                            if let Some(reporter) = &call.0.reporter {
                                reporter.error(
                                    crate::calls_diagnostics::CallErrorCode::ReconnectExhausted,
                                );
                            }
                        }
                        if last_error.code.as_deref() == Some("call_claimed") {
                            call.finish(CallEndReason::Claimed).await;
                        } else {
                            call.release().await;
                            call.finish(CallEndReason::ConnectionFailed).await;
                        }
                        call.0.client.emit(CallsEvent::Error {
                            call_id: Some(call.0.id.clone()),
                            error: last_error,
                        });
                    }
                    break;
                }
            }
        }
    }
    if let Some(p) = pending.take() {
        let _ = p
            .reply
            .send(Err(invalid("media_control_unknown", "Media owner stopped")));
    }
    call.0.media.lock().await.take();
    if let Some(reporter) = &call.0.reporter {
        reporter.quality(crate::voip::CallQuality {
            reconnects: Some(call.snapshot().await.reconnects),
            ..Default::default()
        });
        reporter.stop();
    }
}
