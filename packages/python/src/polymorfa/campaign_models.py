"""Handwritten campaign and customer-supplied audience wire contracts."""

from collections.abc import Mapping
from typing import Literal, cast

from typing_extensions import NotRequired, TypedDict

from .campaign_contract_models import CampaignRecipientFailureReason
from .transport import Json, JsonObject

Criterion = Literal["delivery", "read", "reply"]
Weekday = Literal["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
RecipientStatus = Literal["queued", "sending", "sent", "delivered", "read", "failed", "skipped"]


class Blueprint(TypedDict):
    version: Literal[2]
    source: str


class Variant(TypedDict):
    key: str
    label: str
    weight: int
    blueprint: Blueprint


class MessageVariation(TypedDict):
    key: str
    weight: int
    blueprint: Blueprint


class TextFollowUpMessage(TypedDict):
    """Text accepts campaign placeholders; tracked links are refused by the API."""

    type: Literal["text"]
    text: str


class TemplateFollowUpMessage(TypedDict):
    type: Literal["template"]
    templateId: str


FollowUpMessage = TextFollowUpMessage | TemplateFollowUpMessage


class FollowUp(TypedDict):
    """Receipt-timed beta follow-up; only the message is required on the wire.

    Delay accepts 60–604,800 seconds (default 86,400). Expiry accepts
    86,400–2,592,000 seconds (default 604,800) and must exceed the delay.
    The API requires enrollment and a single first message. A first delivery
    starts the wait; the first read before sending restarts it. Replies and
    opt-outs cancel it, and an expired wait never sends.
    """

    message: FollowUpMessage
    delaySeconds: NotRequired[int]
    expirySeconds: NotRequired[int]


FollowUpStatus = Literal[
    "waiting_receipt",
    "scheduled",
    "sending",
    "sent",
    "cancelled",
    "expired",
    "failed",
    "outcome_unknown",
]


class FollowUpSummary(TypedDict):
    """One recipient's follow-up, with Unix millisecond timestamps."""

    id: str
    numberId: str
    status: FollowUpStatus
    anchorKind: Literal["delivered", "read"] | None
    firstDeliveredAt: int | None
    firstReadAt: int | None
    dueAt: int | None
    expiresAt: int
    sentAt: int | None
    deliveredAt: int | None
    readAt: int | None
    repliedAt: int | None
    reason: str | None
    commandId: str | None


class FollowUpReport(TypedDict):
    """Outcomes counted apart from the first message; nextDueAt is Unix milliseconds."""

    total: int
    waiting: int
    scheduled: int
    sending: int
    sent: int
    delivered: int
    read: int
    replied: int
    cancelled: int
    expired: int
    failed: int
    unknown: int
    nextDueAt: int | None


class VariantStrategy(TypedDict):
    winnerCriterion: Criterion
    holdoutPercent: int
    testSlicePercent: NotRequired[int]
    autoPromote: Literal[True]
    testWindowMinutes: int


class Promoted(TypedDict):
    state: Literal["promoted"]
    winnerKey: str


class Inconclusive(TypedDict):
    state: Literal["inconclusive"]
    reason: Literal["insufficient_evidence"]


ExperimentOutcome = Promoted | Inconclusive


class VariantResult(TypedDict):
    key: str
    label: str
    weight: int
    assigned: int
    sent: int
    delivered: int
    read: int
    replied: int
    outcomeRate: float


class ExperimentResults(TypedDict):
    criterion: Criterion
    outcome: ExperimentOutcome | None
    holdoutCount: int
    reserveCount: int
    variants: list[VariantResult]


class Hours(TypedDict):
    start: str
    end: str


class SendWindowInput(TypedDict):
    days: list[Weekday]
    hours: list[Hours]
    timeZone: NotRequired[str]
    recipientTimeZone: NotRequired[bool]
    timeZoneVariable: NotRequired[str]


class SendWindow(TypedDict):
    days: list[Weekday]
    hours: list[Hours]
    timeZone: str
    recipientTimeZone: bool
    timeZoneVariable: str


class CampaignTrackedLink(TypedDict):
    key: str
    url: str


class CampaignVariableBinding(TypedDict, total=False):
    source: str
    fallback: str


CampaignVariableMapping = dict[str, CampaignVariableBinding]


class CampaignMessageMediaFields(TypedDict):
    kind: Literal["image", "video", "audio", "document"]
    url: str
    filename: NotRequired[str]
    caption: NotRequired[str]


class CampaignMessageButtonFields(TypedDict):
    kind: Literal["reply", "link", "call"]
    label: str
    url: NotRequired[str]
    phone: NotRequired[str]


def _open_fields(fields: object, extra: Mapping[str, Json] | None, known: set[str]) -> JsonObject:
    from .errors import ValidationError

    if extra is not None and set(extra) & known:
        raise ValidationError("Use the typed fields for named composed-message fields.")
    return {**cast(JsonObject, fields), **(extra or {})}


class CampaignMessageMedia(dict[str, Json]):
    """Open media input with typed known fields and explicit extensions."""

    def __init__(
        self, fields: CampaignMessageMediaFields, *, extra_fields: Mapping[str, Json] | None = None
    ) -> None:
        super().__init__(
            _open_fields(fields, extra_fields, set(CampaignMessageMediaFields.__annotations__))
        )

    @property
    def known(self) -> CampaignMessageMediaFields:
        return cast(CampaignMessageMediaFields, self)


class CampaignMessageButton(dict[str, Json]):
    def __init__(
        self, fields: CampaignMessageButtonFields, *, extra_fields: Mapping[str, Json] | None = None
    ) -> None:
        super().__init__(
            _open_fields(fields, extra_fields, set(CampaignMessageButtonFields.__annotations__))
        )

    @property
    def known(self) -> CampaignMessageButtonFields:
        return cast(CampaignMessageButtonFields, self)


DelayUnit = Literal["minutes", "hours", "days"]


class StepWindow(TypedDict):
    """Later drip steps only. At most four hour ranges, in the campaign's time zone."""

    days: list[Weekday]
    hours: list[Hours]


class CampaignMessageFields(TypedDict, total=False):
    version: Literal[2]
    source: str
    media: CampaignMessageMediaFields | CampaignMessageMedia
    buttons: list[CampaignMessageButtonFields | CampaignMessageButton]
    footer: str
    # 0..86400 for ordinary campaigns and 0..2592000 for drip steps, in whole
    # multiples of delayUnit when set.
    delayAfterSec: int
    delayUnit: DelayUnit
    sendWindow: StepWindow | None


class FrequencyCap(TypedDict):
    """Rolling per-contact limits; None means no additional limit for that window.

    maxPer24Hours is 1..50 and cannot exceed maxPer7Days (1..200) when both are set."""

    maxPer24Hours: int | None
    maxPer7Days: int | None


class FrequencyCapSettings(FrequencyCap):
    """The team cap. revision is 0 and updatedAt None until first saved."""

    teamId: str
    revision: int
    updatedAt: int | None


class UpdateFrequencyCap(FrequencyCap):
    """Complete replacement with the revision from the last read."""

    revision: int


class FrequencyCapAnalytics(TypedDict):
    skippedRecipientCount: int


DripEnrollment = Literal["audience", "continuous"]
# Values of recipient sequenceError; arbitrary send failure codes also occur.
DripExitReason = Literal["replied", "link_clicked", "opted_out"]


class Drip(TypedDict):
    enrollment: DripEnrollment
    exitOnReply: bool
    # GET opens count, including link previews and scanners; HEAD does not.
    exitOnLinkClick: bool


class DripInput(TypedDict, total=False):
    """Create defaults (applied by the API): audience, True, False."""

    enrollment: DripEnrollment
    exitOnReply: bool
    exitOnLinkClick: bool


class DripPatch(TypedDict, total=False):
    """Omitted settings keep their stored values; no defaults are applied."""

    enrollment: DripEnrollment
    exitOnReply: bool
    exitOnLinkClick: bool


class DripStepStats(TypedDict):
    step: int
    entered: int
    waiting: int
    sent: int
    delivered: int
    read: int
    replied: int
    exited: int
    failed: int


class DripStats(TypedDict):
    enrollment: DripEnrollment
    enrolled: int
    enrolledByApi: int
    active: int
    completed: int
    exited: int
    steps: list[DripStepStats]


class SegmentSnapshot(TypedDict):
    revision: int
    evaluatedAt: int
    matchedCount: int


class EnrollContact(TypedDict):
    """A phone already in the drip returns created False and never restarts."""

    phone: str
    variables: NotRequired[dict[str, str | float | bool]]


class EnrollPlatformContact(EnrollContact):
    # Organization API keys select the owning project explicitly.
    projectId: str


class Enrollment(TypedDict):
    campaignId: str
    recipientId: str
    phone: str
    created: bool
    status: str
    enrolledAt: float


class CampaignMessage(dict[str, Json]):
    def __init__(
        self,
        fields: CampaignMessageFields | None = None,
        *,
        extra_fields: Mapping[str, Json] | None = None,
    ) -> None:
        super().__init__(
            _open_fields(
                {} if fields is None else fields,
                extra_fields,
                set(CampaignMessageFields.__annotations__),
            )
        )

    @property
    def known(self) -> CampaignMessageFields:
        return cast(CampaignMessageFields, self)


class Campaign(TypedDict):
    id: str
    name: str
    status: str
    templateId: str | None
    recipientListId: str | None
    recipientCount: int
    sentCount: int
    deliveredCount: int
    readCount: int
    failedCount: int
    skippedCount: int
    scheduledAt: int | None
    launchedAt: int | None
    completedAt: int | None
    createdAt: int
    updatedAt: int
    sendWindow: SendWindow | None
    composerBlueprint: NotRequired[Json]
    messages: NotRequired[Json]
    audienceRef: NotRequired[Json]
    senderConfig: NotRequired[Json]
    complianceConfig: NotRequired[Json]
    variants: NotRequired[list[Variant] | None]
    variantStrategy: NotRequired[VariantStrategy | None]
    experimentOutcome: ExperimentOutcome | None
    messageVariations: NotRequired[list[MessageVariation] | None]
    followUp: FollowUp | None
    trackedLinks: list[CampaignTrackedLink]
    variableMapping: NotRequired[CampaignVariableMapping | None]
    frequencyCap: NotRequired[FrequencyCap | None]
    drip: NotRequired[Drip | None]
    enrollmentOpen: NotRequired[bool | None]
    pauseReason: NotRequired[str | None]
    # Read-only on the Messaging API; choose segments through the Platform API.
    segmentId: NotRequired[str | None]
    segmentSnapshot: NotRequired[SegmentSnapshot | None]


class PlatformCampaign(dict[str, Json]):
    """Open Platform response; use known for typed access to named campaign fields."""

    @property
    def known(self) -> Campaign:
        return cast(Campaign, self)


class CampaignOperation(Campaign):
    operationId: str


class CampaignStopped(Campaign):
    operationId: str | None


class AnalyticsCounts(TypedDict):
    campaignId: str
    recipientCount: int
    sentCount: int
    deliveredCount: int
    readCount: int
    failedCount: int
    skippedCount: int
    respondedCount: int
    responseRate: float


class Analytics(AnalyticsCounts):
    experiment: ExperimentResults | None
    followUps: FollowUpReport
    averageResponseTimeMs: float | None
    minResponseTimeMs: float | None
    maxResponseTimeMs: float | None
    frequencyCap: NotRequired[FrequencyCapAnalytics]
    drip: NotRequired[DripStats | None]


class PlatformAnalytics(AnalyticsCounts):
    experiment: ExperimentResults | None
    followUps: FollowUpReport
    averageResponseTimeMs: float | None
    minResponseTimeMs: float | None
    maxResponseTimeMs: float | None
    frequencyCap: NotRequired[FrequencyCapAnalytics]
    drip: NotRequired[DripStats | None]


class RecipientInput(TypedDict):
    phone: str
    variables: NotRequired[dict[str, str | float | bool]]


class CreateCampaign(TypedDict):
    name: str
    templateId: NotRequired[str]
    recipientListId: NotRequired[str]
    senderConfig: NotRequired[JsonObject]
    scheduledAt: NotRequired[int]
    sendWindow: NotRequired[SendWindowInput | None]
    recipients: NotRequired[list[RecipientInput]]
    messageVariations: NotRequired[list[MessageVariation] | None]
    variants: NotRequired[list[Variant] | None]
    variantStrategy: NotRequired[VariantStrategy | None]
    followUp: NotRequired[FollowUp | None]
    variableMapping: NotRequired[CampaignVariableMapping]
    trackedLinks: NotRequired[list[CampaignTrackedLink] | None]
    frequencyCap: NotRequired[FrequencyCap | None]
    drip: NotRequired[DripInput | None]


class CreatePlatformCampaign(TypedDict):
    projectId: str
    name: str
    templateId: NotRequired[str]
    recipientListId: NotRequired[str]
    senderConfig: NotRequired[JsonObject]
    scheduledAt: NotRequired[int]
    sendWindow: NotRequired[SendWindowInput | None]
    recipients: NotRequired[list[RecipientInput]]
    recipientCount: NotRequired[int]
    composerBlueprint: NotRequired[Json]
    messagesArray: NotRequired[list[CampaignMessageFields | CampaignMessage]]
    audienceRef: NotRequired[Json]
    complianceConfig: NotRequired[Json]
    variants: NotRequired[list[Variant]]
    variantStrategy: NotRequired[VariantStrategy]
    messageVariations: NotRequired[list[MessageVariation]]
    followUp: NotRequired[FollowUp | None]
    variableMapping: NotRequired[CampaignVariableMapping]
    trackedLinks: NotRequired[list[CampaignTrackedLink] | None]
    frequencyCap: NotRequired[FrequencyCap | None]
    drip: NotRequired[DripInput | None]
    # Omit rather than sending null; cannot combine with recipientListId.
    segmentId: NotRequired[str]


class UpdateCampaign(TypedDict, total=False):
    templateId: str | None
    variableMapping: CampaignVariableMapping | None
    trackedLinks: list[CampaignTrackedLink] | None
    name: str
    recipientListId: str | None
    senderConfig: JsonObject
    scheduledAt: int | None
    sendWindow: SendWindowInput | None
    messageVariations: list[MessageVariation] | None
    variants: list[Variant] | None
    variantStrategy: VariantStrategy | None
    followUp: FollowUp | None
    frequencyCap: FrequencyCap | None
    drip: DripPatch | None


class UpdatePlatformCampaign(UpdateCampaign, total=False):
    messagesArray: list[CampaignMessageFields | CampaignMessage]
    # Unlaunched drafts only; None clears the segment.
    segmentId: str | None
    composerBlueprint: Json
    audienceRef: Json
    complianceConfig: Json


class LaunchCampaign(TypedDict, total=False):
    scheduledAt: int
    skipMissingVariables: bool


class LaunchPlatformCampaign(TypedDict):
    projectId: str
    scheduledAt: NotRequired[float]
    skipMissingVariables: NotRequired[bool]


class PlatformCampaignLaunchFields(CampaignOperation):
    pass


class PlatformCampaignLaunchResult(dict[str, Json]):
    @property
    def known(self) -> PlatformCampaignLaunchFields:
        return cast(PlatformCampaignLaunchFields, self)


class Reschedule(TypedDict):
    scheduledAt: int | None


class PlatformReschedule(Reschedule):
    projectId: str


class Requeue(TypedDict, total=False):
    includeSkippedError: bool


class Requeued(TypedDict):
    requeued: int


class Recipient(TypedDict):
    id: str
    phone: str
    variables: JsonObject
    variantKey: str | None
    status: RecipientStatus
    attempts: int
    lastError: str | None
    externalMessageId: str | None
    queuedAt: int
    sentAt: int | None
    deliveredAt: int | None
    readAt: int | None
    failedAt: int | None
    respondedAt: int | None
    followUp: FollowUpSummary | None
    failureReason: CampaignRecipientFailureReason | None
    messagesSent: int
    nextMessageAt: float | None
    sequenceError: str | None


class PlatformRecipient(TypedDict):
    id: str
    phone: str
    variables: JsonObject
    variantKey: str | None
    status: RecipientStatus
    attempts: int
    lastError: str | None
    externalMessageId: str | None
    queuedAt: int
    sentAt: int | None
    deliveredAt: int | None
    readAt: int | None
    failedAt: int | None
    respondedAt: int | None
    followUp: FollowUpSummary | None
    failureReason: CampaignRecipientFailureReason | None
    messagesSent: int
    nextMessageAt: int | None
    sequenceError: str | None


class InvalidRow(TypedDict):
    row: int
    reason: Literal["missing_phone", "invalid_phone", "invalid_variables", "invalid_entry"]


class AddRecipients(TypedDict):
    recipients: list[RecipientInput]


class AddPlatformRecipients(AddRecipients):
    projectId: str


class AddedRecipients(TypedDict):
    campaignId: str
    added: int
    recipientCount: int
    duplicateCount: int
    invalidCount: int
    invalidRows: list[InvalidRow]


class RecipientsParams(TypedDict, total=False):
    reason: CampaignRecipientFailureReason
    status: RecipientStatus
    cursor: str
    limit: int


class PlatformRecipientsParams(RecipientsParams):
    projectId: str


class CampaignParams(TypedDict):
    projectId: str


class ListCampaigns(CampaignParams):
    projectSlug: NotRequired[str]


class ConversionValue(TypedDict):
    amountMinor: int
    currency: str


class RecordConversion(CampaignParams):
    recipientId: str
    eventId: str
    eventType: str
    occurredAt: str
    value: NotRequired[ConversionValue | None]


class Attribution(TypedDict):
    outcome: Literal["attributed", "outside_window", "not_sent", "opted_out"]
    touchAt: str | None
    windowDays: Literal[7]


class Conversion(TypedDict):
    id: str
    campaignId: str
    recipientId: str | None
    eventType: str
    occurredAt: str
    value: ConversionValue | None
    evidence: Literal["customer_reported"]
    attribution: Attribution
    recordedAt: str
    replayed: bool


class ConversionModel(TypedDict):
    touch: Literal["recipient_sent"]
    windowDays: Literal[7]
    correlation: Literal["explicit_recipient"]


class ConversionCounts(TypedDict):
    total: int
    attributed: int
    outsideWindow: int
    notSent: int
    optedOut: int


class CurrencyTotal(TypedDict):
    currency: str
    evidence: Literal["customer_reported"]
    attributedConversions: int
    attributedAmountMinor: str
    unattributedConversions: int
    unattributedAmountMinor: str


class ConversionReport(TypedDict):
    campaignId: str
    model: ConversionModel
    sentCount: int
    conversions: ConversionCounts
    convertedRecipients: int
    conversionRate: float
    values: list[CurrencyTotal]


Source = Literal["csv", "manual", "api"]


class ImportMapping(TypedDict):
    phone: str
    variables: NotRequired[dict[str, str]]


class InlineAudience(TypedDict):
    name: str
    source: NotRequired[Source]
    members: NotRequired[list[RecipientInput]]


class FileAudience(TypedDict):
    name: str
    source: NotRequired[Source]
    fileId: str
    mapping: ImportMapping


CreateAudience = InlineAudience | FileAudience


class Audience(TypedDict):
    id: str
    name: str
    source: Source
    recipientCount: int
    fileId: str | None
    columns: list[str] | None
    sampleRow: dict[str, str] | None
    mapping: JsonObject | None
    createdAt: int
    updatedAt: int


class ImportedAudience(Audience):
    duplicateCount: int
    invalidCount: int
    invalidRows: list[InvalidRow]


class AudienceMember(TypedDict):
    id: str
    phone: str
    variables: dict[str, str]
    createdAt: int


class ListMembers(TypedDict, total=False):
    cursor: str
    limit: int


class AddMembers(TypedDict):
    members: list[RecipientInput]


class AddedMembers(TypedDict):
    listId: str
    added: int
    recipientCount: int
    duplicateCount: int
    invalidCount: int
    invalidRows: list[InvalidRow]


class RemovedMember(TypedDict):
    removed: Literal[True]
    listId: str
    phone: str
    recipientCount: int
