"""Shared loopback application policy; replace with live membership in your app."""

from __future__ import annotations

import hashlib
import hmac
import os
import secrets
import time
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

from jinja2 import Environment, FileSystemLoader, select_autoescape
from polymorfa import AsyncMessagingClient, Credential

ROOT = Path(__file__).resolve().parent
COOKIE = "polymorfa_example_session"
templates = Environment(loader=FileSystemLoader(ROOT / "templates"), autoescape=select_autoescape())


@dataclass(frozen=True)
class Reply:
    status: int
    data: dict[str, object]
    session: str | None = None


class Host:
    def __init__(self) -> None:
        self.username = os.environ["EXAMPLE_APP_USERNAME"]
        self.password = hashlib.sha256(os.environ["EXAMPLE_APP_PASSWORD"].encode()).digest()
        self.session = os.environ["POLYMORFA_SESSION"]
        self.origin = os.environ.get("EXAMPLE_APP_ORIGIN", "http://127.0.0.1:8080")
        self.api = os.environ.get("POLYMORFA_API_BASE_URL", "https://api.polymorfa.com")
        self.credential = Credential("project_token", os.environ["POLYMORFA_PROJECT_TOKEN"])
        if not self.username or not self.session or not os.environ["EXAMPLE_APP_PASSWORD"]:
            raise ValueError("Configure the example account and authorized number.")
        if urlsplit(self.origin).hostname not in ("127.0.0.1", "localhost", "::1"):
            raise ValueError("The example host is restricted to loopback.")
        self.sessions: dict[str, float] = {}

    def authenticated(self, cookie: str | None) -> bool:
        return cookie is not None and self.sessions.get(cookie, 0) > time.time()

    def login(self, body: bytes) -> Reply:
        if len(body) > 16384:
            return Reply(413, {"error": "invalid_sign_in"})
        values = parse_qs(body.decode("utf-8", "replace"))
        username = values.get("username", [""])[0]
        password = values.get("password", [""])[0]
        if not (
            hmac.compare_digest(
                hashlib.sha256(username.encode()).digest(),
                hashlib.sha256(self.username.encode()).digest(),
            )
            and hmac.compare_digest(hashlib.sha256(password.encode()).digest(), self.password)
        ):
            return Reply(401, {"error": "sign_in_failed"})
        self.sessions = {
            key: expiry for key, expiry in self.sessions.items() if expiry > time.time()
        }
        if len(self.sessions) >= 128:
            return Reply(429, {"error": "too_many_sessions"})
        session = secrets.token_urlsafe(32)
        self.sessions[session] = time.time() + 1800
        return Reply(200, {"authenticated": True}, session)

    def logout(self, cookie: str | None) -> None:
        if cookie is not None:
            self.sessions.pop(cookie, None)

    def render(self, authenticated: bool, *, fragment: bool = False) -> str:
        return templates.get_template("workspace.html" if fragment else "page.html").render(
            authenticated=authenticated
        )

    async def mint(self) -> dict[str, object]:
        async with AsyncMessagingClient(self.credential, base_url=self.api) as client:
            response = await client.client_tokens.mint(
                {
                    "ephemeralId": "example:local-app-user",
                    "session": self.session,
                    "ttlSeconds": 600,
                }
            )
        token = response.data["data"]
        expiry = datetime.fromisoformat(token["expiresAt"].replace("Z", "+00:00"))  # noqa: FURB162 - Python 3.10 requires a numeric UTC offset.
        if not token["token"].startswith("pmfa_ct_") or expiry.tzinfo is None:
            raise ValueError("Invalid browser grant response.")
        return {
            "value": token["token"],
            "audience": "browser",
            "expiresAt": int(expiry.timestamp() * 1000),
            "scopes": ["read_messages", "connect_whatsapp"],
            "grant": {
                "session": self.session,
                "conversations": [],
                "allow": ["read_messages", "connect_whatsapp"],
            },
        }

    async def connect_number(self) -> object:
        async with AsyncMessagingClient(self.credential, base_url=self.api) as client:
            result = await client.quick_links.create(
                {
                    "purpose": "add_connection",
                    "session": self.session,
                    "addConnection": "linked_devices",
                    "connectionGoal": "hybrid",
                }
            )
            return result.data
