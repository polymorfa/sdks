import asyncio
import json
import re
from contextlib import asynccontextmanager
from pathlib import Path

import pytest

from polymorfa import AsyncClient, Credential

PROJECT = "11111111-1111-4111-8111-111111111111"
ID = "22222222-2222-4222-8222-222222222222"
PHONE = "+15551234567"


@asynccontextmanager
async def wire(
    payload=None, *, status=200, headers=None, raw=None, responses=None, on_request=None
):
    requests = []
    tasks = set()

    async def serve(reader, writer):
        task = asyncio.current_task()
        tasks.add(task)
        try:
            head = (await reader.readuntil(b"\r\n\r\n")).decode()
            lines = head.split("\r\n")
            fields = {
                k.lower(): v.strip()
                for k, v in (line.split(":", 1) for line in lines[1:] if ":" in line)
            }
            body = await reader.readexactly(int(fields.get("content-length", "0")))
            requests.append((lines[0].split()[:2], fields, json.loads(body) if body else None))
            current_status, current_payload = (
                responses[min(len(requests) - 1, len(responses) - 1)]
                if responses
                else (status, payload)
            )
            if on_request is not None:
                on_request(len(requests))
            data = (
                raw
                if raw is not None
                else json.dumps(
                    current_payload if current_payload is not None else {"data": {}}
                ).encode()
            )
            out = {"Content-Type": "application/json", **(headers or {})}
            writer.write(
                (
                    f"HTTP/1.1 {current_status} Response\r\n"
                    + "".join(f"{k}: {v}\r\n" for k, v in out.items())
                    + f"Content-Length: {len(data)}\r\nConnection: close\r\n\r\n"
                ).encode()
                + data
            )
            await writer.drain()
        finally:
            writer.close()
            await writer.wait_closed()
            tasks.discard(task)

    server = await asyncio.start_server(serve, "127.0.0.1", 0)
    try:
        async with (
            server,
            AsyncClient(
                Credential(
                    "organization_api_key",
                    "pmfa_AAECAwQFBgcICQoLDA0ODxAREhM73f-k",
                ),
                base_url=f"http://127.0.0.1:{server.sockets[0].getsockname()[1]}",
            ) as client,
        ):
            yield client, requests
    finally:
        if tasks:
            await asyncio.gather(*tasks)


async def test_profile_page_preserves_null_zero_and_finite_page():
    payload = {
        "data": [
            {
                "id": ID,
                "phone": PHONE,
                "revision": 1,
                "tags": [],
                "attributes": {"zero": 0, "false": False, "null": None},
                "provenance": None,
                "createdAt": 0,
                "updatedAt": 0,
            }
        ],
        "page": {"nextCursor": ID, "hasMore": True},
    }
    async with wire(payload) as (client, requests):
        result = await client.audience_profiles.list({"limit": 1})
        assert result.data == payload
        assert len(requests) == 1
        assert requests[0][0] == ["GET", "/platform/audience-profiles?limit=1"]
        assert requests[0][1]["polymorfa-version"] == "2026-10-14"


async def test_bound_campaign_resource_confines_request():
    async with wire({"data": {"campaignId": ID, "replyFlowId": None}}) as (client, requests):
        result = await client.project(PROJECT).campaigns.set_reply_flow(ID, {"replyFlowId": None})
        assert result.data["data"]["replyFlowId"] is None
        assert requests[0][2] == {"replyFlowId": None, "projectId": PROJECT}


from dataclasses import FrozenInstanceError
from urllib.parse import parse_qs, urlsplit

from polymorfa import (
    AsyncMessagingClient,
    ConfigurationError,
    RequestOptions,
    ServerError,
    ValidationError,
)

FLOW = {
    "name": "  ",
    "definition": {
        "entryNodeId": "entry",
        "nodes": [
            {"id": "entry", "edges": [{"match": {"kind": "keyword", "value": "Go"}, "to": "end"}]},
            {
                "id": "end",
                "send": {
                    "kind": "buttons",
                    "body": "Hello\nworld",
                    "footer": " ",
                    "buttons": [{"id": "yes", "text": " "}],
                },
                "edges": [],
            },
        ],
    },
}
TEST = {"sessionId": ID, "to": PHONE, "variables": {"a": 0, "b": False, "c": ""}}


