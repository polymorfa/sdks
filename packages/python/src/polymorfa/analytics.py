"""Typed metadata-only WhatsApp analytics and validated collector gauge exports."""

from __future__ import annotations

import re
from collections.abc import Mapping
from typing import Literal, cast

from typing_extensions import NotRequired, TypedDict

from .errors import ServerError, ValidationError
from .messaging import O, segment
from .platform import PlatformResource
from .transport import ApiResponse, QueryValue, RequestOptions, Transport


class CallOutcomeMetrics(TypedDict):
    total: int
    answered: int
    missed: int
    declined: int
    failed: int
    ringing: int
    answerRate: float | None
    talkSeconds: float
    timedAnswered: int
    timedPickup: int
    averageTalkSeconds: float | None
    medianTalkSeconds: float | None
    p95TalkSeconds: float | None
    averagePickupMs: float | None
    p95PickupMs: float | None
    shortAnswered: int
    video: int


class Directions(TypedDict):
    inbound: CallOutcomeMetrics
    outbound: CallOutcomeMetrics


class MediaQuality(TypedDict):
    measuredCalls: int
    averageJitterMs: float | None
    averageRttMs: float | None
    packetsLost: int | None


class AppQuality(TypedDict):
    measuredCalls: int
    averageJitterMs: float | None
    averageRttMs: float | None
    packetLossRate: float | None
    reconnects: int | None


class CodeCount(TypedDict):
    code: str
    count: int


class FollowUp(TypedDict):
    eligibleMissed: int
    returnedWithin24h: int
    rate: float | None
    averageDelayMs: float | None
    pendingWindow: int
    unknownContact: int


class CallBusinessMetrics(CallOutcomeMetrics):
    directions: Directions
    mediaQuality: MediaQuality
    appQuality: AppQuality
    endReasons: list[CodeCount]
    appErrors: list[CodeCount]
    transports: list[CodeCount]
    multiParticipantCalls: int
    followUp: FollowUp


class BusinessSegment(TypedDict):
    dimension: Literal["message_type", "text_band", "origin", "calling_code", "customer_devices"]
    key: str
    sendAttempts: int
    sent: int
    sendFailures: int
    sendFailureRate: float | None
    completedConversations: int
    deliveredConversations: int
    readConversations: int
    repliedConversations: int
    deliveryRate: float | None
    readRate: float | None
    replyRate: float | None
    averageCustomerReplyMs: float | None
    readRateInterval95: list[float] | None
    replyRateInterval95: list[float] | None
    readRateDifference: float | None
    replyRateDifference: float | None
    shareOfConversations: float | None
    shareOfSends: float | None


class Engagement(TypedDict):
    windowHours: Literal[24]
    completedConversations: int
    deliveredConversations: int
    readConversations: int
    repliedConversations: int
    deliveryRate: float | None
    readRate: float | None
    replyRate: float | None
    averageCustomerReplyMs: float | None
    complete: bool
    droppedConversations: int
    droppedRecords: int
    droppedReceiptJoins: int


EstimatedPlatform = Literal[
    "web", "android", "iphone", "ipad", "macos", "windows", "wearable", "ar_device", "unknown"
]


class PlatformShare(TypedDict):
    platform: EstimatedPlatform
    messages: int
    share: float | None


class InventoryDevice(TypedDict):
    deviceIndex: int
    estimatedPlatform: EstimatedPlatform
    reportedClass: Literal["phone", "desktop_app", "browser", "business_api", "unknown"]
    lastActiveAt: int | None
    listed: bool | None


class Inventory(TypedDict):
    listObserved: bool
    listCurrent: bool
    observedAt: int | None
    deviceCount: int | None
    truncated: bool
    devices: list[InventoryDevice]


class DeviceAnalytics(TypedDict):
    detector: Literal["message_id_prefix/v1"]
    measured: bool
    complete: bool
    observedBuckets: int
    customerMessages: int | None
    accountMessages: int | None
    customerPlatforms: list[PlatformShare]
    accountPlatforms: list[PlatformShare]
    inventory: Inventory | None


RecipientDeviceCount = Literal["primary_only", "one_linked", "two_plus_linked", "unknown"]


