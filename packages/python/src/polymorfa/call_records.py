"""Typed call records, diagnostics, statistics and paged CSV/NDJSON exports."""

from __future__ import annotations

import re
from collections.abc import AsyncIterator, Mapping
from datetime import datetime, timezone
from typing import Literal, cast

from typing_extensions import TypedDict

from .errors import ConfigurationError, ServerError
from .messaging import O, segment
from .platform import PlatformResource
from .transport import ApiResponse, CursorPage, QueryValue, RequestOptions, Transport
from .voip_models import CallErrorCode, ReportClient

Direction = Literal["inbound", "outbound"]
Upstream = Literal["linked_device", "cloud_api"]
Outcome = Literal["answered", "missed", "declined", "failed", "in_progress"]
State = Literal["offered", "accepted", "rejected", "missed", "ended"]


class Record(TypedDict):
    callId: str
    projectId: str | None
    sessionId: str
    direction: Direction
    upstream: Upstream
    outcome: Outcome
    state: State
    hasVideo: bool
    peerRef: str | None
    startedAt: str
    connectedAt: str | None
    endedAt: str | None
    durationSeconds: float | None
    endReason: str | None


class EndReason(TypedDict):
    code: str
    label: str


class Participant(TypedDict):
    id: str
    state: Literal["invited", "ringing", "connected", "left"]
    firstSeenAt: str
    updatedAt: str
    leftReason: str | None


class Connection(TypedDict):
    id: str
    participant: str
    transport: Literal["webrtc", "socket", "sip", "unknown"]
    joinedAt: str | None
    leftAt: str | None
    reason: (
        Literal[
            "left",
            "replaced",
            "claimed",
            "call_ended",
            "sip_busy",
            "sip_declined",
            "sip_no_answer",
            "sip_unavailable",
            "sip_auth_failed",
        ]
        | None
    )


class Telemetry(TypedDict):
    status: Literal["reported", "unknown"]
    source: Literal["media_server"]
    setupMs: float | None
    ringMs: float | None
    codec: str | None
    jitterMs: float | None
    packetsLost: int | None
    rttMs: float | None
    receivedKbps: float | None
    sentKbps: float | None


class AppQuality(TypedDict):
    reportedAt: str
    rttMs: float | None
    jitterMs: float | None
    packetsLost: int | None
    packetsReceived: int | None
    audioCodec: str | None
    videoCodec: str | None
    candidateType: Literal["host", "srflx", "prflx", "relay"] | None
    reconnects: int | None


class AppError(TypedDict):
    code: CallErrorCode
    reportedAt: str


class AppConnection(TypedDict):
    connectionId: str
    participant: str
    client: ReportClient | None
    quality: AppQuality | None
    errors: list[AppError]


class AppReports(TypedDict):
    status: Literal["reported", "none"]
    connections: list[AppConnection]
    truncated: bool


class RecordSummary(TypedDict):
    callId: str
    sessionId: str
    projectId: str | None
    direction: Direction
    state: State
    live: bool
    backend: str
    hasVideo: bool
    peerRef: str | None
    startedAt: str
    connectedAt: str | None
    endedAt: str | None
    durationSeconds: float | None
    endReason: EndReason | None
    answeredBy: str | None
    exclusive: bool | None


class HistoryEvent(TypedDict):
    eventId: str
    type: str
    occurredAt: str


class History(TypedDict):
    events: list[HistoryEvent]
    truncated: bool


class Correlation(TypedDict):
    callId: str
    sessionId: str


class Detail(TypedDict):
    call: RecordSummary
    participants: list[Participant]
    connections: list[Connection]
    telemetry: Telemetry
    appReports: AppReports
    history: History
    correlation: Correlation


class StatsMetrics(TypedDict):
    calls: int
    answered: int
    missed: int
    declined: int
    failed: int
    inProgress: int
    answerRate: float | None
    totalDurationSeconds: float
    averageDurationSeconds: float | None


class StatsGroup(StatsMetrics):
    key: str
    start: str | None


class HeatmapCell(TypedDict):
    dayOfWeek: int
    hour: int
    calls: int
    answered: int


class Stats(TypedDict):
    since: str
    until: str
    timezone: str
    groupBy: Literal["day", "hour", "session", "outcome"]
    totals: StatsMetrics
    groups: list[StatsGroup]
    groupsTruncated: bool
    heatmap: list[HeatmapCell]


class Filters(TypedDict, total=False):
    projectId: str
    sessionId: str
    direction: Direction
    upstream: Upstream
    outcome: Outcome
    since: str | datetime
    until: str | datetime


class StatsParams(Filters, total=False):
    groupBy: Literal["day", "hour", "session", "outcome"]
    timezone: str


class ListRecords(Filters, total=False):
    limit: int
    cursor: str


class ExportRecords(ListRecords, total=False):
    format: Literal["csv", "ndjson"]


class RetrieveRecord(TypedDict, total=False):
    projectId: str


class ExportPage(TypedDict):
    format: Literal["csv", "ndjson"]
    body: str
    nextCursor: str | None


def _text(value: object, field: str, maximum: int) -> str:
    if not isinstance(value, str) or not value.strip() or len(value) > maximum:
        raise ConfigurationError(field)
    return value


