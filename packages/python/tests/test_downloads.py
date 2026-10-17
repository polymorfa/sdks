import asyncio
import json
from datetime import datetime, timezone

import httpx
import pytest

from polymorfa import (
    AsyncClient,
    AsyncMessagingClient,
    ConnectionError,
    Credential,
    RequestOptions,
    ServerError,
    TimeoutError,
)
from polymorfa.downloads import signed_url_expiry

INFO = {
    "id": "media_1",
    "session": "support",
    "messageId": "message_1",
    "mimeType": "image/jpeg",
    "fileLength": 5,
    "persisted": True,
    "s3Url": None,
}
CASES = [
    (
        "messaging",
        "GET",
        "/messaging/media/media_1/info",
        None,
        {"success": True, "data": INFO},
        lambda c, o: c.media.retrieve("media_1", options=o),
    ),
    (
        "messaging",
        "POST",
        "/messaging/media/media_1/download-and-save",
        None,
        {"success": True, "message": "Saved"},
        lambda c, o: c.media.persist("media_1", options=o),
    ),
    (
        "platform",
        "GET",
        "/platform/media/media_1",
        None,
        {"data": {"future": {"preserved": True}}},
        lambda c, o: c.media.retrieve("media_1", options=o),
    ),
    (
        "platform",
        "DELETE",
        "/platform/media/media_1",
        None,
        {"data": {"removed": True}},
        lambda c, o: c.media.delete("media_1", options=o),
    ),
    (
        "platform",
        "POST",
        "/platform/media/uploads",
        {"fileName": "photo.jpg"},
        {"data": {"uploadUrl": "https://example.invalid/upload", "storageId": "storage_1"}},
        lambda c, o: c.media.create_upload({"fileName": "photo.jpg"}, options=o),
    ),
]


@pytest.mark.parametrize("case", CASES)
async def test_typed_media_public_json_routes(case):
    surface, method, path, body, data, invoke = case

    def handler(request):
        assert request.method == method and request.url.path == path
        assert (json.loads(request.content) if request.content else None) == body
        assert request.headers["x-proof"] == "media"
        return httpx.Response(200, json=data, headers={"x-request-id": "req_media"})

    cls = AsyncMessagingClient if surface == "messaging" else AsyncClient
    async with cls(
        Credential("organization_api_key", "pmfa_" + "a" * 72),
        http_transport=httpx.MockTransport(handler),
    ) as client:
        result = await invoke(client, RequestOptions(headers={"x-proof": "media"}))
        assert result.data == data and result.metadata.request_id == "req_media"


@pytest.mark.parametrize("helper", ["download", "download_stream", "download_file", "download_url"])
@pytest.mark.parametrize("redirect", [False, True])
async def test_all_media_binary_helpers_and_storage_credential_isolation(helper, redirect):
    requests = []
    location = (
        "https://storage.example.invalid/object?X-Amz-Date=20261011T000000Z&X-Amz-Expires=300"
    )

    def handler(request):
        requests.append(request)
        if request.url.host == "storage.example.invalid":
            assert not any(
                name in request.headers
                for name in [
                    "authorization",
                    "polymorfa-version",
                    "idempotency-key",
                    "x-proof",
                    "cookie",
                ]
            )
            return httpx.Response(
                200,
                content=b"media",
                headers={
                    "content-type": "image/jpeg",
                    "content-disposition": 'attachment; filename="photo.jpg"',
                    "content-length": "5",
                },
            )
        assert (
            request.url.path == "/messaging/media/media_1" and request.headers["x-proof"] == "media"
        )
        if redirect:
            return httpx.Response(
                302, headers={"location": location, "x-request-id": "req_download"}
            )
        return httpx.Response(
            200,
            content=b"media",
            headers={
                "content-type": "image/jpeg",
                "content-disposition": 'attachment; filename="photo.jpg"',
                "content-length": "5",
                "x-request-id": "req_download",
            },
        )

    async with AsyncMessagingClient(
        Credential("organization_api_key", "pmfa_" + "a" * 72),
        http_transport=httpx.MockTransport(handler),
    ) as client:
        result = await getattr(client.media, helper)(
            "media_1",
            options=RequestOptions(headers={"x-proof": "media"}, idempotency_key="api_key"),
        )
        if helper == "download":
            assert result.data == b"media" and result.metadata.request_id == "req_download"
        elif helper == "download_stream":
            assert (
                result.redirected is redirect
                and result.content_length == 5
                and result.content_type == "image/jpeg"
                and result.filename == "photo.jpg"
                and result.request_id == "req_download"
            )
            assert b"".join([chunk async for chunk in result]) == b"media"
            with pytest.raises(RuntimeError):
                await result.read()
        elif helper == "download_file":
            assert (
                result.data == b"media"
                and result.content_type == "image/jpeg"
                and result.filename == "photo.jpg"
                and result.request_id == "req_download"
            )
        else:
            assert result.streamed is not redirect and result.url == (
                location if redirect else None
            )
            assert result.request_id == "req_download"
            assert result.expires_at == (
                datetime(2026, 10, 11, 0, 5, tzinfo=timezone.utc) if redirect else None
            )
            assert "X-Amz-" not in repr(result)
    assert len(requests) == (2 if redirect and helper != "download_url" else 1)


