import json

import httpx
import pytest

from polymorfa import (
    AsyncMessagingClient,
    ConfigurationError,
    Credential,
    RequestOptions,
    ServerError,
)

BASE = "/messaging/support/official-groups"
GROUP = {
    "id": "group_1",
    "subject": "Support",
    "description": "Example",
    "suspended": False,
    "createdAt": "2026-10-11T00:00:00Z",
    "participantCount": 1,
    "joinApprovalRequired": True,
    "participants": [
        {"id": "user_1", "phoneNumber": "+15551234567", "bsuid": "business_1", "username": "ada"}
    ],
}
DECISION = {
    "succeeded": ["join_1"],
    "failed": [{"joinRequestId": "join_2", "errors": [{"code": 100, "title": "Not found"}]}],
}
CASES = [
    (
        "GET",
        BASE,
        None,
        {"limit": "10", "after": "cursor_1"},
        {
            "groups": [
                {"id": "group_1", "subject": "Support", "createdAt": "2026-10-11T00:00:00Z"}
            ],
            "cursors": {"before": "cursor_0", "after": "cursor_2"},
            "hasMore": True,
        },
        lambda r, o: r.list("support", limit=10, after="cursor_1", options=o),
    ),
    (
        "POST",
        BASE,
        {"subject": "Support", "description": "Example", "joinApprovalRequired": True},
        {},
        {"requestId": "request_1"},
        lambda r, o: r.create(
            "support",
            {"subject": "Support", "description": "Example", "joinApprovalRequired": True},
            options=o,
        ),
    ),
    (
        "GET",
        BASE + "/group_1",
        None,
        {},
        GROUP,
        lambda r, o: r.retrieve("support", "group_1", options=o),
    ),
    (
        "PATCH",
        BASE + "/group_1",
        {"subject": "Renamed"},
        {},
        {"accepted": True},
        lambda r, o: r.update("support", "group_1", {"subject": "Renamed"}, options=o),
    ),
    (
        "DELETE",
        BASE + "/group_1",
        None,
        {},
        {"accepted": True},
        lambda r, o: r.delete("support", "group_1", options=o),
    ),
    (
        "GET",
        BASE + "/group_1/invite-link",
        None,
        {},
        {"inviteLink": "https://chat.whatsapp.com/example"},
        lambda r, o: r.get_invite_link("support", "group_1", options=o),
    ),
    (
        "POST",
        BASE + "/group_1/invite-link/reset",
        None,
        {},
        {"inviteLink": "https://chat.whatsapp.com/replacement"},
        lambda r, o: r.reset_invite_link("support", "group_1", options=o),
    ),
    (
        "POST",
        BASE + "/group_1/participants/remove",
        {"participants": ["user_1", "+15551234567"]},
        {},
        {"accepted": True},
        lambda r, o: r.remove_participants(
            "support", "group_1", ["user_1", "+15551234567"], options=o
        ),
    ),
    (
        "GET",
        BASE + "/group_1/join-requests",
        None,
        {"before": "cursor_1"},
        {
            "items": [
                {
                    "joinRequestId": "join_1",
                    "user": {"id": "user_1", "bsuid": "business_1"},
                    "createdAt": "2026-10-11T00:00:00Z",
                }
            ],
            "cursors": {"before": "cursor_0"},
            "hasMore": False,
        },
        lambda r, o: r.list_join_requests("support", "group_1", before="cursor_1", options=o),
    ),
    (
        "POST",
        BASE + "/group_1/join-requests/approve",
        {"joinRequestIds": ["join_1", "join_2"]},
        {},
        DECISION,
        lambda r, o: r.approve_join_requests("support", "group_1", ["join_1", "join_2"], options=o),
    ),
    (
        "POST",
        BASE + "/group_1/join-requests/reject",
        {"joinRequestIds": ["join_1", "join_2"]},
        {},
        DECISION,
        lambda r, o: r.reject_join_requests("support", "group_1", ["join_1", "join_2"], options=o),
    ),
    (
        "POST",
        BASE + "/group_1/pins",
        {"operation": "pin", "messageId": "message_1", "expirationDays": 7},
        {},
        {"accepted": True},
        lambda r, o: r.pin(
            "support",
            "group_1",
            {"operation": "pin", "messageId": "message_1", "expirationDays": 7},
            options=o,
        ),
    ),
    (
        "POST",
        BASE + "/group_1/pins",
        {"operation": "unpin", "messageId": "message_1"},
        {},
        {"accepted": True},
        lambda r, o: r.pin(
            "support", "group_1", {"operation": "unpin", "messageId": "message_1"}, options=o
        ),
    ),
]


@pytest.mark.parametrize("method,path,body,query,data,invoke", CASES)
async def test_typed_official_group_methods(method, path, body, query, data, invoke):
    def handler(request):
        assert request.method == method and request.url.path == path
        assert dict(request.url.params) == query
        assert (json.loads(request.content) if request.content else None) == body
        assert request.headers["idempotency-key"] == "official-group"
        return httpx.Response(
            200, json={"success": True, "data": data}, headers={"x-request-id": "req_group"}
        )

    async with AsyncMessagingClient(
        Credential("organization_api_key", "pmfa_" + "a" * 72),
        http_transport=httpx.MockTransport(handler),
    ) as client:
        result = await invoke(
            client.official_groups, RequestOptions(idempotency_key="official-group")
        )
        assert result.data == {"success": True, "data": data}
        assert result.metadata.request_id == "req_group" and result.metadata.status == 200
    async with AsyncMessagingClient(Credential("client_token", "pmfa_ct_local")) as client:
        with pytest.raises(ConfigurationError):
            await invoke(client.official_groups, RequestOptions())


@pytest.mark.parametrize(
    "method,path,body,query,data,invoke", [row for row in CASES if row[0] != "GET"]
)
async def test_every_official_group_mutation_is_single_attempt(
    method, path, body, query, data, invoke
):
    requests = []

    def handler(request):
        requests.append(request)
        return httpx.Response(
            503, json={"error": {"code": "server_error", "message": "Unavailable"}}
        )

    async with AsyncMessagingClient(
        Credential("organization_api_key", "pmfa_" + "a" * 72),
        http_transport=httpx.MockTransport(handler),
    ) as client:
        with pytest.raises(ServerError):
            await invoke(
                client.official_groups,
                RequestOptions(idempotency_key="manual", max_network_retries=3),
            )
    assert len(requests) == 1
