"""Native wire and static type proofs for TypeScript's public non-Signal helpers."""

import json
import os
import subprocess
import sys
from contextlib import asynccontextmanager
from pathlib import Path

import pytest
from aiohttp import web

from polymorfa import (
    PRESENCE_CHAT_STATES,
    PRESENCE_OBSERVATION_STATUSES,
    PRESENCE_STATES,
    PRESENCE_UNKNOWN_REASONS,
    AsyncClient,
    AsyncMessagingClient,
    Credential,
    PageResult,
    RequestOptions,
    ServerError,
    ValidationError,
)
from polymorfa.campaign_models import PlatformCampaign

CREDENTIAL = Credential("organization_api_key", "pmfa_" + "a" * 72)
ROOT = Path(__file__).resolve().parents[1]


@asynccontextmanager
async def native_server(handler):
    app = web.Application()
    app.router.add_route("*", "/{path:.*}", handler)
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "127.0.0.1", 0)
    await site.start()
    try:
        yield f"http://127.0.0.1:{site._server.sockets[0].getsockname()[1]}"
    finally:
        await runner.cleanup()


@pytest.mark.parametrize("payload", [{}, [], ["row", 1], "text", 42, 3.5, True, False, None])
async def test_raw_arbitrary_json_keeps_metadata_and_typed_object_validation(payload):
    async def handler(request):
        return web.Response(
            text=json.dumps(payload),
            content_type="application/json",
            headers={"x-request-id": "req_raw", "x-polymorfa-operation-id": "op_raw"},
        )

    async with native_server(handler) as url, AsyncClient(CREDENTIAL, base_url=url) as client:
        raw = await client.raw.request("GET", "/raw-json")
        assert raw.data == payload
        assert raw.metadata.request_id == "req_raw"
        assert raw.metadata.operation_id == "op_raw"
        if not isinstance(payload, dict):
            with pytest.raises(ServerError, match="Expected an object"):
                await client.projects.list()


@pytest.mark.parametrize("kind", ["html", "malformed", "error"])
async def test_raw_failures_stay_safe_and_do_not_call_page_decoder(kind):
    calls = []

    async def handler(request):
        calls.append(request)
        if kind == "html":
            return web.Response(text="<html>proxy</html>", content_type="text/html")
        if kind == "malformed":
            return web.Response(text="{", content_type="application/json")
        return web.json_response(
            {"error": {"message": "API refused", "code": "provider_failure"}}, status=500
        )

    async with native_server(handler) as url, AsyncClient(CREDENTIAL, base_url=url) as client:
        with pytest.raises(ServerError):
            await client.raw.paginate(
                "GET",
                "/bad",
                lambda *_: pytest.fail("decode must not run"),
                options=RequestOptions(max_network_retries=0),
            )
        assert len(calls) == 1


@pytest.mark.parametrize("bound", [False, True])
@pytest.mark.parametrize("cursor_parameter", ["cursor", "after"])
async def test_raw_decoder_paging_preserves_wire_options_and_scope(bound, cursor_parameter):
    calls = []
    decoded = []

    async def handler(request):
        calls.append(
            (
                request.method,
                request.path,
                dict(request.query),
                await request.json(),
                dict(request.headers),
            )
        )
        cursor = request.query.get(cursor_parameter)
        values, next_cursor = (["first"], "next") if cursor == "initial" else (["last"], None)
        return web.json_response(
            {"records": values, "continuation": next_cursor},
            headers={"x-request-id": f"req_{len(calls)}"},
        )

    def decode(value, metadata):
        decoded.append((value, metadata.request_id))
        return PageResult(value["records"], value["continuation"])

    query = {cursor_parameter: "initial", "filter": "support"}
    async with native_server(handler) as url, AsyncClient(CREDENTIAL, base_url=url) as client:
        owner = client.project("project_1") if bound else client
        page = await owner.raw.paginate(
            "POST",
            "/custom",
            decode,
            query=query,
            body={"selector": [1, 2]},
            cursor_parameter=cursor_parameter,
            options=RequestOptions(
                idempotency_key="proof", api_version="2026-09-22", headers={"x-proof": "pages"}
            ),
        )
        assert page.items == ("first",) and page.has_more and page.next_cursor == "next"
        assert [row async for row in page] == ["first", "last"]
        assert query == {cursor_parameter: "initial", "filter": "support"}
        assert len(calls) == 2 and [receipt for _, receipt in decoded] == ["req_1", "req_2"]
        for method, path, params, body, headers in calls:
            assert method == "POST"
            assert path == ("/platform/projects/project_1/custom" if bound else "/custom")
            assert params["filter"] == "support" and body == {"selector": [1, 2]}
            assert headers["Authorization"] == "Bearer " + CREDENTIAL.value
            assert headers["Idempotency-Key"] == "proof" and headers["x-proof"] == "pages"
        assert calls[1][2][cursor_parameter] == "next"
        tail = await page.next_page()
        assert tail.items == ("last",) and await tail.next_page() is None


