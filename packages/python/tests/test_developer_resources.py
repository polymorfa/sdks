import base64
import json

import httpx
import pytest

from polymorfa import AsyncClient, Credential, RequestOptions, ValidationError

IDEMPOTENCY = {
    "id": "idem_1",
    "key": "developer-key",
    "replayed": False,
    "createdAt": "2026-10-11T00:00:00Z",
    "expiresAt": "2026-10-12T00:00:00Z",
}
PAYLOAD = {
    "encoding": "base64",
    "contentType": "application/json",
    "data": base64.b64encode(
        b'{"id":"event_1","session":"support","timestamp":"2026-10-11T00:00:00Z","event":"future.event","payload":{"x":1}}'
    ).decode(),
}
EVENT = {
    "id": "event_1",
    "organizationId": "org_1",
    "projectId": None,
    "type": "future.event",
    "source": "runtime",
    "environment": "production",
    "createdAt": "2026-10-11T00:00:00Z",
    "payloadAvailability": "available",
    "payload": PAYLOAD,
    "replayableUntil": "2026-10-12T00:00:00Z",
    "metadataExpiresAt": "2026-10-13T00:00:00Z",
}
SECRET = {"version": 2, "createdAt": "2026-10-11T00:00:00Z", "previousValidUntil": None}
RETRY = {"maximumAttempts": 5, "backoff": "exponential", "initialDelaySeconds": 10}
HOOK = {
    "id": "hook_1",
    "organizationId": "org_1",
    "projectId": None,
    "owner": "organization",
    "url": "https://example.com/webhook",
    "eventTypes": ["future.event"],
    "enabled": True,
    "format": "native",
    "retryPolicy": RETRY,
    "headers": [{"name": "x-customer"}],
    "secret": SECRET,
    "createdAt": "2026-10-11T00:00:00Z",
    "updatedAt": "2026-10-11T00:00:00Z",
}
CREATE = {
    "url": "https://example.com/webhook",
    "eventTypes": ["future.event"],
    "format": "native",
    "retryPolicy": RETRY,
    "headers": [{"name": "x-customer", "value": "test"}],
}
REPLAY = {
    "eventId": "event_1",
    "deliveryId": "delivery_1",
    "operationId": "op_1",
    "idempotency": IDEMPOTENCY,
}
DELIVERY = {
    "id": "delivery_1",
    "organizationId": "org_1",
    "projectId": None,
    "eventId": "event_1",
    "webhookId": "hook_1",
    "status": "failed",
    "attemptCount": 2,
    "capabilities": {"retryable": True},
    "payloadAvailability": "expired",
    "replayableUntil": None,
    "metadataExpiresAt": "2026-10-13T00:00:00Z",
    "nextAttemptAt": None,
    "lastAttemptAt": "2026-10-11T00:00:00Z",
    "completedAt": "2026-10-11T00:00:00Z",
    "createdAt": "2026-10-11T00:00:00Z",
    "updatedAt": "2026-10-11T00:00:00Z",
    "lastOutcome": {"statusCode": 500, "errorCode": None},
}
ATTEMPT = {
    "id": "attempt_1",
    "organizationId": "org_1",
    "projectId": None,
    "deliveryId": "delivery_1",
    "number": 2,
    "status": "failed",
    "startedAt": "2026-10-11T00:00:00Z",
    "completedAt": "2026-10-11T00:00:00Z",
    "nextRetryAt": None,
    "durationMs": 10,
    "statusCode": 500,
    "errorCode": None,
    "response": {
        "contentType": "text/plain",
        "excerpt": "Redacted upstream text",
        "truncated": True,
    },
    "metadataExpiresAt": "2026-10-13T00:00:00Z",
}
OP = {
    "id": "op_1",
    "organizationId": "org_1",
    "projectId": None,
    "kind": "campaign",
    "resource": {"type": "campaign", "id": "campaign_1"},
    "status": "action_required",
    "sequence": 3,
    "capabilities": {"cancellable": True, "watchable": True},
    "progress": {"code": "paused", "current": 1, "total": None},
    "result": {"future": [True, None, 1]},
    "error": None,
    "actionRequired": {"code": "approve", "details": {"x": 1}},
    "createdAt": "2026-10-11T00:00:00Z",
    "updatedAt": "2026-10-11T00:00:00Z",
    "completedAt": None,
}
TRANSITION = {
    "operationId": "op_1",
    "sequence": 3,
    "fromStatus": "running",
    "toStatus": "action_required",
    "reasonCode": None,
    "occurredAt": "2026-10-11T00:00:00Z",
    "snapshot": {"progress": OP["progress"], "error": None, "actionRequired": OP["actionRequired"]},
}
PAGE = {"hasMore": False, "nextCursor": None}
CASES = [
    (
        "GET",
        "/events",
        None,
        {"type": "future.event", "limit": "10"},
        [EVENT],
        lambda c, o: c.events.list({"type": "future.event", "limit": 10}, options=o),
        True,
    ),
    (
        "GET",
        "/events/event_1",
        None,
        {"includePayload": "true"},
        EVENT,
        lambda c, o: c.events.retrieve("event_1", params={"includePayload": True}, options=o),
        False,
    ),
    (
        "POST",
        "/events/event_1/replays",
        {"webhookId": "hook_1"},
        {},
        REPLAY,
        lambda c, o: c.events.replay("event_1", {"webhookId": "hook_1"}, options=o),
        False,
    ),
    (
        "GET",
        "/webhooks",
        None,
        {"eventType": "future.event", "enabled": "false", "limit": "10"},
        [HOOK],
        lambda c, o: c.webhooks.list(
            {"eventType": "future.event", "enabled": False, "limit": 10}, options=o
        ),
        True,
    ),
    (
        "POST",
        "/webhooks",
        CREATE,
        {},
        {
            "webhook": HOOK,
            "operationId": None,
            "idempotency": IDEMPOTENCY,
            "secret": "fixture-signing-secret",
            "secretAvailable": True,
        },
        lambda c, o: c.webhooks.create(CREATE, options=o),
        False,
    ),
    (
        "GET",
        "/webhooks/hook_1",
        None,
        {},
        HOOK,
        lambda c, o: c.webhooks.retrieve("hook_1", options=o),
        False,
    ),
    (
        "PATCH",
        "/webhooks/hook_1",
        {"enabled": False, "eventTypes": []},
        {},
        {"webhook": HOOK, "operationId": None, "idempotency": IDEMPOTENCY},
        lambda c, o: c.webhooks.update("hook_1", {"enabled": False, "eventTypes": []}, options=o),
        False,
    ),
    (
        "DELETE",
        "/webhooks/hook_1",
        None,
        {},
        {"webhookId": "hook_1", "deleted": True, "operationId": None, "idempotency": IDEMPOTENCY},
        lambda c, o: c.webhooks.delete("hook_1", options=o),
        False,
    ),
    (
        "POST",
        "/webhooks/hook_1/tests",
        {"eventType": "future.event"},
        {},
        REPLAY,
        lambda c, o: c.webhooks.test("hook_1", {"eventType": "future.event"}, options=o),
        False,
    ),
    (
        "POST",
        "/webhooks/hook_1/secret-rotations",
        {"overlapSeconds": 300},
        {},
        {
            "webhookId": "hook_1",
            "operationId": None,
            "secret": None,
            "secretAvailable": False,
            "secretMetadata": SECRET,
            "idempotency": IDEMPOTENCY,
        },
        lambda c, o: c.webhooks.rotate_secret("hook_1", {"overlapSeconds": 300}, options=o),
        False,
    ),
    (
        "GET",
        "/webhook-deliveries",
        None,
        {"webhookId": "hook_1", "status": "failed", "limit": "10"},
        [DELIVERY],
        lambda c, o: c.webhook_deliveries.list(
            {"webhookId": "hook_1", "status": "failed", "limit": 10}, options=o
        ),
        True,
    ),
    (
        "GET",
        "/webhook-deliveries/delivery_1",
        None,
        {},
        DELIVERY,
        lambda c, o: c.webhook_deliveries.retrieve("delivery_1", options=o),
        False,
    ),
    (
        "GET",
        "/webhook-deliveries/delivery_1/attempts",
        None,
        {"limit": "10"},
        [ATTEMPT],
        lambda c, o: c.webhook_deliveries.list_attempts("delivery_1", {"limit": 10}, options=o),
        True,
    ),
    (
        "GET",
        "/webhook-deliveries/delivery_1/attempts/attempt_1",
        None,
        {},
        ATTEMPT,
        lambda c, o: c.webhook_deliveries.retrieve_attempt("delivery_1", "attempt_1", options=o),
        False,
    ),
    (
        "POST",
        "/webhook-deliveries/delivery_1/retry",
        {},
        {},
        {
            "deliveryId": "delivery_1",
            "attemptId": "attempt_1",
            "operationId": "op_1",
            "idempotency": IDEMPOTENCY,
        },
        lambda c, o: c.webhook_deliveries.retry("delivery_1", options=o),
        False,
    ),
    (
        "GET",
        "/operations",
        None,
        {"kind": "campaign", "status": "action_required", "limit": "10"},
        [OP],
        lambda c, o: c.operations.list(
            {"kind": "campaign", "status": "action_required", "limit": 10}, options=o
        ),
        True,
    ),
    (
        "GET",
        "/operations/op_1",
        None,
        {"wait": "5", "afterSequence": "2"},
        OP,
        lambda c, o: c.operations.get("op_1", wait=5, params={"afterSequence": 2}, options=o),
        False,
    ),
    (
        "GET",
        "/operations/op_1/transitions",
        None,
        {"afterSequence": "2", "limit": "10"},
        [TRANSITION],
        lambda c, o: c.operations.list_transitions(
            "op_1", {"afterSequence": 2, "limit": 10}, options=o
        ),
        True,
    ),
    (
        "POST",
        "/operations/op_1/cancel",
        None,
        {},
        {"operation": OP, "operationId": "op_1", "idempotency": IDEMPOTENCY},
        lambda c, o: c.operations.cancel("op_1", options=o),
        False,
    ),
]