def route_cases():
    campaign = f"/platform/campaigns/{ID}"
    reply = "/platform/campaign-reply-flows"
    profile = "/platform/audience-profiles/%2B15551234567"
    custody = f"/platform/projects/{PROJECT}/signal-custody"
    customer = f"/platform/projects/{PROJECT}/customers/{ID}/signal-custody"
    cases = [
        (
            "GET",
            "/platform/audience-profiles",
            lambda c: c.audience_profiles.list({"cursor": ID, "limit": 100}),
            {"cursor": [ID], "limit": ["100"]},
            None,
        ),
        ("GET", profile, lambda c: c.audience_profiles.retrieve(PHONE), {}, None),
        (
            "PUT",
            profile,
            lambda c: c.audience_profiles.put(
                PHONE, {"tags": [], "attributes": {"a": None, "b": False, "c": 0}}
            ),
            {},
            {"tags": [], "attributes": {"a": None, "b": False, "c": 0}},
        ),
        (
            "DELETE",
            profile,
            lambda c: c.audience_profiles.delete(PHONE, 1),
            {"expectedRevision": ["1"]},
            None,
        ),
        (
            "GET",
            profile + "/consent",
            lambda c: c.audience_profiles.list_consent(PHONE, {"limit": 1}),
            {"limit": ["1"]},
            None,
        ),
        (
            "POST",
            "/platform/audience-profile-imports",
            lambda c: c.audience_profiles.imports.create(
                {"replayKey": "actor:key", "csvBase64": "77u/cGhvbmUNCg=="}
            ),
            {},
            {"replayKey": "actor:key", "csvBase64": "77u/cGhvbmUNCg=="},
        ),
        (
            "GET",
            "/platform/audience-profile-imports/" + ID,
            lambda c: c.audience_profiles.imports.retrieve(ID),
            {},
            None,
        ),
        (
            "DELETE",
            "/platform/audience-profile-imports/" + ID,
            lambda c: c.audience_profiles.imports.cancel(ID),
            {},
            None,
        ),
        (
            "POST",
            "/platform/audiences/from-campaign",
            lambda c: c.audiences.create_from_campaign(
                {"name": "Retarget", "campaignId": ID, "outcome": "not_read"}
            ),
            {},
            {"name": "Retarget", "campaignId": ID, "outcome": "not_read"},
        ),
        ("GET", "/platform/campaign-settings", lambda c: c.campaigns.get_settings(), {}, None),
        (
            "GET",
            "/platform/optouts/confirmation-settings",
            lambda c: c.opt_outs.get_confirmation_settings(),
            {},
            None,
        ),
        (
            "PUT",
            "/platform/optouts/confirmation-settings",
            lambda c: c.opt_outs.update_confirmation_settings(
                {"teamId": PROJECT, "revision": 0, "enabled": False, "locale": None}
            ),
            {},
            {"teamId": PROJECT, "revision": 0, "enabled": False, "locale": None},
        ),
        (
            "GET",
            "/platform/optouts/confirmation-summary",
            lambda c: c.opt_outs.get_confirmation_summary(),
            {},
            None,
        ),
        ("GET", custody, lambda c: c.projects.get_signal_custody(PROJECT), {}, None),
        (
            "PUT",
            custody,
            lambda c: c.projects.update_signal_custody(
                PROJECT, {"expectedRevision": 0, "signalModeDefault": "zero_knowledge"}
            ),
            {},
            {"expectedRevision": 0, "signalModeDefault": "zero_knowledge"},
        ),
        ("GET", customer, lambda c: c.customers.get_signal_custody(ID, PROJECT), {}, None),
        (
            "PUT",
            customer,
            lambda c: c.customers.update_signal_custody(
                ID, PROJECT, {"expectedRevision": 0, "signalModeDefault": None}
            ),
            {},
            {"expectedRevision": 0, "signalModeDefault": None},
        ),
    ]
    for bound in (False, True):
        resource = lambda c, bound=bound: c.project(PROJECT).campaigns if bound else c.campaigns
        cases += [
            (
                "GET",
                reply + "/" + ID,
                lambda c, r=resource, b=bound: (
                    r(c).get_reply_flow(ID)
                    if b
                    else r(c).get_reply_flow(ID, {"projectId": PROJECT})
                ),
                {"projectId": [PROJECT]},
                None,
            ),
            (
                "POST",
                reply,
                lambda c, r=resource, b=bound: r(c).create_reply_flow(
                    FLOW if b else {**FLOW, "projectId": PROJECT}
                ),
                {},
                {**FLOW, "projectId": PROJECT},
            ),
            (
                "PUT",
                campaign + "/reply-flow",
                lambda c, r=resource, b=bound: r(c).set_reply_flow(
                    ID, {"replyFlowId": None} if b else {"replyFlowId": None, "projectId": PROJECT}
                ),
                {},
                {"replyFlowId": None, "projectId": PROJECT},
            ),
            (
                "POST",
                campaign + "/test-send",
                lambda c, r=resource, b=bound: r(c).test_send(
                    ID, TEST if b else {**TEST, "projectId": PROJECT}
                ),
                {},
                {**TEST, "projectId": PROJECT},
            ),
            (
                "GET",
                campaign + "/approvals",
                lambda c, r=resource, b=bound: (
                    r(c).list_launch_approvals(ID)
                    if b
                    else r(c).list_launch_approvals(ID, {"projectId": PROJECT})
                ),
                {"projectId": [PROJECT]},
                None,
            ),
            (
                "GET",
                campaign + "/links",
                lambda c, r=resource, b=bound: (
                    r(c).links(ID) if b else r(c).links(ID, {"projectId": PROJECT})
                ),
                {"projectId": [PROJECT]},
                None,
            ),
        ]
    return cases


