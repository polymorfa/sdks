#[allow(dead_code)]
mod support;
use hmac::{Hmac, Mac};
use polymorfa_sdk::{official_round2::*, webhooks::*, RequestOptions};
use serde_json::{json, Value};
use sha2::Sha256;

#[tokio::test]
async fn number_cache_and_marketing_wire() {
    let state = json!({"catalogId":"123","syncedAt":null,"stale":true,"productCount":1,"lastAttempt":{"startedAt":"now","finishedAt":null,"outcome":"future"}});
    let page =
        json!({"catalog":state,"products":[{"id":"p","price":"0.10"}],"nextCursor":"next_-"});
    let (base, served) = support::wire(
        "GET",
        "/messaging/n%20%2Fx/catalogs/123/products?limit=100&cursor=next_-",
        None,
        json!({"success":true,"data":page}),
    )
    .await;
    let c = support::messaging(base);
    let p = c
        .catalogs()
        .list_products(
            "n /x",
            "123",
            &CatalogProductsParameters {
                limit: Some(100),
                cursor: Some("next_-".into()),
            },
            RequestOptions::default(),
        )
        .await
        .unwrap();
    assert_eq!(p.data.data.products[0].price.as_deref(), Some("0.10"));
    served.await.unwrap();
    let (base, served) = support::wire(
        "GET",
        "/messaging/n/catalogs",
        None,
        json!({"success":true,"data":{"catalogs":[state.clone()]}}),
    )
    .await;
    assert_eq!(
        support::messaging(base)
            .catalogs()
            .list("n", RequestOptions::default())
            .await
            .unwrap()
            .data
            .data
            .catalogs
            .len(),
        1
    );
    served.await.unwrap();
    let (base, served) = support::wire(
        "GET",
        "/messaging/n/catalogs/123",
        None,
        json!({"success":true,"data":state.clone()}),
    )
    .await;
    assert!(support::messaging(base)
        .catalogs()
        .retrieve("n", "123", RequestOptions::default())
        .await
        .unwrap()
        .data
        .data
        .synced_at
        .is_none());
    served.await.unwrap();
    let (base, served) = support::wire(
        "POST",
        "/messaging/n/catalogs/123/sync",
        None,
        json!({"success":true,"data":state}),
    )
    .await;
    support::messaging(base)
        .catalogs()
        .sync("n", "123", RequestOptions::default())
        .await
        .unwrap();
    served.await.unwrap();
    let status = json!({"wabaId":"w","onboarding":{"status":"unknown","metaStatus":null},"terms":{"status":"unknown","metaStatus":null,"date":null},"cloudApiMarketingDisabled":false,"nextAction":"none","guideUrl":"https://example.test","observedAt":"now"});
    let (base, served) = support::wire(
        "GET",
        "/messaging/n/marketing-messages/status",
        None,
        json!({"success":true,"data":status}),
    )
    .await;
    assert_eq!(
        support::messaging(base)
            .cloud_marketing()
            .get_status("n", RequestOptions::default())
            .await
            .unwrap()
            .data
            .data
            .cloud_api_marketing_disabled,
        Some(false)
    );
    served.await.unwrap();
    assert!(c
        .catalogs()
        .retrieve("n", "../", RequestOptions::default())
        .await
        .is_err());
    assert!(c
        .catalogs()
        .list_products(
            "n",
            "123",
            &CatalogProductsParameters {
                limit: Some(0),
                cursor: None
            },
            RequestOptions::default()
        )
        .await
        .is_err());
}
#[tokio::test]
async fn picture_real_multipart_bytes() {
    use tokio::{
        io::{AsyncReadExt, AsyncWriteExt},
        net::TcpListener,
    };
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let base = format!("http://{}", listener.local_addr().unwrap());
    let jpeg = include_bytes!("../../../contracts/fixtures/official-group-picture.jpg").to_vec();
    let expected = jpeg.clone();
    let serving = tokio::spawn(async move {
        let (mut peer, _) = listener.accept().await.unwrap();
        let mut bytes = vec![];
        let mut buf = [0; 4096];
        loop {
            let n = peer.read(&mut buf).await.unwrap();
            assert!(n > 0);
            bytes.extend_from_slice(&buf[..n]);
            if let Some(end) = bytes.windows(4).position(|b| b == b"\r\n\r\n") {
                let head = String::from_utf8_lossy(&bytes[..end]);
                let length = head
                    .lines()
                    .find_map(|line| {
                        line.to_ascii_lowercase()
                            .strip_prefix("content-length:")
                            .map(|s| s.trim().parse::<usize>().unwrap())
                    })
                    .unwrap();
                if bytes.len() >= end + 4 + length {
                    assert!(head.starts_with("PUT /messaging/n/official-groups/g/picture "));
                    assert!(head
                        .to_ascii_lowercase()
                        .contains("content-type: multipart/form-data; boundary="));
                    assert!(bytes[end + 4..]
                        .windows(expected.len())
                        .any(|b| b == expected));
                    assert!(String::from_utf8_lossy(&bytes[end + 4..])
                        .contains("Content-Type: image/jpeg"));
                    break;
                }
            }
        }
        let body = r#"{"success":true,"data":{"accepted":true}}"#;
        peer.write_all(format!("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",body.len()).as_bytes()).await.unwrap();
    });
    assert!(
        support::messaging(base)
            .official_groups()
            .set_picture("n", "g", &jpeg, RequestOptions::default())
            .await
            .unwrap()
            .data
            .data
            .accepted
    );
    serving.await.unwrap();
}
fn signed(value: &Value) -> polymorfa_sdk::Result<WebhookDelivery> {
    let raw = serde_json::to_vec(value).unwrap();
    let mut m = Hmac::<Sha256>::new_from_slice(b"s").unwrap();
    m.update(&raw);
    construct_delivery(&raw, &hex::encode(m.finalize().into_bytes()), "s")
}
#[test]
fn whole_body_batch_and_previous_identity() {
    let event =
        json!({"id":"e","session":"","timestamp":"now","event":"future.event","payload":{}});
    let batch = json!({"object":"event_batch","version":1,"id":"00000000-0000-4000-8000-000000000001","events":[event.clone(),event.clone()]});
    let WebhookDelivery::Batch(b) = signed(&batch).unwrap() else {
        panic!("batch")
    };
    assert_eq!(b.events.len(), 2);
    assert_eq!(b.events[0].envelope().id, "e");
    assert!(matches!(
        signed(&event).unwrap(),
        WebhookDelivery::Single(_)
    ));
    for members in [
        json!([]),
        json!([batch.clone()]),
        json!([{"id":"e"}]),
        Value::Array(vec![event.clone(); 101]),
    ] {
        let mut bad = batch.clone();
        bad["events"] = members;
        assert!(signed(&bad).is_err())
    }
    let mut bad = batch.clone();
    bad["version"] = json!(2);
    assert!(signed(&bad).is_err());
    let raw = serde_json::to_vec(&batch).unwrap();
    assert!(construct_delivery(&raw, "bad", "s").is_err());
    let c:ContactIdentityChange=serde_json::from_value(json!({"reason":"user_id_changed","messageId":"m","previous":{"id":"old","parentBsuid":"old-p"}})).unwrap();
    assert_eq!(c.previous.unwrap().parent_bsuid.as_deref(), Some("old-p"));
    let order:CloudOrder=serde_json::from_value(json!({"catalogId":"123","items":[{"productRetailerId":"p","quantity":2,"itemPrice":0.1,"currency":"USD"}]})).unwrap();
    assert_eq!(order.items[0].quantity, 2);
}

