#[allow(dead_code)]
mod support;
use polymorfa_sdk::{voip::*, RequestOptions};
use serde_json::json;

#[tokio::test]
async fn voip_call_control_wire_contracts() {
    let place = PlaceCallRequest {
        destination: CallDestination::To {
            to: "+15551234567".into(),
        },
        session: Some("s".into()),
        video: Some(false),
        exclusive: None,
        participant: Some("bot".into()),
    };
    wire_messaging!(
        client,
        "POST",
        "/messaging/voip/calls",
        Some(json!({"to":"+15551234567","session":"s","video":false,"participant":"bot"})),
        json!({"success":true,"data":{"callId":"call","session":"s","video":false}}),
        client.voip().place(&place, RequestOptions::default())
    );
    wire_messaging!(
        client,
        "POST",
        "/messaging/voip/calls/call%2Fone/accept",
        Some(json!({"exclusive":true,"participant":"bot"})),
        json!({"success":true,"data":{"answered":true,"answeredBy":"bot","exclusive":true}}),
        client.voip().accept(
            "call/one",
            &AcceptCallRequest {
                exclusive: Some(true),
                participant: Some("bot".into()),
                video: None
            },
            RequestOptions::default()
        )
    );
    wire_messaging!(
        client,
        "POST",
        "/messaging/voip/calls/call/reject",
        None,
        json!({"success":true}),
        client.voip().reject(
            "call",
            &RejectCallRequest::default(),
            RequestOptions::default()
        )
    );
    wire_messaging!(
        client,
        "POST",
        "/messaging/voip/calls/call/leave",
        Some(json!({"connectionId":"connection_01","participant":"bot"})),
        json!({"success":true}),
        client.voip().leave(
            "call",
            &LeaveCallRequest {
                connection_id: "connection_01".into(),
                participant: Some("bot".into())
            },
            RequestOptions::default()
        )
    );
    wire_messaging!(
        client,
        "DELETE",
        "/messaging/voip/calls/call",
        None,
        json!({"success":true}),
        client.voip().end("call", RequestOptions::default())
    );
    wire_messaging!(
        client,
        "POST",
        "/messaging/voip/calls/call/participants",
        Some(json!({"to":"+15551234567"})),
        json!({"success":true,"data":{"id":"user","audioMuted":false,"video":false,"state":"invited","phoneNumber":"+15551234567","handRaised":false}}),
        client.voip().add_participant(
            "call",
            &AddParticipantRequest {
                to: "+15551234567".into()
            },
            RequestOptions::default()
        )
    );
    wire_messaging!(
        client,
        "POST",
        "/messaging/voip/calls/call/participants/ring",
        Some(json!({"to":"+15551234567"})),
        json!({"success":true}),
        client.voip().ring_participant(
            "call",
            &AddParticipantRequest {
                to: "+15551234567".into()
            },
            RequestOptions::default()
        )
    );
    wire_messaging!(
        client,
        "POST",
        "/messaging/voip/calls/call/reaction",
        Some(json!({"connectionId":"connection_01","participant":"bot","emoji":"👍"})),
        json!({"success":true}),
        client.voip().send_reaction(
            "call",
            &CallReactionRequest {
                connection_id: "connection_01".into(),
                participant: Some("bot".into()),
                emoji: "👍".into()
            },
            RequestOptions::default()
        )
    );
    wire_messaging!(
        client,
        "POST",
        "/messaging/voip/calls/call/hand",
        Some(json!({"connectionId":"connection_01","raised":true})),
        json!({"success":true}),
        client.voip().set_hand_raised(
            "call",
            &HandRaisedRequest {
                connection_id: "connection_01".into(),
                participant: None,
                raised: true
            },
            RequestOptions::default()
        )
    );
    let report = CallReportRequest {
        connection_id: "connection_01".into(),
        participant: None,
        client: Some(CallReportClient {
            sdk: "polymorfa-sdk".into(),
            version: "0.1.0-dev.0".into(),
            platform: "other".into(),
        }),
        details: CallReportDetails::Quality {
            quality: CallQuality {
                rtt_ms: Some(31),
                candidate_type: Some("relay".into()),
                ..CallQuality::default()
            },
        },
    };
    wire_messaging!(
        client,
        "POST",
        "/messaging/voip/calls/call/reports",
        Some(
            json!({"connectionId":"connection_01","client":{"sdk":"polymorfa-sdk","version":"0.1.0-dev.0","platform":"other"},"kind":"quality","quality":{"rttMs":31,"candidateType":"relay"}})
        ),
        json!({"success":true}),
        client
            .voip()
            .report("call", &report, RequestOptions::default())
    );
}

