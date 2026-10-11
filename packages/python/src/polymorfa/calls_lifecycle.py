"""Authenticated lifecycle stream, heartbeat, token replacement and capped reconnects."""

from __future__ import annotations

import asyncio
import json
import random
import re
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import cast
from urllib.parse import urlencode, urlsplit

from .calls import Socket
from .calls_tokens import CallsError, CallsToken, CallsTokenSource
from .errors import ConfigurationError
from .transport import JsonObject


async def connect_lifecycle_socket(url: str) -> Socket:
    from websockets.asyncio.client import connect

    return cast(Socket, await connect(url, ping_interval=None))


def socket_base_url(base_url: str) -> str:
    parsed = urlsplit(base_url)
    if (
        parsed.scheme not in ("http", "https", "ws", "wss")
        or not parsed.hostname
        or parsed.username
        or parsed.password
        or parsed.query
        or parsed.fragment
        or parsed.path not in ("", "/")
        or (
            parsed.scheme in ("http", "ws")
            and parsed.hostname not in ("localhost", "127.0.0.1", "::1")
        )
    ):
        raise ConfigurationError("base_url")
    return base_url.rstrip("/").replace("https://", "wss://", 1).replace("http://", "ws://", 1)


def close_code(cause: BaseException) -> int | None:
    received = getattr(cause, "rcvd", None)
    code: object = getattr(received, "code", None)
    return code if isinstance(code, int) else None


@dataclass(frozen=True)
class LifecycleEvent:
    event: str
    call_id: str
    payload: JsonObject
    timestamp: str


@dataclass(frozen=True)
class LifecycleReady:
    session: str | None = None
    participant: str | None = None


