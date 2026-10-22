"""Organization BanSafe observations, typed health evidence and incident receipts."""

from __future__ import annotations

from typing import Generic, Literal, TypeVar, cast

from typing_extensions import NotRequired, TypedDict

from .messaging import O, Resource, segment
from .models import DataEnvelope
from .transport import ApiResponse, QueryValue, RequestOptions, Transport

HealthBand = Literal["good", "fair", "poor", "failing", "unknown"]
HealthState = Literal["healthy", "limited", "restricted", "banned"]
HealthSource = Literal["rules_v1", "ml_model", "unavailable"]
Reliability = Literal["rules_based", "validated", "unavailable"]
UnavailableReason = Literal[
    "no_active_model", "invalid_active_model", "insufficient_fresh_features"
]
EnforcementRung = Literal["none", "notify", "throttle", "block_cold", "suspend"]
AppealState = Literal["none", "requested", "granted", "denied"]
ExplanationGroup = Literal["direct_condition", "delivery", "connection", "conduct", "cadence"]
FindingStatus = Literal["open", "acknowledged", "resolved", "not_measured"]
FindingSeverity = Literal["info", "warning", "critical"]
IncidentKind = Literal[
    "cap_warning",
    "cap_reached",
    "timelock",
    "temporary_ban",
    "permanent_ban",
    "connect_blocked",
    "customer_report",
]
ClaimStatus = Literal["filed", "under_review", "approved", "denied", "paid", "reversed"]
ClaimVerdict = Literal["other_device", "customer_conduct", "shared_network", "ours", "inconclusive"]
SignalKind = Literal["number", "boolean", "enum", "histogram", "code_counts"]
SignalUnit = Literal["count", "milliseconds", "unix_milliseconds", "ratio", "none"]
CollectionState = Literal["fresh", "stale", "not_collected", "unsupported"]
HealthActionStatus = Literal["pending", "running", "succeeded", "failed", "cancelled"]
HealthActionOutcome = Literal[
    "applied",
    "cleared",
    "notification_queued",
    "superseded",
    "expired",
    "not_applied",
    "delivery_failed",
]


class HealthProbabilities(TypedDict):
    healthy: float
    limited: float
    restricted: float
    banned: float


class ExplanationFactor(TypedDict):
    group: ExplanationGroup
    key: str
    penalty: float
    observedValue: float
    sampleSize: int


class ExplanationPenalties(TypedDict):
    conduct: float
    delivery: float
    connection: float
    restriction: float
    total: float


class HealthExplanation(TypedDict):
    penalties: ExplanationPenalties
    factors: list[ExplanationFactor]
    measuredGroups: list[ExplanationGroup]
    missingGroups: list[ExplanationGroup]


class ObservedAccountState(TypedDict):
    state: HealthState
    observedAt: str
    source: Literal["account_check", "restriction_event"]


class HealthCommon(TypedDict):
    health: float | None
    healthSource: HealthSource
    healthEstimatorVersion: str | None
    healthModelVersion: str | None
    healthFeatureCoverage: float | None
    healthReliability: Reliability
    healthUnavailableReason: UnavailableReason | None
    healthProbabilities: HealthProbabilities | None
    mostLikelyHealthState: HealthState | None
    healthExplanation: HealthExplanation | None
    observedAccountState: ObservedAccountState | None


class HealthProjection(HealthCommon):
    band: HealthBand
    healthEvaluatedAt: str | None


class NumberEnforcement(TypedDict):
    rung: EnforcementRung
    previousRung: EnforcementRung
    organizationFloor: EnforcementRung
    reason: str
    source: Literal["automatic", "operator"]
    throughputPerMinute: float | None
    blocksUnsolicited: bool
    suspended: bool
    startedAt: str
    eligibleLiftAt: str | None
    exitProgress: float
    blockingFindings: list[str]
    operatorHold: bool
    appealState: AppealState
    state: Literal["applied", "applying"]


class BanSafeNumber(HealthProjection):
    sessionId: str
    session: str
    phoneNumber: str
    projectId: str
    enforcement: NumberEnforcement | None


class WarmupCurvePoint(TypedDict):
    day: int
    allowance: int


class NumberWarmup(TypedDict):
    enabled: bool
    tenureSource: Literal["history", "link", "plan"] | None
    tenureDay: int
    allowance: int | None
    sentToday: int | None
    resetsAt: str | None
    curve: list[WarmupCurvePoint]


class Finding(TypedDict):
    id: str | None
    key: str
    title: str
    summary: str
    fix: str
    status: FindingStatus
    severity: FindingSeverity | None
    occurrences: int
    reopenedCount: int
    evidence: dict[str, float]
    sessionId: str
    session: str
    phoneNumber: str
    firstSeenAt: str | None
    lastSeenAt: str | None
    acknowledgedAt: str | None
    acknowledgedBy: str | None
    acknowledgementNote: str | None
    snoozedUntil: str | None
    resolvedAt: str | None
    resolveReason: Literal["clean", "key_retired", "number_removed", "stale"] | None


