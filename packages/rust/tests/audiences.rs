#[allow(dead_code)]
mod support;
use polymorfa_sdk::{audiences::*, campaigns::CampaignRecipientInput, RequestOptions};
use serde_json::json;
fn audience() -> serde_json::Value {
    json!({"id":"audience","name":"Audience","source":"api","recipientCount":1,"fileId":null,"columns":null,"sampleRow":null,"mapping":null,"createdAt":1000,"updatedAt":2000})
}
fn imported() -> serde_json::Value {
    let mut value = audience();
    value["duplicateCount"] = json!(1);
    value["invalidCount"] = json!(1);
    value["invalidRows"] = json!([{"row":3,"reason":"invalid_phone"}]);
    value
}
#[tokio::test]
async fn audiences_inline_file_import_and_open_read_upload_contracts_native_wire() {
    wire_organization!(
        client,
        "GET",
        "/platform/audiences",
        None,
        json!({"data":{"audiences":[audience()]}}),
        client.audiences().list(RequestOptions::default())
    );
    wire_organization!(
        client,
        "POST",
        "/platform/audiences",
        Some(json!({"name":"Audience","source":"api","members":[{"phone":"+15551234567"}]})),
        json!({"data":imported()}),
        client.audiences().create(
            &CreateAudienceRequest::FromMembers {
                name: "Audience".into(),
                source: Some(AudienceSource::Api),
                members: Some(vec![CampaignRecipientInput {
                    phone: "+15551234567".into(),
                    variables: None
                }])
            },
            RequestOptions::default()
        )
    );
    wire_organization!(
        client,
        "POST",
        "/platform/audiences",
        Some(
            json!({"name":"Audience","source":"csv","fileId":"storage","mapping":{"phone":"Phone","variables":{"name":"Name"}}})
        ),
        json!({"data":imported()}),
        client.audiences().create(
            &CreateAudienceRequest::FromFile {
                name: "Audience".into(),
                source: Some(AudienceSource::Csv),
                file_id: "storage".into(),
                mapping: AudienceImportMapping {
                    phone: "Phone".into(),
                    variables: Some([("name".into(), "Name".into())].into())
                }
            },
            RequestOptions::default()
        )
    );
    wire_organization!(
        client,
        "GET",
        "/platform/audiences/audience",
        None,
        json!({"data":{"audience":audience()}}),
        client
            .audiences()
            .retrieve("audience", RequestOptions::default())
    );
    wire_organization!(
        client,
        "DELETE",
        "/platform/audiences/audience",
        None,
        json!({"data":{"deleted":true}}),
        client
            .audiences()
            .delete("audience", RequestOptions::default())
    );
    let upload: AudiencePayload = [("filename".into(), json!("members.csv"))].into();
    wire_organization!(
        client,
        "POST",
        "/platform/audiences/uploads",
        Some(json!({"filename":"members.csv"})),
        json!({"data":{"uploadUrl":"https://storage.example.com/upload","storageId":"storage"}}),
        client
            .audiences()
            .create_upload(Some(&upload), RequestOptions::default())
    );
}
#[tokio::test]
async fn audience_paginated_members_partial_append_and_phone_deletion_native_wire() {
    wire_organization!(
        client,
        "GET",
        "/platform/audiences/audience/members?cursor=cursor&limit=25",
        None,
        json!({"data":[{"id":"member","phone":"+15551234567","variables":{"name":"Alex"},"createdAt":1000}],"page":{"nextCursor":"next","hasMore":true}}),
        client.audiences().list_members(
            "audience",
            &ListAudienceMembersParameters {
                cursor: Some("cursor".into()),
                limit: Some(25)
            },
            RequestOptions::default()
        )
    );
    wire_organization!(
        client,
        "POST",
        "/platform/audiences/audience/members",
        Some(json!({"members":[{"phone":"+15551234567"}]})),
        json!({"data":{"listId":"audience","added":1,"recipientCount":2,"duplicateCount":1,"invalidCount":1,"invalidRows":[{"row":3,"reason":"invalid_phone"}]}}),
        client.audiences().add_members(
            "audience",
            &AddAudienceMembersRequest {
                members: vec![CampaignRecipientInput {
                    phone: "+15551234567".into(),
                    variables: None
                }]
            },
            RequestOptions::default()
        )
    );
    wire_organization!(
        client,
        "DELETE",
        "/platform/audiences/audience/members/%2B15551234567",
        None,
        json!({"data":{"removed":true,"listId":"audience","phone":"+15551234567","recipientCount":1}}),
        client
            .audiences()
            .delete_member("audience", "+15551234567", RequestOptions::default())
    );
}
