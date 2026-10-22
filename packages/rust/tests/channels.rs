#[allow(dead_code)]
mod support;
use polymorfa_sdk::{channels::*, RequestOptions};
use serde_json::json;
#[tokio::test]
async fn channel_metadata_messages_and_live_subscription_native_wire() {
    let channel = json!({"id":"channel","name":"News","description":"Updates","profileUrl":"https://example.com/photo","followers":10,"muted":false,"preview":true});
    let message = json!({"position":123,"id":"message","whatsapp_ids":{"linked_devices":"wa","official_api":null},"whatsapp_id":"wa","conversation":{"id":"channel"},"type":"text","timestamp":"2026-10-11T12:00:00Z","views":100,"reactionCounts":{"👍":3},"text":"Hello"});
    wire_messaging!(
        client,
        "GET",
        "/messaging/s/channels",
        None,
        json!({"success":true,"data":[channel]}),
        client.channels().list("s", RequestOptions::default())
    );
    let request = CreateChannelRequest {
        name: "News".into(),
        description: Some("Updates".into()),
        picture: Some("AAAA".into()),
    };
    wire_messaging!(
        client,
        "POST",
        "/messaging/s/channels",
        Some(json!({"name":"News","description":"Updates","picture":"AAAA"})),
        json!({"success":true,"data":channel}),
        client
            .channels()
            .create("s", &request, RequestOptions::default())
    );
    wire_messaging!(
        client,
        "GET",
        "/messaging/s/channels/channel%2Fone",
        None,
        json!({"success":true,"data":channel}),
        client
            .channels()
            .retrieve("s", "channel/one", RequestOptions::default())
    );
    wire_messaging!(
        client,
        "DELETE",
        "/messaging/s/channels/channel",
        None,
        json!({"success":true,"data":{"status":"DELETED"}}),
        client
            .channels()
            .delete("s", "channel", RequestOptions::default())
    );
    wire_messaging!(
        client,
        "GET",
        "/messaging/s/channels/channel/messages?before=123&count=1",
        None,
        json!({"success":true,"data":[message]}),
        client.channels().list_messages(
            "s",
            "channel",
            &ChannelMessagesParams {
                before: Some(123),
                count: Some(1)
            },
            RequestOptions::default()
        )
    );
    wire_messaging!(
        client,
        "GET",
        "/messaging/s/channels/channel/message-updates?after=123&count=1&since=1800000000",
        None,
        json!({"success":true,"data":[message]}),
        client.channels().list_message_updates(
            "s",
            "channel",
            &ChannelMessageUpdatesParams {
                after: Some(123),
                count: Some(1),
                since: Some(1800000000)
            },
            RequestOptions::default()
        )
    );
    wire_messaging!(
        client,
        "POST",
        "/messaging/s/channels/channel/live-updates",
        None,
        json!({"success":true,"data":{"durationSeconds":300}}),
        client
            .channels()
            .subscribe_to_live_updates("s", "channel", RequestOptions::default())
    );
    // Preserve RPC respond-async receipts, including when channel metadata is all optional.
    wire_messaging!(
        client,
        "POST",
        "/messaging/s/channels",
        Some(json!({"name":"News","description":"Updates","picture":"AAAA"})),
        json!({"success":true,"data":{"requestId":"accepted"}}),
        client
            .channels()
            .create("s", &request, RequestOptions::default())
    );
}
#[tokio::test]
async fn channel_actions_reactions_and_rpc_response_shapes_native_wire() {
    wire_messaging!(
        client,
        "POST",
        "/messaging/s/channels/channel/messages/message%2Fone/viewed",
        None,
        json!({"success":true,"data":{"status":"VIEWED"}}),
        client.channels().mark_message_viewed(
            "s",
            "channel",
            "message/one",
            RequestOptions::default()
        )
    );
    wire_messaging!(
        client,
        "POST",
        "/messaging/s/channels/channel/messages/message/reaction",
        Some(json!({"reaction":"👍"})),
        json!({"success":true,"data":{"status":"UPDATED"}}),
        client.channels().react_to_message(
            "s",
            "channel",
            "message",
            &ChannelReactionRequest {
                reaction: "👍".into()
            },
            RequestOptions::default()
        )
    );
    wire_messaging!(
        client,
        "POST",
        "/messaging/s/channels/channel/follow",
        None,
        json!({"success":true,"data":{"status":"FOLLOWED"}}),
        client
            .channels()
            .follow("s", "channel", RequestOptions::default())
    );
    wire_messaging!(
        client,
        "POST",
        "/messaging/s/channels/channel/unfollow",
        None,
        json!({"success":true}),
        client
            .channels()
            .unfollow("s", "channel", RequestOptions::default())
    );
    wire_messaging!(
        client,
        "POST",
        "/messaging/s/channels/channel/mute",
        None,
        json!({"success":true,"data":{"requestId":"accepted"}}),
        client
            .channels()
            .mute("s", "channel", RequestOptions::default())
    );
    wire_messaging!(
        client,
        "POST",
        "/messaging/s/channels/channel/unmute",
        None,
        json!({"success":true,"data":{"status":"UNMUTED"}}),
        client
            .channels()
            .unmute("s", "channel", RequestOptions::default())
    );
}
