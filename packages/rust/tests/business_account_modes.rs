#[allow(dead_code)]
mod support;
use polymorfa_sdk::{business_account_modes::*, ErrorKind, RequestOptions};
use serde_json::json;

#[tokio::test]
async fn all_four_account_modes_use_native_put_and_preserve_bare_response() {
    for (mode, wire) in [
        (WhatsAppAccountType::WhatsappApp, "whatsapp_app"),
        (WhatsAppAccountType::BusinessApp, "business_app"),
        (WhatsAppAccountType::MetaCloud, "meta_cloud"),
        (WhatsAppAccountType::MetaCoexistence, "meta_coexistence"),
    ] {
        let reply = json!({"session":"demo /a","accountType":wire,"primaryPlatform":null,"changed":true,"unlinkedDevices":[2,7]});
        let (base, server) = support::wire(
            "PUT",
            "/messaging/demo%20%2Fa/phone/account-mode",
            Some(json!({"accountType":wire})),
            reply,
        )
        .await;
        let client = support::messaging(base);
        let result = client
            .testing()
            .set_account_mode(
                "demo /a",
                &TestingAccountModeRequest {
                    account_type: mode,
                    primary_platform: None,
                },
                RequestOptions::default(),
            )
            .await
            .unwrap();
        assert!(result.data.changed);
        assert_eq!(result.data.unlinked_devices, vec![2, 7]);
        server.await.unwrap();
    }
}
#[tokio::test]
async fn ios_mode_and_completed_noop_survive_native_wire() {
    let (base, server) = support::wire("PUT", "/messaging/demo/phone/account-mode", Some(json!({"accountType":"business_app","primaryPlatform":"ios"})), json!({"session":"demo","accountType":"business_app","primaryPlatform":"ios","changed":false,"unlinkedDevices":[]})).await;
    let result = support::messaging(base)
        .testing()
        .set_account_mode(
            "demo",
            &TestingAccountModeRequest {
                account_type: WhatsAppAccountType::BusinessApp,
                primary_platform: Some(TestingPrimaryPlatform::Ios),
            },
            RequestOptions::default(),
        )
        .await
        .unwrap();
    assert!(!result.data.changed);
    assert!(matches!(
        result.data.primary_platform,
        Some(TestingPrimaryPlatform::Ios)
    ));
    server.await.unwrap();
}
#[tokio::test]
async fn cloud_platform_is_refused_before_io() {
    let client = support::messaging("http://127.0.0.1:1".into());
    let result = client
        .testing()
        .set_account_mode(
            "demo",
            &TestingAccountModeRequest {
                account_type: WhatsAppAccountType::MetaCloud,
                primary_platform: Some(TestingPrimaryPlatform::Android),
            },
            RequestOptions::default(),
        )
        .await;
    assert_eq!(result.unwrap_err().kind, ErrorKind::Configuration);
}
#[tokio::test]
async fn required_mode_response_fields_are_checked() {
    for malformed in [
        json!({"session":"demo"}),
        json!({"session":"demo","accountType":"personal","primaryPlatform":null,"changed":false,"unlinkedDevices":[]}),
        json!({"session":"demo","accountType":"business_app","changed":false,"unlinkedDevices":[]}),
    ] {
        let (base, server) = support::wire(
            "PUT",
            "/messaging/demo/phone/account-mode",
            Some(json!({"accountType":"business_app"})),
            malformed,
        )
        .await;
        assert!(support::messaging(base)
            .testing()
            .set_account_mode(
                "demo",
                &TestingAccountModeRequest {
                    account_type: WhatsAppAccountType::BusinessApp,
                    primary_platform: None
                },
                RequestOptions::default()
            )
            .await
            .is_err());
        server.await.unwrap();
    }
}
#[tokio::test]
async fn encryption_values_and_omission_survive_contact_profile_wire() {
    for encryption in [
        Some("end_to_end"),
        Some("hybrid"),
        Some("not_end_to_end"),
        None,
    ] {
        let mut data = json!({"id":"123","address":"","email":"","description":"","websites":[],"coverPhotoId":"","categories":[],"options":{},"hoursTimeZone":"","hours":[]});
        if let Some(value) = encryption {
            data["encryption"] = json!(value);
        }
        let (base, server) = support::wire(
            "GET",
            "/messaging/demo/contacts/123/business-profile",
            None,
            json!({"success":true,"data":data}),
        )
        .await;
        let response = support::messaging(base)
            .contacts()
            .business_profile("demo", "123", RequestOptions::default())
            .await
            .unwrap();
        assert_eq!(
            response
                .data
                .data
                .encryption
                .map(|e| serde_json::to_value(e).unwrap()),
            encryption.map(|e| json!(e))
        );
        server.await.unwrap();
    }
}

#[tokio::test]
async fn quicklink_cloud_platform_is_refused_before_io() {
    use polymorfa_sdk::{
        configuration::{QuickLinkTestingConfiguration, TestingConfiguration},
        models::{CreateQuickLinkRequest, QuickLinkConfiguration},
    };
    let input = CreateQuickLinkRequest {
        configuration: Some(QuickLinkConfiguration {
            testing: Some(QuickLinkTestingConfiguration {
                configuration: Some(TestingConfiguration {
                    account_type: Some(WhatsAppAccountType::MetaCloud),
                    primary_platform: Some(TestingPrimaryPlatform::Ios),
                    ..Default::default()
                }),
                ..Default::default()
            }),
            ..Default::default()
        }),
        ..Default::default()
    };
    let client = support::messaging("http://127.0.0.1:1".into());
    assert_eq!(
        client
            .quick_links()
            .create(&input, RequestOptions::default())
            .await
            .unwrap_err()
            .kind,
        ErrorKind::Configuration
    );
}
