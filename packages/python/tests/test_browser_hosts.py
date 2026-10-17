"""Actual ASGI HTTP hosts and upstream SDK requests, without synthetic transports."""

import asyncio
import importlib
import socket
import sys
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path

import httpx
import pytest
import uvicorn
from aiohttp import web
from test_calls_runtime import wire

EXAMPLE = Path(__file__).resolve().parents[3] / "examples/python/web_host"
PROJECT_TOKEN = "pmfa_pt_" + "a" * 93 + "A"


@asynccontextmanager
async def running_host(app):
    listening = socket.socket()
    listening.bind(("127.0.0.1", 0))
    ready = asyncio.Event()

    class Server(uvicorn.Server):
        async def startup(self, sockets=None):
            await super().startup(sockets=sockets)
            ready.set()

    server = Server(uvicorn.Config(app, host="127.0.0.1", log_level="error", lifespan="off"))
    task = asyncio.create_task(server.serve(sockets=[listening]))
    try:
        await asyncio.wait_for(ready.wait(), 5)
        yield f"http://127.0.0.1:{listening.getsockname()[1]}"
    finally:
        server.should_exit = True
        await asyncio.wait_for(task, 5)
        listening.close()


@pytest.mark.parametrize("framework", ["fastapi_app", "django_app"])
async def test_native_framework_authenticated_token_host_guards_revocation(framework, monkeypatch):
    mints = []
    links = []

    async def upstream(request):
        if request.path == "/messaging/quicklinks":
            assert request.method == "POST"
            assert request.headers["authorization"] == "Bearer " + PROJECT_TOKEN
            assert request.headers["polymorfa-version"] == "2026-09-22"
            body = await request.json()
            assert body == {
                "purpose": "add_connection",
                "session": "authorized-support",
                "addConnection": "linked_devices",
                "connectionGoal": "hybrid",
            }
            links.append(body)
            return web.json_response(
                {
                    "success": True,
                    "data": {
                        "purpose": "add_connection",
                        "session": "authorized-support",
                        "addConnection": "linked_devices",
                        "connectionGoal": "hybrid",
                        "id": "link",
                        "url": "https://quick.example.test/link",
                        "expiresAt": None,
                    },
                }
            )
        assert request.path == "/platform/client-tokens" and request.method == "POST"
        assert request.headers["authorization"] == "Bearer " + PROJECT_TOKEN
        assert request.headers["polymorfa-version"] == "2026-09-22"
        body = await request.json()
        assert body == {
            "ephemeralId": "example:local-app-user",
            "session": "authorized-support",
            "ttlSeconds": 600,
        }
        mints.append(body)
        return web.json_response(
            {
                "success": True,
                "data": {
                    "token": "pmfa_ct_browser_fixture",
                    "expiresAt": (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat(),
                },
            }
        )

    async with wire(upstream) as api:
        for name, value in {
            "EXAMPLE_APP_USERNAME": "local-user",
            "EXAMPLE_APP_PASSWORD": "local-password",
            "POLYMORFA_PROJECT_TOKEN": PROJECT_TOKEN,
            "POLYMORFA_SESSION": "authorized-support",
            "POLYMORFA_API_BASE_URL": api,
        }.items():
            monkeypatch.setenv(name, value)
        monkeypatch.syspath_prepend(str(EXAMPLE))
        for module in ("host", framework):
            sys.modules.pop(module, None)
        module = importlib.import_module(framework)
        app = module.app if framework == "fastapi_app" else module.application
        async with running_host(app) as origin:
            module.host.origin = origin
            async with httpx.AsyncClient(base_url=origin) as client:
                page = await client.get("/")
                assert 'method="post"' in page.text and "<pmfa-inbox>" not in page.text
                assert (await client.get("/api/login")).status_code == 405
                assert (
                    await client.post("/api/polymorfa/token", headers={"origin": origin})
                ).status_code == 401
                assert (
                    await client.post(
                        "/api/login",
                        content="username=local-user&password=wrong",
                        headers={"origin": origin},
                    )
                ).status_code == 401
                assert (
                    await client.post(
                        "/api/login",
                        content="username=local-user&password=local-password",
                        headers={"origin": "https://foreign.invalid"},
                    )
                ).status_code == 403
                login = await client.post(
                    "/api/login",
                    content="username=local-user&password=local-password",
                    headers={"origin": origin, "hx-request": "true"},
                )
                assert login.status_code == 200 and "<pmfa-inbox>" in login.text
                assert (
                    "httponly" in login.headers["set-cookie"].lower()
                    and "samesite=strict" in login.headers["set-cookie"].lower()
                )
                grant = await client.post(
                    "/api/polymorfa/token",
                    json={"session": "attacker", "ephemeralId": "attacker"},
                    headers={"origin": origin},
                )
                assert grant.status_code == 200 and grant.headers["cache-control"] == "no-store"
                assert grant.json()["value"] == "pmfa_ct_browser_fixture"
                assert grant.json()["grant"]["session"] == "authorized-support"
                assert PROJECT_TOKEN not in grant.text and len(mints) == 1
                assert (await client.get("/api/polymorfa/history/conversations")).json() == {
                    "data": [],
                    "nextCursor": None,
                }
                link = await client.post(
                    "/api/polymorfa/connect",
                    json={"session": "attacker", "purpose": "initial"},
                    headers={"origin": origin},
                )
                assert (
                    link.status_code == 200
                    and link.json()["data"]["url"] == "https://quick.example.test/link"
                    and len(links) == 1
                )
                assert PROJECT_TOKEN not in link.text
                assert (
                    await client.post(
                        "/api/polymorfa/connect", headers={"origin": "https://foreign.invalid"}
                    )
                ).status_code == 403 and len(links) == 1
                copied_cookie = client.cookies.get("polymorfa_example_session")
                assert (
                    await client.post(
                        "/api/logout", headers={"origin": origin, "hx-request": "true"}
                    )
                ).status_code == 200
                denied = await client.post(
                    "/api/polymorfa/token",
                    headers={
                        "origin": origin,
                        "cookie": "polymorfa_example_session=" + copied_cookie,
                    },
                )
                assert denied.status_code == 401 and len(mints) == 1

                assert (
                    await client.post("/api/polymorfa/connect", headers={"origin": origin})
                ).status_code == 401 and len(links) == 1
