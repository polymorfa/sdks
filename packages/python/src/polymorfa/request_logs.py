"""Typed project request log pages and cancellation-aware oldest-first polling."""

from __future__ import annotations

import asyncio
import re
import time
from collections.abc import AsyncIterator, Awaitable, Callable, Mapping
from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal
from email.utils import parsedate_to_datetime
from typing import Literal, cast

from typing_extensions import TypedDict

from .errors import ConfigurationError, RateLimitError, ServerError, ValidationError
from .messaging import O, segment
from .transport import QueryValue, RequestOptions, ResponseMetadata, Transport

RequestLogSource = Literal["api", "mcp"]
RequestLogMethod = Literal["GET", "POST", "PUT", "PATCH", "DELETE"]


class RequestLogCredential(TypedDict):
    type: Literal["team_key", "project_token", "client_token"]
    id: str | None
    last4: str | None


class RequestLog(TypedDict):
    id: str
    projectId: str
    createdAt: str
    method: str
    route: str
    status: float | None
    durationMs: float | None
    result: Literal["success", "failure"]
    source: RequestLogSource
    requestId: str | None
    traceId: str | None
    errorCode: str | None
    mcpTool: str | None
    credential: RequestLogCredential | None


class RequestLogFilters(TypedDict, total=False):
    status: list[float | str]
    method: list[RequestLogMethod]
    route: str
    source: RequestLogSource
    credentialId: str
    requestId: str
    traceId: str
    since: str | datetime
    until: str | datetime


@dataclass(frozen=True)
class RequestLogPage:
    items: tuple[RequestLog, ...]
    has_more: bool
    next_cursor: str | None
    follow_cursor: str
    metadata: ResponseMetadata


def request_log_retry_after(header: str | None, *, now: float | None = None) -> float:
    value = header.strip() if header is not None else ""
    if re.fullmatch(r"[0-9]+", value):
        normalized = value.lstrip("0") or "0"
        return 300 if len(normalized) > 3 else min(int(normalized), 300)
    try:
        date = parsedate_to_datetime(value)
        if date.tzinfo is None:
            date = date.replace(tzinfo=timezone.utc)
        return min(300, max(0, date.timestamp() - (time.time() if now is None else now)))
    except (ValueError, TypeError, OverflowError):
        return 60


def _filters(params: RequestLogFilters | None) -> dict[str, QueryValue]:
    query: dict[str, QueryValue] = {}
    for key, value in (params or {}).items():
        if key in ("status", "method"):
            if value:
                query[key] = ",".join(str(item) for item in cast(list[object], value))
        elif key in ("since", "until") and isinstance(value, datetime):
            if value.tzinfo is None or value.utcoffset() is None:
                raise ValidationError("Request log dates require a timezone.")
            query[key] = (
                value.astimezone(timezone.utc)
                .isoformat(timespec="milliseconds")
                .replace("+00:00", "Z")
            )
        elif isinstance(value, str):
            query[key] = value
    return query


