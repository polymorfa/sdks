import asyncio
import base64
import hashlib
import json
from dataclasses import replace

import httpx
import pytest
from aiohttp import web
from test_python_parity import run_mypy

from polymorfa import (
    AsyncMessagingClient,
    ConfigurationError,
    Credential,
    MediaDescriptor,
    MediaIntegrityError,
    decrypt_whatsapp_media,
)
from polymorfa.direct_media import (
    CUSTOMER_OWNED_API_VERSION,
    DirectMediaApi,
    DirectUploadTransport,
    MediaUploadResult,
    base64url_unpadded,
    to_whatsapp_media_send_descriptor,
)
from polymorfa.media_encrypt import (
    encrypt_whatsapp_media,
    encrypt_whatsapp_media_stream,
    prepare_whatsapp_upload,
    whatsapp_encrypted_length,
)
from polymorfa.transport import Transport

KEY = Credential(
    "organization_api_key",
    "pmfa_AAECAwQFBgcICQoLDA0ODxAREhM73f-k",
)
PLAIN = b"Polymorfa golden vector: whatsmeow cbcutil + hkdfutil, 2026."


@pytest.mark.parametrize(
    "kind,ciphertext,digest",
    [
        (
            "image",
            "474233e574aba8c2e6f5c68cd3ea5b7e4cad764538e8593340c36d30d4067b87783033c9ef4b31ce661e6bd986f4a2c01c454eabdf2c3653726639cc1bc8eeb58ddb7d86c09618d427a0",
            "a0f35fa34e6d5bfc21acf306ca610b1b6df743601b02c63d8325fb986faaf7b6",
        ),
        (
            "document",
            "a152af0afcc1abc69708d42cd69405d5f54acb48a16964f8e61ebe26b53d1f07e8eeb87617194a5bcc9781404d5ab4b14ac1e3f51052d7ffbdb4102e3f1996744ea9bd705fff983e5d7c",
            "e6b1be38b195aa06f89ba158a85cbb59235cfcc9bb01d034292b380d6e196b9b",
        ),
    ],
)
async def test_exact_cross_language_encryption_vectors(kind, ciphertext, digest):
    result = await encrypt_whatsapp_media(PLAIN, media_type=kind, media_key=bytes(range(32)))
    assert result.ciphertext.hex() == ciphertext and result.file_enc_sha256.hex() == digest
    assert (
        result.file_sha256.hex()
        == "c090368078d73efad27a94d2d7e357408e56f43b5d20ac99ad23860b829b6a92"
    )
    assert result.encrypted_length == whatsapp_encrypted_length(len(PLAIN))
    assert bytes(range(32)).hex() not in repr(result)


@pytest.mark.parametrize("kind", ["image", "video", "audio", "ptt", "document", "sticker"])
@pytest.mark.parametrize("size", [0, 1, 15, 16, 17, 65537])
async def test_streamed_encryption_block_boundaries_all_kinds(kind, size):
    plaintext = bytes((index * 31) % 256 for index in range(size))

    async def source():
        for index in range(0, size, 13):
            yield plaintext[index : index + 13]

    stream = await encrypt_whatsapp_media_stream(source(), media_type=kind)
    encrypted = b"".join([chunk async for chunk in stream])
    info = await stream.info
    assert len(encrypted) == whatsapp_encrypted_length(size)
    descriptor = MediaDescriptor(
        "audio" if kind == "ptt" else kind,
        info.media_key,
        file_sha256=info.file_sha256,
        file_enc_sha256=info.file_enc_sha256,
        file_length=size,
    )
    assert decrypt_whatsapp_media(encrypted, descriptor) == plaintext


async def test_encryption_limit_stops_source_and_closes_it():
    closed = False

    async def source():
        nonlocal closed
        try:
            yield b"12345"
            pytest.fail("Oversized source must not be pulled again")
        finally:
            closed = True

    with pytest.raises(MediaIntegrityError) as failure:
        await encrypt_whatsapp_media(source(), media_type="image", max_bytes=4)
    await asyncio.sleep(0)
    assert failure.value.code == "media_too_large" and closed


