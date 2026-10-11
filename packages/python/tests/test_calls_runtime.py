import asyncio
import json
from contextlib import asynccontextmanager

import pytest
from aiohttp import WSMsgType, web

from polymorfa import AudioFrame, ConflictError, VideoFrame
from polymorfa.calls_lifecycle import LifecycleSocket
from polymorfa.calls_runtime import CallsClient
from polymorfa.calls_tokens import CallsError, CallsToken, CallsTokenSource

SERVER = "pmfa_" + "a" * 72
CLIENT = "pmfa_ct_fixture"


@asynccontextmanager
async def wire(handler):
    app = web.Application()
    app.router.add_route("*", "/{path:.*}", handler)
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "127.0.0.1", 0)
    await site.start()
    port = site._server.sockets[0].getsockname()[1]
    try:
        yield f"http://127.0.0.1:{port}"
    finally:
        await runner.cleanup()


@pytest.mark.parametrize("token", [SERVER, CLIENT])
async def test_native_lifecycle_query_isolation_and_incoming_answer_pcm_video_controls(token):
    seen, sockets = [], []
    media_ready = asyncio.Event()

    async def handler(request):
        if request.path == "/voip/ws":
            assert "authorization" not in request.headers
            assert dict(request.query) == (
                {} if token == CLIENT else {"session": "support", "participant": "worker"}
            )
            socket = web.WebSocketResponse(autoping=False)
            await socket.prepare(request)
            sockets.append(socket)
            assert await socket.receive_json() == {"type": "auth", "token": token}
            await socket.send_json(
                {
                    "type": "ready",
                    "participant": "client:fixture" if token == CLIENT else "server:worker",
                }
            )
            await socket.send_json(
                {
                    "type": "event",
                    "event": "future.event",
                    "callId": "ignored",
                    "payload": {},
                    "timestamp": "now",
                }
            )
            await socket.send_json(
                {
                    "type": "event",
                    "event": "call.received",
                    "callId": "call_1",
                    "payload": {"from": {"phoneNumber": "+15551234567"}, "hasVideo": True},
                    "timestamp": "now",
                }
            )
            async for message in socket:
                if (
                    message.type == WSMsgType.TEXT
                    and json.loads(message.data).get("type") == "ping"
                ):
                    await socket.send_json({"type": "pong"})
            return socket
        if request.path.endswith("/media"):
            assert not request.query and "authorization" not in request.headers
            socket = web.WebSocketResponse(protocols=("pmfa.calls.v2",), autoping=False)
            await socket.prepare(request)
            auth = await socket.receive_json()
            assert auth["type"] == "auth" and auth["token"] == token
            assert auth.get("participant") == (None if token == CLIENT else "worker")
            assert len(auth["connectionId"]) == 24
            await socket.send_json({"type": "ready", "sampleRate": 24000, "video": True})
            await socket.send_json({"type": "remote_media", "audioMuted": True})
            await socket.send_json({"type": "hand_state", "raised": False, "supported": True})
            media_ready.set()
            async for message in socket:
                if message.type == WSMsgType.BINARY:
                    seen.append(message.data)
                    await socket.send_bytes(message.data)
                elif message.type == WSMsgType.TEXT:
                    frame = json.loads(message.data)
                    seen.append(frame)
                    if frame["type"] == "media_state":
                        await socket.send_json(
                            {
                                "type": "media_state",
                                "requestId": frame["requestId"],
                                "audioMuted": frame.get("audioMuted", False),
                                "videoEnabled": frame.get("videoEnabled", True),
                                "screenSharing": frame.get("screenSharing", False),
                            }
                        )
                    elif frame["type"] == "leave":
                        await socket.close()
            return socket
        assert request.headers["authorization"] == "Bearer " + token
        assert request.headers["polymorfa-version"] == "2026-09-22"
        payload = await request.json() if request.can_read_body else None
        seen.append((request.method, request.path, payload))
        if request.path.endswith("/accept"):
            assert payload == {
                "exclusive": True,
                "video": True,
                **({"participant": "worker"} if token == SERVER else {}),
            }
            return web.json_response(
                {"data": {"answered": True, "answeredBy": "server:worker", "exclusive": True}}
            )
        return web.json_response({"success": True})

    async with wire(handler) as base:
        client = CallsClient(
            token,
            "support",
            participant="worker",
            base_url=base,
            lifecycle_heartbeat_interval=0,
            media_heartbeat_interval=0,
        )
        try:
            await client.connect()
            assert client.connected
            call = await asyncio.wait_for(client.incoming.get(), 2)
            assert call.peer == "+15551234567" and call.state == "incoming"
            await call.answer(exclusive=True)
            await media_ready.wait()
            assert call.state == "connected"
            assert call.sample_rate == 24000
            await call.send_audio([1, -1])
            assert await asyncio.wait_for(call.receive_media(), 2) == AudioFrame((1, -1))
            video = VideoFrame(b"\x00\x00\x01\x65", 123, True)
            await call.send_video(video)
            assert await asyncio.wait_for(call.receive_media(), 2) == video
            assert await call.set_media_state({"audioMuted": True, "screenSharing": True}) == {
                "audioMuted": True,
                "videoEnabled": True,
                "screenSharing": True,
            }
            assert call.hand_raised is False and call.social_supported is True
            assert call.remote_audio_muted is True
            await call.send_reaction("👍")
            await call.set_hand_raised(True)
            await call.leave()
            assert call.ended and call.end_reason == "left"
            assert not client.calls
        finally:
            await client.disconnect()


