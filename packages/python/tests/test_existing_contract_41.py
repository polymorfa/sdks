"""Independent public TCP regressions against API f97 / TypeScript 52f10de."""

from contextlib import asynccontextmanager

import pytest
from aiohttp import web

from polymorfa import (
    AsyncMessagingClient,
    ConfigurationError,
    Credential,
    ServerError,
    ValidationError,
)

PROJECT = "11111111-1111-4111-8111-111111111111"
ID = "22222222-2222-4222-8222-222222222222"
KEY = Credential(
    "organization_api_key",
    "pmfa_AAECAwQFBgcICQoLDA0ODxAREhM73f-k",
)
CLIENT = Credential("client_token", "pmfa_ct_Zml4dHVyZQ")


@asynccontextmanager
async def server(payload=None, *, status=200, on_request=None):
    calls = []

    async def handler(request):
        raw = await request.read()
        calls.append(
            (
                request.method,
                request.raw_path,
                {key.lower(): value for key, value in request.headers.items()},
                raw,
            )
        )
        if on_request:
            result = on_request(request, raw, len(calls))
            if result is not None:
                return result
        return web.json_response(
            payload if payload is not None else {"data": {}},
            status=status,
            headers={
                "x-request-id": "req_41",
                "x-trace-id": "trace_41",
                "Idempotent-Replayed": "true",
                "set-cookie": "secret=hidden",
            },
        )

    app = web.Application()
    app.router.add_route("*", "/{path:.*}", handler)
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "127.0.0.1", 0)
    await site.start()
    try:
        yield f"http://127.0.0.1:{site._server.sockets[0].getsockname()[1]}", calls
    finally:
        await runner.cleanup()


@pytest.mark.parametrize(
    "result",
    [
        {"data": {"requestId": "x", "status": "requested"}},
        {"success": False, "data": {"requestId": "x", "status": "requested"}},
        {"success": True, "data": {"requestId": "", "status": "requested"}},
        {"success": True, "data": {"requestId": "x", "status": "wrong"}},
    ],
)
async def test_retry_requires_acknowledgement(result):
    async with server(result) as (url, calls), AsyncMessagingClient(KEY, base_url=url) as client:
        with pytest.raises(ServerError) as caught:
            await client.history_sync.request_chunk_retry(
                "a/b", {"syncType": "RECENT", "chunkOrder": 0}
            )
        assert caught.value.code == "invalid_response"
        assert caught.value.metadata.request_id == "req_41"
        assert len(calls) == 1


async def test_client_direct_refusal_precedes_source_reading():
    reads = []

    async def source():
        reads.append(1)
        yield b"private"

    async with server() as (url, calls), AsyncMessagingClient(CLIENT, base_url=url) as client:
        with pytest.raises(ConfigurationError):
            await client.whatsapp_media.upload(
                "s", source, media_type="image", mimetype="image/jpeg", egress="direct"
            )
        with pytest.raises(ConfigurationError):
            client.whatsapp_media.transport("direct")
        assert reads == calls == []


@pytest.mark.parametrize(
    "body",
    [
        {"variableMapping": {"x": {"source": None}}},
        {"variableMapping": {"bad key": {}}},
        {"variableMapping": {"x": {"fallback": "\ufeff"}}},
        {"followUp": {"delaySeconds": 604800, "message": {"type": "text", "text": "x"}}},
        {
            "trackedLinks": [
                {"key": "a", "url": "https://example.com"},
                {"key": "a", "url": "https://example.com/x"},
            ]
        },
    ],
)
async def test_invalid_campaign_named_fields_do_not_send(body):
    async with server() as (url, calls), AsyncMessagingClient(KEY, base_url=url) as client:
        with pytest.raises(ValidationError):
            await client.campaigns.update("p", ID, body)
        assert calls == []


