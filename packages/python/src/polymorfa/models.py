"""Handwritten wire models. Unknown server fields remain in response dictionaries."""

from __future__ import annotations

from typing import Generic, Literal, TypedDict, TypeVar

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


class Contact(TypedDict, total=False):
    id: str
    phoneNumber: str
    username: str
    bsuid: str
    name: str
    pushName: str
    shortName: str
    isBusiness: bool
    isMyContact: bool


class Profile(TypedDict, total=False):
    name: str
    status: str
    picture: str | None


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
