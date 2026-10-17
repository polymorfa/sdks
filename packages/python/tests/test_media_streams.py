import asyncio
import json
import os
import shutil
import ssl
import uuid
from contextlib import asynccontextmanager
from dataclasses import replace
from datetime import datetime, timedelta, timezone
from ipaddress import ip_address
from pathlib import Path

import httpx
import pytest
from aiohttp import web
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import NameOID

from polymorfa import (
    AsyncMessagingClient,
    ConfigurationError,
    ConflictError,
    Credential,
    MediaIntegrityError,
    decode_whatsapp_media,
    decrypt_whatsapp_media_stream,
    descriptor_from_media,
    download_media_to_file,
    download_whatsapp_media_stream,
    download_whatsapp_media_to_file,
    write_stream_to_file,
)

VECTORS = json.loads(
    (Path(__file__).resolve().parents[3] / "contracts/fixtures/whatsapp-media.json").read_text()
)["fixtures"]


async def pieces(data, size=7):
    for start in range(0, len(data), size):
        yield data[start : start + size]


@pytest.mark.parametrize("vector", VECTORS)
@pytest.mark.parametrize("verify", ["before-release", "streaming"])
async def test_incremental_decrypt_independent_vectors_and_no_release_on_failure(vector, verify):
    descriptor = decode_whatsapp_media(vector["descriptor"], vector["kind"])
    encrypted = bytes.fromhex(vector["encrypted"])
    assert b"".join(
        [
            chunk
            async for chunk in decrypt_whatsapp_media_stream(
                pieces(encrypted), descriptor, verify=verify
            )
        ]
    ) == bytes.fromhex(vector["plaintext"])
    released = []
    with pytest.raises(MediaIntegrityError):
        async for chunk in decrypt_whatsapp_media_stream(
            pieces(encrypted), replace(descriptor, file_sha256=b"x" * 32), verify=verify
        ):
            released.append(chunk)
    if verify == "before-release":
        assert not released
    assert (
        descriptor_from_media({"type": vector["kind"], "media": vector["descriptor"]}) == descriptor
    )


class NativeCdnTransport(httpx.AsyncBaseTransport):
    def __init__(self, port, context):
        self.port = port
        self.inner = httpx.AsyncHTTPTransport(verify=context)

    async def handle_async_request(self, request):
        # Only route validated CDN URLs to this TLS fixture; responses come from a real socket.
        assert request.url.host.endswith(".whatsapp.net") and request.url.scheme == "https"
        routed = httpx.Request(
            request.method,
            request.url.copy_with(host="127.0.0.1", port=self.port),
            headers=request.headers,
            stream=request.stream,
            extensions=request.extensions,
        )
        return await self.inner.handle_async_request(routed)

    async def aclose(self):
        await self.inner.aclose()


@asynccontextmanager
async def native_cdn(handler):
    directory = (
        Path(
            os.environ.get(
                "SDK_TEST_ARTIFACT_DIR",
                str(Path.home() / ".polymorfa-agent-work/sdk-tests/python-media"),
            )
        )
        / "media"
        / uuid.uuid4().hex
    )
    directory.mkdir(parents=True)
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "SDK native media fixture")])
    certificate = (
        x509.CertificateBuilder()
        .subject_name(name)
        .issuer_name(name)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(datetime.now(timezone.utc) - timedelta(days=1))
        .not_valid_after(datetime.now(timezone.utc) + timedelta(days=1))
        .add_extension(
            x509.SubjectAlternativeName(
                [x509.IPAddress(ip_address("127.0.0.1")), x509.DNSName("cdn.whatsapp.net")]
            ),
            critical=False,
        )
        .sign(key, hashes.SHA256())
    )
    cert_path, key_path = directory / "certificate.pem", directory / "key.pem"
    cert_path.write_bytes(certificate.public_bytes(serialization.Encoding.PEM))
    key_path.write_bytes(
        key.private_bytes(
            serialization.Encoding.PEM,
            serialization.PrivateFormat.PKCS8,
            serialization.NoEncryption(),
        )
    )
    os.chmod(key_path, 0o600)
    server_context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    server_context.load_cert_chain(cert_path, key_path)
    client_context = ssl.create_default_context(cafile=str(cert_path))
    app = web.Application()
    app.router.add_route("*", "/{path:.*}", handler)
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "127.0.0.1", 0, ssl_context=server_context)
    await site.start()
    try:
        yield (
            NativeCdnTransport(site._server.sockets[0].getsockname()[1], client_context),
            directory,
        )
    finally:
        await runner.cleanup()
        shutil.rmtree(directory)


