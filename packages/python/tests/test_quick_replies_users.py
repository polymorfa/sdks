import json

import httpx
import pytest

from polymorfa import AsyncMessagingClient, Credential

BODY = {"shortcut": "hello", "message": "Hello", "keywords": ["greeting"], "count": 2}
REPLY = {"id": "reply_1", **BODY}
COLLECTION = {
    "policy": "cache",
    "status": "fresh",
    "observedAt": "2026-10-11T00:00:00Z",
    "quickReplies": [
        {**REPLY, "associatedLabelIds": ["label_1"], "observedAt": "2026-10-11T00:00:00Z"}
    ],
}
CASES = [
    ("GET", "/business/quick-replies", None, COLLECTION, lambda c: c.quick_replies.list("support")),
    (
        "POST",
        "/business/quick-replies",
        BODY,
        REPLY,
        lambda c: c.quick_replies.create("support", BODY),
    ),
    (
        "PUT",
        "/business/quick-replies/reply_1",
        BODY,
        REPLY,
        lambda c: c.quick_replies.replace("support", "reply_1", BODY),
    ),
    (
        "DELETE",
        "/business/quick-replies/reply_1",
        None,
        {"id": "reply_1", "status": "DELETED"},
        lambda c: c.quick_replies.delete("support", "reply_1"),
    ),
    (
        "GET",
        "/users/user_1/security-code",
        None,
        {
            "id": "user_1",
            "phoneNumber": "+15551234567",
            "username": "example",
            "numericCode": "0" * 60,
            "qrCode": "YWJj",
        },
        lambda c: c.users.get_security_code("support", "user_1"),
    ),
]


@pytest.mark.parametrize("method,suffix,body,data,invoke", CASES)
async def test_quick_reply_and_user_typed_methods(method, suffix, body, data, invoke):
    fixture = {"success": True, "data": data}

    def handler(request):
        assert request.method == method and request.url.path == "/messaging/support" + suffix
        assert (json.loads(request.content) if request.content else None) == body
        return httpx.Response(200, json=fixture, headers={"x-request-id": "req_quick"})

    async with AsyncMessagingClient(
        Credential("organization_api_key", "pmfa_" + "a" * 72),
        http_transport=httpx.MockTransport(handler),
    ) as client:
        response = await invoke(client)
        assert response.data == fixture and response.metadata.request_id == "req_quick"
