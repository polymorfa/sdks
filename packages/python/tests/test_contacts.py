import json

import httpx
import pytest

from polymorfa import AsyncMessagingClient, Credential, ValidationError

CONTACT = {"id": "user_1", "name": "Ada", "pushName": "Ada", "phoneNumber": "+15551234567"}
INFO = {
    "id": "user_1",
    "status": "Available",
    "pictureId": "p1",
    "verifiedName": "Ada",
    "devices": [{"id": "user_1", "device": 0}],
}
BUSINESS = {
    "id": "user_1",
    "address": "Address",
    "email": "ada@example.com",
    "description": "Shop",
    "websites": [],
    "coverPhotoId": "cover",
    "categories": [],
    "options": {},
    "hoursTimeZone": "UTC",
    "hours": [],
}
PRIVACY = {
    "groupAdd": "contacts",
    "lastSeen": "contacts",
    "status": "contacts",
    "profile": "contacts",
    "readReceipts": "all",
    "online": "match_last_seen",
    "callAdd": "known",
    "messages": "contacts",
    "defense": "off",
    "stickers": "contacts",
}
LABEL = {"id": "label1", "name": "Inbox", "color": 1}
OBS = {"policy": "cache", "status": "fresh", "labels": [LABEL]}
CHAT = {
    "policy": "cache",
    "status": "fresh",
    "stale": False,
    "typingPolicy": "off",
    "typingStatus": "unknown",
    "typingUnknownReason": "disabled",
}
OK = {"success": True}


def env(data):
    return {"success": True, "data": data}


