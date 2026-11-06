import json

import httpx
import pytest

from polymorfa import (
    AsyncMessagingClient,
    ConfigurationError,
    Credential,
    RequestOptions,
    ValidationError,
)
from polymorfa.onboarding import TEST_EVENT_FIXTURES

SIGNUP = {
    "quicklinkId": "link_1",
    "projectId": "project_1",
    "result": {
        "code": "test-code",
        "wabaId": "123",
        "phoneNumberId": "456",
        "coexistence": True,
        "historySync": False,
    },
}
HISTORY = {
    "messages": [
        {
            "id": "message_1",
            "senderPhone": "+15551234567",
            "text": "Fixture",
            "timestamp": 1,
            "fromMe": False,
        }
    ]
}
CASES = [
    (
        "POST",
        "/messaging/cloud-api/embedded-signup",
        SIGNUP,
        {"success": True, "data": {"stage": "connected"}},
        lambda c: c.cloud_onboarding.advance(SIGNUP),
    ),
    (
        "POST",
        "/messaging/projects/project_1/test-history-fixtures",
        HISTORY,
        {"fixtureId": "fixture_1"},
        lambda c: c.testing.create_history_fixture("project_1", HISTORY),
    ),
    (
        "POST",
        "/messaging/support/test-events",
        {
            "event": "message.received",
            "overrides": {
                "text": "Hello",
                "from": "+15551234567",
                "pushName": "Ada",
                "mediaType": "image",
                "caption": "Photo",
            },
        },
        {
            "event": "message.received",
            "session": "support",
            "delivery": "generated",
            "eventId": "event_1",
            "source": "test",
        },
        lambda c: c.testing.trigger_event(
            "support",
            {
                "event": "message.received",
                "overrides": {
                    "text": "Hello",
                    "from_": "+15551234567",
                    "pushName": "Ada",
                    "mediaType": "image",
                    "caption": "Photo",
                },
            },
        ),
    ),
    (
        "POST",
        "/messaging/support/test-events",
        {"event": "message.received", "fromNumber": "sales"},
        {
            "event": "message.received",
            "session": "support",
            "delivery": "simulated",
            "eventId": None,
            "source": "runtime",
        },
        lambda c: c.testing.trigger_event(
            "support", {"event": "message.received", "fromNumber": "sales"}
        ),
    ),
    (
        "GET",
        "/messaging/test-events/fixtures",
        None,
        {
            "fixtures": [
                {
                    "name": name,
                    "description": "Fixture " + name,
                    "overrides": ["text", "from"] if name == "message.received" else [],
                }
                for name in TEST_EVENT_FIXTURES
            ]
        },
        lambda c: c.testing.list_event_fixtures(),
    ),
    (
        "GET",
        "/messaging/support/phone",
        None,
        {
            "session": "support",
            "phone": "+15551234567",
            "online": True,
            "devices": [{"deviceId": 1}, {"deviceId": 2}],
        },
        lambda c: c.testing.get_phone("support"),
    ),
    (
        "POST",
        "/messaging/support/phone/messages",
        {"to": "+15551234568", "text": "Hello"},
        {"session": "support", "to": "+15551234568", "messageId": None},
        lambda c: c.testing.send_phone_message("support", {"to": "+15551234568", "text": "Hello"}),
    ),
    (
        "POST",
        "/messaging/support/phone/devices/2/unlink",
        None,
        {"session": "support", "deviceId": 2, "unlinked": True},
        lambda c: c.testing.unlink_phone_device("support", 2),
    ),
]


@pytest.mark.parametrize("method,path,body,fixture,invoke", CASES)
async def test_typed_onboarding_methods(method, path, body, fixture, invoke):
    def handler(request):
        assert request.method == method and request.url.path == path
        assert not request.url.query
        assert (json.loads(request.content) if request.content else None) == body
        return httpx.Response(
            202 if path.endswith("/phone/messages") else 200,
            json=fixture,
            headers={"x-request-id": "req_onboarding"},
        )

    async with AsyncMessagingClient(
        Credential(
            "project_token",
            "pmfa_pt_AAECAwQFBgcICQoLDA0ODxAREhM73f-k",
        ),
        http_transport=httpx.MockTransport(handler),
    ) as client:
        result = await invoke(client)
        assert result.data == fixture and result.metadata.request_id == "req_onboarding"
        assert result.metadata.status == (202 if path.endswith("/phone/messages") else 200)
    async with AsyncMessagingClient(Credential("client_token", "pmfa_ct_bG9jYWw")) as client:
        with pytest.raises(ConfigurationError):
            await invoke(client)


async def test_unlink_companion_bounds_and_keyed_fixture_retry():
    async with AsyncMessagingClient(
        Credential(
            "organization_api_key",
            "pmfa_AAECAwQFBgcICQoLDA0ODxAREhM73f-k",
        )
    ) as client:
        for device_id in [0, 100, True, 1.5]:
            with pytest.raises(ValidationError):
                await client.testing.unlink_phone_device("support", device_id)
    requests = []

    def handler(request):
        requests.append(request)
        assert request.headers["idempotency-key"] == "event-retry"
        if len(requests) == 1:
            return httpx.Response(
                503,
                headers={"retry-after": "0"},
                json={"error": {"code": "server_error", "message": "Unavailable"}},
            )
        return httpx.Response(
            200,
            json={
                "event": "call.missed",
                "session": "support",
                "delivery": "generated",
                "eventId": "event_2",
                "source": "test",
            },
        )

    async with AsyncMessagingClient(
        Credential(
            "organization_api_key",
            "pmfa_AAECAwQFBgcICQoLDA0ODxAREhM73f-k",
        ),
        http_transport=httpx.MockTransport(handler),
    ) as client:
        result = await client.testing.trigger_event(
            "support",
            {"event": "call.missed"},
            options=RequestOptions(idempotency_key="event-retry", max_network_retries=1),
        )
        assert result.data["eventId"] == "event_2" and result.metadata.attempts == 2
    assert len(requests) == 2