async def test_relay_exact_binary_body_no_media_key_or_plaintext_in_wire():
    seen = []

    async def handler(request):
        seen.append(request)
        assert request.url.path == "/messaging/support/media/uploads"
        assert dict(request.url.params) == {
            "type": "voice",
            "fileEncSha256": base64url_unpadded(hashlib.sha256(request.content).digest()),
            "ptt": "true",
        }
        assert request.headers["polymorfa-version"] == CUSTOMER_OWNED_API_VERSION
        assert request.headers["content-type"] == "application/octet-stream"
        assert int(request.headers["content-length"]) == len(request.content)
        assert request.headers["authorization"] == "Bearer " + KEY.value
        assert PLAIN not in request.content
        return httpx.Response(
            200,
            json={
                "success": True,
                "data": {"directPath": "/media/a", "url": "https://mmg.whatsapp.net/media/a"},
            },
        )

    async with AsyncMessagingClient(KEY, http_transport=httpx.MockTransport(handler)) as client:
        result = await client.whatsapp_media.upload(
            "support", PLAIN, media_type="ptt", mimetype="audio/ogg"
        )
    assert result.egress == "relay" and len(seen) == 1
    assert result.media_key not in seen[0].content


async def test_real_http_relay_stream_preserves_content_length_and_hash():
    seen = []

    async def handler(request):
        raw = await request.read()
        seen.append(raw)
        assert request.headers["Authorization"] == "Bearer " + KEY.value
        assert int(request.headers["Content-Length"]) == len(raw)
        assert request.query["fileEncSha256"] == base64url_unpadded(hashlib.sha256(raw).digest())
        return web.json_response(
            {
                "success": True,
                "data": {"directPath": "/media/a", "url": "https://mmg.whatsapp.net/media/a"},
            }
        )

    app = web.Application()
    app.router.add_post("/messaging/support/media/uploads", handler)
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "127.0.0.1", 0)
    await site.start()
    port = next(iter(runner.addresses))[1]
    try:
        async with AsyncMessagingClient(KEY, base_url=f"http://127.0.0.1:{port}") as client:
            result = await client.whatsapp_media.upload(
                "support", PLAIN, media_type="image", mimetype="image/jpeg"
            )
        assert len(seen) == 1 and result.media_key not in seen[0]
    finally:
        await runner.cleanup()


async def direct_fixture(
    source=b"plaintext", *, media_type="image", provider=None, part_size=50 * 1024 * 1024
):
    body = await prepare_whatsapp_upload(source, media_type=media_type)
    grants = []

    def api_handler(request):
        grants.append(json.loads(request.content))
        assert request.headers["polymorfa-version"] == "2026-10-14"
        assert set(grants[-1]) <= {"type", "fileEncSha256", "ptt"}
        hash_value = base64url_unpadded(body.info.file_enc_sha256)
        return httpx.Response(
            200,
            json={
                "success": True,
                "data": {
                    "uploadUrl": f"https://mmg.whatsapp.net/mms/{media_type}/{hash_value}?auth=grant-{len(grants)}&token=exact&media_id=retained",
                    "host": "mmg.whatsapp.net",
                    "expiresAt": 1792000000,
                },
            },
        )

    transport = Transport(KEY, http_transport=httpx.MockTransport(api_handler))
    uploader = DirectUploadTransport(
        DirectMediaApi(transport),
        http_transport=httpx.MockTransport(provider),
        document_part_size=part_size,
    )
    try:
        return await uploader.upload("support", body), body, grants
    finally:
        await transport.close()


async def test_direct_grant_url_and_absence_of_api_credentials():
    def provider(request):
        assert (
            "authorization" not in request.headers
            and "cookie" not in request.headers
            and "polymorfa-version" not in request.headers
        )
        assert (
            request.url.params["auth"] == "grant-1"
            and request.url.params["token"] == "exact"
            and request.url.params["media_id"] == "retained"
        )
        assert request.headers["origin"] == "https://web.whatsapp.com"
        return httpx.Response(
            200, json={"direct_path": "/media/a", "url": "https://mmg.whatsapp.net/media/a"}
        )

    result, _, grants = await direct_fixture(provider=provider)
    assert result.direct_path == "/media/a" and len(grants) == 1


async def test_direct_refresh_401_and_resume_exact_remaining_bytes():
    calls, first = [], b""

    def provider(request):
        nonlocal first
        calls.append(request)
        if len(calls) == 1:
            first = request.content
            return httpx.Response(401)
        assert request.url.params["auth"] == "grant-2"
        if "resume" in request.url.params:
            return httpx.Response(200, json={"resume": "7"})
        assert request.content == first[7:] and request.url.params["bytestart"] == "7"
        assert int(request.headers["content-length"]) == len(first) - 7
        return httpx.Response(
            200, json={"direct_path": "/media/a", "url": "https://mmg.whatsapp.net/media/a"}
        )

    _, _, grants = await direct_fixture(provider=provider)
    assert len(calls) == 3 and len(grants) == 2