#[tokio::test]
async fn voip_link_permission_settings_wire_contracts() {
    wire_messaging!(
        client,
        "POST",
        "/messaging/voip/call-links",
        Some(json!({"session":"s","video":true})),
        json!({"success":true,"data":{"session":"s","token":"private_token","url":"https://call.whatsapp.com/private_token","video":true}}),
        client.voip().create_call_link(
            &CreateCallLinkRequest {
                session: "s".into(),
                video: Some(true)
            },
            RequestOptions::default()
        )
    );
    wire_messaging!(
        client,
        "POST",
        "/messaging/voip/call-links/preview",
        Some(json!({"session":"s","token":"private_token","video":true})),
        json!({"success":true,"data":{"session":"s","video":true,"creator":{"id":"creator"},"approvalRequired":false,"isAdmin":true}}),
        client.voip().preview_call_link(
            &PreviewCallLinkRequest {
                session: "s".into(),
                token: "private_token".into(),
                video: Some(true)
            },
            RequestOptions::default()
        )
    );
    let settings = json!({"callsEnabled":true,"conferenceMode":false,"inboundRoute":"clients","sipTrunkId":null,"sipClaim":true,"hostCloudApiCalls":false,"revision":1,"updatedAt":"2026-10-11T12:00:00Z"});
    wire_messaging!(
        client,
        "GET",
        "/platform/sessions/s/call-settings",
        None,
        json!({"success":true,"data":settings}),
        client
            .voip()
            .retrieve_call_settings("s", RequestOptions::default())
    );
    wire_messaging!(
        client,
        "PUT",
        "/platform/sessions/s/call-settings",
        Some(json!({"conferenceMode":false,"sipTrunkId":null,"expectedRevision":0})),
        json!({"success":true,"data":settings}),
        client.voip().update_call_settings(
            "s",
            &UpdateSessionCallSettingsRequest {
                conference_mode: Some(false),
                sip_trunk_id: Some(None),
                expected_revision: Some(0),
                ..UpdateSessionCallSettingsRequest::default()
            },
            RequestOptions::default()
        )
    );
    let permission = json!({"status":"temporary","expiresAt":"2026-10-12T12:00:00Z","source":"sync","updatedAt":"2026-10-11T12:00:00Z","checkedAt":"2026-10-11T12:00:00Z","fresh":true,"actions":{"requestPermission":{"allowed":false,"limits":[{"period":"PT24H","maxAllowed":1,"used":1,"resetsAt":null}]},"startCall":{"allowed":true,"limits":[]}}});
    let mut record = permission.clone();
    record["conversation"] = json!({"id":"user"});
    wire_messaging!(
        client,
        "GET",
        "/messaging/s/call-permissions/%2B15551234567",
        None,
        json!({"success":true,"data":record}),
        client
            .voip()
            .retrieve_call_permission("s", "+15551234567", RequestOptions::default())
    );
    wire_messaging!(
        client,
        "POST",
        "/messaging/voip/calls/check",
        Some(json!({"session":"s","to":"+15551234567"})),
        json!({"success":true,"data":{"allowed":true,"refusal":null,"permission":permission}}),
        client.voip().check(
            &CheckCallRequest {
                session: "s".into(),
                to: "+15551234567".into()
            },
            RequestOptions::default()
        )
    );
}

#[tokio::test]
async fn voip_validation_prevents_invalid_network_requests() {
    let client = support::messaging("http://localhost:1".into());
    for to in ["", "+0", "12345678901234567890", "+1555@server", "012345"] {
        let body = PlaceCallRequest {
            destination: CallDestination::To { to: to.into() },
            session: Some("s".into()),
            video: None,
            exclusive: None,
            participant: None,
        };
        assert_eq!(
            client
                .voip()
                .place(&body, RequestOptions::default())
                .await
                .unwrap_err()
                .kind,
            polymorfa_sdk::ErrorKind::Configuration
        );
    }
    let body = CallReportRequest {
        connection_id: "connection_01".into(),
        participant: None,
        client: Some(CallReportClient {
            sdk: "polymorfa-sdk".into(),
            version: "1.2.3-".into(),
            platform: "other".into(),
        }),
        details: CallReportDetails::Quality {
            quality: CallQuality {
                rtt_ms: Some(31),
                ..CallQuality::default()
            },
        },
    };
    assert_eq!(
        client
            .voip()
            .report("call", &body, RequestOptions::default())
            .await
            .unwrap_err()
            .kind,
        polymorfa_sdk::ErrorKind::Configuration
    );
}
