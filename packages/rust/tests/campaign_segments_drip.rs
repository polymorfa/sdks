//! Frequency caps, audience segments and drips against the pinned contracts.
//! Wire expectations come from contracts/campaign-frequency-cap.json,
//! contracts/campaign-segments-drip.json and the pinned TypeScript producer tests.
#[allow(dead_code)]
mod support;
use polymorfa_sdk::{
    audience_segments::*, campaign_contracts::CampaignRecipientFailureReason,
    campaign_contracts::CampaignRetargetOutcome, campaigns::*, ClientOptions, ErrorKind,
    MessagingClient, OrganizationClient, RequestOptions,
};
use serde_json::{json, Number, Value};
use std::sync::{
    atomic::{AtomicUsize, Ordering},
    Arc, Mutex,
};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::TcpListener,
};

const PROJECT: &str = "11111111-1111-4111-8111-111111111111";
const ID: &str = "22222222-2222-4222-8222-222222222222";

fn rules_json() -> Value {
    json!({"match":"all","groups":[{"match":"any","conditions":[{"field":"tag","operator":"contains","value":"vip"},{"field":"attribute","name":"spend","operator":"greater_than","value":100},{"field":"consent","operator":"equals","value":true}]}]})
}
fn rules() -> AudienceSegmentRules {
    AudienceSegmentRules {
        r#match: AudienceSegmentMatch::All,
        groups: vec![AudienceSegmentGroup {
            r#match: AudienceSegmentMatch::Any,
            negate: None,
            conditions: vec![
                AudienceSegmentCondition::TagContains {
                    value: "vip".into(),
                },
                AudienceSegmentCondition::AttributeCompare {
                    name: "spend".into(),
                    operator: AudienceSegmentCompareOperator::GreaterThan,
                    value: Number::from(100),
                },
                AudienceSegmentCondition::ConsentEquals { value: true },
            ],
        }],
    }
}
fn segment() -> Value {
    json!({"id":ID,"name":"VIP","revision":2,"rules":rules_json(),"createdAt":1,"updatedAt":2})
}
fn preview() -> Value {
    json!({"matchedCount":4,"optedOutCount":1,"consentWithheldCount":1,"eligibleCount":2,"sample":[{"phone":"+49*******12","tags":["vip"]}],"evaluatedAt":3})
}
fn campaign() -> Value {
    json!({"id":"c","name":"Campaign","status":"draft","templateId":null,"recipientListId":null,"recipientCount":0,"sentCount":0,"deliveredCount":0,"readCount":0,"failedCount":0,"skippedCount":0,"scheduledAt":null,"launchedAt":null,"completedAt":null,"createdAt":1,"updatedAt":2,"sendWindow":null,"experimentOutcome":null,"trackedLinks":[],"followUp":null,"frequencyCap":{"maxPer24Hours":2,"maxPer7Days":null},"drip":{"enrollment":"audience","exitOnReply":false,"exitOnLinkClick":true},"enrollmentOpen":false,"pauseReason":null,"segmentId":null,"segmentSnapshot":{"revision":3,"evaluatedAt":1,"matchedCount":4}})
}
fn drip_stats() -> Value {
    json!({"enrollment":"continuous","enrolled":3,"enrolledByApi":1,"active":1,"completed":1,"exited":1,"steps":[{"step":0,"entered":3,"waiting":1,"sent":2,"delivered":2,"read":1,"replied":1,"exited":1,"failed":0}]})
}
fn analytics() -> Value {
    json!({"campaignId":"c","recipientCount":1,"sentCount":0,"deliveredCount":0,"readCount":0,"failedCount":0,"skippedCount":1,"respondedCount":0,"responseRate":0.0,"averageResponseTimeMs":null,"minResponseTimeMs":null,"maxResponseTimeMs":null,"experiment":null,"followUps":{"total":0,"waiting":0,"scheduled":0,"sending":0,"sent":0,"delivered":0,"read":0,"replied":0,"cancelled":0,"expired":0,"failed":0,"unknown":0,"nextDueAt":null},"frequencyCap":{"skippedRecipientCount":3},"drip":drip_stats()})
}
fn recipient() -> Value {
    json!({"id":"r","phone":"+15551234567","variables":{},"variantKey":null,"status":"skipped","attempts":0,"lastError":"frequency_cap_exceeded","externalMessageId":null,"queuedAt":1,"sentAt":null,"deliveredAt":null,"readAt":null,"failedAt":null,"respondedAt":null,"messagesSent":1,"failureReason":"frequency_cap","nextMessageAt":null,"sequenceError":"link_clicked","followUp":null})
}
fn enrollment() -> Value {
    json!({"campaignId":ID,"recipientId":PROJECT,"phone":"+5511999990000","created":false,"status":"skipped","enrolledAt":1800000000000u64})
}
/// `enrolledAt` is a JSON number decoded as f64; the round-trip check compares
/// re-serialized values, so the wire fixture uses the float spelling.
fn enrollment_wire() -> Value {
    let mut v = enrollment();
    v["enrolledAt"] = json!(1800000000000.0);
    v
}
fn limits() -> CampaignFrequencyCap {
    CampaignFrequencyCap {
        max_per_24_hours: Some(2),
        max_per_7_days: Some(5),
    }
}
fn project() -> PlatformCampaignParameters {
    PlatformCampaignParameters {
        project_id: PROJECT.into(),
    }
}

