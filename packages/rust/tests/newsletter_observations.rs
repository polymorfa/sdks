use polymorfa_sdk::{channels::ChannelMessage, webhook_payloads::KnownWebhookPayload, webhooks::*};
use serde_json::{json, Value};

#[test]
fn newsletter_metadata_roundtrips_in_native_single_and_batch_deliveries() {
    let fixture: Value = serde_json::from_str(include_str!(
        "../../../contracts/fixtures/newsletter-observations/delivery.json"
    ))
    .unwrap();
    let secret = fixture["secret"].as_str().unwrap();
    let check = |event: &WebhookEvent, expected: &Value| {
        let payload = match event {
            WebhookEvent::Known {
                payload: KnownWebhookPayload::NewsletterUpdate(payload),
                ..
            } => payload,
            _ => panic!("newsletter typed event lost"),
        };
        assert_eq!(serde_json::to_value(payload).unwrap(), expected["payload"]);
        if payload.action == "live_update" {
            let rows = payload.messages.as_ref().unwrap();
            assert_eq!(rows[0].forwards, Some(0));
            assert!(rows[0].reaction_counts.as_ref().unwrap().is_empty());
            assert!(rows[1].message.is_none());
            assert!(rows[1].forwards.is_none());
        }
    };
    for expected in fixture["events"].as_array().unwrap() {
        let event = parse_verified_event(&serde_json::to_vec(expected).unwrap()).unwrap();
        check(&event, expected);
        let encoded = create_fixture(&event, secret).unwrap();
        check(
            &construct_event(&encoded.body, &encoded.signature, secret).unwrap(),
            expected,
        );
    }
    let raw = serde_json::to_vec(&json!({"object":"event_batch","version":1,"id":fixture["batchId"],"events":fixture["events"]})).unwrap();
    let batch = match parse_verified_delivery(&raw).unwrap() {
        WebhookDelivery::Batch(batch) => batch,
        _ => panic!("batch lost"),
    };
    for (index, event) in batch.events.iter().enumerate() {
        check(event, &fixture["events"][index]);
    }
    let channel: ChannelMessage = serde_json::from_str(include_str!(
        "../../../contracts/fixtures/newsletter-observations/channel-message.json"
    ))
    .unwrap();
    assert_eq!(channel.forwards, Some(0));
}
