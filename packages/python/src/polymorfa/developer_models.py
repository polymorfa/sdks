"""Handwritten retained events, webhooks, delivery evidence and operations."""

from typing import Literal

from typing_extensions import NotRequired, TypedDict

from .transport import Json, JsonObject

PayloadAvailability = Literal["available", "not_retained", "expired", "redacted", "unavailable"]


class EncodedPayload(TypedDict):
    encoding: Literal["base64"]
    contentType: Literal["application/json"]
    data: str


class EventBase(TypedDict):
    id: str
    organizationId: str
    type: str
    source: Literal["runtime", "platform", "test"]
    environment: Literal["development", "production"]
    createdAt: str
    payloadAvailability: PayloadAvailability
    payload: EncodedPayload | None
    replayableUntil: str | None
    metadataExpiresAt: str


class OrganizationEvent(EventBase):
    projectId: None


class ProjectEvent(EventBase):
    projectId: str


Event = OrganizationEvent | ProjectEvent


class ListEvents(TypedDict, total=False):
    type: str
    since: str
    until: str
    limit: int
    cursor: str
    afterOffset: str


class IndexedEvents(TypedDict):
    afterOffset: str
    type: NotRequired[str]
    limit: NotRequired[int]


class RetrieveEvent(TypedDict, total=False):
    includePayload: bool


class ReplayEvent(TypedDict):
    webhookId: str


class IdempotencyReceipt(TypedDict):
    id: str
    key: str
    replayed: bool
    createdAt: str
    expiresAt: str


class ReplayReceipt(TypedDict):
    eventId: str
    deliveryId: str
    operationId: str
    idempotency: IdempotencyReceipt


class RetryPolicy(TypedDict):
    maximumAttempts: int
    backoff: Literal["constant", "linear", "exponential"]
    initialDelaySeconds: int


class HeaderInput(TypedDict):
    name: str
    value: str


class HeaderMetadata(TypedDict):
    name: str


class SigningSecretMetadata(TypedDict):
    version: int
    createdAt: str
    previousValidUntil: str | None


class WebhookBase(TypedDict):
    id: str
    organizationId: str
    url: str
    eventTypes: list[str]
    enabled: bool
    format: Literal["native", "meta"]
    retryPolicy: RetryPolicy
    headers: list[HeaderMetadata]
    secret: SigningSecretMetadata
    createdAt: str
    updatedAt: str


class OrganizationWebhook(WebhookBase):
    owner: Literal["organization"]
    projectId: None


class ProjectWebhook(WebhookBase):
    owner: Literal["project"]
    projectId: str


Webhook = OrganizationWebhook | ProjectWebhook


class CreateWebhook(TypedDict):
    url: str
    eventTypes: list[str]
    enabled: NotRequired[bool]
    format: NotRequired[Literal["native", "meta"]]
    retryPolicy: NotRequired[RetryPolicy]
    headers: NotRequired[list[HeaderInput]]


class UpdateWebhook(TypedDict, total=False):
    url: str
    eventTypes: list[str]
    enabled: bool
    format: Literal["native", "meta"]
    retryPolicy: RetryPolicy
    headers: list[HeaderInput]


class ListWebhooks(TypedDict, total=False):
    eventType: str
    enabled: bool
    limit: int
    cursor: str


class RotateSecret(TypedDict, total=False):
    overlapSeconds: int


class EmptyInput(TypedDict):
    pass


class TestWebhook(TypedDict, total=False):
    eventType: str


class TestWebhookPayload(TypedDict):
    eventType: NotRequired[str]
    body: EncodedPayload
    sessionId: str


class WebhookCreated(TypedDict):
    webhook: Webhook
    operationId: None
    idempotency: IdempotencyReceipt
    secret: str | None
    secretAvailable: bool


class WebhookUpdated(TypedDict):
    webhook: Webhook
    operationId: None
    idempotency: IdempotencyReceipt


class WebhookDeleted(TypedDict):
    webhookId: str
    deleted: Literal[True]
    operationId: None
    idempotency: IdempotencyReceipt


class SecretRotated(TypedDict):
    webhookId: str
    operationId: None
    secret: str | None
    secretAvailable: bool
    secretMetadata: SigningSecretMetadata
    idempotency: IdempotencyReceipt


DeliveryStatus = Literal["pending", "delivering", "retrying", "succeeded", "failed"]


class RetryCapability(TypedDict):
    retryable: bool


