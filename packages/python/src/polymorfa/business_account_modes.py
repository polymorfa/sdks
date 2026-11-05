"""Typed Test-number account modes and optional business encryption state."""

from __future__ import annotations

from typing import Literal

from typing_extensions import NotRequired, TypedDict

from . import campaign_contract_validation as V

WhatsAppAccountType = Literal["whatsapp_app", "business_app", "meta_cloud", "meta_coexistence"]
TestingPrimaryPlatform = Literal["android", "ios"]
ContactEncryption = Literal["end_to_end", "hybrid", "not_end_to_end"]


class TestingAccountModeInput(TypedDict):
    accountType: WhatsAppAccountType
    primaryPlatform: NotRequired[TestingPrimaryPlatform]


class TestingAccountMode(TypedDict):
    session: str
    accountType: WhatsAppAccountType
    primaryPlatform: TestingPrimaryPlatform | None
    changed: bool
    unlinkedDevices: list[int]


def validate_testing_mode_fields(value: object, *, required: bool = False) -> None:
    mode = V.obj(value)
    account = mode.get("accountType", "whatsapp_app" if not required else None)
    V.choice(
        account, ("whatsapp_app", "business_app", "meta_cloud", "meta_coexistence"), "accountType"
    )
    if "primaryPlatform" in mode:
        V.choice(mode["primaryPlatform"], ("android", "ios"), "primaryPlatform")
        if account == "meta_cloud":
            V.invalid("primaryPlatform")


def validate_testing_account_mode(value: object) -> None:
    V.fields(value, ["accountType", "primaryPlatform"], ["accountType"])
    validate_testing_mode_fields(value, required=True)
