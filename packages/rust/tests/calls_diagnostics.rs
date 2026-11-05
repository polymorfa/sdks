#[allow(dead_code)]
mod support;
use polymorfa_sdk::{calls_diagnostics::*, voip::*};
use std::{
    sync::{Arc, Mutex},
    time::{Duration, SystemTime},
};
#[tokio::test]
async fn reporter_sanitizes_technical_figures_and_bounds_detached_reports() {
    let now = Arc::new(Mutex::new(SystemTime::UNIX_EPOCH));
    let reports = Arc::new(Mutex::new(Vec::new()));
    let reporter = CallReporter::with_clock(
        "abcdefghijklmnopqrstuvwx".into(),
        CallReportClient {
            sdk: "rust".into(),
            version: "1.0.0".into(),
            platform: "other".into(),
        },
        Arc::new({
            let reports = reports.clone();
            move |report| {
                let reports = reports.clone();
                Box::pin(async move {
                    reports.lock().unwrap().push(report);
                    Ok(())
                })
            }
        }),
        Arc::new({
            let now = now.clone();
            move || *now.lock().unwrap()
        }),
    )
    .unwrap();
    reporter.quality(CallQuality {
        audio_codec: Some("private device name".into()),
        ..Default::default()
    });
    reporter.quality(CallQuality {
        rtt_ms: Some(999999),
        packets_lost: Some(u32::MAX),
        audio_codec: Some("opus/48000".into()),
        candidate_type: Some("internal".into()),
        ..Default::default()
    });
    reporter.quality(Default::default());
    reporter.quality(CallQuality {
        reconnects: Some(1),
        ..Default::default()
    });
    for _ in 0..25 {
        reporter.error(CallErrorCode::Other);
    }
    tokio::task::yield_now().await;
    {
        let reports = reports.lock().unwrap();
        assert_eq!(reports.len(), 21);
        match &reports[0].details {
            CallReportDetails::Quality { quality } => {
                assert_eq!(quality.rtt_ms, Some(60000));
                assert_eq!(quality.packets_lost, Some(2147483647));
                assert!(quality.candidate_type.is_none());
            }
            _ => panic!(),
        }
    }
    *now.lock().unwrap() += Duration::from_secs(61);
    reporter.error(CallErrorCode::TokenRefreshFailed);
    reporter.quality(CallQuality {
        reconnects: Some(5000),
        ..Default::default()
    });
    tokio::task::yield_now().await;
    assert_eq!(reports.lock().unwrap().len(), 23);
    reporter.stop();
    reporter.error(CallErrorCode::Other);
    tokio::task::yield_now().await;
    assert_eq!(reports.lock().unwrap().len(), 23);
}
#[tokio::test]
async fn permanent_native_refusal_stops_reports_without_propagating_to_caller() {
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let base = format!("http://{}", listener.local_addr().unwrap());
    let server = tokio::spawn(async move {
        let (mut socket, _) = listener.accept().await.unwrap();
        let mut bytes = [0; 4096];
        let n = socket.read(&mut bytes).await.unwrap();
        let request = String::from_utf8_lossy(&bytes[..n]);
        assert!(request.starts_with("POST /messaging/voip/calls/call/reports "));
        assert!(request.contains("\"code\":\"media_timeout\""));
        socket
            .write_all(
                b"HTTP/1.1 403 Forbidden\r\ncontent-length: 2\r\nconnection: close\r\n\r\n{}",
            )
            .await
            .unwrap();
    });
    let client = support::messaging(base);
    let reporter = CallReporter::new(
        "abcdefghijklmnopqrstuvwx".into(),
        CallReportClient {
            sdk: "rust".into(),
            version: "1.0.0".into(),
            platform: "other".into(),
        },
        Arc::new(move |report| {
            let client = client.clone();
            Box::pin(async move {
                client
                    .voip()
                    .report("call", &report, Default::default())
                    .await
                    .map(|_| ())
            })
        }),
    )
    .unwrap();
    reporter.error(CallErrorCode::MediaTimeout);
    tokio::time::timeout(Duration::from_secs(1), async {
        while !reporter.stopped() {
            tokio::task::yield_now().await;
        }
    })
    .await
    .unwrap();
    server.await.unwrap();
    reporter.error(CallErrorCode::Other);
}
