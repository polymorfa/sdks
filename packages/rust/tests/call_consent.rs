#[allow(dead_code)]
mod support;
use polymorfa_sdk::{call_consent::*, ErrorKind, RequestOptions};
use serde_json::json;
#[tokio::test]
async fn organization_call_policy_and_single_identifier_optouts_native_wire() {
    wire_unwrapped_organization!(
        client,
        "GET",
        "/platform/call-policy",
        None,
        json!({"data":{"blockedCountryCodes":["44","1876"],"optOutCount":2,"revision":3,"updatedAt":"2026-10-11T10:00:00Z"}}),
        client.call_policy().retrieve(RequestOptions::default())
    );
    wire_unwrapped_organization!(
        client,
        "PUT",
        "/platform/call-policy",
        Some(json!({"blockedCountryCodes":["44","1876"],"expectedRevision":3})),
        json!({"data":{"blockedCountryCodes":["44","1876"],"optOutCount":2,"revision":4,"updatedAt":"2026-10-11T11:00:00Z"}}),
        client.call_policy().update(
            &UpdateCallPolicyRequest {
                blocked_country_codes: vec!["44".into(), "1876".into()],
                expected_revision: Some(3)
            },
            RequestOptions::default()
        )
    );
    wire_unwrapped_organization!(
        client,
        "POST",
        "/platform/call-opt-outs",
        Some(json!({"phoneNumber":"+15551234567","note":"Requested"})),
        json!({"data":{"id":"optout","phoneNumber":"+15551234567","bsuid":null,"note":"Requested","source":"api","createdAt":"2026-10-11T10:00:00Z"}}),
        client.call_opt_outs().create(
            &CreateCallOptOutRequest::Phone {
                phone_number: "+15551234567".into(),
                note: Some("Requested".into())
            },
            RequestOptions::default()
        )
    );
    wire_unwrapped_organization!(
        client,
        "POST",
        "/platform/call-opt-outs",
        Some(json!({"bsuid":"business-user"})),
        json!({"data":{"id":"optout","phoneNumber":null,"bsuid":"business-user","note":null,"source":"api","createdAt":"2026-10-11T10:00:00Z"}}),
        client.call_opt_outs().create(
            &CreateCallOptOutRequest::Bsuid {
                bsuid: "business-user".into(),
                note: None
            },
            RequestOptions::default()
        )
    );
    wire_unwrapped_organization!(
        client,
        "POST",
        "/platform/call-opt-outs/import",
        Some(
            json!({"entries":[{"phoneNumber":"+15551234567"},{"phoneNumber":"+15551234568","bsuid":"both"},{}]})
        ),
        json!({"data":{"added":1,"existing":0,"rejected":[{"index":1,"reason":"multiple_identifiers"},{"index":2,"reason":"missing_identifier"}]}}),
        client.call_opt_outs().import(
            &ImportCallOptOutsRequest {
                entries: vec![
                    CallOptOutImportEntry {
                        phone_number: Some("+15551234567".into()),
                        ..Default::default()
                    },
                    CallOptOutImportEntry {
                        phone_number: Some("+15551234568".into()),
                        bsuid: Some("both".into()),
                        note: None
                    },
                    CallOptOutImportEntry::default()
                ]
            },
            RequestOptions::default()
        )
    );
    wire_unwrapped_organization!(
        client,
        "DELETE",
        "/platform/call-opt-outs/optout",
        None,
        json!({"data":{"id":"optout","deleted":true}}),
        client
            .call_opt_outs()
            .delete("optout", RequestOptions::default())
    );
}
#[tokio::test]
async fn call_optout_cursor_page_and_configuration_validation_native_wire() {
    let expected = json!({"data":[{"id":"optout","phoneNumber":"+15551234567","bsuid":null,"note":null,"source":"import","createdAt":"2026-10-11T10:00:00Z"}],"page":{"nextCursor":"next","hasMore":true}});
    let (base, server) = support::wire(
        "GET",
        "/platform/call-opt-outs?limit=25&phoneNumber=%2B15551234567",
        None,
        expected.clone(),
    )
    .await;
    let client = support::organization(base);
    let page = client
        .call_opt_outs()
        .list(
            &ListCallOptOutsParameters {
                limit: Some(25),
                phone_number: Some("+15551234567".into()),
                ..Default::default()
            },
            RequestOptions::default(),
        )
        .await
        .unwrap();
    assert_eq!(page.next_cursor.as_deref(), Some("next"));
    assert_eq!(page.metadata.request_id.as_deref(), Some("wire_fixture"));
    assert_eq!(serde_json::to_value(page.items).unwrap(), expected["data"]);
    server.await.unwrap();
    let client = support::organization("http://127.0.0.1:1".into());
    assert!(client
        .call_opt_outs()
        .list(
            &ListCallOptOutsParameters {
                phone_number: Some("+15551234567".into()),
                bsuid: Some("user".into()),
                ..Default::default()
            },
            RequestOptions::default()
        )
        .await
        .is_err());
    for code in ["+44", "0", "12345", ""] {
        assert_eq!(
            client
                .call_policy()
                .update(
                    &UpdateCallPolicyRequest {
                        blocked_country_codes: vec![code.into()],
                        expected_revision: None
                    },
                    RequestOptions::default()
                )
                .await
                .unwrap_err()
                .kind,
            ErrorKind::Validation
        );
    }
    assert_eq!(
        client
            .call_opt_outs()
            .import(
                &ImportCallOptOutsRequest { entries: vec![] },
                RequestOptions::default()
            )
            .await
            .unwrap_err()
            .kind,
        ErrorKind::Validation
    );
    assert_eq!(
        client
            .call_opt_outs()
            .create(
                &CreateCallOptOutRequest::Bsuid {
                    bsuid: "".into(),
                    note: None
                },
                RequestOptions::default()
            )
            .await
            .unwrap_err()
            .kind,
        ErrorKind::Validation
    );
}
