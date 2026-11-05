import asyncio
import hashlib
import hmac
import json
from pathlib import Path

import httpx
import pytest

from polymorfa import AsyncMessagingClient, Credential, RequestOptions
from polymorfa.errors import (
    ConfigurationError,
    RateLimitError,
    ValidationError,
    WebhookSignatureError,
)
from polymorfa.webhook_batching import validate_webhook_batching
from polymorfa.webhooks import WebhookEventBatch, construct_webhook_delivery

KEY = Credential("organization_api_key", "pmfa_AAECAwQFBgcICQoLDA0ODxAREhM73f-k")
JPEG = (
    Path(__file__).resolve().parents[3] / "contracts/fixtures/official-group-picture.jpg"
).read_bytes()


@pytest.mark.asyncio
async def test_native_paths_multipart_and_pagination():
    requests = []

    def handle(request):
        requests.append(request)
        if request.method == "PUT":
            assert request.headers["content-type"].startswith("multipart/form-data; boundary=")
            assert b'name="file"' in request.content
            assert b"Content-Type: image/jpeg\r\n" in request.content
            assert JPEG in request.content
        return httpx.Response(
            200,
            json={
                "success": True,
                "data": {
                    "catalogId": "123",
                    "syncedAt": None,
                    "lastAttempt": {"finishedAt": None, "outcome": "future"},
                    "products": [{"id": "p", "price": "0.10"}],
                    "nextCursor": "next_-",
                    "accepted": True,
                },
            },
        )

    async with AsyncMessagingClient(KEY, http_transport=httpx.MockTransport(handle)) as c:
        await c.catalogs.list("n /x")
        v = await c.catalogs.retrieve("n /x", "123")
        assert v.data["data"]["syncedAt"] is None
        await c.catalogs.sync("n /x", "123")
        p = await c.catalogs.list_products("n /x", "123", limit=100, cursor="next_-")
        assert p.data["data"]["products"][0]["price"] == "0.10"
        await c.cloud_marketing.get_status("n /x")
        await c.official_groups.set_picture("n /x", "g/x", JPEG)
        assert [r.method for r in requests] == ["GET", "GET", "POST", "GET", "GET", "PUT"]
        assert requests[0].url.raw_path == b"/messaging/n%20%2Fx/catalogs"
        assert requests[-1].url.raw_path == b"/messaging/n%20%2Fx/official-groups/g%2Fx/picture"
        with pytest.raises(ValidationError):
            await c.catalogs.retrieve("n", "../")
        with pytest.raises(ValidationError):
            await c.catalogs.list_products("n", "123", limit=True)
    async with AsyncMessagingClient(
        Credential("client_token", "pmfa_ct_bG9jYWw"), http_transport=httpx.MockTransport(handle)
    ) as c:
        with pytest.raises(ConfigurationError):
            await c.catalogs.list("n")
    assert len(requests) == 6


@pytest.mark.asyncio
async def test_sync_once_and_picture_cancellation():
    count = 0

    def fail(request):
        nonlocal count
        count += 1
        return httpx.Response(
            429,
            headers={"Retry-After": "120"},
            json={"error": {"code": "catalog_sync_cooldown", "message": "Wait"}},
        )

    async with AsyncMessagingClient(KEY, http_transport=httpx.MockTransport(fail)) as c:
        with pytest.raises(RateLimitError) as e:
            await c.catalogs.sync(
                "n", "123", options=RequestOptions(idempotency_key="key", max_network_retries=3)
            )
        assert e.value.code == "catalog_sync_cooldown"
    assert count == 1
    started = asyncio.Event()

    async def block(request):
        started.set()
        await asyncio.Future()

    async with AsyncMessagingClient(KEY, http_transport=httpx.MockTransport(block)) as c:
        task = asyncio.create_task(c.official_groups.set_picture("n", "g", JPEG))
        await started.wait()
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task


def signed(value):
    raw = json.dumps(value).encode()
    return construct_webhook_delivery(raw, hmac.new(b"s", raw, hashlib.sha256).hexdigest(), "s")


