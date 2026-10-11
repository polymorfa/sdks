use hmac::{Hmac, Mac};
use polymorfa_sdk::{webhook_payloads::KnownWebhookPayload, webhooks::*};
use serde_json::{json, Value};
use sha2::Sha256;
use std::collections::BTreeSet;
#[allow(dead_code)]
mod support;
fn merge(mut base: Value, fields: Value) -> Value {
    base.as_object_mut()
        .unwrap()
        .extend(fields.as_object().unwrap().clone());
    base
}
fn identity() -> Value {
    json!({"id":"person","phoneNumber":"+15551234567","bsuid":"bsuid","username":"pat"})
}
fn ids() -> Value {
    json!({"linked_devices":"wa","official_api":"cloud"})
}
fn linked() -> Value {
    json!({"id":"message","whatsapp_ids":ids(),"whatsapp_id":"wa","conversation":merge(identity(),json!({"sender":identity()})),"fromMe":false,"timestamp":1800000000,"pushName":"Pat","isGroup":false,"type":"text","text":"hello","caption":"Caption","mimeType":"image/jpeg","ptt":false,"filename":"photo.jpg","latitude":12.5,"longitude":34.0,"displayName":"Pat","title":"Title","reaction":"👍","reactionTo":"prior","revokedId":"revoked","media":"descriptor","mediaUrl":"https://mmg.whatsapp.net/file","edited":true,"pollOptions":[{"name":"Coffee","hash":"hash"}],"unavailable":false,"unavailableReason":"none","nativeFlowResponse":{"name":"flow","paramsJson":"{}","version":1},"replyChoice":{"kind":"button","id":"reply"},"parentMessageId":"parent","futureField":{"preserved":true}})
}
fn cloud() -> Value {
    json!({"id":"message","whatsapp_ids":ids(),"whatsapp_id":"cloud","conversation":identity(),"timestamp":"1800000000","type":"interactive","senderName":"Pat","nativeFlowResponse":{"name":"flow","paramsJson":"{}"},"replyChoice":{"kind":"list","id":"row"},"parentMessageId":"parent","interactive":{"type":"button"},"referral":{"source_type":"ad","source_id":"ad-id","source_url":"https://example.com/ad","ctwa_clid":"click","future":true},"futureField":[1,2]})
}
fn customer() -> Value {
    json!({"eventId":"event","occurredAt":"2026-10-11T12:00:00Z","organizationId":"org","projectId":"project","customerId":"customer","actorKind":"org_key"})
}
fn signed(event: &str, payload: Value) -> WebhookEvent {
    let raw=serde_json::to_vec(&json!({"id":"event","session":"s","externalId":"external","timestamp":"2026-10-11T12:00:00Z","event":event,"payload":payload})).unwrap();
    let mut mac = Hmac::<Sha256>::new_from_slice(b"native-secret").unwrap();
    mac.update(&raw);
    let signature = format!("sha256={}", hex::encode(mac.finalize().into_bytes()));
    let decoded = construct_event(&raw, &signature, "native-secret").unwrap();
    assert!(!verify_signature(
        &[raw.as_slice(), b" "].concat(),
        &signature,
        "native-secret"
    ));
    decoded
}
#[test]
fn every_pinned_known_event_has_a_typed_verified_payload_and_unknown_events_preserve_json() {
    let participant = json!({"id":"p","phoneNumber":"+15551234567","bsuid":"bsuid","username":"pat","audioMuted":false,"video":false,"state":"connected","handRaised":true});
    let capabilities = json!({"session":"s","projectId":"project","status":"synced","syncedAt":null,"checkedAt":null,"accountType":"business","capabilities":[{"key":"channels","kind":"feature","unit":null,"value":true,"source":"server"}],"changedKeys":["channels"]});
    let customer_link = merge(customer(), json!({"pairingLinkId":"link"}));
    let voice = json!({"eventId":"event","occurredAt":"2026-10-11T12:00:00Z","organizationId":"org","projectId":"project","assetId":"asset","name":"Greeting","source":"tts"});
    let cases = vec![
        (
            "bansafe.action",
            json!({"phoneNumber":"+15551234567","action":"applied","scope":"number","rung":"notify","previousRung":null,"reason":"health","health":50.0,"healthBand":"fair","requires":[{"findingKey":"finding","title":"Review","severity":"warning"}],"throughputPerMinute":10.0,"eligibleLiftAt":null,"liftRequires":"review","appealUrl":"https://example.com/appeal","startedAt":"2026-10-11","docs":"https://example.com/docs"}),
        ),
        (
            "bansafe.claim",
            json!({"id":"claim","incidentId":"incident","phoneNumber":"+15551234567","status":"filed","verdict":"inconclusive","windowStart":"2026-10-10","windowEnd":"2026-10-11","measuredCents":1.5,"capCents":2.0,"amountCents":1.5,"summary":"Review","reason":"Review","decidedAt":null,"paidAt":null}),
        ),
        (
            "bansafe.health_threshold",
            json!({"sessionId":"s","projectId":"project","health":50.0,"threshold":60.0,"healthSource":"rules_v1","estimatorVersion":"1","modelVersion":null,"evaluatedAt":"2026-10-11","policyVersion":1,"episodeId":"episode","actionId":"action"}),
        ),
        (
            "bansafe.incident",
            json!({"id":"incident","phoneNumber":"+15551234567","kind":"timelock","source":"runtime","startedAt":"2026-10-11","endsAt":null,"belief":0.7,"resolution":"open","claimId":null,"closedAt":null}),
        ),
        (
            "blocklist.update",
            json!({"action":"update","changes":[merge(identity(),json!({"action":"add"}))]}),
        ),
        (
            "business.quick_reply.update",
            json!({"id":"reply","shortcut":"help","message":"Hello","keywords":["help"],"count":1,"deleted":false,"associatedLabelIds":["label"],"observedAt":1800000000,"fromFullSync":true}),
        ),
        (
            "call.accepted",
            json!({"from":identity(),"callId":"call","answeredBy":"bot","exclusive":true,"sessionConnection":"linked_device","capabilities":{"video":true,"invite":true}}),
        ),
        (
            "call.connection_joined",
            json!({"callId":"call","connection":{"id":"connection","participant":"server:bot","transport":"socket"}}),
        ),
        (
            "call.connection_left",
            json!({"callId":"call","connectionId":"connection","participant":"server:bot","reason":"sip_no_answer"}),
        ),
        (
            "call.ended",
            json!({"from":null,"callId":"call","durationSeconds":6.5,"reason":"pod_lost","direction":"outbound","hadVideo":false,"sessionConnection":"cloud_api"}),
        ),
        (
            "call.missed",
            json!({"from":identity(),"callId":"call","reason":"timeout"}),
        ),
        (
            "call.participant_joined",
            json!({"callId":"call","participant":participant}),
        ),
        (
            "call.participant_left",
            json!({"callId":"call","participantId":"p","reason":"left"}),
        ),
        (
            "call.participant_state",
            json!({"callId":"call","participant":participant}),
        ),
        (
            "call.permission_changed",
            json!({"conversation":identity(),"status":"temporary","previousStatus":"none","expiresAt":"2026-10-12","source":"user_action","changedAt":"2026-10-11"}),
        ),
        (
            "call.received",
            json!({"from":identity(),"callId":"call","hasVideo":true,"sessionConnection":"linked_device","capabilities":{"video":true,"invite":true}}),
        ),
        ("call.rejected", json!({"from":identity(),"callId":"call"})),
        (
            "call.telemetry",
            json!({"callId":"call","setupMs":1.0,"ringMs":2.0,"durationSeconds":6.5,"terminateReason":"normal","codec":"opus","jitterMs":3.0,"packetsLost":0,"rttMs":4.0,"recvKbps":5.0,"sendKbps":6.0}),
        ),
        (
            "campaign.cap_reached",
            json!({"campaignId":"c","sessionKey":"s","phone":"+15551234567","capType":"daily","capLimit":1,"windowResetsAt":1800000000,"at":1800000000}),
        ),
        (
            "campaign.cold_blocked",
            json!({"campaignId":"c","recipientId":"r","phone":"+15551234567","surface":"linked_device","reason":"safety","at":1800000000}),
        ),
        (
            "campaign.completed",
            json!({"campaignId":"c","sentCount":1,"deliveredCount":1,"readCount":1,"failedCount":0,"skippedCount":0,"responseCount":1,"completedAt":1800000000,"durationMs":100}),
        ),
        (
            "campaign.failed",
            json!({"campaignId":"c","reason":"failure","failedAt":1800000000}),
        ),
        (
            "campaign.launched",
            json!({"campaignId":"c","name":"Notice","recipientCount":1,"scheduled":false,"launchedAt":1800000000}),
        ),
        (
            "campaign.paused",
            json!({"campaignId":"c","sentCount":1,"remainingCount":1,"pausedAt":1800000000}),
        ),
        (
            "campaign.recipient_failed",
            json!({"campaignId":"c","recipientId":"r","phone":"+15551234567","attempts":1,"error":"failed","failedAt":1800000000}),
        ),
        (
            "campaign.recipient_sent",
            json!({"campaignId":"c","recipientId":"r","phone":"+15551234567","sessionKey":"s","externalMessageId":"message","variantKey":"v","attempt":1}),
        ),
        (
            "campaign.recipient_skipped",
            json!({"campaignId":"c","recipientId":"r","phone":"+15551234567","reason":"opted_out","skippedAt":1800000000}),
        ),
        (
            "campaign.rescheduled",
            json!({"campaignId":"c","previousScheduledAt":null,"scheduledAt":1800000000,"rescheduledAt":1800000000}),
        ),
        (
            "campaign.resumed",
            json!({"campaignId":"c","sentCount":1,"remainingCount":1,"resumedAt":1800000000}),
        ),
        (
            "campaign.stopped",
            json!({"campaignId":"c","sentCount":1,"abandonedCount":1,"stoppedAt":1800000000}),
        ),
        (
            "campaign.throttled",
            json!({"campaignId":"c","sessionKey":"s","reason":"rate","deferredCount":1,"at":1800000000}),
        ),
        (
            "chat.archive",
            json!({"from":identity(),"archive":true,"pinned":false}),
        ),
        ("chat.clear", json!({"from":identity()})),
        ("chat.delete", json!({"from":identity()})),
        (
            "chat.mute",
            json!({"from":identity(),"muted":true,"muteEndTimestamp":1800000000}),
        ),
        ("chat.read", json!({"from":identity(),"read":true})),
        (
            "command.result",
            json!({"requestId":"request","command":"send","success":true,"data":{"status":"sent"},"error":"none"}),
        ),
        (
            "contact.opted_in",
            json!({"phone":"+15551234567","source":"stop-keyword","keyword":"START","session":"s","projectId":"project"}),
        ),
        (
            "contact.opted_out",
            json!({"phone":"+15551234567","source":"stop-keyword","keyword":"STOP","session":"s","projectId":"project"}),
        ),
        (
            "contact.sync",
            json!({"kind":"contacts","value":{"contacts":[{"id":"person"}]}}),
        ),
        (
            "contact.update",
            merge(
                identity(),
                json!({"fullName":"Pat","firstName":"Pat","pushName":"Pat","oldPushName":"P","businessName":"Shop","oldBusinessName":"Old shop","pictureId":"picture","pictureRemoved":false}),
            ),
        ),
        ("customer.archived", customer()),
        (
            "customer.archiving",
            merge(
                customer(),
                json!({"blockingNumberCount":1,"revokedPairingLinkCount":2}),
            ),
        ),
        ("customer.created", customer()),
        (
            "customer.enabled",
            merge(customer(), json!({"migratedNumberCount":2})),
        ),
        (
            "customer.number.attached",
            merge(customer(), json!({"sessionId":"s","pairingLinkId":"link"})),
        ),
        (
            "customer.number.disconnected",
            merge(customer(), json!({"sessionId":"s","reason":"removed"})),
        ),
        (
            "customer.number.transferred",
            merge(
                customer(),
                json!({"sessionId":"s","sourceCustomerId":"old"}),
            ),
        ),
        (
            "customer.pairing_link.connected",
            merge(customer_link.clone(), json!({"sessionId":"s"})),
        ),
        ("customer.pairing_link.created", customer_link.clone()),
        ("customer.pairing_link.expired", customer_link.clone()),
        (
            "customer.pairing_link.failed",
            merge(customer_link.clone(), json!({"errorCode":"expired"})),
        ),
        ("customer.pairing_link.opened", customer_link.clone()),
        (
            "customer.pairing_link.revoked",
            merge(customer_link, json!({"reason":"customer_archived"})),
        ),
        ("customer.restored", customer()),
        (
            "customer.updated",
            merge(customer(), json!({"fields":["name","externalCustomerId"]})),
        ),
        (
            "group.participant",
            json!({"id":"g","joined":[identity()],"left":[identity()],"promoted":[identity()],"demoted":[identity()],"reason":"invite_link","initiatedBy":"business","requestId":"request","failedParticipants":[{"participant":identity(),"errors":[{"code":1,"title":"Failure"}]}],"errors":[{"code":1}],"joinRequest":{"joinRequestId":"request","user":identity(),"state":"created"}}),
        ),
        (
            "group.update",
            json!({"id":"g","newSubject":"Team","newDescription":"Work","action":"settings_updated","requestId":"request","inviteLink":"https://example.com/invite","joinApprovalRequired":true,"pictureChanged":true,"failedChanges":["subject","picture"],"errors":[{"code":1,"title":"Failure"}]}),
        ),
        (
            "history.sync",
            json!({"whatsapp_ids":ids(),"whatsapp_id":"wa","original_whatsapp_ids":ids(),"original_whatsapp_id":"original","messages":[{"id":"m","whatsapp_ids":ids(),"whatsapp_id":"wa","conversation":identity(),"fromMe":false}],"mode":"deliver","syncType":"INITIAL_BOOTSTRAP","chunkOrder":1,"progress":100,"fileLength":1,"conversationCount":1,"messageCount":1,"pushNameCount":1,"statusMessageCount":1,"whatsapp":{"encoding":"gzip-base64-protobuf","data":"AAAA"}}),
        ),
        (
            "labels.update",
            json!({"action":"star","labelId":"label","from":identity(),"label":"label","name":"Important","color":1,"orderIndex":1,"deleted":false,"labeled":true,"observedAt":1800000000,"messageId":"m","starred":true}),
        ),
        (
            "message.ack",
            json!({"messages":[{"id":"m","whatsapp_ids":ids(),"whatsapp_id":"wa"}],"conversation":identity(),"from":identity(),"sender":identity(),"type":"read","timestamp":1800000000,"pricing":{"billable":false,"pricing_model":"PMP","category":"service","type":"free_customer_service"}}),
        ),
        (
            "message.delete",
            json!({"from":identity(),"sender":identity(),"id":"m","whatsapp_ids":ids(),"whatsapp_id":"wa","conversation":identity(),"fromMe":false}),
        ),
        (
            "message.echo",
            json!({"source":"whatsapp_business_app","value":{"message":"echo"}}),
        ),
        ("message.edited", linked()),
        (
            "message.failed",
            json!({"to":identity(),"type":"text","error":"send_failed","code":"provider_error","retryAfter":1,"timestamp":1800000000}),
        ),
        ("message.reaction", cloud()),
        ("message.received", linked()),
        ("message.revoked", linked()),
        (
            "message.sent",
            json!({"id":"m","whatsapp_ids":ids(),"whatsapp_id":"wa","conversation":identity(),"type":"text","timestamp":1800000000}),
        ),
        ("message.update", linked()),
        (
            "message.vote",
            json!({"conversation":identity(),"pollMessageId":"m","voter":identity(),"selectedHashes":["hash"],"timestamp":1800000000}),
        ),
        (
            "newsletter.update",
            json!({"id":"newsletter","action":"mute","muted":true}),
        ),
        (
            "order.payment_updated",
            json!({"reportedBy":"whatsapp","providerEventId":"provider","referenceId":"order","conversation":{"id":"person","phoneNumber":"+15551234567"},"kind":"payment_status","status":"captured","amount":{"value":100.0,"offset":100.0},"currency":"BRL","transaction":{"id":"tx","providerTransactionId":"provider-tx","provider":"bank","status":"captured","method":"pix","errorCode":"none"}}),
        ),
        (
            "presence.update",
            json!({"observedAt":1800000000,"from":identity(),"sender":identity(),"state":"online","media":"audio","unavailable":false,"lastSeen":1800000000}),
        ),
        ("session.capabilities_updated", capabilities),
        (
            "session.connected",
            json!({"phoneNumber":"+15551234567","id":"person","pushName":"Pat","phonePlatform":"android","accountType":"business_app","businessName":"Shop"}),
        ),
        (
            "session.logged_out",
            json!({"reason":"device_removed","code":401}),
        ),
        (
            "session.phone_offline",
            json!({"daysSinceLastSeen":7,"daysRemaining":7,"lastSeen":"2026-10-04","action":"reminder"}),
        ),
        (
            "session.restriction_updated",
            json!({"type":"reachout_timelock","active":true,"enforcementType":null,"expiresAt":null,"observedAt":"2026-10-11"}),
        ),
        (
            "session.status",
            json!({"status":"FAILED","statusReason":"ban","banCode":403,"banReason":"ban","banExpiresAt":1800000000,"detail":"provider"}),
        ),
        (
            "template.status",
            json!({"templateName":"hello","templateId":"template","status":"APPROVED","category":"UTILITY","reason":"approved","qualityRating":"GREEN"}),
        ),
        (
            "usage.recorded",
            json!({"id":"usage","meter":"call.duration","quantity":6.5,"unit":"second","dimensions":{"direction":"outbound","video":false,"participants":1.0},"keySource":"none","sourceKind":"call","sourceId":"call","projectId":"project","session":"s","occurredAt":"2026-10-11","recordedAt":"2026-10-11","revision":1,"pricingState":"unpriced","rateCard":null,"pricedCredits":null}),
        ),
        (
            "voice.asset_failed",
            merge(voice.clone(), json!({"failureReason":"future_failure"})),
        ),
        (
            "voice.asset_ready",
            merge(
                voice,
                json!({"durationMs":100,"contentSha256":"a".repeat(64),"originalFormat":"future_format"}),
            ),
        ),
    ];
    assert_eq!(
        cases
            .iter()
            .map(|(event, _)| *event)
            .collect::<BTreeSet<_>>(),
        KNOWN_EVENT_TYPES.iter().copied().collect()
    );
    for (event, expected) in cases {
        let result = signed(event, expected.clone());
        let typed = match &result {
            WebhookEvent::MessageReceived { payload, .. } => serde_json::to_value(payload).unwrap(),
            WebhookEvent::MessageSent { payload, .. } => serde_json::to_value(payload).unwrap(),
            WebhookEvent::SessionStatus { payload, .. } => serde_json::to_value(payload).unwrap(),
            WebhookEvent::Known { payload, .. } => {
                serde_json::to_value(payload).unwrap()["payload"].clone()
            }
            WebhookEvent::Unknown(_) => panic!("known event {event} lost its typed payload"),
        };
        support::assert_subset(&expected, &typed);
        assert_eq!(result.envelope().external_id.as_deref(), Some("external"));
    }
    let unknown = signed("future.event", json!({"opaque":[1,{"nested":true}]}));
    assert!(matches!(unknown, WebhookEvent::Unknown(_)));
    assert_eq!(
        unknown.envelope().payload,
        json!({"opaque":[1,{"nested":true}]})
    );
}
#[test]
fn cloud_variants_and_payment_method_selections_preserve_distinct_shapes() {
    assert!(matches!(
        signed("message.received", cloud()),
        WebhookEvent::MessageReceived {
            payload: MessageReceivedPayload::OfficialApi(_),
            ..
        }
    ));
    let cloud_status = json!({"source":"meta","kind":"account_alerts","wabaId":"waba","value":{"alert":"warning"}});
    assert!(matches!(
        signed("session.status", cloud_status),
        WebhookEvent::SessionStatus {
            payload: SessionStatusPayload::OfficialApi(_),
            ..
        }
    ));
    for (event, payload) in [
        (
            "history.sync",
            json!({"kind":"history","value":{"history":[1]}}),
        ),
        (
            "template.status",
            json!({"kind":"message_template_quality_update","event":"UPDATE","templateId":"template","templateName":"hello","language":"en_US","reason":"review","previousQualityScore":"GREEN","newQualityScore":"YELLOW","wabaId":"waba"}),
        ),
        (
            "order.payment_updated",
            json!({"reportedBy":"whatsapp","providerEventId":"provider","referenceId":"order","conversation":{"phoneNumber":"+15551234567"},"kind":"payment_method_selected","messageId":"m","paymentMethod":"card","lastFourDigits":"1234","credentialId":"credential","paymentTimestamp":1800000000}),
        ),
    ] {
        let result = signed(event, payload.clone());
        let WebhookEvent::Known { payload: typed, .. } = result else {
            panic!()
        };
        support::assert_subset(&payload, &serde_json::to_value(typed).unwrap()["payload"]);
    }
    // Only the message.sent fields are required, unlike a received Linked Devices message.
    let sent = signed(
        "message.sent",
        json!({"id":"m","whatsapp_ids":ids(),"conversation":{"id":"person"},"type":"text","timestamp":1800000000}),
    );
    assert!(matches!(sent, WebhookEvent::MessageSent { .. }));
    let encoded = serde_json::to_value(KnownWebhookPayload::MessageReceived(
        serde_json::from_value(cloud()).unwrap(),
    ))
    .unwrap();
    assert_eq!(encoded["payload"]["timestamp"], "1800000000");
}
