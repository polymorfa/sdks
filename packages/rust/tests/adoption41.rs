#[allow(dead_code)]
mod support;
use polymorfa_sdk::{campaigns::*, ErrorKind, RequestOptions};
use serde_json::json;
#[tokio::test]
async fn platform_patch_selectors_are_refused_by_presence_before_io() {
    let client = support::organization("http://127.0.0.1:1".into());
    for key in ["projectId", "id"] {
        for value in [json!(null), json!("project"), json!(false), json!(0)] {
            let body = UpdatePlatformCampaignRequest {
                extensions: [(key.to_owned(), value)].into(),
                ..Default::default()
            };
            let error = client
                .campaigns()
                .update(
                    "campaign",
                    Some(&body),
                    &PlatformCampaignParameters {
                        project_id: "project".into(),
                    },
                    RequestOptions::default(),
                )
                .await
                .unwrap_err();
            assert_eq!(error.kind, ErrorKind::Validation, "{key}");
        }
    }
}
#[tokio::test]
async fn follow_up_uses_effective_defaults_and_ecma_placeholder_rules() {
    let client = support::messaging("http://127.0.0.1:1".into());
    let body = UpdateCampaignRequest {
        follow_up: Some(Some(CampaignFollowUp {
            message: CampaignFollowUpMessage::Text {
                text: "Hello".into(),
            },
            delay_seconds: Some(604800),
            expiry_seconds: None,
        })),
        ..Default::default()
    };
    assert_eq!(
        client
            .campaigns()
            .update("p", "c", &body, RequestOptions::default())
            .await
            .unwrap_err()
            .kind,
        ErrorKind::Validation
    );
}
#[tokio::test]
async fn history_retry_refuses_missing_canonical_outcome() {
    use polymorfa_sdk::direct_media::{HistoryChunkRetry, HistorySyncType};
    let (base, server) = support::wire(
        "POST",
        "/messaging/s/history/chunks/retry",
        Some(json!({"syncType":"FULL","chunkOrder":0})),
        json!({"success":true,"data":{"requestId":"receipt"}}),
    )
    .await;
    let client = support::messaging(base);
    let error = client
        .history_sync()
        .request_chunk_retry(
            "s",
            &HistoryChunkRetry {
                sync_type: HistorySyncType::Full,
                chunk_order: 0,
                chunk_message_id: None,
                regenerate: None,
            },
            RequestOptions {
                api_version: Some("2026-09-22".into()),
                ..Default::default()
            },
        )
        .await;
    assert!(
        error.is_err(),
        "missing status must not resolve successfully"
    );
    server.await.unwrap();
}
#[test]
fn quicklink_reserved_configuration_is_not_silently_dropped() {
    assert!(
        serde_json::from_value::<polymorfa_sdk::models::QuickLinkConfiguration>(
            json!({"signalMode":"zero_knowledge"})
        )
        .is_err()
    );
}
fn verified_history(
    payload: serde_json::Value,
) -> polymorfa_sdk::Result<polymorfa_sdk::webhooks::WebhookEvent> {
    use hmac::{Hmac, Mac};
    use sha2::Sha256;
    let raw=serde_json::to_vec(&json!({"id":"event-id","session":"s","timestamp":"2026-10-14T00:00:00Z","event":"history.sync","payload":payload})).unwrap();
    let mut mac = Hmac::<Sha256>::new_from_slice(b"synthetic-secret").unwrap();
    mac.update(&raw);
    polymorfa_sdk::webhooks::construct_event(
        &raw,
        &format!("sha256={}", hex::encode(mac.finalize().into_bytes())),
        "synthetic-secret",
    )
}
#[test]
fn projected_descriptor_is_decoded_through_verified_webhook() {
    assert!(verified_history(json!({"delivery":"descriptor","whatsapp_ids":{"linked_devices":"notification"},"syncType":"RECENT","fileLength":0,"inline":{"encoding":"zlib-base64-protobuf","data":"fixture"}})).is_ok());
}
#[allow(dead_code)]
mod support41;
use polymorfa_sdk::{
    campaign_contracts::CampaignRecipientFailureReason,
    configuration::*,
    models::{CreateQuickLinkRequest, QuickLinkConfiguration, QuickLinkHistorySync},
    ClientOptions, Credential, MessagingClient,
};
use support41::Wire;
const PROJECT41: &str = "11111111-1111-4111-8111-111111111111";
fn campaign41() -> serde_json::Value {
    json!({"id":"1234567890123456789","name":"Stored","status":"draft","templateId":null,"recipientListId":null,"recipientCount":0,"sentCount":0,"deliveredCount":0,"readCount":0,"failedCount":0,"skippedCount":0,"scheduledAt":null,"launchedAt":null,"completedAt":null,"createdAt":0,"updatedAt":0,"sendWindow":null,"trackedLinks":[],"experimentOutcome":null,"followUp":null,"messages":{"stored":"opaque"},"variableMapping":null,"future":false})
}
fn configuration41() -> serde_json::Value {
    json!({"effective":{"observation":{"presenceMode":"off","typingMode":"off","labelMode":"off","quickReplyMode":"off"},"historySync":{"mode":"metadata_only","requestFull":false,"delivery":"archive"},"hms":{"enabled":false}},"overrides":{"historySync":{"delivery":"descriptor"}},"sources":{"historySync.mode":"consent","historySync.requestFull":"consent","historySync.delivery":"platform","hms":"platform","observation.presenceMode":"platform","observation.typingMode":"platform","observation.labelMode":"platform","observation.quickReplyMode":"platform"},"requestedHistory":{"mode":"deliver","requestFull":false,"delivery":"descriptor"},"historyConsent":"pending","revisions":{"team":0,"project":0,"session":0},"application":null})
}
fn session41() -> serde_json::Value {
    json!({"sessionId":"sid","name":"s","tenantId":"org","type":"linked_devices","testMode":false,"status":"connected","createdAt":"2026-10-14T00:00:00Z","updatedAt":"2026-10-14T00:00:00Z","signalMode":"zero_knowledge","configuration":configuration41()})
}
#[tokio::test]
async fn campaign_typed_mapping_null_patches_open_messages_and_normalized_results() {
    let mut stored = campaign41();
    stored["trackedLinks"] = json!((0..6)
        .map(|i| json!({"key":format!("k{i}"),"url":"https://example.com/normalized"}))
        .collect::<Vec<_>>());
    let wire = Wire::new(vec![
        (200, json!({"success":true,"data":stored})),
        (200, json!({"data":campaign41()})),
        (200, json!({"data":campaign41()})),
        (200, json!({"data":campaign41()})),
        (200, json!({"data":null})),
    ])
    .await;
    let m = support::messaging(wire.base.clone());
    let body = CreateCampaignRequest {
        variable_mapping: Some(
            [
                ("0".into(), CampaignVariableBinding::default()),
                (
                    "__proto__".into(),
                    CampaignVariableBinding {
                        source: Some("a.b-0".into()),
                        fallback: Some("😀".repeat(512)),
                    },
                ),
            ]
            .into(),
        ),
        tracked_links: Some(Some(vec![
            CampaignTrackedLink {
                key: "a".into(),
                url: "HTTPS://Example.com".into(),
            },
            CampaignTrackedLink {
                key: "b".into(),
                url: "HTTPS://Example.com".into(),
            },
        ])),
        ..serde_json::from_value(json!({"name":"Draft"})).unwrap()
    };
    let result = m
        .campaigns()
        .create("p /", &body, RequestOptions::default())
        .await
        .unwrap();
    assert_eq!(result.data.data.tracked_links.len(), 6);
    assert_eq!(result.data.data.id, "1234567890123456789");
    assert_eq!(result.data.data.messages, Some(json!({"stored":"opaque"})));
    assert_eq!(result.data.data.extensions["future"], false);
    let org = support::organization(wire.base.clone());
    let params = PlatformCampaignParameters {
        project_id: PROJECT41.into(),
    };
    let patch = UpdatePlatformCampaignRequest {
        changes: UpdateCampaignRequest {
            template_id: Some(None),
            variable_mapping: Some(None),
            tracked_links: Some(None),
            ..Default::default()
        },
        messages_array: Some(vec![
            CampaignMessage::default(),
            CampaignMessage {
                source: Some("x".repeat(5000)),
                delay_after_sec: Some(0),
                buttons: Some(
                    (0..4)
                        .map(|_| CampaignMessageButton {
                            kind: CampaignMessageButtonKind::Reply,
                            label: "".into(),
                            url: None,
                            phone: None,
                            extensions: [("future".into(), json!(false))].into(),
                        })
                        .collect(),
                ),
                extensions: [("future".into(), json!(0))].into(),
                ..Default::default()
            },
        ]),
        extensions: [("future".into(), json!(false))].into(),
    };
    org.campaigns()
        .update("c /", Some(&patch), &params, Default::default())
        .await
        .unwrap();
    org.campaigns()
        .update(
            "c /",
            Some(&UpdatePlatformCampaignRequest::default()),
            &params,
            Default::default(),
        )
        .await
        .unwrap();
    org.campaigns()
        .update("c /", None, &params, Default::default())
        .await
        .unwrap();
    assert!(org
        .campaigns()
        .retrieve("c /", &params, Default::default())
        .await
        .unwrap()
        .data
        .data
        .is_none());
    let rows = wire.captured();
    assert_eq!(rows[0].body()["variableMapping"]["0"], json!({}));
    assert_eq!(
        rows[0].body()["trackedLinks"][0]["url"],
        "HTTPS://Example.com"
    );
    wire.check(
        2,
        "PATCH",
        &format!("/platform/campaigns/c%20%2F?projectId={PROJECT41}"),
        json!({}),
        "2026-09-22",
    );
    assert!(rows[3].bytes.is_empty());
    assert_eq!(rows[1].body()["messagesArray"][1]["delayAfterSec"], 0);
    assert_eq!(rows[1].body()["future"], false);
}
#[tokio::test]
async fn campaign_null_only_updates_and_utf16_ecma_controls() {
    for field in ["templateId", "variableMapping", "trackedLinks"] {
        let mut v = serde_json::Map::new();
        v.insert(field.into(), json!(null));
        let body: UpdateCampaignRequest = serde_json::from_value(v.clone().into()).unwrap();
        let wire = Wire::new(vec![(200, json!({"success":true,"data":campaign41()}))]).await;
        support::messaging(wire.base.clone())
            .campaigns()
            .update("p", "c", &body, Default::default())
            .await
            .unwrap();
        wire.check(
            0,
            "PATCH",
            "/messaging/projects/p/campaigns/c",
            v.into(),
            "2026-09-22",
        );
    }
    let vectors = [
        ("ordinary", true),
        ("{{ link:x}}", false),
        ("{{LiNk:x}}", false),
        ("{{\u{a0}link:x}}", false),
        ("{{\u{feff}link:x}}", false),
        ("{{\u{202f}link:x}}", false),
        ("{{\u{85}link:x}}", true),
        ("{{lin\u{212a}:x}}", true),
        ("{{link\u{17f}:x}}", true),
    ];
    for (text, allowed) in vectors {
        let wire=Wire::new(vec![(422,json!({"error":{"code":"campaign_variables_missing","param":"variables","message":"fixture"}}))]).await;
        let body = UpdateCampaignRequest {
            follow_up: Some(Some(CampaignFollowUp {
                message: CampaignFollowUpMessage::Text { text: text.into() },
                delay_seconds: None,
                expiry_seconds: None,
            })),
            ..Default::default()
        };
        let error = support::messaging(wire.base.clone())
            .campaigns()
            .update("p", "c", &body, Default::default())
            .await
            .unwrap_err();
        assert_eq!(wire.captured().len(), usize::from(allowed), "{text}");
        if allowed {
            assert_eq!(error.param.as_deref(), Some("variables"));
        } else {
            assert_eq!(error.kind, ErrorKind::Validation);
        }
    }
    let client = support::messaging("http://127.0.0.1:1".into());
    for (delay, expiry) in [(Some(604800), None), (None, Some(86400))] {
        let body = UpdateCampaignRequest {
            follow_up: Some(Some(CampaignFollowUp {
                message: CampaignFollowUpMessage::Text { text: "ok".into() },
                delay_seconds: delay,
                expiry_seconds: expiry,
            })),
            ..Default::default()
        };
        assert_eq!(
            client
                .campaigns()
                .update("p", "c", &body, Default::default())
                .await
                .unwrap_err()
                .kind,
            ErrorKind::Validation
        );
    }
    for fallback in ["\u{feff}".into(), "😀".repeat(513)] {
        let body = UpdateCampaignRequest {
            variable_mapping: Some(Some(
                [(
                    "x".into(),
                    CampaignVariableBinding {
                        fallback: Some(fallback),
                        ..Default::default()
                    },
                )]
                .into(),
            )),
            ..Default::default()
        };
        assert_eq!(
            client
                .campaigns()
                .update("p", "c", &body, Default::default())
                .await
                .unwrap_err()
                .kind,
            ErrorKind::Validation
        );
    }
}
#[test]
fn campaign_required_nullable_and_optional_nonnull_are_distinct() {
    for key in ["trackedLinks", "experimentOutcome", "followUp"] {
        let mut v = campaign41();
        v.as_object_mut().unwrap().remove(key);
        assert!(serde_json::from_value::<Campaign>(v).is_err(), "{key}");
    }
    assert!(serde_json::from_value::<Campaign>(campaign41()).is_ok());
    for v in [
        json!({"source":null}),
        json!({"fallback":null}),
        json!({"extra":false}),
    ] {
        assert!(serde_json::from_value::<CampaignVariableBinding>(v).is_err());
    }
    assert!(serde_json::from_value::<CampaignVariableBinding>(json!({})).is_ok());
    assert!(serde_json::from_value::<CreateCampaignRequest>(
        json!({"name":"x","variableMapping":null})
    )
    .is_err());
    assert!(serde_json::from_value::<CreatePlatformCampaignRequest>(
        json!({"projectId":PROJECT41,"name":"x","variants":null})
    )
    .is_err());
    for v in [
        json!({"source":null}),
        json!({"media":null}),
        json!({"buttons":null}),
        json!({"version":3}),
    ] {
        assert!(serde_json::from_value::<CampaignMessage>(v).is_err());
    }
}
#[tokio::test]
async fn configuration_versions_preserve_legacy_reads_resets_and_explicit_overrides() {
    let wire = Wire::new(vec![
        (200, json!({"data":configuration41()})),
        (200, json!({"data":configuration41()})),
        (200, json!({"data":configuration41()})),
        (200, json!({"success":true,"data":session41()})),
        (200, json!({"success":true,"data":session41()})),
        (200, json!({"data":configuration41()})),
        (200, json!({"data":configuration41()})),
    ])
    .await;
    let org = support::organization(wire.base.clone());
    let bound = org.project(PROJECT41).unwrap();
    let view = org
        .session_configuration()
        .retrieve(Default::default())
        .await
        .unwrap();
    assert!(matches!(
        view.data.requested_history.delivery,
        Some(HistorySyncDelivery::Descriptor)
    ));
    assert!(matches!(
        view.data.effective.history_sync.delivery,
        Some(HistorySyncDelivery::Archive)
    ));
    assert!(matches!(
        view.data.sources.history_sync_delivery,
        Some(HistorySyncDeliverySource::Platform)
    ));
    assert_eq!(view.data.revisions.project, 0);
    bound
        .session_configuration()
        .retrieve(RequestOptions {
            api_version: Some("2026-10-14".into()),
            ..Default::default()
        })
        .await
        .unwrap();
    let patch = SessionConfigurationPatch {
        set: Some(SessionConfigurationOverrides {
            history_sync: Some(HistorySyncPolicyPatch {
                delivery: Some(HistorySyncDeliveryWrite::Descriptor),
                request_full: Some(false),
                ..Default::default()
            }),
            ..Default::default()
        }),
        reset: None,
    };
    org.session_configuration()
        .update(
            &polymorfa_sdk::settings::UpdateSessionDefaults {
                configuration: patch.clone(),
                revision: 0,
            },
            Default::default(),
        )
        .await
        .unwrap();
    let result = org
        .sessions()
        .update(
            "s /",
            &UpdateSessionRequest {
                configuration: patch.clone(),
                revision: 0,
            },
            Default::default(),
        )
        .await
        .unwrap();
    assert_eq!(
        result.data.data.signal_mode,
        Some(polymorfa_sdk::campaign_contracts::SignalCustodyMode::ZeroKnowledge)
    );
    support::messaging(wire.base.clone())
        .sessions()
        .update(
            "s /",
            &UpdateSessionRequest {
                configuration: patch,
                revision: 0,
            },
            RequestOptions {
                api_version: Some("2026-09-22".into()),
                ..Default::default()
            },
        )
        .await
        .unwrap();
    bound
        .session_configuration()
        .update(
            &polymorfa_sdk::settings::UpdateSessionDefaults {
                configuration: SessionConfigurationPatch {
                    set: None,
                    reset: Some(vec![SessionConfigurationReset::HistorySync]),
                },
                revision: 0,
            },
            Default::default(),
        )
        .await
        .unwrap();
    bound
        .session_configuration()
        .update(
            &polymorfa_sdk::settings::UpdateSessionDefaults {
                configuration: SessionConfigurationPatch {
                    set: None,
                    reset: Some(vec![SessionConfigurationReset::HistorySyncDelivery]),
                },
                revision: 0,
            },
            Default::default(),
        )
        .await
        .unwrap();
    let rows = wire.captured();
    assert_eq!(rows.len(), 7);
    for (i, version) in [
        (0, "2026-09-22"),
        (1, "2026-10-14"),
        (2, "2026-10-14"),
        (3, "2026-10-14"),
        (4, "2026-09-22"),
        (5, "2026-09-22"),
        (6, "2026-10-14"),
    ] {
        assert_eq!(rows[i].headers["polymorfa-version"], version);
    }
    assert_eq!(rows[2].body()["revision"], 0);
    assert_eq!(
        rows[2].body()["configuration"]["set"]["historySync"]["requestFull"],
        false
    );
    assert_eq!(rows[3].path, "/platform/sessions/s%20%2F");
    assert_eq!(rows[5].body()["projectId"], PROJECT41);
    assert_eq!(
        rows[5].body()["configuration"]["reset"],
        json!(["historySync"])
    );
}
#[tokio::test]
async fn quicklink_branch_and_new_intent_preserve_consent_and_versions() {
    let receipt = json!({"success":true,"data":{"id":"link","url":"https://example.com/link","purpose":"initial","session":"s","connectionGoal":"hybrid","expiresAt":null}});
    let wire=Wire::new(vec![(200,receipt.clone()),(200,receipt.clone()),(200,receipt),(400,json!({"error":{"code":"invalid_parameter","param":"Polymorfa-Version","message":"fixture"}}))]).await;
    let client = support::messaging(wire.base.clone());
    client
        .quick_links()
        .create(&CreateQuickLinkRequest::default(), Default::default())
        .await
        .unwrap();
    client
        .quick_links()
        .create(
            &CreateQuickLinkRequest {
                signal_mode: Some(polymorfa_sdk::campaign_contracts::SignalCustodyMode::Standard),
                ..Default::default()
            },
            Default::default(),
        )
        .await
        .unwrap();
    let body = CreateQuickLinkRequest {
        configuration: Some(QuickLinkConfiguration {
            history_sync: Some(QuickLinkHistorySync {
                delivery: Some(HistorySyncDeliveryWrite::Descriptor),
                consent: Some("force_off".into()),
                request_full: Some(false),
                ..Default::default()
            }),
            ..Default::default()
        }),
        ..Default::default()
    };
    client
        .quick_links()
        .create(&body, Default::default())
        .await
        .unwrap();
    let err = client
        .quick_links()
        .create(
            &body,
            RequestOptions {
                api_version: Some("2026-09-22".into()),
                ..Default::default()
            },
        )
        .await
        .unwrap_err();
    assert_eq!(err.param.as_deref(), Some("Polymorfa-Version"));
    let rows = wire.captured();
    assert_eq!(rows[0].headers["polymorfa-version"], "2026-09-22");
    assert_eq!(rows[1].headers["polymorfa-version"], "2026-10-14");
    assert_eq!(rows[2].headers["polymorfa-version"], "2026-10-14");
    assert_eq!(rows[3].headers["polymorfa-version"], "2026-09-22");
    assert_eq!(
        rows[2].body()["configuration"]["historySync"]["consent"],
        "force_off"
    );
    let denied = support::messaging("http://127.0.0.1:1".into());
    for value in [
        json!({"session":"s"}),
        json!({"addConnection":"linked_devices"}),
        json!({"purpose":"add_connection","session":"s"}),
        json!({"purpose":"add_connection","session":"s","addConnection":"official_api","signalMode":"standard"}),
        json!({"purpose":"add_connection","session":"s","addConnection":"official_api","externalId":"x"}),
        json!({"purpose":"add_connection","session":"s","addConnection":"official_api","customerId":"c"}),
        json!({"purpose":"add_connection","session":"s","addConnection":"official_api","connectionGoal":"single"}),
    ] {
        let body: CreateQuickLinkRequest = serde_json::from_value(value).unwrap();
        assert_eq!(
            denied
                .quick_links()
                .create(&body, Default::default())
                .await
                .unwrap_err()
                .kind,
            ErrorKind::Configuration
        );
    }
    for value in [
        json!({"signalMode":null}),
        json!({"signalMode":"wrong"}),
        json!({"configuration":{"historySync":{"delivery":"archive"}}}),
        json!({"configuration":{"historySync":{"delivery":null}}}),
    ] {
        assert!(serde_json::from_value::<CreateQuickLinkRequest>(value).is_err());
    }
}
#[test]
fn immutable_signal_fact_and_delivery_source_presence_are_strict() {
    for value in [json!(null), json!("wrong")] {
        let mut v = session41();
        v["signalMode"] = value;
        assert!(serde_json::from_value::<polymorfa_sdk::models::Session>(v).is_err());
    }
    let mut legacy = session41();
    legacy.as_object_mut().unwrap().remove("signalMode");
    assert!(serde_json::from_value::<polymorfa_sdk::models::Session>(legacy).is_ok());
    for value in [json!(null), json!("consent")] {
        let mut v = configuration41();
        v["sources"]["historySync.delivery"] = value;
        assert!(serde_json::from_value::<SessionConfigurationView>(v).is_err());
    }
    assert!(
        serde_json::from_value::<HistorySyncPolicyPatch>(json!({"delivery":"archive"})).is_err()
    );
    assert!(serde_json::from_value::<SessionConfigurationOverrides>(
        json!({"signalMode":"standard"})
    )
    .is_err());
}
#[test]
fn all_history_delivery_variants_narrow_after_verification_and_dual_or_null_fail() {
    use polymorfa_sdk::{
        webhook_payloads::{HistorySyncPayload, KnownWebhookPayload},
        webhooks::WebhookEvent,
    };
    let common = json!({"delivery":"descriptor","whatsapp_ids":{"linked_devices":"notification-1"},"original_whatsapp_ids":{"linked_devices":"original-1"},"syncType":"RECENT","fileLength":1e21,"chunkOrder":4294967296_u64,"progress":0,"oldestMessageAt":"2026-09-21T12:00:00Z","peerDataRequestSessionId":""});
    let media = json!({"type":"md-msg-hist","directPath":"/v/t62/blob.enc","mediaKey":"private-key","fileSha256":"hash","fileEncSha256":"enc-hash","encHandle":""});
    let mut m = common.clone();
    m["media"] = media.clone();
    match verified_history(m.clone()).unwrap() {
        WebhookEvent::Known {
            payload: KnownWebhookPayload::HistorySync(p),
            envelope,
        } => match *p {
            HistorySyncPayload::DescriptorMedia(p) => {
                assert_eq!(
                    p.common.whatsapp_ids.linked_devices.as_deref(),
                    Some("notification-1")
                );
                assert_ne!(envelope.id, "notification-1");
                assert_eq!(p.common.file_length, 1e21);
                assert_eq!(p.common.chunk_order, Some(4294967296.0));
                assert_eq!(
                    p.common.oldest_message_at.as_deref(),
                    Some("2026-09-21T12:00:00Z")
                );
                assert!(!format!("{:?}", p.media).contains("private-key"));
            }
            _ => panic!("wrong branch"),
        },
        _ => panic!("wrong event"),
    }
    let mut inline = common.clone();
    inline["fileLength"] = json!(0);
    inline["inline"] = json!({"encoding":"zlib-base64-protobuf","data":"fixture"});
    assert!(
        matches!(verified_history(inline.clone()).unwrap(),WebhookEvent::Known{payload:KnownWebhookPayload::HistorySync(p),..} if matches!(*p,HistorySyncPayload::DescriptorInline(_)))
    );
    let archive = json!({"mode":"deliver","whatsapp_ids":{"linked_devices":"archive"},"messages":[],"syncType":"FULL","fileLength":0,"conversationCount":0,"messageCount":0,"pushNameCount":0,"statusMessageCount":0,"whatsapp":{"encoding":"gzip-base64-protobuf","data":"archive"}});
    assert!(
        matches!(verified_history(archive).unwrap(),WebhookEvent::Known{payload:KnownWebhookPayload::HistorySync(p),..} if matches!(*p,HistorySyncPayload::LinkedDevices(_)))
    );
    assert!(
        matches!(verified_history(json!({"kind":"history","value":{}})).unwrap(),WebhookEvent::Known{payload:KnownWebhookPayload::HistorySync(p),..} if matches!(*p,HistorySyncPayload::OfficialApi(_)))
    );
    let mut both = inline.clone();
    both["media"] = media;
    let mut null = m.clone();
    null["inline"] = json!(null);
    let mut wrong = m.clone();
    wrong["media"]["type"] = json!("image");
    for v in [common, both, null, wrong] {
        assert!(verified_history(v).is_err());
    }
    for (key, value) in [
        ("fileLength", json!(-1)),
        ("chunkOrder", json!(1.5)),
        ("progress", json!(101)),
        ("oldestMessageAt", json!(null)),
        ("peerDataRequestSessionId", json!(null)),
        ("messageId", json!("raw")),
    ] {
        let mut v = m.clone();
        v[key] = value;
        assert!(verified_history(v).is_err(), "{key}");
    }
}
fn client41(base: String) -> MessagingClient {
    MessagingClient::new(
        Credential::client_token("pmfa_ct_synthetic-only").unwrap(),
        ClientOptions {
            base_url: base,
            max_network_retries: 0,
            ..Default::default()
        },
    )
    .unwrap()
}
#[tokio::test]
async fn direct_grant_history_and_builtin_selection_deny_client_before_source_or_http() {
    use polymorfa_sdk::{
        direct_media::*,
        media_encrypt::*,
        media_upload::{DirectUploadOptions, MediaSource, SourceFactory},
    };
    use std::sync::{
        atomic::{AtomicUsize, Ordering},
        Arc,
    };
    let wire = Wire::new(vec![]).await;
    let client = client41(wire.base.clone());
    let calls = Arc::new(AtomicUsize::new(0));
    let count = calls.clone();
    let factory: SourceFactory = Arc::new(move || {
        count.fetch_add(1, Ordering::SeqCst);
        Box::pin(async { Ok(Box::pin(futures_util::stream::empty()) as MediaInputStream) })
    });
    let media = client.whatsapp_media();
    assert!(media
        .create_upload_grant("s", UploadMediaType::Image, &[0; 32], Default::default())
        .await
        .is_err());
    let e = media
        .upload_direct(
            "s",
            MediaSource::Reopen(factory),
            MediaEncryptionOptions::new(UploadMediaType::Image),
            DirectUploadOptions::default(),
            Default::default(),
        )
        .await
        .err()
        .unwrap();
    assert_eq!(e.kind, ErrorKind::Configuration);
    assert!(media
        .direct_transport(DirectUploadOptions::default(), Default::default())
        .is_err());
    assert!(client
        .history_sync()
        .request_chunk_retry(
            "s",
            &HistoryChunkRetry {
                sync_type: HistorySyncType::Full,
                chunk_order: 0,
                chunk_message_id: None,
                regenerate: None
            },
            Default::default()
        )
        .await
        .is_err());
    assert!(client
        .history_sync()
        .delete_chunk(
            "s",
            &HistoryChunkDelete {
                direct_path: "/blob.enc".into(),
                file_enc_sha256: format!("{}=", "A".repeat(43)),
                enc_handle: None,
                companion_meta_nonce: None
            },
            Default::default()
        )
        .await
        .is_err());
    assert_eq!(calls.load(Ordering::SeqCst), 0);
    assert!(wire.captured().is_empty());
}
#[tokio::test]
async fn history_canonical_outcomes_shapes_versions_limits_and_safe_errors() {
    use polymorfa_sdk::direct_media::*;
    let retry = HistoryChunkRetry {
        sync_type: HistorySyncType::OnDemand,
        chunk_order: u32::MAX,
        chunk_message_id: Some("x._:-".into()),
        regenerate: Some(false),
    };
    let wire=Wire::new(vec![(200,json!({"success":true,"data":{"requestId":"request","status":"requested"}})),(200,json!({"success":true,"data":{"status":"deleted"}})),(409,json!({"error":{"code":"zero_knowledge_session","param":"session","message":"Synthetic refusal"}}))]).await;
    let m = support::messaging(wire.base.clone());
    let result = m
        .history_sync()
        .request_chunk_retry("s /", &retry, Default::default())
        .await
        .unwrap();
    assert_eq!(result.request_id, "request");
    assert_eq!(result.status, HistoryChunkRetryStatus::Requested);
    let delete = HistoryChunkDelete {
        direct_path: "/v/t62/blob.enc?x=1&x+2".into(),
        file_enc_sha256: format!("{}B=", "A".repeat(42)),
        enc_handle: Some("a._~%/=+-".into()),
        companion_meta_nonce: None,
    };
    m.history_sync()
        .delete_chunk(
            "s /",
            &delete,
            RequestOptions {
                api_version: Some("2026-09-22".into()),
                ..Default::default()
            },
        )
        .await
        .unwrap();
    let error = m
        .history_sync()
        .request_chunk_retry("s", &retry, Default::default())
        .await
        .unwrap_err();
    assert_eq!(error.code.as_deref(), Some("zero_knowledge_session"));
    assert_eq!(error.param.as_deref(), Some("session"));
    assert_eq!(
        error
            .metadata
            .as_ref()
            .unwrap()
            .headers
            .get("x-trace-id")
            .map(String::as_str),
        Some("trace41")
    );
    wire.check(0,"POST","/messaging/s%20%2F/history/chunks/retry",json!({"syncType":"ON_DEMAND","chunkOrder":4294967295_u64,"chunkMessageId":"x._:-","regenerate":false}),"2026-10-14");
    assert_eq!(
        wire.captured()[1].headers["polymorfa-version"],
        "2026-09-22"
    );
    assert!(!wire.captured()[0].headers.contains_key("idempotency-key"));
    for v in [
        json!({"requestId":"r","status":"requested"}),
        json!({"success":false,"data":{"requestId":"r","status":"requested"}}),
        json!({"success":true,"data":[]}),
        json!({"success":true,"data":{"requestId":null,"status":"requested"}}),
        json!({"success":true,"data":{"requestId":"","status":"requested"}}),
        json!({"success":true,"data":{"requestId":"r","status":"wrong"}}),
    ] {
        let w = Wire::new(vec![(200, v)]).await;
        let err = support::messaging(w.base.clone())
            .history_sync()
            .request_chunk_retry("s", &retry, Default::default())
            .await
            .unwrap_err();
        assert_eq!(err.code.as_deref(), Some("invalid_response"));
        assert_eq!(err.request_id.as_deref(), Some("rust41"));
    }
    for (status, v) in [
        (204, json!(null)),
        (201, json!({"success":true,"data":{"status":"deleted"}})),
        (200, json!({"success":true,"data":{"status":"requested"}})),
        (200, json!({"data":{"status":"deleted"}})),
    ] {
        let w = Wire::new(vec![(status, v)]).await;
        let err = support::messaging(w.base.clone())
            .history_sync()
            .delete_chunk("s", &delete, Default::default())
            .await
            .unwrap_err();
        assert_eq!(err.code.as_deref(), Some("invalid_response"));
    }
    let noio = support::messaging("http://127.0.0.1:1".into());
    for hash in ["x".into(), format!("{}_=", "A".repeat(42)), "🦀".repeat(11)] {
        let bad = HistoryChunkDelete {
            file_enc_sha256: hash,
            ..delete.clone()
        };
        assert_eq!(
            noio.history_sync()
                .delete_chunk("s", &bad, Default::default())
                .await
                .unwrap_err()
                .kind,
            ErrorKind::Configuration
        );
    }
    let bad = HistoryChunkRetry {
        chunk_message_id: Some("bad space".into()),
        ..retry.clone()
    };
    assert_eq!(
        noio.history_sync()
            .request_chunk_retry("s", &bad, Default::default())
            .await
            .unwrap_err()
            .kind,
        ErrorKind::Configuration
    );
    for field in ["regenerate", "chunkMessageId"] {
        let mut value = json!({"syncType":"FULL","chunkOrder":0});
        value[field] = json!(null);
        assert!(serde_json::from_value::<HistoryChunkRetry>(value).is_err());
    }
}
#[tokio::test]
async fn grants_all_six_types_and_bad_grants_keep_safe_metadata() {
    use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
    use polymorfa_sdk::media_encrypt::UploadMediaType;
    let hash = [7; 32];
    let encoded = URL_SAFE_NO_PAD.encode(hash);
    for (kind, api_type, path, ptt) in [
        (UploadMediaType::Image, "image", "image", None),
        (UploadMediaType::Video, "video", "video", None),
        (UploadMediaType::Audio, "voice", "audio", Some(false)),
        (UploadMediaType::Ptt, "voice", "ptt", Some(true)),
        (UploadMediaType::Document, "file", "document", None),
        (UploadMediaType::Sticker, "sticker", "sticker", None),
    ] {
        let wire=Wire::new(vec![(200,json!({"success":true,"data":{"host":"mmg.whatsapp.net","uploadUrl":format!("https://mmg.whatsapp.net/mms/{path}/{encoded}?auth=synthetic"),"expiresAt":2000000000}}))]).await;
        let grant = support::messaging(wire.base.clone())
            .whatsapp_media()
            .create_upload_grant("s /", kind, &hash, Default::default())
            .await
            .unwrap();
        assert_eq!(grant.expires_at.timestamp(), 2000000000);
        let mut expected = json!({"type":api_type,"fileEncSha256":encoded});
        if let Some(ptt) = ptt {
            expected["ptt"] = json!(ptt);
        }
        wire.check(
            0,
            "POST",
            "/messaging/s%20%2F/media/upload-grants",
            expected,
            "2026-10-14",
        );
    }
    for data in [
        json!({"host":"attacker.example","uploadUrl":format!("https://mmg.whatsapp.net/mms/image/{encoded}?auth=secret"),"expiresAt":2000000000}),
        json!({"host":"mmg.whatsapp.net","uploadUrl":format!("https://mmg.whatsapp.net/mms/image/{encoded}?auth=secret"),"expiresAt":0}),
    ] {
        let wire = Wire::new(vec![(200, json!({"success":true,"data":data}))]).await;
        let e = support::messaging(wire.base.clone())
            .whatsapp_media()
            .create_upload_grant("s", UploadMediaType::Image, &hash, Default::default())
            .await
            .err()
            .unwrap();
        assert_eq!(e.code.as_deref(), Some("invalid_response"));
        assert_eq!(e.request_id.as_deref(), Some("rust41"));
        assert!(!format!("{e:?}").contains("auth=secret"));
    }
}
fn report41() -> serde_json::Value {
    json!({"campaignId":"c","recipientCount":0,"sentCount":0,"deliveredCount":0,"readCount":0,"failedCount":0,"skippedCount":0,"respondedCount":0,"responseRate":0,"averageResponseTimeMs":null,"minResponseTimeMs":0,"maxResponseTimeMs":null,"experiment":null,"followUps":{"total":0,"waiting":0,"scheduled":0,"sending":0,"sent":0,"delivered":0,"read":0,"replied":0,"cancelled":0,"expired":0,"failed":0,"unknown":0,"nextDueAt":0}})
}
fn recipient41() -> serde_json::Value {
    json!({"id":"1234567890123456789","phone":"+15550001111","variables":{},"variantKey":null,"status":"skipped","attempts":0,"lastError":"missing_variable","externalMessageId":null,"queuedAt":0,"sentAt":null,"deliveredAt":null,"readAt":null,"failedAt":null,"respondedAt":null,"messagesSent":0,"failureReason":"missing_variable","nextMessageAt":0,"sequenceError":"future_code","followUp":null})
}
#[tokio::test]
async fn recipient_filters_and_campaign_reports_keep_required_null_and_fractional_messaging_time() {
    let mut fractional = recipient41();
    fractional["nextMessageAt"] = json!(0.5);
    let wire = Wire::new(vec![
        (
            200,
            json!({"success":true,"data":[fractional],"page":{"nextCursor":null,"hasMore":false}}),
        ),
        (
            200,
            json!({"data":[recipient41()],"page":{"nextCursor":null,"hasMore":false}}),
        ),
        (200, json!({"success":true,"data":report41()})),
        (200, json!({"data":report41()})),
    ])
    .await;
    let m = support::messaging(wire.base.clone());
    let params = ListCampaignRecipientsParameters {
        reason: Some(CampaignRecipientFailureReason::MissingVariable),
        status: Some(CampaignRecipientStatus::Skipped),
        cursor: Some("initial /".into()),
        limit: Some(100),
    };
    let r = m
        .campaigns()
        .list_recipients("p", "c", &params, Default::default())
        .await
        .unwrap();
    assert_eq!(r.data.data[0].next_message_at, Some(0.5));
    assert_eq!(r.data.data[0].messages_sent, 0);
    assert_eq!(
        r.data.data[0].failure_reason,
        Some(CampaignRecipientFailureReason::MissingVariable)
    );
    assert_eq!(
        r.data.data[0].last_error.as_deref(),
        Some("missing_variable")
    );
    let o = support::organization(wire.base.clone());
    o.campaigns()
        .recipients(
            "c",
            &ListPlatformCampaignRecipientsParameters {
                project_id: PROJECT41.into(),
                reason: params.reason,
                status: params.status,
                cursor: params.cursor.clone(),
                limit: params.limit,
            },
            Default::default(),
        )
        .await
        .unwrap();
    let a = m
        .campaigns()
        .analytics("p", "c", Default::default())
        .await
        .unwrap()
        .data
        .data;
    assert_eq!(a.average_response_time_ms, None);
    assert_eq!(a.min_response_time_ms, Some(0.0));
    assert_eq!(a.follow_ups.next_due_at, Some(0));
    assert!(a.experiment.is_none());
    let a = o
        .campaigns()
        .analytics(
            "c",
            &PlatformCampaignParameters {
                project_id: PROJECT41.into(),
            },
            Default::default(),
        )
        .await
        .unwrap()
        .data
        .data;
    assert_eq!(a.response_rate, 0.0);
    assert_eq!(a.max_response_time_ms, None);
    assert_eq!(wire.captured()[0].path,"/messaging/projects/p/campaigns/c/recipients?reason=missing_variable&status=skipped&cursor=initial+%2F&limit=100");
    assert_eq!(wire.captured()[1].path,format!("/platform/campaigns/c/recipients?projectId={PROJECT41}&reason=missing_variable&status=skipped&cursor=initial+%2F&limit=100"));
    for field in [
        "failureReason",
        "messagesSent",
        "nextMessageAt",
        "sequenceError",
        "followUp",
    ] {
        let mut v = recipient41();
        v.as_object_mut().unwrap().remove(field);
        assert!(
            serde_json::from_value::<CampaignRecipient>(v).is_err(),
            "{field}"
        );
    }
    for field in [
        "averageResponseTimeMs",
        "minResponseTimeMs",
        "maxResponseTimeMs",
        "experiment",
        "followUps",
    ] {
        let mut v = report41();
        v.as_object_mut().unwrap().remove(field);
        assert!(
            serde_json::from_value::<CampaignAnalytics>(v).is_err(),
            "{field}"
        );
    }
}
#[tokio::test]
async fn platform_launch_is_closed_typed_preserves_false_and_open_receipt() {
    let wire=Wire::new(vec![(200,json!({"data":{"id":"c","status":"scheduled","operationId":"op","recipientCount":0,"future":false}})),(409,json!({"error":{"code":"campaign_approval_required","param":"campaign","message":"Synthetic approval refusal"}}))]).await;
    let o = support::organization(wire.base.clone());
    let body = LaunchPlatformCampaignRequest {
        project_id: PROJECT41.into(),
        scheduled_at: Some(0.5),
        skip_missing_variables: Some(false),
    };
    let r = o
        .campaigns()
        .launch("c /", &body, Default::default())
        .await
        .unwrap();
    assert_eq!(r.data.data.operation_id, "op");
    assert_eq!(r.data.data.extensions["future"], false);
    let error = o
        .campaigns()
        .launch("c /", &body, Default::default())
        .await
        .unwrap_err();
    assert_eq!(error.code.as_deref(), Some("campaign_approval_required"));
    assert_eq!(wire.captured().len(), 2);
    wire.check(
        0,
        "POST",
        "/platform/campaigns/c%20%2F/launch",
        json!({"projectId":PROJECT41,"scheduledAt":0.5,"skipMissingVariables":false}),
        "2026-09-22",
    );
    assert!(serde_json::from_value::<LaunchPlatformCampaignRequest>(
        json!({"projectId":PROJECT41,"id":"c"})
    )
    .is_err());
    assert!(serde_json::from_value::<LaunchPlatformCampaignRequest>(
        json!({"projectId":PROJECT41,"scheduledAt":null})
    )
    .is_err());
}
#[tokio::test]
async fn four_replay_routes_preserve_explicit_key_exact_body_and_default_single_attempt() {
    use polymorfa_sdk::audiences::*;
    let append = json!({"campaignId":"c","added":0,"recipientCount":0,"duplicateCount":0,"invalidCount":0,"invalidRows":[]});
    let audience = json!({"id":"audience","name":"Draft","source":"api","recipientCount":0,"fileId":null,"columns":null,"sampleRow":null,"mapping":null,"createdAt":0,"updatedAt":0,"duplicateCount":0,"invalidCount":0,"invalidRows":[]});
    let members = json!({"listId":"audience","added":0,"recipientCount":0,"duplicateCount":0,"invalidCount":0,"invalidRows":[]});
    for kind in 0..4 {
        let success = match kind {
            0 => json!({"success":true,"data":append}),
            1 => json!({"data":append}),
            2 => json!({"data":audience}),
            _ => json!({"data":members}),
        };
        let wire = Wire::raw(vec![
            (
                503,
                json!({"error":{"code":"service_unavailable","message":"fixture"}}).to_string(),
                vec![],
            ),
            (
                200,
                success.to_string(),
                vec![("idempotent-replayed".into(), "false".into())],
            ),
        ])
        .await;
        let o = support::organization(wire.base.clone());
        let m = support::messaging(wire.base.clone());
        let options = RequestOptions {
            idempotency_key: Some("caller-exact".into()),
            max_network_retries: Some(1),
            ..Default::default()
        };
        let metadata = match kind {
            0 => {
                m.campaigns()
                    .add_recipients(
                        "p",
                        "c",
                        &AddCampaignRecipientsRequest { recipients: vec![] },
                        options,
                    )
                    .await
                    .unwrap()
                    .metadata
            }
            1 => {
                o.campaigns()
                    .add_recipients(
                        "c",
                        &AddPlatformCampaignRecipientsRequest {
                            project_id: PROJECT41.into(),
                            recipients: vec![],
                        },
                        options,
                    )
                    .await
                    .unwrap()
                    .metadata
            }
            2 => {
                o.audiences()
                    .create(
                        &CreateAudienceRequest::FromMembers {
                            name: "Draft".into(),
                            source: Some(AudienceSource::Api),
                            members: Some(vec![]),
                        },
                        options,
                    )
                    .await
                    .unwrap()
                    .metadata
            }
            _ => {
                o.audiences()
                    .add_members(
                        "a /",
                        &AddAudienceMembersRequest { members: vec![] },
                        options,
                    )
                    .await
                    .unwrap()
                    .metadata
            }
        };
        let rows = wire.captured();
        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0].bytes, rows[1].bytes);
        assert_eq!(rows[0].path, rows[1].path);
        assert_eq!(rows[0].headers["idempotency-key"], "caller-exact");
        assert_eq!(rows[1].headers["idempotency-key"], "caller-exact");
        assert_eq!(metadata.attempts, 2);
        assert_eq!(metadata.headers["idempotent-replayed"], "false");
        assert!(!metadata.headers.contains_key("set-cookie"));
        let w=Wire::new(vec![(409,json!({"error":{"code":"future_conflict_code","param":"body","message":"Synthetic conflict"}}))]).await;
        let o = support::organization(w.base.clone());
        let m = support::messaging(w.base.clone());
        let e = match kind {
            0 => m
                .campaigns()
                .add_recipients(
                    "p",
                    "c",
                    &AddCampaignRecipientsRequest { recipients: vec![] },
                    Default::default(),
                )
                .await
                .unwrap_err(),
            1 => o
                .campaigns()
                .add_recipients(
                    "c",
                    &AddPlatformCampaignRecipientsRequest {
                        project_id: PROJECT41.into(),
                        recipients: vec![],
                    },
                    Default::default(),
                )
                .await
                .unwrap_err(),
            2 => o
                .audiences()
                .create(
                    &CreateAudienceRequest::FromMembers {
                        name: "Draft".into(),
                        source: None,
                        members: Some(vec![]),
                    },
                    Default::default(),
                )
                .await
                .unwrap_err(),
            _ => o
                .audiences()
                .add_members(
                    "a",
                    &AddAudienceMembersRequest { members: vec![] },
                    Default::default(),
                )
                .await
                .unwrap_err(),
        };
        assert_eq!(e.code.as_deref(), Some("future_conflict_code"));
        assert_eq!(w.captured().len(), 1);
        assert!(!w.captured()[0].headers.contains_key("idempotency-key"));
    }
}
#[tokio::test]
async fn group_testing_and_request_log_actual_public_seams_keep_principals_and_envelopes() {
    use polymorfa_sdk::{onboarding::*, request_logs::*};
    let group = json!({"success":true,"data":{"status":"unknown","syncedAt":null,"checkedAt":null,"capabilities":[{"key":"polls.endTime","kind":"feature","unit":null,"value":null,"source":null},{"key":"polls.hideVoters","kind":"feature","unit":null,"value":false,"source":"server"}]}});
    let wire=Wire::new(vec![(200,group),(200,json!({"session":"s","phone":"+15550001111","online":false,"devices":[{"deviceId":1},{"deviceId":99}]})),(202,json!({"session":"s","to":"+15550002222","messageId":null})),(200,json!({"session":"s","deviceId":1,"unlinked":true})),(200,json!({"session":"s","deviceId":99,"unlinked":true}))]).await;
    let scoped = client41(wire.base.clone());
    let g = scoped
        .groups()
        .get_capabilities("s /", "g /", Default::default())
        .await
        .unwrap();
    assert!(matches!(
        g.data.data.status,
        polymorfa_sdk::platform_sessions::SessionCapabilitiesStatus::Unknown
    ));
    assert_eq!(g.data.data.capabilities[0].value, None);
    assert_eq!(g.data.data.capabilities[1].value, Some(false));
    let m = support::messaging(wire.base.clone());
    let phone = m
        .testing()
        .get_phone("p /", "s /", Default::default())
        .await
        .unwrap();
    assert!(!phone.data.online);
    assert_eq!(phone.data.devices[1].device_id, 99);
    let sent = m
        .testing()
        .send_phone_message(
            "p /",
            "s /",
            &SendTestingPhoneMessageRequest {
                to: "+15550002222".into(),
                text: "Synthetic test".into(),
            },
            RequestOptions {
                api_version: Some("2026-10-14".into()),
                ..Default::default()
            },
        )
        .await
        .unwrap();
    assert_eq!(sent.metadata.status, 202);
    assert!(sent.data.message_id.is_none());
    for device in [1, 99] {
        assert!(
            m.testing()
                .unlink_phone_device("p /", "s /", device, Default::default())
                .await
                .unwrap()
                .data
                .unlinked
        );
    }
    wire.check(
        0,
        "GET",
        "/messaging/s%20%2F/groups/g%20%2F/capabilities",
        json!(null),
        "2026-09-22",
    );
    wire.check(
        1,
        "GET",
        "/messaging/testing/p%20%2F/numbers/s%20%2F/phone",
        json!(null),
        "2026-09-22",
    );
    wire.check(
        2,
        "POST",
        "/messaging/testing/p%20%2F/numbers/s%20%2F/phone/messages",
        json!({"to":"+15550002222","text":"Synthetic test"}),
        "2026-10-14",
    );
    assert!(!wire.captured()[2].headers.contains_key("idempotency-key"));
    assert!(scoped
        .testing()
        .get_phone("p", "s", Default::default())
        .await
        .is_err());
    assert!(scoped
        .testing()
        .send_phone_message(
            "p",
            "s",
            &SendTestingPhoneMessageRequest {
                to: "x".into(),
                text: "x".into()
            },
            Default::default()
        )
        .await
        .is_err());
    assert!(scoped
        .testing()
        .unlink_phone_device("p", "s", 1, Default::default())
        .await
        .is_err());
    assert_eq!(wire.captured().len(), 5);
    for device in [0, 100] {
        assert_eq!(
            m.testing()
                .unlink_phone_device("p", "s", device, Default::default())
                .await
                .unwrap_err()
                .kind,
            ErrorKind::Validation
        );
    }
    let log = json!({"id":"1234567890123456789","projectId":"A","createdAt":"2026-10-14T00:00:00Z","method":"POST","route":"/messaging/:session/messages/send","status":null,"durationMs":null,"result":"failure","source":"api","requestId":null,"traceId":null,"errorCode":null,"mcpTool":null,"credential":null});
    let page = json!({"data":[log],"page":{"nextCursor":null,"hasMore":false,"followCursor":""}});
    let w = Wire::new(vec![(200, page.clone()), (200, page.clone()), (200, page)]).await;
    let o = support::organization(w.base.clone());
    let a = o.project("A / ").unwrap();
    let b = o.project("B").unwrap();
    let retained = a.request_logs();
    for logs in [&retained, &b.request_logs(), &retained] {
        let p = logs
            .list(
                &ListRequestLogs {
                    cursor: Some("cursor /".into()),
                    limit: Some(1),
                    ..Default::default()
                },
                Default::default(),
            )
            .await
            .unwrap();
        assert_eq!(p.items[0].id, "1234567890123456789");
        assert_eq!(p.items[0].status, None);
        assert_eq!(p.items[0].duration_ms, None);
        assert_eq!(p.metadata.headers["x-trace-id"], "trace41");
        assert!(!p.metadata.headers.contains_key("set-cookie"));
    }
    assert_eq!(
        w.captured()[0].path,
        "/platform/projects/A%20%2F%20/request-logs?cursor=cursor+%2F&limit=1"
    );
    assert_eq!(
        w.captured()[1].path,
        "/platform/projects/B/request-logs?cursor=cursor+%2F&limit=1"
    );
    assert_eq!(w.captured()[2].path, w.captured()[0].path);
    assert!(o
        .request_logs()
        .list(&Default::default(), Default::default())
        .await
        .is_err());
    assert!(retained
        .list(
            &ListRequestLogs {
                project_id: Some("B".into()),
                ..Default::default()
            },
            Default::default()
        )
        .await
        .is_err());
    assert_eq!(w.captured().len(), 3);
}
#[tokio::test]
async fn public_seam_malformed_errors_and_cancel_are_not_successes() {
    use polymorfa_sdk::{direct_media::*, onboarding::*, request_logs::*};
    use tokio_util::sync::CancellationToken;
    for body in [
        json!({}),
        json!({"success":true,"data":null}),
        json!({"success":true,"data":[]}),
    ] {
        let w = Wire::new(vec![(200, body)]).await;
        let e = support::messaging(w.base.clone())
            .groups()
            .get_capabilities("s", "g", Default::default())
            .await
            .unwrap_err();
        assert_eq!(e.code.as_deref(), Some("invalid_response"));
        assert_eq!(e.request_id.as_deref(), Some("rust41"));
    }
    let w = Wire::raw(vec![(200, "<html>fixture</html>".into(), vec![])]).await;
    let e = support::messaging(w.base.clone())
        .testing()
        .get_phone("p", "s", Default::default())
        .await
        .unwrap_err();
    assert_eq!(e.code.as_deref(), Some("invalid_response"));
    for kind in 0..3 {
        let w = Wire::new(vec![(
            403,
            json!({"error":{"code":"future_denial","message":"Synthetic denial","param":"scope"}}),
        )])
        .await;
        let m = support::messaging(w.base.clone());
        let error = match kind {
            0 => m
                .testing()
                .get_phone("p", "s", Default::default())
                .await
                .unwrap_err(),
            1 => m
                .testing()
                .send_phone_message(
                    "p",
                    "s",
                    &SendTestingPhoneMessageRequest {
                        to: "x".into(),
                        text: "x".into(),
                    },
                    Default::default(),
                )
                .await
                .unwrap_err(),
            _ => m
                .testing()
                .unlink_phone_device("p", "s", 1, Default::default())
                .await
                .unwrap_err(),
        };
        assert_eq!(error.kind, ErrorKind::Authorization);
        assert_eq!(error.code.as_deref(), Some("future_denial"));
        assert_eq!(error.param.as_deref(), Some("scope"));
        assert_eq!(w.captured().len(), 1);
    }
    let token = CancellationToken::new();
    token.cancel();
    let options = RequestOptions {
        cancellation: Some(token),
        ..Default::default()
    };
    let m = support::messaging("http://127.0.0.1:1".into());
    let org = support::organization("http://127.0.0.1:1".into());
    assert_eq!(
        m.groups()
            .get_capabilities("s", "g", options.clone())
            .await
            .unwrap_err()
            .kind,
        ErrorKind::Cancelled
    );
    assert_eq!(
        m.testing()
            .get_phone("p", "s", options.clone())
            .await
            .unwrap_err()
            .kind,
        ErrorKind::Cancelled
    );
    assert_eq!(
        m.testing()
            .send_phone_message(
                "p",
                "s",
                &SendTestingPhoneMessageRequest {
                    to: "x".into(),
                    text: "x".into()
                },
                options.clone()
            )
            .await
            .unwrap_err()
            .kind,
        ErrorKind::Cancelled
    );
    assert_eq!(
        m.testing()
            .unlink_phone_device("p", "s", 1, options.clone())
            .await
            .unwrap_err()
            .kind,
        ErrorKind::Cancelled
    );
    assert_eq!(
        org.request_logs()
            .list(
                &ListRequestLogs {
                    project_id: Some("p".into()),
                    ..Default::default()
                },
                options.clone()
            )
            .await
            .unwrap_err()
            .kind,
        ErrorKind::Cancelled
    );
    assert_eq!(
        m.history_sync()
            .request_chunk_retry(
                "s",
                &HistoryChunkRetry {
                    sync_type: HistorySyncType::Full,
                    chunk_order: 0,
                    chunk_message_id: None,
                    regenerate: None
                },
                options.clone()
            )
            .await
            .unwrap_err()
            .kind,
        ErrorKind::Cancelled
    );
    assert_eq!(
        m.history_sync()
            .delete_chunk(
                "s",
                &HistoryChunkDelete {
                    direct_path: "/blob.enc".into(),
                    file_enc_sha256: format!("{}=", "A".repeat(43)),
                    enc_handle: None,
                    companion_meta_nonce: None
                },
                options.clone()
            )
            .await
            .unwrap_err()
            .kind,
        ErrorKind::Cancelled
    );
    assert_eq!(
        m.whatsapp_media()
            .create_upload_grant(
                "s",
                polymorfa_sdk::media_encrypt::UploadMediaType::Image,
                &[0; 32],
                options
            )
            .await
            .err()
            .unwrap()
            .kind,
        ErrorKind::Cancelled
    );
}
#[tokio::test]
async fn capability_false_success_is_a_malformed_outcome() {
    let w=Wire::new(vec![(200,json!({"success":false,"data":{"status":"unknown","syncedAt":null,"checkedAt":null,"capabilities":[]}}))]).await;
    assert!(support::messaging(w.base.clone())
        .groups()
        .get_capabilities("s", "g", Default::default())
        .await
        .is_err());
}
#[tokio::test]
async fn request_bounds_flatten_collisions_and_supplementary_controls() {
    let m = support::messaging("http://127.0.0.1:1".into());
    let o = support::organization("http://127.0.0.1:1".into());
    for mapping in [
        (0..51)
            .map(|i| (format!("k{i}"), CampaignVariableBinding::default()))
            .collect(),
        [("bad key".into(), CampaignVariableBinding::default())].into(),
    ] {
        let b = UpdateCampaignRequest {
            variable_mapping: Some(Some(mapping)),
            ..Default::default()
        };
        assert_eq!(
            m.campaigns()
                .update("p", "c", &b, Default::default())
                .await
                .unwrap_err()
                .kind,
            ErrorKind::Validation
        );
    }
    for links in [
        (0..6)
            .map(|i| CampaignTrackedLink {
                key: format!("k{i}"),
                url: "https://example.com".into(),
            })
            .collect(),
        vec![
            CampaignTrackedLink {
                key: "same".into(),
                url: "https://example.com/a".into(),
            },
            CampaignTrackedLink {
                key: "same".into(),
                url: "https://example.com/b".into(),
            },
        ],
        vec![CampaignTrackedLink {
            key: "a".into(),
            url: "https://localhost/internal".into(),
        }],
    ] {
        let b = UpdateCampaignRequest {
            tracked_links: Some(Some(links)),
            ..Default::default()
        };
        assert_eq!(
            m.campaigns()
                .update("p", "c", &b, Default::default())
                .await
                .unwrap_err()
                .kind,
            ErrorKind::Validation
        );
    }
    for key in [
        "name",
        "templateId",
        "variableMapping",
        "trackedLinks",
        "messagesArray",
    ] {
        let b = UpdatePlatformCampaignRequest {
            extensions: [(key.into(), json!(null))].into(),
            ..Default::default()
        };
        assert_eq!(
            o.campaigns()
                .update(
                    "c",
                    Some(&b),
                    &PlatformCampaignParameters {
                        project_id: PROJECT41.into()
                    },
                    Default::default()
                )
                .await
                .unwrap_err()
                .kind,
            ErrorKind::Validation
        );
    }
    let bad = UpdatePlatformCampaignRequest {
        messages_array: Some(vec![CampaignMessage {
            extensions: [("source".into(), json!("collision"))].into(),
            ..Default::default()
        }]),
        ..Default::default()
    };
    assert_eq!(
        o.campaigns()
            .update(
                "c",
                Some(&bad),
                &PlatformCampaignParameters {
                    project_id: PROJECT41.into()
                },
                Default::default()
            )
            .await
            .unwrap_err()
            .kind,
        ErrorKind::Validation
    );
    let receipt = json!({"success":true,"data":{"id":"link","url":"https://example.com/link","purpose":"add_connection","session":"s","connectionGoal":"hybrid","addConnection":"official_api","expiresAt":null}});
    let wire = Wire::new(vec![
        (200, receipt),
        (200, json!({"success":true,"data":session41()})),
        (200, json!({"success":true,"data":session41()})),
    ])
    .await;
    let client = support::messaging(wire.base.clone());
    client
        .quick_links()
        .create(
            &CreateQuickLinkRequest {
                purpose: Some(polymorfa_sdk::models::CreateQuickLinkPurpose::AddConnection),
                session: Some("s".into()),
                add_connection: Some(polymorfa_sdk::models::ConnectionKind::OfficialApi),
                connection_goal: Some(polymorfa_sdk::models::ConnectionGoal::Hybrid),
                ..Default::default()
            },
            Default::default(),
        )
        .await
        .unwrap();
    client
        .sessions()
        .retrieve("s", Default::default())
        .await
        .unwrap();
    let org = support::organization(wire.base.clone());
    let fact = org
        .sessions()
        .retrieve(
            "s",
            RequestOptions {
                api_version: Some("2026-10-14".into()),
                ..Default::default()
            },
        )
        .await
        .unwrap();
    assert_eq!(
        fact.data.data.signal_mode,
        Some(polymorfa_sdk::campaign_contracts::SignalCustodyMode::ZeroKnowledge)
    );
    assert_eq!(
        wire.captured()[0].headers["polymorfa-version"],
        "2026-09-22"
    );
    assert_eq!(
        wire.captured()[1].headers["polymorfa-version"],
        "2026-09-22"
    );
    assert_eq!(
        wire.captured()[2].headers["polymorfa-version"],
        "2026-10-14"
    );
}

