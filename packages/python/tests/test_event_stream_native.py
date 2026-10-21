import asyncio
import json

import httpx
import pytest
from test_developer_resources import EVENT, PAYLOAD

from polymorfa import AsyncClient, AuthorizationError, Credential


async def test_actual_http_stream_encoded_webhook_resume_gap_and_manual_ack():
    requests = []
    handlers = set()
    gaps, reconnects = [], []
    received_event = EVENT | {"projectId": "project_1", "payload": PAYLOAD}

    async def serve(reader, writer):
        handlers.add(asyncio.current_task())
        try:
            raw = await reader.readuntil(b"\r\n\r\n")
            lines = raw.decode().split("\r\n")
            headers = {
                line.split(":", 1)[0].lower(): line.split(":", 1)[1].strip()
                for line in lines[1:]
                if ":" in line
            }
            requests.append((lines[0], headers))
            assert headers["authorization"] == "Bearer pmfa_AAECAwQFBgcICQoLDA0ODxAREhM73f-k"
            if lines[0].startswith("POST "):
                length = int(headers.get("content-length", "0"))
                body = json.loads(await reader.readexactly(length))
                assert body == {"cursor": "cursor_event", "sequence": 1}
                assert (
                    lines[0].split()[1] == "/platform/projects/project_1/events/stream/stream_1/ack"
                )
                response = json.dumps(
                    {
                        "data": {
                            "streamId": "stream_1",
                            "acknowledgedCursor": "cursor_event",
                            "sequence": 1,
                            "replayed": False,
                        }
                    }
                ).encode()
                writer.write(
                    b"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nx-request-id: req_ack\r\nContent-Length: "
                    + str(len(response)).encode()
                    + b"\r\nConnection: close\r\n\r\n"
                    + response
                )
                await writer.drain()
                return
            assert (
                lines[0].split()[1]
                == "/platform/projects/project_1/events/stream?types=future.%2A&ack=manual"
            )
            first = len([row for row in requests if row[0].startswith("GET ")]) == 1
            frames = (
                [
                    {"type": "ready", "heartbeatIntervalMs": 1000},
                    {"type": "checkpoint", "cursor": "cursor_checkpoint"},
                    {
                        "type": "gap",
                        "reason": "retention_exceeded",
                        "missedEvents": 2,
                        "requestedCursor": "cursor_old",
                    },
                ]
                if first
                else [
                    {
                        "type": "event",
                        "cursor": "cursor_event",
                        "streamId": "stream_1",
                        "sequence": 1,
                        "event": received_event,
                    }
                ]
            )
            if not first:
                assert headers["last-event-id"] == "cursor_checkpoint"
            else:
                assert headers["last-event-id"] == "cursor_old"
            response = b"".join(
                b"data: " + json.dumps(frame).encode() + b"\n\n" for frame in frames
            )
            writer.write(
                b"HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nx-request-id: req_sse\r\nContent-Length: "
                + str(len(response)).encode()
                + b"\r\nConnection: close\r\n\r\n"
            )
            # Split a frame across actual socket writes; the byte parser must buffer it.
            writer.write(response[:11])
            await writer.drain()
            writer.write(response[11:])
            await writer.drain()
        finally:
            writer.close()
            await writer.wait_closed()
            handlers.discard(asyncio.current_task())

    server = await asyncio.start_server(serve, "127.0.0.1", 0)
    url = "http://127.0.0.1:" + str(server.sockets[0].getsockname()[1])
    try:
        async with AsyncClient(
            Credential(
                "organization_api_key",
                "pmfa_AAECAwQFBgcICQoLDA0ODxAREhM73f-k",
            ),
            base_url=url,
        ) as client:
            stream = client.project("project_1").events.stream(
                since="cursor_old",
                types=["future.*"],
                manual_ack=True,
                on_gap=gaps.append,
                on_reconnect=lambda error, delay: reconnects.append((error, delay)),
                reconnect_initial=0,
                reconnect_max=0,
            )
            async for item in stream:
                assert item.event == received_event and item.cursor == "cursor_event"
                assert item.stream_id == "stream_1" and item.sequence == 1
                assert item.webhook.event == "future.event" and not item.webhook.known
                assert item.webhook.payload == {"x": 1}
                receipt = await client.project("project_1").events.acknowledge_stream(
                    item.stream_id, item.cursor, item.sequence
                )
                assert receipt.data == {
                    "streamId": "stream_1",
                    "acknowledgedCursor": "cursor_event",
                    "sequence": 1,
                    "replayed": False,
                }
                assert receipt.metadata.request_id == "req_ack"
                stream.close()
        assert gaps == [
            {"reason": "retention_exceeded", "missedEvents": 2, "requestedCursor": "cursor_old"}
        ]
        assert len(reconnects) == 1 and reconnects[0][1] == 0
        assert len(requests) == 3
    finally:
        server.close()
        await server.wait_closed()
        if handlers:
            await asyncio.gather(*handlers)


