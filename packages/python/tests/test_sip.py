import json

import httpx
import pytest

from polymorfa import (
    AsyncClient,
    AsyncProjectClient,
    ConfigurationError,
    Credential,
    NotFoundError,
    RequestOptions,
)

TRUNK = {
    "id": "trunk_1",
    "projectId": "project_1",
    "name": "PBX",
    "enabled": True,
    "direction": "both",
    "outbound": {
        "targetUri": "sip:pbx.example.com",
        "transport": "tls",
        "authUsername": "test-user",
        "hasPassword": True,
        "fromUser": None,
    },
    "inbound": {
        "username": "test-user",
        "realm": "sip.example.com",
        "session": "support",
        "allowedAddresses": ["192.0.2.0/24"],
        "allowedDestinations": ["+1"],
    },
    "codecs": ["PCMU", "PCMA", "opus"],
    "maxConcurrentCalls": 5,
    "revision": 1,
    "createdAt": "2026-10-11T00:00:00Z",
    "updatedAt": "2026-10-11T00:00:00Z",
}
CREDS = {
    "username": "test-user",
    "password": "fixture-password-not-a-secret",
    "realm": "sip.example.com",
}
ENDPOINT = {
    "status": "hosted",
    "host": "sip.example.com",
    "transports": [
        {"transport": "tls", "port": 5061, "srtp": "required"},
        {"transport": "udp", "port": 5060, "srtp": "not_supported"},
    ],
    "rtp": {"protocol": "udp", "portMin": 10000, "portMax": 20000},
}
INPUT = {
    "name": "PBX",
    "direction": "both",
    "outbound": {
        "targetUri": "sip:pbx.example.com",
        "transport": "tls",
        "authUsername": "test-user",
        "authPassword": "fixture-password-not-a-secret",
        "fromUser": None,
    },
    "inbound": {
        "session": "support",
        "allowedAddresses": ["192.0.2.0/24"],
        "allowedDestinations": ["+1"],
    },
    "codecs": ["PCMU", "PCMA", "opus"],
    "maxConcurrentCalls": 5,
}
CASES = [
    (
        "GET",
        "/platform/sip-trunks",
        None,
        {"projectId": "project_1"},
        [TRUNK],
        lambda r: r.list(project_id="project_1"),
    ),
    ("GET", "/platform/sip/endpoint", None, {}, ENDPOINT, lambda r: r.endpoint()),
    (
        "GET",
        "/platform/sip/endpoint",
        None,
        {},
        {"status": "sip_not_hosted", "host": None, "transports": [], "rtp": None},
        lambda r: r.endpoint(),
    ),
    (
        "POST",
        "/platform/sip-trunks",
        INPUT | {"projectId": "project_1"},
        {},
        {"trunk": TRUNK, "inboundCredentials": CREDS},
        lambda r: r.create(INPUT, project_id="project_1"),
    ),
    ("GET", "/platform/sip-trunks/trunk_1", None, {}, TRUNK, lambda r: r.retrieve("trunk_1")),
    (
        "PATCH",
        "/platform/sip-trunks/trunk_1",
        {
            "enabled": False,
            "expectedRevision": 1,
            "outbound": {"authUsername": None},
            "inbound": {"session": None},
        },
        {},
        TRUNK | {"revision": 2},
        lambda r: r.update(
            "trunk_1",
            {
                "enabled": False,
                "expectedRevision": 1,
                "outbound": {"authUsername": None},
                "inbound": {"session": None},
            },
        ),
    ),
    (
        "DELETE",
        "/platform/sip-trunks/trunk_1",
        None,
        {},
        {"id": "trunk_1", "deleted": True},
        lambda r: r.delete("trunk_1"),
    ),
    (
        "POST",
        "/platform/sip-trunks/trunk_1/credentials",
        None,
        {},
        CREDS,
        lambda r: r.rotate_credentials("trunk_1"),
    ),
]


