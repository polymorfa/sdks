#[allow(dead_code)]
mod support;
use polymorfa_sdk::{customers::*, ErrorKind, RequestOptions};
use serde_json::json;
fn customer() -> serde_json::Value {
    json!({"id":"customer","orgId":"team","projectId":"project","name":"Customer","externalCustomerId":"external","status":"active","isDefault":false,"archivedAt":null,"createdAt":1000,"updatedAt":2000})
}
fn number() -> serde_json::Value {
    json!({"id":"number","customerId":"customer","sessionId":"session","name":"Number","phoneMasked":"+1555***4567","status":"connected","backend":"linked_devices","createdAt":1000})
}
fn link() -> serde_json::Value {
    json!({"id":"link","orgId":"team","projectId":"project","customerId":"customer","expectedPhoneMasked":"+1555***4567","methods":["qr","phone"],"locale":"pt-BR","theme":"system","expiresAt":2000,"status":"connecting","attemptCount":1,"maxAttempts":3,"pendingSessionId":"session","createdBy":"user","reservedAt":1000,"openedAt":1100,"connectingAt":1200,"connectedAt":null,"failedAt":null,"expiredAt":null,"revokedAt":null,"lastErrorCode":null,"failedExchangeCount":0,"phoneMismatchCount":0,"createdAt":1000,"updatedAt":1200})
}
#[tokio::test]
async fn customer_enablement_listing_sparse_patches_and_lifecycle_native_wire() {
    wire_organization!(
        client,
        "GET",
        "/platform/projects/project/customers/status",
        None,
        json!({"data":{"enabled":true,"enabledAt":1000,"enabledBy":"user","defaultCustomer":customer()}}),
        client
            .customers()
            .status("project", RequestOptions::default())
    );
    wire_organization!(
        client,
        "POST",
        "/platform/projects/project/customers/enable",
        None,
        json!({"data":{"enabled":true,"enabledAt":1000,"enabledBy":"user","defaultCustomer":customer(),"migratedNumberCount":2}}),
        client
            .customers()
            .enable("project", RequestOptions::default())
    );
    let mut summary = customer();
    summary["numberCount"] = json!(2);
    summary["connectedNumberCount"] = json!(1);
    summary["activePairingLinkState"] = json!("connecting");
    summary["lastActivityAt"] = json!(2000);
    summary["needsAttention"] = json!(true);
    wire_organization!(client,"GET","/platform/customers?projectId=project&cursor=cursor&search=Customer&limit=25&status=all&isDefault=false&hasNumbers=true&needsAttention=true",None,json!({"data":[summary],"page":{"nextCursor":"next","hasMore":true}}),client.customers().list(&ListCustomersParameters{project_id:"project".into(),cursor:Some("cursor".into()),search:Some("Customer".into()),limit:Some(25),status:Some(CustomerListStatus::All),is_default:Some(false),has_numbers:Some(true),needs_attention:Some(true)},RequestOptions::default()));
    wire_organization!(
        client,
        "POST",
        "/platform/customers",
        Some(json!({"projectId":"project","name":"Customer","externalCustomerId":null})),
        json!({"data":customer()}),
        client.customers().create(
            &CreateCustomerRequest {
                project_id: Some("project".into()),
                name: Some(Some("Customer".into())),
                external_customer_id: Some(None)
            },
            RequestOptions::default()
        )
    );
    wire_organization!(
        client,
        "GET",
        "/platform/customers/customer?projectId=project",
        None,
        json!({"data":customer()}),
        client
            .customers()
            .retrieve("customer", "project", RequestOptions::default())
    );
    wire_organization!(
        client,
        "PATCH",
        "/platform/customers/customer",
        Some(json!({"projectId":"project","name":null,"externalCustomerId":"external"})),
        json!({"data":customer()}),
        client.customers().update(
            "customer",
            &UpdateCustomerRequest {
                project_id: Some("project".into()),
                name: Some(None),
                external_customer_id: Some(Some("external".into()))
            },
            RequestOptions::default()
        )
    );
    wire_organization!(
        client,
        "POST",
        "/platform/customers/customer/archive",
        Some(json!({"projectId":"project"})),
        json!({"data":customer()}),
        client.customers().archive(
            "customer",
            &CustomerProjectRequest {
                project_id: Some("project".into())
            },
            RequestOptions::default()
        )
    );
    wire_organization!(
        client,
        "POST",
        "/platform/customers/customer/restore",
        Some(json!({"projectId":"project"})),
        json!({"data":customer()}),
        client.customers().restore(
            "customer",
            &CustomerProjectRequest {
                project_id: Some("project".into())
            },
            RequestOptions::default()
        )
    );
}
#[tokio::test]
async fn customer_number_events_pairing_link_and_confirmed_transfer_native_wire() {
    wire_organization!(
        client,
        "GET",
        "/platform/customers/customer/numbers?projectId=project",
        None,
        json!({"data":[number()]}),
        client
            .customers()
            .list_numbers("customer", "project", RequestOptions::default())
    );
    wire_organization!(
        client,
        "GET",
        "/platform/customers/customer/events?projectId=project&limit=25",
        None,
        json!({"data":[{"id":"event","action":"updated","fromStatus":"active","toStatus":"active","sessionId":null,"pairingLinkId":"link","metadata":{"fields":["name","externalCustomerId"]},"occurredAt":1000}]}),
        client.customers().list_events(
            "customer",
            &ListCustomerEventsParameters {
                project_id: "project".into(),
                limit: Some(25)
            },
            RequestOptions::default()
        )
    );
    let mut created = link();
    created["url"] = json!("https://pair.example.com/link");
    wire_organization!(
        client,
        "POST",
        "/platform/customers/customer/pairing-links",
        Some(
            json!({"projectId":"project","expectedPhone":null,"methods":["qr","phone"],"expiresInSeconds":3600})
        ),
        json!({"data":created}),
        client.customers().create_pairing_link(
            "customer",
            &CreateCustomerPairingLinkRequest {
                project_id: Some("project".into()),
                expected_phone: Some(None),
                methods: Some(vec![
                    CustomerPairingMethod::Qr,
                    CustomerPairingMethod::Phone
                ]),
                expires_in_seconds: Some(3600)
            },
            RequestOptions::default()
        )
    );
    wire_organization!(
        client,
        "GET",
        "/platform/customers/customer/pairing-links?projectId=project",
        None,
        json!({"data":[link()]}),
        client
            .customers()
            .list_pairing_links("customer", "project", RequestOptions::default())
    );
    wire_organization!(
        client,
        "DELETE",
        "/platform/customers/customer/pairing-links/link?projectId=project",
        None,
        json!({"data":link()}),
        client.customers().revoke_pairing_link(
            "customer",
            "link",
            "project",
            RequestOptions::default()
        )
    );
    wire_organization!(
        client,
        "POST",
        "/platform/customers/customer/numbers/session/transfer",
        Some(json!({"projectId":"project","sourceCustomerId":"source","confirm":true})),
        json!({"data":number()}),
        client.customers().transfer_number(
            "customer",
            "session",
            &TransferCustomerNumberRequest {
                project_id: "project".into(),
                source_customer_id: "source".into(),
                confirm: true
            },
            RequestOptions::default()
        )
    );
    let client = support::organization("http://127.0.0.1:1".into());
    assert_eq!(
        client
            .customers()
            .transfer_number(
                "customer",
                "session",
                &TransferCustomerNumberRequest {
                    project_id: "project".into(),
                    source_customer_id: "source".into(),
                    confirm: false
                },
                RequestOptions::default()
            )
            .await
            .unwrap_err()
            .kind,
        ErrorKind::Validation
    );
    let mut replay = link();
    replay["url"] = json!(null);
    let parsed: CreatedCustomerPairingLink = serde_json::from_value(replay.clone()).unwrap();
    assert!(parsed.url.is_none());
    assert_eq!(serde_json::to_value(parsed).unwrap(), replay);
}
