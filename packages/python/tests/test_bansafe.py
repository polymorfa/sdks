import json

import httpx
import pytest

from polymorfa import (
    AsyncClient,
    AsyncMessagingClient,
    ConfigurationError,
    ConflictError,
    Credential,
)

SETTINGS = {
    "presence": "dark",
    "typing": "off",
    "reads": "off",
    "pacing": "conversation",
    "onlineStart": 9,
    "onlineEnd": 17,
}
SAFE = {
    "projectId": "project_1",
    "ceiling": SETTINGS,
    "entitled": False,
    "entitlementReason": "not_entitled",
}
WARMUP = {
    "projectId": "project_1",
    "plan": {"enabled": True, "warmupDays": 14, "dailyStart": 5},
    "ceiling": 100,
    "curve": [{"day": 1, "allowance": 5}],
    "entitled": True,
    "entitlementReason": None,
}
INSURANCE = {"projectId": "project_1", "enabled": False, "banInsuranceIncluded": True}
HEALTH_BODY = {
    "version": 1,
    "enabled": True,
    "threshold": 25.0,
    "sessionAction": "slow_down",
    "slowDownMps": 0.25,
    "emailNotification": True,
    "webhookNotification": False,
}
HEALTH = {
    **HEALTH_BODY,
    "projectId": "project_1",
    "integrations": {"emailConfigured": True, "webhookConfigured": False},
}
SESSION = {
    "session": "support",
    "projectId": "project_1",
    "project": SETTINGS,
    "override": {
        "presence": "inherit",
        "typing": "inherit",
        "reads": "inherit",
        "pacing": "inherit",
    },
    "effective": SETTINGS,
    "applied": {
        "observedAt": "2026-10-11T00:00:00Z",
        "presence": "dark",
        "typing": None,
        "reads": "off",
        "pacing": "conversation",
    },
    "mismatch": True,
    "entitled": True,
    "entitlementReason": None,
}
CASES = [
    (
        "GET",
        "safe-mode",
        None,
        SAFE,
        lambda r: r.get_project_safe_mode("project_1"),
        lambda r: r.get_safe_mode("project_1"),
    ),
    (
        "PUT",
        "safe-mode",
        {"presence": "dark", "onlineStart": 9},
        SAFE,
        lambda r: r.update_project_safe_mode("project_1", {"presence": "dark", "onlineStart": 9}),
        lambda r: r.update_safe_mode("project_1", {"presence": "dark", "onlineStart": 9}),
    ),
    (
        "GET",
        "warmup-plan",
        None,
        WARMUP,
        lambda r: r.get_project_warmup_plan("project_1"),
        lambda r: r.get_warmup_plan("project_1"),
    ),
    (
        "PUT",
        "warmup-plan",
        {"enabled": True, "warmupDays": 14, "dailyStart": 5},
        WARMUP,
        lambda r: r.update_project_warmup_plan(
            "project_1", {"enabled": True, "warmupDays": 14, "dailyStart": 5}
        ),
        lambda r: r.update_warmup_plan(
            "project_1", {"enabled": True, "warmupDays": 14, "dailyStart": 5}
        ),
    ),
    (
        "GET",
        "insurance-evidence",
        None,
        INSURANCE,
        lambda r: r.get_project_insurance_evidence("project_1"),
        lambda r: r.get_insurance_evidence("project_1"),
    ),
    (
        "PUT",
        "insurance-evidence",
        {"enabled": False},
        INSURANCE,
        lambda r: r.update_project_insurance_evidence("project_1", {"enabled": False}),
        lambda r: r.update_insurance_evidence("project_1", {"enabled": False}),
    ),
    (
        "GET",
        "health-policy",
        None,
        HEALTH,
        lambda r: r.get_project_health_policy("project_1"),
        lambda r: r.get_health_policy("project_1"),
    ),
    (
        "PUT",
        "health-policy",
        HEALTH_BODY,
        HEALTH,
        lambda r: r.update_project_health_policy("project_1", HEALTH_BODY),
        lambda r: r.update_health_policy("project_1", HEALTH_BODY),
    ),
]


