from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
from collections.abc import Callable
from dataclasses import FrozenInstanceError

import httpx
import pytest

from polymorfa import (
    AsyncClient,
    AsyncMessagingClient,
    AsyncProjectClient,
    AuthenticationError,
    ConfigurationError,
    Credential,
    RequestOptions,
    ServerError,
    WebhookSignatureError,
    construct_webhook_event,
    verify_webhook_signature,
)

KEY = Credential("organization_api_key", "pmfa_" + "a" * 72)
RECEIPT = {
    "success": True,
    "data": {
        "id": "msg_1",
        "whatsapp_ids": {"linked_devices": "provider_1"},
        "conversation": {"id": "user_1"},
        "timestamp": "2026-09-22T00:00:00Z",
        "status": "sent",
        "type": "text",
    },
}
SESSION = {
    "success": True,
    "data": {
        "sessionId": "support",
        "name": "support",
        "tenantId": "org_1",
        "type": "linked_device",
        "testMode": True,
        "status": "CONNECTED",
        "createdAt": "2026-09-22T00:00:00Z",
        "updatedAt": "2026-09-22T00:00:00Z",
    },
}
LINK = {
    "success": True,
    "data": {
        "id": "link_1",
        "url": "https://link.polymorfa.com/link_1",
        "session": "support",
        "purpose": "initial",
        "connectionGoal": "single",
        "expiresAt": None,
    },
}
LINK_STATUS = {
    "success": True,
    "data": {
        "id": "link_1",
        "status": "pending",
        "session": "support",
        "purpose": "initial",
        "connectionGoal": "single",
        "hybridPhase": None,
        "expiresAt": None,
        "openedAt": None,
        "connectedAt": None,
        "phone": None,
        "errorCode": None,
    },
}
WEBHOOK = {
    "success": True,
    "data": {
        "id": "hook_1",
        "tenantId": "org_1",
        "url": "https://example.com/webhook",
        "events": ["message.received"],
        "retries": {"attempts": 1, "delaySeconds": 1, "policy": "constant"},
        "headers": [],
        "enabled": True,
        "createdAt": "2026-09-22T00:00:00Z",
    },
}


def transport(handler: Callable[[httpx.Request], httpx.Response]) -> httpx.MockTransport:
    return httpx.MockTransport(handler)


async def test_typed_message_send_request_response() -> None:
    requests = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        assert request.method == "POST"
        assert request.url.path == "/messaging/support/messages/send"
        assert json.loads(request.content) == {
            "conversation": {"phoneNumber": "+15551234567"},
            "content": {"text": "Hello"},
        }
        assert request.headers["idempotency-key"] == "send-1"
        return httpx.Response(
            200, json=RECEIPT, headers={"x-request-id": "req_1", "polymorfa-version": "2026-09-22"}
        )

    async with AsyncMessagingClient(KEY, http_transport=transport(handler)) as client:
        result = await client.messages.send(
            "support",
            {"conversation": {"phoneNumber": "+15551234567"}, "content": {"text": "Hello"}},
            options=RequestOptions(idempotency_key="send-1"),
        )
        assert result.data["data"]["whatsapp_ids"]["linked_devices"] == "provider_1"
        assert result.metadata.request_id == "req_1"
        assert result.metadata.attempts == 1
        assert result.metadata.status == 200
    assert len(requests) == 1


