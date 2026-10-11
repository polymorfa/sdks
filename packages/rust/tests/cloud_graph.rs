#[allow(dead_code)]
mod support;
use polymorfa_sdk::{cloud_graph::*, ErrorKind, RequestOptions};
use serde_json::json;
#[tokio::test]
async fn merged_graph_catalog_marketing_and_flow_key_supplements_native_wire() {
    let params = ListCloudCatalogsParameters {
        version: "v26.0".into(),
        limit: Some(25),
        after: Some("cursor".into()),
    };
    wire_messaging!(
        client,
        "GET",
        "/graph/whatsapp/v26.0/waba/product_catalogs?limit=25&after=cursor",
        None,
        json!({"data":[{"id":"123","name":"Catalog"}],"paging":{"cursors":{"before":"prev","after":"next"}}}),
        client
            .cloud_catalogs()
            .list("waba", &params, RequestOptions::default())
    );
    wire_messaging!(
        client,
        "GET",
        "/graph/whatsapp/v26.0/waba/product_catalogs/123/products?limit=25&after=cursor",
        None,
        json!({"data":[{"id":"product","retailer_id":"retailer","name":"Product","availability":"in stock"}],"paging":{"cursors":{"after":"next"}}}),
        client
            .cloud_catalogs()
            .list_products("waba", "123", &params, RequestOptions::default())
    );
    wire_messaging!(
        client,
        "GET",
        "/graph/whatsapp/v26.0/waba/marketing_messages/status",
        None,
        json!({"id":"waba","marketing_messages_lite_api_status":"ELIGIBLE","marketing_messages_onboarding_status":"ACCEPTED"}),
        client
            .cloud_marketing()
            .status("waba", "v26.0", RequestOptions::default())
    );
    wire_messaging!(
        client,
        "GET",
        "/graph/whatsapp/v26.0/phone/whatsapp_business_encryption",
        None,
        json!({"data":[{"business_public_key":"PUBLIC KEY","business_public_key_signature_status":"VALID"}]}),
        client
            .flow_encryption()
            .retrieve("phone", "v26.0", RequestOptions::default())
    );
    wire_messaging!(
        client,
        "POST",
        "/graph/whatsapp/v26.0/phone/whatsapp_business_encryption",
        Some(json!({"business_public_key":"PUBLIC KEY"})),
        json!({"success":true}),
        client.flow_encryption().register(
            "phone",
            &RegisterFlowEncryptionKeyRequest {
                business_public_key: "PUBLIC KEY".into()
            },
            "v26.0",
            RequestOptions::default()
        )
    );
    let client = support::messaging("http://127.0.0.1:1".into());
    assert_eq!(
        client
            .cloud_catalogs()
            .list_products("waba", "non-numeric", &params, RequestOptions::default())
            .await
            .unwrap_err()
            .kind,
        ErrorKind::Configuration
    );
    assert_eq!(
        client
            .cloud_marketing()
            .status("waba", " ", RequestOptions::default())
            .await
            .unwrap_err()
            .kind,
        ErrorKind::Configuration
    );
}
#[tokio::test]
async fn provider_writes_suppress_retry_overrides_and_keep_final_metadata() {
    use tokio::{
        io::{AsyncReadExt, AsyncWriteExt},
        net::TcpListener,
    };
    for operation in 0..4 {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let base = format!("http://{}", listener.local_addr().unwrap());
        let server = tokio::spawn(async move {
            let (mut socket, _) = listener.accept().await.unwrap();
            let mut request = vec![0u8; 8192];
            let read = socket.read(&mut request).await.unwrap();
            let headers = String::from_utf8_lossy(&request[..read]);
            assert!(headers.contains("idempotency-key: caller-key"));
            socket.write_all(b"HTTP/1.1 503 Service Unavailable\r\ncontent-type: application/json\r\nx-request-id: provider-final\r\ncontent-length: 50\r\nconnection: close\r\n\r\n{\"error\":{\"message\":\"unavailable\",\"code\":\"retry\"}}").await.unwrap();
        });
        let client = support::messaging(base);
        let options = RequestOptions {
            max_network_retries: Some(5),
            idempotency_key: Some("caller-key".into()),
            ..Default::default()
        };
        let error = match operation {
            0 => client
                .flow_encryption()
                .register(
                    "phone",
                    &RegisterFlowEncryptionKeyRequest {
                        business_public_key: "PUBLIC KEY".into(),
                    },
                    "v26.0",
                    options,
                )
                .await
                .unwrap_err(),
            1 => client
                .cloud_templates()
                .create(
                    "support",
                    &polymorfa_sdk::templates::CreateCloudTemplateRequest {
                        name: "hello".into(),
                        language: "en_US".into(),
                        category: polymorfa_sdk::templates::TemplateCategory::Utility,
                        components: vec![],
                    },
                    options,
                )
                .await
                .unwrap_err(),
            2 => client
                .templates()
                .submit(
                    "project",
                    "template",
                    &polymorfa_sdk::templates::SubmitProjectTemplateRequest {
                        session: "support".into(),
                    },
                    options,
                )
                .await
                .unwrap_err(),
            _ => client
                .official_groups()
                .create(
                    "support",
                    &polymorfa_sdk::official_groups::CreateOfficialGroupRequest {
                        subject: "Group".into(),
                        description: None,
                        join_approval_required: None,
                    },
                    options,
                )
                .await
                .unwrap_err(),
        };
        assert_eq!(error.kind, ErrorKind::Server);
        assert_eq!(error.request_id.as_deref(), Some("provider-final"));
        assert_eq!(error.metadata.as_ref().unwrap().attempts, 1);
        server.await.unwrap();
    }
}
