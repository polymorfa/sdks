import json
from pathlib import Path

import httpx
import pytest

from polymorfa import AsyncMessagingClient, ConfigurationError, Credential

SESSION = {
    "sessionId": "support",
    "name": "support",
    "tenantId": "org_1",
    "type": "linked_device",
    "testMode": True,
    "status": "CONNECTED",
    "createdAt": "2026-10-11T00:00:00Z",
    "updatedAt": "2026-10-11T00:00:00Z",
}
PLATFORM = json.loads(
    (Path(__file__).resolve().parents[3] / "contracts/fixtures/behavior.json").read_text()
)["scenarios"][0]["responses"][0]["body"]
ACCEPTED = {"success": True, "message": "Queued", "operationId": "op_1"}
CASES = [
    ("GET", "", None, PLATFORM, lambda s: s.list()),
    ("GET", "/support", None, {"success": True, "data": SESSION}, lambda s: s.retrieve("support")),
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
        {"success": True, "data": SESSION},
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
        {"data": {"removed": True, "sessionId": "support"}},
        lambda s: s.delete("support"),
    ),
    (
        "POST",
        "/support/start",
        None,
        {"data": {"starting": True, "sessionId": "support"}},
        lambda s: s.start("support"),
    ),
    (
        "POST",
        "/support/stop",
        None,
        {"data": {"stopping": True, "sessionId": "support"}},
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
async def test_all_typed_session_management_methods(method, suffix, body, fixture, invoke):
    def handler(request):
        assert request.method == method and request.url.path == "/platform/sessions" + suffix
        assert (json.loads(request.content) if request.content else None) == body
        return httpx.Response(200, json=fixture, headers={"x-request-id": "req_session"})

    async with AsyncMessagingClient(
        Credential("organization_api_key", "pmfa_" + "a" * 72),
        http_transport=httpx.MockTransport(handler),
    ) as client:
        result = await invoke(client.sessions)
        assert result.data == fixture
        assert result.metadata.status == 200 and result.metadata.request_id == "req_session"
    async with AsyncMessagingClient(Credential("client_token", "pmfa_ct_local")) as client:
        with pytest.raises(ConfigurationError):
            await invoke(client.sessions)
