"""Shared loopback application policy; replace with live membership in your app."""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import re
import secrets
import threading
import time
from copy import deepcopy
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

from jinja2 import Environment, FileSystemLoader, select_autoescape

from polymorfa import AsyncMessagingClient, Credential, PolymorfaError, RequestOptions, is_event

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
        self.peer = os.environ["POLYMORFA_RECIPIENT"]
        self.webhook_secret = os.environ["POLYMORFA_WEBHOOK_SECRET"]
        if not self.peer or not self.webhook_secret:
            raise ValueError("Configure the authorized recipient and webhook secret.")
        self.transport = os.environ.get("POLYMORFA_EXAMPLE_TRANSPORT", "")
        self.messages = []
        self.attempts = {}
        self.event_ids = []
        self.received = 0
        self.last_event = ""
        self.peer_id = ""
        self.state_lock = threading.RLock()
        self.send_lock = threading.Lock()
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
            authenticated=authenticated, transport=self.transport
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
        expiry = datetime.fromisoformat(token["expiresAt"].replace("Z", "+00:00"))
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

    def snapshot(self):
        with self.state_lock:
            return deepcopy(
                {
                    "messages": self.messages,
                    "peer": self.peer,
                    "session": self.session,
                    "receivedEvents": self.received,
                    "lastEvent": self.last_event,
                }
            )

    async def send_message(self, body: bytes, key: str) -> Reply:
        try:
            value = json.loads(body) if len(body) <= 16384 else None
        except (ValueError, UnicodeError):
            value = None
        if (
            not isinstance(value, dict)
            or set(value) != {"text"}
            or not isinstance(value["text"], str)
            or not value["text"].strip()
            or len(value["text"].encode()) > 4096
            or re.fullmatch(r"[a-fA-F0-9]{8}(?:-[a-fA-F0-9]{4}){3}-[a-fA-F0-9]{12}", key) is None
        ):
            return Reply(400, {"error": "send_text_with_uuid_key"})
        if not self.send_lock.acquire(blocking=False):
            return Reply(429, {"error": "send_in_progress"})
        try:
            text = value["text"]
            attempt = self.attempts.get(key)
            if attempt:
                if attempt["text"] != text:
                    return Reply(409, {"error": "key_has_different_text"})
                if attempt["message"]:
                    return Reply(200, deepcopy(attempt["message"]))
            else:
                if len(self.attempts) >= 128:
                    return Reply(429, {"error": "example_send_capacity_reached"})
                attempt = self.attempts[key] = {"text": text, "message": None}
            try:
                async with AsyncMessagingClient(self.credential, base_url=self.api) as client:
                    response = await client.messages.send(
                        self.session,
                        {"conversation": {"phoneNumber": self.peer}, "content": {"text": text}},
                        options=RequestOptions(idempotency_key=key, timeout=60),
                    )
                receipt = response.data["data"]
                if not response.data["success"] or not receipt["id"]:
                    raise ValueError("Invalid receipt")
                at = datetime.fromisoformat(receipt["timestamp"].replace("Z", "+00:00"))
                message = {
                    "id": receipt["id"],
                    "clientId": key,
                    "text": text,
                    "createdAt": int(at.timestamp()) * 1000,
                    "direction": "outbound",
                    "status": "sent",
                    "receipt": receipt["status"],
                }
                with self.state_lock:
                    self.peer_id = receipt["conversation"].get("id", "") or self.peer_id
                    self.upsert(message)
                attempt["message"] = message
                return Reply(200, deepcopy(message))
            except (PolymorfaError, ValueError, TypeError, KeyError, OverflowError):
                # Retain the key on an unknown outcome. A retry uses the same API operation.
                return Reply(502, {"error": "send_outcome_unknown_retry_same_key"})
        finally:
            self.send_lock.release()

    def upsert(self, message):
        self.messages = [m for m in self.messages if m["id"] != message["id"]] + [message]
        self.messages = self.messages[-100:]

    def receive(self, event):
        if event.session != self.session or not isinstance(event.payload, dict):
            return
        payload = event.payload
        with self.state_lock:
            if event.id in self.event_ids:
                return
            conversation = payload.get("conversation", {})
            assigned = (
                conversation.get("id") == self.peer_id
                if self.peer_id
                else conversation.get("phoneNumber", "").lstrip("+") == self.peer.lstrip("+")
            )
            if not assigned:
                return
            if is_event(event, "message.received"):
                text = payload.get("text", "")
                if (
                    payload.get("fromMe") is not False
                    or payload.get("isGroup") is not False
                    or not isinstance(text, str)
                    or not text
                    or len(text.encode()) > 4096
                    or not payload.get("id")
                    or not isinstance(payload.get("timestamp"), (float, int))
                ):
                    return
                self.upsert(
                    {
                        "id": payload["id"],
                        "text": text,
                        "createdAt": int(payload["timestamp"] * 1000),
                        "direction": "inbound",
                        "status": "sent",
                        "receipt": "received",
                    }
                )
            elif is_event(event, "message.ack"):
                ranks = {
                    "sent": 1,
                    "server": 1,
                    "delivered": 2,
                    "delivery": 2,
                    "read": 3,
                    "played": 3,
                }
                ids = {m.get("id") for m in payload.get("messages", []) if isinstance(m, dict)}
                receipt = payload.get("type", "")
                for message in self.messages:
                    if (
                        message["id"] in ids
                        and message["direction"] == "outbound"
                        and ranks.get(receipt, 0) > ranks.get(message.get("receipt"), 0)
                    ):
                        message["receipt"] = receipt
            else:
                return
            self.event_ids = (self.event_ids + [event.id])[-1024:]
            self.received += 1
            self.last_event = event.event