CONTRACT = json.loads(
    (Path(__file__).resolve().parents[3] / "contracts/campaign-custody-20261014.json").read_text()
)


def schema_fixture(schema, schemas):
    if "$ref" in schema:
        return schema_fixture(schemas[schema["$ref"].rsplit("/", 1)[1]], schemas)
    if schema.get("nullable"):
        return None
    for union in ("oneOf", "anyOf"):
        if union in schema:
            return schema_fixture(schema[union][0], schemas)
    if "allOf" in schema:
        result = {}
        for part in schema["allOf"]:
            result.update(schema_fixture(part, schemas))
        return result
    if "enum" in schema:
        return schema["enum"][0]
    if schema.get("type") == "array":
        return [schema_fixture(schema["items"], schemas)]
    if schema.get("type") == "object" or "properties" in schema:
        return {
            key: schema_fixture(value, schemas)
            for key, value in schema.get("properties", {}).items()
        }
    if schema.get("type") in ("integer", "number"):
        return schema.get("minimum", 0)
    if schema.get("type") == "boolean":
        return False
    if schema.get("type") == "null":
        return None
    return ID if schema.get("format") == "uuid" else "fixture"


def response_fixture(method, path):
    for source in CONTRACT["sources"].values():
        for route, operations in source["paths"].items():
            if (
                re.fullmatch(re.sub(r"\{[^}]+\}", "[^/]+", route), path)
                and method.lower() in operations
            ):
                content = operations[method.lower()]["responses"]["200"]["content"]
                result = schema_fixture(
                    content["application/json"]["schema"], source["components"]["schemas"]
                )
                if "/campaign-reply-flows" in path:
                    result["data"]["definition"] = json.loads(json.dumps(FLOW["definition"]))
                return result
    raise AssertionError((method, path))


@pytest.mark.parametrize("method,path,invoke,query,body", route_cases())
async def test_all_non_csv_organization_and_bound_routes(method, path, invoke, query, body):
    payload = response_fixture(method, path)
    async with wire(payload) as (client, requests):
        result = await invoke(client)
        assert result.data == payload
        assert len(requests) == 1
        (actual_method, target), headers, captured = requests[0]
        assert actual_method == method
        assert urlsplit(target).path == path
        assert parse_qs(urlsplit(target).query) == query
        assert captured == body
        assert headers["polymorfa-version"] == "2026-10-14"
        assert ("idempotency-key" in headers) == path.endswith("/test-send")


@pytest.mark.parametrize(
    "operation",
    [
        "get_reply_flow",
        "create_reply_flow",
        "set_reply_flow",
        "test_send",
        "links",
        "export_recipients",
    ],
)
async def test_messaging_server_operations_refuse_client_before_http(operation):
    async with (
        wire() as (owner, requests),
        AsyncMessagingClient(
            Credential("client_token", "pmfa_ct_Zml4dHVyZQ"), base_url=owner._transport._base_url
        ) as client,
    ):
        args = {
            "get_reply_flow": ["slug", ID],
            "create_reply_flow": ["slug", FLOW],
            "set_reply_flow": ["slug", ID, {"replyFlowId": None}],
            "test_send": ["slug", ID, TEST],
            "links": ["slug", ID],
            "export_recipients": ["slug", ID],
        }[operation]
        with pytest.raises(ConfigurationError):
            await getattr(client.campaigns, operation)(*args)
    assert requests == []