#[tokio::test]
async fn frequency_cap_reads_replaces_and_removes_with_observed_revision() {
    let settings = json!({"data":{"teamId":PROJECT,"maxPer24Hours":2,"maxPer7Days":5,"revision":1,"updatedAt":null}});
    wire_organization!(
        client,
        "GET",
        "/platform/campaign-settings/frequency-cap",
        None,
        settings.clone(),
        client
            .campaigns()
            .get_frequency_cap(RequestOptions::default())
    );
    wire_organization!(
        client,
        "PUT",
        "/platform/campaign-settings/frequency-cap",
        Some(json!({"maxPer24Hours":2,"maxPer7Days":5,"revision":1})),
        json!({"data":{"teamId":PROJECT,"maxPer24Hours":2,"maxPer7Days":5,"revision":2,"updatedAt":1800000000000u64}}),
        client.campaigns().update_frequency_cap(
            &UpdateCampaignFrequencyCapRequest {
                max_per_24_hours: Some(2),
                max_per_7_days: Some(5),
                revision: 1
            },
            RequestOptions::default()
        )
    );
    wire_organization!(
        client,
        "PUT",
        "/platform/campaign-settings/frequency-cap",
        Some(json!({"maxPer24Hours":null,"maxPer7Days":null,"revision":2})),
        json!({"data":{"teamId":PROJECT,"maxPer24Hours":null,"maxPer7Days":null,"revision":3,"updatedAt":1800000000000u64}}),
        client.campaigns().update_frequency_cap(
            &UpdateCampaignFrequencyCapRequest {
                max_per_24_hours: None,
                max_per_7_days: None,
                revision: 2
            },
            RequestOptions::default()
        )
    );
}

