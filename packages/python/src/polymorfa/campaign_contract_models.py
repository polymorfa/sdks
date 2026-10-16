"""Additive campaign, customer-supplied profile and future custody contracts."""

from __future__ import annotations

from typing import Generic, Literal, TypeVar

from typing_extensions import NotRequired, TypedDict


class ReplyText(TypedDict):
    kind: Literal["text"]
    text: str


class ReplyButton(TypedDict):
    id: str
    text: str


class ReplyButtons(TypedDict):
    kind: Literal["buttons"]
    body: str
    buttons: list[ReplyButton]
    footer: NotRequired[str]


class ReplyRow(TypedDict):
    id: str
    title: str
    description: NotRequired[str]


class ReplyList(TypedDict):
    kind: Literal["list"]
    body: str
    buttonText: str
    rows: list[ReplyRow]
    footer: NotRequired[str]


class ReplyForm(TypedDict):
    kind: Literal["flow_form"]
    flowId: str
    body: str
    buttonText: str
    screen: str
    footer: NotRequired[str]


CampaignReplyFlowSend = ReplyText | ReplyButtons | ReplyList | ReplyForm


class ReplyChoiceMatch(TypedDict):
    kind: Literal["choice"]
    replyKind: Literal["button", "list"]
    id: str


class ReplyKeywordMatch(TypedDict):
    kind: Literal["keyword"]
    value: str


class ReplySubmissionMatch(TypedDict):
    kind: Literal["flow_submission"]


CampaignReplyFlowMatch = ReplyChoiceMatch | ReplyKeywordMatch | ReplySubmissionMatch


class CampaignReplyFlowEdge(TypedDict):
    match: CampaignReplyFlowMatch
    to: str


class CampaignReplyFlowNode(TypedDict):
    id: str
    send: NotRequired[CampaignReplyFlowSend]
    edges: list[CampaignReplyFlowEdge]


class CampaignReplyFlowDefinition(TypedDict):
    entryNodeId: str
    nodes: list[CampaignReplyFlowNode]


class CreateCampaignReplyFlowRequest(TypedDict):
    name: str
    definition: CampaignReplyFlowDefinition
    flowKey: NotRequired[str]
    revision: NotRequired[int]


class CampaignProjectParams(TypedDict):
    projectId: str


class CreatePlatformCampaignReplyFlowRequest(CreateCampaignReplyFlowRequest):
    projectId: str


class CampaignReplyFlow(TypedDict):
    id: str
    flowKey: str
    revision: int
    name: str
    definition: CampaignReplyFlowDefinition
    createdAt: int


class CampaignTestSendRequest(TypedDict):
    sessionId: str
    to: str
    sampleRecipientId: NotRequired[str]
    variables: NotRequired[dict[str, str | int | float | bool]]


class PlatformCampaignTestSendRequest(CampaignTestSendRequest):
    projectId: str


class CampaignTestSender(TypedDict):
    sessionId: str
    phone: str


# The reserved Python keyword remains the literal wire key.
CampaignTestSend = TypedDict(
    "CampaignTestSend",
    {
        "id": str,
        "campaignId": str,
        "status": Literal["sent"],
        "from": CampaignTestSender,
        "to": str,
        "messageId": str | None,
        "variables": dict[str, str],
        "createdAt": int,
    },
)


class SetCampaignReplyFlowRequest(TypedDict):
    replyFlowId: str | None


class SetPlatformCampaignReplyFlowRequest(SetCampaignReplyFlowRequest):
    projectId: str


class CampaignReplyFlowAssignment(TypedDict):
    campaignId: str
    replyFlowId: str | None


class CampaignTrackedLinkReport(TypedDict):
    key: str
    url: str
    uniqueOpens: int
    totalOpens: int


CampaignRecipientFailureReason = Literal[
    "opted_out",
    "cold_held",
    "campaign_cancelled",
    "invalid_recipient",
    "session_not_connected",
    "ack_timeout",
    "blocked_by_safety",
    "send_failed",
    "missing_variable",
    "other",
]


class CampaignRecipientExportParams(TypedDict, total=False):
    status: Literal["queued", "sending", "sent", "delivered", "read", "failed", "skipped"]
    reason: CampaignRecipientFailureReason
    cursor: str
    limit: int


class PlatformCampaignRecipientExportParams(CampaignRecipientExportParams):
    projectId: str


class CampaignRecipientExportPage(TypedDict):
    csv: str
    nextCursor: str | None
    filename: str | None


class CampaignApprovalRequester(TypedDict):
    type: str
    id: str


class CampaignLaunchApproval(TypedDict):
    id: str
    campaignId: str
    action: Literal["launch", "resume", "reschedule"]
    status: Literal["pending", "approved", "rejected", "superseded", "expired"]
    reasons: list[Literal["audience_threshold", "agent_request"]]
    recipientCount: int
    scheduledAt: int | None
    requestedBy: CampaignApprovalRequester
    requestedAt: int
    expiresAt: int
    decidedBy: str | None
    decidedAt: int | None
    operationId: str | None


