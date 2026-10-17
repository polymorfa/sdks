import asyncio
import base64
import copy
import hashlib
import hmac
import json

import httpx
import pytest
from aiohttp import web
from test_python_parity import run_mypy

from polymorfa import (
    AuthenticationError,
    ConfigurationError,
    ConflictError,
    ConnectionError,
    ServerError,
    ValidationError,
    WebhookSignatureError,
)
from polymorfa.direct_media import MediaUploadResult
from polymorfa.signal_node import (
    SignalMediaDescriptor,
    SignalMediaMessage,
    SignalNodeClient,
    SignalNodeEvent,
    SignalTextMessage,
    to_signal_media_descriptor,
    verify_signal_node_webhook,
)

SECRET = "synthetic-local-app-secret"
WEBHOOK_SECRET = "synthetic-webhook-secret"
EVENT = {
    "id": "event-synthetic",
    "type": "message",
    "session_id": "session-one",
    "chat": "1@s.whatsapp.net",
    "sender": "2:3@lid",
    "sender_alt": "2:3@s.whatsapp.net",
    "message_id": "synthetic-native-id",
    "timestamp": 1700000000,
    "is_from_me": False,
    "redelivered": False,
    "identity_changed": True,
    "text": "hello λ",
    "message_proto": "AQID",
}


def media(kind="image"):
    return SignalMediaDescriptor(
        kind,
        "/v/t62/synthetic",
        *[base64.b64encode(bytes([value]) * 32).decode() for value in (1, 2, 3)],
        17,
        "image/jpeg",
    )


def event_wire(event=EVENT):
    return (
        "id: "
        + event["id"]
        + "\nevent: "
        + event["type"]
        + "\ndata: "
        + json.dumps(event, separators=(",", ":"), ensure_ascii=False)
        + "\n\n"
    ).encode()


async def test_health_sessions_and_send_exact_local_wire_no_cookie_or_upstream_credential():
    calls = []

    def handler(request):
        calls.append(request)
        assert "Cookie" not in request.headers and "Origin" not in request.headers
        assert "Polymorfa-Version" not in request.headers and "x-api-version" not in request.headers
        if request.url.path == "/healthz":
            assert "Authorization" not in request.headers
            return httpx.Response(200, json={"status": "ok"}, headers={"Set-Cookie": "leak=secret"})
        assert request.headers["Authorization"] == "Bearer " + SECRET
        if request.url.path == "/v1/sessions":
            return httpx.Response(
                200,
                json={
                    "node_id": "node",
                    "sessions": [
                        {
                            "id": "s",
                            "lease_generation": 2**63 + 7,
                            "claimed": True,
                            "has_device_keys": True,
                            "state": "connected",
                            "pn": None,
                            "lid": None,
                        }
                    ],
                },
            )
        return httpx.Response(
            200, json={"message_id": "out", "server_timestamp": 1700000001, "resent": True}
        )

    async with SignalNodeClient(SECRET, http_transport=httpx.MockTransport(handler)) as client:
        assert await client.health() == "ok"
        sessions = await client.list_sessions()
        assert (
            sessions.sessions[0].lease_generation == 2**63 + 7 and sessions.sessions[0].pn is None
        )
        assert (await client.send_text("session/space λ", "1@s.whatsapp.net", "hello")).resent
        assert json.loads(calls[-1].content) == {"to": "1@s.whatsapp.net", "text": "hello"}
        assert "%2F" in str(calls[-1].url) and "%CE%BB" in str(calls[-1].url)
        await client.send_message("s", SignalMediaMessage("1@g.us", media()))
        packet = json.loads(calls[-1].content)
        assert packet == {"to": "1@g.us", "media": media().to_wire()}
        assert "media_key" in packet["media"] and "mediaKey" not in packet["media"]
        assert SECRET not in repr(client)


@pytest.mark.parametrize("kind", ["image", "video", "audio", "document", "sticker", "ptt"])
async def test_upload_to_local_signal_descriptor_all_kinds(kind):
    upload = MediaUploadResult(
        kind,
        bytes([1]) * 32,
        bytes([2]) * 32,
        bytes([3]) * 32,
        17,
        42,
        "application/octet-stream",
        "/v/t62/synthetic",
        "https://mmg.whatsapp.net/v/t62/synthetic",
    )
    descriptor = to_signal_media_descriptor(upload)
    assert descriptor.kind == ("audio" if kind == "ptt" else kind)
    if kind in ("audio", "ptt"):
        assert descriptor.ptt == (kind == "ptt")
    assert descriptor.to_media_descriptor().media_key == bytes([1]) * 32
    assert descriptor.media_key not in repr(descriptor)


