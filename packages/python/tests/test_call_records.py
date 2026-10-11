from datetime import datetime, timezone

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

NOW = "2026-10-11T00:00:00Z"
RECORD = {
    "callId": "call_1",
    "projectId": "project_1",
    "sessionId": "support",
    "direction": "outbound",
    "upstream": "linked_device",
    "outcome": "answered",
    "state": "ended",
    "hasVideo": True,
    "peerRef": "opaque_peer_1",
    "startedAt": NOW,
    "connectedAt": NOW,
    "endedAt": NOW,
    "durationSeconds": 1.5,
    "endReason": "user_hangup",
}
CALL = {
    "callId": "call_1",
    "sessionId": "support",
    "projectId": "project_1",
    "direction": "outbound",
    "state": "ended",
    "live": False,
    "backend": "linked_device",
    "hasVideo": True,
    "peerRef": "opaque_peer_1",
    "startedAt": NOW,
    "connectedAt": NOW,
    "endedAt": NOW,
    "durationSeconds": 1.5,
    "endReason": {"code": "future_reason", "label": "Other"},
    "answeredBy": "server:default",
    "exclusive": False,
}
DETAIL = {
    "call": CALL,
    "participants": [
        {
            "id": "participant_1",
            "state": "left",
            "firstSeenAt": NOW,
            "updatedAt": NOW,
            "leftReason": "call_ended",
        }
    ],
    "connections": [
        {
            "id": "connection_1",
            "participant": "server:default",
            "transport": "socket",
            "joinedAt": NOW,
            "leftAt": NOW,
            "reason": "call_ended",
        }
    ],
    "telemetry": {
        "status": "reported",
        "source": "media_server",
        "setupMs": 1.5,
        "ringMs": 2.5,
        "codec": "opus",
        "jitterMs": None,
        "packetsLost": 0,
        "rttMs": 3.5,
        "receivedKbps": 64.5,
        "sentKbps": 64.5,
    },
    "appReports": {
        "status": "reported",
        "connections": [
            {
                "connectionId": "connection_1",
                "participant": "server:default",
                "client": {"sdk": "python", "version": "0.1.0", "platform": "other"},
                "quality": {
                    "reportedAt": NOW,
                    "rttMs": 3.5,
                    "jitterMs": None,
                    "packetsLost": 0,
                    "packetsReceived": 100,
                    "audioCodec": "opus",
                    "videoCodec": "h264",
                    "candidateType": None,
                    "reconnects": 1,
                },
                "errors": [{"code": "other", "reportedAt": NOW}],
            }
        ],
        "truncated": False,
    },
    "history": {
        "events": [{"eventId": "event_1", "type": "call.ended", "occurredAt": NOW}],
        "truncated": False,
    },
    "correlation": {"callId": "call_1", "sessionId": "support"},
}
METRICS = {
    "calls": 2,
    "answered": 1,
    "missed": 1,
    "declined": 0,
    "failed": 0,
    "inProgress": 0,
    "answerRate": 0.5,
    "totalDurationSeconds": 1.5,
    "averageDurationSeconds": 1.5,
}
STATS = {
    "since": NOW,
    "until": "2026-10-12T00:00:00Z",
    "timezone": "UTC",
    "groupBy": "session",
    "totals": METRICS,
    "groups": [{**METRICS, "key": "support", "start": None}],
    "groupsTruncated": False,
    "heatmap": [{"dayOfWeek": 1, "hour": 0, "calls": 2, "answered": 1}],
}
FILTER = {
    "projectId": "project_1",
    "sessionId": "support",
    "direction": "outbound",
    "upstream": "linked_device",
    "outcome": "answered",
    "since": NOW,
    "until": "2026-10-12T00:00:00Z",
}
CASES = [
    (
        "retrieve",
        "/platform/calls/call_1",
        {"projectId": "project_1"},
        DETAIL,
        lambda c, o: c.calls.retrieve("call_1", {"projectId": "project_1"}, options=o),
    ),
    (
        "stats",
        "/platform/calls/stats",
        {**FILTER, "groupBy": "session", "timezone": "UTC"},
        STATS,
        lambda c, o: c.calls.stats({**FILTER, "groupBy": "session", "timezone": "UTC"}, options=o),
    ),
    (
        "list",
        "/platform/calls",
        {**FILTER, "limit": 10, "cursor": "cursor_1"},
        {"data": [RECORD], "page": {"nextCursor": None, "hasMore": False}},
        lambda c, o: c.calls.list({**FILTER, "limit": 10, "cursor": "cursor_1"}, options=o),
    ),
    (
        "export",
        "/platform/calls/export",
        {**FILTER, "limit": 1000, "cursor": "cursor_1", "format": "csv"},
        "callId,durationSeconds\r\ncall_1,1.5\r\n",
        lambda c, o: c.calls.export(
            {**FILTER, "limit": 1000, "cursor": "cursor_1", "format": "csv"}, options=o
        ),
    ),
]