class CampaignLaunchApprovalSettings(TypedDict):
    recipientThreshold: int | None


class CampaignSettings(TypedDict):
    launchApproval: CampaignLaunchApprovalSettings


AudienceProfileAttribute = str | int | float | bool | None
AudienceProfileSource = Literal["api", "csv", "form"]


class AudienceProfileProvenance(TypedDict):
    source: AudienceProfileSource
    reference: str


class AudienceProfileConsentInput(AudienceProfileProvenance):
    purpose: Literal["campaigns"]
    allowed: bool
    assertedAt: int


class AudienceProfile(TypedDict):
    id: str
    phone: str
    revision: int
    tags: list[str]
    attributes: dict[str, AudienceProfileAttribute]
    provenance: AudienceProfileProvenance | None
    createdAt: int
    updatedAt: int


class PutAudienceProfileRequest(TypedDict):
    tags: list[str]
    attributes: dict[str, AudienceProfileAttribute]
    expectedRevision: NotRequired[int]
    provenance: NotRequired[AudienceProfileProvenance]
    consent: NotRequired[AudienceProfileConsentInput]


class AudienceConsentAssertion(AudienceProfileConsentInput):
    id: str
    profileRevision: int
    createdAt: int


class AudienceProfilePageInfo(TypedDict):
    nextCursor: str | None
    hasMore: bool


T = TypeVar("T")


class AudienceProfilePage(TypedDict, Generic[T]):
    data: list[T]
    page: AudienceProfilePageInfo


class DeleteAudienceProfileResult(TypedDict):
    deleted: Literal[True]
    phone: str
    revision: int


class AudienceProfileImportMapping(TypedDict):
    phone: str
    tags: str
    attributes: str
    expectedRevision: NotRequired[str]
    provenanceReference: NotRequired[str]
    consentAllowed: NotRequired[str]
    consentAssertedAt: NotRequired[str]
    consentReference: NotRequired[str]


class CreateAudienceProfileImportRequest(TypedDict):
    replayKey: str
    csvBase64: str
    mapping: NotRequired[AudienceProfileImportMapping]


class ImportInvalidSample(TypedDict):
    row: int
    reason: str


class ImportConflictSample(TypedDict):
    row: int
    reason: Literal["quota", "revision_conflict"]


class AudienceProfileImportJob(TypedDict):
    id: str
    state: Literal["queued", "completed", "cancelled"]
    totalValid: int
    invalidCount: int
    invalidSamples: list[ImportInvalidSample]
    conflictSamples: list[ImportConflictSample]
    processedValid: int
    createdCount: int
    updatedCount: int
    conflictCount: int
    createdAt: int
    updatedAt: int
    completedAt: int | None


CampaignRetargetOutcome = Literal[
    "delivered", "not_delivered", "read", "not_read", "replied", "not_replied", "failed"
]


class CreateAudienceFromCampaignRequest(TypedDict):
    name: str
    campaignId: str
    outcome: CampaignRetargetOutcome
    projectId: NotRequired[str]


class AudienceFromCampaignResult(TypedDict):
    id: str
    name: str
    source: Literal["campaign"]
    recipientCount: int
    fileId: str | None
    columns: list[str] | None
    sampleRow: dict[str, str] | None
    mapping: dict[str, object] | None
    createdAt: int
    updatedAt: int
    sourceCampaignId: str
    outcome: CampaignRetargetOutcome
    matchedCount: int
    optedOutCount: int


StopConfirmationLocale = Literal["en", "pt-BR", "es"]


class StopConfirmationSettings(TypedDict):
    teamId: str
    enabled: bool
    locale: StopConfirmationLocale | None
    revision: int
    textRevision: Literal[1]
    acknowledgement: str | None
    updatedAt: int | None


class EnabledStopConfirmation(TypedDict):
    teamId: str
    revision: int
    enabled: Literal[True]
    locale: StopConfirmationLocale


class DisabledStopConfirmation(TypedDict):
    teamId: str
    revision: int
    enabled: Literal[False]
    locale: StopConfirmationLocale | None


UpdateStopConfirmationSettingsInput = EnabledStopConfirmation | DisabledStopConfirmation


class StopConfirmationCounts(TypedDict):
    queued: int
    admitted: int
    completed: int
    failed: int
    unknown: int


class StopConfirmationSummary(TypedDict):
    enabled: bool
    counts: StopConfirmationCounts


SignalCustodyMode = Literal["standard", "zero_knowledge"]


class SignalCustodyDefault(TypedDict):
    signalModeDefault: SignalCustodyMode | None
    effectiveSignalMode: SignalCustodyMode
    revision: int


class ProjectSignalCustodyUpdate(TypedDict):
    expectedRevision: int
    signalModeDefault: SignalCustodyMode


class CustomerSignalCustodyUpdate(TypedDict):
    expectedRevision: int
    signalModeDefault: SignalCustodyMode | None


class ListAudienceProfilesParams(TypedDict, total=False):
    cursor: str
    limit: int