@pytest.mark.parametrize(
    "operation,tail,body",
    [
        ("get_reply_flow", f"/campaign-reply-flows/{ID}", None),
        ("create_reply_flow", "/campaign-reply-flows", FLOW),
        ("set_reply_flow", f"/campaigns/{ID}/reply-flow", {"replyFlowId": None}),
        ("test_send", f"/campaigns/{ID}/test-send", TEST),
        ("links", f"/campaigns/{ID}/links", None),
    ],
)
async def test_messaging_routes_escape_slug_and_keep_envelope(operation, tail, body):
    payload = response_fixture(
        "POST"
        if body is not None and operation != "set_reply_flow"
        else "PUT"
        if operation == "set_reply_flow"
        else "GET",
        "/messaging/projects/slug" + tail,
    )
    async with wire(payload) as (owner, requests):
        async with AsyncMessagingClient(
            Credential(
                "project_token",
                "pmfa_pt_AAECAwQFBgcICQoLDA0ODxAREhM73f-k",
            ),
            base_url=owner._transport._base_url,
        ) as client:
            args = (
                ["slug/+"]
                + ([ID] if operation != "create_reply_flow" else [])
                + ([body] if body is not None else [])
            )
            result = await getattr(client.campaigns, operation)(*args)
            assert result.data == payload
        assert requests[0][0][1] == "/messaging/projects/slug%2F%2B" + tail
        assert requests[0][2] == body


@pytest.mark.parametrize("resource", ["organization", "project", "messaging"])
async def test_csv_is_one_exact_page_and_keeps_safe_metadata(resource):
    csv = '\ufeffphone,note\r\n+15551234567,"one\r\ntwo"\r\n'
    async with wire(
        headers={
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": "attachment; filename*=UTF-8''recipients%20one.csv",
            "Polymorfa-Next-Cursor": "next",
            "X-Trace-ID": "trace",
            "Idempotent-Replayed": "false",
            "Set-Cookie": "secret",
        },
        raw=csv.encode(),
    ) as (client, requests):
        if resource == "organization":
            result = await client.campaigns.export_recipients(
                ID, {"projectId": PROJECT, "limit": 1}
            )
        elif resource == "project":
            result = await client.project(PROJECT).campaigns.export_recipients(ID, {"limit": 1})
        else:
            async with AsyncMessagingClient(
                Credential(
                    "project_token",
                    "pmfa_pt_AAECAwQFBgcICQoLDA0ODxAREhM73f-k",
                ),
                base_url=client._transport._base_url,
            ) as messaging:
                result = await messaging.campaigns.export_recipients("slug", ID, {"limit": 1})
        assert result.data == {"csv": csv, "nextCursor": "next", "filename": "recipients one.csv"}
        assert result.metadata.headers["x-trace-id"] == "trace"
        assert result.metadata.headers["idempotent-replayed"] == "false"
        assert "set-cookie" not in result.metadata.headers
        assert len(requests) == 1
        assert requests[0][1]["accept"] == "text/csv"


@pytest.mark.parametrize(
    "status,content_type", [(204, "text/csv"), (200, "text/html"), (302, "text/csv")]
)
async def test_csv_refuses_wrong_status_content_and_redirect(status, content_type):
    async with wire(
        status=status, headers={"Content-Type": content_type, "Location": "/other"}, raw=b""
    ) as (client, requests):
        with pytest.raises(ServerError) as failure:
            await client.project(PROJECT).campaigns.export_recipients(ID)
        assert failure.value.status == status
        assert failure.value.metadata.status == status
        assert failure.value.code == "invalid_response"
        assert len(requests) == 1


async def test_bound_resources_are_immutable_and_expose_no_organization_operations():
    async with wire(
        {"data": {"signalModeDefault": None, "effectiveSignalMode": "standard", "revision": 0}}
    ) as (client, requests):
        bound = client.project(PROJECT)
        for resource in (bound, bound.campaigns, bound.signal_custody):
            with pytest.raises(FrozenInstanceError):
                resource._project_id = ID
        assert not hasattr(bound, "audience_profiles") and not hasattr(bound, "opt_outs")
        assert not hasattr(bound.campaigns, "get_settings") and not hasattr(
            bound.campaigns, "create_from_campaign"
        )
        assert not hasattr(bound.campaigns, "create")
        with pytest.raises(ConfigurationError):
            bound.project(ID)
        assert (await bound.signal_custody.retrieve()).data["revision"] == 0
        await bound.signal_custody.update({"expectedRevision": 0, "signalModeDefault": "standard"})
        await bound.signal_custody.retrieve_customer(ID)
        await bound.signal_custody.update_customer(
            ID, {"expectedRevision": 0, "signalModeDefault": None}
        )
        assert len(requests) == 4
        assert requests[3][2]["signalModeDefault"] is None


