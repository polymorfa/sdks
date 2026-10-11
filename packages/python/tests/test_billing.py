import json

import httpx
import pytest

from polymorfa import AsyncClient, Credential, ValidationError

ID = "AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA"
LOWER = ID.lower()
BUDGET = {
    "scope": "number",
    "resourceId": LOWER,
    "projectId": LOWER,
    "name": "Support",
    "limitCredits": 1.125001,
    "spentCredits": 0.125001,
    "reservedCredits": 0.25,
    "revision": 2,
}
CONTROLS = {"budget": BUDGET, "priority": 7, "priorityRevision": 3}
LIMITS = {
    "checkedAt": "2026-10-11T00:00:00Z",
    "periodStart": "2026-10-01T00:00:00Z",
    "periodEnd": "2026-11-01T00:00:00Z",
    "todayCredits": 0.125001,
    "monthCredits": 1.25,
    "daily": [{"date": "2026-10-11", "credits": 0.125001}],
    "budgets": [BUDGET],
}
PRIORITIES = {
    "revision": 2,
    "projects": [{"id": LOWER, "name": "Support", "priority": 1}],
    "customers": [{"id": LOWER, "name": "Customer", "priority": 2, "projectId": LOWER}],
    "numbers": [{"id": LOWER, "name": "Number", "priority": 3, "projectId": LOWER}],
}
SET = {
    "limitCredits": 1.125001,
    "priority": 7,
    "expectedBudgetRevision": 1,
    "expectedPriorityRevision": 2,
}
CASES = [
    (
        "GET",
        "/platform/billing",
        None,
        {},
        {"balanceCents": 125.125, "preferredCurrency": "USD"},
        lambda b: b.retrieve(),
    ),
    (
        "GET",
        "/platform/billing/usage",
        None,
        {},
        {"activeNumbers": 3, "totalChargedCents": 1.125},
        lambda b: b.usage(),
    ),
    (
        "GET",
        "/platform/billing/transactions",
        None,
        {},
        [
            {
                "id": "transaction_1",
                "amountCents": 1.125,
                "balanceAfterCents": 125.125,
                "type": "number",
                "description": "Daily usage",
                "sessionId": None,
                "projectId": None,
                "tier": "standard",
                "currency": None,
                "paymentStatus": "paid",
                "createdAt": 1,
            }
        ],
        lambda b: b.list_transactions(),
    ),
    (
        "GET",
        "/platform/billing/pricing",
        None,
        {},
        [
            {
                "id": "price_1",
                "tier": "free",
                "dailyRateCents": 0,
                "label": "Free",
                "description": "Test",
                "features": ["test"],
            }
        ],
        lambda b: b.list_pricing(),
    ),
    (
        "GET",
        f"/platform/billing/controls/number/{LOWER}",
        None,
        {},
        CONTROLS,
        lambda b: b.get_resource_controls("number", ID),
    ),
    (
        "PUT",
        f"/platform/billing/controls/number/{LOWER}",
        SET,
        {},
        CONTROLS,
        lambda b: b.set_resource_controls("number", ID, SET),
    ),
    (
        "GET",
        "/platform/billing/limits",
        None,
        {"projectId": LOWER, "scope": "project"},
        LIMITS,
        lambda b: b.get_limits({"projectId": ID, "scope": "project"}),
    ),
    (
        "PUT",
        f"/platform/billing/limits/project/{LOWER}",
        {"limitCredits": None, "expectedRevision": 1},
        {},
        {"saved": True},
        lambda b: b.set_limit("project", ID, {"limitCredits": None, "expectedRevision": 1}),
    ),
    (
        "GET",
        "/platform/billing/priorities",
        None,
        {"projectId": LOWER},
        PRIORITIES,
        lambda b: b.get_priorities({"projectId": ID}),
    ),
    (
        "PUT",
        f"/platform/billing/priorities/customer/{LOWER}",
        {"priority": 5, "expectedRevision": 1},
        {},
        PRIORITIES,
        lambda b: b.set_priority("customer", ID, {"priority": 5, "expectedRevision": 1}),
    ),
    (
        "PUT",
        "/platform/billing/priorities",
        {"scope": "project", "resourceIds": [LOWER], "expectedRevision": 1},
        {},
        PRIORITIES,
        lambda b: b.reorder_priorities(
            {"scope": "project", "resourceIds": [ID], "expectedRevision": 1}
        ),
    ),
    (
        "PUT",
        "/platform/billing/priorities",
        {"scope": "number", "projectId": LOWER, "resourceIds": [LOWER], "expectedRevision": 1},
        {},
        PRIORITIES,
        lambda b: b.reorder_priorities(
            {"scope": "number", "projectId": ID, "resourceIds": [ID], "expectedRevision": 1}
        ),
    ),
    (
        "PUT",
        "/platform/billing/priorities",
        {
            "scope": "resource",
            "projectId": LOWER,
            "resources": [
                {"scope": "customer", "resourceId": LOWER},
                {"scope": "number", "resourceId": LOWER},
            ],
            "expectedRevision": 1,
        },
        {},
        PRIORITIES,
        lambda b: b.reorder_priorities(
            {
                "scope": "resource",
                "projectId": ID,
                "resources": [
                    {"scope": "customer", "resourceId": ID},
                    {"scope": "number", "resourceId": ID},
                ],
                "expectedRevision": 1,
            }
        ),
    ),
]


