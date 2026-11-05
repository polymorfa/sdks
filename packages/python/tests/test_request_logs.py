import asyncio
import time
from datetime import datetime, timezone

import pytest
from aiohttp import web
from test_calls_runtime import SERVER, wire

from polymorfa import (
    AsyncClient,
    AsyncProjectClient,
    ConfigurationError,
    Credential,
    RequestOptions,
    ServerError,
    ValidationError,
    request_log_retry_after,
)
from polymorfa import request_logs as module

PROJECT = "11111111-1111-4111-8111-111111111111"
PROJECT_TOKEN = "pmfa_pt_AAECAwQFBgcICQoLDA0ODxAREhM73f-k"
ENTRY = {
    "id": "log_1",
    "projectId": PROJECT,
    "createdAt": "2026-10-11T00:00:00Z",
    "method": "POST",
    "route": "/messaging/:session/messages",
    "status": 422,
    "durationMs": 41.123456,
    "result": "failure",
    "source": "api",
    "requestId": "req_log",
    "traceId": "trace_1",
    "errorCode": "invalid_recipient",
    "mcpTool": None,
    "credential": {"type": "project_token", "id": PROJECT, "last4": "wxyz"},
    "future": {"kept": True},
}


def response(items=(), follow="follow_1", **fields):
    return {
        "data": list(items),
        "page": {"nextCursor": None, "hasMore": False, "followCursor": follow, **fields},
    }


@pytest.mark.parametrize("project_credential", [False, True])
async def test_native_public_request_log_list_follow_all_fields_filters_metadata(
    project_credential,
):
    seen = []

    async def handler(request):
        assert (
            request.path == f"/platform/projects/{PROJECT}/request-logs" and request.method == "GET"
        )
        assert request.headers["authorization"] == "Bearer " + (
            PROJECT_TOKEN if project_credential else SERVER
        )
        assert request.headers["polymorfa-version"] == "2026-09-22"
        assert request.headers["x-proof"] == "logs"
        seen.append(dict(request.query))
        return web.json_response(
            response((ENTRY,), nextCursor="older_1", hasMore=True),
            headers={"x-request-id": "req_page", "polymorfa-version": "2026-09-22"},
        )

    async with wire(handler) as base:
        client = (
            AsyncProjectClient(Credential("project_token", PROJECT_TOKEN), PROJECT, base_url=base)
            if project_credential
            else AsyncClient(Credential("organization_api_key", SERVER), base_url=base)
        )
        try:
            options = RequestOptions(headers={"x-proof": "logs"})
            page = await client.request_logs.list(
                {
                    "status": [404, "5xx"],
                    "method": ["POST", "DELETE"],
                    "route": "/messaging/:session/messages",
                    "source": "mcp",
                    "credentialId": "key_1",
                    "requestId": "req_1",
                    "traceId": "trace_1",
                    "since": datetime(2026, 10, 10, tzinfo=timezone.utc),
                    "until": "2026-10-11T00:00:00Z",
                },
                project_id=PROJECT,
                limit=50,
                options=options,
            )
            assert page.items == (ENTRY,) and page.items[0]["durationMs"] == 41.123456
            assert (
                page.has_more and page.next_cursor == "older_1" and page.follow_cursor == "follow_1"
            )
            assert (
                page.metadata.request_id == "req_page" and page.metadata.api_version == "2026-09-22"
            )
            await client.request_logs.follow(
                "follow_0", project_id=PROJECT, limit=25, options=options
            )
            assert seen == [
                {
                    "status": "404,5xx",
                    "method": "POST,DELETE",
                    "route": "/messaging/:session/messages",
                    "source": "mcp",
                    "credentialId": "key_1",
                    "requestId": "req_1",
                    "traceId": "trace_1",
                    "since": "2026-10-10T00:00:00.000Z",
                    "until": "2026-10-11T00:00:00Z",
                    "limit": "50",
                },
                {"after": "follow_0", "limit": "25"},
            ]
        finally:
            await client.close()


async def test_request_log_scope_cursor_and_timezone_guards_before_network():
    async with AsyncClient(Credential("organization_api_key", SERVER)) as client:
        with pytest.raises(ConfigurationError):
            await client.request_logs.list()
        with pytest.raises(ValidationError):
            await client.request_logs.list({"status": ["5xx"]}, project_id=PROJECT, cursor="older")
        with pytest.raises(ValidationError):
            await client.project(PROJECT).request_logs.follow("f", project_id="other")
        with pytest.raises(ValidationError):
            await client.project(PROJECT).request_logs.list({"since": datetime(2026, 10, 11)})


async def test_native_cursor_accepts_empty_filters_and_keeps_server_cursor():
    async def handler(request):
        assert dict(request.query) == {"cursor": "opaque_cursor", "limit": "1"}
        return web.json_response(response())

    async with (
        wire(handler) as base,
        AsyncClient(Credential("organization_api_key", SERVER), base_url=base) as client,
    ):
        await client.project(PROJECT).request_logs.list(
            {"status": [], "method": []}, cursor="opaque_cursor", limit=1
        )


@pytest.mark.parametrize(
    "body",
    [
        {"data": [], "page": {"nextCursor": None, "hasMore": False}},
        {"data": {}, "page": {"nextCursor": None, "hasMore": False, "followCursor": "f"}},
        {"data": [], "page": {"hasMore": False, "followCursor": "f"}},
        {"data": [], "page": {"nextCursor": None, "hasMore": "yes", "followCursor": "f"}},
    ],
)
async def test_native_request_log_malformed_page_retains_metadata(body):
    async def handler(request):
        return web.json_response(body, headers={"x-request-id": "req_invalid"})

    async with (
        wire(handler) as base,
        AsyncClient(Credential("organization_api_key", SERVER), base_url=base) as client,
    ):
        with pytest.raises(ServerError) as failure:
            await client.project(PROJECT).request_logs.list()
        assert (
            failure.value.code == "invalid_response"
            and failure.value.metadata.request_id == "req_invalid"
        )
        assert failure.value.details == body


