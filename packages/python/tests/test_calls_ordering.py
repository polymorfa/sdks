import asyncio

from aiohttp import web
from test_calls_runtime import CLIENT, wire

from polymorfa import CallsClient, LifecycleCandidate


async def test_actual_lifecycle_pending_roster_preserves_progress_capabilities_candidates_shutdown():
    candidate_sent = asyncio.Event()

    async def handler(request):
        assert request.path == "/voip/ws"
        socket = web.WebSocketResponse()
        await socket.prepare(request)
        assert await socket.receive_json() == {"type": "auth", "token": CLIENT}
        await socket.send_json(
            {"type": "ready", "session": "support", "participant": "client:self"}
        )

        async def event(kind, payload):
            await socket.send_json(
                {
                    "type": "event",
                    "event": kind,
                    "callId": "early",
                    "timestamp": "now",
                    "payload": payload,
                }
            )

        await event(
            "call.accepted",
            {"answeredBy": "client:other", "exclusive": False, "capabilities": {"invite": False}},
        )
        for index in range(25):
            await event(
                "call.participant_state",
                {
                    "callId": "early",
                    "participant": {
                        "id": f"peer_{index}",
                        "audioMuted": False,
                        "video": False,
                        "state": "connected",
                    },
                },
            )
        await event(
            "call.participant_left",
            {"callId": "early", "participantId": "peer_24", "reason": "first"},
        )
        await event(
            "call.participant_left",
            {"callId": "early", "participantId": "peer_24", "reason": "duplicate"},
        )
        await event(
            "call.participant_state",
            {
                "callId": "another-call",
                "participant": {
                    "id": "wrong",
                    "audioMuted": False,
                    "video": False,
                    "state": "connected",
                },
            },
        )
        await event(
            "call.received", {"from": "+1555", "hasVideo": True, "capabilities": {"video": False}}
        )
        await socket.send_json(
            {
                "type": "candidate",
                "callId": "early",
                "connectionId": "connection_1",
                "candidate": {"candidate": "remote-ice", "sdpMid": None, "sdpMLineIndex": 1},
            }
        )
        local = await socket.receive_json()
        assert local == {
            "type": "candidate",
            "callId": "early",
            "connectionId": "connection_1",
            "candidate": {"candidate": "local-ice", "sdpMid": "audio", "sdpMLineIndex": 0},
        }
        candidate_sent.set()
        async for _ in socket:
            pass
        return socket

    async with wire(handler) as base:
        client = CallsClient(
            CLIENT, "support", base_url=base, diagnostics=False, lifecycle_heartbeat_interval=0
        )
        try:
            await client.connect()
            ready = await asyncio.wait_for(client.lifecycle.ready.get(), 2)
            assert ready.session == "support" and ready.participant == "client:self"
            call = await asyncio.wait_for(client.incoming.get(), 2)
            assert call.claim.answered and call.claim.answered_by == "client:other"
            assert not call.capabilities.video and not call.capabilities.invite
            assert not call.has_video
            assert [p["id"] for p in call.participants] == [f"peer_{n}" for n in range(18, 24)]
            controls = [call.controls.get_nowait() for _ in range(call.controls.qsize())]
            assert controls[-1] == {
                "type": "participant_left",
                "participantId": "peer_24",
                "reason": "first",
            }
            remote = await asyncio.wait_for(client.candidates.get(), 2)
            assert remote == LifecycleCandidate(
                "early",
                {"candidate": "remote-ice", "sdpMid": None, "sdpMLineIndex": 1},
                "connection_1",
            )
            assert await client.send_candidate(
                "early", "connection_1", "local-ice", sdp_mid="audio", sdp_mline_index=0
            )
            await candidate_sent.wait()
            incoming = client.incoming_calls()
            waiting = asyncio.create_task(anext(incoming))
            await client.disconnect()
            try:
                await asyncio.wait_for(waiting, 2)
            except StopAsyncIteration:
                pass
            else:
                raise AssertionError("Disconnected incoming iterator did not finish")
        finally:
            await client.disconnect()


async def test_actual_media_claimed_frame_precedes_unknown_close_and_never_reconnects():
    media_connections, writes = [], []
    close_media = asyncio.Event()

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
                    "callId": "claimed",
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
            media_connections.append(await socket.receive_json())
            await socket.send_json({"type": "ready", "sampleRate": 16000, "video": False})
            await close_media.wait()
            await socket.send_json(
                {
                    "type": "error",
                    "code": "call_claimed",
                    "message": "Another participant claimed this call.",
                }
            )
            await socket.close(code=1013)
            return socket
        writes.append(request.path)
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
            media_backoff=0.001,
        )
        try:
            await client.connect()
            call = await asyncio.wait_for(client.incoming.get(), 2)
            await call.answer()
            close_media.set()
            await asyncio.wait_for(call._ended_event.wait(), 2)
            assert call.end_reason == "claimed"
            assert len(media_connections) == 1
            assert writes == ["/messaging/voip/calls/claimed/accept"]
        finally:
            await client.disconnect()