@pytest.mark.parametrize("method,path,body,query,data,invoke", CASES)
async def test_typed_sip_methods(method, path, body, query, data, invoke):
    def handler(request):
        assert request.method == method and request.url.path == path
        assert dict(request.url.params) == query
        assert (json.loads(request.content) if request.content else None) == body
        return httpx.Response(200, json={"data": data}, headers={"x-request-id": "req_sip"})

    async with AsyncClient(
        Credential("organization_api_key", "pmfa_" + "a" * 72),
        http_transport=httpx.MockTransport(handler),
    ) as client:
        result = await invoke(client.sip_trunks)
        assert result.data == data and result.metadata.request_id == "req_sip"
        assert result.metadata.status == 200


@pytest.mark.parametrize("action", ["retrieve", "update", "delete", "rotate"])
async def test_project_org_key_confines_before_mutation(action):
    requests = []

    def handler(request):
        requests.append(request)
        assert request.method == "GET" and request.url.path == "/platform/sip-trunks/trunk_1"
        if action != "retrieve":
            assert "idempotency-key" not in request.headers
        return httpx.Response(200, json={"data": TRUNK | {"projectId": "project_other"}})

    async with AsyncClient(
        Credential("organization_api_key", "pmfa_" + "a" * 72),
        http_transport=httpx.MockTransport(handler),
    ) as client:
        resource = client.project("project_1").sip_trunks
        options = RequestOptions(idempotency_key="sip-change")
        with pytest.raises(NotFoundError) as caught:
            if action == "retrieve":
                await resource.retrieve("trunk_1", options=options)
            elif action == "update":
                await resource.update("trunk_1", {"enabled": False}, options=options)
            elif action == "delete":
                await resource.delete("trunk_1", options=options)
            else:
                await resource.rotate_credentials("trunk_1", options=options)
        assert caught.value.code == "resource_not_found" and caught.value.status == 404
    assert len(requests) == 1


async def test_project_binding_preflight_and_project_token_write():
    requests = []

    def handler(request):
        requests.append(request)
        if request.method == "GET":
            assert dict(request.url.params) == {"projectId": "project_1"}
            return httpx.Response(200, json={"data": [TRUNK]})
        assert request.method == "PATCH" and request.headers["idempotency-key"] == "sip-change"
        return httpx.Response(200, json={"data": TRUNK})

    async with AsyncClient(
        Credential("organization_api_key", "pmfa_" + "a" * 72),
        http_transport=httpx.MockTransport(handler),
    ) as client:
        with pytest.raises(ConfigurationError):
            await client.sip_trunks.list()
        bound = client.project("project_1").sip_trunks
        with pytest.raises(ConfigurationError):
            await bound.list(project_id="project_other")
        result = await bound.list()
        assert result.data[0]["projectId"] == "project_1"
    async with AsyncProjectClient(
        Credential("project_token", "pmfa_pt_" + "a" * 93 + "A"),
        "project_1",
        http_transport=httpx.MockTransport(handler),
    ) as client:
        result = await client.sip_trunks.update(
            "trunk_1", {"enabled": True}, options=RequestOptions(idempotency_key="sip-change")
        )
        assert result.data["id"] == "trunk_1"
    assert [r.method for r in requests] == ["GET", "PATCH"]


async def test_project_org_key_checks_ownership_then_keeps_write_key():
    requests = []

    def handler(request):
        requests.append(request)
        assert request.url.path == "/platform/sip-trunks/trunk_1"
        if request.method == "GET":
            assert "idempotency-key" not in request.headers
        else:
            assert request.method == "PATCH" and request.headers["idempotency-key"] == "sip-write"
            assert json.loads(request.content) == {"enabled": False, "expectedRevision": 1}
        return httpx.Response(200, json={"data": TRUNK}, headers={"x-request-id": "req_confined"})

    async with AsyncClient(
        Credential("organization_api_key", "pmfa_" + "a" * 72),
        http_transport=httpx.MockTransport(handler),
    ) as client:
        result = await client.project("project_1").sip_trunks.update(
            "trunk_1",
            {"enabled": False, "expectedRevision": 1},
            options=RequestOptions(idempotency_key="sip-write"),
        )
        assert result.data == TRUNK and result.metadata.request_id == "req_confined"
    assert [r.method for r in requests] == ["GET", "PATCH"]
