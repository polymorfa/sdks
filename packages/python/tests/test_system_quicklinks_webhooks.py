import json

import httpx
import pytest

from polymorfa import (
    AsyncBridgeClient,
    AsyncMessagingClient,
    AsyncSystemClient,
    ConfigurationError,
    Credential,
    RequestOptions,
)


@pytest.mark.parametrize(
    "method,path,data",
    [
        (
            "status",
            "/messaging/info/status",
            {"status": "ok", "uptime": "1h", "version": "1", "env": "production"},
        ),
        (
            "version",
            "/messaging/info/version",
            {
                "version": "1",
                "buildTime": "2026-10-11",
                "env": "production",
                "apiVersion": "2026-08-01",
                "minSupportedVersion": "2026-08-01",
            },
        ),
        (
            "health",
            "/health",
            {
                "status": "ok",
                "checks": {
                    "api": {"status": "ok"},
                    "storage": {"status": "error", "error": "not configured"},
                },
            },
        ),
        ("ping", "/ping", {"status": "ok"}),
    ],
)
async def test_credential_free_typed_system_methods(method, path, data):
    def handler(request):
        assert (
            request.method == "GET"
            and request.url.path == path
            and "authorization" not in request.headers
        )
        assert request.headers["x-proof"] == "system"
        return httpx.Response(
            200, json={**data, "future": True}, headers={"x-request-id": "req_system"}
        )

    async with AsyncSystemClient(http_transport=httpx.MockTransport(handler)) as client:
        result = await getattr(client, method)(
            options=RequestOptions(headers={"x-proof": "system"})
        )
        assert (
            result.data == {**data, "future": True} and result.metadata.request_id == "req_system"
        )


async def test_bridge_route_project_token_only():
    token = Credential("project_token", "pmfa_pt_" + "a" * 93 + "A")
    data = {
        "wsUrl": "wss://example.invalid/bridge",
        "region": "BR",
        "kind": "sandbox",
        "signal": "bartender",
        "tokenKind": "project",
        "expiresAt": 1000,
    }

    def handler(request):
        assert (
            request.url.path == "/messaging/bridge/route"
            and request.headers["authorization"] == "Bearer " + token.value
        )
        return httpx.Response(200, json=data, headers={"x-request-id": "req_bridge"})

    with pytest.raises(ConfigurationError):
        AsyncBridgeClient(Credential("organization_api_key", "pmfa_" + "a" * 72))
    async with AsyncBridgeClient(token, http_transport=httpx.MockTransport(handler)) as client:
        result = await client.routes.resolve()
        assert result.data == data and result.metadata.request_id == "req_bridge"


