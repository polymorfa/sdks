#[allow(dead_code)]
mod support;
use polymorfa_sdk::{models::*, RequestOptions};
use serde_json::json;

#[tokio::test]
async fn all_typed_message_content_variants_round_trip_on_the_wire() {
    let amount = json!({"value":1200.0,"offset":100});
    let variants = [
        json!({"text":"hello"}),
        json!({"image":{"url":"https://example.com/image","mimeType":"image/jpeg","caption":"Photo"}}),
        json!({"video":{"base64":"AAAA","mimeType":"video/mp4"}}),
        json!({"file":{"url":"https://example.com/file","filename":"invoice.pdf"}}),
        json!({"voice":{"base64":"AAAA","ptt":true}}),
        json!({"poll":{"title":"Lunch?","options":["Soup","Salad"],"multiSelect":true}}),
        json!({"location":{"lat":12.5,"long":34.0,"address":"Office"}}),
        json!({"contact":{"vcard":"BEGIN:VCARD\nEND:VCARD"}}),
        json!({"requestPhoneNumber":{}}),
        json!({"product":{"businessOwnerId":"owner","id":"product","title":"Coffee","description":"Roasted","currencyCode":"USD","priceAmount1000":3500.0,"salePriceAmount1000":3000.0,"retailerId":"sku","url":"https://example.com/product","imageCount":1,"image":{"base64":"AAAA","mimeType":"image/jpeg"},"body":"Try it","footer":"Shop"}}),
        json!({"productList":{"businessOwnerId":"owner","title":"Menu","description":"Drinks","buttonText":"Browse","footer":"Shop","sections":[{"title":"Coffee","productIds":["product"]}]}}),
        json!({"order":{"id":"order","thumbnailBase64":"AAAA","itemCount":1,"status":"accepted","message":"Thanks","title":"Coffee","sellerId":"owner","token":"opaque","totalAmount1000":3500.0,"totalCurrencyCode":"USD","catalogType":"catalog"}}),
        json!({"list":{"title":"Menu","description":"Choose","buttonText":"Open","footer":"Shop","sections":[{"title":"Drinks","rows":[{"id":"coffee","title":"Coffee","description":"Hot"}]}]}}),
        json!({"buttons":{"title":"Help","body":"Choose","footer":"Support","buttons":[{"type":"url","text":"Site","url":"https://example.com"},{"type":"call","text":"Call","phoneNumber":"+15551234567"},{"type":"reply","text":"Reply","id":"reply"},{"type":"copy","text":"Copy","copyCode":"code"},{"type":"catalog","text":"Shop","businessPhoneNumber":"+15551234567","catalogProductId":"product"}]}}),
        json!({"addressMessage":{"body":"Delivery address","buttonText":"Enter","footer":"Shop","country":"BR"}}),
        json!({"flow":{"action":"navigate","body":"Book","buttonText":"Start","footer":"Shop","id":"flow","token":"opaque","screen":"FIRST","dataJson":"{\"name\":\"Pat\"}"}}),
        json!({"flow":{"action":"data_exchange","body":"Book","buttonText":"Start","id":"flow","token":"opaque"}}),
        json!({"callPermissionRequest":{"body":"Can we call to arrange delivery?"}}),
        json!({"orderDetails":{"referenceId":"order-1","type":"physical-goods","body":"Payment instructions","footer":"Shop","currency":"BRL","totalAmount":amount,"paymentSettings":{"pixDynamicCode":{"code":"pix-code","merchantName":"Shop","key":"merchant@example.com","keyType":"EMAIL"},"paymentLink":{"uri":"https://example.com/pay"},"boleto":{"digitableLine":"1".repeat(47)}},"order":{"catalogId":"catalog","expiration":{"timestamp":1900000000,"description":"Pay by tomorrow"},"items":[{"retailerId":"sku","name":"Coffee","amount":amount,"quantity":1.0,"saleAmount":amount}],"subtotal":amount,"tax":{"value":0.0,"offset":100,"description":"Tax"},"shipping":{"value":0.0,"offset":100},"discount":{"value":0.0,"offset":100,"description":"Discount","programName":"Loyalty"}},"headerImageUrl":"https://example.com/thumb.jpg"}}),
        json!({"orderDetails":{"referenceId":"order-2","type":"digital-goods","body":"Pay here","currency":"BRL","totalAmount":amount,"paymentSettings":{"paymentLink":{"uri":"https://example.com/pay"}}}}),
        json!({"orderStatus":{"referenceId":"order-1","body":"Paid","footer":"Shop","order":{"status":"processing","description":"Packing"},"payment":{"status":"captured","timestamp":1800000000}}}),
        json!({"template":{"name":"hello_world","language":"en_US","components":[{"type":"body","parameters":[{"type":"text","text":"Pat"}]}]}}),
    ];
    for content in variants {
        let expected_request = json!({"conversation":{"id":"conversation","phoneNumber":"+15551234567","bsuid":"BSUID","username":"pat"},"content":content,"transport":"auto","isForwarded":true,"mentions":["user"],"quotedMessage":{"id":"quoted","type":"text","text":"Earlier"}});
        let request: SendMessageRequest = serde_json::from_value(expected_request.clone()).unwrap();
        // Serialize the typed public request before sending; no raw request body escape hatch.
        assert_eq!(serde_json::to_value(&request).unwrap(), expected_request);
        let response = json!({"success":true,"data":{"id":"message","whatsapp_ids":{"linked_devices":"wa","official_api":null},"whatsapp_id":"wa","conversation":{"id":"conversation","phoneNumber":"+15551234567","bsuid":"BSUID","username":"pat"},"timestamp":"2026-10-11T12:00:00Z","status":"sent","transport":"linked_devices","routingReason":"linked_devices_selected","operationId":"operation","type":content.as_object().unwrap().keys().next().unwrap(),"content":content,"mediaId":"media"}});
        wire_messaging!(
            client,
            "POST",
            "/messaging/s/messages/send",
            Some(expected_request),
            response,
            client
                .messages()
                .send("s", &request, RequestOptions::default())
        );
    }
}

#[tokio::test]
async fn typed_payment_constraints_fail_before_http() {
    let client = support::messaging("http://127.0.0.1:1".into());
    let invalid_contents = [
        json!({"orderDetails":{"referenceId":"r","type":"digital-goods","body":"Pay","currency":"BRL","totalAmount":{"value":1,"offset":100},"paymentSettings":{}}}),
        json!({"orderDetails":{"referenceId":"r","type":"digital-goods","body":"Pay","currency":"BRL","totalAmount":{"value":1,"offset":100},"paymentSettings":{"paymentLink":{"uri":"https://example.com/pay"}},"headerImageUrl":"https://example.com/image"}}),
        json!({"orderStatus":{"referenceId":"r","body":"Update"}}),
    ];
    for content in invalid_contents {
        let request =
            serde_json::from_value(json!({"conversation":{"id":"c"},"content":content})).unwrap();
        let error = client
            .messages()
            .send("s", &request, RequestOptions::default())
            .await
            .unwrap_err();
        assert_eq!(error.kind, polymorfa_sdk::ErrorKind::Configuration);
    }
    assert!(
        serde_json::from_value::<PaymentOrderAmount>(json!({"value":1,"offset":1000})).is_err()
    );
}