#[tokio::test]
async fn frequency_cap_fields_reasons_and_analytics_on_both_surfaces() {
    let cap = Some(Some(limits()));
    wire_organization!(
        client,
        "POST",
        "/platform/campaigns",
        Some(json!({"projectId":PROJECT,"name":"cap","frequencyCap":{"maxPer24Hours":2,"maxPer7Days":5}})),
        json!({"data":campaign()}),
        client.campaigns().create(
            &serde_json::from_value::<CreatePlatformCampaignRequest>(json!({"projectId":PROJECT,"name":"cap","frequencyCap":{"maxPer24Hours":2,"maxPer7Days":5}})).unwrap(),
            RequestOptions::default()
        )
    );
    let update = UpdatePlatformCampaignRequest {
        changes: UpdateCampaignRequest {
            frequency_cap: Some(None),
            ..Default::default()
        },
        ..Default::default()
    };
    wire_organization!(
        client,
        "PATCH",
        &format!("/platform/campaigns/c?projectId={PROJECT}"),
        Some(json!({"frequencyCap":null})),
        json!({"data":campaign()}),
        client
            .campaigns()
            .update("c", Some(&update), &project(), RequestOptions::default())
    );
    wire_messaging!(
        client,
        "POST",
        &format!("/messaging/projects/{PROJECT}/campaigns"),
        Some(json!({"name":"cap","frequencyCap":{"maxPer24Hours":2,"maxPer7Days":5}})),
        json!({"success":true,"data":campaign()}),
        client.campaigns().create(
            PROJECT,
            &serde_json::from_value::<CreateCampaignRequest>(
                json!({"name":"cap","frequencyCap":{"maxPer24Hours":2,"maxPer7Days":5}})
            )
            .unwrap(),
            RequestOptions::default()
        )
    );
    wire_messaging!(
        client,
        "PATCH",
        &format!("/messaging/projects/{PROJECT}/campaigns/c"),
        Some(json!({"frequencyCap":{"maxPer24Hours":2,"maxPer7Days":5}})),
        json!({"success":true,"data":campaign()}),
        client.campaigns().update(
            PROJECT,
            "c",
            &UpdateCampaignRequest {
                frequency_cap: cap.clone(),
                ..Default::default()
            },
            RequestOptions::default()
        )
    );
    let reason = ListCampaignRecipientsParameters {
        status: Some(CampaignRecipientStatus::Skipped),
        reason: Some(CampaignRecipientFailureReason::FrequencyCap),
        ..Default::default()
    };
    wire_messaging!(
        client,
        "GET",
        &format!("/messaging/projects/{PROJECT}/campaigns/c/recipients?reason=frequency_cap&status=skipped"),
        None,
        json!({"success":true,"data":[recipient()],"page":{"nextCursor":null,"hasMore":false}}),
        client
            .campaigns()
            .list_recipients(PROJECT, "c", &reason, RequestOptions::default())
    );
    wire_organization!(
        client,
        "GET",
        &format!("/platform/campaigns/c/recipients?projectId={PROJECT}&reason=frequency_cap&status=skipped"),
        None,
        json!({"data":[recipient()],"page":{"nextCursor":null,"hasMore":false}}),
        client.campaigns().recipients(
            "c",
            &ListPlatformCampaignRecipientsParameters {
                project_id: PROJECT.into(),
                reason: Some(CampaignRecipientFailureReason::FrequencyCap),
                status: Some(CampaignRecipientStatus::Skipped),
                cursor: None,
                limit: None
            },
            RequestOptions::default()
        )
    );
    wire_organization!(
        client,
        "GET",
        &format!("/platform/campaigns/c/analytics?projectId={PROJECT}"),
        None,
        json!({"data":analytics()}),
        client
            .campaigns()
            .analytics("c", &project(), RequestOptions::default())
    );
    wire_messaging!(
        client,
        "GET",
        &format!("/messaging/projects/{PROJECT}/campaigns/c/analytics"),
        None,
        json!({"success":true,"data":analytics()}),
        client
            .campaigns()
            .analytics(PROJECT, "c", RequestOptions::default())
    );
    // Typed decoding, not only round-trip preservation.
    let typed: Campaign = serde_json::from_value(campaign()).unwrap();
    let cap = typed.frequency_cap.clone().flatten().unwrap();
    assert_eq!((cap.max_per_24_hours, cap.max_per_7_days), (Some(2), None));
    assert!(!typed.extensions.contains_key("frequencyCap"));
    let stats: CampaignAnalytics = serde_json::from_value(analytics()).unwrap();
    assert_eq!(stats.frequency_cap.unwrap().skipped_recipient_count, 3);
    let r: CampaignRecipient = serde_json::from_value(recipient()).unwrap();
    assert_eq!(
        r.failure_reason,
        Some(CampaignRecipientFailureReason::FrequencyCap)
    );
}

