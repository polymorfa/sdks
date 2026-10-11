"""Official API credential observations and provider message-count summaries."""

from typing import Literal

from typing_extensions import TypedDict


class MetaPricingParams(TypedDict, total=False):
    since: str
    until: str


class MetaPricingGroup(TypedDict):
    category: str
    pricingModel: str
    pricingType: str | None
    billable: bool | None
    messages: int


class MetaPricingSummary(TypedDict):
    source: Literal["meta"]
    since: str
    until: str
    messages: int
    groups: list[MetaPricingGroup]


CloudCredentialFailureCode = Literal[
    "app_credentials_rejected",
    "token_expired",
    "token_invalid",
    "token_app_mismatch",
    "permission_missing",
    "phone_not_registered",
    "webhook_not_subscribed",
    "credentials_unreadable",
    "meta_unavailable",
    "meta_response_invalid",
]


class CloudTokenHealth(TypedDict):
    status: Literal["valid", "expired", "invalid", "unknown"]
    expiresAt: str | None


class CloudCredentialHealth(TypedDict):
    status: Literal["pending", "healthy", "action_required", "unknown"]
    checkedAt: str | None
    nextCheckAt: str | None
    token: CloudTokenHealth
    missingPermissions: list[Literal["whatsapp_business_messaging", "whatsapp_business_management"]]
    phoneRegistration: Literal["registered", "not_registered", "unknown"]
    webhookSubscription: Literal["subscribed", "not_subscribed", "unknown"]
    failureCode: CloudCredentialFailureCode | None


class CloudReauthorization(TypedDict):
    quicklinkId: str
    url: str
    session: str