async def test_actual_media_reconnect_reuses_connection_id_and_acknowledged_preferences():
    sockets, auth_frames, restored = [], [], asyncio.Event()

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
                    "callId": "call_reconnect",
                    "payload": {"from": "+1555"},
                    "timestamp": "now",
                }
            )
            async for message in socket:
                pass
            return socket
        if request.path.endswith("/media"):
            socket = web.WebSocketResponse(protocols=("pmfa.calls.v2",))
            await socket.prepare(request)
            auth_frames.append(await socket.receive_json())
            sockets.append(socket)
            await socket.send_json({"type": "ready", "sampleRate": 48000, "video": False})
            async for message in socket:
                if message.type == WSMsgType.TEXT:
                    frame = json.loads(message.data)
                    if frame["type"] == "media_state":
                        assert frame["audioMuted"] is True
                        await socket.send_json(
                            {
                                "type": "media_state",
                                "requestId": frame["requestId"],
                                "audioMuted": True,
                                "videoEnabled": False,
                            }
                        )
                        if len(sockets) == 2:
                            await socket.send_bytes(b"\x01\x03\x00")
                            restored.set()
                    elif frame["type"] == "leave":
                        await socket.close()
            return socket
        if request.path.endswith("/accept"):
            return web.json_response(
                {"data": {"answered": True, "answeredBy": "client:self", "exclusive": False}}
            )
        if request.path.endswith("/reports"):
            report = await request.json()
            assert report["kind"] == "quality" and report["quality"] == {"reconnects": 1}
            assert report["client"] == {
                "sdk": "polymorfa-sdk",
                "version": "0.1.0.dev0",
                "platform": "other",
            }
            assert "participant" not in report
            return web.json_response({"success": True})
        pytest.fail("Unexpected HTTP operation " + request.path)

    async with wire(handler) as base:
        client = CallsClient(
            CLIENT,
            "support",
            base_url=base,
            lifecycle_heartbeat_interval=0,
            media_heartbeat_interval=0,
            media_backoff=0.01,
        )
        try:
            await client.connect()
            call = await client.incoming.get()
            await call.answer()
            assert await call.set_media_state({"audioMuted": True}) == {
                "audioMuted": True,
                "videoEnabled": False,
            }
            await sockets[0].close(code=1012)
            await asyncio.wait_for(restored.wait(), 2)
            while call.state != "connected":
                await asyncio.sleep(0)
            assert await asyncio.wait_for(call.receive_media(), 2) == AudioFrame((3,))
            assert call.sample_rate == 48000 and call._reconnects == 1
            assert auth_frames[0] == auth_frames[1]
            await call.leave()
        finally:
            await client.disconnect()


