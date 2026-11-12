import json

import httpx
import pytest

from polymorfa import (
    AsyncMessagingClient,
    ConfigurationError,
    ConflictError,
    Credential,
    ServerError,
    ValidationError,
)

KEY = Credential("team_api_key", "pmfa_AAECAwQFBgcICQoLDA0ODxAREhM73f-k")


@pytest.mark.parametrize(
    "account", ["whatsapp_app", "business_app", "meta_cloud", "meta_coexistence"]
)
async def test_business_account_modes_wire(account):
    reply = {
        "session": "demo /a",
        "accountType": account,
        "primaryPlatform": None if account == "meta_cloud" else "android",
        "changed": True,
        "unlinkedDevices": [3, 7],
    }

    def handler(request):
        assert request.method == "PUT"
        assert request.url.raw_path == b"/messaging/demo%20%2Fa/phone/account-mode"
        assert json.loads(request.content) == {"accountType": account}
        return httpx.Response(200, json=reply, headers={"x-request-id": "mode-request"})

    async with AsyncMessagingClient(KEY, http_transport=httpx.MockTransport(handler)) as client:
        result = await client.testing.set_account_mode("demo /a", {"accountType": account})
        assert result.data == reply
        assert result.metadata.request_id == "mode-request"


@pytest.mark.parametrize(
    "body",
    [
        {},
        {"accountType": "personal"},
        {"accountType": "business"},
        {"accountType": "meta_cloud", "primaryPlatform": "android"},
        {"accountType": "business_app", "primaryPlatform": None},
        {"accountType": "business_app", "unknown": True},
    ],
)
async def test_business_account_modes_reject_before_io(body):
    calls = []

    def handler(request):
        calls.append(request)
        return httpx.Response(500)

    async with AsyncMessagingClient(KEY, http_transport=httpx.MockTransport(handler)) as client:
        with pytest.raises(ValidationError):
            await client.testing.set_account_mode("demo", body)
    assert not calls


async def test_business_account_mode_rejects_client_tokens():
    async with AsyncMessagingClient(Credential("client_token", "pmfa_ct_bG9jYWw")) as client:
        with pytest.raises(ConfigurationError):
            await client.testing.set_account_mode("demo", {"accountType": "business_app"})


async def test_business_account_mode_checks_required_response_shape():
    reply = {
        "session": "demo",
        "accountType": "business_app",
        "primaryPlatform": "ios",
        "changed": "false",
        "unlinkedDevices": [],
    }
    async with AsyncMessagingClient(
        KEY, http_transport=httpx.MockTransport(lambda _: httpx.Response(200, json=reply))
    ) as client:
        with pytest.raises(ServerError):
            await client.testing.set_account_mode(
                "demo", {"accountType": "business_app", "primaryPlatform": "ios"}
            )


@pytest.mark.parametrize("encryption", [None, "end_to_end", "hybrid", "not_end_to_end"])
async def test_business_profile_preserves_encryption_and_omission(encryption):
    profile = {"id": "contact"}
    if encryption is not None:
        profile["encryption"] = encryption
    async with AsyncMessagingClient(
        KEY,
        http_transport=httpx.MockTransport(
            lambda _: httpx.Response(200, json={"success": True, "data": profile})
        ),
    ) as client:
        result = await client.contacts.business_profile("demo", "contact")
        assert result.data["data"] == profile
        if encryption is None:
            assert "encryption" not in result.data["data"]


async def test_business_quicklink_keeps_mode_and_platform_with_simulation_fields():
    configuration = {
        "testing": {
            "configuration": {
                "accountType": "business_app",
                "primaryPlatform": "ios",
                "replyBehavior": "echo",
            }
        }
    }

    def handler(request):
        assert request.method == "POST"
        assert request.url.path == "/messaging/quicklinks"
        assert json.loads(request.content) == {"configuration": configuration}
        return httpx.Response(
            200,
            json={
                "success": True,
                "data": {
                    "id": "ql",
                    "url": "https://example.test/ql",
                    "session": "demo",
                    "expiresAt": None,
                },
            },
        )

    async with AsyncMessagingClient(KEY, http_transport=httpx.MockTransport(handler)) as client:
        await client.quick_links.create({"configuration": configuration})


@pytest.mark.parametrize(
    "mode", [{"accountType": "business"}, {"accountType": "meta_cloud", "primaryPlatform": "ios"}]
)
async def test_business_quicklink_rejects_invalid_modes_before_io(mode):
    calls = []

    def handler(request):
        calls.append(request)
        return httpx.Response(500)

    async with AsyncMessagingClient(KEY, http_transport=httpx.MockTransport(handler)) as client:
        with pytest.raises(ValidationError):
            await client.quick_links.create({"configuration": {"testing": {"configuration": mode}}})
    assert not calls


async def test_business_account_modes_surface_conflict():
    def handler(request):
        return httpx.Response(
            409,
            json={
                "error": {
                    "type": "conflict_error",
                    "code": "state_conflict",
                    "message": "The request conflicts with the resource state.",
                    "param": None,
                    "request_id": "5f0c2a8e-3b1d-4c6f-9e2a-7d4b1c8f6a30",
                },
                "data": None,
            },
        )

    async with AsyncMessagingClient(KEY, http_transport=httpx.MockTransport(handler)) as client:
        with pytest.raises(ConflictError):
            await client.testing.set_account_mode("demo", {"accountType": "business_app"})