@pytest.mark.parametrize(
    "secret",
    [
        "",
        "short",
        "pmfa_AgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
        "pmfa_pt_" + "a" * 64,
        "pmfa_ct_" + "a" * 64,
        "x" * 16 + "\n",
    ],
)
def test_local_secret_is_distinct_from_polymorfa_principals(secret):
    with pytest.raises(ConfigurationError):
        SignalNodeClient(secret)


@pytest.mark.parametrize(
    "value",
    [
        "http://public.example",
        "https://user:password@customer.example",
        "https://customer.example?credential=secret",
        "https://customer.example/private",
        "file:///service",
    ],
)
def test_local_endpoint_configuration_refuses_credential_urls_and_public_cleartext(value):
    with pytest.raises(ConfigurationError):
        SignalNodeClient(SECRET, base_url=value)


async def test_no_send_retry_and_safe_errors_for_html_or_unknown_json():
    calls = 0

    def handler(request):
        nonlocal calls
        calls += 1
        return httpx.Response(
            409, json={"error": {"code": "not_lease_holder", "message": "SENSITIVE UPSTREAM BODY"}}
        )

    async with SignalNodeClient(SECRET, http_transport=httpx.MockTransport(handler)) as client:
        with pytest.raises(ConflictError) as failure:
            await client.send_text("s", "1@s.whatsapp.net", "hello")
        assert failure.value.code == "not_lease_holder" and "SENSITIVE" not in str(failure.value)
    assert calls == 1

    def html(request):
        return httpx.Response(503, text="<html>SENSITIVE proxy</html>")

    async with SignalNodeClient(SECRET, http_transport=httpx.MockTransport(html)) as client:
        with pytest.raises(ServerError) as failure:
            await client.health()
        assert "SENSITIVE" not in str(failure.value)


@pytest.mark.parametrize("code", [{"secret": "SENSITIVE"}, ["SENSITIVE"], 1, True, None])
async def test_malformed_upstream_error_codes_stay_safe(code):
    async with SignalNodeClient(
        SECRET,
        http_transport=httpx.MockTransport(
            lambda _: httpx.Response(503, json={"error": {"code": code}})
        ),
    ) as client:
        with pytest.raises(ServerError) as failure:
            await client.health()
        assert failure.value.code == "signal_service_error"
        assert failure.value.status == 503 and "SENSITIVE" not in str(failure.value)


@pytest.mark.parametrize(
    "changed", ["scalar", "boolean_integer", "missing_required", "duplicate", "nan"]
)
async def test_invalid_local_json_is_rejected(changed):
    value = {"message_id": "out", "server_timestamp": 1700000001, "resent": False}
    if changed == "scalar":
        value = []
    elif changed == "boolean_integer":
        value["server_timestamp"] = True
    elif changed == "missing_required":
        value.pop("resent")
    raw = json.dumps(value).encode()
    if changed == "duplicate":
        raw = b'{"message_id":"one","message_id":"two","server_timestamp":1,"resent":false}'
    if changed == "nan":
        raw = b'{"message_id":"one","server_timestamp":NaN,"resent":false}'
    async with SignalNodeClient(
        SECRET,
        http_transport=httpx.MockTransport(
            lambda _: httpx.Response(200, content=raw, headers={"content-type": "application/json"})
        ),
    ) as client:
        with pytest.raises(ServerError):
            await client.send_text("s", "1@s.whatsapp.net", "hi")


async def test_send_validation_occurs_before_network_and_static_union_excludes_two_bodies():
    calls = []
    async with SignalNodeClient(
        SECRET, http_transport=httpx.MockTransport(lambda request: calls.append(request))
    ) as client:
        with pytest.raises(ValidationError):
            await client.send_text("s", "1@s.whatsapp.net", "")
        bad = media()
        object.__setattr__(bad, "media_key", "not base64")
        with pytest.raises(ValidationError):
            await client.send_media("s", "1@s.whatsapp.net", bad)
    assert not calls
    assert "<redacted>" in repr(SignalTextMessage("to", "private text"))
    checked = run_mypy("""
from polymorfa.signal_node import SignalTextMessage, SignalMediaMessage, SignalMediaDescriptor
request = SignalTextMessage(to="1@s.whatsapp.net", text="hi", media=None)
""")
    assert checked.returncode != 0 and 'Unexpected keyword argument "media"' in checked.stdout