@pytest.mark.parametrize("headers_sent", [False, True])
async def test_native_stream_close_interrupts_headers_or_body(headers_sent):
    admitted = asyncio.Event()
    disconnected = asyncio.Event()

    async def serve(reader, writer):
        try:
            await reader.readuntil(b"\r\n\r\n")
            if headers_sent:
                writer.write(
                    b"HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nTransfer-Encoding: chunked\r\n\r\n"
                )
                await writer.drain()
            admitted.set()
            await reader.read()
            disconnected.set()
        finally:
            writer.close()
            await writer.wait_closed()

    server = await asyncio.start_server(serve, "127.0.0.1", 0)
    url = "http://127.0.0.1:" + str(server.sockets[0].getsockname()[1])
    try:
        async with AsyncClient(
            Credential(
                "organization_api_key",
                "pmfa_AAECAwQFBgcICQoLDA0ODxAREhM73f-k",
            ),
            base_url=url,
        ) as client:
            stream = client.project("project_1").events.stream()
            iterator = stream.__aiter__()
            next_item = asyncio.create_task(anext(iterator))
            await asyncio.wait_for(admitted.wait(), 2)
            stream.close()
            with pytest.raises(StopAsyncIteration):
                await asyncio.wait_for(next_item, 1)
            await asyncio.wait_for(disconnected.wait(), 1)
    finally:
        server.close()
        await server.wait_closed()


async def test_stream_revocation_is_terminal():
    requests = []

    def handler(request):
        requests.append(request)
        return httpx.Response(
            200,
            content=b'data: {"type":"revoked"}\n\n',
            headers={"content-type": "text/event-stream"},
        )

    async with AsyncClient(
        Credential(
            "organization_api_key",
            "pmfa_AAECAwQFBgcICQoLDA0ODxAREhM73f-k",
        ),
        http_transport=httpx.MockTransport(handler),
    ) as client:
        with pytest.raises(AuthorizationError) as caught:
            await anext(client.project("project_1").events.stream().__aiter__())
        assert caught.value.code == "stream_revoked"
    assert len(requests) == 1