@pytest.mark.parametrize("method,path,body,query,data,invoke", CASES)
async def test_typed_billing(method, path, body, query, data, invoke):
    def handler(request):
        assert request.method == method and request.url.path == path
        assert dict(request.url.params) == query
        assert (json.loads(request.content) if request.content else None) == body
        return httpx.Response(200, json={"data": data}, headers={"x-request-id": "req_billing"})

    async with AsyncClient(
        Credential("organization_api_key", "pmfa_" + "a" * 72),
        http_transport=httpx.MockTransport(handler),
    ) as client:
        result = await invoke(client.billing)
        assert result.data == {"data": data}
        assert result.metadata.request_id == "req_billing" and result.metadata.status == 200


async def test_billing_guards_reject_before_network():
    def handler(request):
        pytest.fail("Invalid financial controls reached the network.")

    async with AsyncClient(
        Credential("organization_api_key", "pmfa_" + "a" * 72),
        http_transport=httpx.MockTransport(handler),
    ) as client:
        b = client.billing
        for invoke in [
            lambda: b.get_resource_controls("number", "not-uuid"),
            lambda: b.get_resource_controls("unknown", ID),
            lambda: b.set_limit("project", ID, {"limitCredits": 0.0000001, "expectedRevision": 1}),
            lambda: b.set_limit(
                "project", ID, {"limitCredits": float("inf"), "expectedRevision": 1}
            ),
            lambda: b.set_limit("project", ID, {"limitCredits": 1, "expectedRevision": True}),
            lambda: b.set_resource_controls(
                "project", ID, SET | {"expectedPriorityRevision": 2147483647}
            ),
            lambda: b.set_priority("number", ID, {"priority": 1.5, "expectedRevision": 1}),
            lambda: b.set_priority("number", ID, {"priority": 1000001, "expectedRevision": 1}),
            lambda: b.get_limits({"scope": "number"}),
            lambda: b.get_priorities({"scope": "number"}),
            lambda: b.reorder_priorities(
                {"scope": "project", "resourceIds": [ID, LOWER], "expectedRevision": 1}
            ),
            lambda: b.reorder_priorities(
                {
                    "scope": "resource",
                    "projectId": ID,
                    "resources": [
                        {"scope": "number", "resourceId": ID},
                        {"scope": "number", "resourceId": LOWER},
                    ],
                    "expectedRevision": 1,
                }
            ),
        ]:
            with pytest.raises(ValidationError):
                await invoke()
