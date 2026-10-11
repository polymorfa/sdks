"""Call controls, permission limits and client quality report shapes."""

from typing import Literal

from typing_extensions import NotRequired, TypedDict

from .models import ConversationIdentity


class CallLinkRequest(TypedDict):
    session: str
    video: NotRequired[bool]


class PreviewCallLinkRequest(CallLinkRequest):
    token: str


class CreatedCallLink(TypedDict):
    session: str
    token: str
    url: str
    video: bool


class PreviewedCallLink(TypedDict):
    session: str
    video: bool
    creator: ConversationIdentity
    approvalRequired: bool
    isAdmin: bool


class CallParticipant(TypedDict):
    id: str
    audioMuted: bool
    video: bool
    state: Literal["invited", "ringing", "connected", "left"]
    handRaised: NotRequired[bool]
    phoneNumber: NotRequired[str]
    bsuid: NotRequired[str]
    username: NotRequired[str]


class SessionCallSettings(TypedDict):
    callsEnabled: bool
    conferenceMode: bool
    inboundRoute: Literal["clients", "sip_trunk"]
    sipTrunkId: str | None
    sipClaim: bool
    hostCloudApiCalls: bool
    revision: int
    updatedAt: str | None


class PermissionLimit(TypedDict):
    period: str
    maxAllowed: int
    used: int
    resetsAt: str | None


class PermissionAction(TypedDict):
    allowed: bool
    limits: list[PermissionLimit]


class PermissionActions(TypedDict):
    requestPermission: PermissionAction | None
    startCall: PermissionAction | None


class PermissionState(TypedDict):
    status: Literal["none", "temporary", "permanent", "revoked"]
    expiresAt: str | None
    source: Literal["user_action", "automatic", "sync", "call_refused"] | None
    updatedAt: str | None
    checkedAt: str | None
    fresh: bool
    actions: PermissionActions | None


class CallPermission(PermissionState):
    conversation: ConversationIdentity


class CallCheckRequest(TypedDict):
    session: str
    to: str


class CallCheck(TypedDict):
    allowed: bool
    refusal: (
        Literal[
            "calls_disabled",
            "call_recipient_opted_out",
            "call_destination_blocked",
            "call_permission_required",
            "call_limit_reached",
        ]
        | None
    )
    permission: PermissionState | None


class CallConnection(TypedDict):
    connectionId: str
    participant: NotRequired[str]


class CallReaction(CallConnection):
    emoji: Literal["", "👍", "❤️", "😂", "😮", "😢", "🙏"]


class HandRaised(CallConnection):
    raised: bool


class ReportClient(TypedDict):
    sdk: str
    version: str
    platform: Literal["browser", "node", "other"]


class CallQuality(TypedDict, total=False):
    rttMs: int
    jitterMs: int
    packetsLost: int
    packetsReceived: int
    audioCodec: str
    videoCodec: str
    candidateType: Literal["host", "srflx", "prflx", "relay"]
    reconnects: int


CallErrorCode = Literal[
    "media_permission_denied",
    "device_not_found",
    "device_in_use",
    "ice_failed",
    "negotiation_failed",
    "media_timeout",
    "reconnect_exhausted",
    "token_refresh_failed",
    "unsupported_browser",
    "other",
]


class ReportError(TypedDict):
    code: CallErrorCode


class QualityReport(CallConnection):
    kind: Literal["quality"]
    client: NotRequired[ReportClient]
    quality: CallQuality


class ErrorReport(CallConnection):
    kind: Literal["error"]
    client: NotRequired[ReportClient]
    error: ReportError


CallReport = QualityReport | ErrorReport