@pytest.mark.parametrize("version", [None, "2026-08-01", "2026-10-14"])
async def test_independent_campaign_returns_and_requests(version):
    import json

    from polymorfa import AsyncClient, RequestOptions
    from polymorfa.campaign_models import (
        CampaignMessage,
        CampaignMessageButton,
        CampaignMessageMedia,
    )

    campaign = {
        "id": ID,
        "name": "Independent",
        "status": "draft",
        "templateId": None,
        "recipientListId": None,
        "recipientCount": 0,
        "sentCount": 0,
        "deliveredCount": 0,
        "readCount": 0,
        "failedCount": 0,
        "skippedCount": 0,
        "scheduledAt": None,
        "launchedAt": None,
        "completedAt": None,
        "createdAt": 0,
        "updatedAt": 0,
        "sendWindow": None,
        "trackedLinks": [],
        "experimentOutcome": None,
        "followUp": None,
        "variableMapping": None,
    }
    followups = dict.fromkeys(
        (
            "total",
            "waiting",
            "scheduled",
            "sending",
            "sent",
            "delivered",
            "read",
            "replied",
            "cancelled",
            "expired",
            "failed",
            "unknown",
        ),
        0,
    ) | {"nextDueAt": None}
    analytics = {
        "campaignId": ID,
        "recipientCount": 0,
        "sentCount": 0,
        "deliveredCount": 0,
        "readCount": 0,
        "failedCount": 0,
        "skippedCount": 0,
        "respondedCount": 0,
        "responseRate": 0,
        "averageResponseTimeMs": None,
        "minResponseTimeMs": 0,
        "maxResponseTimeMs": None,
        "experiment": None,
        "followUps": followups,
    }
    recipient = {
        "id": ID,
        "phone": "+15551234567",
        "variables": {},
        "variantKey": None,
        "status": "failed",
        "attempts": 0,
        "lastError": "missing_variable",
        "failureReason": "missing_variable",
        "messagesSent": 0,
        "nextMessageAt": None,
        "sequenceError": None,
        "externalMessageId": "9999999999999999999",
        "queuedAt": 0,
        "sentAt": None,
        "deliveredAt": None,
        "readAt": None,
        "failedAt": None,
        "respondedAt": None,
        "followUp": None,
    }

    def respond(request, raw, count):
        path = request.path
        data = (
            analytics
            if path.endswith("/analytics")
            else [recipient | {"nextMessageAt": 0.5 if path.startswith("/messaging") else 0}]
            if path.endswith("/recipients")
            else [campaign]
            if request.method == "GET" and path.endswith("/campaigns")
            else campaign | {"operationId": None if path.endswith("/stop") else "operation"}
        )
        return web.json_response(
            {
                **({"success": True} if path.startswith("/messaging") else {}),
                "data": data,
                **(
                    {"page": {"nextCursor": None, "hasMore": False}}
                    if path.endswith("/recipients")
                    else {}
                ),
            }
        )

    async with (
        server(on_request=respond) as (url, calls),
        AsyncClient(KEY, base_url=url) as c,
        AsyncMessagingClient(KEY, base_url=url) as m,
    ):
        o = RequestOptions(api_version=version)
        results = [
            await m.campaigns.list("p", options=o),
            await m.campaigns.retrieve("p", ID, options=o),
            await m.campaigns.create(
                "p",
                {
                    "name": "x",
                    "variableMapping": {
                        "0": {},
                        "__proto__": {"source": "a.b", "fallback": "Friend"},
                    },
                    "trackedLinks": [
                        {"key": "a", "url": "https://EXAMPLE.com"},
                        {"key": "b", "url": "https://EXAMPLE.com"},
                    ],
                },
                options=o,
            ),
            await m.campaigns.update("p", ID, {"templateId": None}, options=o),
            await m.campaigns.launch(
                "p", ID, {"skipMissingVariables": False, "scheduledAt": 0}, options=o
            ),
            await m.campaigns.pause("p", ID, options=o),
            await m.campaigns.reschedule("p", ID, {"scheduledAt": 0}, options=o),
            await m.campaigns.resume("p", ID, options=o),
            await m.campaigns.stop("p", ID, options=o),
            await c.campaigns.list({"projectId": PROJECT}, options=o),
            await c.campaigns.retrieve(ID, {"projectId": PROJECT}, options=o),
            await c.campaigns.update(
                ID,
                {"trackedLinks": None},
                {"projectId": PROJECT},
                options=o,
                extra_fields={"future": False},
            ),
            await c.campaigns.create(
                {
                    "projectId": PROJECT,
                    "name": "draft",
                    "messagesArray": [
                        {},
                        CampaignMessage(
                            {
                                "source": "x" * 4097,
                                "delayAfterSec": 0,
                                "media": CampaignMessageMedia(
                                    {"kind": "image", "url": ""}, extra_fields={"new": False}
                                ),
                                "buttons": [
                                    CampaignMessageButton(
                                        {"kind": "reply", "label": ""}, extra_fields={"new": 0}
                                    )
                                ],
                            },
                            extra_fields={"new": []},
                        ),
                    ],
                },
                options=o,
            ),
        ]
        for response in results:
            data = response.data["data"]
            value = data[0] if isinstance(data, list) else data
            assert {key: value[key] for key in campaign} == campaign
        for report in (
            await m.campaigns.analytics("p", ID, options=o),
            await c.campaigns.analytics(ID, {"projectId": PROJECT}, options=o),
        ):
            assert report.data["data"] == analytics
        query = {"reason": "missing_variable", "status": "failed", "cursor": "initial", "limit": 1}
        for page in (
            await m.campaigns.recipients("p", ID, query, options=o),
            await c.campaigns.recipients(ID, {**query, "projectId": PROJECT}, options=o),
        ):
            assert (
                page.items[0]["messagesSent"] == 0
                and page.items[0]["failureReason"] == "missing_variable"
            )
            assert page.items[0]["externalMessageId"] == "9999999999999999999"
        assert calls[-2][1].endswith("reason=missing_variable&status=failed&cursor=initial&limit=1")
        assert all(call[2]["polymorfa-version"] == (version or "2026-09-22") for call in calls)
        assert json.loads(calls[4][3]) == {"scheduledAt": 0, "skipMissingVariables": False}
        assert json.loads(calls[12][3])["messagesArray"][1]["media"]["new"] is False


