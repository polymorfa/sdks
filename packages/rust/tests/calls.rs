#[allow(dead_code)]
mod support;
use futures_util::{SinkExt, StreamExt};
use polymorfa_sdk::{calls::*, calls_protocol::*, ErrorKind, RequestOptions};
use serde_json::json;
use tokio::net::TcpListener;
use tokio_tungstenite::{
    accept_hdr_async,
    tungstenite::{
        handshake::server::{Request, Response},
        Message,
    },
};
use tokio_util::sync::CancellationToken;

#[tokio::test]
async fn server_call_control_native_http_contracts() {
    let body = PlaceCallRequest {
        session: "s".into(),
        to: "+15551234567".into(),
        video: false,
        participants: None,
        group_id: None,
        exclusive: None,
        participant: Some("bot".into()),
    };
    let (base, server) = support::wire(
        "POST",
        "/messaging/voip/calls",
        Some(json!({"session":"s","to":"+15551234567","video":false,"participant":"bot"})),
        json!({"success":true,"data":{"callId":"call","session":"s","video":false}}),
    )
    .await;
    let client = support::messaging(base);
    let response = client
        .calls()
        .place(
            &body,
            RequestOptions {
                idempotency_key: Some("call-once".into()),
                ..RequestOptions::default()
            },
        )
        .await
        .unwrap();
    assert_eq!(response.data.call_id, "call");
    server.await.unwrap();
    let (base, server) = support::wire(
        "POST",
        "/messaging/voip/calls/call/accept",
        Some(json!({"exclusive":false})),
        json!({"success":true,"data":{"answered":true,"answeredBy":"default","exclusive":false}}),
    )
    .await;
    assert!(
        support::messaging(base)
            .calls()
            .accept(
                "call",
                &AcceptCallRequest::default(),
                RequestOptions::default()
            )
            .await
            .unwrap()
            .data
            .answered
    );
    server.await.unwrap();
    wire_messaging!(
        client,
        "POST",
        "/messaging/voip/calls/call/reject",
        None,
        json!({"success":true}),
        client
            .calls()
            .reject("call", None, RequestOptions::default())
    );
    wire_messaging!(
        client,
        "POST",
        "/messaging/voip/calls/call/leave",
        Some(json!({"connectionId":"connection_01"})),
        json!({"success":true}),
        client
            .calls()
            .leave("call", "connection_01", None, RequestOptions::default())
    );
    wire_messaging!(
        client,
        "DELETE",
        "/messaging/voip/calls/call",
        None,
        json!({"success":true}),
        client.calls().end("call", RequestOptions::default())
    );
    let (base,server)=support::wire("POST","/messaging/voip/calls/call/participants",Some(json!({"to":"+15551234567"})),json!({"success":true,"data":{"id":"123","audioMuted":false,"video":false,"state":"invited"}})).await;
    assert_eq!(
        support::messaging(base)
            .calls()
            .add_participant("call", "+15551234567", RequestOptions::default())
            .await
            .unwrap()
            .data
            .id,
        "123"
    );
    server.await.unwrap();
    wire_messaging!(
        client,
        "POST",
        "/messaging/voip/calls/call/participants/ring",
        Some(json!({"to":"+15551234567"})),
        json!({"success":true}),
        client
            .calls()
            .ring_participant("call", "+15551234567", RequestOptions::default())
    );
    wire_messaging!(
        client,
        "POST",
        "/messaging/s/calls/call/reject",
        Some(json!({"from":"123"})),
        json!({"success":true}),
        client
            .calls()
            .reject_incoming("s", "call", "123", RequestOptions::default())
    );
}

