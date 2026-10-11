#[allow(dead_code)]
mod support;
use polymorfa_sdk::{account::*, RequestOptions};
use serde_json::json;

#[tokio::test]
async fn contact_resource_wire_contracts() {
    let contact = json!({"id":"user","name":"Pat","pushName":"Pat"});
    wire_messaging!(
        client,
        "GET",
        "/messaging/s/contacts",
        None,
        json!({"success":true,"data":[contact]}),
        client.contacts().list("s", RequestOptions::default())
    );
    wire_messaging!(
        client,
        "GET",
        "/messaging/s/contacts/check?phone=%2B1555%2C%2B1666",
        None,
        json!({"success":true,"data":[{"exists":true,"id":"user"}]}),
        client.contacts().check(
            "s",
            &["+1555".into(), "+1666".into()],
            RequestOptions::default()
        )
    );
    wire_messaging!(
        client,
        "GET",
        "/messaging/s/contacts/blocked",
        None,
        json!({"success":true,"data":{"hash":"hash","contacts":[{"id":"user"}]}}),
        client.contacts().blocklist("s", RequestOptions::default())
    );
    wire_messaging!(
        client,
        "GET",
        "/messaging/s/contacts/user%2Fone",
        None,
        json!({"success":true,"data":contact}),
        client
            .contacts()
            .retrieve("s", "user/one", RequestOptions::default())
    );
    wire_messaging!(
        client,
        "GET",
        "/messaging/s/contacts/user/picture",
        None,
        json!({"success":true,"data":{"url":"https://example.test/photo"}}),
        client
            .contacts()
            .picture("s", "user", RequestOptions::default())
    );
    wire_messaging!(
        client,
        "GET",
        "/messaging/s/contacts/user/info",
        None,
        json!({"success":true,"data":{"id":"user","status":"hello","pictureId":"pic","verifiedName":"Pat","devices":[{"id":"user","device":1}]}}),
        client
            .contacts()
            .info("s", "user", RequestOptions::default())
    );
    wire_messaging!(
        client,
        "GET",
        "/messaging/s/contacts/user/devices",
        None,
        json!({"success":true,"data":["device"]}),
        client
            .contacts()
            .devices("s", "user", RequestOptions::default())
    );
    wire_messaging!(
        client,
        "GET",
        "/messaging/s/contacts/user/business-profile",
        None,
        json!({"success":true,"data":{"id":"user","address":"Street","email":"business@example.test","description":"Business","websites":[],"coverPhotoId":"photo","categories":[],"options":{},"hoursTimeZone":"UTC","hours":[]}}),
        client
            .contacts()
            .business_profile("s", "user", RequestOptions::default())
    );
    wire_messaging!(
        client,
        "POST",
        "/messaging/s/contacts/user/block",
        None,
        json!({"success":true}),
        client
            .contacts()
            .block("s", "user", RequestOptions::default())
    );
    wire_messaging!(
        client,
        "POST",
        "/messaging/s/contacts/user/unblock",
        None,
        json!({"success":true}),
        client
            .contacts()
            .unblock("s", "user", RequestOptions::default())
    );
}
#[tokio::test]
async fn profile_privacy_resource_wire_contracts() {
    wire_messaging!(
        client,
        "GET",
        "/messaging/s/profile",
        None,
        json!({"success":true,"data":{"name":"Pat","status":"Hello"}}),
        client.profile().get("s", RequestOptions::default())
    );
    wire_messaging!(
        client,
        "PUT",
        "/messaging/s/profile/name",
        Some(json!({"name":"Pat"})),
        json!({"success":true}),
        client.profile().set_name(
            "s",
            &SetProfileNameRequest { name: "Pat".into() },
            RequestOptions::default()
        )
    );
    wire_messaging!(
        client,
        "PUT",
        "/messaging/s/profile/status",
        Some(json!({"status":"Hello"})),
        json!({"success":true}),
        client.profile().set_status(
            "s",
            &SetProfileStatusRequest {
                status: "Hello".into()
            },
            RequestOptions::default()
        )
    );
    wire_messaging!(
        client,
        "PUT",
        "/messaging/s/profile/picture",
        Some(json!({"url":"https://example.test/photo"})),
        json!({"success":true}),
        client.profile().set_picture(
            "s",
            &SetPictureRequest {
                url: Some("https://example.test/photo".into()),
                base64: None
            },
            RequestOptions::default()
        )
    );
    wire_messaging!(
        client,
        "DELETE",
        "/messaging/s/profile/picture",
        None,
        json!({"success":true}),
        client
            .profile()
            .delete_picture("s", RequestOptions::default())
    );
    let privacy = json!({"groupAdd":"all","lastSeen":"contacts","status":"contacts","profile":"all","readReceipts":"all","online":"match_last_seen","callAdd":"known","messages":"contacts","defense":"off","stickers":"contacts"});
    wire_messaging!(
        client,
        "GET",
        "/messaging/s/privacy",
        None,
        json!({"success":true,"data":privacy}),
        client.privacy().get("s", RequestOptions::default())
    );
    wire_messaging!(
        client,
        "PUT",
        "/messaging/s/privacy/groupadd",
        Some(json!({"value":"contacts"})),
        json!({"success":true,"data":privacy}),
        client.privacy().set(
            "s",
            &PrivacyMutation::GroupAdd(StandardPrivacyAudience::Contacts),
            RequestOptions::default()
        )
    );
    wire_messaging!(
        client,
        "PUT",
        "/messaging/s/privacy/disappearing/default",
        Some(json!({"durationSeconds":86400})),
        json!({"success":true}),
        client.privacy().set_default_disappearing_timer(
            "s",
            &DisappearingTimerRequest {
                duration_seconds: 86400
            },
            RequestOptions::default()
        )
    );
}
#[tokio::test]
async fn presence_identity_security_resource_wire_contracts() {
    wire_messaging!(
        client,
        "GET",
        "/messaging/s/presence",
        None,
        json!({"success":true,"data":{"desired":"available","authoritative":false}}),
        client.presence().get("s", RequestOptions::default())
    );
    wire_messaging!(
        client,
        "POST",
        "/messaging/s/presence",
        Some(json!({"presence":"available"})),
        json!({"success":true,"data":{"status":"OK"}}),
        client.presence().set(
            "s",
            &SetPresenceRequest {
                presence: PresenceState::Available
            },
            RequestOptions::default()
        )
    );
    wire_messaging!(
        client,
        "GET",
        "/messaging/s/presence/user",
        None,
        json!({"success":true,"data":{"policy":"cache","status":"fresh","stale":false,"typingPolicy":"events","typingStatus":"unknown"}}),
        client
            .presence()
            .get_for_chat("s", "user", RequestOptions::default())
    );
    wire_messaging!(
        client,
        "POST",
        "/messaging/s/presence/user/subscribe",
        None,
        json!({"success":true,"data":{"status":"SUBSCRIBED","expiresAt":"2026-10-11T12:00:00Z"}}),
        client
            .presence()
            .subscribe("s", "user", RequestOptions::default())
    );
    wire_messaging!(
        client,
        "GET",
        "/messaging/s/identities/resolve?username=pat&usernameKey=1234",
        None,
        json!({"success":true,"data":{"id":"user","username":"pat","keyRequired":false}}),
        client.identities().resolve(
            "s",
            &ResolveIdentityParams::Username {
                username: "pat".into(),
                key: Some("1234".into())
            },
            RequestOptions::default()
        )
    );
    wire_messaging!(
        client,
        "GET",
        "/messaging/s/users/user/security-code",
        None,
        json!({"success":true,"data":{"id":"user","numericCode":"1234","qrCode":"AA=="}}),
        client
            .users()
            .get_security_code("s", "user", RequestOptions::default())
    );
}
#[tokio::test]
async fn label_quick_reply_resource_wire_contracts() {
    let label = json!({"id":"label","name":"VIP","color":3});
    wire_messaging!(
        client,
        "GET",
        "/messaging/s/labels?includeObservation=true",
        None,
        json!({"success":true,"data":{"policy":"cache","status":"fresh","labels":[label]}}),
        client
            .labels()
            .list("s", Some(true), RequestOptions::default())
    );
    wire_messaging!(
        client,
        "POST",
        "/messaging/s/labels",
        Some(json!({"name":"VIP","color":3})),
        json!({"success":true,"data":label}),
        client.labels().create(
            "s",
            &CreateLabelRequest {
                name: "VIP".into(),
                color: Some(3)
            },
            RequestOptions::default()
        )
    );
    wire_messaging!(
        client,
        "PUT",
        "/messaging/s/labels/label",
        Some(json!({"name":"VIP"})),
        json!({"success":true}),
        client.labels().update(
            "s",
            "label",
            &UpdateLabelRequest::Name {
                name: "VIP".into(),
                color: None
            },
            RequestOptions::default()
        )
    );
    wire_messaging!(
        client,
        "DELETE",
        "/messaging/s/labels/label",
        None,
        json!({"success":true}),
        client
            .labels()
            .delete("s", "label", RequestOptions::default())
    );
    wire_messaging!(
        client,
        "GET",
        "/messaging/s/labels/chats/user",
        None,
        json!({"success":true,"data":[label]}),
        client
            .labels()
            .list_for_chat("s", "user", None, RequestOptions::default())
    );
    wire_messaging!(
        client,
        "PUT",
        "/messaging/s/labels/chats/user",
        Some(json!({"labels":[]})),
        json!({"success":true}),
        client.labels().replace_for_chat(
            "s",
            "user",
            &ReplaceChatLabelsRequest { labels: vec![] },
            RequestOptions::default()
        )
    );
    let body = BusinessQuickReplyMutation {
        shortcut: "welcome".into(),
        message: "Hello".into(),
        keywords: Some(vec!["hi".into()]),
        count: None,
    };
    let reply = json!({"id":"reply","shortcut":"welcome","message":"Hello","keywords":["hi"]});
    wire_messaging!(
        client,
        "GET",
        "/messaging/s/business/quick-replies",
        None,
        json!({"success":true,"data":{"policy":"cache","status":"fresh","quickReplies":[{"id":"reply","shortcut":"welcome","message":"Hello","keywords":["hi"],"associatedLabelIds":[],"observedAt":"2026-10-11T12:00:00Z"}]}}),
        client.quick_replies().list("s", RequestOptions::default())
    );
    wire_messaging!(
        client,
        "POST",
        "/messaging/s/business/quick-replies",
        Some(json!({"shortcut":"welcome","message":"Hello","keywords":["hi"]})),
        json!({"success":true,"data":reply}),
        client
            .quick_replies()
            .create("s", &body, RequestOptions::default())
    );
    wire_messaging!(
        client,
        "PUT",
        "/messaging/s/business/quick-replies/reply",
        Some(json!({"shortcut":"welcome","message":"Hello","keywords":["hi"]})),
        json!({"success":true,"data":reply}),
        client
            .quick_replies()
            .replace("s", "reply", &body, RequestOptions::default())
    );
    wire_messaging!(
        client,
        "DELETE",
        "/messaging/s/business/quick-replies/reply",
        None,
        json!({"success":true,"data":{"id":"reply","status":"DELETED"}}),
        client
            .quick_replies()
            .delete("s", "reply", RequestOptions::default())
    );
}
