#![recursion_limit = "512"]
#[allow(dead_code)]
mod support;
use polymorfa_sdk::{analytics::*, ErrorKind, RequestOptions};
use serde_json::{json, Value};
const PROJECT: &str = "00000000-0000-0000-0000-000000000001";
fn outcomes() -> Value {
    json!({"total":2,"answered":1,"missed":1,"declined":0,"failed":0,"ringing":0,"answerRate":0.5,"talkSeconds":5.5,"timedAnswered":1,"timedPickup":1,"averageTalkSeconds":5.5,"medianTalkSeconds":5.5,"p95TalkSeconds":5.5,"averagePickupMs":1000.5,"p95PickupMs":1000.5,"shortAnswered":1,"video":0})
}
fn metrics() -> Value {
    let mut calls = outcomes();
    calls.as_object_mut().unwrap().extend(json!({"directions":{"inbound":outcomes(),"outbound":outcomes()},"mediaQuality":{"measuredCalls":1,"averageJitterMs":1.5,"averageRttMs":5.5,"packetsLost":1},"appQuality":{"measuredCalls":1,"averageJitterMs":1.5,"averageRttMs":5.5,"packetLossRate":0.01,"reconnects":1},"endReasons":[{"code":"user_hangup","count":1}],"appErrors":[{"code":"media_connection_failed","count":1}],"transports":[{"code":"socket","count":1}],"multiParticipantCalls":0,"followUp":{"eligibleMissed":1,"returnedWithin24h":1,"rate":1.0,"averageDelayMs":1000.5,"pendingWindow":0,"unknownContact":0}}).as_object().unwrap().clone());
    json!({"recipientActivity":{"measured":true,"complete":true,"observedBuckets":1,"droppedSignals":0,"truncated":false,"rows":[{"ts":1000,"recipientCountry":"US","recipientDeviceCount":"one_linked","deviceSource":"linked","incomingMessages":1,"deliveryReceipts":1,"readReceipts":1,"onlineSignals":1,"offlineSignals":0,"typingSignals":1,"lastSignalAt":1000,"quietGaps":1,"quietGapMs":2000,"averageQuietGapMs":2000.0}]},"deviceAnalytics":{"detector":"message_id_prefix/v1","measured":true,"complete":true,"observedBuckets":1,"customerMessages":1,"accountMessages":1,"customerPlatforms":[{"platform":"android","messages":1,"share":1.0}],"accountPlatforms":[{"platform":"web","messages":1,"share":1.0}],"inventory":{"listObserved":true,"listCurrent":true,"observedAt":1000,"deviceCount":1,"truncated":false,"devices":[{"deviceIndex":1,"estimatedPlatform":"web","reportedClass":"browser","lastActiveAt":1000,"listed":true}]}},"conversationBreakdown":{"measured":true,"complete":true,"observedBuckets":1,"droppedConversations":0,"truncated":false,"buckets":[{"ts":1000,"complete":true}],"rows":[{"recipientCountry":"US","recipientDeviceCount":"one_linked","ts":1000,"messageType":"text","textBand":"short","origin":"api","callingCode":"1","customerDevices":"multiple","completedConversations":1,"deliveredConversations":1,"readConversations":1,"repliedConversations":1,"replyLatencySumMs":1000.5,"readRate":1.0,"replyRate":1.0,"averageCustomerReplyMs":1000.5}]},"calls":calls,"measured":true,"observedHours":24,"lastObservedAt":1000,"outgoingMessages":1,"incomingMessages":1,"sendAttempts":1,"sendFailures":0,"sendFailureRate":0.0,"businessReplies":1,"averageBusinessResponseMs":1000.5,"onlineMs":5000,"disconnects":0,"connectFailures":0,"streamErrors":0,"keepaliveTimeouts":0,"engagement":{"windowHours":24,"completedConversations":1,"deliveredConversations":1,"readConversations":1,"repliedConversations":1,"deliveryRate":1.0,"readRate":1.0,"replyRate":1.0,"averageCustomerReplyMs":1000.5,"complete":true,"droppedConversations":0,"droppedRecords":0,"droppedReceiptJoins":0},"messageAnalysis":{"complete":true,"segments":[{"dimension":"message_type","key":"text","sendAttempts":1,"sent":1,"sendFailures":0,"sendFailureRate":0.0,"completedConversations":1,"deliveredConversations":1,"readConversations":1,"repliedConversations":1,"deliveryRate":1.0,"readRate":1.0,"replyRate":1.0,"averageCustomerReplyMs":1000.5,"readRateInterval95":[0.5,1.0],"replyRateInterval95":[0.5,1.0],"readRateDifference":0.1,"replyRateDifference":0.1,"shareOfConversations":1.0,"shareOfSends":1.0}]},"customerActivity":{"observed":true,"onlineSignals":1,"offlineSignals":0,"typingSignals":1},"accountActivity":{"observed":true,"primaryPhoneActivitySignals":1,"primaryPhoneActivePeriods":1,"completedPhoneActivityPeriods":1,"phoneActivityMs":1000,"averagePhoneActivityMs":1000.0,"phoneQuietGaps":1,"phoneQuietMs":2000,"averagePhoneQuietMs":2000.0,"primaryPhoneMessages":1,"otherDeviceMessages":0,"primaryPhoneReplies":1,"otherDeviceReplies":0,"averagePrimaryPhoneResponseMs":1000.5,"averageOtherDeviceResponseMs":null,"lastPrimaryPhoneAt":1000},"responseQueue":{"awaitingReply":1,"oldestWaitingMs":1000,"observedAt":1000,"complete":true}})
}
fn analytics() -> Value {
    let mut summary = metrics();
    summary.as_object_mut().unwrap().extend(
        json!({"totalNumbers":1,"measuredNumbers":1,"connectedNumbers":1})
            .as_object()
            .unwrap()
            .clone(),
    );
    let mut number = metrics();
    number.as_object_mut().unwrap().extend(json!({"sessionId":"sid","projectId":PROJECT,"projectName":"project","name":"support","backend":"linked_device","status":"connected"}).as_object().unwrap().clone());
    let mut call = outcomes();
    call["sessionId"] = json!("sid");
    call["ts"] = json!(1000);
    json!({"callSeries":[call],"enabled":true,"period":{"start":0,"end":1000},"requestVitals":{"requests":1,"failures":0,"errorRate":0.0},"summary":summary,"numbers":[number],"series":[{"customerOnlineSignals":1,"customerTypingSignals":1,"primaryPhoneMessages":1,"otherDeviceMessages":0,"primaryPhoneReplies":1,"phoneActivePeriods":1,"completedPhoneActivityPeriods":1,"phoneActivityMs":1000,"phoneQuietGaps":1,"phoneQuietMs":2000,"sessionId":"sid","ts":1000,"outgoingMessages":1,"incomingMessages":1,"sendFailures":0,"businessReplies":1,"averageBusinessResponseMs":1000.5,"onlineMs":5000,"disconnects":0}]})
}
#[tokio::test]
async fn organization_and_project_typed_aggregate_breakdowns_native_wire() {
    wire_unwrapped_organization!(
        client,
        "GET",
        "/platform/analytics?end=1000&projectId=00000000-0000-0000-0000-000000000001&start=0",
        None,
        json!({"data":analytics()}),
        client.analytics().get(
            &AnalyticsParameters {
                project_id: Some(PROJECT.into()),
                session_id: None,
                start: Some(0),
                end: Some(1000)
            },
            RequestOptions::default()
        )
    );
    wire_unwrapped_organization!(
        client,
        "GET",
        "/platform/projects/00000000-0000-0000-0000-000000000001/analytics?end=1000&start=0",
        None,
        json!({"data":analytics()}),
        client.project(PROJECT).unwrap().analytics().get(
            &AnalyticsParameters {
                project_id: Some(PROJECT.into()),
                session_id: None,
                start: Some(0),
                end: Some(1000)
            },
            RequestOptions::default()
        )
    );
    wire_unwrapped_organization!(
        client,
        "GET",
        "/platform/analytics",
        None,
        json!({"data":{"callSeries":[],"enabled":false,"period":{"start":0,"end":1000},"requestVitals":{"requests":0,"failures":0,"errorRate":null},"summary":null,"numbers":[],"series":[]}}),
        client
            .analytics()
            .get(&Default::default(), Default::default())
    );
    let client = support::organization("http://127.0.0.1:1".into())
        .project(PROJECT)
        .unwrap();
    assert_eq!(
        client
            .analytics()
            .get(
                &AnalyticsParameters {
                    project_id: Some("00000000-0000-0000-0000-000000000002".into()),
                    ..Default::default()
                },
                Default::default()
            )
            .await
            .unwrap_err()
            .kind,
        ErrorKind::Validation
    );
    assert!(client
        .analytics()
        .get(
            &AnalyticsParameters {
                start: Some(2),
                end: Some(1),
                ..Default::default()
            },
            Default::default()
        )
        .await
        .is_err());
    assert!(client
        .analytics()
        .metrics(
            &MetricsParameters {
                window_hours: Some(169),
                ..Default::default()
            },
            Default::default()
        )
        .await
        .is_err());
}
async fn server(
    path: &'static str,
    mime: &'static str,
    body: &'static str,
) -> (String, tokio::task::JoinHandle<()>) {
    use tokio::{
        io::{AsyncReadExt, AsyncWriteExt},
        net::TcpListener,
    };
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    let task = tokio::spawn(async move {
        let (mut socket, _) = listener.accept().await.unwrap();
        let mut bytes = vec![0; 8192];
        let n = socket.read(&mut bytes).await.unwrap();
        let head = String::from_utf8_lossy(&bytes[..n]);
        assert_eq!(
            head.lines().next(),
            Some(format!("GET {path} HTTP/1.1").as_str())
        );
        assert!(head.contains("Bearer pmfa_"));
        socket.write_all(format!("HTTP/1.1 200 OK\r\nContent-Type: {mime}\r\nContent-Length: {}\r\nX-Request-ID: analytics\r\nConnection: close\r\n\r\n{body}",body.len()).as_bytes()).await.unwrap();
    });
    (format!("http://{addr}"), task)
}
#[tokio::test]
async fn collector_prometheus_openmetrics_and_invalid_content_native_wire() {
    let (base, task) = server(
        "/platform/analytics/metrics?format=prometheus&segments=true&windowHours=24",
        "text/plain; charset=utf-8",
        "# TYPE polymorfa_analytics_enabled gauge\npolymorfa_analytics_enabled 1\n",
    )
    .await;
    let client = support::organization(base);
    let v = client
        .analytics()
        .metrics(
            &MetricsParameters {
                segments: Some(true),
                window_hours: Some(24),
                ..Default::default()
            },
            Default::default(),
        )
        .await
        .unwrap();
    assert!(v.data.ends_with(" 1\n"));
    assert_eq!(v.metadata.request_id.as_deref(), Some("analytics"));
    task.await.unwrap();
    let(base,task)=server("/platform/projects/00000000-0000-0000-0000-000000000001/analytics/metrics?format=openmetrics","application/openmetrics-text; version=1.0.0","# TYPE polymorfa_analytics_enabled gauge\npolymorfa_analytics_enabled 0\n# EOF\n").await;
    let client = support::organization(base).project(PROJECT).unwrap();
    let v = client
        .analytics()
        .metrics(
            &MetricsParameters {
                project_id: Some(PROJECT.into()),
                format: Some(MetricsFormat::Openmetrics),
                ..Default::default()
            },
            Default::default(),
        )
        .await
        .unwrap();
    assert!(v.data.ends_with("# EOF\n"));
    task.await.unwrap();
    let (base, task) = server(
        "/platform/analytics/metrics?format=openmetrics",
        "application/openmetrics-text",
        "# TYPE polymorfa_analytics_enabled gauge\n",
    )
    .await;
    let client = support::organization(base);
    let error = client
        .analytics()
        .metrics(
            &MetricsParameters {
                format: Some(MetricsFormat::Openmetrics),
                ..Default::default()
            },
            Default::default(),
        )
        .await
        .unwrap_err();
    assert_eq!(error.code.as_deref(), Some("invalid_response"));
    assert_eq!(error.request_id.as_deref(), Some("analytics"));
    task.await.unwrap();
}
