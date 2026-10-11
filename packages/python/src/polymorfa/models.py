"""Handwritten wire models. Unknown server fields remain in response dictionaries."""

from __future__ import annotations

from typing import Generic, Literal, TypeVar

from typing_extensions import NotRequired, TypedDict

from .configuration import ConfigurationPatch, ConfigurationView
from .transport import JsonObject

T = TypeVar("T")


class Envelope(TypedDict, Generic[T]):
    success: bool
    data: T


class Success(TypedDict, total=False):
    success: bool
    message: str
    operationId: str


class Conversation(TypedDict, total=False):
    id: str
    phoneNumber: str
    username: str
    bsuid: str


class SendMessage(TypedDict):
    conversation: Conversation
    content: JsonObject


class SendMessageOptions(SendMessage, total=False):
    transport: Literal["auto", "linked_devices", "official_api"]
    replyTo: str


class LinkedDeviceIds(TypedDict):
    linked_devices: str
    official_api: NotRequired[str]


class OfficialApiIds(TypedDict):
    official_api: str
    linked_devices: NotRequired[str]


WhatsAppMessageIds = LinkedDeviceIds | OfficialApiIds
RoutingReason = Literal[
    "explicit_transport",
    "template",
    "target_reference",
    "only_eligible_transport",
    "session_rule",
    "project_rule",
    "team_rule",
    "default_linked_devices",
]


class StatusResult(TypedDict):
    status: str


class StarResult(TypedDict):
    status: Literal["OK"]


class MessageReceipt(TypedDict):
    id: str
    whatsapp_ids: WhatsAppMessageIds
    whatsapp_id: NotRequired[str]
    transport: NotRequired[Literal["linked_devices", "official_api"]]
    routingReason: NotRequired[RoutingReason]
    operationId: NotRequired[str]
    conversation: Conversation
    timestamp: str
    status: str


class MessageResponse(MessageReceipt, total=False):
    type: str
    content: JsonObject
    mediaId: str


class Seen(TypedDict):
    conversation: Conversation
    id: str


class Reaction(Seen):
    reaction: str
    transport: NotRequired[Literal["auto", "linked_devices", "official_api"]]


class Star(Seen):
    star: bool


class Typing(TypedDict):
    conversation: Conversation
    id: NotRequired[str]
    state: Literal["typing", "recording", "paused"]


class OperationReceipt(TypedDict):
    whatsapp_ids: WhatsAppMessageIds
    timestamp: str


class MessageOperation(TypedDict):
    operationId: str
    status: Literal["pending", "unknown", "completed", "rejected"]
    transport: NotRequired[Literal["linked_devices", "official_api"]]
    rejectionCode: NotRequired[Literal["hybrid_authority_unavailable"]]
    receipt: NotRequired[OperationReceipt]


class Session(TypedDict):
    sessionId: str
    name: str
    tenantId: str
    type: Literal["linked_device", "cloud_api"]
    testMode: bool
    status: str
    createdAt: str
    updatedAt: str
    externalId: NotRequired[str]
    statusReason: NotRequired[str]
    configuration: NotRequired[ConfigurationView]
    newChatCapping: NotRequired[NewChatCapping | None]


class SessionUpdate(TypedDict):
    configuration: ConfigurationPatch
    revision: int


class QuickLinkInput(TypedDict, total=False):
    purpose: Literal["initial", "add_connection"]
    session: str
    projectId: str
    customerId: str
    externalId: str
    connectionGoal: Literal["single", "hybrid"]
    addConnection: Literal["linked_devices", "official_api"]
    billingControls: JsonObject
    configuration: JsonObject


class QuickLink(TypedDict):
    id: str
    url: str
    session: str
    purpose: str
    connectionGoal: str
    expiresAt: str | None


class QuickLinkStatus(TypedDict, total=False):
    id: str
    status: Literal["pending", "opened", "linked", "connected", "failed", "cancelled"]
    session: str
    purpose: str
    connectionGoal: str
    hybridPhase: str | None
    expiresAt: str | None
    openedAt: str | None
    connectedAt: str | None
    phone: str | None
    errorCode: str | None
    onboarding: JsonObject | None


class PairCode(TypedDict):
    phone: str


class PairCodeResult(TypedDict):
    code: str


class QrCode(TypedDict, total=False):
    qr: str
    event: str


