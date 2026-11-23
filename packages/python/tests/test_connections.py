import json
from pathlib import Path

import httpx
import pytest

from polymorfa import AsyncMessagingClient, ConfigurationError, Credential

CONNECTION = {
    "connectionId": "support",
    "name": "support",
    "tenantId": "team_1",
    "type": "whatsapp",
    "method": "linked_device",
    "testMode": True,
    "status": "CONNECTED",
    "createdAt": "2026-10-11T00:00:00Z",
    "updatedAt": "2026-10-11T00:00:00Z",
}
PLATFORM = json.loads(
    (
        Path(__file__).resolve().parents[3] / "contracts/fixtures/connections/behavior.json"
    ).read_text()
)["scenarios"][0]["responses"][0]["body"]
ACCEPTED = {"success": True, "message": "Queued", "operationId": "op_1"}
CASES = [
    ("GET", "", None, PLATFORM, lambda s: s.list()),
    (
        "GET",
        "/support",
        None,
        {"success": True, "data": CONNECTION},
        lambda s: s.retrieve("support"),
    ),
    (
        "PUT",
        "/support",
        {
            "configuration": {
                "set": {"observation": {"presenceMode": "cache"}},
                "reset": ["historySync.mode"],
            },
            "revision": 1,
        },
        {"success": True, "data": CONNECTION},
        lambda s: s.update(
            "support",
            {
                "configuration": {
                    "set": {"observation": {"presenceMode": "cache"}},
                    "reset": ["historySync.mode"],
                },
                "revision": 1,
            },
        ),
    ),
    (
        "DELETE",
        "/support",
        None,
        {"data": {"removed": True, "connectionId": "support"}},
        lambda s: s.delete("support"),
    ),
    (
        "POST",
        "/support/start",
        None,
        {"data": {"starting": True, "connectionId": "support"}},
        lambda s: s.start("support"),
    ),
    (
        "POST",
        "/support/stop",
        None,
        {"data": {"stopping": True, "connectionId": "support"}},
        lambda s: s.stop("support"),
    ),
    ("POST", "/support/restart", None, ACCEPTED, lambda s: s.restart("support")),
    ("POST", "/support/logout", None, ACCEPTED, lambda s: s.logout("support")),
    (
        "GET",
        "/support/me",
        None,
        {
            "success": True,
            "data": {
                "id": "user_1",
                "pushName": "Ada",
                "accountType": "business_app",
                "phonePlatform": "android",
            },
        },
        lambda s: s.account("support"),
    ),
]


@pytest.mark.parametrize("method,suffix,body,fixture,invoke", CASES)
async def test_all_typed_connection_management_methods(method, suffix, body, fixture, invoke):
    def handler(request):
        assert request.method == method and request.url.path == "/platform/connections" + suffix
        assert (json.loads(request.content) if request.content else None) == body
        return httpx.Response(200, json=fixture, headers={"x-request-id": "req_connection"})

    async with AsyncMessagingClient(
        Credential(
            "team_api_key",
            "pmfa_AAECAwQFBgcICQoLDA0ODxAREhM73f-k",
        ),
        http_transport=httpx.MockTransport(handler),
    ) as client:
        result = await invoke(client.connections)
        assert result.data == fixture
        assert result.metadata.status == 200 and result.metadata.request_id == "req_connection"
    async with AsyncMessagingClient(Credential("client_token", "pmfa_ct_bG9jYWw")) as client:
        with pytest.raises(ConfigurationError):
            await invoke(client.connections)