@pytest.mark.parametrize("method,setting,body,data,messaging,platform", CASES)
@pytest.mark.parametrize("family", ["messaging", "platform"])
async def test_typed_project_bansafe(method, setting, body, data, messaging, platform, family):
    fixture = {"data": data} | ({"success": True} if family == "messaging" else {})

    def handler(request):
        assert (
            request.method == method
            and request.url.path == f"/{family}/projects/project_1/{setting}"
        )
        assert (json.loads(request.content) if request.content else None) == body
        return httpx.Response(200, json=fixture, headers={"x-request-id": "req_bansafe"})

    client_class = AsyncMessagingClient if family == "messaging" else AsyncClient
    async with client_class(
        Credential("organization_api_key", "pmfa_" + "a" * 72),
        http_transport=httpx.MockTransport(handler),
    ) as client:
        response = (
            await messaging(client.ban_safe)
            if family == "messaging"
            else await platform(client.projects)
        )
        assert response.data == fixture and response.metadata.request_id == "req_bansafe"
    if family == "messaging":
        async with AsyncMessagingClient(Credential("client_token", "pmfa_ct_fixture")) as browser:
            with pytest.raises(ConfigurationError):
                await messaging(browser.ban_safe)


@pytest.mark.parametrize("method", ["GET", "PUT"])
async def test_typed_session_bansafe(method):
    body = {"pacing": "inherit"} if method == "PUT" else None

    def handler(request):
        assert request.method == method and request.url.path == "/messaging/support/safe-mode"
        assert (json.loads(request.content) if request.content else None) == body
        return httpx.Response(
            200, json={"success": True, "data": SESSION}, headers={"x-request-id": "req_safe"}
        )

    async with AsyncMessagingClient(
        Credential("project_token", "pmfa_pt_" + "a" * 93 + "A"),
        http_transport=httpx.MockTransport(handler),
    ) as client:
        response = (
            await client.ban_safe.get_session_safe_mode("support")
            if method == "GET"
            else await client.ban_safe.update_session_safe_mode("support", body)
        )
        assert response.data["data"] == SESSION and response.metadata.request_id == "req_safe"


async def test_health_policy_stale_version_preserves_conflict_metadata():
    attempts = []

    def handler(request):
        attempts.append(request)
        return httpx.Response(
            409,
            json={"error": {"code": "state_conflict", "message": "Read the latest version."}},
            headers={"x-request-id": "req_conflict"},
        )

    async with AsyncMessagingClient(
        Credential("organization_api_key", "pmfa_" + "a" * 72),
        http_transport=httpx.MockTransport(handler),
    ) as client:
        with pytest.raises(ConflictError) as error:
            await client.ban_safe.update_project_health_policy("project_1", HEALTH_BODY)
        assert (
            error.value.code == "state_conflict"
            and error.value.metadata.request_id == "req_conflict"
        )
    assert len(attempts) == 1


@pytest.mark.parametrize("method", ["GET", "PUT"])
async def test_platform_session_bansafe(method):
    body = {"pacing": "inherit"} if method == "PUT" else None
    fixture = {"data": SESSION}

    def handler(request):
        assert (
            request.method == method and request.url.path == "/platform/sessions/support/safe-mode"
        )
        assert (json.loads(request.content) if request.content else None) == body
        return httpx.Response(200, json=fixture, headers={"x-request-id": "req_platform_safe"})

    async with AsyncClient(
        Credential("organization_api_key", "pmfa_" + "a" * 72),
        http_transport=httpx.MockTransport(handler),
    ) as client:
        response = (
            await client.sessions.get_safe_mode("support")
            if method == "GET"
            else await client.sessions.update_safe_mode("support", body)
        )
        assert response.data == fixture and response.metadata.request_id == "req_platform_safe"