class WebhookInput(TypedDict):
    url: str


class WebhookCreate(WebhookInput, total=False):
    session: str
    events: list[str]
    hmacKey: str
    retries: JsonObject
    headers: list[dict[str, str]]
    format: Literal["native", "meta"]


class WebhookUpdate(TypedDict, total=False):
    url: str
    events: list[str]
    hmacKey: str
    enabled: bool
    retries: JsonObject
    headers: list[dict[str, str]]
    format: Literal["native", "meta"]


class Webhook(TypedDict):
    id: str
    tenantId: str
    url: str
    events: list[str]
    retries: JsonObject
    headers: list[dict[str, str]]
    enabled: bool
    createdAt: str


class ProjectCreate(TypedDict):
    name: str


class ProjectCreateOptions(ProjectCreate, total=False):
    icon: JsonObject
    defaultTier: Literal["standard", "pro", "scale"]


class Project(TypedDict):
    id: str
    orgId: str
    name: str
    slug: str
    icon: JsonObject
    defaultTier: str
    isActive: bool
    stage: Literal["development", "production"]


class Contact(TypedDict):
    id: str
    name: str
    pushName: str
    phoneNumber: NotRequired[str]
    username: NotRequired[str]
    bsuid: NotRequired[str]
    businessName: NotRequired[str]
    profileUrl: NotRequired[str]


class ContactCheck(TypedDict):
    exists: bool
    id: NotRequired[str]
    phoneNumber: NotRequired[str]
    username: NotRequired[str]
    bsuid: NotRequired[str]


class ContactBlocklist(TypedDict):
    hash: str
    contacts: list[Conversation]


class ContactPicture(TypedDict):
    url: str


class ContactDevice(Conversation):
    device: int


class ContactInfo(TypedDict):
    id: str
    status: str
    pictureId: str
    verifiedName: str
    devices: list[ContactDevice]
    phoneNumber: NotRequired[str]
    username: NotRequired[str]
    bsuid: NotRequired[str]


class BusinessCategory(TypedDict):
    id: str
    name: str


class BusinessHours(TypedDict):
    dayOfWeek: str
    mode: str
    openTime: str
    closeTime: str


class BusinessProfile(TypedDict):
    id: str
    address: str
    email: str
    description: str
    websites: list[str]
    coverPhotoId: str
    categories: list[BusinessCategory]
    options: dict[str, str]
    hoursTimeZone: str
    hours: list[BusinessHours]
    phoneNumber: NotRequired[str]
    username: NotRequired[str]
    bsuid: NotRequired[str]


class Profile(TypedDict):
    name: str
    status: str
    profilePicUrl: NotRequired[str]
    phonePlatform: NotRequired[Literal["android", "ios", "meta_cloud", "unknown"]]
    accountType: NotRequired[
        Literal["whatsapp_app", "business_app", "meta_cloud", "meta_coexistence"]
    ]


class ConversationIdentity(TypedDict):
    id: str
    phoneNumber: NotRequired[str]
    bsuid: NotRequired[str]
    username: NotRequired[str]


class HistoryConversation(ConversationIdentity):
    sender: NotRequired[ConversationIdentity]


class HistoryMessageSummary(TypedDict):
    id: str
    whatsapp_ids: WhatsAppMessageIds
    whatsapp_id: NotRequired[str]
    direction: Literal["inbound", "outbound"]
    type: str
    timestamp: str


class HistoryMedia(TypedDict):
    id: str
    mimeType: str
    fileLength: int
    url: str


class HistoryMediaRetrieval(TypedDict):
    state: Literal[
        "pending",
        "stored",
        "unavailable",
        "expired",
        "too_large",
        "unsupported_type",
        "failed",
        "cancelled",
    ]
    reason: NotRequired[str]


class HistoryPollOption(TypedDict):
    name: str
    hash: str


class HistoryMessage(HistoryMessageSummary):
    conversation: HistoryConversation
    fromMe: bool
    pushName: NotRequired[str]
    text: NotRequired[str]
    caption: NotRequired[str]
    mimeType: NotRequired[str]
    filename: NotRequired[str]
    ptt: NotRequired[bool]
    latitude: NotRequired[float]
    longitude: NotRequired[float]
    displayName: NotRequired[str]
    title: NotRequired[str]
    reaction: NotRequired[str]
    reactionTo: NotRequired[str]
    edited: NotRequired[bool]
    unavailable: NotRequired[bool]
    unavailableReason: NotRequired[str]
    pollOptions: NotRequired[list[HistoryPollOption]]
    media: NotRequired[list[HistoryMedia]]
    mediaRetrieval: NotRequired[HistoryMediaRetrieval]