@pytest.mark.parametrize("which", ["messaging", "platform", "audience", "members"])
async def test_replay_body_is_captured_before_first_http_await(which):
    import json

    from polymorfa import AsyncClient, RequestOptions

    body = (
        {"recipients": [{"phone": "+15551234567", "variables": {"name": "before"}}]}
        if which in ("messaging", "platform")
        else {"name": "before", "members": [{"phone": "+15551234567"}]}
        if which == "audience"
        else {"members": [{"phone": "+15551234567"}]}
    )
    if which == "platform":
        body["projectId"] = PROJECT
    original = json.loads(json.dumps(body))

    def respond(request, raw, count):
        if count == 1:
            if "recipients" in body:
                body["recipients"][0]["variables"]["name"] = "mutated"
            else:
                body["members"][0]["phone"] = "+15557654321"
            return web.json_response(
                {"error": {"code": "service_unavailable", "message": "retry"}},
                status=503,
                headers={"Retry-After": "0"},
            )
        return web.json_response(
            {"success": True, "data": {"added": 1}},
            headers={"Idempotent-Replayed": "true", "x-trace-id": "trace", "set-cookie": "private"},
        )

    async with (
        server(on_request=respond) as (url, calls),
        AsyncClient(KEY, base_url=url) as c,
        AsyncMessagingClient(KEY, base_url=url) as m,
    ):
        o = RequestOptions(idempotency_key="caller-stable", max_network_retries=1)
        response = await (
            m.campaigns.add_recipients("p", ID, body, options=o)
            if which == "messaging"
            else c.campaigns.add_recipients(ID, body, options=o)
            if which == "platform"
            else c.audiences.create(body, options=o)
            if which == "audience"
            else c.audiences.add_members(ID, body, options=o)
        )
        assert len(calls) == 2 and calls[0][3] == calls[1][3]
        assert json.loads(calls[1][3]) == original
        assert calls[0][2]["idempotency-key"] == calls[1][2]["idempotency-key"] == "caller-stable"
        assert response.metadata.headers["idempotent-replayed"] == "true"
        assert "set-cookie" not in response.metadata.headers


@pytest.mark.parametrize(
    "intent, expected",
    [
        ({}, "2026-09-22"),
        ({"signalMode": "standard"}, "2026-10-14"),
        ({"signalMode": "zero_knowledge"}, "2026-10-14"),
        (
            {"configuration": {"historySync": {"delivery": "descriptor", "consent": "force_off"}}},
            "2026-10-14",
        ),
        (
            {"purpose": "add_connection", "session": "s", "addConnection": "linked_devices"},
            "2026-09-22",
        ),
    ],
)
async def test_quicklink_intent_default_and_override(intent, expected):
    import json

    from polymorfa import RequestOptions

    async with (
        server({"success": True, "data": {"id": "link"}}) as (url, calls),
        AsyncMessagingClient(KEY, base_url=url) as client,
    ):
        await client.quick_links.create(intent)
        await client.quick_links.create(intent, options=RequestOptions(api_version="2026-08-01"))
        assert [c[2]["polymorfa-version"] for c in calls] == [expected, "2026-08-01"]
        assert json.loads(calls[0][3]) == json.loads(calls[1][3]) == intent


@pytest.mark.parametrize(
    "body",
    [
        {"purpose": "initial", "session": "s"},
        {"purpose": "add_connection", "session": "s"},
        {
            "purpose": "add_connection",
            "session": "s",
            "addConnection": "linked_devices",
            "signalMode": "standard",
        },
        {"configuration": {"historySync": {"delivery": "archive"}}},
        {"configuration": {"signalMode": "zero_knowledge"}},
        {"signalMode": None},
    ],
)
async def test_invalid_quicklink_branches_do_not_send(body):
    async with server() as (url, calls), AsyncMessagingClient(KEY, base_url=url) as client:
        with pytest.raises(ValidationError):
            await client.quick_links.create(body)
        assert calls == []