@pytest.mark.parametrize(
    "status,code",
    [
        (413, "media_too_large"),
        (415, "media_upload_hash_mismatch"),
        (507, "media_upload_throttled"),
        (302, "media_upload_failed"),
    ],
)
async def test_direct_final_refusal_never_retries_or_exposes_grant(status, code):
    calls = 0

    def provider(request):
        nonlocal calls
        calls += 1
        return httpx.Response(status, headers={"location": "https://attacker.example/"})

    with pytest.raises(Exception) as failure:
        await direct_fixture(provider=provider)
    assert failure.value.code == code and calls == 1
    assert "grant-1" not in str(failure.value) and "attacker" not in str(failure.value)


async def test_document_parts_share_second_pass_and_finalize_after_eof():
    opened = 0
    parts = []

    async def source():
        nonlocal opened
        opened += 1
        yield b"a" * 100

    def provider(request):
        if "final_hash" in request.url.params:
            assert opened == 2
            return httpx.Response(
                200, json={"direct_path": "/media/a", "url": "https://mmg.whatsapp.net/media/a"}
            )
        parts.append(request.content)
        assert request.url.params["stream"] == "1"
        return httpx.Response(200)

    _, body, _ = await direct_fixture(
        source, media_type="document", provider=provider, part_size=19
    )
    assert len(b"".join(parts)) == body.info.encrypted_length and opened == 2


async def test_changed_reopenable_source_refuses_finalization():
    opened, finalized = 0, False

    async def source():
        nonlocal opened
        opened += 1
        yield (b"a" if opened == 1 else b"b") * 100

    def provider(request):
        nonlocal finalized
        finalized |= "final_hash" in request.url.params
        return httpx.Response(200)

    with pytest.raises(MediaIntegrityError) as failure:
        await direct_fixture(source, media_type="document", provider=provider, part_size=19)
    assert failure.value.code == "media_enc_hash_mismatch" and not finalized


async def test_descriptor_send_selects_revision_and_sticker_is_distinct():
    encrypted = await encrypt_whatsapp_media(b"webp", media_type="sticker", mimetype="image/webp")
    upload = MediaUploadResult(
        encrypted.media_type,
        encrypted.media_key,
        encrypted.file_sha256,
        encrypted.file_enc_sha256,
        encrypted.file_length,
        encrypted.encrypted_length,
        encrypted.mimetype,
        "/media/a",
        "https://mmg.whatsapp.net/media/a",
    )
    descriptor = to_whatsapp_media_send_descriptor(upload, width=512, height=512, is_animated=True)

    def handler(request):
        assert request.headers["polymorfa-version"] == "2026-10-14"
        assert json.loads(request.content)["content"] == {"sticker": {"descriptor": descriptor}}
        return httpx.Response(200, json={"success": True, "data": {"id": "sent"}})

    async with AsyncMessagingClient(KEY, http_transport=httpx.MockTransport(handler)) as client:
        await client.messages.send(
            "support",
            {"conversation": {"id": "chat"}, "content": {"sticker": {"descriptor": descriptor}}},
        )
    for fields in (
        {"thumbnail": b"x"},
        {"mimetype": "image/png"},
        {"seconds": 1},
        {"width": 0, "height": 2},
    ):
        with pytest.raises(ConfigurationError):
            to_whatsapp_media_send_descriptor(upload, **fields)
    with pytest.raises(ConfigurationError):
        to_whatsapp_media_send_descriptor(replace(upload, media_type="image"), is_animated=True)


