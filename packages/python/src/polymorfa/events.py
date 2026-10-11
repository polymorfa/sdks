"""Reconnectable SSE consumption with cursor resume and explicit server frames."""

from __future__ import annotations

import asyncio
import base64
import binascii
import json
import math
import random
from collections.abc import AsyncIterator, Callable
from dataclasses import dataclass
from typing import Literal, cast

import httpx
from typing_extensions import TypedDict

from .developer_models import EncodedPayload
from .errors import (
    AuthenticationError,
    AuthorizationError,
    ConfigurationError,
    ConnectionError,
    NotFoundError,
    PolymorfaError,
    RateLimitError,
    ServerError,
    TimeoutError,
    ValidationError,
)
from .transport import (
    DEFAULT_OPTIONS,
    QueryValue,
    RequestOptions,
    Transport,
    retry_delay,
)
from .webhooks import WebhookEvent, parse_verified_webhook_event


class StreamEvent(TypedDict):
    id: str
    organizationId: str
    projectId: str
    type: str
    source: Literal["runtime", "platform", "test"]
    environment: Literal["development", "production"]
    createdAt: str
    payloadAvailability: Literal["available", "not_retained", "unavailable"]
    payload: EncodedPayload | None
    replayableUntil: str | None
    metadataExpiresAt: str


class StreamGap(TypedDict):
    reason: Literal["retention_exceeded"]
    missedEvents: int
    requestedCursor: str | None


@dataclass(frozen=True)
class StreamedEvent:
    event: StreamEvent
    webhook: WebhookEvent | None
    cursor: str
    stream_id: str
    sequence: int