#[test]
fn regression41_projected_provider_ids_require_an_actual_nonnull_reference() {
    let valid = json!({"delivery":"descriptor","whatsapp_ids":{"linked_devices":"notification"},"syncType":"FULL","fileLength":0,"inline":{"encoding":"zlib-base64-protobuf","data":"fixture"}});
    for ids in [
        json!({}),
        json!({"linked_devices":null,"official_api":"ok"}),
        json!({"linked_devices":""}),
        json!({"linked_devices":"x".repeat(513)}),
        json!({"linked_devices":"ok","future":"bad"}),
    ] {
        let mut v = valid.clone();
        v["whatsapp_ids"] = ids;
        assert!(verified_history(v).is_err());
    }
    for key in ["whatsapp_id", "original_whatsapp_id"] {
        let mut v = valid.clone();
        v[key] = json!("");
        assert!(verified_history(v).is_err());
    }
}
#[tokio::test]
async fn regression41_testing_message_requires_its_nullable_id() {
    let w = Wire::new(vec![(202, json!({"session":"s","to":"phone"}))]).await;
    assert!(support::messaging(w.base.clone())
        .testing()
        .send_phone_message(
            "p",
            "s",
            &polymorfa_sdk::onboarding::SendTestingPhoneMessageRequest {
                to: "phone".into(),
                text: "fixture".into()
            },
            Default::default()
        )
        .await
        .is_err());
}
#[tokio::test]
async fn regression41_unlink_requires_the_acknowledged_true_outcome() {
    let w = Wire::new(vec![(
        200,
        json!({"session":"s","deviceId":1,"unlinked":false}),
    )])
    .await;
    assert!(support::messaging(w.base.clone())
        .testing()
        .unlink_phone_device("p", "s", 1, Default::default())
        .await
        .is_err());
}
#[tokio::test]
async fn regression41_relay_malformed_location_keeps_safe_metadata() {
    let w = Wire::new(vec![(
        200,
        json!({"success":true,"data":{"directPath":"","url":""}}),
    )])
    .await;
    let e = support::messaging(w.base.clone())
        .whatsapp_media()
        .relay_upload(
            "s",
            polymorfa_sdk::media_encrypt::UploadMediaType::Image,
            &[0; 32],
            reqwest::Body::from(vec![0u8]),
            1,
            Default::default(),
        )
        .await
        .err()
        .unwrap();
    assert_eq!(e.request_id.as_deref(), Some("rust41"));
}
#[tokio::test]
async fn regression41_group_nullable_facts_require_presence() {
    let w = Wire::new(vec![(
        200,
        json!({"success":true,"data":{"status":"unknown","capabilities":[]}}),
    )])
    .await;
    assert!(support::messaging(w.base.clone())
        .groups()
        .get_capabilities("s", "g", Default::default())
        .await
        .is_err());
}
#[tokio::test]
async fn regression41_platform_retrieve_requires_its_nullable_data_property() {
    let w = Wire::new(vec![(200, json!({}))]).await;
    assert!(support::organization(w.base.clone())
        .campaigns()
        .retrieve(
            "c",
            &PlatformCampaignParameters {
                project_id: PROJECT41.into()
            },
            Default::default()
        )
        .await
        .is_err());
}
