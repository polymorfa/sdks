"""Held producer routes lack replay ledgers, even with an explicit caller key."""

import base64
from collections import Counter

import pytest
from aiohttp import web

from polymorfa import AsyncMessagingClient, Credential, PolymorfaError
from polymorfa.direct_media import DirectMediaApi
from polymorfa.media_encrypt import prepare_whatsapp_upload
from polymorfa.transport import RequestOptions, Transport

KEY = Credential("organization_api_key", "pmfa_" + "a" * 72)


@pytest.mark.parametrize("operation", ["grant", "relay", "retry", "delete"])
@pytest.mark.parametrize("outcome", ["drop", "429", "503"])
@pytest.mark.parametrize("policy", ["keyed", "unkeyed", "default"])
async def test_unledgered_submission(operation, outcome, policy, unused_tcp_port):
    seen = []

    async def handle(request):
        body = await request.read()
        seen.append((request.path, dict(request.headers), body))
        if outcome == "drop":
            request.transport.abort()
            return web.Response()
        return web.json_response(
            {"error": {"code": "fixture_failure", "message": "unknown outcome"}},
            status=int(outcome),
            headers={"Retry-After": "0", "X-Request-Id": "unledgered"},
        )

    app = web.Application()
    app.router.add_route("*", "/{path:.*}", handle)
    runner = web.AppRunner(app)
    await runner.setup()
    await web.TCPSite(runner, "127.0.0.1", unused_tcp_port).start()
    options = RequestOptions(
        max_network_retries=None if policy == "default" else 1,
        idempotency_key="caller-key" if policy == "keyed" else None,
        headers={"x-caller": "retained"},
    )
    try:
        transport = Transport(
            KEY, base_url=f"http://127.0.0.1:{unused_tcp_port}", max_network_retries=1
        )
        try:
            api = DirectMediaApi(transport)
            async with AsyncMessagingClient(
                KEY, base_url=f"http://127.0.0.1:{unused_tcp_port}", max_network_retries=1
            ) as sdk:
                body = await prepare_whatsapp_upload(b"fixture", media_type="image")
                info = body.info
                with pytest.raises(PolymorfaError) as failure:
                    if operation == "grant":
                        await api.create_upload_grant("s", info, options=options)
                    elif operation == "relay":
                        await api.relay_upload("s", body, options=options)
                    elif operation == "retry":
                        await sdk.history_sync.request_chunk_retry(
                            "s", {"syncType": "RECENT", "chunkOrder": 1}, options=options
                        )
                    else:
                        await sdk.history_sync.delete_chunk(
                            "s",
                            {
                                "directPath": "/chunk",
                                "fileEncSha256": base64.b64encode(bytes(32)).decode(),
                            },
                            options=options,
                        )
                assert len(seen) == 1
                headers = {k.lower(): v for k, v in seen[0][1].items()}
                assert headers["authorization"] == "Bearer " + KEY.value
                assert headers["x-caller"] == "retained"
                assert headers["polymorfa-version"] == "2026-10-14"
                assert headers.get("idempotency-key") == (
                    "caller-key" if policy == "keyed" else None
                )
                if operation == "relay":
                    assert len(seen[0][2]) == info.encrypted_length
                if outcome == "drop":
                    assert failure.value.code == "connection_error"
                else:
                    assert failure.value.status == int(outcome)
                    assert failure.value.code == "fixture_failure"
                    assert failure.value.request_id == "unledgered"
                    assert failure.value.metadata.attempts == 1
        finally:
            await transport.close()
    finally:
        await runner.cleanup()


async def test_established_send_and_get_retry(unused_tcp_port):
    counts = Counter()

    async def handle(request):
        await request.read()
        counts[request.path] += 1
        if counts[request.path] == 1:
            return web.json_response(
                {"error": {"code": "busy"}}, status=503, headers={"Retry-After": "0"}
            )
        return web.json_response({"success": True, "data": {"id": "message", "status": "sent"}})

    app = web.Application()
    app.router.add_route("*", "/{path:.*}", handle)
    runner = web.AppRunner(app)
    await runner.setup()
    await web.TCPSite(runner, "127.0.0.1", unused_tcp_port).start()
    try:
        async with AsyncMessagingClient(
            KEY, base_url=f"http://127.0.0.1:{unused_tcp_port}", max_network_retries=1
        ) as sdk:
            await sdk.messages.send(
                "s",
                {"conversation": {"phoneNumber": "+15550001111"}, "content": {"text": "fixture"}},
                options=RequestOptions(idempotency_key="send-key", max_network_retries=1),
            )
            await sdk.sessions.retrieve("s", options=RequestOptions(max_network_retries=1))
        assert list(counts.values()) == [2, 2]
    finally:
        await runner.cleanup()