@pytest.mark.parametrize(
    "patch, version",
    [
        ({"set": {"historySync": {"delivery": "descriptor"}}}, "2026-10-14"),
        ({"reset": ["historySync.delivery"]}, "2026-10-14"),
        ({"reset": ["historySync"]}, "2026-09-22"),
        ({"set": {"historySync": {"requestFull": False}}}, "2026-09-22"),
    ],
)
async def test_configuration_defaults_and_session_update_versions(patch, version):
    import json

    from polymorfa import AsyncClient, RequestOptions

    body = {"configuration": patch, "revision": 0}
    async with (
        server({"success": True, "data": {"signalMode": "zero_knowledge"}}) as (url, calls),
        AsyncClient(KEY, base_url=url) as c,
        AsyncMessagingClient(KEY, base_url=url) as m,
    ):
        await c.project(PROJECT).session_configuration.update(body)
        await c.sessions.update("s", body)
        await m.sessions.update("s", body)
        await c.project(PROJECT).session_configuration.update(
            body, options=RequestOptions(api_version="2026-08-01")
        )
        await c.project(PROJECT).session_configuration.retrieve()
        await c.sessions.retrieve("s", options=RequestOptions(api_version="2026-10-14"))
        assert [call[2]["polymorfa-version"] for call in calls] == [version] * 3 + [
            "2026-08-01",
            "2026-09-22",
            "2026-10-14",
        ]
        assert json.loads(calls[0][3]) == {**body, "projectId": PROJECT}
        assert json.loads(calls[1][3]) == body


@pytest.mark.parametrize("version", [None, "2026-08-01"])
async def test_nine_group_testing_and_history_public_tcp(version):
    import base64
    import json

    from polymorfa import RequestOptions

    caps = {
        "status": "unknown",
        "syncedAt": None,
        "checkedAt": None,
        "capabilities": [
            {"key": "polls.endTime", "kind": "feature", "unit": None, "value": None, "source": None}
        ],
    }
    phone = {
        "session": "a/b",
        "phone": "+15551234567",
        "online": False,
        "devices": [{"deviceId": 99}],
    }

    def respond(request, raw, count):
        if request.path.endswith("/capabilities"):
            return web.json_response({"success": True, "data": caps})
        if request.path.endswith("/phone"):
            return web.json_response(phone)
        if request.path.endswith("/phone/messages"):
            return web.json_response(
                {"session": "a/b", "to": "+15557654321", "messageId": None}, status=202
            )
        if request.path.endswith("/unlink"):
            return web.json_response(
                {"session": "a/b", "deviceId": int(request.path.split("/")[-2]), "unlinked": True}
            )
        return web.json_response(
            {
                "success": True,
                "data": {"requestId": "retry_41", "status": "requested"}
                if request.path.endswith("/retry")
                else {"status": "deleted"},
            }
        )

    async with (
        server(on_request=respond) as (url, calls),
        AsyncMessagingClient(KEY, base_url=url) as c,
        AsyncMessagingClient(CLIENT, base_url=url) as scoped,
    ):
        o = RequestOptions(api_version=version)
        assert (await scoped.groups.get_capabilities("a/b", "g/1", options=o)).data["data"] == caps
        assert (await c.testing.get_phone("a/b", options=o)).data["online"] is False
        assert (
            await c.testing.send_phone_message(
                "a/b", {"to": "+15557654321", "text": "test"}, options=o
            )
        ).data["messageId"] is None
        for device in (1, 99):
            assert (await c.testing.unlink_phone_device("a/b", device, options=o)).data["unlinked"]
        for sync in (
            "INITIAL_BOOTSTRAP",
            "INITIAL_STATUS_V3",
            "FULL",
            "RECENT",
            "PUSH_NAME",
            "NON_BLOCKING_DATA",
            "ON_DEMAND",
        ):
            result = await c.history_sync.request_chunk_retry(
                "a/b", {"syncType": sync, "chunkOrder": 0, "regenerate": False}, options=o
            )
            assert result == {"requestId": "retry_41", "status": "requested"}
        await c.history_sync.request_chunk_retry(
            "a/b",
            {"syncType": "RECENT", "chunkOrder": 2**32 - 1, "chunkMessageId": "A:1._-"},
            options=o,
        )
        assert (
            await c.history_sync.delete_chunk(
                "a/b",
                {"directPath": "/media/a", "fileEncSha256": base64.b64encode(bytes(32)).decode()},
                options=o,
            )
            is None
        )
        assert calls[0][1] == "/messaging/a%2Fb/groups/g%2F1/capabilities"
        assert calls[1][1] == "/messaging/a%2Fb/phone"
        assert calls[1][3] == calls[3][3] == calls[4][3] == b""
        assert json.loads(calls[2][3]) == {"to": "+15557654321", "text": "test"}
        assert [x[2]["polymorfa-version"] for x in calls[:5]] == [version or "2026-09-22"] * 5
        assert [x[2]["polymorfa-version"] for x in calls[5:]] == [version or "2026-10-14"] * 9
        before = len(calls)
        for device in (0, 100, True):
            with pytest.raises(ValidationError):
                await c.testing.unlink_phone_device("s", device)
        for bad in (
            {"chunkMessageId": None},
            {"regenerate": None},
            {"chunkOrder": True},
            {"syncType": "future"},
        ):
            with pytest.raises(ConfigurationError):
                await c.history_sync.request_chunk_retry(
                    "s", {"syncType": "RECENT", "chunkOrder": 0} | bad
                )
        for action in (
            lambda: scoped.testing.get_phone("s"),
            lambda: scoped.history_sync.request_chunk_retry(
                "s", {"syncType": "RECENT", "chunkOrder": 0}
            ),
            lambda: scoped.history_sync.delete_chunk(
                "s", {"directPath": "/a", "fileEncSha256": base64.b64encode(bytes(32)).decode()}
            ),
        ):
            with pytest.raises(ConfigurationError):
                await action()
        assert len(calls) == before


