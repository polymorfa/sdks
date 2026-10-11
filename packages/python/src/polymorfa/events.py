"""Reconnectable SSE consumption with cursor resume and explicit server frames."""

from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncIterator, Callable
from dataclasses import dataclass
from typing import cast

from .errors import (
    AuthenticationError,
    AuthorizationError,
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
    JsonObject,
    QueryValue,
    RequestOptions,
    Transport,
    retry_delay,
)
from .webhooks import WebhookEvent, parse_verified_webhook_event


@dataclass(frozen=True)
class StreamedEvent:
    event: JsonObject
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
        on_gap: Callable[[JsonObject], None] | None = None,
    ) -> None:
        self._transport, self.path, self.cursor = transport, path, since
        self._types, self._manual_ack, self._options = types, manual_ack, options
        self._on_gap = on_gap
        self._closed = False

    def close(self) -> None:
        self._closed = True

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
            delay = min(30, retry_delay({}, attempt + 2))
            try:
                response, metadata = await self._transport.open_stream(
                    "GET", self.path, query=query, options=options, accept="text/event-stream"
                )
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
                            line = await asyncio.wait_for(lines.__anext__(), heartbeat * 2)
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
                                        webhook = parse_verified_webhook_event(
                                            json.dumps(payload).encode()
                                        )
                                    except ValidationError:
                                        pass
                                attempt = 0
                                yield StreamedEvent(
                                    cast(JsonObject, event),
                                    webhook,
                                    cursor,
                                    str(frame.get("streamId", "")),
                                    frame["sequence"],
                                )
                            elif kind == "gap":
                                if frame.get("reason") == "retention_exceeded":
                                    if self._on_gap:
                                        self._on_gap(cast(JsonObject, frame))
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
                if error.status == 410 or error.code == "stream_revoked":
                    raise
                if not isinstance(
                    error, (ConnectionError, TimeoutError, RateLimitError, ServerError)
                ):
                    raise
                if error.metadata:
                    delay = min(30, retry_delay(error.metadata.headers, attempt + 2))
            except (asyncio.TimeoutError, ConnectionError):
                pass
            if not self._closed:
                attempt += 1
                await asyncio.sleep(delay)