#[tokio::test]
async fn audience_segments_wire_revisions_pagination_and_previews() {
    wire_organization!(
        client,
        "GET",
        "/platform/audience-segments?limit=10&cursor=next",
        None,
        json!({"data":[segment()],"page":{"hasMore":false,"nextCursor":null}}),
        client.audience_segments().list(
            &ListAudienceSegmentsParameters {
                limit: Some(10),
                cursor: Some("next".into())
            },
            RequestOptions::default()
        )
    );
    wire_organization!(
        client,
        "GET",
        "/platform/audience-segments/s%2F1",
        None,
        json!({"data":segment()}),
        client
            .audience_segments()
            .retrieve("s/1", RequestOptions::default())
    );
    wire_organization!(
        client,
        "POST",
        "/platform/audience-segments",
        Some(json!({"name":"VIP","rules":rules_json()})),
        json!({"data":segment()}),
        client.audience_segments().create(
            &CreateAudienceSegmentRequest {
                name: "VIP".into(),
                rules: rules()
            },
            RequestOptions::default()
        )
    );
    wire_organization!(
        client,
        "PATCH",
        "/platform/audience-segments/s",
        Some(json!({"expectedRevision":1,"rules":rules_json()})),
        json!({"data":segment()}),
        client.audience_segments().update(
            "s",
            &UpdateAudienceSegmentRequest {
                expected_revision: 1,
                name: None,
                rules: Some(rules())
            },
            RequestOptions::default()
        )
    );
    let mut saved = preview();
    saved["revision"] = json!(2);
    wire_organization!(
        client,
        "GET",
        "/platform/audience-segments/s/preview",
        None,
        json!({"data":saved}),
        client
            .audience_segments()
            .preview("s", RequestOptions::default())
    );
    wire_organization!(
        client,
        "POST",
        "/platform/audience-segments/preview",
        Some(json!({"rules":rules_json()})),
        json!({"data":preview()}),
        client
            .audience_segments()
            .preview_rules(&rules(), RequestOptions::default())
    );
    wire_organization!(
        client,
        "DELETE",
        "/platform/audience-segments/s?expectedRevision=2",
        None,
        json!({"data":{"deleted":true,"id":ID}}),
        client
            .audience_segments()
            .delete("s", 2, RequestOptions::default())
    );
    let decoded: AudienceSegment = serde_json::from_value(segment()).unwrap();
    assert!(matches!(
        &decoded.rules.groups[0].conditions[1],
        AudienceSegmentCondition::AttributeCompare { name, operator: AudienceSegmentCompareOperator::GreaterThan, value } if name == "spend" && value == &Number::from(100)
    ));
}

#[test]
fn audience_segment_conditions_round_trip_and_preserve_unknown_reads() {
    let all = json!({"match":"any","groups":[{"match":"all","negate":true,"conditions":[{"field":"tag","operator":"in","values":["a","b"]},{"field":"tag","operator":"exists"},{"field":"attribute","name":"flag","operator":"equals","value":false},{"field":"attribute","name":"zero","operator":"equals","value":0},{"field":"attribute","name":"city","operator":"contains","value":"São"},{"field":"attribute","name":"since","operator":"before","value":"2026-01-01"},{"field":"attribute","name":"tier","operator":"in","values":["gold",2]},{"field":"attribute","name":"spend","operator":"less_than","value":1.5},{"field":"attribute","name":"email","operator":"exists"},{"field":"consent","operator":"equals","value":false},{"field":"campaign","campaignId":ID,"outcome":"not_replied"}]}]});
    let typed: AudienceSegmentRules = serde_json::from_value(all.clone()).unwrap();
    assert!(matches!(
        typed.groups[0].conditions[10],
        AudienceSegmentCondition::Campaign {
            outcome: CampaignRetargetOutcome::NotReplied,
            ..
        }
    ));
    assert_eq!(serde_json::to_value(&typed).unwrap(), all);
    let future = json!({"match":"all","groups":[{"match":"all","conditions":[{"field":"future","operator":"magic","value":1}]}]});
    let typed: AudienceSegmentRules = serde_json::from_value(future.clone()).unwrap();
    assert!(matches!(
        typed.groups[0].conditions[0],
        AudienceSegmentCondition::Unknown(_)
    ));
    assert_eq!(serde_json::to_value(&typed).unwrap(), future);
}

/// A loopback server that answers every request with one response and counts them.
async fn counting(status: u16, body: Value) -> (String, Arc<AtomicUsize>, Arc<Mutex<Vec<String>>>) {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let base = format!("http://{}", listener.local_addr().unwrap());
    let count = Arc::new(AtomicUsize::new(0));
    let heads = Arc::new(Mutex::new(Vec::new()));
    let (c, h) = (count.clone(), heads.clone());
    tokio::spawn(async move {
        loop {
            let Ok((mut socket, _)) = listener.accept().await else {
                return;
            };
            let mut bytes = Vec::new();
            let mut buf = [0u8; 4096];
            while !bytes.windows(4).any(|w| w == b"\r\n\r\n") {
                let n = socket.read(&mut buf).await.unwrap();
                if n == 0 {
                    break;
                }
                bytes.extend_from_slice(&buf[..n]);
            }
            c.fetch_add(1, Ordering::SeqCst);
            h.lock()
                .unwrap()
                .push(String::from_utf8_lossy(&bytes).to_ascii_lowercase());
            let encoded = body.to_string();
            let _ = socket.write_all(format!("HTTP/1.1 {status} Fixture\r\ncontent-type: application/json\r\nx-request-id: counted\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{encoded}", encoded.len()).as_bytes()).await;
        }
    });
    (base, count, heads)
}
fn retrying() -> ClientOptions {
    ClientOptions {
        max_network_retries: 2,
        ..ClientOptions::default()
    }
}