@pytest.mark.parametrize("operation", ["group", "phone", "send", "unlink", "retry", "delete"])
@pytest.mark.parametrize(
    "bad", [{}, [], {"success": False, "data": {}}, {"success": True, "data": None}]
)
async def test_nine_malformed_success_is_safe(operation, bad):
    import base64

    async with server(bad) as (url, calls), AsyncMessagingClient(KEY, base_url=url) as c:
        with pytest.raises(ServerError) as caught:
            await (
                c.groups.get_capabilities("s", "g")
                if operation == "group"
                else c.testing.get_phone("s")
                if operation == "phone"
                else c.testing.send_phone_message("s", {"to": "t", "text": "x"})
                if operation == "send"
                else c.testing.unlink_phone_device("s", 1)
                if operation == "unlink"
                else c.history_sync.request_chunk_retry(
                    "s", {"syncType": "RECENT", "chunkOrder": 0}
                )
                if operation == "retry"
                else c.history_sync.delete_chunk(
                    "s", {"directPath": "/a", "fileEncSha256": base64.b64encode(bytes(32)).decode()}
                )
            )
        assert (
            caught.value.code == "invalid_response" and caught.value.metadata.request_id == "req_41"
        )
        assert len(calls) == 1
        assert "set-cookie" not in caught.value.metadata.headers


@pytest.mark.parametrize(
    "code,status",
    [
        ("campaign_approval_required", 409),
        ("campaign_approval_stale", 409),
        ("campaign_variables_missing", 422),
        ("zero_knowledge_session", 400),
        ("future_remote_error", 422),
    ],
)
async def test_safe_structured_error_and_unknown_codes(code, status):
    from polymorfa import PolymorfaError

    async with (
        server(
            {"error": {"code": code, "message": "Request refused", "param": "variableMapping"}},
            status=status,
        ) as (url, calls),
        AsyncMessagingClient(KEY, base_url=url) as c,
    ):
        with pytest.raises(PolymorfaError) as caught:
            await c.campaigns.launch("p", ID, {"skipMissingVariables": False})
        assert caught.value.code == code and caught.value.param == "variableMapping"
        assert caught.value.metadata.headers["x-trace-id"] == "trace_41"
        assert "set-cookie" not in caught.value.metadata.headers and "hidden" not in str(
            caught.value
        )
        assert len(calls) == 1


