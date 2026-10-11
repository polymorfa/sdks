"""QuickLink input, onboarding and Hybrid Link availability contracts."""

from typing import Literal

from typing_extensions import NotRequired, TypedDict

from .configuration import Hms, ObservationPatch

Purpose = Literal["initial", "add_connection", "reauthorization"]
Connection = Literal["linked_devices", "official_api"]
Goal = Literal["single", "hybrid"]


class TestingProfile(TypedDict, total=False):
    name: str
    status: str


class TestingConfiguration(TypedDict, total=False):
    profile: TestingProfile
    accountType: Literal["personal", "business"]
    replyBehavior: Literal["off", "echo"]
    failureScenario: Literal["none", "reject-send"]
    historyFixtureId: str


TestingField = Literal[
    "profile.name",
    "profile.status",
    "accountType",
    "replyBehavior",
    "failureScenario",
    "historyFixtureId",
]


class Testing(TypedDict, total=False):
    country: str
    configuration: TestingConfiguration
    editable: list[TestingField]


class HistorySync(TypedDict, total=False):
    consent: Literal["ask", "force_on", "force_off"]
    mode: Literal["metadata_only", "deliver"]
    requestFull: bool


class Configuration(TypedDict, total=False):
    observation: ObservationPatch
    hms: Hms
    historySync: HistorySync
    testing: Testing
    connectionPreference: Literal["cloud", "linked", "both"]
    connectionEnforcement: Literal["prefer", "force"]
    methods: list[Literal["qr", "pairing"]]
    defaultMethod: Literal["qr", "pairing"] | None
    prefillPhone: str
    allowPhoneChange: bool


class BillingControls(TypedDict):
    limitCredits: float | None
    priority: int


class CreateBase(TypedDict, total=False):
    billingControls: BillingControls
    connectionGoal: Goal
    addConnection: Connection
    projectId: str
    customerId: str
    externalId: str
    configuration: Configuration


class Initial(CreateBase, total=False):
    purpose: Literal["initial"]
    session: str


class AddConnection(CreateBase):
    purpose: Literal["add_connection"]
    session: str


Create = Initial | AddConnection


class Link(TypedDict):
    purpose: Purpose
    connectionGoal: Goal
    addConnection: NotRequired[Connection]
    id: str
    url: str
    session: str
    expiresAt: str | None


SyncRequest = Literal[
    "not_applicable", "not_requested", "pending", "requesting", "accepted", "declined", "unknown"
]


class ContactsSync(TypedDict):
    request: SyncRequest
    receiptRecorded: bool


class HistorySyncState(ContactsSync):
    delivery: Literal[
        "not_applicable", "not_requested", "unconfirmed", "partial", "complete", "declined"
    ]


class SyncStatus(TypedDict):
    contacts: ContactsSync
    history: HistorySyncState


class Onboarding(TypedDict):
    stage: str
    connection: str | None
    coexistence: bool | None
    contactsSync: str
    historySync: str
    historyProgress: int
    sync: SyncStatus
    errorCode: str | None


class Status(TypedDict):
    purpose: Purpose
    connectionGoal: Goal
    addConnection: NotRequired[Connection]
    hybridPhase: Literal["cloud_setup", "linked_pairing", "repair_linked", "ready"] | None
    onboarding: NotRequired[Onboarding | None]
    id: str
    status: Literal["pending", "opened", "linked", "connected", "failed", "cancelled"]
    session: str
    expiresAt: str | None
    openedAt: str | None
    connectedAt: str | None
    phone: str | None
    errorCode: str | None


class ConnectionState(TypedDict):
    kind: Connection
    status: str
    enabled: bool


class Availability(TypedDict):
    allowed: bool
    addConnection: Connection | None
    connections: list[ConnectionState]
    resumeQuickLinkId: str | None