#[tokio::test]
async fn writes_previews_and_enrollment_are_sent_once_with_safe_errors() {
    for (status, code, kind) in [
        (409, "conflict", ErrorKind::Conflict),
        (403, "feature_unavailable", ErrorKind::Authorization),
        (409, "state_conflict", ErrorKind::Conflict),
        (503, "unavailable", ErrorKind::Server),
    ] {
        for call in 0..8 {
            let (base, count, heads) = counting(
                status,
                json!({"error":{"code":code,"message":"Unavailable, deleted segment or evaluation timeout"}}),
            )
            .await;
            let org = OrganizationClient::new(
                support::credential(),
                ClientOptions {
                    base_url: base.clone(),
                    ..retrying()
                },
            )
            .unwrap();
            let messaging = MessagingClient::new(
                support::credential(),
                ClientOptions {
                    base_url: base,
                    ..retrying()
                },
            )
            .unwrap();
            let caller = RequestOptions {
                headers: [("x-caller".to_owned(), "kept".to_owned())].into(),
                idempotency_key: (call == 7).then(|| "caller-key".to_owned()),
                ..Default::default()
            };
            let contact = EnrollCampaignContactRequest {
                phone: "+1".into(),
                variables: None,
            };
            let error = match call {
                0 => org
                    .campaigns()
                    .update_frequency_cap(
                        &UpdateCampaignFrequencyCapRequest {
                            max_per_24_hours: Some(1),
                            max_per_7_days: Some(1),
                            revision: 0,
                        },
                        caller,
                    )
                    .await
                    .map(|_| ()),
                1 => org
                    .audience_segments()
                    .update(
                        "s",
                        &UpdateAudienceSegmentRequest {
                            expected_revision: 2,
                            name: Some("new".into()),
                            rules: None,
                        },
                        caller,
                    )
                    .await
                    .map(|_| ()),
                2 => org
                    .audience_segments()
                    .create(
                        &CreateAudienceSegmentRequest {
                            name: "n".into(),
                            rules: rules(),
                        },
                        caller,
                    )
                    .await
                    .map(|_| ()),
                3 => org
                    .audience_segments()
                    .delete("s", 2, caller)
                    .await
                    .map(|_| ()),
                4 => org
                    .audience_segments()
                    .preview("s", caller)
                    .await
                    .map(|_| ()),
                5 => org
                    .audience_segments()
                    .preview_rules(&rules(), caller)
                    .await
                    .map(|_| ()),
                6 => org
                    .campaigns()
                    .enroll(
                        "c",
                        &EnrollPlatformCampaignContactRequest {
                            project_id: PROJECT.into(),
                            contact,
                        },
                        caller,
                    )
                    .await
                    .map(|_| ()),
                _ => messaging
                    .campaigns()
                    .enroll(PROJECT, "c", &contact, caller)
                    .await
                    .map(|_| ()),
            }
            .unwrap_err();
            assert_eq!(error.kind, kind, "{status} {code} call {call}");
            assert_eq!(error.code.as_deref(), Some(code));
            assert_eq!(error.status, Some(status));
            assert_eq!(error.request_id.as_deref(), Some("counted"));
            assert_eq!(
                count.load(Ordering::SeqCst),
                1,
                "call {call} replayed on {status}"
            );
            let head = heads.lock().unwrap()[0].clone();
            assert!(head.contains("x-caller: kept"));
            assert_eq!(head.contains("idempotency-key: caller-key"), call == 7);
            if call == 6 {
                assert!(!head.contains("idempotency-key:"));
            }
        }
    }
    let (base, count, _) = counting(
        503,
        json!({"error":{"code":"unavailable","message":"retry"}}),
    )
    .await;
    let org = OrganizationClient::new(
        support::credential(),
        ClientOptions {
            base_url: base,
            ..retrying()
        },
    )
    .unwrap();
    assert!(org
        .audience_segments()
        .retrieve("s", RequestOptions::default())
        .await
        .is_err());
    assert_eq!(
        count.load(Ordering::SeqCst),
        3,
        "segment reads keep the retry policy"
    );
}