@pytest.mark.parametrize("malformed", ["%%%", "e30="])
async def test_invalid_payload_keeps_reconnect_and_storage_checkpoint(malformed):
    from polymorfa.storage import Storage, memory_adapter, sync_to_storage

    storage = Storage(memory_adapter())
    requests, acknowledgements = [], []
    good = {
        "type": "event",
        "cursor": "good",
        "streamId": "stream",
        "sequence": 1,
        "event": EVENT | {"payload": PAYLOAD},
    }
    bad = {
        **good,
        "cursor": "bad",
        "sequence": 2,
        "event": EVENT | {"payload": {**PAYLOAD, "data": malformed}},
    }

    async def handler(request):
        if request.method == "POST":
            acknowledgements.append(json.loads(request.content))
            assert (await storage.get_checkpoint("*", "events")).cursor == "good"
            return httpx.Response(
                200,
                json={
                    "data": {
                        "streamId": "stream",
                        "acknowledgedCursor": "good",
                        "sequence": 1,
                        "replayed": False,
                    }
                },
            )
        requests.append(request)
        assert request.url.params["ack"] == "manual"
        if len(requests) == 1:
            frames = [good, bad]
        else:
            assert len(requests) == 2
            assert request.headers["last-event-id"] == "good"
            assert (await storage.get_checkpoint("*", "events")).cursor == "good"
            frames = [{"type": "revoked"}]
        return httpx.Response(
            200,
            content=b"".join(b"data: " + json.dumps(frame).encode() + b"\n\n" for frame in frames),
            headers={"content-type": "text/event-stream"},
        )

    async with AsyncClient(
        Credential("organization_api_key", "pmfa_AAECAwQFBgcICQoLDA0ODxAREhM73f-k"),
        http_transport=httpx.MockTransport(handler),
    ) as client:
        events = client.project("project").events

        class Source:
            def stream(self, **kwargs):
                return events.stream(**kwargs, reconnect_initial=0, reconnect_max=0)

            async def acknowledge_stream(self, *args, **kwargs):
                return await events.acknowledge_stream(*args, **kwargs)

        sync = sync_to_storage(Source(), storage)
        with pytest.raises(AuthorizationError):
            await sync.done
    assert len(requests) == 2
    assert acknowledgements == [{"cursor": "good", "sequence": 1}]
    assert (await storage.get_checkpoint("*", "events")).cursor == "good"


class FrameChunks(httpx.AsyncByteStream):
    def __init__(self, wire):
        self.wire = wire

    async def __aiter__(self):
        for offset in range(0, len(self.wire), 4093):
            yield self.wire[offset : offset + 4093]


@pytest.mark.parametrize(
    "segment", [b"x", "🦀".encode(), b"data: " + b" " * 1024 + b"\n", b": " + b"x" * 1024 + b"\n"]
)
async def test_event_stream_frame_byte_bounds(segment):
    limit = 4 * 1024 * 1024
    wire = segment * (limit // len(segment) + 1)
    failures = []

    def handler(request):
        return httpx.Response(
            200, stream=FrameChunks(wire), headers={"content-type": "text/event-stream"}
        )

    async with AsyncClient(
        Credential("organization_api_key", "pmfa_AAECAwQFBgcICQoLDA0ODxAREhM73f-k"),
        http_transport=httpx.MockTransport(handler),
    ) as client:
        stream = client.project("project").events.stream(
            since="safe", on_reconnect=lambda error, delay: (failures.append(error), stream.close())
        )
        assert [item async for item in stream] == []
        assert stream.cursor == "safe"
    assert len(failures) == 1 and failures[0].code == "invalid_response"


async def test_event_stream_utf8_boundary_and_frame_reset():
    frame = {
        "type": "event",
        "cursor": "boundary",
        "streamId": "stream",
        "sequence": 1,
        "event": EVENT | {"payload": PAYLOAD},
    }
    tail = b"\ndata: " + json.dumps(frame).encode() + b"\n\n"
    padding = 4 * 1024 * 1024 - len(tail) - 1
    wire = b":" + "🦀".encode() * (padding // 4) + b"x" * (padding % 4) + tail
    assert len(wire) == 4 * 1024 * 1024

    def handler(request):
        return httpx.Response(
            200, stream=FrameChunks(wire + wire), headers={"content-type": "text/event-stream"}
        )

    async with AsyncClient(
        Credential("organization_api_key", "pmfa_AAECAwQFBgcICQoLDA0ODxAREhM73f-k"),
        http_transport=httpx.MockTransport(handler),
    ) as client:
        stream = client.project("project").events.stream()
        items = []
        async for item in stream:
            items.append(item)
            if len(items) == 2:
                stream.close()
        assert [item.cursor for item in items] == ["boundary", "boundary"]