class ChunkStream(httpx.AsyncByteStream):
    def __init__(self, chunks, blocked=False):
        self.chunks = chunks
        self.blocked = blocked
        self.closed = False
        self.reading = asyncio.Event()

    async def __aiter__(self):
        for chunk in self.chunks:
            yield chunk
        if self.blocked:
            self.reading.set()
            await asyncio.Event().wait()

    async def aclose(self):
        self.closed = True


async def test_sse_split_utf8_and_explicit_ack_only():
    calls = []
    raw = event_wire()
    stream = ChunkStream([raw[index : index + 1] for index in range(len(raw))])

    def handler(request):
        calls.append(request)
        if request.url.path.endswith("/ack"):
            return httpx.Response(204)
        assert dict(request.url.params) == {"session_id": "session-one"}
        assert "Last-Event-ID" not in request.headers
        return httpx.Response(200, stream=stream, headers={"content-type": "text/event-stream"})

    async with SignalNodeClient(SECRET, http_transport=httpx.MockTransport(handler)) as client:
        async with client.events(session_id="session-one", reconnect=False) as events:
            seen = [event async for event in events]
        assert (
            len(seen) == 1
            and seen[0].text == "hello λ"
            and seen[0].message_bytes() == b"\x01\x02\x03"
        )
        assert len(calls) == 1 and stream.closed
        assert seen[0].text not in repr(seen[0])
        await client.acknowledge_event(seen[0].id)
        assert len(calls) == 2


@pytest.mark.parametrize(
    "changed", ["foreign_session", "frame_id", "frame_type", "oversized", "partial"]
)
async def test_sse_fails_closed_on_invalid_scope_or_records(changed):
    event = copy.deepcopy(EVENT)
    if changed == "foreign_session":
        event["session_id"] = "foreign"
    raw = event_wire(event)
    if changed == "frame_id":
        raw = raw.replace(b"id: event-synthetic", b"id: foreign")
    if changed == "frame_type":
        raw = raw.replace(b"event: message", b"event: history.sync")
    if changed == "oversized":
        raw = b"data: " + b"x" * 2048
    if changed == "partial":
        raw = raw[:-2]
    stream = ChunkStream([raw])
    async with SignalNodeClient(
        SECRET,
        http_transport=httpx.MockTransport(
            lambda _: httpx.Response(
                200, stream=stream, headers={"content-type": "text/event-stream"}
            )
        ),
        max_event_bytes=1024,
    ) as client:
        with pytest.raises((ServerError, ConnectionError)):
            async with client.events(session_id="session-one", reconnect=False) as events:
                _ = [event async for event in events]
        assert stream.closed


async def test_sse_close_cancels_stalled_read_without_waiting_for_heartbeat():
    stream = ChunkStream([], blocked=True)
    async with SignalNodeClient(
        SECRET,
        http_transport=httpx.MockTransport(
            lambda _: httpx.Response(
                200, stream=stream, headers={"content-type": "text/event-stream"}
            )
        ),
    ) as client:
        events = client.events(reconnect=False)

        async def consume():
            return [event async for event in events]

        task = asyncio.create_task(consume())
        await asyncio.wait_for(stream.reading.wait(), 1)
        await events.close()
        assert await asyncio.wait_for(task, 1) == [] and stream.closed


async def test_real_loopback_http_sse_yields_small_event_before_ack_and_closes():
    sequence = []
    acked = asyncio.Event()
    requests = []

    async def events(request):
        requests.append(request)
        assert request.headers["Authorization"] == "Bearer " + SECRET
        assert "Origin" not in request.headers and "Cookie" not in request.headers
        response = web.StreamResponse(headers={"content-type": "text/event-stream"})
        await response.prepare(request)
        await response.write(event_wire())
        await asyncio.wait_for(acked.wait(), 2)
        await response.write_eof()
        return response

    async def ack(request):
        assert sequence == ["persisted"]
        sequence.append("acknowledged")
        acked.set()
        return web.Response(status=204)

    app = web.Application()
    app.router.add_get("/v1/events", events)
    app.router.add_post("/v1/events/{id}/ack", ack)
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "127.0.0.1", 0)
    await site.start()
    port = site._server.sockets[0].getsockname()[1]
    try:
        async with (
            SignalNodeClient(SECRET, base_url=f"http://127.0.0.1:{port}") as client,
            client.events(reconnect=False) as stream,
        ):
            iterator = stream.__aiter__()
            event = await asyncio.wait_for(iterator.__anext__(), 1)
            assert not acked.is_set()
            sequence.append("persisted")
            await client.acknowledge_event(event.id)
            with pytest.raises(StopAsyncIteration):
                await iterator.__anext__()
        assert sequence == ["persisted", "acknowledged"]
    finally:
        await runner.cleanup()


