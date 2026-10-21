"""Existing borrowed project views retain root ownership over actual native HTTP."""

import asyncio
import json
from dataclasses import FrozenInstanceError

import httpx
import pytest

from polymorfa import AsyncClient, AsyncProjectClient, ConfigurationError, Credential


@pytest.mark.parametrize("close_failure", [False, True])
async def test_native_borrowed_project_lifetime_and_owner_failure(close_failure):
    handlers = set()
    requests = []
    failures = []

    class NativeTransport(httpx.AsyncHTTPTransport):
        closes = 0

        async def aclose(self):
            self.closes += 1
            await super().aclose()
            if close_failure:
                raise RuntimeError("owner close failed")

    async def serve(reader, writer):
        handlers.add(asyncio.current_task())
        try:
            raw = await reader.readuntil(b"\r\n\r\n")
            request = raw.decode()
            assert "Authorization: Bearer pmfa_AAECAwQFBgcICQoLDA0ODxAREhM73f-k" in request
            requests.append(request.split("\r\n")[0])
            body = json.dumps({"data": {"id": "event"}}).encode()
            writer.write(
                b"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nConnection: close\r\nContent-Length: "
                + str(len(body)).encode()
                + b"\r\n\r\n"
                + body
            )
            await writer.drain()
        except Exception as error:  # noqa: BLE001 - expose every native fixture failure to the test.
            failures.append(error)
        finally:
            writer.close()
            await writer.wait_closed()
            handlers.discard(asyncio.current_task())

    server = await asyncio.start_server(serve, "127.0.0.1", 0)
    native = NativeTransport()
    root = AsyncClient(
        Credential(
            "organization_api_key",
            "pmfa_AAECAwQFBgcICQoLDA0ODxAREhM73f-k",
        ),
        base_url=f"http://127.0.0.1:{server.sockets[0].getsockname()[1]}",
        http_transport=native,
        max_network_retries=0,
    )
    try:
        one, two = root.project("project-one"), root.project("project-two")
        async with one:
            await one.events.retrieve("event")
        await one.close()
        assert native.closes == 0
        with pytest.raises(RuntimeError, match="application"):
            async with root.project("project-three"):
                raise RuntimeError("application failure")
        assert native.closes == 0
        with pytest.raises(ConfigurationError):
            one.project("project-two")
        with pytest.raises(FrozenInstanceError):
            one.project_id = "project-two"
        await two.events.retrieve("event")
        await root.raw.request("GET", "/platform/projects")
        assert requests == [
            "GET /platform/projects/project-one/events/event HTTP/1.1",
            "GET /platform/projects/project-two/events/event HTTP/1.1",
            "GET /platform/projects HTTP/1.1",
        ]
        assert not failures
        if close_failure:
            with pytest.raises(RuntimeError, match="owner close failed"):
                await root.close()
        else:
            await root.close()
        assert native.closes == 1
        await root.close()
        assert native.closes == 1
    finally:
        server.close()
        await server.wait_closed()
        if handlers:
            await asyncio.wait_for(asyncio.gather(*list(handlers), return_exceptions=True), 2)


async def test_independently_owned_project_closes_its_native_transport_once():
    class NativeTransport(httpx.AsyncHTTPTransport):
        closes = 0

        async def aclose(self):
            self.closes += 1
            await super().aclose()

    transport = NativeTransport()
    async with AsyncProjectClient(
        Credential(
            "project_token",
            "pmfa_pt_AAECAwQFBgcICQoLDA0ODxAREhM73f-k",
        ),
        "project-one",
        http_transport=transport,
    ) as project:
        assert project.project("project-one") is project
        with pytest.raises(ConfigurationError):
            project.project("project-two")
    await project.close()
    assert transport.closes == 1