#[tokio::test]
async fn malformed_segments_blank_ids_projects_and_step_bounds_fail_before_sending() {
    let (base, count, _) = counting(200, json!({"data":{}})).await;
    let org = OrganizationClient::new(
        support::credential(),
        ClientOptions {
            base_url: base,
            ..ClientOptions::default()
        },
    )
    .unwrap();
    for blank in ["", " "] {
        let error = org
            .audience_segments()
            .retrieve(blank, RequestOptions::default())
            .await
            .unwrap_err();
        assert_eq!(error.kind, ErrorKind::Validation);
    }
    let unknown = AudienceSegmentRules {
        r#match: AudienceSegmentMatch::All,
        groups: vec![AudienceSegmentGroup {
            r#match: AudienceSegmentMatch::All,
            negate: None,
            conditions: vec![AudienceSegmentCondition::Unknown(json!({"field":"future"}))],
        }],
    };
    assert_eq!(
        org.audience_segments()
            .preview_rules(&unknown, RequestOptions::default())
            .await
            .unwrap_err()
            .kind,
        ErrorKind::Validation
    );
    for project_id in ["", "not-a-uuid"] {
        let error = org
            .campaigns()
            .enroll(
                "c",
                &EnrollPlatformCampaignContactRequest {
                    project_id: project_id.into(),
                    contact: EnrollCampaignContactRequest {
                        phone: "+1".into(),
                        variables: None,
                    },
                },
                RequestOptions::default(),
            )
            .await
            .unwrap_err();
        assert_eq!(error.kind, ErrorKind::Validation);
    }
    let step = |delay: u32| CampaignMessage {
        source: Some("later".into()),
        delay_after_sec: Some(delay),
        ..Default::default()
    };
    for drip in [None, Some(None)] {
        let body = CreatePlatformCampaignRequest {
            drip,
            messages_array: Some(vec![step(86401)]),
            ..serde_json::from_value(json!({"projectId":PROJECT,"name":"o"})).unwrap()
        };
        assert!(org
            .campaigns()
            .create(&body, RequestOptions::default())
            .await
            .is_err());
    }
    let over = UpdatePlatformCampaignRequest {
        messages_array: Some(vec![step(2592001)]),
        ..Default::default()
    };
    assert!(org
        .campaigns()
        .update("c", Some(&over), &project(), RequestOptions::default())
        .await
        .is_err());
    assert_eq!(
        count.load(Ordering::SeqCst),
        0,
        "invalid input reached the network"
    );
}

