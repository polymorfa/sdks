"""Metered usage, cursor iteration and server-enforced gate observations."""

from __future__ import annotations

from collections.abc import AsyncIterator, Mapping
from typing import Literal, cast

from typing_extensions import TypedDict

from .errors import ConfigurationError, ServerError
from .messaging import O
from .platform import PlatformResource
from .transport import ApiResponse, QueryValue, RequestOptions, Transport

Meter = Literal[
    "call.duration",
    "call.cloud_pulses",
    "campaign.call",
    "tts.characters",
    "tts.seconds",
    "stt.seconds",
    "agent.seconds",
    "agent.tokens",
    "agent.provider_cost",
    "channels.peak",
    "storage.byte_days",
]
Unit = Literal[
    "second", "pulse", "call", "character", "token", "provider_unit", "channel", "byte_day"
]
KeySource = Literal["none", "managed", "customer"]
GateKey = Literal[
    "calls.outbound_monthly",
    "voice.campaigns",
    "voice.campaigns.recipients",
    "voice.campaigns.calls_monthly",
    "voice.channels.concurrent",
    "voice.audio_library",
    "voice.audio_library.assets",
    "voice.flows",
    "voice.agents.elevenlabs",
    "voice.agents.openai_realtime",
    "voice.providers.managed",
    "voice.providers.customer_key",
    "voice.agent_minutes_monthly",
    "voice.tts_characters_monthly",
    "voice.stt_minutes_monthly",
    "voice.storage.recordings",
    "voice.storage.transcripts",
]


class CallDimensions(TypedDict):
    direction: Literal["inbound", "outbound"]
    upstream: Literal["linked_device", "cloud_api"]
    origin: Literal["direct", "campaign", "flow", "agent", "inbound_automation"]
    participants: int
    connections: int
    sipLegs: int
    video: bool


class RateCard(TypedDict):
    id: str
    version: int


class Record(TypedDict):
    id: str
    meter: Meter
    quantity: float
    unit: Unit
    dimensions: dict[str, str | float | bool]
    keySource: KeySource
    sourceKind: Literal["call", "attempt", "flow_run", "conversation", "asset", "team"]
    sourceId: str
    projectId: str | None
    session: str | None
    occurredAt: str
    recordedAt: str
    revision: int
    pricingState: Literal["unpriced", "priced", "waived", "settled"]
    rateCard: RateCard | None
    pricedCredits: float | None


class RecordPage(TypedDict):
    records: list[Record]
    nextCursor: str | None


class MeterTotal(TypedDict):
    meter: Meter
    unit: Unit
    keySource: KeySource
    quantity: float
    records: int


class NumberTotal(TypedDict):
    session: str
    projectId: str | None
    meters: list[MeterTotal]


class Summary(TypedDict):
    period: str
    start: str
    end: str
    projectId: str | None
    session: str | None
    billingEnabled: bool
    meters: list[MeterTotal]
    numbers: list[NumberTotal]
    numbersTruncated: bool


class GateDecisions(TypedDict):
    wouldBlock: int
    blocked: int
    evaluationError: int


class Gate(TypedDict):
    key: GateKey
    kind: Literal["capability", "quota", "limit", "concurrency"]
    subject: Literal["team", "number", "project", "campaign"]
    mode: Literal["off", "record", "enforce"]
    active: bool
    limit: float | None
    used: float | None
    unit: Unit | Literal["count", "minute"] | None
    overLimit: bool | None
    decisions: GateDecisions


class Gates(TypedDict):
    session: str | None
    gates: list[Gate]


class SummaryParams(TypedDict, total=False):
    projectId: str
    session: str
    period: str


class RecordParams(SummaryParams, total=False):
    callId: str
    meter: Meter
    limit: int
    cursor: str


class GateParams(TypedDict, total=False):
    projectId: str
    session: str


class Usage(PlatformResource):
    def __init__(self, transport: Transport, project_id: str | None = None) -> None:
        super().__init__(transport, "/platform")
        self._project_id = project_id

    def _query(self, params: Mapping[str, object]) -> dict[str, QueryValue]:
        query = {key: cast(QueryValue, value) for key, value in params.items()}
        if self._project_id is not None:
            query["projectId"] = self._project_id
        return query

    async def summary(
        self, params: SummaryParams | None = None, *, options: RequestOptions = O
    ) -> ApiResponse[Summary]:
        return await self._unwrapped(
            "GET", "/platform/usage", query=self._query(params or {}), options=options
        )

    async def list_records(
        self, params: RecordParams | None = None, *, options: RequestOptions = O
    ) -> ApiResponse[RecordPage]:
        return await self._unwrapped(
            "GET", "/platform/usage/records", query=self._query(params or {}), options=options
        )

    async def iterate_records(
        self, params: RecordParams | None = None, *, options: RequestOptions = O
    ) -> AsyncIterator[Record]:
        params = {} if params is None else params.copy()
        cursor = params.get("cursor")
        seen: set[str] = set() if cursor is None else {cursor}
        while True:
            response = await self.list_records(params, options=options)
            next_cursor = response.data["nextCursor"]
            if next_cursor is not None and (
                not isinstance(next_cursor, str) or not next_cursor or next_cursor in seen
            ):
                raise ServerError(
                    "The API repeated a usage record cursor.",
                    code="invalid_response",
                    metadata=response.metadata,
                )
            for record in response.data["records"]:
                yield record
            if next_cursor is None:
                return
            seen.add(next_cursor)
            params["cursor"] = next_cursor

    async def list_gates(
        self, params: GateParams | None = None, *, options: RequestOptions = O
    ) -> ApiResponse[Gates]:
        if (
            self._project_id is not None
            or self._transport._credential is None
            or self._transport._credential.kind != "organization_api_key"
        ):
            raise ConfigurationError("credential")
        return await self._unwrapped(
            "GET", "/platform/gates", query=self._query(params or {}), options=options
        )