async def test_actual_tail_backfill_order_follow_more_and_rate_limit_zero_retry():
    requests = []
    stop = asyncio.Event()

    async def handler(request):
        requests.append(dict(request.query))
        index = len(requests)
        if index == 1:
            return web.json_response(response(({**ENTRY, "id": "b"}, {**ENTRY, "id": "a"}), "f1"))
        if index == 2:
            return web.json_response(response(({**ENTRY, "id": "c"},), "f2", hasMore=True))
        if index == 3:
            return web.json_response(
                {"error": {"code": "rate_limit_exceeded"}}, status=429, headers={"retry-after": "0"}
            )
        return web.json_response(response(({**ENTRY, "id": "d"},), "f3"))

    async with (
        wire(handler) as base,
        AsyncClient(Credential("organization_api_key", SERVER), base_url=base) as client,
    ):
        seen = []
        async for entry in client.project(PROJECT).request_logs.tail(
            {"status": ["5xx"]},
            backfill=2,
            interval_seconds=1.001,
            stop=stop,
            options=RequestOptions(max_network_retries=0),
        ):
            seen.append(entry["id"])
            if len(seen) == 4:
                stop.set()
        assert seen == ["a", "b", "c", "d"]
        assert requests == [
            {"status": "5xx", "limit": "2"},
            {"after": "f1", "limit": "100"},
            {"after": "f2", "limit": "100"},
            {"after": "f2", "limit": "100"},
        ]


async def test_actual_tail_rate_wait_one_second_then_stop_without_yield():
    stop = asyncio.Event()
    attempts = []

    async def handler(request):
        attempts.append(time.monotonic())
        if len(attempts) == 1:
            return web.json_response(response((), "f1"))
        if len(attempts) == 2:
            return web.json_response(
                {"error": {"code": "rate_limit_exceeded"}}, status=429, headers={"retry-after": "1"}
            )
        stop.set()
        return web.json_response(response((ENTRY,), "f2"))

    async with (
        wire(handler) as base,
        AsyncClient(Credential("organization_api_key", SERVER), base_url=base) as client,
    ):
        seen = [
            item
            async for item in client.project(PROJECT).request_logs.tail(
                stop=stop, options=RequestOptions(max_network_retries=0)
            )
        ]
        assert seen == [] and len(attempts) == 3
        assert attempts[2] - attempts[1] >= 0.9


@pytest.mark.parametrize("mode", ["pending_request", "idle", "rate_wait"])
async def test_actual_tail_graceful_stop_cancels_request_idle_or_rate_wait(mode, monkeypatch):
    admitted, waiting, release, stop = (
        asyncio.Event(),
        asyncio.Event(),
        asyncio.Event(),
        asyncio.Event(),
    )
    sleeps = module._sleep

    async def notify_sleep(seconds, event):
        waiting.set()
        return await sleeps(seconds, event)

    monkeypatch.setattr(module, "_sleep", notify_sleep)
    count = 0

    async def handler(request):
        nonlocal count
        count += 1
        if count == 1:
            return web.json_response(response())
        admitted.set()
        if mode == "pending_request":
            await release.wait()
        if mode == "rate_wait":
            return web.json_response(
                {"error": {"code": "rate_limit_exceeded"}},
                status=429,
                headers={"retry-after": "300"},
            )
        return web.json_response(response((), "f2"))

    async with (
        wire(handler) as base,
        AsyncClient(Credential("organization_api_key", SERVER), base_url=base) as client,
    ):
        iterator = client.project(PROJECT).request_logs.tail(
            stop=stop, interval_seconds=60, options=RequestOptions(max_network_retries=0)
        )
        next_item = asyncio.create_task(anext(iterator))
        try:
            await asyncio.wait_for(
                admitted.wait() if mode == "pending_request" else waiting.wait(), 2
            )
            stop.set()
            with pytest.raises(StopAsyncIteration):
                await asyncio.wait_for(next_item, 2)
            assert count == 2
        finally:
            release.set()
            stop.set()
            next_item.cancel()
            await asyncio.gather(next_item, return_exceptions=True)
            await iterator.aclose()


@pytest.mark.parametrize(
    "interval,backfill",
    [
        (0.9, 0),
        (60.001, 0),
        (float("nan"), 0),
        (1.00001, 0),
        (True, 0),
        (2, -1),
        (2, 101),
        (2, True),
    ],
)
async def test_tail_bounds_before_network(interval, backfill):
    async with AsyncClient(Credential("organization_api_key", SERVER)) as client:
        with pytest.raises(ValidationError):
            await anext(
                client.request_logs.tail(
                    project_id=PROJECT, interval_seconds=interval, backfill=backfill
                )
            )


@pytest.mark.parametrize(
    "header,expected",
    [
        (None, 60),
        ("invalid", 60),
        ("0", 0),
        ("1", 1),
        ("00001", 1),
        ("999999999999999999999", 300),
        ("999", 300),
        ("Thu, 01 Jan 1970 00:01:40 GMT", 0),
        ("Thu, 01 Jan 1970 00:02:30 GMT", 50),
    ],
)
def test_retry_after_seconds_dates_fallback_and_cap(header, expected):
    assert request_log_retry_after(header, now=100) == expected
