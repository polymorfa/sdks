import httpx
import pytest

from polymorfa import (
    AsyncClient,
    AsyncProjectClient,
    ConfigurationError,
    Credential,
    RequestOptions,
    ServerError,
)

TOTAL = {
    "meter": "call.duration",
    "unit": "second",
    "keySource": "none",
    "quantity": 1.000001,
    "records": 1,
}
SUMMARY = {
    "period": "2026-10",
    "start": "2026-10-01T00:00:00Z",
    "end": "2026-11-01T00:00:00Z",
    "projectId": "project_1",
    "session": "support",
    "billingEnabled": False,
    "meters": [TOTAL],
    "numbers": [{"session": "support", "projectId": "project_1", "meters": [TOTAL]}],
    "numbersTruncated": False,
}
RECORD = {
    "id": "record_1",
    "meter": "call.duration",
    "quantity": 1.000001,
    "unit": "second",
    "dimensions": {
        "direction": "outbound",
        "upstream": "linked_device",
        "origin": "direct",
        "participants": 1,
        "connections": 1,
        "sipLegs": 0,
        "video": False,
    },
    "keySource": "none",
    "sourceKind": "call",
    "sourceId": "call_1",
    "projectId": "project_1",
    "session": "support",
    "occurredAt": "2026-10-11T00:00:00Z",
    "recordedAt": "2026-10-11T00:00:01Z",
    "revision": 2,
    "pricingState": "unpriced",
    "rateCard": None,
    "pricedCredits": None,
}
GATES = {
    "session": "support",
    "gates": [
        {
            "key": "calls.outbound_monthly",
            "kind": "quota",
            "subject": "number",
            "mode": "record",
            "active": True,
            "limit": None,
            "used": None,
            "unit": "minute",
            "overLimit": None,
            "decisions": {"wouldBlock": 1, "blocked": 0, "evaluationError": 0},
        }
    ],
}
CASES = [
    (
        "summary",
        "/platform/usage",
        {"projectId": "project_1", "session": "support", "period": "2026-10"},
        SUMMARY,
    ),
    (
        "list_records",
        "/platform/usage/records",
        {
            "projectId": "project_1",
            "session": "support",
            "period": "2026-10",
            "callId": "call_1",
            "meter": "call.duration",
            "cursor": "cursor_1",
            "limit": 10,
        },
        {"records": [RECORD], "nextCursor": None},
    ),
    ("list_gates", "/platform/gates", {"projectId": "project_1", "session": "support"}, GATES),
]


@pytest.mark.parametrize("case", CASES)
async def test_public_usage_methods_typed_full_responses_and_metadata(case):
    method, path, params, data = case

    def handler(request):
        assert request.method == "GET" and request.url.path == path
        assert dict(request.url.params) == {key: str(value) for key, value in params.items()}
        assert request.headers["x-proof"] == "usage"
        return httpx.Response(200, json={"data": data}, headers={"x-request-id": "req_usage"})

    async with AsyncClient(
        Credential("organization_api_key", "pmfa_" + "a" * 72),
        http_transport=httpx.MockTransport(handler),
    ) as client:
        response = await getattr(client.usage, method)(
            params, options=RequestOptions(headers={"x-proof": "usage"})
        )
        assert response.data == data and response.metadata.request_id == "req_usage"


@pytest.mark.parametrize("token", [False, True])
async def test_project_usage_binding_and_gate_rejection(token):
    requests = []

    def handler(request):
        requests.append(request)
        assert request.url.params["projectId"] == "project_1"
        return httpx.Response(
            200,
            json={
                "data": SUMMARY
                if request.url.path == "/platform/usage"
                else {"records": [RECORD], "nextCursor": None}
            },
        )

    credential = (
        Credential("project_token", "pmfa_pt_" + "a" * 93 + "A")
        if token
        else Credential("organization_api_key", "pmfa_" + "a" * 72)
    )
    cls = AsyncProjectClient if token else AsyncClient
    args = (credential, "project_1") if token else (credential,)
    async with cls(*args, http_transport=httpx.MockTransport(handler)) as client:
        project = client if token else client.project("project_1")
        await project.usage.summary({"projectId": "foreign"})
        await project.usage.list_records({"projectId": "foreign"})
        with pytest.raises(ConfigurationError):
            await project.usage.list_gates()
    assert len(requests) == 2


async def test_usage_iteration_preserves_filters_and_does_not_yield_replayed_page():
    seen = []

    def handler(request):
        seen.append(dict(request.url.params))
        assert (
            request.url.params["period"] == "2026-10" and request.headers["x-proof"] == "iteration"
        )
        return httpx.Response(
            200,
            json={"data": {"records": [RECORD], "nextCursor": "cursor_2"}},
            headers={"x-request-id": "req_cycle"},
        )

    async with AsyncClient(
        Credential("organization_api_key", "pmfa_" + "a" * 72),
        http_transport=httpx.MockTransport(handler),
    ) as client:
        iterator = client.usage.iterate_records(
            {"period": "2026-10", "limit": 1},
            options=RequestOptions(headers={"x-proof": "iteration"}),
        )
        assert await anext(iterator) == RECORD
        with pytest.raises(ServerError) as caught:
            await anext(iterator)
        assert caught.value.metadata.request_id == "req_cycle"
    assert seen == [
        {"period": "2026-10", "limit": "1"},
        {"period": "2026-10", "limit": "1", "cursor": "cursor_2"},
    ]
