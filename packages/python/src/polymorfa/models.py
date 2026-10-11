"""Handwritten wire models. Unknown server fields remain in response dictionaries."""

from __future__ import annotations

from typing import Generic, Literal, TypedDict, TypeVar

from typing_extensions import NotRequired

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


class MessageReceipt(TypedDict):
    id: str
    whatsapp_ids: dict[str, str]
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


class Star(Seen):
    star: bool


class Typing(TypedDict):
    conversation: Conversation
    state: Literal["typing", "recording", "paused"]


class MessageOperation(TypedDict, total=False):
    operationId: str
    status: Literal["pending", "unknown", "completed", "rejected"]
    transport: str
    rejectionCode: str
    receipt: MessageReceipt


class Session(TypedDict):
    sessionId: str
    name: str
    tenantId: str
    type: Literal["linked_device", "cloud_api"]
    testMode: bool
    status: str
    createdAt: str
    updatedAt: str


class SessionUpdate(TypedDict):
    configuration: JsonObject
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


class HistoryMessage(TypedDict, total=False):
    id: str
    whatsapp_ids: dict[str, str]
    direction: Literal["inbound", "outbound"]
    type: str
    timestamp: str
    conversation: Conversation
    fromMe: bool
    text: str
    media: list[JsonObject]
    mediaRetrieval: JsonObject


class HistoryChat(TypedDict):
    conversation: Conversation
    kind: Literal["direct", "group", "channel", "broadcast"]
    lastActivityAt: str
    lastMessage: HistoryMessage


class HistoryPage(TypedDict, Generic[T]):
    success: bool
    data: list[T]
    hasMore: bool
    nextCursor: str | None
    previousCursor: str | None


class HistoryChatsParams(TypedDict, total=False):
    limit: int
    cursor: str
    kind: str
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


class CallAcceptanceResult(TypedDict):
    answered: bool
    answeredBy: str
    exclusive: bool


class CallParticipant(TypedDict, total=False):
    id: str
    state: str
    video: bool


class CallSettings(TypedDict, total=False):
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