class RecipientActivityRow(TypedDict):
    ts: int
    recipientCountry: str
    recipientDeviceCount: RecipientDeviceCount
    deviceSource: Literal["primary", "linked", "unknown"]
    incomingMessages: int
    deliveryReceipts: int
    readReceipts: int
    onlineSignals: int
    offlineSignals: int
    typingSignals: int
    lastSignalAt: int
    quietGaps: int
    quietGapMs: float
    averageQuietGapMs: float | None


class RecipientActivity(TypedDict):
    measured: bool
    complete: bool
    observedBuckets: int
    droppedSignals: int
    truncated: bool
    rows: list[RecipientActivityRow]


class ConversationGroup(TypedDict):
    recipientCountry: NotRequired[str]
    recipientDeviceCount: NotRequired[RecipientDeviceCount]
    ts: int
    messageType: Literal[
        "text", "image", "video", "audio", "document", "sticker", "interactive", "template", "other"
    ]
    textBand: Literal["none", "short", "medium", "long", "very_long", "unknown"]
    origin: Literal["api", "campaign", "other"]
    callingCode: str
    customerDevices: Literal["single", "multiple", "unknown"]
    completedConversations: int
    deliveredConversations: int
    readConversations: int
    repliedConversations: int
    replyLatencySumMs: float
    readRate: float | None
    replyRate: float | None
    averageCustomerReplyMs: float | None


class Bucket(TypedDict):
    ts: int
    complete: bool


class ConversationBreakdown(TypedDict):
    measured: bool
    complete: bool
    observedBuckets: int
    droppedConversations: int
    truncated: bool
    buckets: list[Bucket]
    rows: list[ConversationGroup]


class MessageAnalysis(TypedDict):
    complete: bool
    segments: list[BusinessSegment]


class CustomerActivity(TypedDict):
    observed: bool
    onlineSignals: int
    offlineSignals: int
    typingSignals: int


class AccountActivity(TypedDict):
    observed: bool
    primaryPhoneActivitySignals: int
    primaryPhoneActivePeriods: int
    completedPhoneActivityPeriods: int
    phoneActivityMs: float
    averagePhoneActivityMs: float | None
    phoneQuietGaps: int
    phoneQuietMs: float
    averagePhoneQuietMs: float | None
    primaryPhoneMessages: int
    otherDeviceMessages: int
    primaryPhoneReplies: int
    otherDeviceReplies: int
    averagePrimaryPhoneResponseMs: float | None
    averageOtherDeviceResponseMs: float | None
    lastPrimaryPhoneAt: int | None


class ResponseQueue(TypedDict):
    awaitingReply: int
    oldestWaitingMs: float
    observedAt: int
    complete: bool


class Metrics(TypedDict):
    recipientActivity: NotRequired[RecipientActivity]
    deviceAnalytics: DeviceAnalytics
    conversationBreakdown: ConversationBreakdown
    calls: CallBusinessMetrics
    measured: bool
    observedHours: int
    lastObservedAt: int | None
    outgoingMessages: int
    incomingMessages: int
    sendAttempts: int
    sendFailures: int
    sendFailureRate: float | None
    businessReplies: int
    averageBusinessResponseMs: float | None
    onlineMs: float
    disconnects: int
    connectFailures: int
    streamErrors: int
    keepaliveTimeouts: int
    engagement: Engagement
    messageAnalysis: MessageAnalysis
    customerActivity: CustomerActivity
    accountActivity: AccountActivity
    responseQueue: ResponseQueue | None


class Summary(Metrics):
    totalNumbers: int
    measuredNumbers: int
    connectedNumbers: int


class NumberMetrics(Metrics):
    sessionId: str
    projectId: str
    projectName: str
    name: str
    backend: str
    status: str


class CallSeries(CallOutcomeMetrics):
    sessionId: str
    ts: int


class Period(TypedDict):
    start: int
    end: int


class RequestVitals(TypedDict):
    requests: int
    failures: int
    errorRate: float | None


class Series(TypedDict):
    customerOnlineSignals: int
    customerTypingSignals: int
    primaryPhoneMessages: int
    otherDeviceMessages: int
    primaryPhoneReplies: int
    phoneActivePeriods: int
    completedPhoneActivityPeriods: int
    phoneActivityMs: float
    phoneQuietGaps: int
    phoneQuietMs: float
    sessionId: str
    ts: int
    outgoingMessages: int
    incomingMessages: int
    sendFailures: int
    businessReplies: int
    averageBusinessResponseMs: float | None
    onlineMs: float
    disconnects: int