@pytest.mark.parametrize(
    "path", ["//evil.test/path", "/../other", "/%2e%2e/other", "/platform/projects/other/x"]
)
async def test_raw_pagination_refuses_project_escape_before_wire(path):
    async def handler(request):
        pytest.fail("project escape reached the wire")

    async with native_server(handler) as url, AsyncClient(CREDENTIAL, base_url=url) as client:
        with pytest.raises(ValidationError):
            await client.project("project_1").raw.paginate("GET", path, lambda *_: PageResult([]))


@pytest.mark.parametrize("cursor", ["", "initial", 12])
async def test_raw_pagination_refuses_invalid_or_repeated_cursor(cursor):
    async def handler(request):
        return web.json_response([])

    async with native_server(handler) as url, AsyncClient(CREDENTIAL, base_url=url) as client:
        with pytest.raises(ServerError, match="cursor"):
            await client.raw.paginate(
                "GET", "/rows", lambda *_: PageResult([], cursor), query={"cursor": "initial"}
            )


async def test_raw_pagination_detects_multi_page_cycle():
    async def handler(request):
        return web.json_response({"cursor": "b" if request.query.get("cursor") == "a" else "a"})

    async with native_server(handler) as url, AsyncClient(CREDENTIAL, base_url=url) as client:
        page = await client.raw.paginate(
            "GET", "/rows", lambda data, _: PageResult([], data["cursor"]), query={"cursor": "a"}
        )
        with pytest.raises(ServerError, match="repeated"):
            await page.next_page()


async def test_platform_campaign_open_fields_and_known_fields():
    calls = []
    campaign = {
        "id": "campaign_1",
        "name": "Offer",
        "future": {"nested": [True, None]},
        "followUp": None,
    }

    async def handler(request):
        body = await request.json() if request.can_read_body else None
        calls.append((request.method, dict(request.query), body))
        data = (
            [campaign]
            if request.path == "/platform/campaigns" and request.method == "GET"
            else campaign
        )
        return web.json_response(
            {"data": data, "futureEnvelope": True}, headers={"x-request-id": "req_campaign"}
        )

    async with native_server(handler) as url, AsyncClient(CREDENTIAL, base_url=url) as client:
        params = {"projectId": "project_1"}
        listed = await client.campaigns.list(params)
        created = await client.campaigns.create({**params, "name": "Offer"})
        retrieved = await client.campaigns.retrieve("campaign_1", params)
        updated = await client.campaigns.update(
            "campaign_1",
            {"followUp": None},
            params,
            extra_fields={"futureDraft": {"enabled": True}},
        )
        for value in (
            listed.data["data"][0],
            created.data["data"],
            retrieved.data["data"],
            updated.data["data"],
        ):
            assert isinstance(value, PlatformCampaign)
            assert value["future"] == campaign["future"]
            assert value.known["id"] == "campaign_1" and value.known["followUp"] is None
            assert dict(value) == campaign
        assert updated.data["futureEnvelope"] is True
        assert updated.metadata.request_id == "req_campaign"
        assert calls[-1] == ("PATCH", params, {"followUp": None, "futureDraft": {"enabled": True}})
        for field in ("name", "followUp"):
            with pytest.raises(ValidationError, match="typed body"):
                await client.campaigns.update(
                    "campaign_1", None, params, extra_fields={field: "bypass"}
                )
        assert len(calls) == 4


async def test_platform_campaign_nullable_retrieval_and_extra_only_update():
    calls = []

    async def handler(request):
        body = await request.json() if request.can_read_body else None
        calls.append(body)
        return web.json_response(
            {"data": None if request.method == "GET" else {"id": "c", "future": 3}}
        )

    async with native_server(handler) as url, AsyncClient(CREDENTIAL, base_url=url) as client:
        assert (await client.campaigns.retrieve("c", {"projectId": "p"})).data["data"] is None
        result = await client.campaigns.update(
            "c", None, {"projectId": "p"}, extra_fields={"future": 3}
        )
        assert result.data["data"]["future"] == 3 and calls[-1] == {"future": 3}