def _integer(value: int, maximum: int) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or not 1 <= value <= maximum:
        raise ConfigurationError("limit")
    return value


def _timestamp(value: object, field: str) -> str:
    if isinstance(value, datetime):
        if value.tzinfo is None:
            raise ConfigurationError(field)
        return (
            value.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
        )
    if (
        not isinstance(value, str)
        or re.fullmatch(
            r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})", value
        )
        is None
    ):
        raise ConfigurationError(field)
    try:
        datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        raise ConfigurationError(field) from None
    return value


class CallRecords(PlatformResource):
    def __init__(self, transport: Transport, project_id: str | None = None) -> None:
        super().__init__(transport, "/platform/calls")
        self._project_id = project_id

    def _filters(self, params: Mapping[str, object]) -> dict[str, QueryValue]:
        query: dict[str, QueryValue] = {}
        if self._project_id is not None:
            if "projectId" in params and params["projectId"] != self._project_id:
                raise ConfigurationError("projectId")
            query["projectId"] = self._project_id
        elif "projectId" in params:
            query["projectId"] = _text(params["projectId"], "projectId", 64)
        if "sessionId" in params:
            query["sessionId"] = _text(params["sessionId"], "sessionId", 128)
        for key, allowed in [
            ("direction", {"inbound", "outbound"}),
            ("upstream", {"linked_device", "cloud_api"}),
            ("outcome", {"answered", "missed", "declined", "failed", "in_progress"}),
        ]:
            if key in params:
                if not isinstance(params[key], str) or params[key] not in allowed:
                    raise ConfigurationError(key)
                query[key] = cast(str, params[key])
        for key in ["since", "until"]:
            if key in params:
                query[key] = _timestamp(params[key], key)
        return query

    async def retrieve(
        self, call_id: str, params: RetrieveRecord | None = None, *, options: RequestOptions = O
    ) -> ApiResponse[Detail]:
        if not isinstance(call_id, str) or re.fullmatch(r"[\x21-\x7e]{1,128}", call_id) is None:
            raise ConfigurationError("call_id")
        return await self._unwrapped(
            "GET",
            self._prefix + "/" + segment(call_id),
            query=self._filters(params or {}),
            options=options,
        )

    async def stats(
        self, params: StatsParams | None = None, *, options: RequestOptions = O
    ) -> ApiResponse[Stats]:
        params = {} if params is None else params
        query = self._filters(params)
        if "groupBy" in params:
            if params["groupBy"] not in {"day", "hour", "session", "outcome"}:
                raise ConfigurationError("groupBy")
            query["groupBy"] = params["groupBy"]
        if "timezone" in params:
            query["timezone"] = _text(params["timezone"], "timezone", 64)
        return await self._unwrapped("GET", self._prefix + "/stats", query=query, options=options)

    async def list(
        self, params: ListRecords | None = None, *, options: RequestOptions = O
    ) -> CursorPage[Record]:
        params = {} if params is None else params
        query = self._filters(params)
        if "limit" in params:
            query["limit"] = _integer(params["limit"], 100)
        if "cursor" in params:
            query["cursor"] = _text(params["cursor"], "cursor", 256)
        return await self._page(self._prefix, query, options)

    async def export(
        self, params: ExportRecords | None = None, *, options: RequestOptions = O
    ) -> ApiResponse[ExportPage]:
        params = {} if params is None else params
        query = self._filters(params)
        format = params.get("format", "csv")
        if format not in {"csv", "ndjson"}:
            raise ConfigurationError("format")
        query["format"] = format
        if "limit" in params:
            query["limit"] = _integer(params["limit"], 1000)
        if "cursor" in params:
            query["cursor"] = _text(params["cursor"], "cursor", 256)
        expected = "text/csv" if format == "csv" else "application/x-ndjson"
        response = await self._transport.text(
            "GET", self._prefix + "/export", query=query, accept=expected, options=options
        )
        if (
            response.metadata.headers.get("content-type", "").split(";")[0].strip().lower()
            != expected
        ):
            raise ServerError(
                "Unexpected call export content type.",
                code="invalid_response",
                metadata=response.metadata,
            )
        return ApiResponse(
            {
                "format": format,
                "body": response.data,
                "nextCursor": response.metadata.headers.get("polymorfa-next-cursor") or None,
            },
            response.metadata,
        )

    async def export_all(
        self, params: ExportRecords | None = None, *, options: RequestOptions = O
    ) -> AsyncIterator[str]:
        params = {} if params is None else params.copy()
        cursor = params.get("cursor")
        seen = set() if cursor is None else {cursor}
        first = True
        while True:
            response = await self.export(params, options=options)
            data = response.data
            next_cursor = data["nextCursor"]
            if next_cursor is not None and next_cursor in seen:
                raise ServerError(
                    "The API repeated an export cursor.",
                    code="invalid_response",
                    metadata=response.metadata,
                )
            body = data["body"]
            if not first and data["format"] == "csv":
                body = body.partition("\n")[2]
            first = False
            if body:
                yield body
            if next_cursor is None:
                return
            seen.add(next_cursor)
            params["cursor"] = next_cursor