class WhatsAppAnalytics(TypedDict):
    callSeries: list[CallSeries]
    enabled: bool
    period: Period
    requestVitals: RequestVitals
    summary: Summary | None
    numbers: list[NumberMetrics]
    series: list[Series]


class AnalyticsSettings(TypedDict):
    enabled: bool


class Params(TypedDict, total=False):
    projectId: str
    sessionId: str
    start: int
    end: int


class MetricsParams(TypedDict, total=False):
    projectId: str
    sessionId: str
    windowHours: int
    segments: bool
    format: Literal["prometheus", "openmetrics"]


class Analytics(PlatformResource):
    def __init__(self, transport: Transport, project_id: str | None = None) -> None:
        super().__init__(
            transport,
            "/platform/analytics"
            if project_id is None
            else f"/platform/projects/{segment(project_id)}/analytics",
        )
        self._project_id = project_id

    def _query(self, params: Mapping[str, object]) -> dict[str, QueryValue]:
        for key in ["projectId", "sessionId"]:
            if key in params and (
                not isinstance(params[key], str)
                or re.fullmatch(
                    r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}",
                    cast(str, params[key]),
                    re.IGNORECASE,
                )
                is None
            ):
                raise ValidationError(f"{key} must be a UUID.", code="invalid_analytics_filter")
        if (
            self._project_id is not None
            and "projectId" in params
            and cast(str, params["projectId"]).lower() != self._project_id.lower()
        ):
            raise ValidationError(
                "Analytics cannot read outside the bound project.", code="invalid_analytics_filter"
            )
        return {
            key: cast(QueryValue, value)
            for key, value in params.items()
            if key != "projectId" or self._project_id is None
        }

    async def get(
        self, params: Params | None = None, *, options: RequestOptions = O
    ) -> ApiResponse[WhatsAppAnalytics]:
        params = {} if params is None else params
        query = self._query(params)
        for key in ["start", "end"]:
            if key in params:
                value = cast(Mapping[str, object], params)[key]
                if (
                    isinstance(value, bool)
                    or not isinstance(value, int)
                    or not 0 <= value <= 9007199254740991
                ):
                    raise ValidationError(
                        f"{key} must be Unix milliseconds.", code="invalid_analytics_range"
                    )
        if (
            "start" in params
            and "end" in params
            and not 0 <= params["end"] - params["start"] <= 366 * 86400000
        ):
            raise ValidationError(
                "Choose an ordered analytics range of up to366 days.",
                code="invalid_analytics_range",
            )
        return await self._unwrapped("GET", self._prefix, query=query, options=options)

    async def metrics(
        self, params: MetricsParams | None = None, *, options: RequestOptions = O
    ) -> ApiResponse[str]:
        params = {} if params is None else params
        query = self._query(params)
        if "windowHours" in params and (
            isinstance(params["windowHours"], bool)
            or not isinstance(params["windowHours"], int)
            or not 1 <= params["windowHours"] <= 168
        ):
            raise ValidationError(
                "windowHours must be an integer from1 to168.", code="invalid_analytics_range"
            )
        if "segments" in params and not isinstance(params["segments"], bool):
            raise ValidationError("segments must be a boolean.", code="invalid_analytics_filter")
        format = params.get("format", "prometheus")
        if format not in {"prometheus", "openmetrics"}:
            raise ValidationError(
                "Choose prometheus or openmetrics.", code="invalid_analytics_filter"
            )
        query["format"] = format
        expected = "application/openmetrics-text" if format == "openmetrics" else "text/plain"
        response = await self._transport.text(
            "GET", self._prefix + "/metrics", query=query, accept=expected, options=options
        )
        if (
            response.metadata.headers.get("content-type", "").split(";")[0].strip().lower()
            != expected
            or re.search(r"^# TYPE polymorfa_analytics_enabled gauge$", response.data, re.MULTILINE)
            is None
            or (format == "openmetrics" and not response.data.endswith("# EOF\n"))
        ):
            raise ServerError(
                "Invalid analytics metrics response.",
                code="invalid_response",
                metadata=response.metadata,
            )
        return response
