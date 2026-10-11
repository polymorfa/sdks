#[allow(dead_code)]
mod support;
use futures_util::StreamExt;
use polymorfa_sdk::{
    account::DisappearingTimerRequest, history::*, models::MessageTransport, ClientOptions,
    Credential, MessagingClient, RequestOptions,
};
use serde_json::json;
fn summary() -> serde_json::Value {
    json!({"id":"message","whatsapp_ids":{"linked_devices":"wa","official_api":"cloud"},"whatsapp_id":"wa","direction":"inbound","type":"image","timestamp":"2026-10-11T12:00:00Z"})
}
fn chat() -> serde_json::Value {
    json!({"conversation":{"id":"chat","phoneNumber":"+15551234567","bsuid":"bsuid","username":"pat"},"kind":"direct","lastActivityAt":"2026-10-11T12:00:00Z","lastMessage":summary()})
}
fn message() -> serde_json::Value {
    let mut result = summary();
    let object = result.as_object_mut().unwrap();
    object.extend(json!({"conversation":{"id":"chat","phoneNumber":"+15551234567","sender":{"id":"sender","username":"pat"}},"fromMe":false,"pushName":"Pat","text":"Photo","caption":"Office","mimeType":"image/jpeg","filename":"office.jpg","ptt":false,"latitude":12.5,"longitude":34.0,"displayName":"Pat","title":"Office","reaction":"😀","reactionTo":"previous","edited":true,"unavailable":false,"unavailableReason":"none","pollOptions":[{"name":"Coffee","hash":"hash"}],"media":[{"id":"media","mimeType":"image/jpeg","fileLength":12,"url":"/messaging/s/chats/chat/messages/message/media"}],"mediaRetrieval":{"state":"stored","reason":"downloaded"}}).as_object().unwrap().clone());
    result
}
#[tokio::test]
async fn merged_history_chats_and_messages_native_request_response_contracts() {
    let params = ListHistoryChatsParams {
        limit: Some(1),
        kind: Some(HistoryChatKind::Direct),
        cursor: Some("cursor".into()),
        active_since: Some("2026-10-10".into()),
        active_before: None,
    };
    wire_messaging!(
        client,
        "GET",
        "/messaging/s/chats?activeSince=2026-10-10&cursor=cursor&kind=direct&limit=1",
        None,
        json!({"success":true,"data":[chat()],"hasMore":true,"nextCursor":"next","previousCursor":null}),
        client.chats().list("s", &params, RequestOptions::default())
    );
    wire_messaging!(
        client,
        "GET",
        "/messaging/s/chats/chat%2Fone",
        None,
        json!({"success":true,"data":chat()}),
        client
            .chats()
            .retrieve("s", "chat/one", RequestOptions::default())
    );
    let params = ListHistoryMessagesParams {
        limit: Some(1),
        cursor: None,
        order: Some(HistoryOrder::Asc),
        since: Some("2026-10-10".into()),
        until: None,
        direction: Some(MessageDirection::Inbound),
        types: Some("image,text".into()),
    };
    wire_messaging!(client,"GET","/messaging/s/chats/chat/messages?direction=inbound&limit=1&order=asc&since=2026-10-10&types=image%2Ctext",None,json!({"success":true,"data":[message()],"hasMore":false,"nextCursor":null,"previousCursor":"previous"}),client.chats().list_messages("s","chat",&params,RequestOptions::default()));
    wire_messaging!(
        client,
        "GET",
        "/messaging/s/chats/chat/messages/message%2Fone",
        None,
        json!({"success":true,"data":message()}),
        client
            .chats()
            .retrieve_message("s", "chat", "message/one", RequestOptions::default())
    );
    wire_messaging!(
        client,
        "GET",
        "/messaging/s/chats/chat/service-window",
        None,
        json!({"success":true,"data":{"state":"open","reason":"tracking_started","openedAt":"2026-10-11T12:00:00Z","expiresAt":"2026-10-12T12:00:00Z","checkedAt":"2026-10-11T12:30:00Z"}}),
        client
            .chats()
            .get_service_window("s", "chat", RequestOptions::default())
    );
}
#[tokio::test]
async fn chat_message_mutations_native_wire_contracts() {
    let body = EditMessageRequest {
        transport: Some(MessageTransport::OfficialApi),
        text: "Updated".into(),
    };
    wire_messaging!(
        client,
        "PUT",
        "/messaging/s/chats/chat/messages/message",
        Some(json!({"transport":"official_api","text":"Updated"})),
        json!({"success":true}),
        client
            .chats()
            .edit_message("s", "chat", "message", &body, RequestOptions::default())
    );
    wire_messaging!(
        client,
        "DELETE",
        "/messaging/s/chats/chat/messages/message?transport=linked_devices",
        None,
        json!({"success":true}),
        client.chats().delete_message(
            "s",
            "chat",
            "message",
            Some(MessageTransport::LinkedDevices),
            RequestOptions::default()
        )
    );
    wire_messaging!(
        client,
        "POST",
        "/messaging/s/chats/chat/archive",
        None,
        json!({"success":true}),
        client
            .chats()
            .archive("s", "chat", RequestOptions::default())
    );
    wire_messaging!(
        client,
        "POST",
        "/messaging/s/chats/chat/unarchive",
        None,
        json!({"success":true}),
        client
            .chats()
            .unarchive("s", "chat", RequestOptions::default())
    );
    wire_messaging!(
        client,
        "PUT",
        "/messaging/s/chats/chat/disappearing",
        Some(json!({"durationSeconds":86400})),
        json!({"success":true}),
        client.chats().set_disappearing_timer(
            "s",
            "chat",
            &DisappearingTimerRequest {
                duration_seconds: 86400
            },
            RequestOptions::default()
        )
    );
}
#[tokio::test]
async fn stored_message_media_download_and_stream_native_http() {
    // JSON is only the fixture's opaque binary payload; the public API returns bytes.
    for buffered in [false, true] {
        let expected = json!({"binary":"stored copy"});
        let (base, server) = support::wire(
            "GET",
            "/messaging/s/chats/chat/messages/message/media",
            None,
            expected.clone(),
        )
        .await;
        let client = support::messaging(base);
        if buffered {
            let result = client
                .chats()
                .download_message_media("s", "chat", "message", RequestOptions::default())
                .await
                .unwrap();
            assert_eq!(
                serde_json::from_slice::<serde_json::Value>(&result.data).unwrap(),
                expected
            );
            assert_eq!(result.metadata.request_id.as_deref(), Some("wire_fixture"));
        } else {
            let mut result = client
                .chats()
                .download_message_media_stream("s", "chat", "message", RequestOptions::default())
                .await
                .unwrap();
            assert_eq!(result.content_type.as_deref(), Some("application/json"));
            assert!(!result.redirected);
            assert_eq!(result.metadata.request_id.as_deref(), Some("wire_fixture"));
            let mut bytes = Vec::new();
            while let Some(chunk) = result.body.next().await {
                bytes.extend_from_slice(&chunk.unwrap());
            }
            assert_eq!(
                serde_json::from_slice::<serde_json::Value>(&bytes).unwrap(),
                expected
            );
        }
        server.await.unwrap();
    }
}
#[tokio::test]
async fn hosted_history_and_service_window_refuse_browser_principals_before_http() {
    let client = MessagingClient::new(
        Credential::client_token("pmfa_ct_client").unwrap(),
        ClientOptions {
            base_url: "http://127.0.0.1:1".into(),
            ..Default::default()
        },
    )
    .unwrap();
    assert!(client
        .chats()
        .list("s", &Default::default(), RequestOptions::default())
        .await
        .is_err());
    assert!(client
        .chats()
        .retrieve("s", "chat", RequestOptions::default())
        .await
        .is_err());
    assert!(client
        .chats()
        .list_messages("s", "chat", &Default::default(), RequestOptions::default())
        .await
        .is_err());
    assert!(client
        .chats()
        .retrieve_message("s", "chat", "message", RequestOptions::default())
        .await
        .is_err());
    assert!(client
        .chats()
        .download_message_media("s", "chat", "message", RequestOptions::default())
        .await
        .is_err());
    assert!(client
        .chats()
        .get_service_window("s", "chat", RequestOptions::default())
        .await
        .is_err());
}
