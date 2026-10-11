import json

import httpx
import pytest

from polymorfa import AsyncClient, Credential, ValidationError

PROJECT = {
    "id": "project_1",
    "orgId": "org_1",
    "name": "Support",
    "slug": "support",
    "icon": {"type": "emoji", "value": "🐈"},
    "defaultTier": "free",
    "isActive": True,
    "stage": "development",
}
STATS = {k: v for k, v in PROJECT.items() if k != "id"} | {
    "_id": "project_1",
    "_creationTime": 1,
    "activeSessions": 1,
    "totalSessions": 2,
    "totalMessages": 3,
    "lastActivity": None,
    "iconUrl": None,
}
ENROLLMENT = {
    "business": {
        "name": "Example",
        "website": "https://example.com",
        "supportEmail": "support@example.com",
    }
}
ENROLLED = {k: PROJECT[k] for k in ["id", "orgId", "name", "slug", "stage"]} | {
    "operationId": "op_1",
    "enrollmentStatus": "approval_required",
    "billingMode": "payg",
}
CANDIDATES = [
    {
        "numbers": [
            {
                "id": "number_1",
                "name": "support",
                "transport": "linked_devices",
                "status": "CONNECTED",
                "canBeAbsorbed": False,
            },
            {
                "id": "number_2",
                "name": "official",
                "transport": "official_api",
                "status": "CONNECTED",
                "canBeAbsorbed": True,
            },
        ],
        "eligible": True,
    }
]
TIER = {
    "id": "quote_1",
    "status": "queued",
    "failureReason": None,
    "expiresAtMs": 2000,
    "quote": {
        "tier": "pro",
        "tierOverride": "pro",
        "amountCents": 1.125,
        "priceVersion": "1",
        "action": "upgrade",
        "effectiveAtMs": 1000,
        "replacesWindowId": None,
        "hybridTransition": {
            "action": "merge",
            "absorbNumberId": "number_2",
            "survivingNumberId": "number_1",
            "status": "running",
            "failureReason": None,
            "metaDisconnectRequired": False,
            "effectiveAtMs": 1000,
        },
    },
}
CAPABILITIES = {
    "session": "support",
    "projectId": "project_1",
    "status": "synced",
    "syncedAt": "2026-10-11T00:00:00Z",
    "checkedAt": None,
    "accountType": "business",
    "capabilities": [
        {"key": "channels", "source": "server", "kind": "feature", "unit": None, "value": True},
        {
            "key": "group.members",
            "source": "client_default",
            "kind": "limit",
            "unit": "members",
            "value": 1024,
        },
        {"key": "future.unknown", "source": None, "kind": "feature", "unit": None, "value": None},
    ],
}
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
PLATFORM_SESSION = {
    "_id": "number_1",
    "_creationTime": 1,
    "projectId": "project_1",
    "sessionId": "support",
    "name": "support",
    "phone": None,
    "platform": None,
    "isBusiness": True,
    "testMode": True,
    "tierOverride": None,
    "status": "CONNECTED",
    "messageCount": 1,
    "lastActiveAt": None,
    "paidUntil": None,
}
UPDATE = {"configuration": {"reset": ["historySync.mode"]}, "revision": 1}
BATCH = {"projectId": "project_1", "sessionIds": ["support", "sales"]}
QUOTE = {"tierOverride": "pro", "hybridMerge": {"absorbNumberId": "number_2"}}
CASES = [
    ("GET", "/platform/projects", None, {}, {"data": [STATS]}, lambda c: c.projects.list()),
    (
        "POST",
        "/platform/projects",
        {"name": "Support", "icon": {"type": "emoji", "value": "🐈"}, "defaultTier": "free"},
        {},
        {"data": PROJECT},
        lambda c: c.projects.create(
            {"name": "Support", "icon": {"type": "emoji", "value": "🐈"}, "defaultTier": "free"}
        ),
    ),
    (
        "GET",
        "/platform/projects/project_1/hybrid-merge-candidates",
        None,
        {},
        {"data": CANDIDATES},
        lambda c: c.projects.list_hybrid_merge_candidates("project_1"),
    ),
    (
        "POST",
        "/platform/projects/project_1/promote",
        ENROLLMENT,
        {},
        {"data": ENROLLED},
        lambda c: c.projects.request_production_enrollment("project_1", ENROLLMENT),
    ),
    (
        "POST",
        "/platform/projects/project_1/production-enrollments/op_1/approve",
        None,
        {},
        {"data": {"operationId": "op_1", "action": "approve", "accepted": True}},
        lambda c: c.projects.approve_production_enrollment("project_1", "op_1"),
    ),
    (
        "POST",
        "/platform/projects/project_1/production-enrollments/op_1/cancel",
        None,
        {},
        {"data": {"operationId": "op_1", "action": "cancel", "accepted": True}},
        lambda c: c.projects.cancel_production_enrollment("project_1", "op_1"),
    ),
    (
        "GET",
        "/platform/sessions",
        None,
        {"projectId": "project_1"},
        {"data": [PLATFORM_SESSION]},
        lambda c: c.sessions.list(project_id="project_1"),
    ),
    (
        "GET",
        "/platform/sessions/support",
        None,
        {},
        {"success": True, "data": SESSION},
        lambda c: c.sessions.retrieve("support"),
    ),
    (
        "PUT",
        "/platform/sessions/support",
        UPDATE,
        {},
        {"success": True, "data": SESSION},
        lambda c: c.sessions.update("support", UPDATE),
    ),
    (
        "POST",
        "/platform/sessions/support/start",
        {"projectId": "project_1"},
        {},
        {"data": {"starting": True, "sessionId": "support"}},
        lambda c: c.sessions.start("support", project_id="project_1"),
    ),
    (
        "POST",
        "/platform/sessions/support/stop",
        {},
        {},
        {"data": {"stopping": True, "sessionId": "support"}},
        lambda c: c.sessions.stop("support"),
    ),
    (
        "DELETE",
        "/platform/sessions/support",
        None,
        {},
        {"data": {"removed": True, "sessionId": "support"}},
        lambda c: c.sessions.delete("support"),
    ),
    (
        "POST",
        "/platform/sessions/stop",
        BATCH,
        {},
        {"data": {"stopping": 2}},
        lambda c: c.sessions.stop_many(BATCH),
    ),
    (
        "POST",
        "/platform/sessions/delete",
        BATCH,
        {},
        {"data": {"removed": 2}},
        lambda c: c.sessions.delete_many(BATCH),
    ),
    (
        "POST",
        "/platform/sessions/support/tier-quotes",
        QUOTE,
        {},
        {"data": TIER},
        lambda c: c.sessions.quote_tier_change("support", QUOTE),
    ),
    (
        "GET",
        "/platform/sessions/support/tier-quotes/quote_1",
        None,
        {},
        {"data": TIER},
        lambda c: c.sessions.retrieve_tier_change("support", "quote_1"),
    ),
    (
        "PATCH",
        "/platform/sessions/support",
        {"quoteId": "quote_1"},
        {},
        {"data": TIER},
        lambda c: c.sessions.set_tier_override("support", {"quoteId": "quote_1"}),
    ),
    (
        "GET",
        "/platform/sessions/support/capabilities",
        None,
        {},
        {"data": CAPABILITIES},
        lambda c: c.sessions.get_capabilities("support"),
    ),
]