async def test_failed_stream_cleanup_releases_registration_and_closes_owned_transport():
    class BrokenStream(httpx.AsyncByteStream):
        async def __aiter__(self):
            yield b""

        async def aclose(self):
            raise RuntimeError("synthetic close failure")

    class Transport(httpx.AsyncBaseTransport):
        closed = False

        async def handle_async_request(self, request):
            pytest.fail("cleanup must not issue a request")

        async def aclose(self):
            self.closed = True

    transport = Transport()
    client = SignalNodeClient(SECRET, http_transport=transport)
    stream = client.events()
    stream._response = httpx.Response(200, stream=BrokenStream())
    await client.close()
    assert stream._closed.is_set() and not client._streams and transport.closed


def test_history_nullable_numeric_source_and_unknown_complete_proto_preserved():
    wire = {
        **EVENT,
        "type": "history.sync",
        "text": None,
        "history": {
            "notification_proto": "AQID",
            "sync_type": None,
            "chunk_order": 0,
            "progress": None,
            "file_length": 2**63 + 1,
            "media_key": None,
            "future": True,
        },
        "future_field": "preserved",
    }
    event = SignalNodeEvent.from_wire(wire)
    assert (
        event.history.sync_type is None
        and event.history.chunk_order == 0
        and event.history.notification_bytes() == b"\x01\x02\x03"
    )
    assert event.history.file_length == 2**63 + 1 and event.raw["future_field"] == "preserved"
    assert "AQID" not in repr(event.history)


@pytest.mark.parametrize("changed", ["signature", "time", "event_id", "body_limit"])
def test_local_signed_webhook_validates_exact_body_time_and_identity(changed):
    body = json.dumps(EVENT, separators=(",", ":"), ensure_ascii=False).encode()
    timestamp = 1700000000
    signature = (
        "v1="
        + hmac.new(
            WEBHOOK_SECRET.encode(), str(timestamp).encode() + b"." + body, hashlib.sha256
        ).hexdigest()
    )
    headers = {
        "Signal-Node-Signature": signature,
        "Signal-Node-Timestamp": str(timestamp),
        "Signal-Node-Event-Id": EVENT["id"],
    }
    assert (
        verify_signal_node_webhook(body, headers, WEBHOOK_SECRET, now=timestamp).id == EVENT["id"]
    )
    now = timestamp
    limit = 1024 * 1024
    if changed == "signature":
        headers["Signal-Node-Signature"] = "v1=" + "0" * 64
    elif changed == "time":
        now += 301
    elif changed == "event_id":
        headers["Signal-Node-Event-Id"] = "foreign"
    else:
        limit = 1
    with pytest.raises(WebhookSignatureError):
        verify_signal_node_webhook(body, headers, WEBHOOK_SECRET, now=now, max_body_bytes=limit)


@pytest.mark.parametrize(
    "kind,field,value",
    [("audio", "caption", "ignored"), ("sticker", "seconds", 3), ("image", "file_name", "ignored")],
)
def test_local_send_refuses_metadata_the_pinned_service_would_ignore(kind, field, value):
    descriptor = media(kind)
    object.__setattr__(descriptor, field, value)
    with pytest.raises(ValidationError):
        descriptor.validate_send()


async def test_redirects_never_forward_local_secret():
    requests = []

    def handler(request):
        requests.append(request)
        return httpx.Response(307, headers={"Location": "https://foreign.example"})

    async with SignalNodeClient(SECRET, http_transport=httpx.MockTransport(handler)) as client:
        with pytest.raises(ServerError):
            await client.list_sessions()
    assert len(requests) == 1


async def test_wrong_local_authentication_is_typed_and_does_not_expose_body():
    async with SignalNodeClient(
        SECRET,
        http_transport=httpx.MockTransport(
            lambda _: httpx.Response(
                401, json={"error": {"code": "unauthorized", "message": "SENSITIVE"}}
            )
        ),
    ) as client:
        with pytest.raises(AuthenticationError) as failure:
            await client.list_sessions()
        assert failure.value.code == "unauthorized" and "SENSITIVE" not in str(failure.value)


async def test_ack_requires_exact_empty_204_success():
    async with SignalNodeClient(
        SECRET, http_transport=httpx.MockTransport(lambda _: httpx.Response(200, json=None))
    ) as client:
        with pytest.raises(ServerError):
            await client.acknowledge_event("event")