@pytest.mark.parametrize(
    "kind,wire_kind,ptt",
    [
        ("image", "image", None),
        ("video", "video", None),
        ("document", "file", None),
        ("audio", "voice", False),
        ("ptt", "voice", True),
        ("sticker", "sticker", None),
    ],
)
async def test_direct_and_scoped_client_relay_use_independent_ciphertext(kind, wire_kind, ptt):
    import base64
    import hashlib
    import json

    from test_media_streams import native_cdn

    from polymorfa import (
        DirectMediaApi,
        DirectUploadTransport,
        RequestOptions,
        prepare_whatsapp_upload,
    )
    from polymorfa.transport import Transport

    plain = b"Independent upload source 41"
    encrypted = await prepare_whatsapp_upload(plain, media_type=kind)
    raw_hash = base64.urlsafe_b64encode(encrypted.info.file_enc_sha256).rstrip(b"=").decode()
    provider_calls = []

    async def provider(request):
        raw = await request.read()
        provider_calls.append(raw)
        assert "authorization" not in request.headers and "polymorfa-version" not in request.headers
        assert hashlib.sha256(raw).digest() == encrypted.info.file_enc_sha256
        assert len(raw) == encrypted.info.encrypted_length == int(request.headers["Content-Length"])
        return web.json_response(
            {"direct_path": "/media/41", "url": "https://cdn.whatsapp.net/media/41"}
        )

    def respond(request, raw, count):
        if request.path.endswith("/upload-grants"):
            fields = json.loads(raw)
            assert fields == {
                "type": wire_kind,
                "fileEncSha256": raw_hash,
                **({"ptt": ptt} if ptt is not None else {}),
            }
            return web.json_response(
                {
                    "success": True,
                    "data": {
                        "uploadUrl": f"https://cdn.whatsapp.net/mms/{kind}/{raw_hash}?auth=fixture",
                        "host": "cdn.whatsapp.net",
                        "expiresAt": 1792000000,
                    },
                }
            )
        assert request.content_type == "application/octet-stream"
        assert request.query["type"] == wire_kind
        if ptt is not None:
            assert request.query["ptt"] == str(ptt).lower()
        assert (
            request.query["fileEncSha256"]
            == base64.urlsafe_b64encode(hashlib.sha256(raw).digest()).rstrip(b"=").decode()
        )
        assert len(raw) == int(request.headers["Content-Length"])
        assert request.headers["authorization"] == "Bearer " + CLIENT.value
        return web.json_response(
            {
                "success": True,
                "data": {"directPath": "/media/41", "url": "https://cdn.whatsapp.net/media/41"},
            }
        )

    async with native_cdn(provider) as (cdn, _), server(on_request=respond) as (url, calls):
        transport = Transport(KEY, base_url=url)
        try:
            api = DirectMediaApi(transport)
            grant = await api.create_upload_grant("s/1", encrypted.info)
            assert grant.expires_at == 1792000000
            uploader = DirectUploadTransport(api, http_transport=cdn)
            location = await uploader.upload(
                "s/1", encrypted, options=RequestOptions(api_version="2026-08-01")
            )
            assert location.direct_path == "/media/41" and len(provider_calls) == 1
        finally:
            await transport.close()
        async with AsyncMessagingClient(CLIENT, base_url=url) as client:
            result = await client.whatsapp_media.upload(
                "s/1", plain, media_type=kind, options=RequestOptions(api_version="2026-08-01")
            )
            assert result.file_length == len(plain)
        assert [c[2]["polymorfa-version"] for c in calls] == [
            "2026-10-14",
            "2026-08-01",
            "2026-08-01",
        ]


async def test_client_custom_ciphertext_transport_remains_available():
    from polymorfa import UploadLocation

    class Custom:
        name = "customer"

        async def upload(self, session, body, *, options):
            chunks = [chunk async for chunk in body.open()]
            assert b"".join(chunks) != b"private plaintext"
            return UploadLocation("/media/custom", "https://cdn.whatsapp.net/media/custom")

    async with server() as (url, calls), AsyncMessagingClient(CLIENT, base_url=url) as c:
        result = await c.whatsapp_media.upload(
            "s", b"private plaintext", media_type="image", egress=Custom()
        )
        assert result.egress == "customer" and calls == []


@pytest.mark.parametrize("animated", [False, True])
async def test_sticker_send_snapshot_and_string_identity(animated):
    import base64
    import json

    from polymorfa import RequestOptions

    descriptor = {
        "directPath": "/media/sticker",
        "mediaKey": base64.b64encode(bytes(32)).decode(),
        "fileSha256": base64.b64encode(bytes(32)).decode(),
        "fileEncSha256": base64.b64encode(bytes(32)).decode(),
        "fileLength": 1,
        "mimeType": "image/webp",
        "url": "https://mmg.whatsapp.net/media/sticker",
        "isAnimated": animated,
        "width": 1,
        "height": 65536,
    }
    body = {
        "conversation": {"id": "+15551234567"},
        "content": {"sticker": {"descriptor": descriptor}},
    }

    def respond(request, raw, count):
        if count == 1:
            descriptor["isAnimated"] = not animated
            body["conversation"]["id"] = "+15557654321"
            return web.json_response(
                {"error": {"code": "service_unavailable", "message": "retry"}},
                status=503,
                headers={"Retry-After": "0"},
            )
        return web.json_response({"success": True, "data": {"id": "9999999999999999999"}})

    async with (
        server(on_request=respond) as (url, calls),
        AsyncMessagingClient(KEY, base_url=url) as c,
    ):
        result = await c.messages.send(
            "s/1",
            body,
            options=RequestOptions(idempotency_key="sticker-stable", max_network_retries=1),
        )
        assert result.data["data"]["id"] == "9999999999999999999"
        assert calls[0][3] == calls[1][3]
        sent = json.loads(calls[1][3])
        assert sent["content"]["sticker"]["descriptor"]["isAnimated"] is animated
        assert calls[0][2]["polymorfa-version"] == "2026-10-14"
        await c.messages.send("s/1", body, options=RequestOptions(api_version="2026-08-01"))
        assert calls[-1][2]["polymorfa-version"] == "2026-08-01"
        for invalid in (
            {"url": "https://x.test"},
            {"base64": "aA=="},
            {"descriptor": descriptor, "caption": "no"},
            {"descriptor": {**descriptor, "mimeType": "image/png"}},
            {"descriptor": {**descriptor, "width": None}},
            {"descriptor": {**descriptor, "isAnimated": None}},
        ):
            with pytest.raises((ConfigurationError, ValidationError)):
                await c.messages.send(
                    "s", {"conversation": {"id": "x"}, "content": {"sticker": invalid}}
                )
        assert len(calls) == 3