class DeliveryOutcome(TypedDict):
    statusCode: int | None
    errorCode: str | None


class DeliveryBase(TypedDict):
    id: str
    organizationId: str
    eventId: str
    webhookId: str
    status: DeliveryStatus
    attemptCount: int
    capabilities: RetryCapability
    payloadAvailability: PayloadAvailability
    replayableUntil: str | None
    metadataExpiresAt: str
    nextAttemptAt: str | None
    lastAttemptAt: str | None
    completedAt: str | None
    createdAt: str
    updatedAt: str
    lastOutcome: DeliveryOutcome | None


class OrganizationDelivery(DeliveryBase):
    projectId: None


class ProjectDelivery(DeliveryBase):
    projectId: str


Delivery = OrganizationDelivery | ProjectDelivery


class ListDeliveries(TypedDict, total=False):
    webhookId: str
    eventId: str
    status: DeliveryStatus
    since: str
    until: str
    limit: int
    cursor: str


class ListAttempts(TypedDict, total=False):
    limit: int
    cursor: str


class AttemptResponse(TypedDict):
    contentType: str
    excerpt: str
    truncated: bool


class AttemptBase(TypedDict):
    id: str
    organizationId: str
    deliveryId: str
    number: int
    status: Literal["pending", "delivering", "succeeded", "failed"]
    startedAt: str | None
    completedAt: str | None
    nextRetryAt: str | None
    durationMs: int | None
    statusCode: int | None
    errorCode: str | None
    response: AttemptResponse | None
    metadataExpiresAt: str


class OrganizationAttempt(AttemptBase):
    projectId: None


class ProjectAttempt(AttemptBase):
    projectId: str


Attempt = OrganizationAttempt | ProjectAttempt


class RetriedDelivery(TypedDict):
    deliveryId: str
    attemptId: str
    operationId: str
    idempotency: IdempotencyReceipt


OperationStatus = Literal[
    "pending", "running", "action_required", "cancelling", "succeeded", "failed", "cancelled"
]
OperationKind = Literal[
    "auth_projection_repair",
    "session_lifecycle",
    "auth_session_purge",
    "label_projection_purge",
    "billing_reconciliation",
    "auto_top_up",
    "campaign",
    "production_enrollment",
    "retention_sweep",
    "webhook_redrive",
]


class OperationProgress(TypedDict):
    code: str
    current: int | None
    total: int | None


class OperationError(TypedDict):
    code: str
    retryable: bool
    details: JsonObject | None


class OperationAction(TypedDict):
    code: str
    details: JsonObject | None


class OperationResource(TypedDict):
    type: str
    id: str


class OperationCapabilities(TypedDict):
    cancellable: bool
    watchable: bool


class OperationBase(TypedDict):
    id: str
    organizationId: str
    kind: OperationKind
    resource: OperationResource
    status: OperationStatus
    sequence: int
    capabilities: OperationCapabilities
    progress: OperationProgress | None
    result: Json
    error: OperationError | None
    actionRequired: OperationAction | None
    createdAt: str
    updatedAt: str
    completedAt: str | None


class OrganizationOperation(OperationBase):
    projectId: None


class ProjectOperation(OperationBase):
    projectId: str


Operation = OrganizationOperation | ProjectOperation


class ListOperations(TypedDict, total=False):
    status: OperationStatus
    kind: OperationKind
    resourceType: str
    resourceId: str
    since: str
    until: str
    limit: int
    cursor: str
    projectId: str


class RetrieveOperation(TypedDict, total=False):
    afterSequence: int
    projectId: str


class TransitionsAfter(TypedDict, total=False):
    afterSequence: int
    limit: int


class TransitionsCursor(TypedDict):
    cursor: str
    limit: NotRequired[int]


class OperationSnapshot(TypedDict):
    progress: OperationProgress | None
    error: OperationError | None
    actionRequired: OperationAction | None


class OperationTransition(TypedDict):
    operationId: str
    sequence: int
    fromStatus: OperationStatus | None
    toStatus: OperationStatus
    reasonCode: str | None
    occurredAt: str
    snapshot: OperationSnapshot


class CancelledOperation(TypedDict):
    operation: Operation
    operationId: str
    idempotency: IdempotencyReceipt


class StreamAcknowledged(TypedDict):
    streamId: str
    acknowledgedCursor: str
    sequence: int
    replayed: bool
