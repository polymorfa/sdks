#[allow(dead_code)]
mod support;
use polymorfa_sdk::{official_groups::*, RequestOptions};
use serde_json::json;
fn accepted() -> serde_json::Value {
    json!({"success":true,"data":{"accepted":true}})
}
fn decision() -> serde_json::Value {
    json!({"success":true,"data":{"succeeded":["request"],"failed":[{"joinRequestId":"failed","errors":[{"code":400,"title":"Not eligible"}]}]}})
}
#[tokio::test]
async fn official_group_catalog_and_membership_native_wire() {
    wire_messaging!(
        client,
        "GET",
        "/messaging/support/official-groups?limit=25&after=cursor",
        None,
        json!({"success":true,"data":{"groups":[{"id":"group","subject":"Group","createdAt":"2026-10-11"}],"cursors":{"after":"next"},"hasMore":true}}),
        client.official_groups().list(
            "support",
            &ListOfficialGroupsParameters {
                limit: Some(25),
                after: Some("cursor".into()),
                ..Default::default()
            },
            RequestOptions::default()
        )
    );
    wire_messaging!(
        client,
        "POST",
        "/messaging/support/official-groups",
        Some(json!({"subject":"Group","description":"Description","joinApprovalRequired":true})),
        json!({"success":true,"data":{"requestId":"request"}}),
        client.official_groups().create(
            "support",
            &CreateOfficialGroupRequest {
                subject: "Group".into(),
                description: Some("Description".into()),
                join_approval_required: Some(true)
            },
            RequestOptions::default()
        )
    );
    wire_messaging!(
        client,
        "GET",
        "/messaging/support/official-groups/group",
        None,
        json!({"success":true,"data":{"id":"group","subject":"Group","description":"Description","suspended":false,"createdAt":"2026-10-11","participantCount":1,"joinApprovalRequired":true,"participants":[{"id":"user","phoneNumber":"+15551234567"}]}}),
        client
            .official_groups()
            .retrieve("support", "group", RequestOptions::default())
    );
    wire_messaging!(
        client,
        "PATCH",
        "/messaging/support/official-groups/group",
        Some(json!({"subject":"Updated"})),
        accepted(),
        client.official_groups().update(
            "support",
            "group",
            &UpdateOfficialGroupRequest {
                subject: Some("Updated".into()),
                description: None
            },
            RequestOptions::default()
        )
    );
    wire_messaging!(
        client,
        "DELETE",
        "/messaging/support/official-groups/group",
        None,
        accepted(),
        client
            .official_groups()
            .delete("support", "group", RequestOptions::default())
    );
    wire_messaging!(
        client,
        "GET",
        "/messaging/support/official-groups/group/invite-link",
        None,
        json!({"success":true,"data":{"inviteLink":"https://chat.whatsapp.com/invite"}}),
        client
            .official_groups()
            .get_invite_link("support", "group", RequestOptions::default())
    );
    wire_messaging!(
        client,
        "POST",
        "/messaging/support/official-groups/group/invite-link/reset",
        None,
        json!({"success":true,"data":{"inviteLink":"https://chat.whatsapp.com/replaced"}}),
        client
            .official_groups()
            .reset_invite_link("support", "group", RequestOptions::default())
    );
    wire_messaging!(
        client,
        "POST",
        "/messaging/support/official-groups/group/participants/remove",
        Some(json!({"participants":["user"]})),
        accepted(),
        client.official_groups().remove_participants(
            "support",
            "group",
            &["user".into()],
            RequestOptions::default()
        )
    );
}
#[tokio::test]
async fn official_group_join_decisions_and_message_pins_native_wire() {
    wire_messaging!(
        client,
        "GET",
        "/messaging/support/official-groups/group/join-requests?before=cursor",
        None,
        json!({"success":true,"data":{"items":[{"joinRequestId":"request","user":{"id":"user","phoneNumber":"+15551234567"},"createdAt":"2026-10-11"}],"cursors":{},"hasMore":false}}),
        client.official_groups().list_join_requests(
            "support",
            "group",
            &OfficialGroupCursors {
                before: Some("cursor".into()),
                after: None
            },
            RequestOptions::default()
        )
    );
    wire_messaging!(
        client,
        "POST",
        "/messaging/support/official-groups/group/join-requests/approve",
        Some(json!({"joinRequestIds":["request"]})),
        decision(),
        client.official_groups().approve_join_requests(
            "support",
            "group",
            &["request".into()],
            RequestOptions::default()
        )
    );
    wire_messaging!(
        client,
        "POST",
        "/messaging/support/official-groups/group/join-requests/reject",
        Some(json!({"joinRequestIds":["request"]})),
        decision(),
        client.official_groups().reject_join_requests(
            "support",
            "group",
            &["request".into()],
            RequestOptions::default()
        )
    );
    wire_messaging!(
        client,
        "POST",
        "/messaging/support/official-groups/group/pins",
        Some(json!({"operation":"pin","messageId":"message","expirationDays":7})),
        accepted(),
        client.official_groups().pin(
            "support",
            "group",
            &PinOfficialGroupMessageRequest::Pin {
                message_id: "message".into(),
                expiration_days: 7
            },
            RequestOptions::default()
        )
    );
    wire_messaging!(
        client,
        "POST",
        "/messaging/support/official-groups/group/pins",
        Some(json!({"operation":"unpin","messageId":"message"})),
        accepted(),
        client.official_groups().pin(
            "support",
            "group",
            &PinOfficialGroupMessageRequest::Unpin {
                message_id: "message".into()
            },
            RequestOptions::default()
        )
    );
}
