"""Server-owned hierarchical session configuration and patch wire types."""

from typing import Literal, TypedDict

from typing_extensions import NotRequired

ObservationMode = Literal["off", "events", "cache"]
LabelMode = Literal["off", "events", "cache", "project"]
Source = Literal["platform", "team", "project", "session"]
ValueSource = Source | Literal["consent"]


class HistorySync(TypedDict):
    mode: Literal["metadata_only", "deliver"]
    requestFull: bool


class HistorySyncPatch(TypedDict, total=False):
    mode: Literal["metadata_only", "deliver"]
    requestFull: bool


class HmsDisabled(TypedDict):
    enabled: Literal[False]


class HmsEnabled(TypedDict):
    enabled: Literal[True]
    region: str
    policy: Literal["short", "standard", "extended", "compliance", "enterprise_archive"]
    retentionDays: NotRequired[int]
    policyVersion: NotRequired[str]
    legalHold: NotRequired[bool]


Hms = HmsDisabled | HmsEnabled


class Observation(TypedDict):
    presenceMode: ObservationMode
    typingMode: ObservationMode
    labelMode: LabelMode
    quickReplyMode: ObservationMode


class ObservationPatch(TypedDict, total=False):
    presenceMode: ObservationMode
    typingMode: ObservationMode
    labelMode: LabelMode
    quickReplyMode: ObservationMode


class ConfigurationOverrides(TypedDict, total=False):
    observation: ObservationPatch
    historySync: HistorySyncPatch
    hms: Hms


class ConfigurationEffective(TypedDict):
    observation: Observation
    historySync: HistorySync
    hms: Hms


ConfigurationSources = TypedDict(
    "ConfigurationSources",
    {
        "historySync.mode": ValueSource,
        "historySync.requestFull": ValueSource,
        "hms": Source,
        "observation.presenceMode": Source,
        "observation.typingMode": Source,
        "observation.labelMode": Source,
        "observation.quickReplyMode": Source,
    },
)


class ConfigurationRevisions(TypedDict):
    team: int
    project: int
    session: int


class ConfigurationApplication(TypedDict):
    desiredGeneration: int
    appliedGeneration: int
    status: Literal["pending", "applied"]


class ConfigurationView(TypedDict):
    effective: ConfigurationEffective
    overrides: ConfigurationOverrides
    sources: ConfigurationSources
    requestedHistory: HistorySync
    revisions: ConfigurationRevisions
    historyConsent: NotRequired[Literal["pending", "accepted", "declined"]]
    application: NotRequired[ConfigurationApplication]


class ConfigurationPatch(TypedDict, total=False):
    set: ConfigurationOverrides
    reset: list[
        Literal[
            "historySync",
            "historySync.mode",
            "historySync.requestFull",
            "hms",
            "observation",
            "observation.presenceMode",
            "observation.typingMode",
            "observation.labelMode",
            "observation.quickReplyMode",
        ]
    ]