def test_presence_catalog_exports():
    assert PRESENCE_STATES == ("available", "unavailable")
    assert PRESENCE_OBSERVATION_STATUSES == ("unknown", "fresh", "stale")
    assert PRESENCE_UNKNOWN_REASONS == ("disabled", "not_observed", "suspended")
    assert PRESENCE_CHAT_STATES == ("composing", "paused")


@pytest.mark.parametrize(
    "target",
    [
        {"id": "conversation_1"},
        {"phoneNumber": "+15551234567"},
        {"bsuid": "business_1"},
        {"id": "c", "phoneNumber": "+15551234567", "username": "Ada"},
    ],
)
async def test_message_actions_preserve_valid_target_alternatives(target):
    calls = []

    async def handler(request):
        body = await request.json()
        calls.append(body)
        return web.json_response({"success": True, "data": {"status": "OK"}})

    async with (
        native_server(handler) as url,
        AsyncMessagingClient(CREDENTIAL, base_url=url) as client,
    ):
        await client.messages.mark_seen("support", {"conversation": target, "id": "m"})
        await client.messages.set_typing("support", {"conversation": target, "state": "typing"})
        await client.messages.react(
            "support", {"conversation": target, "id": "m", "reaction": "👍"}
        )
        await client.messages.star("support", {"conversation": target, "id": "m", "star": True})
        assert len(calls) == 4 and all(body["conversation"] == target for body in calls)


def run_mypy(source):
    env = {**os.environ, "MYPYPATH": str(ROOT / "src")}
    return subprocess.run(
        [
            sys.executable,
            "-m",
            "mypy",
            "--strict",
            f"--config-file={os.devnull}",
            "--no-incremental",
            f"--cache-dir={os.devnull}",
            "--python-version=3.10",
            "-c",
            source,
        ],
        check=False,
        cwd=ROOT,
        env=env,
        text=True,
        capture_output=True,
    )


def test_static_known_campaign_fields_decoder_and_valid_targets():
    result = run_mypy("""
from polymorfa import AsyncClient, PageResult, PRESENCE_STATES, RawCursorPage
from polymorfa.campaign_models import PlatformCampaign, UpdateCampaign
from polymorfa.models import Seen, Reaction, Star, Typing
from polymorfa.transport import Json, ResponseMetadata
from typing_extensions import assert_type
campaign = PlatformCampaign({"id": "c", "future": {"enabled": True}})
assert_type(campaign.known["id"], str)
assert_type(campaign["future"], Json)
def decode(value: Json, metadata: ResponseMetadata) -> PageResult[str]:
    return PageResult(["row"], None)
seen: Seen = {"conversation": {"id": "c"}, "id": "m"}
reaction: Reaction = {"conversation": {"phoneNumber": "+15551234567"}, "id": "m", "reaction": "👍"}
star: Star = {"conversation": {"bsuid": "b"}, "id": "m", "star": True}
typing: Typing = {"conversation": {"id": "c", "phoneNumber": "+15551234567"}, "state": "typing"}
update: UpdateCampaign = {"followUp": None}
async def examples(client: AsyncClient) -> None:
    page = await client.raw.paginate("GET", "/rows", decode, cursor_parameter="after")
    assert_type(page, RawCursorPage[str])
    response = await client.campaigns.update("c", {"name": "Offer"}, {"projectId": "p"}, extra_fields={"future": 3})
    assert_type(response.data["data"].known["id"], str)
""")
    assert result.returncode == 0, result.stdout + result.stderr


def test_static_empty_targets_wrong_types_and_known_fields_are_rejected():
    result = run_mypy("""
from polymorfa.campaign_models import UpdateCampaign
from polymorfa.models import Seen, Reaction, Star, Typing
seen: Seen = {"conversation": {}, "id": "m"}
reaction: Reaction = {"conversation": {"username": "only"}, "id": "m", "reaction": "👍"}
star: Star = {"conversation": {"bsuid": 42}, "id": "m", "star": True}
typing: Typing = {"conversation": {"phoneNumber": False}, "state": "typing"}
update: UpdateCampaign = {"name": 42}
""")
    assert result.returncode != 0
    assert result.stdout.count("error:") == 5, result.stdout + result.stderr