async def test_whatsapp_analytics_reports_and_retained_owners_over_tcp():
    import copy

    from test_analytics import ANALYTICS
    from test_request_logs import ENTRY

    from polymorfa import AsyncClient, AsyncProjectClient, RequestOptions

    payload = copy.deepcopy(ANALYTICS)
    summary = payload["summary"]
    summary["measured"] = False
    summary["lastObservedAt"] = None
    summary["conversationBreakdown"].update(
        measured=False, complete=False, truncated=True, droppedConversations=3
    )
    summary.pop("recipientActivity", None)

    def respond(request, raw, count):
        if request.path.endswith("/request-logs"):
            return web.json_response(
                {
                    "data": [
                        {
                            **ENTRY,
                            "id": "9999999999999999999",
                            "traceId": None,
                            "projectId": request.path.split("/")[3],
                        }
                    ],
                    "page": {"nextCursor": None, "hasMore": False, "followCursor": "follow"},
                }
            )
        return web.json_response({"data": payload})

    other = "33333333-3333-4333-8333-333333333333"
    async with (
        server(on_request=respond) as (url, calls),
        AsyncClient(KEY, base_url=url) as c,
        AsyncProjectClient(
            Credential(
                "project_token",
                "pmfa_pt_AAECAwQFBgcICQoLDA0ODxAREhM73f-k",
            ),
            PROJECT,
            base_url=url,
        ) as project,
    ):
        a, b = c.project(PROJECT), c.project(other)
        for owner in (c, a, b, project):
            report = await owner.analytics.get(options=RequestOptions(api_version="2026-10-14"))
            assert report.data["summary"]["lastObservedAt"] is None
            assert report.data["summary"]["conversationBreakdown"]["droppedConversations"] == 3
            assert "recipientActivity" not in report.data["summary"]
        for owner in (a, b, project):
            page = await owner.request_logs.list(
                {"traceId": "trace"}, limit=1, options=RequestOptions(api_version="2026-10-14")
            )
            assert page.items[0]["id"] == "9999999999999999999" and page.items[0]["traceId"] is None
        assert calls[4][1].startswith(f"/platform/projects/{PROJECT}/request-logs")
        assert calls[5][1].startswith(f"/platform/projects/{other}/request-logs")
        before = len(calls)
        for action in (
            lambda: c.request_logs.list(),
            lambda: a.request_logs.list(project_id=other),
            lambda: project.analytics.get({"projectId": other}),
        ):
            with pytest.raises((ConfigurationError, ValidationError)):
                await action()
        assert calls[6][2]["polymorfa-version"] == "2026-10-14" and len(calls) == before


@pytest.mark.parametrize("operation", ["messaging", "platform", "audience", "members", "phone"])
async def test_no_key_uncertain_writes_are_once(operation):
    from polymorfa import AsyncClient

    async with (
        server(
            {"error": {"code": "service_unavailable", "message": "unavailable"}}, status=503
        ) as (url, calls),
        AsyncClient(KEY, base_url=url) as c,
        AsyncMessagingClient(KEY, base_url=url) as m,
    ):
        with pytest.raises(ServerError):
            await (
                m.campaigns.add_recipients("p", ID, {"recipients": []})
                if operation == "messaging"
                else c.campaigns.add_recipients(ID, {"projectId": PROJECT, "recipients": []})
                if operation == "platform"
                else c.audiences.create({"name": "x"})
                if operation == "audience"
                else c.audiences.add_members(ID, {"members": []})
                if operation == "members"
                else m.testing.send_phone_message("s", {"to": "t", "text": "x"})
            )
        assert len(calls) == 1 and "idempotency-key" not in calls[0][2]


