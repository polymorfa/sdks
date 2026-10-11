import json

import httpx
import pytest

from polymorfa import AsyncClient, AsyncMessagingClient, ConfigurationError, Credential
from polymorfa.policies import graph_transport_headers

VALUES = {
    "presenceMode": "cache",
    "typingMode": "events",
    "labelMode": "project",
    "quickReplyMode": "off",
}
PROJECT = {"projectId": "project_1"} | VALUES
SESSION = {
    "sessionName": "support",
    "projectId": "project_1",
    "project": VALUES,
    "override": {
        "presenceMode": "inherit",
        "typingMode": "off",
        "labelMode": "inherit",
        "quickReplyMode": "inherit",
    },
    "effective": VALUES | {"typingMode": "off"},
}
POLICY = {
    "scope": "session",
    "revision": "revision_1",
    "prefer": None,
    "allowedTransports": ["linked_devices", "official_api"],
}
UPDATE_POLICY = {
    "expectedRevision": "revision_1",
    "prefer": "official_api",
    "allowedTransports": ["official_api"],
}
LINK = {
    "revision": "revision_1",
    "paused": False,
    "connections": [
        {"kind": "linked_devices", "status": "CONNECTED", "enabled": True},
        {"kind": "official_api", "status": "DISCONNECTED", "enabled": False},
    ],
}
CONFIG = {
    "effective": {
        "observation": VALUES,
        "historySync": {"mode": "metadata_only", "requestFull": False},
        "hms": {"enabled": False},
    },
    "overrides": {},
    "sources": {
        "historySync.mode": "platform",
        "historySync.requestFull": "consent",
        "hms": "team",
        "observation.presenceMode": "project",
        "observation.typingMode": "project",
        "observation.labelMode": "project",
        "observation.quickReplyMode": "project",
    },
    "requestedHistory": {"mode": "deliver", "requestFull": True},
    "revisions": {"team": 1, "project": 2, "session": 3},
    "historyConsent": "pending",
    "application": {"desiredGeneration": 2, "appliedGeneration": 1, "status": "pending"},
}
CASES = [
    (
        "GET",
        "/messaging/projects/project_1/observation-policy",
        None,
        {},
        PROJECT,
        lambda c: c.observation_policies.retrieve_for_project("project_1"),
    ),
    (
        "GET",
        "/messaging/support/observation-policy",
        None,
        {},
        SESSION,
        lambda c: c.observation_policies.retrieve_for_session("support"),
    ),
    (
        "GET",
        "/messaging/routing/hybrid",
        None,
        {"scope": "team"},
        POLICY | {"scope": "team"},
        lambda c: c.hybrid_link.get_policy({"scope": "team"}),
    ),
    (
        "GET",
        "/messaging/routing/hybrid",
        None,
        {"scope": "project", "projectId": "project_1"},
        POLICY | {"scope": "project"},
        lambda c: c.hybrid_link.get_policy({"scope": "project", "projectId": "project_1"}),
    ),
    (
        "PUT",
        "/messaging/routing/hybrid",
        UPDATE_POLICY,
        {"scope": "session", "projectId": "project_1", "session": "support"},
        POLICY,
        lambda c: c.hybrid_link.set_policy(
            {"scope": "session", "projectId": "project_1", "session": "support"}, UPDATE_POLICY
        ),
    ),
    (
        "GET",
        "/messaging/support/hybrid-link",
        None,
        {},
        LINK,
        lambda c: c.hybrid_link.state("support"),
    ),
    (
        "PUT",
        "/messaging/support/hybrid-link",
        {"expectedRevision": "revision_1", "paused": True},
        {},
        {"revision": "revision_2", "paused": True},
        lambda c: c.hybrid_link.set_paused(
            "support", {"expectedRevision": "revision_1", "paused": True}
        ),
    ),
]


@pytest.mark.parametrize("method,path,body,query,data,invoke", CASES)
async def test_typed_observation_and_hybrid(method, path, body, query, data, invoke):
    def handler(request):
        assert request.method == method and request.url.path == path
        assert dict(request.url.params) == query
        assert (json.loads(request.content) if request.content else None) == body
        return httpx.Response(
            200, json={"success": True, "data": data}, headers={"x-request-id": "req_policy"}
        )

    async with AsyncMessagingClient(
        Credential("organization_api_key", "pmfa_" + "a" * 72),
        http_transport=httpx.MockTransport(handler),
    ) as client:
        result = await invoke(client)
        assert result.data == {"success": True, "data": data}
        assert result.metadata.request_id == "req_policy" and result.metadata.status == 200


@pytest.mark.parametrize("project_id", [None, "project_1"])
@pytest.mark.parametrize("write", [False, True])
async def test_saved_configuration_owner_context(project_id, write):
    update = {
        "configuration": {"set": {"historySync": {"mode": "deliver", "requestFull": True}}},
        "revision": 2,
    }

    def handler(request):
        assert request.url.path == "/platform/session-configuration"
        if write:
            assert request.method == "PUT" and dict(request.url.params) == {}
            expected = update | ({"projectId": project_id} if project_id else {})
            assert json.loads(request.content) == expected
        else:
            assert request.method == "GET" and not request.content
            assert dict(request.url.params) == ({"projectId": project_id} if project_id else {})
        return httpx.Response(200, json={"data": CONFIG}, headers={"x-request-id": "req_config"})

    async with AsyncClient(
        Credential("organization_api_key", "pmfa_" + "a" * 72),
        http_transport=httpx.MockTransport(handler),
    ) as client:
        resource = (client.project(project_id) if project_id else client).session_configuration
        result = await resource.update(update) if write else await resource.retrieve()
        assert result.data == CONFIG and result.metadata.request_id == "req_config"


async def test_hybrid_server_scope_and_graph_header_helper():
    async with AsyncMessagingClient(Credential("client_token", "pmfa_ct_local")) as client:
        for invoke in [
            lambda: client.hybrid_link.get_policy({"scope": "team"}),
            lambda: client.hybrid_link.set_policy({"scope": "team"}, UPDATE_POLICY),
            lambda: client.hybrid_link.state("support"),
            lambda: client.hybrid_link.set_paused(
                "support", {"expectedRevision": "revision_1", "paused": True}
            ),
        ]:
            with pytest.raises(ConfigurationError):
                await invoke()
    assert graph_transport_headers("official_api") == {"X-Polymorfa-Transport": "official_api"}