@pytest.mark.parametrize("vector", VECTORS)
async def test_real_tls_cdn_public_media_helper_and_verified_atomic_file(vector):
    encrypted = bytes.fromhex(vector["encrypted"])
    requests = []

    async def handler(request):
        requests.append(request)
        assert "authorization" not in request.headers and "cookie" not in request.headers
        assert "polymorfa-version" not in request.headers
        assert request.headers["origin"] == "https://web.whatsapp.com"
        assert request.scheme == "https"
        response = web.StreamResponse(headers={"content-length": str(len(encrypted))})
        await response.prepare(request)
        for start in range(0, len(encrypted), 3):
            await response.write(encrypted[start : start + 3])
        await response.write_eof()
        return response

    value = {"type": vector["kind"], "media": vector["descriptor"]}
    async with native_cdn(handler) as (transport, directory):
        client = AsyncMessagingClient(
            Credential(
                "organization_api_key",
                "pmfa_AgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
            )
        )
        try:
            async with await client.media.download_from_whatsapp(
                value, http_transport=transport
            ) as download:
                assert download.media_kind == vector["kind"]
                assert await download.read() == bytes.fromhex(vector["plaintext"])
                with pytest.raises(ConfigurationError):
                    await download.read()
        finally:
            await client.close()
    async with native_cdn(handler) as (transport, directory):
        target = directory / "attachment.bin"
        written = await download_whatsapp_media_to_file(
            value, target, http_transport=transport, overwrite=False
        )
        assert written.path == str(target) and written.bytes == len(
            bytes.fromhex(vector["plaintext"])
        )
        assert target.read_bytes() == bytes.fromhex(vector["plaintext"])
        assert target.stat().st_mode & 0o777 == 0o600
        assert not list(directory.glob("*.partial"))
        with pytest.raises(ConflictError):
            await download_whatsapp_media_to_file(value, target, overwrite=False)
    assert len(requests) == 2


async def test_failed_verification_and_cancelled_file_preserve_original_and_remove_partial():
    vector = VECTORS[0]
    encrypted = bytes.fromhex(vector["encrypted"])
    descriptor = replace(
        decode_whatsapp_media(vector["descriptor"], vector["kind"]), file_sha256=b"x" * 32
    )

    async def handler(request):
        return web.Response(body=encrypted)

    async with native_cdn(handler) as (transport, directory):
        target = directory / "existing.bin"
        target.write_bytes(b"original")
        with pytest.raises(MediaIntegrityError):
            await download_whatsapp_media_to_file(descriptor, target, http_transport=transport)
        assert target.read_bytes() == b"original"
        assert not [path for path in directory.iterdir() if path.name.endswith(".partial")]
        admitted = asyncio.Event()

        async def blocked():
            yield b"secret prefix"
            admitted.set()
            await asyncio.Event().wait()

        task = asyncio.create_task(write_stream_to_file(blocked(), target))
        await admitted.wait()
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task
        assert target.read_bytes() == b"original"
        assert not [path for path in directory.iterdir() if path.name.endswith(".partial")]


async def test_cdn_network_failure_falls_back_but_foreign_redirect_is_rejected_and_cookies_omitted():
    vector = VECTORS[0]
    descriptor = decode_whatsapp_media(vector["descriptor"], vector["kind"])
    requests = []

    def fail_then_return(request):
        requests.append(request)
        if len(requests) == 1:
            raise httpx.ConnectError("private URL must not enter errors", request=request)
        assert "mms-type" in request.url.params
        return httpx.Response(200, content=bytes.fromhex(vector["encrypted"]))

    async with await download_whatsapp_media_stream(
        descriptor, http_transport=httpx.MockTransport(fail_then_return)
    ) as download:
        assert await download.read() == bytes.fromhex(vector["plaintext"])
    assert len(requests) == 2

    async def handler(request):
        assert "cookie" not in request.headers
        if request.path != "/final":
            return web.Response(
                status=302,
                headers={
                    "location": "https://cdn.whatsapp.net/final",
                    "set-cookie": "private=must-not-forward; Path=/",
                },
            )
        return web.Response(body=bytes.fromhex(vector["encrypted"]))

    async with (
        native_cdn(handler) as (transport, _directory),
        await download_whatsapp_media_stream(descriptor, http_transport=transport) as download,
    ):
        assert await download.read() == bytes.fromhex(vector["plaintext"])


async def test_api_media_to_file_retains_metadata_and_bounds_bytes():
    async def handler(request):
        assert request.path == "/messaging/media/media_1" and request.method == "GET"
        assert request.headers["authorization"].startswith("Bearer pmfa_")
        return web.Response(
            body=b"private fixture",
            headers={
                "content-type": "image/jpeg",
                "content-disposition": 'attachment; filename="picture.jpg"',
                "x-request-id": "req_fixture",
            },
        )

    directory = (
        Path(
            os.environ.get(
                "SDK_TEST_ARTIFACT_DIR",
                str(Path.home() / ".polymorfa-agent-work/sdk-tests/python-media"),
            )
        )
        / "media"
        / uuid.uuid4().hex
    )
    directory.mkdir(parents=True)
    app = web.Application()
    app.router.add_route("*", "/{path:.*}", handler)
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "127.0.0.1", 0)
    await site.start()
    try:
        async with AsyncMessagingClient(
            Credential(
                "organization_api_key",
                "pmfa_AgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
            ),
            base_url=f"http://127.0.0.1:{site._server.sockets[0].getsockname()[1]}",
        ) as client:
            target = directory / "media.bin"
            result = await download_media_to_file(client.media, "media_1", target, max_bytes=1024)
            assert (
                result.bytes == 15
                and result.filename == "picture.jpg"
                and result.content_type == "image/jpeg"
                and result.request_id == "req_fixture"
            )
            assert target.read_bytes() == b"private fixture"
            with pytest.raises(MediaIntegrityError) as oversized:
                await download_media_to_file(client.media, "media_1", target, max_bytes=1)
            assert oversized.value.metadata.request_id == "req_fixture"
            assert target.read_bytes() == b"private fixture"
    finally:
        await runner.cleanup()
        shutil.rmtree(directory)