class NumberDetail(BanSafeNumber):
    warmup: NumberWarmup
    findings: list[Finding]
    liftRequires: str | None
    appealState: AppealState


class HealthPoint(HealthCommon):
    band: HealthBand | None
    healthEvaluatedAt: str


class HealthHistory(TypedDict):
    sessionId: str
    session: str
    points: list[HealthPoint]


class EnforcementSummary(HealthProjection):
    sessionId: str
    session: str
    phoneNumber: str
    projectId: str
    rung: EnforcementRung
    previousRung: EnforcementRung
    organizationFloor: EnforcementRung
    reason: str
    source: Literal["automatic", "operator"]
    throughputPerMinute: float | None
    blocksUnsolicited: bool
    suspended: bool
    enforcement: NotRequired[NumberEnforcement | None]
    blockingFindings: list[str]
    startedAt: str
    eligibleLiftAt: str | None
    liftRequires: str
    operatorHold: bool
    appealState: AppealState
    state: Literal["applied", "applying"]


class Incident(TypedDict):
    id: str
    sessionId: str
    session: str
    phoneNumber: str
    projectId: str
    kind: IncidentKind
    source: Literal["runtime", "customer"]
    resolution: str
    ambiguous: bool
    startedAt: str
    endsAt: str | None
    closedAt: str | None
    closedBy: str | None
    claimId: str | None
    note: str | None
    reportedBy: str | None
    createdAt: str


class ReportIncident(TypedDict):
    session: str
    occurredAt: NotRequired[str]
    note: NotRequired[str]


class IncidentReceipt(TypedDict):
    incidentId: str
    created: bool
    sessionId: str
    session: str
    occurredAt: str


class ClaimEvidence(TypedDict):
    attributionRuleVersion: int | None
    windowDays: int
    deviceEvidence: bool
    otherDevices: int
    restrictedInWindow: bool
    criticalFindingDays: int
    sharedConnection: bool
    measuredHours: int


class Claim(TypedDict):
    id: str
    incidentId: str
    sessionId: str
    session: str
    phoneNumber: str
    projectId: str
    status: ClaimStatus
    verdict: ClaimVerdict
    windowStart: str
    windowEnd: str
    measuredCents: float
    capCents: float
    amountCents: float
    evidence: ClaimEvidence
    summary: str
    reason: str
    decidedAt: str | None
    paidAt: str | None
    createdAt: str


class SignalDefinition(TypedDict):
    key: str
    label: str
    group: str
    kind: SignalKind
    unit: SignalUnit
    description: str


class SignalCode(TypedDict):
    code: int
    count: int


class Signal(SignalDefinition):
    measured: bool
    value: float | bool | str | list[float] | None
    sampleSize: int | None
    codes: list[SignalCode] | None


class CollectionStatus(TypedDict):
    state: CollectionState
    latestFlushedAt: str | None
    latestReceivedAt: str | None
    freshUntil: str | None
    recordVersion: int | None
    collectorVersion: int | None
    partial: bool | None
    droppedRecords: int | None


class TelemetrySnapshot(TypedDict):
    bucketStart: str
    flushedAt: str
    receivedAt: str
    partial: bool
    recordVersion: int | None
    signals: list[Signal]


class CollectionSession(TypedDict):
    sessionId: str
    session: str
    projectId: str
    collection: CollectionStatus


class TelemetryDetail(CollectionSession):
    snapshot: TelemetrySnapshot | None


class HealthAction(TypedDict):
    id: str
    sessionId: str
    session: str
    projectId: str
    mode: Literal["apply", "clear"]
    action: Literal["stop", "slow_down", "log_out", "email", "webhook"]
    status: HealthActionStatus
    health: float
    threshold: float
    healthSource: Literal["rules_v1", "ml_model"]
    estimatorVersion: str
    modelVersion: str | None
    slowDownMps: float | None
    evaluatedAt: str
    createdAt: str
    completedAt: str | None
    outcome: HealthActionOutcome | None


class ListHealth(TypedDict, total=False):
    projectId: str
    cursor: str
    limit: int


class ListHealthHistory(TypedDict, total=False):
    since: str
    limit: int


class ListFindings(ListHealth, total=False):
    session: str
    status: Literal["open", "acknowledged", "resolved"]
    severity: FindingSeverity


class ListEnforcement(ListHealth, total=False):
    rung: EnforcementRung


class ListIncidents(ListHealth, total=False):
    session: str


class ListClaims(ListHealth, total=False):
    session: str
    status: ClaimStatus


class ListTelemetryHistory(TypedDict, total=False):
    since: str
    until: str
    cursor: str
    limit: int


class ListHealthActions(ListHealth, total=False):
    session: str
    status: HealthActionStatus