#[tokio::test]
async fn platform_batching_native_settings_wire() {
    use polymorfa_sdk::developer::{CreateWebhookRequest, UpdateWebhookRequest};
    for project in [false, true] {
        let prefix = if project {
            "/platform/projects/project"
        } else {
            "/platform"
        };
        let hook = json!({"id":"w","organizationId":"o","owner":if project {"project"}else{"organization"},"projectId":if project {Some("project")}else{None},"url":"https://example.test","eventTypes":[],"enabled":true,"format":"native","retryPolicy":{"maximumAttempts":3,"backoff":"exponential","initialDelaySeconds":5},"headers":[],"secret":{"version":1,"createdAt":"now","previousValidUntil":null},"createdAt":"now","updatedAt":"now","batching":{"enabled":false,"maxEvents":100,"windowMs":1000}});
        let body =
            json!({"url":"https://example.test","eventTypes":[],"batching":{"enabled":false}});
        let receipt = json!({"webhook":hook,"operationId":null,"idempotency":{"id":"i","key":"k","replayed":false,"createdAt":"now","expiresAt":"later"},"secret":null,"secretAvailable":false});
        let (base, served) = support::wire(
            "POST",
            &format!("{prefix}/webhooks"),
            Some(body.clone()),
            json!({"data":receipt.clone()}),
        )
        .await;
        let owner = support::organization(base);
        let p = owner.project("project").unwrap();
        let resource = if project {
            p.webhooks()
        } else {
            owner.webhooks()
        };
        let input: CreateWebhookRequest = serde_json::from_value(body).unwrap();
        assert!(
            !resource
                .create(&input, RequestOptions::default())
                .await
                .unwrap()
                .data
                .webhook
                .batching
                .enabled
        );
        served.await.unwrap();
        let body = json!({"batching":{"enabled":false}});
        let (base, served) = support::wire(
            "PATCH",
            &format!("{prefix}/webhooks/w"),
            Some(body.clone()),
            json!({"data":receipt}),
        )
        .await;
        let owner = support::organization(base);
        let p = owner.project("project").unwrap();
        let resource = if project {
            p.webhooks()
        } else {
            owner.webhooks()
        };
        let input: UpdateWebhookRequest = serde_json::from_value(body).unwrap();
        resource
            .update("w", &input, RequestOptions::default())
            .await
            .unwrap();
        served.await.unwrap();
        let invalid = UpdateWebhookRequest {
            batching: Some(WebhookBatchingInput {
                enabled: true,
                max_events: Some(1),
                window_ms: None,
            }),
            ..Default::default()
        };
        assert!(resource
            .update("w", &invalid, RequestOptions::default())
            .await
            .is_err());
    }
}
#[test]
fn readiness_codes_are_open_status_values() {
    let fixture: Value = serde_json::from_str(include_str!(
        "../../../contracts/fixtures/official-round2.json"
    ))
    .unwrap();
    for code in fixture["readinessCodes"]
        .as_array()
        .unwrap()
        .iter()
        .map(|v| v.as_str().unwrap())
        .chain(["future_readiness"])
    {
        let value = json!({"purpose":"initial","connectionGoal":"single","id":"q","status":"pending","session":"n","errorCode":code});
        let status: polymorfa_sdk::models::QuickLinkStatus = serde_json::from_value(value).unwrap();
        assert_eq!(status.error_code.as_deref(), Some(code));
    }
}

#[test]
fn graph_terms_and_cart_dtos() {
    let status:polymorfa_sdk::cloud_graph::CloudMarketingStatus=serde_json::from_value(json!({"id":"w","marketing_messages_onboarding_status":"future","owner_business_info":{"marketing_messages_onboarding_status":{"status":"future_terms","time":"now"}},"disable_marketing_messages_on_cloud_api":false})).unwrap();
    assert_eq!(status.disable_marketing_messages_on_cloud_api, Some(false));
    assert_eq!(
        status
            .owner_business_info
            .unwrap()
            .marketing_messages_onboarding_status
            .unwrap()
            .status
            .as_deref(),
        Some("future_terms")
    );
    let order = json!({"catalogId":"123","items":[{"productRetailerId":"p","quantity":2,"itemPrice":0.1,"currency":"USD"}]});
    let history:polymorfa_sdk::history::HistoryMessage=serde_json::from_value(json!({"id":"m","whatsapp_ids":{"official_api":"wamid"},"direction":"inbound","type":"order","timestamp":"now","conversation":{"id":"u","parentBsuid":"new-p"},"fromMe":false,"order":order})).unwrap();
    assert_eq!(history.order.unwrap().items[0].item_price, 0.1);
}