def owned(value, project):
    if isinstance(value, list):
        return [owned(item, project) for item in value]
    if not isinstance(value, dict):
        return value
    return {
        key: ("project_1" if project else None)
        if key == "projectId"
        else ("project" if project else "organization")
        if key == "owner"
        else owned(item, project)
        for key, item in value.items()
    }


@pytest.mark.parametrize("project", [False, True])
@pytest.mark.parametrize("method,suffix,body,query,data,invoke,paged", CASES)
async def test_all_typed_developer_methods(
    project, method, suffix, body, query, data, invoke, paged
):
    fixture = owned(data, project)
    prefix = "/platform/projects/project_1" if project else "/platform"

    def handler(request):
        assert request.method == method and request.url.path == prefix + suffix
        assert dict(request.url.params) == query
        assert (json.loads(request.content) if request.content else None) == body
        assert request.headers["idempotency-key"] == "developer-key"
        return httpx.Response(
            200,
            json={"data": fixture} | ({"page": PAGE} if paged else {}),
            headers={"x-request-id": "req_developer"},
        )

    async with AsyncClient(
        Credential("organization_api_key", "pmfa_" + "a" * 72),
        http_transport=httpx.MockTransport(handler),
    ) as client:
        result = await invoke(
            client.project("project_1") if project else client,
            RequestOptions(idempotency_key="developer-key"),
        )
        if paged:
            assert list(result.items) == fixture and not result.has_more
            metadata = result.response.metadata
        else:
            assert result.data == fixture
            metadata = result.metadata
        assert metadata.request_id == "req_developer" and metadata.status == 200


