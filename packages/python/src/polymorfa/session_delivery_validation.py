"""Descriptor delivery intent is separate from immutable session custody."""

from __future__ import annotations

from dataclasses import replace

from . import campaign_contract_validation as V
from .transport import RequestOptions


def options(value: RequestOptions, intent: bool) -> RequestOptions:
    return (
        replace(value, api_version="2026-10-14") if intent and value.api_version is None else value
    )


def history(value: object, *, quicklink: bool = False) -> bool:
    v = V.fields(
        value,
        ["mode", "requestFull", "delivery"] + (["consent"] if quicklink else []),
        [],
        "historySync",
    )
    if "mode" in v:
        V.choice(v["mode"], ("metadata_only", "deliver"), "historySync.mode")
    if "requestFull" in v and type(v["requestFull"]) is not bool:
        V.invalid("historySync.requestFull")
    if "delivery" in v:
        V.choice(v["delivery"], ("descriptor",), "historySync.delivery")
    if "consent" in v:
        V.choice(v["consent"], ("ask", "force_on", "force_off"), "historySync.consent")
    return "delivery" in v


def configuration_intent(value: object) -> bool:
    v = V.fields(value, ["configuration", "revision"], ["configuration", "revision"])
    V.integer(v["revision"], "revision")
    patch = V.fields(v["configuration"], ["set", "reset"], [], "configuration")
    intent = False
    if "set" in patch:
        fields = V.fields(
            patch["set"], ["observation", "historySync", "hms"], [], "configuration.set"
        )
        if "historySync" in fields:
            intent = history(fields["historySync"])
    if "reset" in patch:
        reset = patch["reset"]
        if not isinstance(reset, list) or any(
            not isinstance(key, str)
            or key
            not in (
                "historySync",
                "historySync.mode",
                "historySync.requestFull",
                "historySync.delivery",
                "hms",
                "observation",
                "observation.presenceMode",
                "observation.typingMode",
                "observation.labelMode",
                "observation.quickReplyMode",
            )
            for key in reset
        ):
            V.invalid("configuration.reset")
        intent = intent or "historySync.delivery" in reset
    return intent


def quicklink_intent(value: object) -> bool:
    v = V.fields(
        value,
        [
            "purpose",
            "signalMode",
            "session",
            "addConnection",
            "connectionGoal",
            "projectId",
            "customerId",
            "externalId",
            "billingControls",
            "configuration",
        ],
        [],
    )
    if "signalMode" in v:
        V.choice(v["signalMode"], ("standard", "zero_knowledge"), "signalMode")
    if v.get("purpose") == "add_connection":
        V.text(v.get("session"), "session")
        V.choice(v.get("addConnection"), ("linked_devices", "official_api"), "addConnection")
        if v.get("connectionGoal") == "single" or any(
            key in v for key in ("signalMode", "customerId", "externalId", "billingControls")
        ):
            V.invalid("purpose")
    elif ("purpose" in v and v["purpose"] != "initial") or "session" in v or "addConnection" in v:
        V.invalid("purpose")
    intent = "signalMode" in v
    if "configuration" in v:
        config = V.fields(
            v["configuration"],
            [
                "observation",
                "hms",
                "testing",
                "connectionPreference",
                "connectionEnforcement",
                "methods",
                "defaultMethod",
                "prefillPhone",
                "allowPhoneChange",
                "historySync",
            ],
            [],
            "configuration",
        )
        if "historySync" in config:
            intent = history(config["historySync"], quicklink=True) or intent
    return intent
