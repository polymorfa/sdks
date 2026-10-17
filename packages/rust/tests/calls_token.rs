use polymorfa_sdk::{calls_token::*, Credential, ErrorKind};
use std::{
    sync::{
        atomic::{AtomicUsize, Ordering},
        Arc,
    },
    time::{Duration, SystemTime},
};
use tokio_util::sync::CancellationToken;
fn token(value: char, expiry: Option<SystemTime>) -> CallsToken {
    CallsToken {
        credential: Credential::organization_api_key(format!(
            "pmfa_{}",
            value.to_string().repeat(72)
        ))
        .unwrap(),
        expires_at: expiry,
    }
}
#[tokio::test]
async fn provider_singleflight_expiry_and_explicit_refresh() {
    let hits = Arc::new(AtomicUsize::new(0));
    let now = Arc::new(std::sync::Mutex::new(
        SystemTime::UNIX_EPOCH + Duration::from_secs(100),
    ));
    let provider: CallsTokenProvider = Arc::new({
        let hits = hits.clone();
        move |request| {
            let hits = hits.clone();
            Box::pin(async move {
                let hit = hits.fetch_add(1, Ordering::SeqCst);
                tokio::time::sleep(Duration::from_millis(10)).await;
                if hit < 2 {
                    assert_eq!(request.refresh, hit == 1);
                }
                Ok(token(
                    if hit == 0 { 'a' } else { 'b' },
                    Some(SystemTime::UNIX_EPOCH + Duration::from_secs(150)),
                ))
            })
        }
    });
    let source = CallsTokenSource::with_clock(
        provider,
        Duration::from_secs(30),
        Arc::new({
            let now = now.clone();
            move || *now.lock().unwrap()
        }),
    );
    let (a, b) = tokio::join!(
        source.get(Default::default()),
        source.get(Default::default())
    );
    assert!(matches!(a.unwrap().credential,Credential::OrganizationApiKey(v) if v.ends_with('a')));
    assert!(b.is_ok());
    assert_eq!(hits.load(Ordering::SeqCst), 1);
    source.get(Default::default()).await.unwrap();
    assert_eq!(hits.load(Ordering::SeqCst), 1);
    source
        .get(CallsTokenRequest {
            refresh: true,
            cancellation: None,
        })
        .await
        .unwrap();
    assert_eq!(hits.load(Ordering::SeqCst), 2);
    *now.lock().unwrap() = SystemTime::UNIX_EPOCH + Duration::from_secs(130);
    source.get(Default::default()).await.unwrap();
    assert_eq!(hits.load(Ordering::SeqCst), 3);
}
#[tokio::test]
async fn one_waiter_cancels_without_aborting_other_and_last_waiter_cancels_provider() {
    let requests = Arc::new(AtomicUsize::new(0));
    let cancelled = Arc::new(AtomicUsize::new(0));
    let provider: CallsTokenProvider = Arc::new({
        let requests = requests.clone();
        let cancelled = cancelled.clone();
        move |request| {
            let requests = requests.clone();
            let cancelled = cancelled.clone();
            Box::pin(async move {
                requests.fetch_add(1, Ordering::SeqCst);
                let token_cancel = request.cancellation.unwrap();
                tokio::select! {_=token_cancel.cancelled()=>{cancelled.fetch_add(1,Ordering::SeqCst);Ok(token('b',None))},_=tokio::time::sleep(Duration::from_millis(30))=>Ok(token('a',None))}
            })
        }
    });
    let source = CallsTokenSource::new(provider);
    let caller = CancellationToken::new();
    let one = tokio::spawn({
        let source = source.clone();
        let caller = caller.clone();
        async move {
            source
                .get(CallsTokenRequest {
                    refresh: false,
                    cancellation: Some(caller),
                })
                .await
        }
    });
    let two = tokio::spawn({
        let source = source.clone();
        async move { source.get(Default::default()).await }
    });
    tokio::time::sleep(Duration::from_millis(5)).await;
    caller.cancel();
    assert_eq!(one.await.unwrap().err().unwrap().kind, ErrorKind::Cancelled);
    assert!(two.await.unwrap().is_ok());
    assert_eq!(requests.load(Ordering::SeqCst), 1);
    assert_eq!(cancelled.load(Ordering::SeqCst), 0);
    source.invalidate().await;
    let last = CancellationToken::new();
    let future = tokio::spawn({
        let source = source.clone();
        let last = last.clone();
        async move {
            source
                .get(CallsTokenRequest {
                    refresh: false,
                    cancellation: Some(last),
                })
                .await
        }
    });
    tokio::time::timeout(Duration::from_secs(1), async {
        while requests.load(Ordering::SeqCst) < 2 {
            tokio::task::yield_now().await;
        }
    })
    .await
    .unwrap();
    last.cancel();
    assert_eq!(
        future.await.unwrap().err().unwrap().kind,
        ErrorKind::Cancelled
    );
    // The source selects cancellation itself; the provider future is dropped promptly.
    assert!(source.get(Default::default()).await.is_ok());
    assert_eq!(requests.load(Ordering::SeqCst), 3);
}
#[tokio::test]
async fn refresh_overtakes_old_fetch_and_invalidation_prevents_stale_cache() {
    let requests = Arc::new(AtomicUsize::new(0));
    let provider: CallsTokenProvider = Arc::new({
        let requests = requests.clone();
        move |request| {
            let requests = requests.clone();
            Box::pin(async move {
                requests.fetch_add(1, Ordering::SeqCst);
                tokio::time::sleep(if request.refresh {
                    Duration::from_millis(5)
                } else {
                    Duration::from_millis(30)
                })
                .await;
                Ok(token(if request.refresh { 'b' } else { 'a' }, None))
            })
        }
    });
    let source = CallsTokenSource::new(provider);
    let old = tokio::spawn({
        let source = source.clone();
        async move { source.get(Default::default()).await }
    });
    tokio::time::sleep(Duration::from_millis(2)).await;
    let fresh = source
        .get(CallsTokenRequest {
            refresh: true,
            cancellation: None,
        })
        .await
        .unwrap();
    assert!(matches!(fresh.credential,Credential::OrganizationApiKey(v) if v.ends_with('b')));
    old.await.unwrap().unwrap();
    assert!(
        matches!(source.get(Default::default()).await.unwrap().credential,Credential::OrganizationApiKey(v) if v.ends_with('b'))
    );
    assert_eq!(requests.load(Ordering::SeqCst), 2);
    source.invalidate().await;
    source.get(Default::default()).await.unwrap();
    assert_eq!(requests.load(Ordering::SeqCst), 3);
}
