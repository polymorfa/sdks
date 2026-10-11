import hashlib
import hmac
import json

import httpx
import pytest
from django.conf import settings
from django.test import RequestFactory
from fastapi import FastAPI, Request
from websockets.asyncio.server import serve

from polymorfa import ConfigurationError, Credential, WebhookSignatureError
from polymorfa.calls import (
    AudioFrame,
    MediaSocket,
    VideoFrame,
    decode_media_frame,
    encode_audio_frame,
    encode_video_frame,
)
from polymorfa.integrations import django_webhook_event, fastapi_webhook_event

RAW = b'{"id":"event_1", "session":"support","timestamp":"2026-10-11T00:00:00Z","event":"future.event","payload":{"x":1}}'
SIG = hmac.new(b"secret", RAW, hashlib.sha256).hexdigest()


async def test_fastapi_verifies_raw_body_before_decoding():
    app = FastAPI()

    @app.post("/webhook")
    async def webhook(request: Request):
        try:
            event = await fastapi_webhook_event(request, "secret")
            return {"id": event.id, "known": event.known}
        except WebhookSignatureError:
            from fastapi.responses import JSONResponse

            return JSONResponse({"error": "invalid_signature"}, status_code=400)

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://example.test"
    ) as client:
        result = await client.post("/webhook", content=RAW, headers={"x-webhook-signature": SIG})
        assert result.json() == {"id": "event_1", "known": False}
        assert (
            await client.post("/webhook", content=RAW + b" ", headers={"x-webhook-signature": SIG})
        ).status_code == 400


def test_django_original_request_body_signature():
    if not settings.configured:
        settings.configure(DEFAULT_CHARSET="utf-8")
    request = RequestFactory().post(
        "/webhook", data=RAW, content_type="application/json", HTTP_X_WEBHOOK_SIGNATURE=SIG
    )
    event = django_webhook_event(request, "secret")
    assert event.id == "event_1" and not event.known
    request = RequestFactory().post(
        "/webhook", data=RAW + b" ", content_type="application/json", HTTP_X_WEBHOOK_SIGNATURE=SIG
    )
    with pytest.raises(WebhookSignatureError):
        django_webhook_event(request, "secret")


def test_call_pcm_and_annexb_frames_exact_binary_wire():
    assert encode_audio_frame([1, -32768, 32767]).hex() == "0101000080ff7f"
    assert decode_media_frame(bytes.fromhex("0101000080ff7f")) == AudioFrame((1, -32768, 32767))
    frame = VideoFrame(b"\x00\x00\x00\x01\x65", 123456, True, 42)
    wire = encode_video_frame(frame)
    assert wire.hex() == "0201010000002a000000000001e2400000000165"
    assert decode_media_frame(wire) == frame
    assert decode_media_frame(b"\x01\x00") is None
    with pytest.raises(ConfigurationError):
        MediaSocket(
            Credential("client_token", "pmfa_ct_local"),
            "call_1",
            "connection_1",
            participant="server",
        )


async def test_real_calls_websocket_native_handshake_auth_and_binary_media():
    seen = []

    async def handler(websocket):
        seen.append(websocket.request.path)
        assert websocket.subprotocol == "pmfa.calls.v2"
        auth = json.loads(await websocket.recv())
        assert auth == {"type": "auth", "token": "pmfa_ct_local", "connectionId": "connection_1"}
        await websocket.send(json.dumps({"type": "ready", "sampleRate": 16000, "video": True}))
        assert await websocket.recv() == b"\x01\x01\x00\xff\xff"
        await websocket.send(b"\x01\x02\x00\xfe\xff")
        assert json.loads(await websocket.recv()) == {"type": "leave"}

    async with serve(handler, "127.0.0.1", 0, subprotocols=["pmfa.calls.v2"]) as server:
        port = server.sockets[0].getsockname()[1]
        async with MediaSocket(
            Credential("client_token", "pmfa_ct_local"),
            "call_1",
            "connection_1",
            base_url=f"http://127.0.0.1:{port}",
            heartbeat_interval=0,
        ) as socket:
            assert socket.sample_rate == 16000 and socket.video
            await socket.send_audio([1, -1])
            assert await socket.receive() == AudioFrame((2, -2))
            await socket.leave()
    assert seen == ["/voip/calls/call_1/media"]