async def test_typed_resource_routes() -> None:
    cases = [
        (
            "GET",
            "/platform/sessions/support",
            None,
            SESSION,
            lambda c: c.sessions.retrieve("support"),
        ),
        (
            "GET",
            "/messaging/support/pair/qr?format=json",
            None,
            {"success": True, "data": {"qr": "qr_1"}},
            lambda c: c.sessions.qr("support"),
        ),
        (
            "POST",
            "/messaging/support/pair/code",
            {"phone": "+15551234567"},
            {"success": True, "data": {"code": "123"}},
            lambda c: c.sessions.request_pairing_code("support", {"phone": "+15551234567"}),
        ),
        (
            "POST",
            "/messaging/quicklinks",
            {"projectId": "project_1"},
            LINK,
            lambda c: c.quick_links.create({"projectId": "project_1"}),
        ),
        (
            "GET",
            "/messaging/quicklinks/link_1",
            None,
            LINK_STATUS,
            lambda c: c.quick_links.retrieve("link_1"),
        ),
        (
            "DELETE",
            "/messaging/quicklinks/link_1",
            None,
            {"success": True, "message": "Cancelled"},
            lambda c: c.quick_links.cancel("link_1"),
        ),
        (
            "POST",
            "/messaging/webhooks",
            {"url": "https://example.com/webhook"},
            WEBHOOK,
            lambda c: c.webhooks.create({"url": "https://example.com/webhook"}),
        ),
        (
            "GET",
            "/messaging/webhooks/hook_1",
            None,
            WEBHOOK,
            lambda c: c.webhooks.retrieve("hook_1"),
        ),
        (
            "PUT",
            "/messaging/webhooks/hook_1",
            {"enabled": False},
            WEBHOOK,
            lambda c: c.webhooks.update("hook_1", {"enabled": False}),
        ),
        (
            "DELETE",
            "/messaging/webhooks/hook_1",
            None,
            {"success": True},
            lambda c: c.webhooks.delete("hook_1"),
        ),
        (
            "POST",
            "/messaging/support/messages/react",
            {"conversation": {"id": "user_1"}, "id": "msg_1", "reaction": "👍"},
            RECEIPT,
            lambda c: c.messages.react(
                "support", {"conversation": {"id": "user_1"}, "id": "msg_1", "reaction": "👍"}
            ),
        ),
        (
            "POST",
            "/messaging/support/messages/seen",
            {"conversation": {"id": "user_1"}, "id": "msg_1"},
            {"success": True, "data": {"status": "OK"}},
            lambda c: c.messages.mark_seen(
                "support", {"conversation": {"id": "user_1"}, "id": "msg_1"}
            ),
        ),
        (
            "POST",
            "/messaging/support/messages/typing",
            {"conversation": {"id": "user_1"}, "state": "typing"},
            {"success": True, "data": {"status": "OK"}},
            lambda c: c.messages.set_typing(
                "support", {"conversation": {"id": "user_1"}, "state": "typing"}
            ),
        ),
        (
            "POST",
            "/messaging/support/messages/star",
            {"conversation": {"id": "user_1"}, "id": "msg_1", "star": True},
            {"success": True, "data": {"status": "OK"}},
            lambda c: c.messages.star(
                "support", {"conversation": {"id": "user_1"}, "id": "msg_1", "star": True}
            ),
        ),
        (
            "GET",
            "/messaging/support/operations/op_1",
            None,
            {"success": True, "data": {"operationId": "op_1", "status": "pending"}},
            lambda c: c.messages.operation_status("support", "op_1"),
        ),
    ]
    for method, path, body, fixture, invoke in cases:

        def handler(
            request: httpx.Request, method=method, path=path, body=body, fixture=fixture
        ) -> httpx.Response:
            assert request.method == method
            assert request.url.raw_path.decode() == path
            assert (json.loads(request.content) if request.content else None) == body
            assert request.headers["authorization"] == "Bearer " + KEY.value
            assert request.headers["polymorfa-version"] == "2026-09-22"
            return httpx.Response(200, json=fixture, headers={"x-request-id": "req_resource"})

        async with AsyncMessagingClient(KEY, http_transport=transport(handler)) as client:
            response = await invoke(client)
            assert response.data == fixture
            assert response.metadata.request_id == "req_resource"
            assert response.metadata.status == 200


