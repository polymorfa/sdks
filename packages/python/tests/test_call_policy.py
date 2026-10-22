import json

import httpx
import pytest

from polymorfa import AsyncClient, AsyncProjectClient, Credential, ValidationError

RETENTION = {
    "policy": "custom",
    "retentionDays": 45,
    "appliesTo": ["call_records", "call_events", "client_reports", "future_data"],
    "revision": 2,
    "updatedAt": "2026-10-11T00:00:00Z",
}
POLICY = {"blockedCountryCodes": ["44", "1876"], "optOutCount": 2, "revision": 1, "updatedAt": None}
PHONE = {
    "id": "opt_1",
    "phoneNumber": "+15551234567",
    "bsuid": None,
    "note": "Request",
    "source": "api",
    "createdAt": "2026-10-11T00:00:00Z",
}
BSUID = PHONE | {"id": "opt_2", "phoneNumber": None, "bsuid": "business_1"}
CASES = [
    ("GET", "/platform/call-retention", None, RETENTION, lambda c: c.call_retention.retrieve()),
    (
        "PUT",
        "/platform/call-retention",
        {"policy": "custom", "retentionDays": 45, "expectedRevision": 1},
        RETENTION,
        lambda c: c.call_retention.update(
            {"policy": "custom", "retentionDays": 45, "expectedRevision": 1}
        ),
    ),
    ("GET", "/platform/call-policy", None, POLICY, lambda c: c.call_policy.retrieve()),
    (
        "PUT",
        "/platform/call-policy",
        {"blockedCountryCodes": ["44", "1876"], "expectedRevision": 0},
        POLICY,
        lambda c: c.call_policy.update(
            {"blockedCountryCodes": ["44", "1876"], "expectedRevision": 0}
        ),
    ),
    (
        "POST",
        "/platform/call-opt-outs",
        {"phoneNumber": "+15551234567", "note": "Request"},
        PHONE,
        lambda c: c.call_opt_outs.create({"phoneNumber": "+15551234567", "note": "Request"}),
    ),
    (
        "POST",
        "/platform/call-opt-outs",
        {"bsuid": "business_1"},
        BSUID,
        lambda c: c.call_opt_outs.create({"bsuid": "business_1"}),
    ),
    (
        "POST",
        "/platform/call-opt-outs/import",
        {"entries": [{"phoneNumber": "+15551234567"}, {"bsuid": "business_1"}, {}]},
        {"added": 1, "existing": 1, "rejected": [{"index": 2, "reason": "missing_identifier"}]},
        lambda c: c.call_opt_outs.import_entries(
            {"entries": [{"phoneNumber": "+15551234567"}, {"bsuid": "business_1"}, {}]}
        ),
    ),
    (
        "DELETE",
        "/platform/call-opt-outs/opt_1",
        None,
        {"id": "opt_1", "deleted": True},
        lambda c: c.call_opt_outs.delete("opt_1"),
    ),
]


@pytest.mark.parametrize("method,path,body,data,invoke", CASES)
async def test_call_policy_typed_methods(method, path, body, data, invoke):
    def handler(request):
        assert request.method == method and request.url.path == path
        assert (json.loads(request.content) if request.content else None) == body
        return httpx.Response(
            201 if method == "POST" and path.endswith("outs") else 200,
            json={"data": data},
            headers={"x-request-id": "req_policy"},
        )

    async with AsyncClient(
        Credential("organization_api_key", "pmfa_" + "a" * 72),
        http_transport=httpx.MockTransport(handler),
    ) as client:
        result = await invoke(client)
        assert result.data == data and result.metadata.request_id == "req_policy"
        assert result.metadata.status == (
            201 if method == "POST" and path.endswith("outs") else 200
        )


async def test_opt_out_cursor_page_follows_filter_and_metadata():
    attempts = []

    def handler(request):
        query = dict(request.url.params)
        attempts.append(query)
        assert request.url.path == "/platform/call-opt-outs" and query["limit"] == "1"
        assert query["phoneNumber"] == "+15551234567"
        first = "cursor" not in query
        return httpx.Response(
            200,
            json={
                "data": [PHONE if first else BSUID],
                "page": {"hasMore": first, "nextCursor": "next_1" if first else None},
            },
            headers={"x-request-id": "req_page"},
        )

    async with AsyncClient(
        Credential("organization_api_key", "pmfa_" + "a" * 72),
        http_transport=httpx.MockTransport(handler),
    ) as client:
        page = await client.call_opt_outs.list(limit=1, phone_number="+15551234567")
        assert page.items[0]["id"] == "opt_1" and page.response.metadata.request_id == "req_page"
        assert [item["id"] async for item in page] == ["opt_1", "opt_2"]
    assert attempts == [
        {"limit": "1", "phoneNumber": "+15551234567"},
        {"limit": "1", "phoneNumber": "+15551234567", "cursor": "next_1"},
    ]


async def test_call_policy_preflight_guards_and_project_retention():
    requests = []

    def handler(request):
        requests.append(request)
        assert request.url.path == "/platform/call-retention" and not request.url.query
        return httpx.Response(200, json={"data": RETENTION})

    async with AsyncClient(
        Credential("organization_api_key", "pmfa_" + "a" * 72),
        http_transport=httpx.MockTransport(handler),
    ) as client:
        for invoke in [
            lambda: client.call_policy.update({"blockedCountryCodes": ["+44"]}),
            lambda: client.call_policy.update({"blockedCountryCodes": ["0"]}),
            lambda: client.call_policy.update(
                {"blockedCountryCodes": ["44"], "expectedRevision": True}
            ),
            lambda: client.call_opt_outs.create({"phoneNumber": "x", "bsuid": "y"}),
            lambda: client.call_opt_outs.create({"phoneNumber": ""}),
            lambda: client.call_opt_outs.import_entries({"entries": []}),
            lambda: client.call_opt_outs.list(phone_number="x", bsuid="y"),
        ]:
            with pytest.raises(ValidationError):
                await invoke()
        result = await client.project("project_1").call_retention.retrieve()
        assert result.data["retentionDays"] == 45
    async with AsyncProjectClient(
        Credential("project_token", "pmfa_pt_" + "a" * 93 + "A"),
        "project_1",
        http_transport=httpx.MockTransport(handler),
    ) as client:
        result = await client.call_retention.retrieve()
        assert result.data == RETENTION
    assert len(requests) == 2