async def test_webhook_test_owner_and_operation_wait_guards():
    async with AsyncClient(Credential("organization_api_key", "pmfa_" + "a" * 72)) as client:
        with pytest.raises(ValidationError):
            await client.webhooks.test("hook_1", {"body": PAYLOAD, "sessionId": "support"})
        for wait in [True, -1, 31, 1.5]:
            from polymorfa import ConfigurationError

            with pytest.raises(ConfigurationError):
                await client.operations.get("op_1", wait=wait)


@pytest.mark.parametrize("project", [False, True])
async def test_indexed_event_page_ingestion_offset_and_filter(project):
    requests = []

    def handler(request):
        requests.append(dict(request.url.params))
        q = dict(request.url.params)
        assert q["type"] == "future.event" and q["limit"] == "1"
        first = q["afterOffset"] == "0"
        assert first or q["afterOffset"] == "2"
        return httpx.Response(
            200,
            json={
                "data": [owned(EVENT, project)],
                "page": {
                    "hasMore": first,
                    "nextCursor": None,
                    "nextOffset": "2" if first else None,
                    "highWatermark": "3",
                },
            },
            headers={"x-request-id": "req_indexed"},
        )

    async with AsyncClient(
        Credential("organization_api_key", "pmfa_" + "a" * 72),
        http_transport=httpx.MockTransport(handler),
    ) as client:
        resource = (client.project("project_1") if project else client).events
        page = await resource.list_indexed({"afterOffset": "0", "type": "future.event", "limit": 1})
        assert page.page.high_watermark == "3" and page.next_offset == "2"
        assert page.metadata.request_id == "req_indexed"
        assert [item["id"] async for item in page] == ["event_1", "event_1"]
    assert requests == [
        {"afterOffset": "0", "type": "future.event", "limit": "1"},
        {"afterOffset": "2", "type": "future.event", "limit": "1"},
    ]


