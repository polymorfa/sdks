import json

import httpx
import pytest

from polymorfa import AsyncMessagingClient, ConfigurationError, Credential

SUMMARY = {
    "id": "msg_1",
    "whatsapp_ids": {"official_api": "wamid_1"},
    "direction": "inbound",
    "type": "image",
    "timestamp": "2026-10-11T00:00:00Z",
}
MESSAGE = SUMMARY | {
    "conversation": {"id": "user_1", "sender": {"id": "user_2"}},
    "fromMe": False,
    "caption": "Image",
    "media": [
        {
            "id": "media_1",
            "mimeType": "image/png",
            "fileLength": 3,
            "url": "/messaging/media/media_1",
        }
    ],
    "mediaRetrieval": {"state": "stored"},
    "futureField": {"preserved": True},
}
CHAT = {
    "conversation": {"id": "user_1", "phoneNumber": "+15551234567"},
    "kind": "direct",
    "lastActivityAt": "2026-10-11T00:00:00Z",
    "lastMessage": SUMMARY,
}
PAGE = {"success": True, "hasMore": True, "nextCursor": "next_1", "previousCursor": None}
WINDOW = {
    "state": "open",
    "reason": None,
    "openedAt": "2026-10-11T00:00:00Z",
    "expiresAt": "2026-10-12T00:00:00Z",
    "checkedAt": "2026-10-11T00:00:00Z",
}
PREFIX = "/messaging/support/chats"
CASES = [
    (
        "GET",
        "",
        {"limit": "25", "kind": "direct"},
        None,
        PAGE | {"data": [CHAT]},
        True,
        lambda r: r.list("support", {"limit": 25, "kind": "direct"}),
    ),
    (
        "GET",
        "/user_1",
        {},
        None,
        {"success": True, "data": CHAT},
        True,
        lambda r: r.retrieve("support", "user_1"),
    ),
    (
        "GET",
        "/user_1/messages",
        {"cursor": "next_1", "order": "asc", "types": "text,image"},
        None,
        PAGE | {"data": [MESSAGE]},
        True,
        lambda r: r.list_messages(
            "support", "user_1", {"cursor": "next_1", "order": "asc", "types": "text,image"}
        ),
    ),
    (
        "GET",
        "/user_1/messages/msg_1",
        {},
        None,
        {"success": True, "data": MESSAGE},
        True,
        lambda r: r.retrieve_message("support", "user_1", "msg_1"),
    ),
    (
        "GET",
        "/user_1/messages/msg_1/media",
        {},
        None,
        b"abc",
        True,
        lambda r: r.download_message_media("support", "user_1", "msg_1"),
    ),
    (
        "PUT",
        "/user_1/messages/msg_1",
        {},
        {"text": "Edited", "transport": "official_api"},
        {"success": True},
        False,
        lambda r: r.edit_message(
            "support", "user_1", "msg_1", {"text": "Edited", "transport": "official_api"}
        ),
    ),
    (
        "DELETE",
        "/user_1/messages/msg_1",
        {"transport": "official_api"},
        None,
        {"success": True},
        False,
        lambda r: r.delete_message("support", "user_1", "msg_1", transport="official_api"),
    ),
    (
        "POST",
        "/user_1/archive",
        {},
        None,
        {"success": True},
        False,
        lambda r: r.archive("support", "user_1"),
    ),
    (
        "POST",
        "/user_1/unarchive",
        {},
        None,
        {"success": True},
        False,
        lambda r: r.unarchive("support", "user_1"),
    ),
    (
        "PUT",
        "/user_1/disappearing",
        {},
        {"durationSeconds": 86400},
        {"success": True},
        False,
        lambda r: r.set_disappearing_timer("support", "user_1", 86400),
    ),
    (
        "GET",
        "/user_1/service-window",
        {},
        None,
        {"success": True, "data": WINDOW},
        True,
        lambda r: r.get_service_window("support", "user_1"),
    ),
]


@pytest.mark.parametrize("method,suffix,query,body,fixture,server,invoke", CASES)
async def test_typed_chat_methods(method, suffix, query, body, fixture, server, invoke):
    def handler(request):
        assert request.method == method and request.url.path == PREFIX + suffix
        assert dict(request.url.params) == query
        assert (json.loads(request.content) if request.content else None) == body
        if method == "DELETE" or (method == "PUT" and "messages" in suffix):
            assert request.headers["idempotency-key"]
        return httpx.Response(
            200,
            headers={"x-request-id": "req_chat"},
            **({"content": fixture} if isinstance(fixture, bytes) else {"json": fixture}),
        )

    async with AsyncMessagingClient(
        Credential("organization_api_key", "pmfa_" + "a" * 72),
        http_transport=httpx.MockTransport(handler),
    ) as client:
        result = await invoke(client.chats)
        assert result.data == fixture and result.metadata.request_id == "req_chat"
    if server:
        async with AsyncMessagingClient(Credential("client_token", "pmfa_ct_fixture")) as browser:
            with pytest.raises(ConfigurationError):
                await invoke(browser.chats)
