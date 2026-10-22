import json

import httpx
import pytest

from polymorfa import (
    AsyncMessagingClient,
    ConfigurationError,
    Credential,
    RequestOptions,
    ServerError,
    ValidationError,
)

PERMISSION_STATE = {
    "status": "temporary",
    "expiresAt": "2026-10-12T00:00:00Z",
    "source": "sync",
    "updatedAt": "2026-10-11T00:00:00Z",
    "checkedAt": "2026-10-11T00:00:00Z",
    "fresh": True,
    "actions": {
        "requestPermission": {
            "allowed": False,
            "limits": [
                {"period": "PT24H", "maxAllowed": 1, "used": 1, "resetsAt": "2026-10-12T00:00:00Z"}
            ],
        },
        "startCall": {"allowed": True, "limits": []},
    },
}
SETTINGS = {
    "callsEnabled": True,
    "conferenceMode": True,
    "inboundRoute": "clients",
    "sipTrunkId": None,
    "sipClaim": True,
    "hostCloudApiCalls": False,
    "revision": 1,
    "updatedAt": "2026-10-11T00:00:00Z",
}
QUALITY = {
    "kind": "quality",
    "connectionId": "connection_1",
    "participant": "agent_1",
    "client": {"sdk": "polymorfa-sdk", "version": "0.1.0-dev", "platform": "other"},
    "quality": {
        "rttMs": 42,
        "jitterMs": 5,
        "packetsLost": 0,
        "packetsReceived": 100,
        "audioCodec": "audio/opus",
        "videoCodec": "video/h264",
        "candidateType": "relay",
        "reconnects": 0,
    },
}
CASES = [
    (
        "POST",
        "/messaging/voip/calls",
        {"session": "support", "to": "+15551234567", "participant": "agent_1", "video": True},
        {"success": True, "data": {"callId": "call_1", "session": "support", "video": True}},
        False,
        lambda r: r.place(
            {"session": "support", "to": "+15551234567", "participant": "agent_1", "video": True}
        ),
    ),
    (
        "POST",
        "/messaging/voip/calls/call_1/accept",
        {"exclusive": True, "participant": "agent_1"},
        {
            "success": True,
            "data": {"answered": True, "answeredBy": "server:agent_1", "exclusive": True},
        },
        False,
        lambda r: r.accept("call_1", {"exclusive": True, "participant": "agent_1"}),
    ),
    (
        "POST",
        "/messaging/voip/calls/call_1/reject",
        None,
        {"success": True},
        False,
        lambda r: r.reject("call_1"),
    ),
    (
        "POST",
        "/messaging/voip/calls/call_1/leave",
        {"connectionId": "connection_1", "participant": "agent_1"},
        {"success": True},
        False,
        lambda r: r.leave("call_1", "connection_1", participant="agent_1"),
    ),
    (
        "DELETE",
        "/messaging/voip/calls/call_1",
        None,
        {"success": True},
        False,
        lambda r: r.end("call_1"),
    ),
    (
        "POST",
        "/messaging/voip/calls/call_1/participants",
        {"to": "+15551234567"},
        {
            "success": True,
            "data": {
                "id": "user_1",
                "phoneNumber": "+15551234567",
                "audioMuted": False,
                "video": True,
                "state": "invited",
                "handRaised": False,
            },
        },
        False,
        lambda r: r.add_participant("call_1", "+15551234567"),
    ),
    (
        "POST",
        "/messaging/voip/calls/call_1/participants/ring",
        {"to": "+15551234567"},
        {"success": True},
        False,
        lambda r: r.ring_participant("call_1", "+15551234567"),
    ),
    (
        "GET",
        "/messaging/support/call-permissions/user_1",
        None,
        {"success": True, "data": {**PERMISSION_STATE, "conversation": {"id": "user_1"}}},
        True,
        lambda r: r.retrieve_call_permission("support", "user_1"),
    ),
    (
        "GET",
        "/platform/sessions/support/call-settings",
        None,
        {"success": True, "data": SETTINGS},
        True,
        lambda r: r.retrieve_call_settings("support"),
    ),
    (
        "PUT",
        "/platform/sessions/support/call-settings",
        {"conferenceMode": False, "expectedRevision": 1},
        {"success": True, "data": {**SETTINGS, "conferenceMode": False, "revision": 2}},
        True,
        lambda r: r.update_call_settings(
            "support", {"conferenceMode": False, "expectedRevision": 1}
        ),
    ),
    (
        "POST",
        "/messaging/voip/call-links",
        {"session": "support", "video": True},
        {
            "success": True,
            "data": {
                "session": "support",
                "video": True,
                "token": "link_fixture",
                "url": "https://call.whatsapp.com/fixture",
            },
        },
        True,
        lambda r: r.create_call_link({"session": "support", "video": True}),
    ),
    (
        "POST",
        "/messaging/voip/call-links/preview",
        {"session": "support", "video": True, "token": "link_fixture"},
        {
            "success": True,
            "data": {
                "session": "support",
                "video": True,
                "creator": {"id": "user_1"},
                "approvalRequired": True,
                "isAdmin": False,
            },
        },
        True,
        lambda r: r.preview_call_link(
            {"session": "support", "video": True, "token": "link_fixture"}
        ),
    ),
    (
        "POST",
        "/messaging/voip/calls/check",
        {"session": "support", "to": "+15551234567"},
        {
            "success": True,
            "data": {"allowed": True, "refusal": None, "permission": PERMISSION_STATE},
        },
        True,
        lambda r: r.check({"session": "support", "to": "+15551234567"}),
    ),
    (
        "POST",
        "/messaging/voip/calls/call_1/reaction",
        {"connectionId": "connection_1", "participant": "agent_1", "emoji": "👍"},
        {"success": True},
        False,
        lambda r: r.send_reaction(
            "call_1", {"connectionId": "connection_1", "participant": "agent_1", "emoji": "👍"}
        ),
    ),
    (
        "POST",
        "/messaging/voip/calls/call_1/hand",
        {"connectionId": "connection_1", "raised": True},
        {"success": True},
        False,
        lambda r: r.set_hand_raised("call_1", {"connectionId": "connection_1", "raised": True}),
    ),
    (
        "POST",
        "/messaging/voip/calls/call_1/reports",
        QUALITY,
        {"success": True},
        False,
        lambda r: r.report("call_1", QUALITY),
    ),
    (
        "POST",
        "/messaging/voip/calls/call_1/reports",
        {"kind": "error", "connectionId": "connection_1", "error": {"code": "ice_failed"}},
        {"success": True},
        False,
        lambda r: r.report(
            "call_1",
            {"kind": "error", "connectionId": "connection_1", "error": {"code": "ice_failed"}},
        ),
    ),
]