T = TypeVar("T")


class CursorInfo(TypedDict):
    nextCursor: str | None
    hasMore: bool


class CursorEnvelope(TypedDict, Generic[T]):
    data: list[T]
    page: NotRequired[CursorInfo]


def _query(parameters: object) -> dict[str, QueryValue]:
    # Typed public parameter dictionaries contain only JSON scalar query fields.
    return cast(dict[str, QueryValue], dict(cast(dict[str, object], parameters)))


class BanSafeObservations(Resource):
    def __init__(self, transport: Transport) -> None:
        super().__init__(transport, "organization_api_key")

    async def list_health(
        self, params: ListHealth | None = None, *, options: RequestOptions = O
    ) -> ApiResponse[CursorEnvelope[BanSafeNumber]]:
        return await self._request(
            "GET", "/platform/bansafe/health", query=_query(params or {}), options=options
        )

    async def get_health(
        self, session: str, *, options: RequestOptions = O
    ) -> ApiResponse[DataEnvelope[NumberDetail]]:
        return await self._request(
            "GET", f"/platform/bansafe/health/{segment(session)}", options=options
        )

    async def list_health_history(
        self, session: str, params: ListHealthHistory | None = None, *, options: RequestOptions = O
    ) -> ApiResponse[DataEnvelope[HealthHistory]]:
        return await self._request(
            "GET",
            f"/platform/bansafe/health/{segment(session)}/history",
            query=_query(params or {}),
            options=options,
        )

    async def list_signals(
        self, *, options: RequestOptions = O
    ) -> ApiResponse[DataEnvelope[list[SignalDefinition]]]:
        return await self._request("GET", "/platform/bansafe/signals", options=options)

    async def get_telemetry(
        self, session: str, *, options: RequestOptions = O
    ) -> ApiResponse[DataEnvelope[TelemetryDetail]]:
        return await self._request(
            "GET", f"/platform/bansafe/telemetry/{segment(session)}", options=options
        )

    async def list_telemetry_history(
        self,
        session: str,
        params: ListTelemetryHistory | None = None,
        *,
        options: RequestOptions = O,
    ) -> ApiResponse[CursorEnvelope[TelemetrySnapshot]]:
        return await self._request(
            "GET",
            f"/platform/bansafe/telemetry/{segment(session)}/history",
            query=_query(params or {}),
            options=options,
        )

    async def list_collection(
        self, params: ListHealth | None = None, *, options: RequestOptions = O
    ) -> ApiResponse[CursorEnvelope[CollectionSession]]:
        return await self._request(
            "GET", "/platform/bansafe/collection", query=_query(params or {}), options=options
        )

    async def list_health_actions(
        self, params: ListHealthActions | None = None, *, options: RequestOptions = O
    ) -> ApiResponse[CursorEnvelope[HealthAction]]:
        return await self._request(
            "GET", "/platform/bansafe/health-actions", query=_query(params or {}), options=options
        )

    async def list_findings(
        self, params: ListFindings | None = None, *, options: RequestOptions = O
    ) -> ApiResponse[CursorEnvelope[Finding]]:
        return await self._request(
            "GET", "/platform/bansafe/findings", query=_query(params or {}), options=options
        )

    async def list_enforcement(
        self, params: ListEnforcement | None = None, *, options: RequestOptions = O
    ) -> ApiResponse[CursorEnvelope[EnforcementSummary]]:
        return await self._request(
            "GET", "/platform/bansafe/enforcement", query=_query(params or {}), options=options
        )

    async def list_incidents(
        self, params: ListIncidents | None = None, *, options: RequestOptions = O
    ) -> ApiResponse[CursorEnvelope[Incident]]:
        return await self._request(
            "GET", "/platform/bansafe/incidents", query=_query(params or {}), options=options
        )

    async def create_incident(
        self, body: ReportIncident, *, options: RequestOptions
    ) -> ApiResponse[DataEnvelope[IncidentReceipt]]:
        return await self._request(
            "POST", "/platform/bansafe/incidents", body=body, options=options
        )

    async def retract_incident(
        self, incident_id: str, *, options: RequestOptions = O
    ) -> ApiResponse[DataEnvelope[Incident]]:
        return await self._request(
            "POST", f"/platform/bansafe/incidents/{segment(incident_id)}/retract", options=options
        )

    async def list_claims(
        self, params: ListClaims | None = None, *, options: RequestOptions = O
    ) -> ApiResponse[CursorEnvelope[Claim]]:
        return await self._request(
            "GET", "/platform/bansafe/claims", query=_query(params or {}), options=options
        )

    async def get_claim(
        self, claim_id: str, *, options: RequestOptions = O
    ) -> ApiResponse[DataEnvelope[Claim]]:
        return await self._request(
            "GET", f"/platform/bansafe/claims/{segment(claim_id)}", options=options
        )