async def test_unknown_media_command_is_not_replayed_and_queue_is_bounded():
    admitted, release = asyncio.Event(), asyncio.Event()
    commands = []

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
                    "callId": "call_command",
                    "payload": {"from": "+1555"},
                    "timestamp": "now",
                }
            )
            async for message in socket:
                pass
            return socket
        if request.path.endswith("/accept"):
            return web.json_response(
                {"data": {"answered": True, "answeredBy": "client:self", "exclusive": False}}
            )
        if request.path.endswith("/reports"):
            return web.json_response({"success": True})
        socket = web.WebSocketResponse(protocols=("pmfa.calls.v2",))
        await socket.prepare(request)
        await socket.receive_json()
        await socket.send_json({"type": "ready", "sampleRate": 16000, "video": False})
        async for message in socket:
            if message.type != WSMsgType.TEXT:
                continue
            frame = json.loads(message.data)
            if frame["type"] == "media_state":
                commands.append(frame)
                admitted.set()
                await release.wait()
                if len(commands) > 1:
                    await socket.send_json(
                        {
                            "type": "media_state",
                            "requestId": frame["requestId"],
                            "audioMuted": True,
                            "videoEnabled": False,
                        }
                    )
            elif frame["type"] == "leave":
                await socket.close()
        return socket

    async with wire(handler) as base:
        client = CallsClient(
            CLIENT,
            "support",
            base_url=base,
            lifecycle_heartbeat_interval=0,
            media_heartbeat_interval=0,
        )
        try:
            await client.connect()
            call = await client.incoming.get()
            await call.answer()
            call._media._timeout = 0.05
            first = asyncio.create_task(call.set_media_state({"audioMuted": True}))
            await admitted.wait()
            tasks = [
                asyncio.create_task(call.set_media_state({"audioMuted": True})) for _ in range(16)
            ]
            while call._media._queued < 16:
                await asyncio.sleep(0)
            with pytest.raises(CallsError) as unknown:
                await first
            assert unknown.value.code == "media_control_unknown"
            release.set()
            results = await asyncio.gather(*tasks, return_exceptions=True)
            assert sum(isinstance(result, CallsError) for result in results) == 1
            assert len(commands) == 16 and len({frame["requestId"] for frame in commands}) == 16
            assert (
                next(result for result in results if isinstance(result, CallsError)).code
                == "media_control_unavailable"
            )
            await call.leave()
        finally:
            await client.disconnect()


async def test_actual_lifecycle_4401_refresh_reconnect_and_4400_stops():
    attempts, refreshes = [], []
    done = asyncio.Event()

    async def provider(request):
        refreshes.append(request.refresh)
        return "pmfa_ct_" + str(len(refreshes))

    async def handler(request):
        assert not request.query
        socket = web.WebSocketResponse()
        await socket.prepare(request)
        attempts.append(await socket.receive_json())
        await socket.send_json({"type": "ready"})
        await socket.close(code=4401 if len(attempts) == 1 else 4400)
        if len(attempts) == 2:
            done.set()
        return socket

    async with wire(handler) as base:
        lifecycle = LifecycleSocket(
            CallsTokenSource(provider),
            base_url=base,
            heartbeat_interval=0,
            min_backoff=0.01,
            max_backoff=0.01,
        )
        await lifecycle.connect()
        await asyncio.wait_for(done.wait(), 2)
        await asyncio.wait_for(lifecycle._runner, 2)
        assert not lifecycle.connected
        await lifecycle.close()
    assert refreshes == [False, True]
    assert attempts == [
        {"type": "auth", "token": "pmfa_ct_1"},
        {"type": "auth", "token": "pmfa_ct_2"},
    ]


