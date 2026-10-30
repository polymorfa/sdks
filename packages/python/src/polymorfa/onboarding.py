"""Trusted-server onboarding continuation and isolated Testing resources."""

from __future__ import annotations

from typing import Literal

from typing_extensions import NotRequired, TypedDict

from . import campaign_contract_validation as V
from .campaign_contract_response import acknowledged
from .errors import ValidationError
from .messaging import O, Resource, segment
from .models import Envelope
from .transport import ApiResponse, RequestOptions


class SignupResult(TypedDict):
    code: str
    wabaId: str
    phoneNumberId: str
    coexistence: NotRequired[bool]
    historySync: NotRequired[bool]


class EmbeddedSignup(TypedDict):
    quicklinkId: str
    projectId: NotRequired[str]
    result: NotRequired[SignupResult]


class SignupStage(TypedDict):
    stage: str


class CloudOnboarding(Resource):
    async def advance(
        self, body: EmbeddedSignup, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[SignupStage]]:
        self._server()
        return await self._request(
            "POST", "/messaging/cloud-api/embedded-signup", body=body, options=options
        )


class HistoryMessage(TypedDict):
    id: str
    senderPhone: str
    text: str
    timestamp: int
    fromMe: bool


class HistoryFixture(TypedDict):
    messages: list[HistoryMessage]


class CreatedHistoryFixture(TypedDict):
    fixtureId: str


TestEvent = Literal[
    "message.received",
    "message.ack",
    "message.failed",
    "call.received",
    "call.missed",
    "call.ended",
    "session.status",
    "session.restriction_updated",
    "template.status",
]
TEST_EVENT_FIXTURES: tuple[TestEvent, ...] = (
    "message.received",
    "message.ack",
    "message.failed",
    "call.received",
    "call.missed",
    "call.ended",
    "session.status",
    "session.restriction_updated",
    "template.status",
)


class EventOverrides(TypedDict, total=False):
    text: str
    from_: str
    pushName: str
    mediaType: Literal["image", "video", "audio", "document", "sticker"]
    caption: str
    ackStatus: Literal["delivered", "read", "played", "error"]
    messageId: str
    failureReason: Literal[
        "invalid_recipient",
        "session_not_connected",
        "ack_timeout",
        "send_failed",
        "blocked_by_safety",
    ]
    video: bool
    durationSeconds: int
    callEndReason: Literal[
        "user_hangup", "timeout", "lost_connection", "rejected", "call_restricted"
    ]
    restrictionActive: bool
    status: Literal["CONNECTING", "CONNECTED", "DISCONNECTED"]
    statusReason: Literal[
        "SCAN_QR",
        "AUTO_RECONNECT",
        "FAILED",
        "MANUAL_STOP",
        "QR_TIMEOUT",
        "LOGGED_OUT",
        "TEMPORARY_BAN",
        "STREAM_ERROR",
    ]
    templateName: str
    templateStatus: Literal["APPROVED", "REJECTED"]
    reason: str


class TriggerEvent(TypedDict):
    event: TestEvent
    overrides: NotRequired[EventOverrides]
    fromNumber: NotRequired[str]


class TriggeredEvent(TypedDict):
    event: TestEvent
    session: str
    delivery: Literal["generated", "simulated"]
    eventId: str | None
    source: Literal["test", "runtime"]


OverrideField = Literal[
    "text",
    "from",
    "pushName",
    "mediaType",
    "caption",
    "ackStatus",
    "messageId",
    "failureReason",
    "video",
    "durationSeconds",
    "callEndReason",
    "restrictionActive",
    "status",
    "statusReason",
    "templateName",
    "templateStatus",
    "reason",
]


class EventFixture(TypedDict):
    name: TestEvent
    description: str
    overrides: list[OverrideField]


class EventFixtures(TypedDict):
    fixtures: list[EventFixture]


class Device(TypedDict):
    deviceId: int


class TestingPhone(TypedDict):
    session: str
    phone: str
    online: bool
    devices: list[Device]


class PhoneMessage(TypedDict):
    to: str
    text: str


class PhoneMessageResult(TypedDict):
    session: str
    to: str
    messageId: str | None


class UnlinkedDevice(TypedDict):
    session: str
    deviceId: int
    unlinked: Literal[True]


class Testing(Resource):
    async def create_history_fixture(
        self, project_id: str, body: HistoryFixture, *, options: RequestOptions = O
    ) -> ApiResponse[CreatedHistoryFixture]:
        self._server()
        return await self._request(
            "POST",
            f"/messaging/projects/{segment(project_id)}/test-history-fixtures",
            body=body,
            options=options,
        )

    async def trigger_event(
        self, session: str, body: TriggerEvent, *, options: RequestOptions = O
    ) -> ApiResponse[TriggeredEvent]:
        self._server()
        wire: dict[str, object] = dict(body)
        if "overrides" in body:
            overrides: dict[str, object] = dict(body["overrides"])
            if "from_" in overrides:
                overrides["from"] = overrides.pop("from_")
            wire["overrides"] = overrides
        return await self._request(
            "POST", f"/messaging/{segment(session)}/test-events", body=wire, options=options
        )

    async def list_event_fixtures(
        self, *, options: RequestOptions = O
    ) -> ApiResponse[EventFixtures]:
        self._server()
        return await self._request("GET", "/messaging/test-events/fixtures", options=options)

    @acknowledged()
    async def get_phone(
        self, session: str, *, options: RequestOptions = O
    ) -> ApiResponse[TestingPhone]:
        self._server()
        return await self._request(
            "GET",
            f"/messaging/{segment(session)}/phone",
            options=options,
        )

    @acknowledged(202)
    async def send_phone_message(
        self, session: str, body: PhoneMessage, *, options: RequestOptions = O
    ) -> ApiResponse[PhoneMessageResult]:
        self._server()
        data = V.fields(body, ["to", "text"], ["to", "text"])
        V.text(data["to"], "to")
        V.text(data["text"], "text")
        return await self._request(
            "POST",
            f"/messaging/{segment(session)}/phone/messages",
            body=V.capture(body),
            options=options,
        )

    @acknowledged()
    async def unlink_phone_device(
        self, session: str, device_id: int, *, options: RequestOptions = O
    ) -> ApiResponse[UnlinkedDevice]:
        self._server()
        if (
            isinstance(device_id, bool)
            or not isinstance(device_id, int)
            or not 1 <= device_id <= 99
        ):
            raise ValidationError("device_id must be a companion device ID from 1 to 99.")
        return await self._request(
            "POST",
            f"/messaging/{segment(session)}/phone/devices/{device_id}/unlink",
            options=options,
        )
