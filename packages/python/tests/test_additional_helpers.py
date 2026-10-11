import hashlib
import hmac

import pytest
from aiohttp import web
from test_calls_runtime import SERVER, wire

from polymorfa import (
    FLOW_FORWARD_SIGNATURE_HEADER,
    AsyncMessagingClient,
    Credential,
    parse_content_disposition_filename,
    verify_flow_forward_signature,
)


@pytest.mark.parametrize(
    "header,expected",
    [
        (None, None),
        ('attachment; filename="plain.txt"', "plain.txt"),
        ("attachment; filename=plain.txt; filename*=UTF-8''caf%C3%A9.txt", "café.txt"),
        ("attachment; filename*=ISO-8859-1'en'%E9.txt", "é.txt"),
        ("attachment; filename=plain.txt; filename*=UTF-8''%FF.txt", "plain.txt"),
        ("attachment; filename=plain.txt; filename*=UTF-8''bad%GG", "plain.txt"),
        ("attachment; filename=plain.txt; filename*=unknown''name.txt", "plain.txt"),
        ('attachment; filename="one;two.txt"', "one;two.txt"),
        ('attachment; filename="../private/name\x00.txt"', "name.txt"),
        ('attachment; filename="C:\\\\private\\\\name.txt"', "name.txt"),
        ('attachment; filename="quote\\".txt"', 'quote".txt'),
        ("attachment; filename=first.txt; filename=second.txt", "first.txt"),
        ('attachment; filename=".."', None),
        ('attachment; filename=" . "', None),
        ("a" * 8193, None),
    ],
)
def test_content_disposition_exact_filename_precedence_decoding_sanitization(header, expected):
    assert parse_content_disposition_filename(header) == expected


@pytest.mark.parametrize(
    "offset,tolerance,valid",
    [
        (-300, 300, True),
        (300, 300, True),
        (300.1, 300, False),
        (0, -1, False),
        (0, float("nan"), False),
    ],
)
def test_flow_forward_original_timestamp_body_and_tolerance(offset, tolerance, valid):
    body, secret, stamp = b'{"flow": "caf\xc3\xa9"}', "flow-secret", "000000001000"
    signature = (
        hmac.new(secret.encode(), stamp.encode() + b"." + body, hashlib.sha256).hexdigest().upper()
    )
    header = f" t={stamp},v1={signature} "
    assert FLOW_FORWARD_SIGNATURE_HEADER == "x-polymorfa-flow-signature"
    assert (
        verify_flow_forward_signature(
            body, header, secret, now_unix_seconds=1000 + offset, tolerance_seconds=tolerance
        )
        == valid
    )
    assert not verify_flow_forward_signature(body + b" ", header, secret, now_unix_seconds=1000)
    assert not verify_flow_forward_signature(body, header, "wrong", now_unix_seconds=1000)
    assert not verify_flow_forward_signature(body, header, "", now_unix_seconds=1000)
    assert not verify_flow_forward_signature(
        body, "t=1234567890123,v1=" + signature, secret, now_unix_seconds=1000
    )


async def test_native_stored_history_stream_preserves_bytes_metadata_and_display_filename():
    async def handler(request):
        assert (
            request.path == "/messaging/support/chats/person%40example/messages/message_1/media"
            or request.path == "/messaging/support/chats/person@example/messages/message_1/media"
        )
        assert request.headers["authorization"] == "Bearer " + SERVER
        return web.Response(
            body=b"media",
            headers={
                "content-type": "image/jpeg",
                "content-disposition": "attachment; filename=wrong.txt; filename*=UTF-8''..%2Fcaf%C3%A9.jpg",
                "x-request-id": "req_history",
                "polymorfa-version": "2026-09-22",
            },
        )

    async with (
        wire(handler) as base,
        AsyncMessagingClient(Credential("organization_api_key", SERVER), base_url=base) as client,
    ):
        stream = await client.chats.download_message_media_stream(
            "support", "person@example", "message_1"
        )
        assert stream.content_length == 5 and stream.content_type == "image/jpeg"
        assert stream.filename == "café.jpg" and stream.request_id == "req_history"
        assert stream.metadata.api_version == "2026-09-22"
        assert await stream.read() == b"media"


async def test_native_voice_upload_never_sends_api_cookie_or_credential_to_storage():
    from test_voice import AP, ASSET, PROJECT, UPLOAD

    from polymorfa import AsyncClient, RequestOptions

    seen = []

    async def handler(request):
        seen.append(request.path)
        if request.path == "/storage-upload":
            assert await request.read() == b"audio"
            assert all(
                name not in request.headers
                for name in (
                    "authorization",
                    "cookie",
                    "polymorfa-version",
                    "idempotency-key",
                    "x-private",
                )
            )
            assert request.headers["x-upload-token"] == "fixture"
            return web.Response(status=204)
        assert request.headers["authorization"] == "Bearer " + SERVER
        if request.path == AP:
            response = web.json_response(
                {"data": {"asset": ASSET, "upload": {**UPLOAD, "url": base + "/storage-upload"}}}
            )
            response.set_cookie("api-session", "fixture", path="/")
            return response
        assert request.path == AP + "/asset_1/complete"
        assert request.headers["cookie"] == "api-session=fixture"
        assert "idempotency-key" not in request.headers
        return web.json_response({"data": ASSET})

    async with (
        wire(handler) as base,
        AsyncClient(Credential("organization_api_key", SERVER), base_url=base) as client,
    ):
        result = await client.voice.audio.upload(
            "Greeting",
            b"audio",
            "audio/ogg",
            project_id=PROJECT,
            options=RequestOptions(
                idempotency_key="create-only", headers={"x-private": "api-only"}
            ),
        )
        assert result.data["id"] == "asset_1"
        assert seen == [AP, "/storage-upload", AP + "/asset_1/complete"]