async def test_open_extensions_and_configuration_cannot_replace_authority():
    from polymorfa import AsyncClient
    from polymorfa.campaign_models import (
        CampaignMessage,
        CampaignMessageButton,
        CampaignMessageMedia,
    )

    for constructor, fields, key in (
        (CampaignMessage, {}, "delayAfterSec"),
        (CampaignMessageMedia, {"kind": "image", "url": ""}, "url"),
        (CampaignMessageButton, {"kind": "reply", "label": ""}, "label"),
    ):
        with pytest.raises(ValidationError):
            constructor(fields, extra_fields={key: "bypass"})
    async with server() as (url, calls), AsyncClient(KEY, base_url=url) as c:
        for extra in (
            {"projectId": PROJECT},
            {"path": "/wrong"},
            {"messagesArray": []},
            {"variableMapping": None},
        ):
            with pytest.raises(ValidationError):
                await c.campaigns.update(ID, None, {"projectId": PROJECT}, extra_fields=extra)
        for configuration in (
            {"signalMode": "standard"},
            {"set": {"signalMode": "standard"}},
            {"set": {"historySync": {"delivery": "archive"}}},
            {"set": {"historySync": {"delivery": None}}},
            {"reset": ["signalMode"]},
        ):
            with pytest.raises(ValidationError):
                await c.sessions.update("s", {"revision": 0, "configuration": configuration})
        assert calls == []


@pytest.mark.parametrize(
    "operation", ["group", "phone", "send", "unlink", "logs", "grant", "relay", "retry", "delete"]
)
async def test_nine_cancellation_keeps_cancelled_error(operation):
    import asyncio
    import base64

    from polymorfa import AsyncClient, DirectMediaApi, prepare_whatsapp_upload
    from polymorfa.transport import Transport

    reached, release = asyncio.Event(), asyncio.Event()
    app = web.Application()

    async def hold(request):
        await request.read()
        reached.set()
        await release.wait()
        return web.json_response({"success": True, "data": {}})

    app.router.add_route("*", "/{path:.*}", hold)
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "127.0.0.1", 0)
    await site.start()
    url = f"http://127.0.0.1:{site._server.sockets[0].getsockname()[1]}"
    transport = Transport(KEY, base_url=url)
    try:
        async with (
            AsyncClient(KEY, base_url=url) as c,
            AsyncMessagingClient(KEY, base_url=url) as m,
        ):
            encrypted = await prepare_whatsapp_upload(b"source", media_type="image")
            action = (
                m.groups.get_capabilities("s", "g")
                if operation == "group"
                else m.testing.get_phone("s")
                if operation == "phone"
                else m.testing.send_phone_message("s", {"to": "t", "text": "x"})
                if operation == "send"
                else m.testing.unlink_phone_device("s", 1)
                if operation == "unlink"
                else c.request_logs.list(project_id=PROJECT)
                if operation == "logs"
                else DirectMediaApi(transport).create_upload_grant("s", encrypted.info)
                if operation == "grant"
                else DirectMediaApi(transport).relay_upload("s", encrypted)
                if operation == "relay"
                else m.history_sync.request_chunk_retry(
                    "s", {"syncType": "RECENT", "chunkOrder": 0}
                )
                if operation == "retry"
                else m.history_sync.delete_chunk(
                    "s", {"directPath": "/a", "fileEncSha256": base64.b64encode(bytes(32)).decode()}
                )
            )
            task = asyncio.create_task(action)
            await asyncio.wait_for(reached.wait(), 2)
            task.cancel()
            with pytest.raises(asyncio.CancelledError):
                await asyncio.wait_for(task, 2)
    finally:
        release.set()
        await transport.close()
        await runner.cleanup()


async def test_followup_uses_ecmascript_placeholder_case_matching():
    async with (
        server({"success": True, "data": {}}) as (url, calls),
        AsyncMessagingClient(KEY, base_url=url) as c,
    ):
        # JS's /i without /u does not fold Kelvin sign or dotted I into ASCII.
        for text in ("{{lin\u212a:value}}", "{{l\u0130nk:value}}"):
            await c.campaigns.update(
                "p", ID, {"followUp": {"message": {"type": "text", "text": text}}}
            )
        for text in ("{{ LINK:value}}", "{{\ufeffLiNk:value}}"):
            with pytest.raises(ValidationError):
                await c.campaigns.update(
                    "p", ID, {"followUp": {"message": {"type": "text", "text": text}}}
                )
        assert len(calls) == 2
