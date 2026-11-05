#[allow(dead_code)]
mod support;
use polymorfa_sdk::{groups::*, RequestOptions};
use serde_json::json;
#[tokio::test]
async fn group_create_read_members_invites_capabilities_native_wire_contracts() {
    let participant = json!({"id":"user","bsuid":"bsuid","phoneNumber":"+15551234567","username":"pat","isAdmin":true,"isSuperAdmin":false});
    let group = json!({"id":"group","name":"Team","description":"Work","createdAt":1800000000000u64,"participants":[participant],"ownerId":"owner"});
    wire_messaging!(
        client,
        "GET",
        "/messaging/s/groups",
        None,
        json!({"success":true,"data":[group]}),
        client.groups().list("s", RequestOptions::default())
    );
    let create = CreateGroupRequest {
        name: "Team".into(),
        participants: vec!["user".into()],
    };
    wire_messaging!(
        client,
        "POST",
        "/messaging/s/groups",
        Some(json!({"name":"Team","participants":["user"]})),
        json!({"success":true,"data":group}),
        client
            .groups()
            .create("s", &create, RequestOptions::default())
    );
    wire_messaging!(
        client,
        "GET",
        "/messaging/s/groups/group%2Fone",
        None,
        json!({"success":true,"data":group}),
        client
            .groups()
            .retrieve("s", "group/one", RequestOptions::default())
    );
    wire_messaging!(
        client,
        "GET",
        "/messaging/s/groups/join-info?code=invite%2Bcode",
        None,
        json!({"success":true,"data":{"id":"group","subject":"Team","createdAt":1800000000000u64,"size":1,"participants":[participant],"creatorId":"owner"}}),
        client
            .groups()
            .get_join_info("s", "invite+code", RequestOptions::default())
    );
    wire_messaging!(
        client,
        "POST",
        "/messaging/s/groups/join",
        Some(json!({"code":"invite"})),
        json!({"success":true}),
        client.groups().join(
            "s",
            &JoinGroupRequest {
                code: "invite".into()
            },
            RequestOptions::default()
        )
    );
    wire_messaging!(
        client,
        "GET",
        "/messaging/s/groups/group/capabilities",
        None,
        json!({"success":true,"data":{"status":"synced","syncedAt":"2026-10-11T12:00:00Z","checkedAt":null,"capabilities":[{"key":"polls.endTime","kind":"feature","unit":null,"value":true,"source":"server"},{"key":"polls.hideVoters","kind":"feature","unit":null,"value":false,"source":"client_default"},{"key":"polls.creatorEdit","kind":"feature","unit":null,"value":null,"source":null}]}}),
        client
            .groups()
            .get_capabilities("s", "group", RequestOptions::default())
    );
    wire_messaging!(
        client,
        "GET",
        "/messaging/s/groups/group/invite-code",
        None,
        json!({"success":true,"data":{"code":"invite"}}),
        client
            .groups()
            .get_invite_code("s", "group", RequestOptions::default())
    );
    wire_messaging!(
        client,
        "POST",
        "/messaging/s/groups/group/invite-code/revoke",
        None,
        json!({"success":true,"data":{"code":"new"}}),
        client
            .groups()
            .revoke_invite_code("s", "group", RequestOptions::default())
    );
    wire_messaging!(
        client,
        "GET",
        "/messaging/s/groups/group/participants",
        None,
        json!({"success":true,"data":[participant]}),
        client
            .groups()
            .list_participants("s", "group", RequestOptions::default())
    );
    wire_messaging!(
        client,
        "DELETE",
        "/messaging/s/groups/group",
        None,
        json!({"success":true}),
        client
            .groups()
            .delete("s", "group", RequestOptions::default())
    );
    wire_messaging!(
        client,
        "POST",
        "/messaging/s/groups/group/leave",
        None,
        json!({"success":true}),
        client
            .groups()
            .leave("s", "group", RequestOptions::default())
    );
}
#[tokio::test]
async fn group_membership_and_settings_native_wire_contracts() {
    let field = SetGroupFieldRequest {
        value: "Updated".into(),
    };
    wire_messaging!(
        client,
        "PUT",
        "/messaging/s/groups/group/subject",
        Some(json!({"value":"Updated"})),
        json!({"success":true}),
        client
            .groups()
            .set_subject("s", "group", &field, RequestOptions::default())
    );
    wire_messaging!(
        client,
        "PUT",
        "/messaging/s/groups/group/description",
        Some(json!({"value":"Updated"})),
        json!({"success":true}),
        client
            .groups()
            .set_description("s", "group", &field, RequestOptions::default())
    );
    let members = GroupParticipantsRequest {
        participants: vec!["user".into()],
    };
    wire_messaging!(
        client,
        "POST",
        "/messaging/s/groups/group/participants/add",
        Some(json!({"participants":["user"]})),
        json!({"success":true}),
        client
            .groups()
            .add_participants("s", "group", &members, RequestOptions::default())
    );
    wire_messaging!(
        client,
        "POST",
        "/messaging/s/groups/group/participants/remove",
        Some(json!({"participants":["user"]})),
        json!({"success":true}),
        client
            .groups()
            .remove_participants("s", "group", &members, RequestOptions::default())
    );
    wire_messaging!(
        client,
        "POST",
        "/messaging/s/groups/group/admin/promote",
        Some(json!({"participants":["user"]})),
        json!({"success":true}),
        client
            .groups()
            .promote_participants("s", "group", &members, RequestOptions::default())
    );
    wire_messaging!(
        client,
        "POST",
        "/messaging/s/groups/group/admin/demote",
        Some(json!({"participants":["user"]})),
        json!({"success":true}),
        client
            .groups()
            .demote_participants("s", "group", &members, RequestOptions::default())
    );
    wire_messaging!(
        client,
        "PUT",
        "/messaging/s/groups/group/picture",
        Some(json!({"base64":"AAAA"})),
        json!({"success":true}),
        client.groups().set_picture(
            "s",
            "group",
            &SetGroupPictureRequest {
                base64: Some("AAAA".into()),
                url: None
            },
            RequestOptions::default()
        )
    );
    let admin = GroupAdminOnlySettingRequest { admins_only: true };
    wire_messaging!(
        client,
        "PUT",
        "/messaging/s/groups/group/settings/info-edit",
        Some(json!({"adminsOnly":true})),
        json!({"success":true}),
        client
            .groups()
            .set_info_editing("s", "group", &admin, RequestOptions::default())
    );
    wire_messaging!(
        client,
        "PUT",
        "/messaging/s/groups/group/settings/messages",
        Some(json!({"adminsOnly":true})),
        json!({"success":true}),
        client
            .groups()
            .set_messaging("s", "group", &admin, RequestOptions::default())
    );
    wire_messaging!(
        client,
        "PUT",
        "/messaging/s/groups/group/settings/member-add",
        Some(json!({"mode":"all_member_add"})),
        json!({"success":true}),
        client.groups().set_member_add_mode(
            "s",
            "group",
            &GroupMemberAddModeRequest {
                mode: GroupMemberAddMode::AllMemberAdd
            },
            RequestOptions::default()
        )
    );
    wire_messaging!(
        client,
        "PUT",
        "/messaging/s/groups/group/settings/join-approval",
        Some(json!({"required":true})),
        json!({"success":true}),
        client.groups().set_join_approval(
            "s",
            "group",
            &GroupJoinApprovalRequest { required: true },
            RequestOptions::default()
        )
    );
}