async def test_history_recovery_commands_wire_and_client_token_refusal():
    requests = []
    encrypted_hash = base64.b64encode(bytes([251, 255]) * 16).decode("ascii")

    def handler(request):
        requests.append(request)
        assert request.headers["polymorfa-version"] == "2026-10-14"
        if request.url.path.endswith("/delete"):
            assert json.loads(request.content)["fileEncSha256"] == encrypted_hash
            return httpx.Response(200, json={"success": True, "data": {"status": "deleted"}})
        return httpx.Response(
            200, json={"success": True, "data": {"requestId": "retry-id", "status": "requested"}}
        )

    async with AsyncMessagingClient(KEY, http_transport=httpx.MockTransport(handler)) as client:
        result = await client.history_sync.request_chunk_retry(
            "support",
            {"syncType": "FULL", "chunkOrder": 0, "chunkMessageId": "notice:1", "regenerate": True},
        )
        assert result["requestId"] == "retry-id"
        await client.history_sync.delete_chunk(
            "support",
            {
                "directPath": "/history/a",
                "fileEncSha256": encrypted_hash,
                "encHandle": "handle",
                "companionMetaNonce": "nonce",
            },
        )
        with pytest.raises(ConfigurationError):
            await client.history_sync.request_chunk_retry(
                "support", {"syncType": "FULL", "chunkOrder": -1}
            )
    assert [r.url.path for r in requests] == [
        "/messaging/support/history/chunks/retry",
        "/messaging/support/history/media/delete",
    ]
    async with AsyncMessagingClient(
        Credential("client_token", "pmfa_ct_Zml4dHVyZQ"), http_transport=httpx.MockTransport(handler)
    ) as client:
        with pytest.raises(ConfigurationError):
            await client.history_sync.request_chunk_retry(
                "support", {"syncType": "FULL", "chunkOrder": 0}
            )
    assert len(requests) == 2


@pytest.mark.parametrize(
    "invalid",
    [
        {"fileEncSha256": base64.urlsafe_b64encode(bytes([251, 255]) * 16).decode("ascii")},
        {"fileEncSha256": base64.b64encode(bytes(32)).decode("ascii").rstrip("=")},
        {"fileEncSha256": base64.b64encode(bytes(31)).decode("ascii")},
        {"fileEncSha256": base64.b64encode(bytes(33)).decode("ascii")},
        {"directPath": "/" + "a" * 1024},
        {"directPath": "/history/a:b"},
        {"directPath": "/history/a b"},
        {"directPath": "/history/\u00e9"},
        {"encHandle": "a" * 513},
        {"encHandle": "handle?query"},
        {"companionMetaNonce": "a" * 513},
        {"companionMetaNonce": "nonce&value"},
        {"companionMetaNonce": ""},
    ],
)
async def test_history_deletion_refuses_invalid_contract_fields_before_io(invalid):
    def handler(request):
        pytest.fail("Invalid history deletion must be rejected before HTTP")

    body = {
        "directPath": "/history/a",
        "fileEncSha256": base64.b64encode(bytes(32)).decode("ascii"),
    }
    async with AsyncMessagingClient(KEY, http_transport=httpx.MockTransport(handler)) as client:
        with pytest.raises(ConfigurationError):
            await client.history_sync.delete_chunk("support", body | invalid)


async def test_history_deletion_accepts_api_path_and_handle_boundaries():
    body = {
        "directPath": "/" + "a" * 1023,
        "fileEncSha256": base64.b64encode(bytes([251, 255]) * 16).decode("ascii"),
        "encHandle": "A._~%/=+-" + "a" * 503,
        "companionMetaNonce": "A._~%/=+-" + "b" * 503,
    }

    def handler(request):
        assert json.loads(request.content) == body
        return httpx.Response(200, json={"success": True, "data": {"status": "deleted"}})

    async with AsyncMessagingClient(KEY, http_transport=httpx.MockTransport(handler)) as client:
        await client.history_sync.delete_chunk("support", body)


def test_descriptor_and_sticker_static_source_contracts():
    valid = run_mypy("""
from polymorfa.direct_media import MediaSendDescriptor
from polymorfa.message_content import Content
descriptor: MediaSendDescriptor = {"directPath":"/a", "url":"https://mmg.whatsapp.net/a", "mimeType":"image/webp", "fileLength":1, "mediaKey":"a", "fileSha256":"b", "fileEncSha256":"c"}
sticker: Content = {"sticker":{"descriptor":descriptor}}
image: Content = {"image":{"descriptor":descriptor,"caption":"hello"}}
""")
    assert valid.returncode == 0, valid.stdout
    invalid = run_mypy("""
from polymorfa.direct_media import MediaSendDescriptor
from polymorfa.message_content import Content
descriptor: MediaSendDescriptor = {"directPath":"/a", "url":"https://mmg.whatsapp.net/a", "mimeType":"image/webp", "fileLength":1, "mediaKey":"a", "fileSha256":"b", "fileEncSha256":"c"}
sticker: Content = {"sticker":{"descriptor":descriptor,"caption":"forbidden"}}
image: Content = {"image":{"descriptor":descriptor,"url":"https://other.example/a"}}
""")
    assert invalid.returncode != 0 and invalid.stdout.count("error:") == 2