#[tokio::test]
async fn media_socket_authentication_audio_video_controls_and_cancellation() {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let base = format!("http://{}", listener.local_addr().unwrap());
    let server = tokio::spawn(async move {
        let (socket, _) = listener.accept().await.unwrap();
        let mut ws = accept_hdr_async(socket, |req: &Request, mut response: Response| {
            assert_eq!(req.uri().to_string(), "/voip/calls/call%2Fone/media");
            assert!(req.headers().get("authorization").is_none());
            assert_eq!(req.headers()["sec-websocket-protocol"], "pmfa.calls.v2");
            response
                .headers_mut()
                .insert("sec-websocket-protocol", "pmfa.calls.v2".parse().unwrap());
            Ok(response)
        })
        .await
        .unwrap();
        let auth = ws.next().await.unwrap().unwrap();
        assert_eq!(
            serde_json::from_str::<serde_json::Value>(auth.to_text().unwrap()).unwrap(),
            json!({"type":"auth","token":format!("pmfa_{}","a".repeat(72)),"connectionId":"connection_01","participant":"bot"})
        );
        ws.send(Message::Text(json!({"type":"ready","callId":"call/one","connectionId":"connection_01","sampleRate":48000,"video":true}).to_string().into())).await.unwrap();
        let audio = ws.next().await.unwrap().unwrap().into_data();
        assert_eq!(audio.as_ref(), &[1, 0, 128, 255, 127, 255, 255, 1, 0]);
        let video = ws.next().await.unwrap().unwrap().into_data();
        assert_eq!(
            video.as_ref(),
            &[2, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 226, 64, 0, 0, 1, 103]
        );
        ws.send(Message::Binary(vec![1, 0, 128, 255, 127].into()))
            .await
            .unwrap();
        ws.send(Message::Binary(
            vec![2, 1, 0, 0, 0, 0, 7, 0, 0, 0, 0, 0, 0, 0, 42, 0, 0, 1, 101].into(),
        ))
        .await
        .unwrap();
        let state = ws.next().await.unwrap().unwrap();
        assert_eq!(
            serde_json::from_str::<serde_json::Value>(state.to_text().unwrap()).unwrap(),
            json!({"type":"media_state","requestId":"request_01","audioMuted":true})
        );
        ws.send(Message::Text(json!({"type":"media_state","requestId":"request_01","audioMuted":true,"videoEnabled":false}).to_string().into())).await.unwrap();
        ws.send(Message::Text(json!({"type":"video_source","source":7,"connectionId":"remote_01","connectionParticipant":"server:bot"}).to_string().into())).await.unwrap();
    });
    let client = support::messaging(base);
    let cancellation = CancellationToken::new();
    let mut media = client
        .calls()
        .open_media(
            "call/one",
            "connection_01",
            Some("bot"),
            cancellation.clone(),
        )
        .await
        .unwrap();
    assert_eq!(media.sample_rate, 48000);
    assert!(media.video);
    media.write_audio(&[-32768, 32767, -1, 1]).await.unwrap();
    media
        .write_video(&VideoFrame {
            keyframe: true,
            source: 0,
            timestamp_us: 123456,
            data: vec![0, 0, 1, 103],
        })
        .await
        .unwrap();
    assert!(
        matches!(media.read().await.unwrap(),Some(MediaFrame::Audio(pcm)) if pcm==vec![-32768,32767])
    );
    assert!(
        matches!(media.read().await.unwrap(),Some(MediaFrame::Video(frame)) if frame.source==7 && frame.timestamp_us==42 && !frame.keyframe)
    );
    media
        .set_media_state(
            "request_01",
            &MediaStateUpdate {
                audio_muted: Some(true),
                ..MediaStateUpdate::default()
            },
        )
        .await
        .unwrap();
    assert!(
        matches!(media.read().await.unwrap(),Some(MediaFrame::Control(MediaControlFrame::MediaState { request_id,audio_muted:true,.. })) if request_id=="request_01")
    );
    assert!(matches!(
        media.read().await.unwrap(),
        Some(MediaFrame::Control(MediaControlFrame::VideoSource {
            source: 7,
            ..
        }))
    ));
    cancellation.cancel();
    assert_eq!(media.read().await.unwrap_err().kind, ErrorKind::Cancelled);
    server.await.unwrap();
}

#[tokio::test]
async fn lifecycle_socket_authentication_candidates_events_and_revocation() {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let base = format!("http://{}", listener.local_addr().unwrap());
    let server = tokio::spawn(async move {
        let (socket, _) = listener.accept().await.unwrap();
        let mut ws = accept_hdr_async(socket, |req: &Request, response: Response| {
            assert_eq!(
                req.uri().to_string(),
                "/voip/ws?session=s%2Fone&participant=bot"
            );
            assert!(req.headers().get("authorization").is_none());
            Ok(response)
        })
        .await
        .unwrap();
        let auth = ws.next().await.unwrap().unwrap();
        assert_eq!(
            serde_json::from_str::<serde_json::Value>(auth.to_text().unwrap()).unwrap(),
            json!({"type":"auth","token":format!("pmfa_{}","a".repeat(72))})
        );
        ws.send(Message::Text(
            "{\"type\":\"ready\",\"session\":\"s/one\",\"participant\":\"server:bot\"}".into(),
        ))
        .await
        .unwrap();
        let candidate = ws.next().await.unwrap().unwrap();
        assert_eq!(
            serde_json::from_str::<serde_json::Value>(candidate.to_text().unwrap()).unwrap(),
            json!({"type":"candidate","callId":"call","connectionId":"connection_01","candidate":{"candidate":"candidate:1","sdpMid":"audio","sdpMLineIndex":0}})
        );
        ws.send(Message::Text("{\"type\":\"future_frame\"}".into()))
            .await
            .unwrap();
        ws.send(Message::Text(json!({"type":"event","event":"call.offer","callId":"call","timestamp":"2026-10-11T12:00:00Z","payload":{"direction":"incoming"}}).to_string().into())).await.unwrap();
        ws.close(Some(tokio_tungstenite::tungstenite::protocol::CloseFrame {
            code: 4401.into(),
            reason: "revoked".into(),
        }))
        .await
        .unwrap();
    });
    let client = support::messaging(base);
    let mut lifecycle = client
        .calls()
        .open_lifecycle("s/one", Some("bot"), CancellationToken::new())
        .await
        .unwrap();
    lifecycle
        .send_candidate(
            "call",
            "connection_01",
            &TrickleCandidate {
                candidate: "candidate:1".into(),
                sdp_mid: Some("audio".into()),
                sdp_m_line_index: Some(0),
            },
        )
        .await
        .unwrap();
    assert!(
        matches!(lifecycle.read().await.unwrap(),Some(LifecycleFrame::Event { call_id,event,.. }) if call_id=="call" && event=="call.offer")
    );
    assert_eq!(
        lifecycle.read().await.unwrap_err().kind,
        ErrorKind::Authentication
    );
    server.await.unwrap();
}

#[test]
fn media_protocol_rejects_invalid_known_and_future_frames() {
    assert_eq!(create_connection_id().len(), 24);
    for raw in [
        r#"{"type":"ready","sampleRate":0,"video":true}"#,
        r#"{"type":"media_state","requestId":"bad","audioMuted":false,"videoEnabled":false}"#,
        r#"{"type":"reaction","self":true,"participantId":"123","emoji":"👍"}"#,
        r#"{"type":"video_source","source":0,"connectionId":"connection_01"}"#,
        r#"{"type":"future"}"#,
    ] {
        assert!(parse_media_control(raw).is_none(), "{raw}");
    }
    assert!(decode_media(&[1, 0]).is_none());
    assert!(decode_media(&[2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1]).is_none());
}