@pytest.mark.parametrize(
    "page",
    [
        {"hasMore": True, "nextOffset": "0", "highWatermark": "3"},
        {"hasMore": True, "nextOffset": "4", "highWatermark": "3"},
        {"hasMore": False, "nextOffset": "2", "highWatermark": "3"},
        {"hasMore": True, "nextOffset": None, "highWatermark": "3"},
        {"hasMore": False, "highWatermark": "03"},
    ],
)
async def test_indexed_invalid_server_metadata_retains_response_metadata(page):
    from polymorfa import ServerError

    async with AsyncClient(
        Credential("organization_api_key", "pmfa_" + "a" * 72),
        http_transport=httpx.MockTransport(
            lambda request: httpx.Response(
                200, json={"data": [], "page": page}, headers={"x-request-id": "req_invalid"}
            )
        ),
    ) as client:
        with pytest.raises(ServerError) as caught:
            await client.events.list({"afterOffset": "0"})
        assert (
            caught.value.code == "invalid_response"
            and caught.value.metadata.request_id == "req_invalid"
        )


async def test_indexed_offset_preflight_and_operation_wait_sequence():
    requests = []

    def handler(request):
        requests.append(request)
        assert request.url.params["afterSequence"] == "2"
        return httpx.Response(200, json={"data": OP})

    async with AsyncClient(
        Credential("organization_api_key", "pmfa_" + "a" * 72),
        http_transport=httpx.MockTransport(handler),
    ) as client:
        for params in [
            {"afterOffset": "00"},
            {"afterOffset": "9223372036854775808"},
            {"afterOffset": "0", "since": "2026-10-11"},
        ]:
            with pytest.raises(ValidationError):
                await client.events.list(params)
        result = await client.operations.wait("op_1", after_sequence=2)
        assert result.data["sequence"] == 3 and len(requests) == 1