#[tokio::test]
async fn drip_partial_patch_enrollment_and_stored_reads() {
    let window = CampaignStepWindow {
        days: vec![CampaignWeekday::Monday],
        hours: vec![serde_json::from_value(json!({"start":"09:00","end":"17:00"})).unwrap()],
    };
    let steps = vec![
        CampaignMessage {
            source: Some("hi".into()),
            ..Default::default()
        },
        CampaignMessage {
            source: Some("later".into()),
            delay_after_sec: Some(2592000),
            delay_unit: Some(CampaignDelayUnit::Days),
            send_window: Some(Some(window)),
            ..Default::default()
        },
    ];
    let create = CreatePlatformCampaignRequest {
        segment_id: Some("s".into()),
        drip: Some(Some(CampaignDripInput {
            enrollment: Some(CampaignDripEnrollment::Continuous),
            ..Default::default()
        })),
        messages_array: Some(steps),
        ..serde_json::from_value(json!({"projectId":PROJECT,"name":"VIP drip"})).unwrap()
    };
    wire_organization!(
        client,
        "POST",
        "/platform/campaigns",
        Some(
            json!({"projectId":PROJECT,"name":"VIP drip","segmentId":"s","drip":{"enrollment":"continuous"},"messagesArray":[{"source":"hi"},{"source":"later","delayAfterSec":2592000,"delayUnit":"days","sendWindow":{"days":["monday"],"hours":[{"start":"09:00","end":"17:00"}]}}]})
        ),
        json!({"data":campaign()}),
        client
            .campaigns()
            .create(&create, RequestOptions::default())
    );
    let audience = CampaignDripPatch {
        enrollment: Some(CampaignDripEnrollment::Audience),
        ..Default::default()
    };
    let patch = UpdatePlatformCampaignRequest {
        changes: UpdateCampaignRequest {
            drip: Some(Some(audience.clone())),
            ..Default::default()
        },
        ..Default::default()
    };
    wire_organization!(
        client,
        "PATCH",
        &format!("/platform/campaigns/c?projectId={PROJECT}"),
        Some(json!({"drip":{"enrollment":"audience"}})),
        json!({"data":campaign()}),
        client
            .campaigns()
            .update("c", Some(&patch), &project(), RequestOptions::default())
    );
    wire_messaging!(
        client,
        "PATCH",
        &format!("/messaging/projects/{PROJECT}/campaigns/c"),
        Some(json!({"drip":{"enrollment":"audience"}})),
        json!({"success":true,"data":campaign()}),
        client.campaigns().update(
            PROJECT,
            "c",
            &UpdateCampaignRequest {
                drip: Some(Some(audience)),
                ..Default::default()
            },
            RequestOptions::default()
        )
    );
    let clear = UpdatePlatformCampaignRequest {
        segment_id: Some(None),
        changes: UpdateCampaignRequest {
            drip: Some(None),
            ..Default::default()
        },
        ..Default::default()
    };
    wire_organization!(
        client,
        "PATCH",
        &format!("/platform/campaigns/c?projectId={PROJECT}"),
        Some(json!({"drip":null,"segmentId":null})),
        json!({"data":campaign()}),
        client
            .campaigns()
            .update("c", Some(&clear), &project(), RequestOptions::default())
    );
    wire_organization!(
        client,
        "PATCH",
        &format!("/platform/campaigns/c?projectId={PROJECT}"),
        Some(json!({"messagesArray":[{"source":"later","delayAfterSec":2592000}]})),
        json!({"data":campaign()}),
        client.campaigns().update(
            "c",
            Some(&UpdatePlatformCampaignRequest {
                messages_array: Some(vec![CampaignMessage {
                    source: Some("later".into()),
                    delay_after_sec: Some(2592000),
                    ..Default::default()
                }]),
                ..Default::default()
            }),
            &project(),
            RequestOptions::default()
        )
    );
    wire_organization!(
        client,
        "POST",
        "/platform/campaigns/c%2F1/enrollments",
        Some(json!({"projectId":PROJECT,"phone":"+5511999990000"})),
        json!({"data":enrollment_wire()}),
        client.campaigns().enroll(
            "c/1",
            &EnrollPlatformCampaignContactRequest {
                project_id: PROJECT.into(),
                contact: EnrollCampaignContactRequest {
                    phone: "+5511999990000".into(),
                    variables: None
                }
            },
            RequestOptions::default()
        )
    );
    wire_messaging!(
        client,
        "POST",
        &format!("/messaging/projects/{PROJECT}/campaigns/c/enrollments"),
        Some(json!({"phone":"+5511999990000","variables":{"vip":true}})),
        json!({"success":true,"data":enrollment_wire()}),
        client.campaigns().enroll(
            PROJECT,
            "c",
            &EnrollCampaignContactRequest {
                phone: "+5511999990000".into(),
                variables: Some([("vip".to_owned(), CampaignVariableValue::Boolean(true))].into())
            },
            RequestOptions::default()
        )
    );
    let stored: Campaign = serde_json::from_value(campaign()).unwrap();
    assert_eq!(stored.enrollment_open, Some(Some(false)));
    assert_eq!(stored.pause_reason, Some(None));
    assert_eq!(stored.segment_id, Some(None));
    assert_eq!(
        stored.segment_snapshot.clone().flatten().unwrap().revision,
        3
    );
    assert!(stored.drip.clone().flatten().unwrap().exit_on_link_click);
    for key in [
        "drip",
        "enrollmentOpen",
        "pauseReason",
        "segmentId",
        "segmentSnapshot",
    ] {
        assert!(
            !stored.extensions.contains_key(key),
            "{key} left in extensions"
        );
    }
    let stats: CampaignAnalytics = serde_json::from_value(analytics()).unwrap();
    let drip = stats.drip.flatten().unwrap();
    assert_eq!((drip.enrolled_by_api, drip.steps[0].exited), (1, 1));
    let e: CampaignEnrollment = serde_json::from_value(enrollment()).unwrap();
    assert!(!e.created);
    assert_eq!(e.enrolled_at, 1800000000000.0);
    let r: CampaignRecipient = serde_json::from_value(recipient()).unwrap();
    assert_eq!(r.sequence_error.as_deref(), Some("link_clicked"));
}

