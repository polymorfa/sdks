//! Bounded, detached technical diagnostics; never includes contacts or media.
use crate::{
    calls_protocol::is_connection_id,
    transport::configuration,
    voip::{CallErrorReport, CallQuality, CallReportClient, CallReportDetails, CallReportRequest},
    Result,
};
use futures_util::future::BoxFuture;
use std::{
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    time::{Duration, SystemTime},
};
#[derive(Clone, Copy, Debug)]
pub enum CallErrorCode {
    MediaPermissionDenied,
    DeviceNotFound,
    DeviceInUse,
    IceFailed,
    NegotiationFailed,
    MediaTimeout,
    ReconnectExhausted,
    TokenRefreshFailed,
    UnsupportedBrowser,
    Other,
}
impl CallErrorCode {
    fn name(self) -> &'static str {
        match self {
            Self::MediaPermissionDenied => "media_permission_denied",
            Self::DeviceNotFound => "device_not_found",
            Self::DeviceInUse => "device_in_use",
            Self::IceFailed => "ice_failed",
            Self::NegotiationFailed => "negotiation_failed",
            Self::MediaTimeout => "media_timeout",
            Self::ReconnectExhausted => "reconnect_exhausted",
            Self::TokenRefreshFailed => "token_refresh_failed",
            Self::UnsupportedBrowser => "unsupported_browser",
            Self::Other => "other",
        }
    }
}
pub type SendCallReport =
    Arc<dyn Fn(CallReportRequest) -> BoxFuture<'static, Result<()>> + Send + Sync>;
struct State {
    quality: Option<SystemTime>,
    errors: Vec<SystemTime>,
}
struct Inner {
    connection_id: String,
    client: CallReportClient,
    send: SendCallReport,
    now: Arc<dyn Fn() -> SystemTime + Send + Sync>,
    state: Mutex<State>,
    stopped: AtomicBool,
}
#[derive(Clone)]
pub struct CallReporter(Arc<Inner>);
impl CallReporter {
    pub fn new(
        connection_id: String,
        client: CallReportClient,
        send: SendCallReport,
    ) -> Result<Self> {
        Self::with_clock(connection_id, client, send, Arc::new(SystemTime::now))
    }
    pub fn with_clock(
        connection_id: String,
        client: CallReportClient,
        send: SendCallReport,
        now: Arc<dyn Fn() -> SystemTime + Send + Sync>,
    ) -> Result<Self> {
        if !is_connection_id(&connection_id)
            || !["browser", "node", "other"].contains(&client.platform.as_str())
        {
            return Err(configuration("call reporter"));
        }
        Ok(Self(Arc::new(Inner {
            connection_id,
            client,
            send,
            now,
            state: Mutex::new(State {
                quality: None,
                errors: Vec::new(),
            }),
            stopped: AtomicBool::new(false),
        })))
    }
    pub fn stopped(&self) -> bool {
        self.0.stopped.load(Ordering::Acquire)
    }
    pub fn stop(&self) {
        self.0.stopped.store(true, Ordering::Release);
    }
    pub fn error(&self, code: CallErrorCode) {
        if self.stopped() {
            return;
        }
        let now = (self.0.now)();
        {
            let mut state = self.0.state.lock().unwrap();
            state
                .errors
                .retain(|t| now.duration_since(*t).unwrap_or_default() < Duration::from_secs(60));
            if state.errors.len() >= 20 {
                return;
            }
            state.errors.push(now);
        }
        self.send(CallReportDetails::Error {
            error: CallErrorReport {
                code: code.name().into(),
            },
        });
    }
    pub fn quality(&self, quality: CallQuality) {
        if self.stopped() {
            return;
        }
        let Some(quality) = clean(quality) else {
            return;
        };
        let now = (self.0.now)();
        {
            let mut state = self.0.state.lock().unwrap();
            if state.quality.is_some_and(|last| {
                now.duration_since(last).unwrap_or_default() < Duration::from_secs(5)
            }) {
                return;
            }
            state.quality = Some(now);
        }
        self.send(CallReportDetails::Quality { quality });
    }
    fn send(&self, details: CallReportDetails) {
        let Ok(runtime) = tokio::runtime::Handle::try_current() else {
            return;
        };
        let inner = self.0.clone();
        let report = CallReportRequest {
            connection_id: inner.connection_id.clone(),
            participant: None,
            client: Some(inner.client.clone()),
            details,
        };
        runtime.spawn(async move {
            if let Ok(Err(error)) =
                tokio::time::timeout(Duration::from_secs(5), (inner.send)(report)).await
            {
                if error
                    .status
                    .is_some_and(|s| (400..500).contains(&s) && s != 429)
                {
                    inner.stopped.store(true, Ordering::Release);
                }
            }
        });
    }
}
fn clean(mut q: CallQuality) -> Option<CallQuality> {
    q.rtt_ms = q.rtt_ms.map(|v| v.min(60000));
    q.jitter_ms = q.jitter_ms.map(|v| v.min(60000));
    q.packets_lost = q.packets_lost.map(|v| v.min(2147483647));
    q.packets_received = q.packets_received.map(|v| v.min(2147483647));
    q.reconnects = q.reconnects.map(|v| v.min(1000));
    for value in [&mut q.audio_codec, &mut q.video_codec] {
        if value.as_ref().is_some_and(|v| {
            v.is_empty()
                || v.len() > 32
                || !v
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b"/.-".contains(&b))
        }) {
            *value = None;
        }
    }
    if q.candidate_type
        .as_ref()
        .is_some_and(|v| !["host", "srflx", "prflx", "relay"].contains(&v.as_str()))
    {
        q.candidate_type = None;
    }
    if q.rtt_ms.is_none()
        && q.jitter_ms.is_none()
        && q.packets_lost.is_none()
        && q.packets_received.is_none()
        && q.audio_codec.is_none()
        && q.video_codec.is_none()
        && q.candidate_type.is_none()
        && q.reconnects.is_none()
    {
        None
    } else {
        Some(q)
    }
}
