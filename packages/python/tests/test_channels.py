import json

import httpx
import pytest

from polymorfa import AsyncMessagingClient, Credential

CHANNEL = {
    "id": "channel_1",
    "name": "Updates",
    "description": "News",
    "profileUrl": "https://example.com/image",
    "followers": 5,
    "muted": False,
    "preview": False,
}
MESSAGE = {
    "position": 5,
    "id": "msg_1",
    "whatsapp_ids": {"linked_devices": "provider_1"},
    "conversation": {"id": "channel_1"},
    "type": "text",
    "timestamp": "2026-10-11T00:00:00Z",
    "views": 3,
    "reactionCounts": {"👍": 2},
    "text": "News",
}
CASES = [
    ("GET", "", {}, None, [CHANNEL], lambda r: r.list("support")),
    (
        "POST",
        "",
        {},
        {"name": "Updates", "description": "News", "picture": "https://example.com/image"},
        CHANNEL,
        lambda r: r.create(
            "support",
            {"name": "Updates", "description": "News", "picture": "https://example.com/image"},
        ),
    ),
    ("GET", "/channel_1", {}, None, CHANNEL, lambda r: r.retrieve("support", "channel_1")),
    (
        "DELETE",
        "/channel_1",
        {},
        None,
        {"status": "DELETED"},
        lambda r: r.delete("support", "channel_1"),
    ),
    (
        "GET",
        "/channel_1/messages",
        {"count": "20", "before": "10"},
        None,
        [MESSAGE],
        lambda r: r.list_messages("support", "channel_1", {"count": 20, "before": 10}),
    ),
    (
        "GET",
        "/channel_1/message-updates",
        {"count": "20", "since": "0", "after": "4"},
        None,
        [MESSAGE],
        lambda r: r.list_message_updates(
            "support", "channel_1", {"count": 20, "since": 0, "after": 4}
        ),
    ),
    (
        "POST",
        "/channel_1/messages/msg_1/viewed",
        {},
        None,
        {"status": "VIEWED"},
        lambda r: r.mark_message_viewed("support", "channel_1", "msg_1"),
    ),
    (
        "POST",
        "/channel_1/messages/msg_1/reaction",
        {},
        {"reaction": "👍"},
        {"status": "UPDATED"},
        lambda r: r.react_to_message("support", "channel_1", "msg_1", {"reaction": "👍"}),
    ),
    (
        "POST",
        "/channel_1/live-updates",
        {},
        None,
        {"durationSeconds": 30},
        lambda r: r.subscribe_to_live_updates("support", "channel_1"),
    ),
    (
        "POST",
        "/channel_1/follow",
        {},
        None,
        {"status": "FOLLOWED"},
        lambda r: r.follow("support", "channel_1"),
    ),
    (
        "POST",
        "/channel_1/unfollow",
        {},
        None,
        {"status": "UNFOLLOWED"},
        lambda r: r.unfollow("support", "channel_1"),
    ),
    (
        "POST",
        "/channel_1/mute",
        {},
        None,
        {"status": "MUTED"},
        lambda r: r.mute("support", "channel_1"),
    ),
    (
        "POST",
        "/channel_1/unmute",
        {},
        None,
        {"status": "UNMUTED"},
        lambda r: r.unmute("support", "channel_1"),
    ),
]


@pytest.mark.parametrize("method,suffix,query,body,data,invoke", CASES)
async def test_typed_channels(method, suffix, query, body, data, invoke):
    fixtures = [{"success": True, "data": data}]
    if method != "GET":
        fixtures.append({"success": True, "data": {"requestId": "rpc_1"}})
    if suffix.endswith(("/follow", "/unfollow", "/mute", "/unmute", "/viewed", "/reaction")):
        fixtures.append({"success": True})
    for fixture in fixtures:

        def handler(request, fixture=fixture):
            assert (
                request.method == method
                and request.url.path == "/messaging/support/channels" + suffix
            )
            assert dict(request.url.params) == query
            assert (json.loads(request.content) if request.content else None) == body
            if suffix.endswith("/reaction"):
                assert request.headers["idempotency-key"]
            return httpx.Response(200, json=fixture, headers={"x-request-id": "req_channel"})

        async with AsyncMessagingClient(
            Credential("organization_api_key", "pmfa_" + "a" * 72),
            http_transport=httpx.MockTransport(handler),
        ) as client:
            response = await invoke(client.channels)
            assert response.data == fixture and response.metadata.request_id == "req_channel"