async def test_retry_safety_replay_and_immutable_overrides() -> None:
    seen = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        if len(seen) == 1:
            return httpx.Response(
                503, json={"error": {"code": "service_unavailable"}}, headers={"retry-after": "0"}
            )
        return httpx.Response(200, json={"data": []})

    async with AsyncMessagingClient(KEY, http_transport=transport(handler)) as client:
        result = await client.sessions.list(options=RequestOptions(api_version="2026-10-01"))
        assert result.metadata.attempts == 2
        await client.sessions.list()
        assert seen[-1].headers["polymorfa-version"] == "2026-09-22"
    seen.clear()

    def unsafe(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(
            503, json={"error": {"code": "service_unavailable"}}, headers={"retry-after": "0"}
        )

    async with AsyncMessagingClient(KEY, http_transport=transport(unsafe)) as client:
        with pytest.raises(ServerError):
            await client.quick_links.create()
    assert len(seen) == 1
    seen.clear()

    def replay(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(
            503,
            json={"error": {"code": "service_unavailable"}},
            headers={"idempotent-replayed": "true"},
        )

    async with AsyncMessagingClient(KEY, http_transport=transport(replay)) as client:
        with pytest.raises(ServerError):
            await client.messages.send(
                "support", {"conversation": {"id": "u"}, "content": {"text": "Hi"}}
            )
    assert len(seen) == 1


async def test_error_metadata_and_html() -> None:
    async with AsyncMessagingClient(
        KEY,
        max_network_retries=0,
        http_transport=transport(
            lambda r: httpx.Response(
                401,
                json={
                    "error": {
                        "code": "invalid_credential",
                        "message": "Expired",
                        "request_id": "body_req",
                        "docs": "https://docs.polymorfa.com/api/errors",
                    }
                },
                headers={"x-request-id": "header_req"},
            )
        ),
    ) as client:
        with pytest.raises(AuthenticationError) as caught:
            await client.sessions.list()
        assert caught.value.request_id == "body_req"
        assert caught.value.doc_url == "https://docs.polymorfa.com/api/errors"
    async with AsyncMessagingClient(
        KEY,
        max_network_retries=0,
        http_transport=transport(
            lambda r: httpx.Response(502, text="<html>private proxy details</html>")
        ),
    ) as client:
        with pytest.raises(ServerError) as html:
            await client.sessions.list()
        assert "private" not in str(html.value)


async def test_project_binding_and_raw_confinement() -> None:
    async with AsyncClient(
        KEY,
        http_transport=transport(lambda r: httpx.Response(200, json={"data": {"id": "event_1"}})),
    ) as client:
        project = client.project("project_1")
        with pytest.raises(FrozenInstanceError):
            project.project_id = "project_2"
        with pytest.raises(ConfigurationError):
            project.project("project_2")
        for path in (
            "/../events",
            "/%2e%2e/events",
            "/platform/projects/project_2/events",
            "//other-host",
        ):
            from polymorfa import ValidationError

            with pytest.raises(ValidationError):
                await project.raw.request("GET", path)
        result = await project.events.retrieve("event_1")
        assert result.data["id"] == "event_1"
    with pytest.raises(ConfigurationError):
        AsyncClient(Credential("project_token", "pmfa_pt_" + "a" * 93 + "A"))
    AsyncProjectClient(Credential("project_token", "pmfa_pt_" + "a" * 93 + "A"), "project_1")


async def test_cancellation_and_pagination() -> None:
    started = asyncio.Event()
    cancelled = asyncio.Event()

    async def blocking(request: httpx.Request) -> httpx.Response:
        started.set()
        try:
            await asyncio.sleep(3600)
        finally:
            cancelled.set()
        return httpx.Response(200, json={"data": []})

    async with AsyncClient(KEY, http_transport=httpx.MockTransport(blocking)) as client:
        task = asyncio.create_task(client.sessions.list())
        await started.wait()
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task
        assert cancelled.is_set()

    def paging(request: httpx.Request) -> httpx.Response:
        cursor = request.url.params.get("cursor")
        return httpx.Response(
            200,
            json={
                "data": [{"id": "event_2" if cursor else "event_1"}],
                "page": {"nextCursor": None if cursor else "next"},
            },
        )

    async with AsyncClient(KEY, http_transport=transport(paging)) as client:
        page = await client.events.list()
        assert [item["id"] async for item in page] == ["event_1", "event_2"]


async def test_media_redirect_credential_isolation() -> None:
    seen = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        if request.url.host == "api.polymorfa.com":
            return httpx.Response(
                302,
                headers={
                    "location": "https://storage.example.com/capability",
                    "x-request-id": "media_req",
                },
            )
        assert "authorization" not in request.headers
        assert "polymorfa-version" not in request.headers
        return httpx.Response(200, content=b"image")

    async with AsyncMessagingClient(KEY, http_transport=transport(handler)) as client:
        result = await client.media.download("media_1")
        assert result.data == b"image"
        assert result.metadata.request_id == "media_req"
    assert len(seen) == 2


def test_webhooks_exact_bytes_and_unknown_events() -> None:
    raw = b'{"id":"evt_1","session":"","timestamp":"2026-10-11T00:00:00Z","event":"future.event","payload":{"x":1}}'
    signature = hmac.new(b"secret", raw, hashlib.sha256).hexdigest()
    event = construct_webhook_event(raw, "sha256=" + signature, "secret")
    assert not event.known
    assert event.payload == {"x": 1}
    assert not verify_webhook_signature(raw + b" ", signature, "secret")
    assert not verify_webhook_signature(raw, "bad", "secret")
    with pytest.raises(WebhookSignatureError):
        construct_webhook_event(b"invalid json", signature, "secret")


async def test_stream_checkpoint_resume() -> None:
    requests = []
    first = b'data: {"type":"checkpoint","cursor":"checkpoint_1"}\n\n'
    second = b'data: {"type":"event","cursor":"event_1","streamId":"stream_1","sequence":1,"event":{"id":"evt_1","type":"message.received","payload":null}}\n\n'

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        if len(requests) == 2:
            assert request.headers["last-event-id"] == "checkpoint_1"
        return httpx.Response(
            200,
            headers={"content-type": "text/event-stream"},
            content=first if len(requests) == 1 else second,
        )

    async with AsyncClient(KEY, http_transport=transport(handler)) as client:
        stream = client.project("project_1").events.stream()
        async for item in stream:
            assert item.cursor == "event_1"
            assert item.webhook is None
            stream.close()
    assert len(requests) == 2