@pytest.mark.parametrize(
    "invoke",
    [
        lambda c: c.audience_profiles.put(PHONE, {"tags": [], "attributes": {}, "unknown": 1}),
        lambda c: c.audience_profiles.put(
            PHONE, {"tags": [], "attributes": {}, "expectedRevision": True}
        ),
        lambda c: c.audience_profiles.put(PHONE, {"tags": ["a", "a"], "attributes": {}}),
        lambda c: c.audience_profiles.put(PHONE, {"tags": ["a\x7f"], "attributes": {}}),
        lambda c: c.audience_profiles.put(PHONE, {"tags": [], "attributes": {"a": float("nan")}}),
        lambda c: c.audience_profiles.put(PHONE, {"tags": [], "attributes": {"a": 10**1000}}),
        lambda c: c.audience_profiles.put(PHONE, {"tags": [], "attributes": {"a": []}}),
        lambda c: c.audience_profiles.put(PHONE, {"tags": [], "attributes": {"a": "\0"}}),
        lambda c: c.audience_profiles.put(
            PHONE, {"tags": [], "attributes": {}, "provenance": None}
        ),
        lambda c: c.audience_profiles.put(
            PHONE,
            {
                "tags": [],
                "attributes": {},
                "consent": {
                    "source": "api",
                    "reference": "ref",
                    "allowed": 0,
                    "assertedAt": 0,
                    "purpose": "campaigns",
                },
            },
        ),
        lambda c: c.audience_profiles.retrieve("+١5551234567"),
        lambda c: c.audience_profiles.delete(PHONE, False),
        lambda c: c.audience_profiles.list({"limit": True}),
        lambda c: c.audience_profiles.list({"cursor": ""}),
        lambda c: c.audience_profiles.imports.create({"replayKey": "ok", "csvBase64": "Zh=="}),
        lambda c: c.audience_profiles.imports.create({"replayKey": "ok", "csvBase64": "YQA="}),
        lambda c: c.audience_profiles.imports.create({"replayKey": "ok", "csvBase64": "/w=="}),
        lambda c: c.audience_profiles.imports.create({"replayKey": "ok", "csvBase64": "YQ==\n"}),
        lambda c: c.audience_profiles.imports.create(
            {"replayKey": "ok", "csvBase64": "YQ==", "mapping": None}
        ),
        lambda c: c.audience_profiles.imports.create(
            {
                "replayKey": "ok",
                "csvBase64": "YQ==",
                "mapping": {"phone": "p", "tags": "p", "attributes": "a"},
            }
        ),
        lambda c: c.audience_profiles.imports.create(
            {
                "replayKey": "ok",
                "csvBase64": "YQ==",
                "mapping": {"phone": "\ufeffp", "tags": "t", "attributes": "a"},
            }
        ),
        lambda c: c.audience_profiles.imports.create(
            {
                "replayKey": "ok",
                "csvBase64": "YQ==",
                "mapping": {"phone": "p\u0085", "tags": "t", "attributes": "a"},
            }
        ),
        lambda c: c.audiences.create_from_campaign(
            {"name": "\ufeff", "campaignId": ID, "outcome": "read"}
        ),
        lambda c: c.projects.update_signal_custody(
            PROJECT, {"expectedRevision": 0, "signalModeDefault": None}
        ),
        lambda c: c.customers.update_signal_custody(
            ID, PROJECT, {"expectedRevision": False, "signalModeDefault": None}
        ),
        lambda c: c.opt_outs.update_confirmation_settings(
            {"teamId": PROJECT, "revision": 0, "enabled": True, "locale": None}
        ),
        lambda c: c.opt_outs.update_confirmation_settings(
            {"teamId": PROJECT, "revision": 0, "enabled": 1, "locale": "en"}
        ),
        lambda c: c.project(PROJECT).campaigns.create_reply_flow({**FLOW, "projectId": ID}),
        lambda c: c.project(PROJECT).campaigns.create_reply_flow({**FLOW, "name": "é" * 65}),
        lambda c: c.project(PROJECT).campaigns.create_reply_flow({**FLOW, "revision": True}),
        lambda c: c.project(PROJECT).campaigns.set_reply_flow(ID, {}),
        lambda c: c.project(PROJECT).campaigns.test_send(
            ID, {**TEST, "variables": {"a": "😀" * 513}}
        ),
        lambda c: c.project(PROJECT).campaigns.test_send(
            ID, {**TEST, "variables": {"a": float("inf")}}
        ),
        lambda c: c.project(PROJECT).campaigns.test_send(
            ID, {**TEST, "variables": {"a": 10**1000}}
        ),
        lambda c: c.project(PROJECT).campaigns.export_recipients(
            ID, {"status": "sent", "limit": 1}
        ),
        lambda c: c.project(PROJECT).campaigns.export_recipients(
            ID, {"reason": "other", "cursor": ID}
        ),
    ],
)
async def test_invalid_inputs_refuse_before_http(invoke):
    async with wire() as (client, requests):
        with pytest.raises(ValidationError):
            await invoke(client)
        assert requests == []