@pytest.mark.parametrize("method,path,body,fixture,server,invoke", CASES)
async def test_typed_voip_controls(method, path, body, fixture, server, invoke):
    def handler(request):
        assert request.method == method and request.url.path == path
        assert (json.loads(request.content) if request.content else None) == body
        return httpx.Response(200, json=fixture, headers={"x-request-id": "req_calls"})

    async with AsyncMessagingClient(
        Credential("organization_api_key", "pmfa_" + "a" * 72),
        http_transport=httpx.MockTransport(handler),
    ) as client:
        response = await invoke(client.voip)
        assert response.data == fixture and response.metadata.request_id == "req_calls"
    if server:
        async with AsyncMessagingClient(Credential("client_token", "pmfa_ct_fixture")) as browser:
            with pytest.raises(ConfigurationError):
                await invoke(browser.voip)


async def test_call_control_guards_and_no_retry_boundaries():
    attempts = []

    def handler(request):
        attempts.append(request)
        return httpx.Response(503, json={"error": {"code": "service_unavailable"}})

    async with AsyncMessagingClient(
        Credential("organization_api_key", "pmfa_" + "a" * 72),
        http_transport=httpx.MockTransport(handler),
    ) as client:
        for invoke in (
            lambda: client.voip.create_call_link(
                {"session": "support"}, options=RequestOptions(idempotency_key="bad")
            ),
            lambda: client.voip.preview_call_link({"session": "support", "token": "?bad"}),
            lambda: client.voip.update_call_settings("support", {"expectedRevision": 1}),
            lambda: client.voip.report(
                "call_1", {"kind": "quality", "connectionId": "connection_1", "quality": {}}
            ),
            lambda: client.voip.report(
                "call_1",
                {"kind": "quality", "connectionId": "connection_1", "quality": {"rttMs": 60001}},
            ),
            lambda: client.voip.set_hand_raised(
                "call_1", {"connectionId": "short", "raised": True}
            ),
        ):
            with pytest.raises(ValidationError):
                await invoke()
        assert not attempts
        for invoke in (
            lambda: client.voip.create_call_link({"session": "support"}),
            lambda: client.voip.send_reaction(
                "call_1",
                {"connectionId": "connection_1", "emoji": "👍"},
                options=RequestOptions(idempotency_key="key", max_network_retries=3),
            ),
            lambda: client.voip.set_hand_raised(
                "call_1",
                {"connectionId": "connection_1", "raised": True},
                options=RequestOptions(idempotency_key="key", max_network_retries=3),
            ),
        ):
            before = len(attempts)
            with pytest.raises(ServerError):
                await invoke()
            assert len(attempts) == before + 1
    async with AsyncMessagingClient(Credential("client_token", "pmfa_ct_fixture")) as browser:
        with pytest.raises(ConfigurationError):
            await browser.voip.accept("call_1", {"participant": "agent_1"})