class RequestLogs:
    def __init__(self, transport: Transport, project_id: str | None = None) -> None:
        self._transport, self._project_id = transport, project_id

    def _project(self, project_id: str | None) -> str:
        if self._project_id is not None:
            if project_id is not None and project_id != self._project_id:
                raise ValidationError("This client reads only its project's request log.")
            return self._project_id
        if not project_id:
            raise ConfigurationError("project_id")
        return project_id

    async def list(
        self,
        params: RequestLogFilters | None = None,
        *,
        project_id: str | None = None,
        limit: int | None = None,
        cursor: str | None = None,
        options: RequestOptions = O,
    ) -> RequestLogPage:
        query = _filters(params)
        if cursor is not None and query:
            raise ValidationError("A request log cursor cannot be combined with filters.")
        if limit is not None:
            query["limit"] = limit
        if cursor is not None:
            query["cursor"] = cursor
        return await self._read(project_id, query, options)

    async def follow(
        self,
        after: str,
        *,
        project_id: str | None = None,
        limit: int | None = None,
        options: RequestOptions = O,
    ) -> RequestLogPage:
        query: dict[str, QueryValue] = {"after": after}
        if limit is not None:
            query["limit"] = limit
        return await self._read(project_id, query, options)

    async def _read(
        self, project_id: str | None, query: Mapping[str, QueryValue], options: RequestOptions
    ) -> RequestLogPage:
        response = await self._transport.request(
            "GET",
            f"/platform/projects/{segment(self._project(project_id))}/request-logs",
            query=query,
            options=options,
        )
        body = response.data
        page = body.get("page") if body is not None else None
        items = body.get("data") if body is not None else None
        if (
            not isinstance(items, list)
            or not isinstance(page, dict)
            or not isinstance(page.get("hasMore"), bool)
            or not isinstance(page.get("followCursor"), str)
            or "nextCursor" not in page
            or (page["nextCursor"] is not None and not isinstance(page["nextCursor"], str))
        ):
            raise ServerError(
                "Invalid request log page.",
                code="invalid_response",
                metadata=response.metadata,
                status=response.metadata.status,
                details=body,
            )
        return RequestLogPage(
            tuple(cast(list[RequestLog], items)),
            cast(bool, page["hasMore"]),
            cast(str | None, page["nextCursor"]),
            cast(str, page["followCursor"]),
            response.metadata,
        )

    async def _limited(
        self, read: Callable[[], Awaitable[RequestLogPage]], stop: asyncio.Event | None
    ) -> RequestLogPage | None:
        while stop is None or not stop.is_set():
            operation: asyncio.Future[RequestLogPage] = asyncio.ensure_future(read())
            stopped = asyncio.create_task(stop.wait()) if stop is not None else None
            try:
                if stopped is not None:
                    await asyncio.wait((operation, stopped), return_when=asyncio.FIRST_COMPLETED)
                    if stopped.done() or (stop is not None and stop.is_set()):
                        return None
                return await operation
            except RateLimitError as cause:
                delay = request_log_retry_after(
                    cause.metadata.headers.get("retry-after")
                    if cause.metadata is not None
                    else None
                )
                if not await _sleep(delay, stop):
                    return None
            finally:
                operation.cancel()
                if stopped is not None:
                    stopped.cancel()
                await asyncio.gather(
                    operation, *([stopped] if stopped is not None else []), return_exceptions=True
                )
        return None

    async def tail(
        self,
        params: RequestLogFilters | None = None,
        *,
        project_id: str | None = None,
        interval_seconds: float = 2,
        backfill: int = 0,
        stop: asyncio.Event | None = None,
        options: RequestOptions = O,
    ) -> AsyncIterator[RequestLog]:
        if (
            isinstance(interval_seconds, bool)
            or not isinstance(interval_seconds, (int, float))
            or not 1 <= interval_seconds <= 60
            or Decimal(str(interval_seconds)) * 1000
            != (Decimal(str(interval_seconds)) * 1000).to_integral_value()
        ):
            raise ValidationError(
                "Request log interval must be 1 to 60 seconds in whole milliseconds."
            )
        if isinstance(backfill, bool) or not isinstance(backfill, int) or not 0 <= backfill <= 100:
            raise ValidationError("Request log backfill must be 0 to 100.")
        first = await self._limited(
            lambda: self.list(
                params, project_id=project_id, limit=max(1, backfill), options=options
            ),
            stop,
        )
        if first is None:
            return
        if backfill:
            for item in reversed(first.items):
                if stop is not None and stop.is_set():
                    return
                yield item
        after = first.follow_cursor
        while stop is None or not stop.is_set():

            async def read_follow(cursor: str = after) -> RequestLogPage:
                return await self.follow(cursor, project_id=project_id, limit=100, options=options)

            page = await self._limited(read_follow, stop)
            if page is None:
                return
            for item in page.items:
                if stop is not None and stop.is_set():
                    return
                yield item
            after = page.follow_cursor
            if not page.has_more and not await _sleep(interval_seconds, stop):
                return


async def _sleep(seconds: float, stop: asyncio.Event | None) -> bool:
    if stop is None:
        await asyncio.sleep(seconds)
        return True
    if stop.is_set():
        return False
    try:
        await asyncio.wait_for(stop.wait(), seconds)
        return False
    except asyncio.TimeoutError:
        return not stop.is_set()
