import asyncio
import json
import time

import pytest
from aiohttp import WSMsgType, web
from test_calls_runtime import CLIENT, SERVER, wire
from test_developer_resources import EVENT, PAYLOAD

from polymorfa import (
    AsyncClient,
    AudioFrame,
    AuthorizationError,
    CallsClient,
    CallsToken,
    CallVideoSource,
    Credential,
    OutgoingVideoFrame,
    VideoFrame,
    event_stream_source,
)


async def test_actual_neutral_tracks_pcm_video_sources_keyframes_and_detach():
    async def handler(request):
        if request.path == "/voip/ws":
            socket = web.WebSocketResponse()
            await socket.prepare(request)
            await socket.receive_json()
            await socket.send_json({"type": "ready", "participant": "client:self"})
            await socket.send_json(
                {
                    "type": "event",
                    "event": "call.received",
                    "callId": "tracks",
                    "timestamp": "now",
                    "payload": {"from": "+1555", "hasVideo": True},
                }
            )
            async for _ in socket:
                pass
            return socket
        if request.path.endswith("/media"):
            socket = web.WebSocketResponse(protocols=("pmfa.calls.v2",))
            await socket.prepare(request)
            await socket.receive_json()
            await socket.send_json({"type": "ready", "sampleRate": 24000, "video": True})
            await socket.send_json(
                {
                    "type": "video_source",
                    "source": 7,
                    "connectionId": "connection_remote",
                    "connectionParticipant": "client:other",
                }
            )
            await socket.send_json({"type": "keyframe_request"})
            async for message in socket:
                if message.type == WSMsgType.BINARY:
                    if message.data[0] == 1:
                        assert message.data == b"\x01\x01\x00\xff\xff"
                        await socket.send_bytes(message.data)
                    else:
                        assert message.data.hex() == "02010100000000000000000000007b0000000165"
                        await socket.send_bytes(
                            bytes.fromhex("02010100000007000000000000007b0000000165")
                        )
                elif (
                    message.type == WSMsgType.TEXT
                    and json.loads(message.data).get("type") == "leave"
                ):
                    await socket.close()
            return socket
        return web.json_response(
            {"data": {"answered": True, "answeredBy": "client:self", "exclusive": False}}
        )

    async with wire(handler) as base:
        client = CallsClient(
            CLIENT,
            "support",
            base_url=base,
            diagnostics=False,
            lifecycle_heartbeat_interval=0,
            media_heartbeat_interval=0,
        )
        try:
            await client.connect()
            call = await asyncio.wait_for(client.incoming.get(), 2)
            assert not await call.audio.write([1])
            assert not await call.video.write(
                OutgoingVideoFrame(b"\x00\x00\x00\x01\x65", 123, True)
            )
            await call.answer()
            audio, video = call.audio.frames(), call.video.frames()
            audio_frame, video_frame = (
                asyncio.create_task(anext(audio)),
                asyncio.create_task(anext(video)),
            )
            assert await call.audio.write([1, -1])
            assert await call.video.write(OutgoingVideoFrame(b"\x00\x00\x00\x01\x65", 123, True))
            assert await asyncio.wait_for(audio_frame, 2) == AudioFrame((1, -1))
            assert await asyncio.wait_for(video_frame, 2) == VideoFrame(
                b"\x00\x00\x00\x01\x65", 123, True, 7
            )
            source = await asyncio.wait_for(call.video.source_changes.get(), 2)
            assert source == CallVideoSource(
                7,
                "client:other",
                connection_id="connection_remote",
                connection_participant="client:other",
            )
            assert call.video.sources[7] == source
            await asyncio.wait_for(call.video.keyframe_requests.get(), 2)
            assert call.audio.sample_rate == 24000
            pending = asyncio.create_task(anext(audio))
            await call.leave()
            with pytest.raises(StopAsyncIteration):
                await asyncio.wait_for(pending, 2)
            assert call.audio.sample_rate == 24000 and not call.video.sources
            assert await call.video.source_changes.get() == 7
            assert not await call.audio.write([1])
            await audio.aclose()
            await video.aclose()
        finally:
            await client.disconnect()


async def test_actual_event_source_skips_absent_payload_delivers_cursor_and_unsubscribes():
    delivered, release = asyncio.Event(), asyncio.Event()
    received, errors = [], []

    async def handler(request):
        assert request.headers["last-event-id"] == "initial"
        response = web.StreamResponse(headers={"content-type": "text/event-stream"})
        await response.prepare(request)
        for sequence, payload in enumerate((None, PAYLOAD), 1):
            frame = {
                "type": "event",
                "cursor": f"cursor_{sequence}",
                "streamId": "stream_1",
                "sequence": sequence,
                "event": {
                    **EVENT,
                    "projectId": "project_1",
                    "payload": payload,
                    "payloadAvailability": "available" if payload else "not_retained",
                },
            }
            await response.write(b"data: " + json.dumps(frame).encode() + b"\n\n")
        await release.wait()
        return response

    async def listener(events, metadata):
        received.append((events, metadata))
        delivered.set()

    async with (
        wire(handler) as base,
        AsyncClient(Credential("organization_api_key", SERVER), base_url=base) as client,
    ):
        source = event_stream_source(
            lambda cursor: client.project("project_1").events.stream(since=cursor)
        )
        subscription = source.subscribe(listener, cursor="initial", on_error=errors.append)
        try:
            await asyncio.wait_for(delivered.wait(), 2)
            assert len(received) == 1
            events, metadata = received[0]
            assert metadata.cursor == "cursor_2" and len(events) == 1
            assert events[0].payload == {"x": 1} and not events[0].known
            await subscription.close()
            assert subscription.task.done() and not errors
        finally:
            release.set()
            await subscription.close()


