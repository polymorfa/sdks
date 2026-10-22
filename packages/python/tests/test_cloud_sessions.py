import httpx
import pytest

from polymorfa import (
    AsyncMessagingClient,
    ConfigurationError,
    Credential,
    RequestOptions,
    ServerError,
)

HEALTH = {
    "status": "action_required",
    "checkedAt": "2026-10-11T00:00:00Z",
    "nextCheckAt": None,
    "token": {"status": "expired", "expiresAt": "2026-10-10T00:00:00Z"},
    "missingPermissions": ["whatsapp_business_management"],
    "phoneRegistration": "unknown",
    "webhookSubscription": "subscribed",
    "failureCode": "token_expired",
}
PRICING = {
    "source": "meta",
    "since": "2026-10-01T00:00:00Z",
    "until": "2026-10-11T00:00:00Z",
    "messages": 2,
    "groups": [
        {
            "category": "service",
            "pricingModel": "CBP",
            "pricingType": None,
            "billable": None,
            "messages": 2,
        }
    ],
}
REAUTH = {
    "quicklinkId": "link_1",
    "url": "https://link.polymorfa.com/fixture",
    "session": "support",
}
CASES = [
    (
        "GET",
        "/meta-pricing",
        {"since": PRICING["since"], "until": PRICING["until"]},
        PRICING,
        lambda r: r.get_meta_pricing(
            "support", query={"since": PRICING["since"], "until": PRICING["until"]}
        ),
    ),
    ("GET", "/cloud-credentials", {}, HEALTH, lambda r: r.get_cloud_credential_health("support")),
    (
        "POST",
        "/cloud-credentials/reauthorize",
        {},
        REAUTH,
        lambda r: r.reauthorize_cloud_credentials("support"),
    ),
]


@pytest.mark.parametrize("method,suffix,query,data,invoke", CASES)
async def test_typed_cloud_session_observations(method, suffix, query, data, invoke):
    fixture = {"success": True, "data": data}

    def handler(request):
        assert request.method == method and request.url.path == "/messaging/support" + suffix
        assert dict(request.url.params) == query and not request.content
        return httpx.Response(200, json=fixture, headers={"x-request-id": "req_cloud"})

    async with AsyncMessagingClient(
        Credential("organization_api_key", "pmfa_" + "a" * 72),
        http_transport=httpx.MockTransport(handler),
    ) as client:
        response = await invoke(client.sessions)
        assert response.data == fixture and response.metadata.request_id == "req_cloud"
    async with AsyncMessagingClient(Credential("client_token", "pmfa_ct_fixture")) as browser:
        with pytest.raises(ConfigurationError):
            await invoke(browser.sessions)


async def test_reauthorization_never_retries_even_with_idempotency_key():
    attempts = []

    def handler(request):
        attempts.append(request)
        return httpx.Response(503, json={"error": {"code": "service_unavailable"}})

    async with AsyncMessagingClient(
        Credential("organization_api_key", "pmfa_" + "a" * 72),
        http_transport=httpx.MockTransport(handler),
    ) as client:
        with pytest.raises(ServerError):
            await client.sessions.reauthorize_cloud_credentials(
                "support", options=RequestOptions(idempotency_key="reauth_1", max_network_retries=3)
            )
    assert len(attempts) == 1