@pytest.mark.parametrize("change", ["missing", "wrong", "optional_null", "success_false"])
async def test_invalid_response_shapes_fail_without_outbound_revalidation(change):
    payload = response_fixture("GET", "/messaging/projects/slug/campaign-reply-flows/" + ID)
    if change == "missing":
        del payload["data"]["createdAt"]
    elif change == "wrong":
        payload["data"]["revision"] = True
    elif change == "optional_null":
        payload["data"]["definition"]["nodes"][1]["send"]["footer"] = None
    else:
        payload["success"] = False
    async with wire(payload) as (owner, requests):
        async with AsyncMessagingClient(
            Credential(
                "project_token",
                "pmfa_pt_AAECAwQFBgcICQoLDA0ODxAREhM73f-k",
            ),
            base_url=owner._transport._base_url,
        ) as client:
            with pytest.raises(ServerError) as failure:
                await client.campaigns.get_reply_flow("slug", ID)
            assert failure.value.code == "invalid_response"
            assert failure.value.metadata.status == 200
        assert len(requests) == 1


async def test_normalized_keyword_response_and_utf16_request_limits():
    payload = response_fixture("POST", "/platform/campaign-reply-flows")
    payload["data"]["definition"]["nodes"][0]["edges"][0]["match"]["value"] = "i\u0307" * 32
    payload["data"]["future"] = {"kept": True}
    flow = json.loads(json.dumps(FLOW))
    flow["definition"]["nodes"][0]["edges"][0]["match"]["value"] = "İ" * 32
    async with wire(payload) as (client, requests):
        result = await client.project(PROJECT).campaigns.create_reply_flow(flow)
        assert result.data == payload
        assert requests[0][2]["definition"] == flow["definition"]
    result_payload = response_fixture("POST", "/platform/campaigns/" + ID + "/test-send")
    async with wire(result_payload) as (client, requests):
        await client.project(PROJECT).campaigns.test_send(
            ID, {**TEST, "variables": {"emoji": "😀" * 512}}
        )
        assert requests[0][2]["variables"]["emoji"] == "😀" * 512


async def test_test_send_retries_capture_one_key_body_project_and_version():
    payload = response_fixture("POST", "/platform/campaigns/" + ID + "/test-send")
    body = json.loads(json.dumps(TEST))
    async with wire(
        responses=[
            (503, {"error": {"code": "future_unavailable", "message": "later"}}),
            (200, payload),
        ],
        headers={"Retry-After": "0"},
        on_request=lambda attempt: body["variables"].update({"a": 999}) if attempt == 1 else None,
    ) as (client, requests):
        result = await client.project(PROJECT).campaigns.test_send(
            ID,
            body,
            options=RequestOptions(
                api_version="2027-01-01", max_network_retries=1, idempotency_key="same"
            ),
        )
        assert result.data == payload
        assert len(requests) == 2
        assert requests[0][2] == requests[1][2] == {**TEST, "projectId": PROJECT}
        assert [r[1]["idempotency-key"] for r in requests] == ["same", "same"]
        assert [r[1]["polymorfa-version"] for r in requests] == ["2027-01-01"] * 2


async def test_unsafe_write_one_attempt_and_public_error_param():
    async with wire(
        status=409,
        payload={
            "error": {
                "code": "future_conflict",
                "message": "Changed",
                "param": "expectedRevision",
                "details": {"revision": 2},
            }
        },
        headers={"X-Request-ID": "req", "X-Trace-ID": "trace"},
    ) as (client, requests):
        from polymorfa import ConflictError

        with pytest.raises(ConflictError) as failure:
            await client.audience_profiles.put(
                PHONE,
                {"tags": [], "attributes": {}},
                options=RequestOptions(idempotency_key="caller"),
            )
        assert failure.value.param == "expectedRevision"
        assert failure.value.code == "future_conflict"
        assert failure.value.metadata.request_id == "req"
        assert failure.value.details == {"revision": 2}
        assert len(requests) == 1
    async with wire(
        status=503,
        payload={"error": {"code": "outage", "message": "Later"}},
        headers={"Retry-After": "0"},
    ) as (client, requests):
        with pytest.raises(ServerError):
            await client.audience_profiles.put(
                PHONE,
                {"tags": [], "attributes": {}},
                options=RequestOptions(idempotency_key="caller"),
            )
        assert len(requests) == 1


