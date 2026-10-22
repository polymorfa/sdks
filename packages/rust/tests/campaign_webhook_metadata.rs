use hmac::{Hmac, Mac};
use polymorfa_sdk::{
    official_round2::{construct_delivery, WebhookDelivery},
    webhook_payloads::KnownWebhookPayload,
    webhooks::WebhookEvent,
};
use serde_json::{json, Value};
use sha2::Sha256;

fn signed(value: &Value, secret: &str) -> polymorfa_sdk::Result<WebhookDelivery> {
    let raw = serde_json::to_vec(value).unwrap();
    let mut mac = Hmac::<Sha256>::new_from_slice(secret.as_bytes()).unwrap();
    mac.update(&raw);
    construct_delivery(&raw, &hex::encode(mac.finalize().into_bytes()), secret)
}
fn check(event: &WebhookEvent, expected: &Value, index: usize) {
    assert_eq!(event.envelope().id, expected["id"].as_str().unwrap());
    assert_eq!(event.envelope().payload, expected["payload"]);
    let WebhookEvent::Known { payload, .. } = event else {
        panic!("public typed payload")
    };
    match payload {
        KnownWebhookPayload::CampaignPaused(p) => {
            assert_eq!(p.paused_at, 1757161200);
            if index == 0 {
                assert_eq!(p.reason.as_deref(), Some("Automatic safety pause"));
                assert_eq!(p.code.as_deref(), Some("future_automatic_pause"));
            } else {
                assert!(p.reason.is_none() && p.code.is_none());
                let encoded = serde_json::to_value(p).unwrap();
                assert!(encoded.get("reason").is_none() && encoded.get("code").is_none());
            }
        }
        KnownWebhookPayload::CampaignRecipientSkipped(p) => {
            assert_eq!(p.skipped_at, 1757161200000);
            match index {
                2 => {
                    assert_eq!(p.message_index, Some(0));
                    assert!(p.follow_up_id.is_none());
                }
                3 => {
                    assert_eq!(p.message_index, Some(1));
                    assert_eq!(
                        p.follow_up_id.as_deref(),
                        Some("0198a2cb-0000-7000-8000-0000000000f1")
                    );
                }
                _ => {
                    assert!(p.message_index.is_none() && p.follow_up_id.is_none());
                    assert_eq!(p.reason, "future_skip_reason");
                    let encoded = serde_json::to_value(p).unwrap();
                    assert!(
                        encoded.get("messageIndex").is_none()
                            && encoded.get("followUpId").is_none()
                    );
                }
            }
        }
        _ => panic!("wrong typed campaign event"),
    }
}
#[test]
fn campaign_metadata_signed_single_and_mixed_batch() {
    let fixture: Value = serde_json::from_str(include_str!(
        "../../../contracts/fixtures/campaign-webhook-metadata.json"
    ))
    .unwrap();
    let secret = fixture["secret"].as_str().unwrap();
    let events = fixture["events"].as_array().unwrap();
    for (i, event) in events.iter().enumerate() {
        let WebhookDelivery::Single(single) = signed(event, secret).unwrap() else {
            panic!("single")
        };
        check(&single, event, i);
    }
    let batch = json!({"object":"event_batch","version":1,"id":fixture["batchId"],"events":events});
    let WebhookDelivery::Batch(actual) = signed(&batch, secret).unwrap() else {
        panic!("batch")
    };
    assert_eq!(actual.events.len(), 5);
    for (i, event) in actual.events.iter().enumerate() {
        check(event, &events[i], i);
    }
    for (i, key, value) in [
        (0, "code", json!([])),
        (2, "messageIndex", json!("zero")),
        (3, "followUpId", json!(42)),
    ] {
        let mut bad = events[i].clone();
        bad["payload"][key] = value;
        assert!(signed(&bad, secret).is_err());
    }
    assert!(construct_delivery(b"not JSON", "bad", secret).is_err());
    let raw = serde_json::to_vec(&batch).unwrap();
    let mut mac = Hmac::<Sha256>::new_from_slice(secret.as_bytes()).unwrap();
    mac.update(&raw);
    let mut tampered = raw;
    tampered.push(b' ');
    assert!(
        construct_delivery(&tampered, &hex::encode(mac.finalize().into_bytes()), secret).is_err()
    );
}
