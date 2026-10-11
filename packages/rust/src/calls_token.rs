//! Cached asynchronous Calls credentials with independent waiter cancellation.
use crate::{transport::cancelled, Credential, Error, ErrorKind, Result};
use futures_util::future::BoxFuture;
use std::{
    sync::{
        atomic::{AtomicBool, AtomicUsize, Ordering},
        Arc,
    },
    time::{Duration, SystemTime},
};
use tokio::sync::{watch, Mutex};
use tokio_util::sync::CancellationToken;
/// Bearer credentials intentionally omit Debug.
#[derive(Clone)]
pub struct CallsToken {
    pub credential: Credential,
    pub expires_at: Option<SystemTime>,
}
#[derive(Clone, Default)]
pub struct CallsTokenRequest {
    pub refresh: bool,
    pub cancellation: Option<CancellationToken>,
}
pub type CallsTokenProvider =
    Arc<dyn Fn(CallsTokenRequest) -> BoxFuture<'static, Result<CallsToken>> + Send + Sync>;
struct Pending {
    refresh: bool,
    generation: u64,
    result: watch::Receiver<Option<Result<CallsToken>>>,
    cancel: CancellationToken,
    waiters: AtomicUsize,
    anchored: AtomicBool,
}
#[derive(Default)]
struct State {
    cached: Option<CallsToken>,
    pending: Option<Arc<Pending>>,
    generation: u64,
}
struct Inner {
    provider: CallsTokenProvider,
    skew: Duration,
    now: Arc<dyn Fn() -> SystemTime + Send + Sync>,
    state: Mutex<State>,
}
/// One source can be shared by REST calls, media sockets and lifecycle sockets.
#[derive(Clone)]
pub struct CallsTokenSource(Arc<Inner>);
struct Waiter(Arc<Pending>);
impl Drop for Waiter {
    fn drop(&mut self) {
        if self.0.waiters.fetch_sub(1, Ordering::AcqRel) == 1
            && !self.0.anchored.load(Ordering::Acquire)
        {
            self.0.cancel.cancel();
        }
    }
}
impl CallsTokenSource {
    pub fn new(provider: CallsTokenProvider) -> Self {
        Self::with_clock(provider, Duration::from_secs(30), Arc::new(SystemTime::now))
    }
    pub fn with_clock(
        provider: CallsTokenProvider,
        expiry_skew: Duration,
        now: Arc<dyn Fn() -> SystemTime + Send + Sync>,
    ) -> Self {
        Self(Arc::new(Inner {
            provider,
            skew: expiry_skew,
            now,
            state: Mutex::new(State::default()),
        }))
    }
    pub fn static_credential(credential: Credential) -> Result<Self> {
        credential.validate()?;
        Ok(Self::new(Arc::new(move |_| {
            let credential = credential.clone();
            Box::pin(async move {
                Ok(CallsToken {
                    credential,
                    expires_at: None,
                })
            })
        })))
    }
    pub async fn invalidate(&self) {
        let mut state = self.0.state.lock().await;
        state.cached = None;
        state.pending = None;
        state.generation += 1;
    }
    pub async fn get(&self, request: CallsTokenRequest) -> Result<CallsToken> {
        if request
            .cancellation
            .as_ref()
            .is_some_and(CancellationToken::is_cancelled)
        {
            return Err(cancelled());
        }
        let pending = {
            let mut state = self.0.state.lock().await;
            if !request.refresh {
                if let Some(token) = &state.cached {
                    if token.expires_at.is_none_or(|expiry| {
                        expiry
                            .checked_sub(self.0.skew)
                            .is_some_and(|expiry| expiry > (self.0.now)())
                    }) {
                        return Ok(token.clone());
                    }
                }
            } else {
                state.cached = None;
            }
            let reuse = state
                .pending
                .as_ref()
                .is_some_and(|p| !p.cancel.is_cancelled() && (!request.refresh || p.refresh));
            if !reuse {
                state.generation += 1;
                let generation = state.generation;
                let (result_tx, result) = watch::channel(None);
                let cancel = CancellationToken::new();
                let pending = Arc::new(Pending {
                    refresh: request.refresh,
                    generation,
                    result,
                    cancel: cancel.clone(),
                    waiters: AtomicUsize::new(0),
                    anchored: AtomicBool::new(false),
                });
                state.pending = Some(pending.clone());
                let inner = self.0.clone();
                let refresh = request.refresh;
                tokio::spawn(async move {
                    let provider = (inner.provider)(CallsTokenRequest {
                        refresh,
                        cancellation: Some(cancel.clone()),
                    });
                    let result =
                        tokio::select! {_=cancel.cancelled()=>Err(cancelled()),v=provider=>v};
                    let result = if cancel.is_cancelled() {
                        Err(cancelled())
                    } else {
                        result
                    };
                    let result = result.and_then(|token| {
                        token.credential.validate()?;
                        Ok(token)
                    });
                    {
                        let mut state = inner.state.lock().await;
                        if generation == state.generation {
                            if let Ok(token) = &result {
                                state.cached = Some(token.clone());
                            }
                            if state
                                .pending
                                .as_ref()
                                .is_some_and(|p| p.generation == generation)
                            {
                                state.pending = None;
                            }
                        }
                    }
                    let _ = result_tx.send(Some(result));
                });
            }
            let pending = state.pending.as_ref().expect("provider pending").clone();
            pending.waiters.fetch_add(1, Ordering::AcqRel);
            if request.cancellation.is_none() {
                pending.anchored.store(true, Ordering::Release);
            }
            pending
        };
        let _waiter = Waiter(pending.clone());
        let mut receiver = pending.result.clone();
        let cancel = request.cancellation.unwrap_or_default();
        loop {
            if let Some(result) = receiver.borrow().clone() {
                return result;
            }
            tokio::select! {_=cancel.cancelled()=>return Err(cancelled()),result=receiver.changed()=>if result.is_err(){return Err(Error::local(ErrorKind::Connection,"Calls token provider did not complete","token_provider_failed"));}}
        }
    }
}