QINPUT = {
    "purpose": "initial",
    "session": "support",
    "projectId": "project_1",
    "customerId": "customer_1",
    "externalId": "external_1",
    "connectionGoal": "hybrid",
    "billingControls": {"limitCredits": 1.000001, "priority": 3},
    "configuration": {
        "observation": {
            "presenceMode": "events",
            "typingMode": "cache",
            "labelMode": "project",
            "quickReplyMode": "off",
        },
        "hms": {"enabled": False},
        "historySync": {"consent": "ask", "mode": "metadata_only", "requestFull": False},
        "connectionPreference": "both",
        "connectionEnforcement": "prefer",
        "methods": ["qr", "pairing"],
        "defaultMethod": "qr",
        "prefillPhone": "+15551234567",
        "allowPhoneChange": False,
    },
}
QLINK = {
    "id": "link_1",
    "url": "https://example.invalid/quicklink",
    "session": "support",
    "purpose": "initial",
    "connectionGoal": "hybrid",
    "addConnection": "official_api",
    "expiresAt": None,
}
STATUS = {
    "id": "link_1",
    "purpose": "initial",
    "connectionGoal": "hybrid",
    "addConnection": "official_api",
    "hybridPhase": "cloud_setup",
    "status": "pending",
    "session": "support",
    "expiresAt": None,
    "openedAt": None,
    "connectedAt": None,
    "phone": None,
    "errorCode": None,
    "onboarding": {
        "stage": "setup",
        "connection": "official_api",
        "coexistence": True,
        "contactsSync": "accepted",
        "historySync": "pending",
        "historyProgress": 20,
        "sync": {
            "contacts": {"request": "accepted", "receiptRecorded": True},
            "history": {"request": "requesting", "receiptRecorded": False, "delivery": "partial"},
        },
        "errorCode": None,
    },
}
AVAILABILITY = {
    "allowed": True,
    "addConnection": "linked_devices",
    "connections": [{"kind": "official_api", "status": "CONNECTED", "enabled": True}],
    "resumeQuickLinkId": None,
}
RETRIES = {"attempts": 3, "delaySeconds": 1.5, "policy": "exponential"}
HOOK = {
    "id": "hook_1",
    "tenantId": "org_1",
    "session": "support",
    "url": "https://example.invalid/webhook",
    "events": ["message.received"],
    "retries": RETRIES,
    "headers": [{"name": "x-customer", "value": "fixture"}],
    "enabled": True,
    "format": "native",
    "createdAt": "2026-10-11T00:00:00Z",
}
HINPUT = {
    key: HOOK[key] for key in ["session", "url", "events", "retries", "headers", "format"]
} | {"hmacKey": "fixture_only_secret"}
CASES = [
    (
        "quick_links.create",
        "POST",
        "/messaging/quicklinks",
        QINPUT,
        {},
        {"success": True, "data": QLINK},
        lambda c, o: c.quick_links.create(QINPUT, options=o),
    ),
    (
        "quick_links.availability",
        "GET",
        "/messaging/quicklinks/availability",
        None,
        {"projectId": "project_1", "session": "support"},
        {"success": True, "data": AVAILABILITY},
        lambda c, o: c.quick_links.availability("project_1", "support", options=o),
    ),
    (
        "quick_links.retrieve",
        "GET",
        "/messaging/quicklinks/link_1",
        None,
        {},
        {"success": True, "data": STATUS},
        lambda c, o: c.quick_links.retrieve("link_1", options=o),
    ),
    (
        "quick_links.cancel",
        "DELETE",
        "/messaging/quicklinks/link_1",
        None,
        {},
        {"success": True, "message": "Cancelled"},
        lambda c, o: c.quick_links.cancel("link_1", options=o),
    ),
    (
        "webhooks.list",
        "GET",
        "/messaging/webhooks",
        None,
        {},
        {"success": True, "data": [HOOK]},
        lambda c, o: c.webhooks.list(options=o),
    ),
    (
        "webhooks.create",
        "POST",
        "/messaging/webhooks",
        HINPUT,
        {},
        {"success": True, "data": HOOK},
        lambda c, o: c.webhooks.create(HINPUT, options=o),
    ),
    (
        "webhooks.retrieve",
        "GET",
        "/messaging/webhooks/hook_1",
        None,
        {},
        {"success": True, "data": HOOK},
        lambda c, o: c.webhooks.retrieve("hook_1", options=o),
    ),
    (
        "webhooks.update",
        "PUT",
        "/messaging/webhooks/hook_1",
        {"enabled": False, "retries": RETRIES},
        {},
        {"success": True, "data": {**HOOK, "enabled": False}},
        lambda c, o: c.webhooks.update("hook_1", {"enabled": False, "retries": RETRIES}, options=o),
    ),
    (
        "webhooks.delete",
        "DELETE",
        "/messaging/webhooks/hook_1",
        None,
        {},
        {"success": True, "message": "Deleted"},
        lambda c, o: c.webhooks.delete("hook_1", options=o),
    ),
    (
        "calls.reject",
        "POST",
        "/messaging/support/calls/call_1/reject",
        {"from": "15551234567@s.whatsapp.net"},
        {},
        {"success": True, "data": {"status": "REJECTED"}},
        lambda c, o: c.calls.reject(
            "support", "call_1", {"from_": "15551234567@s.whatsapp.net"}, options=o
        ),
    ),
]


@pytest.mark.parametrize("case", CASES)
async def test_full_quicklink_webhook_and_session_call_public_contract(case):
    _, method, path, body, query, data, invoke = case

    def handler(request):
        assert (
            request.method == method
            and request.url.path == path
            and dict(request.url.params) == query
        )
        assert (json.loads(request.content) if request.content else None) == body
        assert (
            "idempotency-key" not in request.headers and request.headers["x-proof"] == "contracts"
        )
        return httpx.Response(200, json=data, headers={"x-request-id": "req_contract"})

    async with AsyncMessagingClient(
        Credential("organization_api_key", "pmfa_" + "a" * 72),
        http_transport=httpx.MockTransport(handler),
    ) as client:
        result = await invoke(client, RequestOptions(headers={"x-proof": "contracts"}))
        assert result.data == data and result.metadata.request_id == "req_contract"


@pytest.mark.parametrize(
    "value",
    [
        {"success": True, "message": "Rejected"},
        {"success": True, "data": {"requestId": "req_async"}},
    ],
)
async def test_reject_session_call_documented_response_variants(value):
    async with AsyncMessagingClient(
        Credential("organization_api_key", "pmfa_" + "a" * 72),
        http_transport=httpx.MockTransport(lambda r: httpx.Response(200, json=value)),
    ) as client:
        assert (await client.calls.reject("support", "call_1", {"from_": "jid"})).data == value


async def test_quicklink_testing_configuration_shape():
    body = {
        "configuration": {
            "testing": {
                "country": "US",
                "configuration": {
                    "profile": {"name": "Ada", "status": "Available"},
                    "accountType": "business",
                    "replyBehavior": "echo",
                    "failureScenario": "none",
                    "historyFixtureId": "fixture_1",
                },
                "editable": ["profile.name", "historyFixtureId"],
            }
        }
    }

    def handler(request):
        assert json.loads(request.content) == body
        return httpx.Response(200, json={"success": True, "data": QLINK})

    async with AsyncMessagingClient(
        Credential("organization_api_key", "pmfa_" + "a" * 72),
        http_transport=httpx.MockTransport(handler),
    ) as client:
        assert (await client.quick_links.create(body)).data["data"]["id"] == "link_1"
