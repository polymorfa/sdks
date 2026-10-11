"""Handwritten campaign and customer-supplied audience wire contracts."""

from typing import Literal

from typing_extensions import NotRequired, TypedDict

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
    experimentOutcome: NotRequired[ExperimentOutcome | None]
    messageVariations: NotRequired[list[MessageVariation] | None]


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
    experiment: NotRequired[ExperimentResults | None]


class PlatformAnalytics(AnalyticsCounts):
    experiment: ExperimentResults | None
    averageResponseTimeMs: float | None
    minResponseTimeMs: float | None
    maxResponseTimeMs: float | None


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
    messagesArray: NotRequired[Json]
    audienceRef: NotRequired[Json]
    complianceConfig: NotRequired[Json]
    variants: NotRequired[list[Variant]]
    variantStrategy: NotRequired[VariantStrategy]
    messageVariations: NotRequired[list[MessageVariation]]


class UpdateCampaign(TypedDict, total=False):
    name: str
    recipientListId: str | None
    senderConfig: JsonObject
    scheduledAt: int | None
    sendWindow: SendWindowInput | None
    messageVariations: list[MessageVariation] | None
    variants: list[Variant] | None
    variantStrategy: VariantStrategy | None


class LaunchCampaign(TypedDict, total=False):
    scheduledAt: int


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