CASES = [
    ("GET", "/contacts", None, env([CONTACT]), lambda c: c.contacts.list("support")),
    (
        "GET",
        "/contacts/check?phone=%2B15551234567%2C%2B15551234568",
        None,
        env([{"exists": True, "id": "user_1"}]),
        lambda c: c.contacts.check("support", ["+15551234567", "+15551234568"]),
    ),
    (
        "GET",
        "/contacts/blocked",
        None,
        env({"hash": "h1", "contacts": [{"id": "user_1"}]}),
        lambda c: c.contacts.blocklist("support"),
    ),
    (
        "GET",
        "/contacts/user_1",
        None,
        env(CONTACT),
        lambda c: c.contacts.retrieve("support", "user_1"),
    ),
    (
        "GET",
        "/contacts/user_1/picture",
        None,
        env({"url": "https://example.com/p"}),
        lambda c: c.contacts.picture("support", "user_1"),
    ),
    (
        "GET",
        "/contacts/user_1/info",
        None,
        env(INFO),
        lambda c: c.contacts.info("support", "user_1"),
    ),
    (
        "GET",
        "/contacts/user_1/devices",
        None,
        env(["user_1:0"]),
        lambda c: c.contacts.devices("support", "user_1"),
    ),
    (
        "GET",
        "/contacts/user_1/business-profile",
        None,
        env(BUSINESS),
        lambda c: c.contacts.business_profile("support", "user_1"),
    ),
    ("POST", "/contacts/user_1/block", None, OK, lambda c: c.contacts.block("support", "user_1")),
    (
        "POST",
        "/contacts/user_1/unblock",
        None,
        OK,
        lambda c: c.contacts.unblock("support", "user_1"),
    ),
    (
        "GET",
        "/profile",
        None,
        env({"name": "Ada", "status": "Available"}),
        lambda c: c.profile.get("support"),
    ),
    ("PUT", "/profile/name", {"name": "Ada"}, OK, lambda c: c.profile.set_name("support", "Ada")),
    (
        "PUT",
        "/profile/status",
        {"status": "Available"},
        OK,
        lambda c: c.profile.set_status("support", "Available"),
    ),
    (
        "PUT",
        "/profile/picture",
        {"url": "https://example.com/p"},
        OK,
        lambda c: c.profile.set_picture("support", {"url": "https://example.com/p"}),
    ),
    ("DELETE", "/profile/picture", None, OK, lambda c: c.profile.delete_picture("support")),
    (
        "GET",
        "/identities/resolve?username=ada&usernameKey=1234",
        None,
        env({"id": "user_1", "username": "ada", "keyRequired": False}),
        lambda c: c.identities.resolve("support", {"username": "ada", "usernameKey": "1234"}),
    ),
    (
        "GET",
        "/labels?includeObservation=true",
        None,
        env(OBS),
        lambda c: c.labels.list("support", include_observation=True),
    ),
    (
        "POST",
        "/labels",
        {"name": "Inbox", "color": 1},
        env(LABEL),
        lambda c: c.labels.create("support", {"name": "Inbox", "color": 1}),
    ),
    (
        "PUT",
        "/labels/label1",
        {"color": 2},
        OK,
        lambda c: c.labels.update("support", "label1", {"color": 2}),
    ),
    ("DELETE", "/labels/label1", None, OK, lambda c: c.labels.delete("support", "label1")),
    (
        "GET",
        "/labels/chats/user_1?includeObservation=false",
        None,
        env([LABEL]),
        lambda c: c.labels.list_for_chat("support", "user_1", include_observation=False),
    ),
    (
        "PUT",
        "/labels/chats/user_1",
        {"labels": []},
        OK,
        lambda c: c.labels.replace_for_chat("support", "user_1", []),
    ),
    ("GET", "/privacy", None, env(PRIVACY), lambda c: c.privacy.get("support")),
    (
        "PUT",
        "/privacy/online",
        {"value": "match_last_seen"},
        env(PRIVACY),
        lambda c: c.privacy.set("support", "online", "match_last_seen"),
    ),
    (
        "PUT",
        "/privacy/disappearing/default",
        {"durationSeconds": 86400},
        OK,
        lambda c: c.privacy.set_default_disappearing_timer("support", 86400),
    ),
    (
        "GET",
        "/presence",
        None,
        env({"authoritative": False, "desired": "available"}),
        lambda c: c.presence.get("support"),
    ),
    (
        "POST",
        "/presence",
        {"presence": "available"},
        env({"status": "OK"}),
        lambda c: c.presence.set("support", "available"),
    ),
    (
        "GET",
        "/presence/user_1",
        None,
        env(CHAT),
        lambda c: c.presence.get_for_chat("support", "user_1"),
    ),
    (
        "POST",
        "/presence/user_1/subscribe",
        None,
        env({"status": "SUBSCRIBED", "expiresAt": "2026-10-11T00:01:00Z"}),
        lambda c: c.presence.subscribe("support", "user_1"),
    ),
]


@pytest.mark.parametrize("method,suffix,body,fixture,invoke", CASES)
async def test_every_observation_contact_profile_method(method, suffix, body, fixture, invoke):
    def handler(request):
        assert request.method == method
        assert request.url.raw_path.decode() == "/messaging/support" + suffix
        assert (json.loads(request.content) if request.content else None) == body
        return httpx.Response(200, json=fixture, headers={"x-request-id": "req_contact"})

    async with AsyncMessagingClient(
        Credential("organization_api_key", "pmfa_" + "a" * 72),
        http_transport=httpx.MockTransport(handler),
    ) as client:
        response = await invoke(client)
        assert response.data == fixture
        assert response.metadata.status == 200 and response.metadata.request_id == "req_contact"


async def test_privacy_identity_label_negative_validation():
    async with AsyncMessagingClient(
        Credential("organization_api_key", "pmfa_" + "a" * 72)
    ) as client:
        with pytest.raises(ValidationError):
            await client.privacy.set("support", "online", "contacts")
        with pytest.raises(ValidationError):
            await client.identities.resolve("support", {"id": "x", "phoneNumber": "+1"})
        with pytest.raises(ValidationError):
            await client.labels.update("support", "label1", {})