async def test_native_event_source_reports_terminal_authorization_error():
    errors, delivered = [], asyncio.Event()

    async def handler(request):
        return web.json_response(
            {"error": {"code": "forbidden", "message": "Denied"}},
            status=403,
            headers={"x-request-id": "req_source"},
        )

    def error(cause):
        errors.append(cause)
        delivered.set()

    async with (
        wire(handler) as base,
        AsyncClient(Credential("organization_api_key", SERVER), base_url=base) as client,
    ):
        subscription = event_stream_source(
            lambda cursor: client.project("project_1").events.stream(since=cursor)
        ).subscribe(lambda events, meta: None, on_error=error)
        await asyncio.wait_for(delivered.wait(), 2)
        assert len(errors) == 1 and isinstance(errors[0], AuthorizationError)
        assert errors[0].metadata.request_id == "req_source"
        await subscription.close()


@pytest.mark.parametrize(
    "reason,expected",
    [
        ("future_reason", "unknown"),
        ("user_hangup", "remote_hangup"),
        ("media_timeout", "timeout"),
        ("setup_timeout", "timeout"),
    ],
)
async def test_native_lifecycle_end_reasons_match_neutral_contract(reason, expected):
    async def handler(request):
        socket = web.WebSocketResponse()
        await socket.prepare(request)
        await socket.receive_json()
        await socket.send_json({"type": "ready"})
        for kind, payload in (
            ("call.received", {"from": "+1555"}),
            ("call.ended", {"reason": reason}),
        ):
            await socket.send_json(
                {
                    "type": "event",
                    "event": kind,
                    "callId": "ended",
                    "timestamp": "now",
                    "payload": payload,
                }
            )
        async for _ in socket:
            pass
        return socket

    async with wire(handler) as base:
        client = CallsClient(
            CLIENT, "support", base_url=base, diagnostics=False, lifecycle_heartbeat_interval=0
        )
        try:
            await client.connect()
            call = await asyncio.wait_for(client.incoming.get(), 2)
            assert await asyncio.wait_for(call.wait_ended(), 2) == expected
            assert not call.claimed_by_other and not call.can_join
        finally:
            await client.disconnect()


async def test_native_media_terminal_control_stops_reader_and_token_refresh():
    terminate, disconnected = asyncio.Event(), asyncio.Event()
    tokens = []

    async def provider(request):
        tokens.append(request.refresh)
        return CallsToken(CLIENT, time.time() + 300)

    async def handler(request):
        if request.path == "/voip/ws":
            socket = web.WebSocketResponse()
            await socket.prepare(request)
            await socket.receive_json()
            await socket.send_json({"type": "ready"})
            await socket.send_json(
                {
                    "type": "event",
                    "event": "call.received",
                    "callId": "terminal",
                    "timestamp": "now",
                    "payload": {"from": "+1555"},
                }
            )
            async for _ in socket:
                pass
            return socket
        if request.path.endswith("/media"):
            socket = web.WebSocketResponse(protocols=("pmfa.calls.v2",))
            await socket.prepare(request)
            await socket.receive_json()
            await socket.send_json({"type": "ready", "sampleRate": 24000, "video": False})
            await terminate.wait()
            await socket.send_json({"type": "ended"})
            async for _ in socket:
                pass
            disconnected.set()
            return socket
        return web.json_response(
            {"data": {"answered": True, "answeredBy": "client:self", "exclusive": False}}
        )

    async with wire(handler) as base:
        client = CallsClient(
            provider,
            "support",
            base_url=base,
            diagnostics=False,
            lifecycle_heartbeat_interval=0,
            media_heartbeat_interval=0,
        )
        try:
            await client.connect()
            call = await asyncio.wait_for(client.incoming.get(), 2)
            await call.answer()
            media = call._media
            assert media._runner is not None and media._refresh_task is not None
            terminate.set()
            assert await asyncio.wait_for(call.wait_ended(), 2) == "remote_hangup"
            await asyncio.wait_for(disconnected.wait(), 2)
            assert media._runner is None and media._refresh_task is None
            assert not media.socket.connected and tokens == [False]
        finally:
            await client.disconnect()