@pytest.mark.parametrize("method,path,body,query,fixture,invoke", CASES)
async def test_typed_platform_core(method, path, body, query, fixture, invoke):
    def handler(request):
        assert request.method == method and request.url.path == path
        assert dict(request.url.params) == query
        assert (json.loads(request.content) if request.content else None) == body
        assert request.headers["authorization"].startswith("Bearer pmfa_")
        return httpx.Response(
            200,
            json=fixture,
            headers={"x-request-id": "req_core", "x-polymorfa-operation-id": "op_core"},
        )

    async with AsyncClient(
        Credential("organization_api_key", "pmfa_" + "a" * 72),
        http_transport=httpx.MockTransport(handler),
    ) as client:
        result = await invoke(client)
        assert result.data == fixture
        assert (
            result.metadata.request_id == "req_core" and result.metadata.operation_id == "op_core"
        )
        assert result.metadata.status == 200 and result.metadata.attempts == 1


async def test_quote_confirm_guards_and_hybrid_variants():
    requests = []

    def handler(request):
        body = json.loads(request.content)
        requests.append(body)
        return httpx.Response(200, json={"data": TIER})

    async with AsyncClient(
        Credential("organization_api_key", "pmfa_" + "a" * 72),
        http_transport=httpx.MockTransport(handler),
    ) as client:
        with pytest.raises(ValidationError):
            await client.sessions.set_tier_override("support", {"quoteId": " "})
        with pytest.raises(ValidationError):
            await client.sessions.quote_tier_change(
                "support",
                {
                    "tierOverride": "standard",
                    "hybridMerge": {"absorbNumberId": "number_2"},
                    "hybridResolution": {"action": "keep", "transport": "linked_devices"},
                },
            )
        for resolution in [
            {"action": "keep", "transport": "official_api"},
            {
                "action": "split",
                "existingNumberTransport": "linked_devices",
                "newNumberName": "official",
            },
        ]:
            result = await client.sessions.quote_tier_change(
                "support", {"tierOverride": "standard", "hybridResolution": resolution}
            )
            assert result.data["data"]["quote"]["amountCents"] == 1.125
        assert len(requests) == 2