class LifecycleSocket:
    def __init__(
        self,
        tokens: CallsTokenSource,
        *,
        session: str | None = None,
        participant: str | None = None,
        base_url: str = "https://api.polymorfa.com",
        heartbeat_interval: float = 15,
        connect_timeout: float = 10,
        min_backoff: float = 1,
        max_backoff: float = 30,
        refresh_before_expiry: float = 60,
        now: Callable[[], float] = time.time,
        connector: Callable[[str], Awaitable[Socket]] = connect_lifecycle_socket,
        on_event: Callable[[LifecycleEvent], Awaitable[None]] | None = None,
    ) -> None:
        if participant is not None and not re.fullmatch(r"[A-Za-z0-9._:@-]{1,128}", participant):
            raise ConfigurationError("participant")
        if (
            min_backoff <= 0
            or max_backoff < min_backoff
            or min(heartbeat_interval, connect_timeout, refresh_before_expiry) < 0
        ):
            raise ConfigurationError("lifecycle_socket")
        self._tokens, self._base, self._session, self._participant = (
            tokens,
            socket_base_url(base_url),
            session,
            participant,
        )
        self._interval, self._timeout = heartbeat_interval, connect_timeout
        self._min, self._max, self._lead, self._now = (
            min_backoff,
            max_backoff,
            refresh_before_expiry,
            now,
        )
        self._connector, self._on_event = connector, on_event
        self._runner: asyncio.Task[None] | None = None
        self._socket: Socket | None = None
        self._first: asyncio.Event = asyncio.Event()
        self._closed = True
        self.connected = False
        self.participant: str | None = None
        self.events: asyncio.Queue[LifecycleEvent] = asyncio.Queue(maxsize=256)
        self.errors: asyncio.Queue[CallsError] = asyncio.Queue(maxsize=32)
        self.states: asyncio.Queue[bool] = asyncio.Queue(maxsize=32)
        self._awaiting_pong = False

    async def connect(self) -> None:
        if self._runner is None or self._runner.done():
            self._closed = False
            self._first = asyncio.Event()
            self._runner = asyncio.create_task(self._run())
        await self._first.wait()

    def _error(self, code: str) -> None:
        if self.errors.full():
            self.errors.get_nowait()
        self.errors.put_nowait(CallsError("Calls lifecycle connection failed.", code=code))

    def _state(self, connected: bool) -> None:
        self.connected = connected
        if self.states.full():
            self.states.get_nowait()
        self.states.put_nowait(connected)

    async def _run(self) -> None:
        attempt, refresh = 0, False
        while not self._closed:
            helpers: list[asyncio.Task[None]] = []
            try:
                token = await self._tokens.get(refresh=refresh)
                refresh = False
                path = self._base + "/voip/ws"
                if not token.value.startswith("pmfa_ct_"):
                    query = {
                        key: value
                        for key, value in {
                            "session": self._session,
                            "participant": self._participant,
                        }.items()
                        if value is not None
                    }
                    if query:
                        path += "?" + urlencode(query)

                async def open_socket(path: str = path, token: CallsToken = token) -> None:
                    self._socket = await self._connector(path)
                    await self._socket.send(json.dumps({"type": "auth", "token": token.value}))
                    while True:
                        frame = await self._frame()
                        if frame.get("type") == "ready":
                            if any(
                                key in frame and not isinstance(frame[key], str)
                                for key in ("session", "participant")
                            ):
                                continue
                            p = frame.get("participant")
                            if isinstance(p, str):
                                self.participant = p
                            return
                        if frame.get("type") == "error" and isinstance(frame.get("code"), str):
                            self._error(cast(str, frame["code"]))

                if self._timeout:
                    await asyncio.wait_for(open_socket(), self._timeout)
                else:
                    await open_socket()
                self._awaiting_pong = False
                self._state(True)
                self._first.set()
                attempt = 0
                if self._interval:
                    helpers.append(asyncio.create_task(self._heartbeat()))
                if token.expires_at is not None:
                    helpers.append(asyncio.create_task(self._replace_token(token)))
                while not self._closed:
                    frame = await self._frame()
                    if frame.get("type") == "pong":
                        self._awaiting_pong = False
                    elif frame.get("type") == "error" and isinstance(frame.get("code"), str):
                        self._error(cast(str, frame["code"]))
                    elif (
                        frame.get("type") == "event"
                        and all(
                            isinstance(frame.get(k), str) for k in ("event", "callId", "timestamp")
                        )
                        and "payload" in frame
                    ):
                        payload = frame["payload"]
                        event = LifecycleEvent(
                            cast(str, frame["event"]),
                            cast(str, frame["callId"]),
                            cast(JsonObject, payload) if isinstance(payload, dict) else {},
                            cast(str, frame["timestamp"]),
                        )
                        if self._on_event is not None:
                            await self._on_event(event)
                        else:
                            if self.events.full():
                                raise CallsError(
                                    "Lifecycle consumer did not keep up.", code="event_queue_full"
                                )
                            self.events.put_nowait(event)
            except asyncio.CancelledError:
                raise
            except Exception as cause:  # noqa: BLE001 - connector and token provider errors are retried.
                code = close_code(cause)
                refresh = code == 4401
                if refresh:
                    self._tokens.invalidate()
                self._error(
                    {
                        4401: "unauthorized",
                        4409: "conflict",
                        4429: "rate_limited",
                        4400: "invalid_request",
                        1008: "policy_violation",
                        1013: "try_again_later",
                    }.get(
                        code or 0,
                        "connect_timeout"
                        if isinstance(cause, asyncio.TimeoutError)
                        else "connection_lost",
                    )
                )
                if code == 4400:
                    self._closed = True
            finally:
                self._first.set()
                for helper in helpers:
                    helper.cancel()
                await asyncio.gather(*helpers, return_exceptions=True)
                if self.connected:
                    self._state(False)
                if self._socket is not None:
                    await self._socket.close()
                    self._socket = None
            if not self._closed:
                await asyncio.sleep(
                    min(self._max, self._min * 2 ** min(attempt, 16))
                    * (0.5 + random.random() * 0.5)
                )
                attempt += 1

    async def _frame(self) -> JsonObject:
        assert self._socket is not None
        while True:
            data = await self._socket.recv()
            if isinstance(data, str):
                try:
                    frame = json.loads(data)
                except ValueError:
                    continue
                if isinstance(frame, dict):
                    return cast(JsonObject, frame)

    async def _heartbeat(self) -> None:
        while self.connected and self._socket is not None:
            await asyncio.sleep(self._interval)
            if self._awaiting_pong:
                self._error("heartbeat_timeout")
                await self._socket.close()
                return
            self._awaiting_pong = True
            await self._socket.send('{"type":"ping"}')

    async def _replace_token(self, token: CallsToken) -> None:
        while self.connected and self._socket is not None and token.expires_at is not None:
            remaining = token.expires_at - self._now()
            await asyncio.sleep(
                max(1, remaining - self._lead if remaining > self._lead * 2 else remaining / 2)
            )
            try:
                token = await self._tokens.get(refresh=True)
                if self.connected and self._socket is not None:
                    await self._socket.send(json.dumps({"type": "auth", "token": token.value}))
            except asyncio.CancelledError:
                raise
            except Exception:  # noqa: BLE001 - provider failures do not close a usable socket.
                self._error("token_failed")
                await asyncio.sleep(5)

    async def send_candidate(
        self,
        call_id: str,
        connection_id: str,
        candidate: str,
        *,
        sdp_mid: str | None = None,
        sdp_mline_index: int | None = None,
    ) -> bool:
        if not re.fullmatch(r"[A-Za-z0-9_-]{8,64}", connection_id):
            raise ConfigurationError("connection_id")
        if not self.connected or self._socket is None:
            return False
        body: JsonObject = {"candidate": candidate}
        if sdp_mid is not None:
            body["sdpMid"] = sdp_mid
        if sdp_mline_index is not None:
            body["sdpMLineIndex"] = sdp_mline_index
        await self._socket.send(
            json.dumps(
                {
                    "type": "candidate",
                    "callId": call_id,
                    "connectionId": connection_id,
                    "candidate": body,
                }
            )
        )
        return True

    async def close(self) -> None:
        self._closed = True
        if self._runner is not None:
            self._runner.cancel()
            await asyncio.gather(self._runner, return_exceptions=True)
            self._runner = None
        self._first.set()
