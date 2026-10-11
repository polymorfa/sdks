import json

import httpx
import pytest

from polymorfa import AsyncClient, Credential, RequestOptions

O = RequestOptions(idempotency_key="customer-test")
CUSTOMER = {
    "id": "customer_1",
    "orgId": "org_1",
    "projectId": "project_1",
    "name": None,
    "externalCustomerId": "external_1",
    "status": "active",
    "isDefault": False,
    "archivedAt": None,
    "createdAt": 1,
    "updatedAt": 2,
}
SUMMARY = CUSTOMER | {
    "numberCount": 2,
    "connectedNumberCount": 1,
    "activePairingLinkState": None,
    "lastActivityAt": None,
    "needsAttention": True,
}
STATUS = {"enabled": True, "enabledAt": 1, "enabledBy": "user_1", "defaultCustomer": CUSTOMER}
NUMBER = {
    "id": "number_1",
    "customerId": "customer_1",
    "sessionId": "support",
    "name": None,
    "phoneMasked": "+1555••••567",
    "status": "CONNECTED",
    "backend": None,
    "createdAt": 1,
}
EVENT = {
    "id": "event_1",
    "action": "updated",
    "fromStatus": None,
    "toStatus": None,
    "sessionId": None,
    "pairingLinkId": None,
    "metadata": {"fields": ["name", "phone", "externalCustomerId"]},
    "occurredAt": 1,
}
LINK = {
    "id": "link_1",
    "orgId": "org_1",
    "projectId": "project_1",
    "customerId": "customer_1",
    "expectedPhoneMasked": None,
    "methods": ["qr", "phone"],
    "locale": None,
    "theme": None,
    "expiresAt": 2000,
    "status": "active",
    "attemptCount": 0,
    "maxAttempts": 3,
    "pendingSessionId": None,
    "createdBy": None,
    "reservedAt": None,
    "openedAt": None,
    "connectingAt": None,
    "connectedAt": None,
    "failedAt": None,
    "expiredAt": None,
    "revokedAt": None,
    "lastErrorCode": None,
    "failedExchangeCount": 0,
    "phoneMismatchCount": 0,
    "createdAt": 1,
    "updatedAt": 1,
}
CREATE = {"projectId": "project_1", "name": "Ada", "externalCustomerId": "external_1"}
PAIR = {
    "projectId": "project_1",
    "expectedPhone": None,
    "methods": ["qr", "phone"],
    "expiresInSeconds": 600,
}
TRANSFER = {"projectId": "project_1", "sourceCustomerId": "customer_2", "confirm": True}
CASES = [
    (
        "GET",
        "/platform/projects/project_1/customers/status",
        None,
        {},
        STATUS,
        lambda c: c.status("project_1"),
    ),
    (
        "POST",
        "/platform/projects/project_1/customers/enable",
        None,
        {},
        STATUS | {"migratedNumberCount": 2},
        lambda c: c.enable("project_1", options=O),
    ),
    ("POST", "/platform/customers", CREATE, {}, CUSTOMER, lambda c: c.create(CREATE, options=O)),
    (
        "GET",
        "/platform/customers/customer_1",
        None,
        {"projectId": "project_1"},
        CUSTOMER,
        lambda c: c.retrieve("customer_1", "project_1"),
    ),
    (
        "PATCH",
        "/platform/customers/customer_1",
        {"projectId": "project_1", "name": None},
        {},
        CUSTOMER,
        lambda c: c.update("customer_1", {"projectId": "project_1", "name": None}),
    ),
    (
        "POST",
        "/platform/customers/customer_1/archive",
        {"projectId": "project_1"},
        {},
        CUSTOMER | {"status": "archiving"},
        lambda c: c.archive("customer_1", {"projectId": "project_1"}, options=O),
    ),
    (
        "POST",
        "/platform/customers/customer_1/restore",
        {},
        {},
        CUSTOMER,
        lambda c: c.restore("customer_1", options=O),
    ),
    (
        "GET",
        "/platform/customers/customer_1/numbers",
        None,
        {"projectId": "project_1"},
        [NUMBER],
        lambda c: c.list_numbers("customer_1", "project_1"),
    ),
    (
        "GET",
        "/platform/customers/customer_1/events",
        None,
        {"projectId": "project_1", "limit": "10"},
        [EVENT],
        lambda c: c.list_events("customer_1", "project_1", limit=10),
    ),
    (
        "POST",
        "/platform/customers/customer_1/pairing-links",
        PAIR,
        {},
        LINK | {"url": "https://connect.example.com/once"},
        lambda c: c.create_pairing_link("customer_1", PAIR, options=O),
    ),
    (
        "POST",
        "/platform/customers/customer_1/pairing-links",
        PAIR,
        {},
        LINK | {"url": None},
        lambda c: c.create_pairing_link("customer_1", PAIR, options=O),
    ),
    (
        "GET",
        "/platform/customers/customer_1/pairing-links",
        None,
        {"projectId": "project_1"},
        [LINK],
        lambda c: c.list_pairing_links("customer_1", "project_1"),
    ),
    (
        "DELETE",
        "/platform/customers/customer_1/pairing-links/link_1",
        None,
        {"projectId": "project_1"},
        LINK | {"status": "revoked", "revokedAt": 2},
        lambda c: c.revoke_pairing_link("customer_1", "link_1", "project_1"),
    ),
    (
        "POST",
        "/platform/customers/customer_1/numbers/support/transfer",
        TRANSFER,
        {},
        NUMBER,
        lambda c: c.transfer_number("customer_1", "support", TRANSFER, options=O),
    ),
]


@pytest.mark.parametrize("method,path,body,query,data,invoke", CASES)
async def test_typed_customer_methods(method, path, body, query, data, invoke):
    def handler(request):
        assert request.method == method and request.url.path == path
        assert dict(request.url.params) == query
        assert (json.loads(request.content) if request.content else None) == body
        if method == "POST":
            assert request.headers["idempotency-key"] == "customer-test"
        return httpx.Response(200, json={"data": data}, headers={"x-request-id": "req_customer"})

    async with AsyncClient(
        Credential("organization_api_key", "pmfa_" + "a" * 72),
        http_transport=httpx.MockTransport(handler),
    ) as client:
        result = await invoke(client.customers)
        assert result.data == {"data": data}
        assert result.metadata.status == 200 and result.metadata.request_id == "req_customer"


async def test_customer_filtered_pagination_keeps_owning_project():
    queries = []

    def handler(request):
        q = dict(request.url.params)
        queries.append(q)
        assert (
            q["projectId"] == "project_1"
            and q["isDefault"] == "false"
            and q["needsAttention"] == "true"
        )
        first = "cursor" not in q
        return httpx.Response(
            200,
            json={
                "data": [SUMMARY],
                "page": {"nextCursor": "cursor_1" if first else None, "hasMore": first},
            },
            headers={"x-request-id": "req_customer_page"},
        )

    async with AsyncClient(
        Credential("organization_api_key", "pmfa_" + "a" * 72),
        http_transport=httpx.MockTransport(handler),
    ) as client:
        page = await client.customers.list(
            {
                "projectId": "project_1",
                "limit": 1,
                "search": "Ada",
                "status": "all",
                "isDefault": False,
                "hasNumbers": True,
                "needsAttention": True,
            }
        )
        assert (
            page.items[0]["numberCount"] == 2
            and page.response.metadata.request_id == "req_customer_page"
        )
        assert len([item async for item in page]) == 2
    assert len(queries) == 2 and queries[1]["cursor"] == "cursor_1"