class EditMessage(TypedDict):
    text: str
    transport: NotRequired[Literal["auto", "linked_devices", "official_api"]]


class CustomerServiceWindow(TypedDict):
    state: Literal["open", "closed", "unknown"]
    reason: (
        Literal["not_tracked", "tracking_started", "notifications_interrupted", "identity_unlinked"]
        | None
    )
    openedAt: str | None
    expiresAt: str | None
    checkedAt: str


class HistoryChat(TypedDict):
    conversation: ConversationIdentity
    kind: Literal["direct", "group", "channel", "broadcast"]
    lastActivityAt: str
    lastMessage: HistoryMessageSummary


class HistoryPage(TypedDict, Generic[T]):
    success: bool
    data: list[T]
    hasMore: bool
    nextCursor: str | None
    previousCursor: str | None


class HistoryChatsParams(TypedDict, total=False):
    limit: int
    cursor: str
    kind: Literal["direct", "group", "channel", "broadcast"]
    activeSince: str
    activeBefore: str


class HistoryMessagesParams(TypedDict, total=False):
    limit: int
    cursor: str
    order: Literal["desc", "asc"]
    since: str
    until: str
    direction: Literal["inbound", "outbound"]
    types: str


class CallPlacement(TypedDict, total=False):
    session: str
    to: str
    participants: list[str]
    groupId: str
    video: bool
    exclusive: bool
    participant: str


class CallAcceptance(TypedDict, total=False):
    video: bool
    exclusive: bool
    participant: str


class CallPlacementResult(TypedDict):
    callId: str
    session: str
    video: bool


class CallAcceptanceResult(TypedDict):
    answered: bool
    answeredBy: str
    exclusive: bool


class UpdateCallSettings(TypedDict, total=False):
    callsEnabled: bool
    conferenceMode: bool
    inboundRoute: Literal["clients", "sip_trunk"]
    sipTrunkId: str | None
    sipClaim: bool
    hostCloudApiCalls: bool
    expectedRevision: int


class Event(TypedDict, total=False):
    id: str
    type: str
    occurredAt: str
    projectId: str
    sessionId: str | None
    payload: JsonObject | None


class Operation(TypedDict, total=False):
    id: str
    kind: str
    resourceType: str
    resourceId: str
    projectId: str | None
    status: str
    progressCode: str | None
    failureCode: str | None
    createdAt: str
    updatedAt: str
    completedAt: str | None


class GroupParticipant(TypedDict):
    id: str
    isAdmin: bool
    isSuperAdmin: bool
    phoneNumber: NotRequired[str]
    username: NotRequired[str]
    bsuid: NotRequired[str]


class Group(TypedDict):
    id: str
    name: str
    description: str
    createdAt: int
    participants: list[GroupParticipant]
    ownerId: str


class GroupInviteInfo(TypedDict):
    id: str
    subject: str
    createdAt: int
    size: int
    participants: list[GroupParticipant]
    creatorId: str


class GroupCapability(TypedDict):
    key: Literal["polls.endTime", "polls.hideVoters", "polls.creatorEdit"]
    kind: Literal["feature"]
    unit: None
    value: bool | None
    source: Literal["server", "client_default"] | None


class GroupCapabilities(TypedDict):
    status: Literal["synced", "unknown"]
    syncedAt: str | None
    checkedAt: str | None
    capabilities: list[GroupCapability]


class GroupCreate(TypedDict):
    name: str
    participants: list[str]


class GroupParticipants(TypedDict):
    participants: list[str]


class StringValue(TypedDict):
    value: str


class InviteCode(TypedDict):
    code: str


class PictureSource(TypedDict, total=False):
    url: str
    base64: str


class AdminOnly(TypedDict):
    adminsOnly: bool


class MemberAddMode(TypedDict):
    mode: Literal["admin_add", "all_member_add"]


class JoinApproval(TypedDict):
    required: bool