@pytest.mark.parametrize("scope", ["organization", "project", "project_token"])
@pytest.mark.parametrize("case", CASES)
async def test_public_typed_call_record_methods_full_request_response_metadata(scope, case):
    method, path, query, data, invoke = case

    def handler(request):
        assert (
            request.method == "GET"
            and request.url.path == path
            and dict(request.url.params) == {key: str(value) for key, value in query.items()}
        )
        assert request.headers["x-proof"] == "calls"
        headers = {"x-request-id": "req_calls"}
        if method == "export":
            return httpx.Response(
                200,
                text=data,
                headers={
                    **headers,
                    "content-type": "text/csv; charset=utf-8",
                    "polymorfa-next-cursor": "cursor_2",
                },
            )
        return httpx.Response(
            200, json=data if method == "list" else {"data": data}, headers=headers
        )

    token = (
        Credential("project_token", "pmfa_pt_" + "a" * 93 + "A")
        if scope == "project_token"
        else Credential("organization_api_key", "pmfa_" + "a" * 72)
    )
    cls = AsyncProjectClient if scope == "project_token" else AsyncClient
    args = (token, "project_1") if scope == "project_token" else (token,)
    async with cls(*args, http_transport=httpx.MockTransport(handler)) as client:
        target = client.project("project_1") if scope == "project" else client
        response = await invoke(target, RequestOptions(headers={"x-proof": "calls"}))
        if method == "list":
            assert response.items == (RECORD,)
            response = response.response
        assert response.metadata.request_id == "req_calls"
        assert response.data == (
            {"format": "csv", "body": data, "nextCursor": "cursor_2"}
            if method == "export"
            else data
        )


@pytest.mark.parametrize("format", ["csv", "ndjson"])
async def test_export_all_suppresses_csv_headers_and_keeps_ndjson(format):
    queries = []

    def handler(request):
        queries.append(dict(request.url.params))
        first = len(queries) == 1
        body = "id\r\nfirst\r\n" if first else "id\r\nsecond\r\n"
        if format == "ndjson":
            body = '{"id":"first"}\n' if first else '{"id":"second"}\n'
        return httpx.Response(
            200,
            text=body,
            headers={
                "content-type": "text/csv" if format == "csv" else "application/x-ndjson",
                **({"polymorfa-next-cursor": "next"} if first else {}),
            },
        )

    async with AsyncClient(
        Credential("organization_api_key", "pmfa_" + "a" * 72),
        http_transport=httpx.MockTransport(handler),
    ) as client:
        chunks = [
            chunk
            async for chunk in client.calls.export_all({"format": format, "sessionId": "support"})
        ]
    assert "".join(chunks) == (
        "id\r\nfirst\r\nsecond\r\n" if format == "csv" else '{"id":"first"}\n{"id":"second"}\n'
    )
    assert queries == [
        {"sessionId": "support", "format": format},
        {"sessionId": "support", "format": format, "cursor": "next"},
    ]


async def test_export_repeated_cursor_fails_before_replayed_body_yield():
    async with AsyncClient(
        Credential("organization_api_key", "pmfa_" + "a" * 72),
        http_transport=httpx.MockTransport(
            lambda r: httpx.Response(
                200,
                text="id\r\nrow\r\n",
                headers={
                    "content-type": "text/csv",
                    "polymorfa-next-cursor": "repeat",
                    "x-request-id": "req_cycle",
                },
            )
        ),
    ) as client:
        iterator = client.calls.export_all()
        assert await anext(iterator) == "id\r\nrow\r\n"
        with pytest.raises(ServerError) as caught:
            await anext(iterator)
        assert caught.value.metadata.request_id == "req_cycle"
        with pytest.raises(ServerError):
            await anext(client.calls.export_all({"cursor": "repeat"}))


async def test_call_record_validation_and_datetime_serialization():
    seen = []

    def handler(request):
        seen.append(request)
        assert request.url.params["since"] == "2026-10-11T00:00:00.000Z"
        return httpx.Response(200, json={"data": STATS})

    async with AsyncClient(
        Credential("organization_api_key", "pmfa_" + "a" * 72),
        http_transport=httpx.MockTransport(handler),
    ) as client:
        for call_id in ["", "space id", "a" * 129, "new\nline"]:
            with pytest.raises(ConfigurationError):
                await client.calls.retrieve(call_id)
        for filters in [
            {"direction": "future"},
            {"upstream": "future"},
            {"outcome": "future"},
            {"since": "2026-02-30T00:00:00Z"},
            {"until": "2026-10-11"},
            {"since": "2026-10-11T25:00:00Z"},
            {"since": datetime(2026, 10, 11)},
            {"sessionId": " "},
            {"projectId": "x" * 65},
        ]:
            with pytest.raises(ConfigurationError):
                await client.calls.list(filters)
        for params in [{"limit": 0}, {"limit": 101}, {"limit": True}, {"cursor": " "}]:
            with pytest.raises(ConfigurationError):
                await client.calls.list(params)
        for params in [{"limit": 1001}, {"format": "json"}]:
            with pytest.raises(ConfigurationError):
                await client.calls.export(params)
        with pytest.raises(ConfigurationError):
            await client.project("project_1").calls.stats({"projectId": "foreign"})
        await client.calls.stats({"since": datetime(2026, 10, 11, tzinfo=timezone.utc)})
    assert len(seen) == 1


async def test_export_unexpected_content_type_retains_request_metadata():
    async with AsyncClient(
        Credential("organization_api_key", "pmfa_" + "a" * 72),
        http_transport=httpx.MockTransport(
            lambda r: httpx.Response(
                200, text="html", headers={"content-type": "text/html", "x-request-id": "req_bad"}
            )
        ),
    ) as client:
        with pytest.raises(ServerError) as caught:
            await client.calls.export()
        assert (
            caught.value.code == "invalid_response"
            and caught.value.metadata.request_id == "req_bad"
        )