async def test_global_version_unchanged_and_new_method_explicit_version_kept():
    async with wire(
        responses=[
            (200, {"data": []}),
            (200, {"data": [], "page": {"hasMore": False, "nextCursor": None}}),
        ]
    ) as (client, requests):
        await client.projects.list()
        await client.audience_profiles.list(options=RequestOptions(api_version="2027-01-01"))
        assert [r[1]["polymorfa-version"] for r in requests] == ["2026-09-22", "2027-01-01"]


async def test_cancelling_csv_body_wait_settles_request_and_does_not_fetch_next_page():
    entered = asyncio.Event()
    release = asyncio.Event()
    completed = asyncio.Event()
    requests = []

    async def serve(reader, writer):
        try:
            requests.append(await reader.readuntil(b"\r\n\r\n"))
            writer.write(
                b"HTTP/1.1 200 OK\r\nContent-Type: text/csv\r\nContent-Length: 1000\r\nPolymorfa-Next-Cursor: next\r\nConnection: close\r\n\r\nphone,"
            )
            await writer.drain()
            entered.set()
            await release.wait()
        finally:
            writer.close()
            await writer.wait_closed()
            completed.set()

    server = await asyncio.start_server(serve, "127.0.0.1", 0)
    try:
        async with (
            AsyncClient(
                Credential(
                    "organization_api_key",
                    "pmfa_AAECAwQFBgcICQoLDA0ODxAREhM73f-k",
                ),
                base_url=f"http://127.0.0.1:{server.sockets[0].getsockname()[1]}",
            ) as client,
        ):
            waiter = asyncio.create_task(client.project(PROJECT).campaigns.export_recipients(ID))
            await asyncio.wait_for(entered.wait(), 2)
            waiter.cancel()
            with pytest.raises(asyncio.CancelledError):
                await waiter
            assert len(requests) == 1
    finally:
        release.set()
        await asyncio.wait_for(completed.wait(), 2)
        server.close()
        await server.wait_closed()


async def test_cancelling_import_wait_is_not_a_durable_cancel():
    entered = asyncio.Event()
    release = asyncio.Event()
    completed = asyncio.Event()
    requests = []

    async def serve(reader, writer):
        try:
            head = await reader.readuntil(b"\r\n\r\n")
            requests.append(head.split(b"\r\n")[0])
            entered.set()
            await release.wait()
        finally:
            writer.close()
            await writer.wait_closed()
            completed.set()

    server = await asyncio.start_server(serve, "127.0.0.1", 0)
    try:
        async with (
            AsyncClient(
                Credential(
                    "organization_api_key",
                    "pmfa_AAECAwQFBgcICQoLDA0ODxAREhM73f-k",
                ),
                base_url=f"http://127.0.0.1:{server.sockets[0].getsockname()[1]}",
            ) as client,
        ):
            waiter = asyncio.create_task(
                client.audience_profiles.imports.create(
                    {"replayKey": "retained", "csvBase64": "YQ=="}
                )
            )
            await asyncio.wait_for(entered.wait(), 2)
            waiter.cancel()
            with pytest.raises(asyncio.CancelledError):
                await waiter
            assert requests == [b"POST /platform/audience-profile-imports HTTP/1.1"]
    finally:
        release.set()
        await asyncio.wait_for(completed.wait(), 2)
        server.close()
        await server.wait_closed()


async def test_profile_semantic_json_byte_limit_uses_producer_number_spelling():
    # Eighty bytes separate 1.0 from 1 across a twenty-attribute producer payload.
    # Each string stays within 256 bytes; supplementary chars and escaping count
    # as producer UTF-8, rather than Python's default ASCII escape expansion.
    attrs = {f"a{i}": "é" * 128 for i in range(19)}
    attrs["last"] = 1.0
    payload = response_fixture("PUT", "/platform/audience-profiles/%2B15551234567")
    async with wire(payload) as (client, requests):
        await client.audience_profiles.put(PHONE, {"tags": [], "attributes": attrs})
        assert requests[0][2]["attributes"] == attrs