StandardAudience = Literal["all", "contacts", "contact_blacklist", "none"]


class PrivacySettings(TypedDict):
    groupAdd: StandardAudience
    lastSeen: StandardAudience
    status: StandardAudience
    profile: StandardAudience
    readReceipts: Literal["all", "none"]
    online: Literal["all", "match_last_seen"]
    callAdd: Literal["all", "known"]
    messages: Literal["all", "contacts"]
    defense: Literal["on_standard", "off"]
    stickers: Literal["contacts", "contact_allowlist", "none"]


class IdentityResult(Conversation, total=False):
    keyRequired: bool


class ResolveIdentity(TypedDict, total=False):
    phoneNumber: str
    id: str
    username: str
    usernameKey: str


class Label(TypedDict):
    id: str
    name: str
    color: int
    orderIndex: NotRequired[int]
    chatCount: NotRequired[int]
    observedAt: NotRequired[str]


class LabelCollection(TypedDict):
    policy: Literal["off", "events", "cache", "project"]
    status: Literal["disabled", "unknown", "partial", "fresh"]
    labels: list[Label]
    unknownReason: NotRequired[
        Literal["observation_disabled", "not_retained", "not_observed", "expired"]
    ]
    observedAt: NotRequired[str]
    expiresAt: NotRequired[str]


class LabelCreate(TypedDict):
    name: str
    color: NotRequired[int]


class LabelUpdate(TypedDict, total=False):
    name: str
    color: int


class PresenceData(TypedDict):
    authoritative: Literal[False]
    desired: NotRequired[Literal["available", "unavailable"]]
    desiredAt: NotRequired[str]
    lastSent: NotRequired[Literal["available", "unavailable"]]
    lastSentAt: NotRequired[str]


class PresenceChatState(TypedDict):
    sender: str
    state: Literal["composing", "paused"]
    media: NotRequired[str]
    observedAt: str
    stale: bool


class ChatPresenceData(TypedDict):
    policy: Literal["off", "events", "cache"]
    status: Literal["unknown", "fresh", "stale"]
    unknownReason: NotRequired[Literal["disabled", "not_observed", "suspended"]]
    available: NotRequired[bool]
    lastSeen: NotRequired[str]
    observedAt: NotRequired[str]
    subscriptionExpiresAt: NotRequired[str]
    stale: bool
    typingPolicy: Literal["off", "events", "cache"]
    typingStatus: Literal["unknown", "fresh", "stale"]
    typingUnknownReason: NotRequired[Literal["disabled", "not_observed", "suspended"]]
    chatState: NotRequired[PresenceChatState]


class PresenceSetResult(TypedDict):
    status: Literal["OK"]


class PresenceSubscription(TypedDict):
    status: Literal["SUBSCRIBED"]
    expiresAt: str


class AsyncAccepted(TypedDict):
    requestId: str


class NewChatCapping(TypedDict):
    enabled: bool | None
    pacing: bool
    status: Literal["none", "first_warning", "second_warning", "capped"] | None
    capped: bool
    limit: int | None
    used: int | None
    remaining: int | None
    cycleStartsAt: str | None
    resetsAt: str | None
    observedAt: str


class PlatformSession(TypedDict):
    _id: str
    _creationTime: int
    projectId: str
    sessionId: str
    name: str
    phone: str | None
    platform: str | None
    isBusiness: bool
    testMode: bool
    tierOverride: Literal["free", "standard", "pro", "scale"] | None
    status: str
    messageCount: int
    lastActiveAt: int | None
    paidUntil: int | None


class SessionStarting(TypedDict):
    starting: Literal[True]
    sessionId: str


class SessionStopping(TypedDict):
    stopping: Literal[True]
    sessionId: str


class SessionRemoved(TypedDict):
    removed: Literal[True]
    sessionId: str


class SessionAccount(Conversation):
    pushName: str
    businessName: NotRequired[str]
    phonePlatform: NotRequired[Literal["android", "ios", "meta_cloud", "unknown"]]
    accountType: NotRequired[
        Literal["whatsapp_app", "business_app", "meta_cloud", "meta_coexistence"]
    ]
    profilePicUrl: NotRequired[str]


class OperationAccepted(TypedDict):
    success: Literal[True]
    message: str
    operationId: str


class DataEnvelope(TypedDict, Generic[T]):
    data: T
