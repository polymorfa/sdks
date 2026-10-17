import json

import httpx
import pytest

from polymorfa import AsyncMessagingClient, ConfigurationError, Credential

RULES = {
    "recipientMode": "conversation",
    "allowedActions": "send_message,read_presence",
    "rateLimit": 60,
    "maxDaily": 0,
    "allowedOrigins": "https://example.com",
    "conversationTtlSeconds": 86400,
    "maxConcurrency": 2,
    "maxSetupsPerMinute": 10,
    "allowedNumber": "",
    "enabled": True,
}
TOKEN = {"success": True, "data": {"token": "pmfa_ct_fixture", "expiresAt": "2026-10-11T12:00:00Z"}}
CASES = [
    (
        "POST",
        "/platform/client-tokens",
        {"ephemeralId": "browser_1", "session": "support", "ttlSeconds": 600},
        TOKEN,
        lambda r: r.mint({"ephemeralId": "browser_1", "session": "support", "ttlSeconds": 600}),
    ),
    (
        "POST",
        "/platform/client-tokens",
        {"ephemeralId": "browser_1", "customer": "cust_1", "allow": ["send_message"]},
        TOKEN,
        lambda r: r.mint(
            {"ephemeralId": "browser_1", "customer": "cust_1", "allow": ["send_message"]}
        ),
    ),
    (
        "GET",
        "/platform/sessions/support/client-rules",
        None,
        {"success": True, "data": RULES},
        lambda r: r.retrieve_rules("support"),
    ),
    (
        "PUT",
        "/platform/sessions/support/client-rules",
        {"recipientMode": "none", "enabled": False},
        {"success": True},
        lambda r: r.update_rules("support", {"recipientMode": "none", "enabled": False}),
    ),
    (
        "DELETE",
        "/platform/sessions/support/client-rules",
        None,
        {"success": True},
        lambda r: r.delete_rules("support"),
    ),
]


@pytest.mark.parametrize("method,path,body,fixture,invoke", CASES)
async def test_typed_client_token_methods(method, path, body, fixture, invoke):
    def handler(request):
        assert request.method == method and request.url.path == path
        assert (json.loads(request.content) if request.content else None) == body
        return httpx.Response(200, json=fixture, headers={"x-request-id": "req_tokens"})

    async with AsyncMessagingClient(
        Credential("project_token", "pmfa_pt_" + "a" * 93 + "A"),
        http_transport=httpx.MockTransport(handler),
    ) as client:
        response = await invoke(client.client_tokens)
        assert response.data == fixture and response.metadata.request_id == "req_tokens"
    async with AsyncMessagingClient(Credential("client_token", "pmfa_ct_fixture")) as client:
        with pytest.raises(ConfigurationError):
            await invoke(client.client_tokens)


async def test_mint_target_guards_before_network():
    async with AsyncMessagingClient(
        Credential("organization_api_key", "pmfa_" + "a" * 72)
    ) as client:
        for body in (
            {"ephemeralId": "browser_1"},
            {"ephemeralId": "browser_1", "session": "support", "customer": "cust_1"},
            {"ephemeralId": "browser_1", "session": "support", "allow": []},
        ):
            with pytest.raises(ConfigurationError):
                await client.client_tokens.mint(body)