@pytest.mark.parametrize(
    "number,expected",
    [
        (1.0, "1"),
        (-0.0, "0"),
        (1e20, "100000000000000000000"),
        (1e21, "1e+21"),
        (1e-6, "0.000001"),
        (1e-7, "1e-7"),
        (1000000000000000100, "1000000000000000100"),
    ],
)
def test_campaign_semantic_number_sizes(number, expected):
    from polymorfa.campaign_contract_validation import compact

    assert compact({"value": number}) == ('{"value":' + expected + "}").encode()


async def test_exact_8192_byte_profile_attribute_quota_keeps_integer_float_semantics():
    attrs = {f"a{i}": "\x01" * 69 for i in range(19)}
    attrs["number"] = 1.0
    # All scalar strings fit 256 UTF-8 bytes. JSON escaping consumes the quota.
    serialized = json.dumps(attrs, ensure_ascii=False, separators=(",", ":")).replace(
        '"number":1.0', '"number":1'
    )
    attrs["a0"] += "a" * (8192 - len(serialized.encode()))
    assert len(attrs["a0"].encode()) <= 256
    payload = response_fixture("PUT", "/platform/audience-profiles/%2B15551234567")
    async with wire(payload) as (client, requests):
        await client.audience_profiles.put(PHONE, {"tags": [], "attributes": attrs})
        assert len(requests) == 1
        attrs["a0"] += "a"
        with pytest.raises(ValidationError):
            await client.audience_profiles.put(PHONE, {"tags": [], "attributes": attrs})
        assert len(requests) == 1


@pytest.mark.parametrize(
    "payload",
    [
        None,
        {"data": None},
        {"data": [], "page": None},
        {"data": [], "page": {"nextCursor": None}},
        {"data": [{"id": ID}], "page": {"hasMore": False, "nextCursor": None}},
    ],
)
async def test_profile_page_refuses_missing_required_and_null_shapes(payload):
    async with wire(raw=json.dumps(payload).encode()) as (client, requests):
        with pytest.raises(ServerError) as failure:
            await client.audience_profiles.list()
        assert failure.value.code == "invalid_response"
        assert failure.value.metadata.status == 200
        assert len(requests) == 1


async def test_huge_numeric_response_is_safe_invalid_response():
    payload = response_fixture("GET", "/platform/audience-profiles/%2B15551234567")
    payload["data"]["attributes"] = {"huge": 10**1000}
    async with wire(payload) as (client, requests):
        with pytest.raises(ServerError) as failure:
            await client.audience_profiles.retrieve(PHONE)
        assert failure.value.code == "invalid_response"
        assert len(requests) == 1


async def test_unhashable_reply_send_discriminant_is_validation_error_before_http():
    flow = json.loads(json.dumps(FLOW))
    flow["definition"]["nodes"][1]["send"]["kind"] = []
    async with wire() as (client, requests):
        with pytest.raises(ValidationError):
            await client.project(PROJECT).campaigns.create_reply_flow(flow)
        assert requests == []


async def test_profile_read_retries_capture_query_before_caller_mutation():
    query = {"cursor": ID, "limit": 1}
    payload = {"data": [], "page": {"nextCursor": None, "hasMore": False}}
    async with wire(
        responses=[(503, {"error": {"message": "later"}}), (200, payload)],
        headers={"Retry-After": "0"},
        on_request=lambda attempt: (
            query.update({"cursor": PROJECT, "limit": 100}) if attempt == 1 else None
        ),
    ) as (client, requests):
        assert (
            await client.audience_profiles.list(
                query, options=RequestOptions(max_network_retries=1)
            )
        ).data == payload
        assert len(requests) == 2
        assert (
            requests[0][0][1]
            == requests[1][0][1]
            == f"/platform/audience-profiles?cursor={ID}&limit=1"
        )


@pytest.mark.parametrize(
    "invoke",
    [
        lambda c: c.projects.update_signal_custody(PROJECT, None),
        lambda c: c.customers.update_signal_custody(ID, PROJECT, None),
        lambda c: c.customers.get_signal_custody(None, PROJECT),
        lambda c: c.customers.update_signal_custody(
            None, PROJECT, {"expectedRevision": 0, "signalModeDefault": None}
        ),
    ],
)
async def test_org_custody_null_body_or_selector_never_becomes_project_read(invoke):
    async with wire() as (client, requests):
        with pytest.raises(ValidationError):
            await invoke(client)
        assert requests == []
