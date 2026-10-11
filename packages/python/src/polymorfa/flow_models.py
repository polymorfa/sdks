"""Project Flow drafts, provider receipts, endpoints and encryption custody."""

from typing import Literal

from typing_extensions import NotRequired, TypedDict

from .transport import JsonObject

Category = Literal[
    "SIGN_UP",
    "SIGN_IN",
    "APPOINTMENT_BOOKING",
    "LEAD_GENERATION",
    "CONTACT_US",
    "CUSTOMER_SUPPORT",
    "SURVEY",
    "OTHER",
]
DraftStatus = Literal["draft", "ready", "archived"]


class ValidationPosition(TypedDict, total=False):
    lineStart: int
    lineEnd: int
    columnStart: int
    columnEnd: int


class ValidationPointer(ValidationPosition, total=False):
    path: str


class ValidationIssue(ValidationPosition, total=False):
    error: str
    errorType: str
    message: str
    pointers: list[ValidationPointer]


class NumberLink(TypedDict):
    session: str
    sessionId: NotRequired[str]
    wabaId: str
    metaFlowId: str
    status: str
    categories: list[str]
    validationErrors: list[ValidationIssue]
    uploadState: Literal["stale", "creating", "uploading", "valid", "invalid", "failed"]
    previewUrl: NotRequired[str]
    previewExpiresAt: NotRequired[int]
    lastSyncedAt: int
    definitionDigest: NotRequired[str]
    simulated: NotRequired[bool]


class Summary(TypedDict):
    id: str
    name: str
    status: DraftStatus
    version: str
    screenCount: int
    metaLinks: list[NumberLink]
    createdAt: int
    updatedAt: int


class Draft(Summary):
    definition: JsonObject


class CreateFlow(TypedDict):
    name: str
    definition: JsonObject
    draftId: NotRequired[str]


class UpdateFlow(TypedDict):
    expectedUpdatedAt: float
    name: NotRequired[str]
    status: NotRequired[DraftStatus]
    definition: NotRequired[JsonObject]


class ProviderInput(TypedDict):
    sessionId: str
    categories: NotRequired[list[Category]]
    requestId: NotRequired[str]


class ProviderOperation(TypedDict):
    id: str
    requestId: str | None
    flowId: str
    flowName: str
    sessionId: str
    session: str
    action: Literal["create", "upload", "publish", "deprecate", "delete"]
    state: Literal["pending", "succeeded", "rejected", "uncertain", "superseded"]
    resolution: Literal["response", "reconciled", "superseded"] | None
    wabaId: str | None
    metaFlowId: str | None
    definitionDigest: str | None
    providerStatus: str | None
    errorCode: str | None
    providerCode: int | None
    providerSubcode: int | None
    createdAt: int
    updatedAt: int
    completedAt: int | None


class ProviderResult(TypedDict):
    operation: ProviderOperation | None
    flow: Draft


class Endpoint(TypedDict):
    id: str
    orgId: str
    projectId: str
    flowId: str
    sessionId: str
    mode: Literal["forward", "function", "direct"]
    url: str | None
    functionId: str | None
    deploymentId: str | None
    enabled: bool
    revision: int
    endpointUri: str
    createdAt: int
    updatedAt: int


class EncryptionKey(TypedDict):
    id: str
    state: Literal["pending", "uncertain", "active", "retiring", "retired", "failed"]
    fingerprint: str
    publicKey: str
    errorCode: str | None
    createdAt: int
    activatedAt: int | None
    retireAfter: int | None


class Custody(TypedDict):
    custody: Literal["managed", "customer"]
    activeKeyId: str | None
    keys: list[EncryptionKey]


class Rotation(Custody):
    key: EncryptionKey


class EndpointState(TypedDict):
    endpoint: Endpoint | None
    encryption: Custody


class EndpointSet(TypedDict):
    endpoint: Endpoint
    signingSecret: NotRequired[str]
    encryption: Custody


class NumberInput(TypedDict):
    sessionId: str


class EndpointCommon(NumberInput):
    enabled: NotRequired[bool]
    expectedRevision: NotRequired[int]


class ForwardEndpoint(EndpointCommon):
    mode: Literal["forward"]
    url: str
    rotateSigningSecret: NotRequired[bool]


class FunctionEndpoint(EndpointCommon):
    mode: Literal["function"]
    functionId: str
    deploymentId: NotRequired[str | None]


class DirectEndpoint(EndpointCommon):
    mode: Literal["direct"]
    url: str


SetEndpoint = ForwardEndpoint | FunctionEndpoint | DirectEndpoint


class ListEndpointReceipts(TypedDict, total=False):
    sessionId: str
    limit: int


class EndpointReceipt(TypedDict):
    id: str
    flowId: str
    endpointId: str
    sessionId: str
    mode: Literal["forward", "function"]
    action: Literal["ping", "INIT", "data_exchange", "BACK", "error_notification"] | None
    outcome: Literal["running", "succeeded", "rejected", "failed", "timeout", "unavailable"]
    httpStatus: int | None
    errorCode: str | None
    keyId: str | None
    functionInvocationId: str | None
    durationMs: float | None
    createdAt: int
    completedAt: int | None


class Deleted(TypedDict):
    ok: Literal[True]
