import json

import httpx
import pytest

from polymorfa import AsyncMessagingClient, Credential

PARTICIPANT = {"id": "user_1", "isAdmin": True, "isSuperAdmin": True}
GROUP = {
    "id": "group_1",
    "name": "Friends",
    "description": "Chat",
    "createdAt": 1,
    "participants": [PARTICIPANT],
    "ownerId": "user_1",
}
INVITE = {
    "id": "group_1",
    "subject": "Friends",
    "createdAt": 1,
    "size": 1,
    "participants": [PARTICIPANT],
    "creatorId": "user_1",
}
CAPS = {
    "status": "synced",
    "syncedAt": "2026-10-11T00:00:00Z",
    "checkedAt": None,
    "capabilities": [
        {"key": "polls.endTime", "kind": "feature", "unit": None, "value": True, "source": "server"}
    ],
}
OK = {"success": True}


def env(data):
    return {"success": True, "data": data}


CASES = [
    ("GET", "", None, env([GROUP]), lambda g: g.list("support")),
    (
        "POST",
        "",
        {"name": "Friends", "participants": ["user_1"]},
        env(GROUP),
        lambda g: g.create("support", {"name": "Friends", "participants": ["user_1"]}),
    ),
    ("GET", "/join-info?code=abc", None, env(INVITE), lambda g: g.get_join_info("support", "abc")),
    ("POST", "/join", {"code": "abc"}, OK, lambda g: g.join("support", {"code": "abc"})),
    ("GET", "/group_1", None, env(GROUP), lambda g: g.retrieve("support", "group_1")),
    (
        "GET",
        "/group_1/capabilities",
        None,
        env(CAPS),
        lambda g: g.get_capabilities("support", "group_1"),
    ),
    ("DELETE", "/group_1", None, OK, lambda g: g.delete("support", "group_1")),
    ("POST", "/group_1/leave", None, OK, lambda g: g.leave("support", "group_1")),
    (
        "PUT",
        "/group_1/subject",
        {"value": "Friends"},
        OK,
        lambda g: g.set_subject("support", "group_1", {"value": "Friends"}),
    ),
    (
        "PUT",
        "/group_1/description",
        {"value": "Chat"},
        OK,
        lambda g: g.set_description("support", "group_1", {"value": "Chat"}),
    ),
    (
        "GET",
        "/group_1/invite-code",
        None,
        env({"code": "abc"}),
        lambda g: g.get_invite_code("support", "group_1"),
    ),
    (
        "POST",
        "/group_1/invite-code/revoke",
        None,
        env({"code": "def"}),
        lambda g: g.revoke_invite_code("support", "group_1"),
    ),
    (
        "GET",
        "/group_1/participants",
        None,
        env([PARTICIPANT]),
        lambda g: g.list_participants("support", "group_1"),
    ),
    (
        "POST",
        "/group_1/participants/add",
        {"participants": ["user_1"]},
        OK,
        lambda g: g.add_participants("support", "group_1", {"participants": ["user_1"]}),
    ),
    (
        "POST",
        "/group_1/participants/remove",
        {"participants": ["user_1"]},
        OK,
        lambda g: g.remove_participants("support", "group_1", {"participants": ["user_1"]}),
    ),
    (
        "POST",
        "/group_1/admin/promote",
        {"participants": ["user_1"]},
        OK,
        lambda g: g.promote_participants("support", "group_1", {"participants": ["user_1"]}),
    ),
    (
        "POST",
        "/group_1/admin/demote",
        {"participants": ["user_1"]},
        OK,
        lambda g: g.demote_participants("support", "group_1", {"participants": ["user_1"]}),
    ),
    (
        "PUT",
        "/group_1/picture",
        {"base64": "aGVsbG8="},
        OK,
        lambda g: g.set_picture("support", "group_1", {"base64": "aGVsbG8="}),
    ),
    (
        "PUT",
        "/group_1/settings/info-edit",
        {"adminsOnly": True},
        OK,
        lambda g: g.set_info_editing("support", "group_1", {"adminsOnly": True}),
    ),
    (
        "PUT",
        "/group_1/settings/messages",
        {"adminsOnly": True},
        OK,
        lambda g: g.set_messaging("support", "group_1", {"adminsOnly": True}),
    ),
    (
        "PUT",
        "/group_1/settings/member-add",
        {"mode": "admin_add"},
        OK,
        lambda g: g.set_member_add_mode("support", "group_1", {"mode": "admin_add"}),
    ),
    (
        "PUT",
        "/group_1/settings/join-approval",
        {"required": True},
        OK,
        lambda g: g.set_join_approval("support", "group_1", {"required": True}),
    ),
]


@pytest.mark.parametrize("method,suffix,body,fixture,invoke", CASES)
async def test_every_group_public_method_request_response_metadata(
    method, suffix, body, fixture, invoke
):
    def handler(request):
        assert request.method == method
        assert request.url.raw_path.decode() == "/messaging/support/groups" + suffix
        assert (json.loads(request.content) if request.content else None) == body
        assert request.headers["authorization"].startswith("Bearer pmfa_")
        return httpx.Response(200, json=fixture, headers={"x-request-id": "req_group"})

    async with AsyncMessagingClient(
        Credential("organization_api_key", "pmfa_" + "a" * 72),
        http_transport=httpx.MockTransport(handler),
    ) as client:
        response = await invoke(client.groups)
        assert response.data == fixture
        assert response.metadata.request_id == "req_group"
        assert response.metadata.status == 200