class EventStream:
    def __init__(
        self,
        transport: Transport,
        path: str,
        *,
        since: str | None = None,
        types: list[str] | None = None,
        manual_ack: bool = False,
        options: RequestOptions = DEFAULT_OPTIONS,
        on_gap: Callable[[StreamGap], None] | None = None,
        on_reconnect: Callable[[BaseException, float], None] | None = None,
        reconnect_initial: float = 1,
        reconnect_max: float = 30,
    ) -> None:
        self._transport, self.path, self.cursor = transport, path, since
        self._types, self._manual_ack, self._options = types, manual_ack, options
        if any(
            not math.isfinite(value) or value < 0 for value in (reconnect_initial, reconnect_max)
        ):
            raise ConfigurationError("reconnect")
        self._on_gap, self._on_reconnect = on_gap, on_reconnect
        self._reconnect_initial, self._reconnect_max = reconnect_initial, reconnect_max
        self._closed = False
        self._close_event = asyncio.Event()

    def close(self) -> None:
        self._closed = True
        self._close_event.set()

    async def __aiter__(self) -> AsyncIterator[StreamedEvent]:
        attempt = 0
        while not self._closed:
            query: dict[str, QueryValue] = {}
            if self._types:
                query["types"] = ",".join(self._types)
            if self._manual_ack:
                query["ack"] = "manual"
            from dataclasses import replace

            options = replace(
                self._options,
                headers={
                    **self._options.headers,
                    **({"Last-Event-ID": self.cursor} if self.cursor else {}),
                },
            )
            ceiling = min(self._reconnect_max, self._reconnect_initial * 2 ** min(attempt, 30))
            delay = ceiling * (0.5 + random.random() * 0.5)
            failure: BaseException = ConnectionError("Event stream closed.", code="stream_closed")
            metadata = None
            try:
                opening = asyncio.create_task(
                    self._transport.open_stream(
                        "GET", self.path, query=query, options=options, accept="text/event-stream"
                    )
                )
                closing = asyncio.create_task(self._close_event.wait())
                try:
                    done, _ = await asyncio.wait(
                        (opening, closing), return_when=asyncio.FIRST_COMPLETED
                    )
                    if closing in done:
                        if (
                            opening.done()
                            and not opening.cancelled()
                            and opening.exception() is None
                        ):
                            opened_response, _ = opening.result()
                            await opened_response.aclose()
                        return
                    response, metadata = opening.result()
                finally:
                    for opening_pending in (opening, closing):
                        if not opening_pending.done():
                            opening_pending.cancel()
                    await asyncio.gather(opening, closing, return_exceptions=True)
                try:
                    if (
                        response.headers.get("content-type", "").split(";")[0]
                        != "text/event-stream"
                    ):
                        raise ServerError(
                            "Expected an event stream.", code="invalid_response", metadata=metadata
                        )
                    lines = response.aiter_lines().__aiter__()
                    data: list[str] = []
                    heartbeat = 15.0
                    while not self._closed:
                        try:
                            line_task = asyncio.ensure_future(lines.__anext__())
                            close_task = asyncio.create_task(self._close_event.wait())
                            try:
                                done, _ = await asyncio.wait(
                                    (line_task, close_task),
                                    timeout=heartbeat * 2,
                                    return_when=asyncio.FIRST_COMPLETED,
                                )
                                if close_task in done:
                                    break
                                if line_task not in done:
                                    raise asyncio.TimeoutError()
                                line = line_task.result()
                            finally:
                                for pending in (line_task, close_task):
                                    if not pending.done():
                                        pending.cancel()
                                await asyncio.gather(line_task, close_task, return_exceptions=True)
                        except StopAsyncIteration:
                            break
                        if line.startswith("data:"):
                            data.append(line[5:].removeprefix(" "))
                        elif line == "" and data:
                            try:
                                frame = json.loads("\n".join(data))
                            except ValueError:
                                raise ServerError(
                                    "Invalid event stream frame.", code="invalid_response"
                                ) from None
                            data.clear()
                            if not isinstance(frame, dict):
                                raise ServerError(
                                    "Invalid event stream frame.", code="invalid_response"
                                )
                            kind = frame.get("type")
                            if kind == "ready":
                                value = frame.get("heartbeatIntervalMs")
                                if isinstance(value, (int, float)) and value > 0:
                                    heartbeat = value / 1000
                            elif kind == "checkpoint" and isinstance(frame.get("cursor"), str):
                                self.cursor = frame["cursor"]
                            elif kind == "event":
                                event, cursor = frame.get("event"), frame.get("cursor")
                                if (
                                    not isinstance(event, dict)
                                    or not isinstance(cursor, str)
                                    or not isinstance(frame.get("sequence"), int)
                                ):
                                    raise ServerError(
                                        "Invalid streamed event.", code="invalid_response"
                                    )
                                self.cursor = cursor
                                payload = event.get("payload")
                                webhook = None
                                if payload is not None:
                                    try:
                                        if (
                                            not isinstance(payload, dict)
                                            or payload.get("encoding") != "base64"
                                            or payload.get("contentType") != "application/json"
                                            or not isinstance(payload.get("data"), str)
                                        ):
                                            raise ValueError("Invalid encoded payload")
                                        webhook = parse_verified_webhook_event(
                                            base64.b64decode(payload["data"], validate=True)
                                        )
                                    except (ValidationError, ValueError, binascii.Error):
                                        raise ServerError(
                                            "Invalid encoded event payload.",
                                            code="invalid_response",
                                            metadata=metadata,
                                        ) from None
                                attempt = 0
                                yield StreamedEvent(
                                    cast(StreamEvent, event),
                                    webhook,
                                    cursor,
                                    str(frame.get("streamId", "")),
                                    frame["sequence"],
                                )
                            elif kind == "gap":
                                if frame.get("reason") == "retention_exceeded":
                                    if self._on_gap:
                                        self._on_gap(
                                            {
                                                "reason": "retention_exceeded",
                                                "missedEvents": int(frame.get("missedEvents", 0)),
                                                "requestedCursor": frame.get("requestedCursor"),
                                            }
                                        )
                                else:
                                    break
                            elif kind in ("expiry", "dropped"):
                                if kind == "expiry":
                                    attempt = 0
                                break
                            elif kind == "revoked":
                                raise AuthorizationError(
                                    "Event stream revoked.", code="stream_revoked"
                                )
                finally:
                    await response.aclose()
            except (AuthenticationError, AuthorizationError, NotFoundError, ValidationError):
                raise
            except PolymorfaError as error:
                failure = error
                if error.status == 410 or error.code == "stream_revoked":
                    raise
                if not isinstance(
                    error, (ConnectionError, TimeoutError, RateLimitError, ServerError)
                ):
                    raise
                if error.metadata and "retry-after" in error.metadata.headers:
                    delay = min(
                        self._reconnect_max, retry_delay(error.metadata.headers, attempt + 2)
                    )
            except (asyncio.TimeoutError, httpx.TimeoutException):
                failure = TimeoutError(
                    "Event stream timed out.", code="request_timeout", metadata=metadata
                )
            except httpx.TransportError:
                failure = ConnectionError(
                    "Event stream connection failed.", code="connection_error", metadata=metadata
                )
            if not self._closed:
                attempt += 1
                if self._on_reconnect is not None:
                    self._on_reconnect(failure, delay)
                if self._closed:
                    break
                try:
                    await asyncio.wait_for(self._close_event.wait(), timeout=delay)
                except asyncio.TimeoutError:
                    pass