def test_whole_body_batch_and_identity():
    e = {
        "id": "e",
        "session": "",
        "timestamp": "now",
        "event": "contact.update",
        "payload": {
            "id": "new",
            "parentBsuid": "new-p",
            "identityChange": {
                "reason": "user_id_changed",
                "messageId": "m",
                "previous": {"id": "old", "parentBsuid": "old-p"},
            },
        },
    }
    batch = {
        "object": "event_batch",
        "version": 1,
        "id": "00000000-0000-4000-8000-000000000001",
        "events": [e, {**e, "id": "future", "event": "future.event"}],
    }
    value = signed(batch)
    assert isinstance(value, WebhookEventBatch)
    assert [x.id for x in value.events] == ["e", "future"]
    assert value.events[0].payload == e["payload"]
    one = signed({**batch, "events": [e]})
    assert isinstance(one, WebhookEventBatch) and len(one.events) == 1
    assert signed(e).id == "e"
    raw = json.dumps(batch).encode()
    with pytest.raises(WebhookSignatureError):
        construct_webhook_delivery(raw + b" ", hmac.new(b"s", raw, hashlib.sha256).hexdigest(), "s")
    for bad in [
        {**batch, "version": 2},
        {**batch, "events": []},
        {**batch, "events": [batch]},
        {**batch, "events": [e] * 101},
        {**batch, "events": [{"id": "x"}]},
    ]:
        with pytest.raises(ValidationError):
            signed(bad)
    for bad in [
        {"batching": {"enabled": True, "maxEvents": 1}},
        {"format": "meta", "batching": {"enabled": True}},
    ]:
        with pytest.raises(ValidationError):
            validate_webhook_batching(bad)
    validate_webhook_batching({"format": "meta", "batching": {"enabled": False}})


@pytest.mark.asyncio
async def test_platform_batching_wire_and_feature_error():
    from polymorfa import AsyncClient
    from polymorfa.errors import AuthorizationError

    requests = []

    def handle(request):
        requests.append(request)
        hook = {"id": "w", "batching": {"enabled": False, "maxEvents": 100, "windowMs": 1000}}
        if request.method == "GET":
            return httpx.Response(200, json={"data": hook})
        assert json.loads(request.content)["batching"] == {"enabled": False}
        return httpx.Response(200, json={"data": {"webhook": hook}})

    async with AsyncClient(KEY, http_transport=httpx.MockTransport(handle)) as c:
        for resource in [c.webhooks, c.project("p/x").webhooks]:
            await resource.create(
                {"url": "https://example.test", "eventTypes": [], "batching": {"enabled": False}}
            )
            await resource.update("w", {"batching": {"enabled": False}})
            assert (await resource.retrieve("w")).data["batching"]["maxEvents"] == 100
    assert [r.url.raw_path for r in requests] == [
        b"/platform/webhooks",
        b"/platform/webhooks/w",
        b"/platform/webhooks/w",
        b"/platform/projects/p%2Fx/webhooks",
        b"/platform/projects/p%2Fx/webhooks/w",
        b"/platform/projects/p%2Fx/webhooks/w",
    ]

    def denied(request):
        return httpx.Response(
            403, json={"error": {"code": "feature_unavailable", "message": "Beta unavailable"}}
        )

    async with AsyncMessagingClient(KEY, http_transport=httpx.MockTransport(denied)) as c:
        for call in [
            c.catalogs.list("n"),
            c.cloud_marketing.get_status("n"),
            c.official_groups.set_picture("n", "g", JPEG),
        ]:
            with pytest.raises(AuthorizationError) as e:
                await call
            assert e.value.code == "feature_unavailable"


@pytest.mark.asyncio
async def test_readiness_codes_remain_open_values():
    from polymorfa import CLOUD_READINESS_FAILURE_CODES
    from polymorfa.error_codes import is_known_error_code

    for code in [*CLOUD_READINESS_FAILURE_CODES, "future_readiness", None]:

        def handle(request, code=code):
            return httpx.Response(
                200,
                json={
                    "success": True,
                    "data": {"errorCode": code, "onboarding": {"errorCode": code}},
                },
            )

        async with AsyncMessagingClient(KEY, http_transport=httpx.MockTransport(handle)) as c:
            v = await c.quick_links.retrieve("q")
            assert v.data["data"]["errorCode"] == code
            assert v.data["data"]["onboarding"]["errorCode"] == code
        assert not is_known_error_code(code)


@pytest.mark.asyncio
async def test_raw_graph_terms_and_disabled_stay_raw():
    status = {
        "id": "w",
        "marketing_messages_onboarding_status": "future",
        "owner_business_info": {
            "marketing_messages_onboarding_status": {"status": "future_terms", "time": "now"}
        },
        "disable_marketing_messages_on_cloud_api": False,
    }

    def handle(request):
        assert request.url.path == "/graph/whatsapp/v26.0/w/marketing_messages/status"
        return httpx.Response(200, json=status)

    async with AsyncMessagingClient(KEY, http_transport=httpx.MockTransport(handle)) as c:
        assert (await c.cloud_marketing.status("w", version="v26.0")).data == status