@pytest.mark.parametrize(
    "location",
    [
        "http://example.invalid",
        "https://user:password@example.invalid",
        "//user:password@example.invalid",
        "javascript:alert(1)",
        "",
    ],
)
async def test_invalid_storage_redirect_metadata_preserved(location):
    async with AsyncMessagingClient(
        Credential("organization_api_key", "pmfa_" + "a" * 72),
        http_transport=httpx.MockTransport(
            lambda r: httpx.Response(
                302, headers={"location": location, "x-request-id": "req_invalid"}
            )
        ),
    ) as client:
        with pytest.raises(ServerError) as caught:
            await client.media.download("media_1")
        assert (
            caught.value.code == "invalid_redirect"
            and caught.value.metadata.request_id == "req_invalid"
        )


class BrokenBody(httpx.AsyncByteStream):
    async def __aiter__(self):
        yield b"part"
        raise httpx.ReadError("truncated")


class TimedBody(httpx.AsyncByteStream):
    async def __aiter__(self):
        raise httpx.ReadTimeout("body timeout")
        yield b""


@pytest.mark.parametrize("body,error", [(BrokenBody, ConnectionError), (TimedBody, TimeoutError)])
async def test_body_failure_after_operation_admission_preserves_metadata_and_never_retries(
    body, error
):
    requests = []

    def handler(request):
        requests.append(request)
        return httpx.Response(
            200,
            stream=body(),
            headers={"x-request-id": "req_body", "x-polymorfa-operation-id": "op_1"},
        )

    async with AsyncMessagingClient(
        Credential("organization_api_key", "pmfa_" + "a" * 72),
        http_transport=httpx.MockTransport(handler),
    ) as client:
        with pytest.raises(error) as caught:
            await client.media.download("media_1")
        assert (
            caught.value.metadata.request_id == "req_body"
            and caught.value.metadata.operation_id == "op_1"
        )
    assert len(requests) == 1


@pytest.mark.parametrize(
    "value,expected",
    [
        (
            "https://example.invalid?Expires=1700000000",
            datetime.fromtimestamp(1700000000, timezone.utc),
        ),
        (
            "https://example.invalid?X-Amz-Date=20261011T000000Z&X-Amz-Expires=300",
            datetime(2026, 10, 11, 0, 5, tzinfo=timezone.utc),
        ),
        ("https://example.invalid?Expires=not_date", None),
        ("https://example.invalid?X-Amz-Date=20269911T000000Z&X-Amz-Expires=300", None),
    ],
)
def test_signed_url_expiry(value, expected):
    assert signed_url_expiry(value) == expected


async def test_actual_unbuffered_media_stream_and_task_cancellation():
    admitted = asyncio.Event()
    disconnected = asyncio.Event()
    allow_tail = asyncio.Event()

    async def server(reader, writer):
        headers = await reader.readuntil(b"\r\n\r\n")
        assert b"GET /messaging/media/media_1 " in headers
        writer.write(
            b"HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\nContent-Type: image/jpeg\r\nX-Request-ID: req_native\r\n\r\n5\r\nfirst\r\n"
        )
        await writer.drain()
        admitted.set()
        wait = asyncio.create_task(allow_tail.wait())
        disconnect = asyncio.create_task(reader.read())
        done, pending = await asyncio.wait({wait, disconnect}, return_when=asyncio.FIRST_COMPLETED)
        for task in pending:
            task.cancel()
        await asyncio.gather(*pending, return_exceptions=True)
        if disconnect in done:
            disconnected.set()
        writer.close()
        await writer.wait_closed()

    native = await asyncio.start_server(server, "127.0.0.1", 0)
    try:
        url = f"http://127.0.0.1:{native.sockets[0].getsockname()[1]}"
        async with AsyncMessagingClient(
            Credential("organization_api_key", "pmfa_" + "a" * 72), base_url=url
        ) as client:
            stream = await client.media.download_stream("media_1")
            iterator = stream.__aiter__()
            assert await anext(iterator) == b"first"
            assert stream.request_id == "req_native"
            pending = asyncio.create_task(anext(iterator))
            await admitted.wait()
            pending.cancel()
            with pytest.raises(asyncio.CancelledError):
                await pending
            await asyncio.wait_for(disconnected.wait(), 1)
    finally:
        native.close()
        await native.wait_closed()