async def test_native_lifecycle_replacement_auth_stays_on_same_socket():
    import time

    replaced = asyncio.Event()
    auth_frames, refreshes = [], []

    async def provider(request):
        refreshes.append(request.refresh)
        return CallsToken(
            "pmfa_ct_" + str(len(refreshes)), time.time() + (1.1 if len(refreshes) == 1 else 120)
        )

    async def handler(request):
        socket = web.WebSocketResponse()
        await socket.prepare(request)
        auth_frames.append(await socket.receive_json())
        await socket.send_json({"type": "ready"})
        auth_frames.append(await socket.receive_json())
        replaced.set()
        async for message in socket:
            pass
        return socket

    async with wire(handler) as base:
        source = CallsTokenSource(provider, expiry_skew=0)
        lifecycle = LifecycleSocket(source, base_url=base, heartbeat_interval=0)
        try:
            await lifecycle.connect()
            await asyncio.wait_for(replaced.wait(), 3)
            assert lifecycle.connected
        finally:
            await lifecycle.close()
    assert refreshes == [False, True]
    assert auth_frames == [
        {"type": "auth", "token": "pmfa_ct_1"},
        {"type": "auth", "token": "pmfa_ct_2"},
    ]


async def test_terminal_before_native_placement_reply_does_not_open_media():
    lifecycle_socket = []

    async def handler(request):
        if request.path == "/voip/ws":
            socket = web.WebSocketResponse()
            await socket.prepare(request)
            await socket.receive_json()
            lifecycle_socket.append(socket)
            await socket.send_json({"type": "ready"})
            async for message in socket:
                pass
            return socket
        assert request.path == "/messaging/voip/calls" and request.method == "POST"
        assert await request.json() == {"to": "+15551234567", "video": False}
        assert request.headers["idempotency-key"] == "key_fixture"
        await lifecycle_socket[0].send_json(
            {
                "type": "event",
                "event": "call.ended",
                "callId": "call_early",
                "payload": {"reason": "busy"},
                "timestamp": "now",
            }
        )
        await asyncio.sleep(0)
        return web.json_response(
            {"data": {"callId": "call_early", "status": "calling", "video": False}}
        )

    async with wire(handler) as base:
        client = CallsClient(
            CLIENT, "support", participant="ignored", base_url=base, lifecycle_heartbeat_interval=0
        )
        try:
            await client.connect()
            call = await client.place("+15551234567", idempotency_key="key_fixture")
            await asyncio.wait_for(call.wait_ended(), 2)
            assert call.end_reason == "busy" and not client.calls and call._media is None
        finally:
            await client.disconnect()


async def test_claimed_incoming_never_declines_another_participants_call():
    sent = asyncio.Event()

    async def handler(request):
        assert request.path == "/voip/ws"
        socket = web.WebSocketResponse()
        await socket.prepare(request)
        await socket.receive_json()
        await socket.send_json({"type": "ready", "participant": "client:self"})
        for event, payload in [
            ("call.received", {"from": "+1555"}),
            ("call.accepted", {"answeredBy": "client:other", "exclusive": True}),
        ]:
            await socket.send_json(
                {
                    "type": "event",
                    "event": event,
                    "callId": "claimed",
                    "payload": payload,
                    "timestamp": "now",
                }
            )
        sent.set()
        async for message in socket:
            pass
        return socket

    async with wire(handler) as base:
        client = CallsClient(CLIENT, "support", base_url=base, lifecycle_heartbeat_interval=0)
        try:
            await client.connect()
            call = await client.incoming.get()
            await sent.wait()
            while not call.claim.claimed_by_other:
                await asyncio.sleep(0)
            with pytest.raises(ConflictError):
                await call.answer()
            await call.reject()
            assert call.end_reason == "claimed"
        finally:
            await client.disconnect()
