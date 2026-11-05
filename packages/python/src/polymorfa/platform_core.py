"""Handwritten Platform project, number and Hybrid Link contracts."""

from typing import Literal

from typing_extensions import NotRequired, TypedDict

from .transport import JsonObject


class ProjectIcon(TypedDict):
    type: str
    value: str
    color: NotRequired[str]
    storageId: NotRequired[str]


class ProjectIconInput(TypedDict):
    type: Literal["emoji", "icon", "image"]
    value: str
    color: NotRequired[str]
    storageId: NotRequired[str]


class CreateProject(TypedDict):
    name: str
    icon: NotRequired[ProjectIconInput]
    defaultTier: NotRequired[Literal["free", "standard", "pro"]]


class CreatedProject(TypedDict):
    id: str
    orgId: str
    name: str
    slug: str
    icon: ProjectIcon
    defaultTier: Literal["free", "standard", "pro"]
    isActive: bool
    stage: Literal["development"]


class ProjectWithStats(TypedDict):
    _id: str
    _creationTime: int
    orgId: str
    name: str
    slug: str
    icon: ProjectIcon | JsonObject
    defaultTier: str
    isActive: bool
    stage: Literal["development", "production"]
    activeSessions: int
    totalSessions: int
    totalMessages: int
    lastActivity: int | None
    iconUrl: str | None


class ProductionBusiness(TypedDict):
    name: str
    website: str
    supportEmail: str


class ProductionEnrollment(TypedDict):
    business: ProductionBusiness


class ProductionEnrollmentResult(TypedDict):
    id: str
    orgId: str
    name: str
    slug: str
    stage: Literal["development"]
    operationId: str
    enrollmentStatus: Literal["requested", "approval_required", "provisioning", "ready"]
    billingMode: Literal["payg"]


class ProductionEnrollmentCommand(TypedDict):
    operationId: str
    action: Literal["approve", "cancel"]
    accepted: Literal[True]


HybridTransport = Literal["linked_devices", "official_api"]


class HybridKeep(TypedDict):
    action: Literal["keep"]
    transport: HybridTransport


class HybridSplit(TypedDict):
    action: Literal["split"]
    existingNumberTransport: HybridTransport
    newNumberName: str


class HybridMerge(TypedDict):
    absorbNumberId: str


class TierQuoteBase(TypedDict):
    projectId: NotRequired[str]
    tierOverride: Literal["free", "standard", "pro"] | None


class TierQuotePlain(TierQuoteBase):
    pass


class TierQuoteResolution(TierQuoteBase):
    hybridResolution: HybridKeep | HybridSplit


class TierQuoteMerge(TierQuoteBase):
    hybridMerge: HybridMerge


TierQuoteRequest = TierQuotePlain | TierQuoteResolution | TierQuoteMerge


class TierConfirmation(TypedDict):
    quoteId: str
    projectId: NotRequired[str]


class HybridTransitionBase(TypedDict):
    survivingNumberId: str
    status: NotRequired[Literal["scheduled", "running", "completed", "failed", "cancelled"]]
    failureReason: NotRequired[str | None]
    metaDisconnectRequired: NotRequired[bool]
    effectiveAtMs: NotRequired[int | None]


class HybridKeepTransition(HybridTransitionBase):
    action: Literal["keep"]
    keepTransport: HybridTransport


class HybridSplitTransition(HybridTransitionBase):
    action: Literal["split"]
    existingNumberTransport: HybridTransport
    newNumberName: str
    newNumberId: NotRequired[str]


class HybridMergeTransition(HybridTransitionBase):
    action: Literal["merge"]
    absorbNumberId: str


class TierQuote(TypedDict):
    tier: str
    tierOverride: str | None
    amountCents: float
    priceVersion: str
    action: Literal["upgrade", "downgrade", "configure"]
    effectiveAtMs: int
    replacesWindowId: str | None
    hybridTransition: NotRequired[
        HybridKeepTransition | HybridSplitTransition | HybridMergeTransition
    ]


class NumberTierChange(TypedDict):
    id: str
    status: Literal["quoted", "queued", "applied", "rejected"]
    failureReason: str | None
    expiresAtMs: int
    quote: TierQuote


class HybridCandidateNumber(TypedDict):
    id: str
    name: str
    transport: HybridTransport
    status: str
    canBeAbsorbed: bool


class HybridMergeCandidate(TypedDict):
    numbers: list[HybridCandidateNumber]
    eligible: bool
    ineligibleReason: NotRequired[
        Literal[
            "deletion_in_progress",
            "not_coexistence",
            "different_customer",
            "connection_disabled",
            "not_connected",
            "transition_in_progress",
            "pairing_in_progress",
            "hms_enabled",
        ]
    ]


class SessionBatch(TypedDict):
    projectId: NotRequired[str]
    sessionIds: list[str]


class BatchStopped(TypedDict):
    stopping: int


class BatchRemoved(TypedDict):
    removed: int


CapabilitySource = Literal["server", "client_default", "account_type"]


class FeatureCapability(TypedDict):
    key: str
    source: CapabilitySource | None
    kind: Literal["feature"]
    unit: None
    value: bool | None


class LimitCapability(TypedDict):
    key: str
    source: CapabilitySource | None
    kind: Literal["limit"]
    unit: Literal["seconds", "count", "characters", "members"]
    value: int | None


class SessionCapabilities(TypedDict):
    session: str
    projectId: str
    status: Literal["synced", "unknown"]
    syncedAt: str | None
    checkedAt: str | None
    accountType: Literal["business", "personal"] | None
    capabilities: list[FeatureCapability | LimitCapability]
