"""Handwritten payload shapes from the pinned native webhook contract.

Verification checks the envelope and preserves extra payload fields. These types
describe known payloads without dropping future server fields.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Generic, Literal, TypeVar

from typing_extensions import Never, NotRequired, TypedDict

from .cloud_order import CloudOrder
from .models import WhatsAppMessageIds
from .platform_core import SessionCapabilities
from .transport import Json, JsonObject


class IdentityReference(TypedDict):
    parentBsuid: NotRequired[str]
    id: str
    phoneNumber: NotRequired[str]
    bsuid: NotRequired[str]
    username: NotRequired[str]


class ConversationReference(IdentityReference):
    sender: NotRequired[IdentityReference]


class NativeFlowResponse(TypedDict):
    name: str
    paramsJson: str
    version: NotRequired[float]


class ReplyChoice(TypedDict):
    kind: Literal["button", "list"]
    id: str


class PollOption(TypedDict):
    name: str
    hash: str


LinkedDeviceMessageType = Literal[
    "text",
    "image",
    "video",
    "audio",
    "document",
    "location",
    "contact",
    "phone_number_shared",
    "native_flow_response",
    "button_reply",
    "list_reply",
    "poll",
    "sticker",
    "reaction",
    "revoke",
    "edited",
    "unknown",
]


class LinkedDeviceMessagePayload(TypedDict):
    id: str
    whatsapp_ids: WhatsAppMessageIds
    whatsapp_id: NotRequired[str]
    conversation: ConversationReference
    fromMe: bool
    timestamp: float
    pushName: str
    isGroup: bool
    type: LinkedDeviceMessageType
    text: NotRequired[str]
    caption: NotRequired[str]
    mimeType: NotRequired[str]
    ptt: NotRequired[bool]
    filename: NotRequired[str]
    latitude: NotRequired[float]
    longitude: NotRequired[float]
    displayName: NotRequired[str]
    title: NotRequired[str]
    reaction: NotRequired[str]
    reactionTo: NotRequired[str]
    revokedId: NotRequired[str]
    media: NotRequired[str]
    mediaUrl: NotRequired[str]
    edited: NotRequired[bool]
    pollOptions: NotRequired[list[PollOption]]
    unavailable: NotRequired[bool]
    unavailableReason: NotRequired[str]
    nativeFlowResponse: NotRequired[NativeFlowResponse]
    replyChoice: NotRequired[ReplyChoice]
    parentMessageId: NotRequired[str]


MessagePayload = LinkedDeviceMessagePayload


class CloudMessageReferral(TypedDict, total=False):
    source_type: str
    source_id: str
    source_url: str
    ctwa_clid: str


class CloudMessagePayload(TypedDict):
    order: NotRequired[CloudOrder]
    id: str
    whatsapp_ids: WhatsAppMessageIds
    whatsapp_id: NotRequired[str]
    conversation: ConversationReference
    timestamp: str
    type: str
    senderName: NotRequired[str]
    nativeFlowResponse: NotRequired[NativeFlowResponse]
    replyChoice: NotRequired[ReplyChoice]
    parentMessageId: NotRequired[str]
    interactive: NotRequired[JsonObject]
    referral: NotRequired[CloudMessageReferral]


MessageReceivedPayload = LinkedDeviceMessagePayload | CloudMessagePayload


class MessageSentPayload(TypedDict):
    id: str
    whatsapp_ids: WhatsAppMessageIds
    whatsapp_id: NotRequired[str]
    conversation: ConversationReference
    type: str
    timestamp: float


class MetaPricingReport(TypedDict, total=False):
    billable: bool
    pricing_model: str
    category: str
    type: str


class AckMessage(TypedDict):
    id: str
    whatsapp_ids: WhatsAppMessageIds
    whatsapp_id: NotRequired[str]


_OptionalFrom = TypedDict("_OptionalFrom", {"from": NotRequired[IdentityReference]})
_From = TypedDict("_From", {"from": IdentityReference})
_NullableFrom = TypedDict("_NullableFrom", {"from": IdentityReference | None})


class MessageAckPayload(_OptionalFrom):
    messages: list[AckMessage]
    conversation: ConversationReference
    sender: NotRequired[IdentityReference]
    type: str
    timestamp: float
    pricing: NotRequired[MetaPricingReport]


class MessageDeletePayload(_From):
    sender: IdentityReference
    id: str
    whatsapp_ids: WhatsAppMessageIds
    whatsapp_id: NotRequired[str]
    conversation: ConversationReference
    fromMe: bool


class PollVotePayload(TypedDict):
    conversation: ConversationReference
    pollMessageId: str
    voter: IdentityReference
    selectedHashes: list[str]
    timestamp: float


class RuntimeSessionStatusPayload(TypedDict):
    status: str
    statusReason: NotRequired[str]
    banCode: NotRequired[float]
    banReason: NotRequired[str]
    banExpiresAt: NotRequired[float]
    detail: NotRequired[str]


class CloudAccountStatusPayload(TypedDict):
    source: Literal["meta"]
    kind: Literal["account_alerts", "account_update", "phone_number_name_update"]
    wabaId: NotRequired[str]
    value: JsonObject


SessionStatusPayload = RuntimeSessionStatusPayload | CloudAccountStatusPayload


class SessionRestrictionUpdatedPayload(TypedDict):
    type: Literal["reachout_timelock"]
    active: bool
    enforcementType: str | None
    expiresAt: str | None
    observedAt: str


class SessionConnectedPayload(TypedDict):
    phoneNumber: str
    id: NotRequired[str]
    pushName: str
    phonePlatform: Literal["android", "ios", "meta_cloud", "unknown"]
    accountType: Literal["whatsapp_app", "business_app", "meta_cloud", "meta_coexistence"]
    businessName: NotRequired[str]


class SessionLoggedOutPayload(TypedDict):
    reason: Literal["banned", "device_removed", "unknown"]
    code: float


class SessionPhoneOfflinePayload(TypedDict):
    daysSinceLastSeen: float
    daysRemaining: float
    lastSeen: str
    action: str


class OfficialGroupError(TypedDict):
    code: float
    title: NotRequired[str]


class GroupUpdatePayload(TypedDict):
    id: str
    newSubject: NotRequired[str]
    newDescription: NotRequired[str]
    action: NotRequired[str]
    requestId: NotRequired[str]
    inviteLink: NotRequired[str]
    joinApprovalRequired: NotRequired[bool]
    pictureChanged: NotRequired[bool]
    failedChanges: NotRequired[list[Literal["subject", "description", "picture"]]]
    errors: NotRequired[list[OfficialGroupError]]


class FailedGroupParticipant(TypedDict):
    participant: IdentityReference
    errors: NotRequired[list[OfficialGroupError]]


class GroupJoinRequest(TypedDict):
    joinRequestId: str
    user: IdentityReference
    state: Literal["created", "revoked"]


class GroupParticipantPayload(TypedDict):
    id: str
    joined: NotRequired[list[IdentityReference]]
    left: NotRequired[list[IdentityReference]]
    promoted: NotRequired[list[IdentityReference]]
    demoted: NotRequired[list[IdentityReference]]
    reason: NotRequired[str]
    initiatedBy: NotRequired[Literal["business", "participant"]]
    requestId: NotRequired[str]
    failedParticipants: NotRequired[list[FailedGroupParticipant]]
    errors: NotRequired[list[OfficialGroupError]]
    joinRequest: NotRequired[GroupJoinRequest]


class PresenceUpdatePayload(_OptionalFrom):
    observedAt: float
    sender: NotRequired[IdentityReference]
    state: NotRequired[str]
    media: NotRequired[str]
    unavailable: NotRequired[bool]
    lastSeen: NotRequired[float]


class ContactOptPayload(TypedDict):
    phone: str
    source: Literal["stop-keyword"]
    keyword: str
    session: str
    projectId: NotRequired[str]


class ContactPreviousIdentity(TypedDict, total=False):
    id: str
    bsuid: str
    parentBsuid: str


class ContactIdentityChange(TypedDict):
    reason: Literal["phone_number_changed", "user_id_changed"]
    messageId: str
    previous: NotRequired[ContactPreviousIdentity]


class MarketingOnboardingUpdatedPayload(TypedDict):
    kind: Literal["terms_signed", "ad_account_linked"]
    wabaId: str
    ownerBusinessId: NotRequired[str]
    metaEvent: Literal["MM_LITE_TERMS_SIGNED", "AD_ACCOUNT_LINKED"]


class ContactMarketingPreferencePayload(TypedDict):
    waId: str
    preference: Literal["stop", "resume"]
    category: Literal["marketing_messages"]
    phoneNumberId: NotRequired[str]


class ContactUpdatePayload(TypedDict):
    identityChange: NotRequired[ContactIdentityChange]
    parentBsuid: NotRequired[str]
    id: str
    phoneNumber: NotRequired[str]
    bsuid: NotRequired[str]
    fullName: NotRequired[str]
    firstName: NotRequired[str]
    pushName: NotRequired[str]
    oldPushName: NotRequired[str]
    businessName: NotRequired[str]
    oldBusinessName: NotRequired[str]
    pictureId: NotRequired[str]
    pictureRemoved: NotRequired[bool]
    username: NotRequired[str]


class ChatArchivePayload(_From):
    archive: NotRequired[bool]
    pinned: NotRequired[bool]


class ChatMutePayload(_From):
    muted: bool
    muteEndTimestamp: NotRequired[float]


class ChatReadPayload(_From):
    read: bool


ChatClearPayload = _From
ChatDeletePayload = _From


class WebhookCallCapabilities(TypedDict):
    video: bool
    invite: bool


Connection = Literal["linked_device", "cloud_api"]


class CallReceivedPayload(_From):
    callId: str
    hasVideo: bool
    sessionConnection: NotRequired[Connection]
    capabilities: NotRequired[WebhookCallCapabilities]


class CallMissedPayload(_From):
    callId: str
    reason: str


class CallAcceptedPayload(_From):
    callId: str
    answeredBy: NotRequired[str]
    exclusive: NotRequired[bool]
    sessionConnection: NotRequired[Connection]
    capabilities: NotRequired[WebhookCallCapabilities]


class CallRejectedPayload(_From):
    callId: str


class CallEndedPayload(_NullableFrom):
    callId: str
    durationSeconds: float
    reason: str
    direction: Literal["inbound", "outbound"]
    hadVideo: bool
    sessionConnection: NotRequired[Connection]


class CallTelemetryPayload(TypedDict):
    callId: str
    setupMs: float
    ringMs: float
    durationSeconds: float
    terminateReason: str
    codec: str
    jitterMs: float
    packetsLost: float
    rttMs: float
    recvKbps: float
    sendKbps: float


class CallParticipant(TypedDict):
    handRaised: NotRequired[bool]
    id: str
    phoneNumber: NotRequired[str]
    bsuid: NotRequired[str]
    username: NotRequired[str]
    audioMuted: Literal[False]
    video: Literal[False]
    state: Literal["invited", "ringing", "connected", "left"]


class CallParticipantPayload(TypedDict):
    callId: str
    participant: CallParticipant


class CallParticipantLeftPayload(TypedDict):
    callId: str
    participantId: str
    reason: NotRequired[str]


class CallConnection(TypedDict):
    id: str
    participant: str
    transport: Literal["webrtc", "socket", "sip"]


class CallConnectionJoinedPayload(TypedDict):
    callId: str
    connection: CallConnection


class CallConnectionLeftPayload(TypedDict):
    callId: str
    connectionId: str
    participant: str
    reason: Literal[
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


class NewsletterUpdatePayload(TypedDict):
    id: str
    action: str
    muted: NotRequired[bool]


class BlocklistChange(TypedDict):
    action: str
    phoneNumber: NotRequired[str]
    bsuid: NotRequired[str]
    id: str
    username: NotRequired[str]


class BlocklistUpdatePayload(TypedDict):
    action: str
    changes: list[BlocklistChange]


class LabelsUpdatePayload(_OptionalFrom):
    action: str
    labelId: NotRequired[str]
    label: NotRequired[str]
    name: NotRequired[str]
    color: NotRequired[float]
    orderIndex: NotRequired[float]
    deleted: NotRequired[bool]
    labeled: NotRequired[bool]
    observedAt: NotRequired[float]
    messageId: NotRequired[str]
    starred: NotRequired[bool]


class CloudHistorySyncPayload(TypedDict):
    kind: Literal["history"]
    value: JsonObject


class HistoryMessage(TypedDict):
    id: str
    whatsapp_ids: WhatsAppMessageIds
    whatsapp_id: NotRequired[str]
    conversation: IdentityReference
    fromMe: NotRequired[bool]


class HistoryData(TypedDict):
    encoding: Literal["gzip-base64-protobuf"]
    data: str


class LinkedHistorySyncPayload(TypedDict):
    whatsapp_ids: WhatsAppMessageIds
    whatsapp_id: NotRequired[str]
    original_whatsapp_ids: NotRequired[WhatsAppMessageIds]
    original_whatsapp_id: NotRequired[str]
    messages: list[HistoryMessage]
    mode: Literal["deliver"]
    syncType: str
    chunkOrder: NotRequired[float]
    progress: NotRequired[float]
    fileLength: float
    conversationCount: float
    messageCount: float
    pushNameCount: float
    statusMessageCount: float
    whatsapp: HistoryData


class DirectHistoryCommon(TypedDict):
    delivery: Literal["descriptor"]
    whatsapp_ids: WhatsAppMessageIds
    whatsapp_id: NotRequired[str]
    original_whatsapp_ids: NotRequired[WhatsAppMessageIds]
    original_whatsapp_id: NotRequired[str]
    syncType: str
    chunkOrder: NotRequired[int]
    progress: NotRequired[int]
    fileLength: int
    oldestMessageAt: NotRequired[str]
    peerDataRequestSessionId: NotRequired[str]


class DirectHistoryMedia(TypedDict):
    type: Literal["md-msg-hist"]
    directPath: str
    mediaKey: str
    fileSha256: str
    fileEncSha256: str
    encHandle: NotRequired[str]


class DirectHistoryInline(TypedDict):
    encoding: Literal["zlib-base64-protobuf"]
    data: str


class DirectHistoryMediaPayload(DirectHistoryCommon):
    media: DirectHistoryMedia
    inline: NotRequired[Never]


class DirectHistoryInlinePayload(DirectHistoryCommon):
    inline: DirectHistoryInline
    media: NotRequired[Never]


DirectHistorySyncPayload = DirectHistoryMediaPayload | DirectHistoryInlinePayload
HistorySyncPayload = LinkedHistorySyncPayload | CloudHistorySyncPayload | DirectHistorySyncPayload


class ContactsSyncPayload(TypedDict):
    kind: Literal["contacts"]
    value: JsonObject


class MessageEchoPayload(TypedDict):
    source: Literal["whatsapp_business_app"]
    value: JsonObject


class CommandResultPayload(TypedDict):
    requestId: str
    command: str
    success: bool
    data: NotRequired[JsonObject]
    error: NotRequired[str]


class BusinessQuickReplyUpdatePayload(TypedDict):
    id: str
    shortcut: str
    message: str
    keywords: list[str]
    count: float
    deleted: bool
    associatedLabelIds: list[str]
    observedAt: float
    fromFullSync: bool


class CustomerEventPayload(TypedDict):
    eventId: str
    occurredAt: str
    organizationId: str
    projectId: str
    customerId: str
    actorKind: Literal["better_auth", "org_key", "project_token", "cli_grant", "system"]


CustomerCreatedPayload = CustomerEventPayload
CustomerArchivedPayload = CustomerEventPayload
CustomerRestoredPayload = CustomerEventPayload


class CustomerUpdatedPayload(CustomerEventPayload):
    fields: list[Literal["name", "phone", "externalCustomerId"]]


class CustomerEnabledPayload(CustomerEventPayload):
    migratedNumberCount: float


class CustomerArchivingPayload(CustomerEventPayload):
    blockingNumberCount: float
    revokedPairingLinkCount: float


class CustomerPairingLinkPayload(CustomerEventPayload):
    pairingLinkId: str


CustomerPairingLinkCreatedPayload = CustomerPairingLinkPayload
CustomerPairingLinkOpenedPayload = CustomerPairingLinkPayload
CustomerPairingLinkExpiredPayload = CustomerPairingLinkPayload


class CustomerPairingLinkConnectedPayload(CustomerPairingLinkPayload):
    sessionId: str


class CustomerPairingLinkFailedPayload(CustomerPairingLinkPayload):
    errorCode: str


class CustomerPairingLinkRevokedPayload(CustomerPairingLinkPayload):
    reason: NotRequired[
        Literal[
            "customer_archived",
            "phone_mismatch_limit",
            "exchange_failure_limit",
            "terminal_failure",
        ]
    ]


class CustomerNumberAttachedPayload(CustomerEventPayload):
    sessionId: str
    pairingLinkId: NotRequired[str]


class CustomerNumberTransferredPayload(CustomerEventPayload):
    sessionId: str
    sourceCustomerId: str


class CustomerNumberDisconnectedPayload(CustomerEventPayload):
    sessionId: str
    reason: str


BanSafeIncidentEventKind = Literal[
    "cap_warning",
    "cap_reached",
    "timelock",
    "temporary_ban",
    "permanent_ban",
    "connect_blocked",
    "customer_report",
]
BanSafeEventRung = Literal["none", "notify", "throttle", "block_cold", "suspend"]


class BanSafeHealthThresholdPayload(TypedDict):
    sessionId: str
    projectId: str
    health: float
    threshold: float
    healthSource: Literal["rules_v1", "ml_model"]
    estimatorVersion: str
    modelVersion: str | None
    evaluatedAt: str
    policyVersion: float
    episodeId: str
    actionId: str


class BanSafeRequiredFinding(TypedDict):
    findingKey: str
    title: str
    severity: Literal["info", "warning", "critical"]


class BanSafeActionPayload(TypedDict):
    phoneNumber: str
    action: Literal["applied", "changed", "lifted", "daily_allowance_reached"]
    scope: Literal["number", "organization"]
    rung: BanSafeEventRung
    previousRung: BanSafeEventRung | None
    reason: Literal[
        "health",
        "finding",
        "org_pattern",
        "repeat",
        "restriction",
        "operator",
        "health_model_cutover",
        "warmup",
    ]
    health: float | None
    healthBand: Literal["good", "fair", "poor", "failing", "unknown"]
    requires: list[BanSafeRequiredFinding]
    throughputPerMinute: float | None
    eligibleLiftAt: str | None
    liftRequires: str
    appealUrl: str
    startedAt: str
    docs: str


class BanSafeIncidentPayload(TypedDict):
    id: str
    phoneNumber: str
    kind: BanSafeIncidentEventKind
    source: Literal["runtime", "customer"]
    startedAt: str
    endsAt: str | None
    belief: float
    resolution: Literal["open", "corroborated", "contradicted", "phone_switch", "final"]
    claimId: str | None
    closedAt: str | None


class BanSafeClaimPayload(TypedDict):
    id: str
    incidentId: str
    phoneNumber: str
    status: Literal["filed", "under_review", "approved", "denied", "paid", "reversed"]
    verdict: Literal[
        "other_device",
        "customer_conduct",
        "shared_network",
        "simultaneous_calls",
        "ours",
        "inconclusive",
    ]
    windowStart: str
    windowEnd: str
    measuredCents: float
    capCents: float
    amountCents: float
    summary: str
    reason: str
    decidedAt: str | None
    paidAt: str | None


class CallPermissionChangedPayload(TypedDict):
    conversation: IdentityReference
    status: Literal["none", "temporary", "permanent", "revoked"]
    previousStatus: Literal["none", "temporary", "permanent", "revoked"]
    expiresAt: str | None
    source: Literal["user_action", "automatic", "sync", "call_refused"]
    changedAt: str


class OrderConversation(TypedDict, total=False):
    bsuid: str
    parentBsuid: str
    id: str
    phoneNumber: str


class OrderPaymentUpdateBase(TypedDict):
    reportedBy: Literal["whatsapp"]
    providerEventId: str
    referenceId: str
    conversation: OrderConversation


class PaymentAmount(TypedDict):
    value: float
    offset: float


class PaymentTransaction(TypedDict, total=False):
    id: str
    providerTransactionId: str
    provider: str
    status: str
    method: str
    errorCode: str


class PaymentStatusPayload(OrderPaymentUpdateBase):
    kind: Literal["payment_status"]
    status: str
    amount: NotRequired[PaymentAmount]
    currency: NotRequired[str]
    transaction: NotRequired[PaymentTransaction]


class PaymentMethodSelectedPayload(OrderPaymentUpdateBase):
    kind: Literal["payment_method_selected"]
    messageId: str
    paymentMethod: str
    lastFourDigits: NotRequired[str]
    credentialId: NotRequired[str]
    paymentTimestamp: NotRequired[float]


OrderPaymentUpdatedPayload = PaymentStatusPayload | PaymentMethodSelectedPayload


class MessageFailedPayload(TypedDict):
    to: IdentityReference
    type: str
    error: Literal[
        "invalid_recipient",
        "session_not_connected",
        "ack_timeout",
        "send_failed",
        "blocked_by_safety",
    ]
    code: NotRequired[str]
    retryAfter: NotRequired[float]
    timestamp: float


class RuntimeTemplateStatusPayload(TypedDict):
    templateName: str
    templateId: str
    status: str
    category: str
    reason: str
    qualityRating: str


class CloudTemplateStatusPayload(TypedDict):
    kind: Literal["message_template_status_update", "message_template_quality_update"]
    event: NotRequired[str]
    templateId: NotRequired[str]
    templateName: NotRequired[str]
    language: NotRequired[str]
    reason: NotRequired[str]
    previousQualityScore: NotRequired[str]
    newQualityScore: NotRequired[str]
    wabaId: NotRequired[str]


TemplateStatusPayload = RuntimeTemplateStatusPayload | CloudTemplateStatusPayload


class CampaignLaunchedPayload(TypedDict):
    campaignId: str
    name: str
    recipientCount: float
    scheduled: bool
    launchedAt: float


class CampaignPausedPayload(TypedDict):
    campaignId: str
    sentCount: float
    remainingCount: float
    pausedAt: float  # Unix seconds.
    reason: NotRequired[str]  # Automatic pauses only; open string.
    code: NotRequired[str]  # Automatic pauses only; open string.


class CampaignRescheduledPayload(TypedDict):
    campaignId: str
    previousScheduledAt: float | None
    scheduledAt: float
    rescheduledAt: float


class CampaignResumedPayload(TypedDict):
    campaignId: str
    sentCount: float
    remainingCount: float
    resumedAt: float


class CampaignCompletedPayload(TypedDict):
    campaignId: str
    sentCount: float
    deliveredCount: float
    readCount: float
    failedCount: float
    skippedCount: float
    responseCount: float
    completedAt: float
    durationMs: float


class CampaignFailedPayload(TypedDict):
    campaignId: str
    reason: str
    failedAt: float


class CampaignStoppedPayload(TypedDict):
    campaignId: str
    sentCount: float
    abandonedCount: float
    stoppedAt: float


class CampaignRecipientSentPayload(TypedDict):
    campaignId: str
    recipientId: str
    phone: str
    sessionKey: str
    externalMessageId: str
    variantKey: str
    attempt: float


class CampaignRecipientFailedPayload(TypedDict):
    campaignId: str
    recipientId: str
    phone: str
    attempts: float
    error: str
    failedAt: float


class CampaignRecipientSkippedPayload(TypedDict):
    campaignId: str
    recipientId: str
    phone: str
    reason: str
    skippedAt: float  # Unix milliseconds.
    messageIndex: NotRequired[int]  # Nonnegative sequence position, including zero.
    followUpId: NotRequired[str]  # UUID of a capped follow-up.


class CampaignThrottledPayload(TypedDict):
    campaignId: str
    sessionKey: str
    reason: str
    deferredCount: float
    at: float


class CampaignCapReachedPayload(TypedDict):
    campaignId: str
    sessionKey: str
    phone: str
    capType: str
    capLimit: float
    windowResetsAt: float
    at: float


class CampaignColdBlockedPayload(TypedDict):
    campaignId: str
    recipientId: str
    phone: str
    surface: str
    reason: str
    at: float


class VoiceAssetEventPayload(TypedDict):
    eventId: str
    occurredAt: str
    organizationId: str
    projectId: str
    assetId: str
    name: str
    source: str


class VoiceAssetReadyPayload(VoiceAssetEventPayload):
    durationMs: float
    contentSha256: str
    originalFormat: str


class VoiceAssetFailedPayload(VoiceAssetEventPayload):
    failureReason: str


class SessionCapabilitiesUpdatedPayload(SessionCapabilities):
    changedKeys: list[str]


class UsageRateCard(TypedDict):
    id: str
    version: float


class UsageRecordedPayload(TypedDict):
    id: str
    meter: Literal[
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
    quantity: float
    unit: Literal[
        "second", "pulse", "call", "character", "token", "provider_unit", "channel", "byte_day"
    ]
    dimensions: dict[str, str | float | bool]
    keySource: Literal["none", "managed", "customer"]
    sourceKind: Literal["call", "attempt", "flow_run", "conversation", "asset", "team"]
    sourceId: str
    projectId: str | None
    session: str | None
    occurredAt: str
    recordedAt: str
    revision: float
    pricingState: Literal["unpriced", "priced", "waived", "settled"]
    rateCard: UsageRateCard | None
    pricedCredits: float | None


EventName_co = TypeVar("EventName_co", bound=str, covariant=True)
Payload_co = TypeVar("Payload_co", covariant=True)


@dataclass(frozen=True)
class TypedWebhookEvent(Generic[EventName_co, Payload_co]):
    id: str
    session: str
    timestamp: str
    event: EventName_co
    payload: Payload_co = field(repr=False)
    raw: JsonObject = field(repr=False)
    known: bool

    @property
    def external_id(self) -> str | None:
        external = self.raw.get("externalId")
        return external if isinstance(external, str) else None


MessageReceivedEvent = TypedWebhookEvent[Literal["message.received"], MessageReceivedPayload]
UnknownWebhookEvent = TypedWebhookEvent[str, Json]