#[test]
fn types_match_pinned_supplements() {
    let cap: Value = serde_json::from_str(include_str!(
        "../../../contracts/campaign-frequency-cap.json"
    ))
    .unwrap();
    let seg: Value = serde_json::from_str(include_str!(
        "../../../contracts/campaign-segments-drip.json"
    ))
    .unwrap();
    assert_eq!(cap["commit"], "9bb1e2ed92d8b4a07ff727f8e7ae185498f0868f");
    assert_eq!(seg["commit"], "9bb1e2ed92d8b4a07ff727f8e7ae185498f0868f");
    let keys = |v: Value| {
        let mut k: Vec<String> = v.as_object().unwrap().keys().cloned().collect();
        k.sort();
        k
    };
    let props = |schema: &Value| {
        let mut k: Vec<String> = schema["properties"]
            .as_object()
            .unwrap()
            .keys()
            .cloned()
            .collect();
        k.sort();
        k
    };
    let platform = &cap["sources"]["platform"]["schemas"];
    let settings: CampaignFrequencyCapSettings = serde_json::from_value(json!({"teamId":PROJECT,"maxPer24Hours":null,"maxPer7Days":null,"revision":0,"updatedAt":null})).unwrap();
    assert_eq!(
        keys(serde_json::to_value(settings).unwrap()),
        props(&platform["CampaignFrequencyCapSettings"])
    );
    let input = UpdateCampaignFrequencyCapRequest {
        max_per_24_hours: None,
        max_per_7_days: None,
        revision: 0,
    };
    assert_eq!(
        keys(serde_json::to_value(input).unwrap()),
        props(&platform["UpdateCampaignFrequencyCapInput"])
    );
    for reason in platform["CampaignRecipientFailureReason"]["enum"]
        .as_array()
        .unwrap()
    {
        serde_json::from_value::<CampaignRecipientFailureReason>(reason.clone()).unwrap();
    }
    let schemas = &seg["sources"]["platform"]["schemas"];
    let full = CampaignDripInput {
        enrollment: Some(CampaignDripEnrollment::Audience),
        exit_on_reply: Some(true),
        exit_on_link_click: Some(false),
    };
    for (name, value) in [
        ("AudienceSegment", segment()),
        (
            "AudienceSegmentPreview",
            serde_json::to_value(
                serde_json::from_value::<AudienceSegmentPreview>(preview()).unwrap(),
            )
            .unwrap(),
        ),
        (
            "CampaignDrip",
            serde_json::to_value(
                serde_json::from_value::<CampaignDrip>(
                    json!({"enrollment":"audience","exitOnReply":true,"exitOnLinkClick":false}),
                )
                .unwrap(),
            )
            .unwrap(),
        ),
        ("CampaignDripInput", serde_json::to_value(&full).unwrap()),
        (
            "CampaignDripPatch",
            serde_json::to_value(CampaignDripPatch {
                enrollment: full.enrollment,
                exit_on_reply: full.exit_on_reply,
                exit_on_link_click: full.exit_on_link_click,
            })
            .unwrap(),
        ),
        (
            "CampaignDripStats",
            serde_json::to_value(
                serde_json::from_value::<CampaignDripStats>(drip_stats()).unwrap(),
            )
            .unwrap(),
        ),
        (
            "CampaignEnrollment",
            serde_json::to_value(
                serde_json::from_value::<CampaignEnrollment>(enrollment()).unwrap(),
            )
            .unwrap(),
        ),
        (
            "EnrollCampaignContactRequest",
            serde_json::to_value(EnrollPlatformCampaignContactRequest {
                project_id: PROJECT.into(),
                contact: EnrollCampaignContactRequest {
                    phone: "+1".into(),
                    variables: Some(
                        [("a".to_owned(), CampaignVariableValue::Boolean(true))].into(),
                    ),
                },
            })
            .unwrap(),
        ),
    ] {
        assert_eq!(keys(value), props(&schemas[name]), "{name}");
    }
    for source in ["platform", "messaging"] {
        assert!(!seg["sources"][source]["schemas"]["CampaignDripPatch"]
            .to_string()
            .contains("\"default\""));
    }
    assert_eq!(
        seg["sources"]["platform"]["fields"]["CampaignMessage.sendWindow"]["properties"]["hours"]
            ["maxItems"],
        4
    );
}
