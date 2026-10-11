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
            assert headers["authorization"] == "Bearer pmfa_" + "a" * 72
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
            Credential("organization_api_key", "pmfa_" + "a" * 72), base_url=url
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
            Credential("organization_api_key", "pmfa_" + "a" * 72), base_url=url
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
        Credential("organization_api_key", "pmfa_" + "a" * 72),
        http_transport=httpx.MockTransport(handler),
    ) as client:
        with pytest.raises(AuthorizationError) as caught:
            await anext(client.project("project_1").events.stream().__aiter__())
        assert caught.value.code == "stream_revoked"
    assert len(requests) == 1
