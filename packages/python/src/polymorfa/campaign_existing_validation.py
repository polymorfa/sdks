"""Checks for existing campaign requests, without changing their version or replay policy."""

from __future__ import annotations

import re
from collections.abc import Mapping
from typing import cast
from urllib.parse import quote, urlsplit, urlunsplit

from . import campaign_contract_validation as V

VARIABLE_NAME = r"[A-Za-z0-9_][A-Za-z0-9_.-]{0,63}"


def obj(value: object, field: str = "body") -> dict[str, object]:
    if not isinstance(value, dict) or any(not isinstance(k, str) for k in value):
        V.invalid(field)
    return cast(dict[str, object], value)


def fields(value: object, allowed: list[str], required: list[str], field: str) -> dict[str, object]:
    v = obj(value, field)
    if set(v) - set(allowed) or set(required) - set(v):
        V.invalid(field)
    return v


def mapping(value: object) -> None:
    v = obj(value, "variableMapping")
    if len(v) > 50:
        V.invalid("variableMapping")
    for key, entry in v.items():
        if re.fullmatch(VARIABLE_NAME, key) is None:
            V.invalid("variableMapping")
        b = fields(entry, ["source", "fallback"], [], "variableMapping")
        if "source" in b and (
            not isinstance(b["source"], str) or re.fullmatch(VARIABLE_NAME, b["source"]) is None
        ):
            V.invalid("variableMapping.source")
        if "fallback" in b and not V.trim(
            V.text(b["fallback"], "variableMapping.fallback", 1, 1024)
        ):
            V.invalid("variableMapping.fallback")


def links(value: object) -> None:
    if value is None:
        return
    if not isinstance(value, list) or len(value) > 5:
        V.invalid("trackedLinks")
    keys: set[str] = set()
    for entry in value:
        v = fields(entry, ["key", "url"], ["key", "url"], "trackedLinks")
        key = V.text(v["key"], "trackedLinks.key", 1, 32)
        if re.fullmatch(r"[a-z0-9_]+", key) is None or key in keys:
            V.invalid("trackedLinks.key")
        keys.add(key)
        raw = V.text(v["url"], "trackedLinks.url", 1, 2048)
        if any(c in V.ECMA_WHITESPACE or ord(c) < 32 or ord(c) == 127 for c in raw):
            V.invalid("trackedLinks.url")
        try:
            parsed = urlsplit(raw.replace("\\", "/"))
            host = (parsed.hostname or "").encode("idna").decode("ascii").lower().removesuffix(".")
            port = parsed.port
            authority = host + (f":{port}" if port is not None and port != 443 else "")
            normalized = urlunsplit(
                (
                    "https",
                    authority,
                    quote(parsed.path or "/", safe="/%:@!$&'()*+,;=-._~"),
                    quote(parsed.query, safe="%/?@!$&'()*+,;=:-._~"),
                    quote(parsed.fragment, safe="%/?@!$&'()*+,;=:-._~"),
                )
            )
            V.text(normalized, "trackedLinks.url", 1, 2048)
        except (ValueError, UnicodeError):
            V.invalid("trackedLinks.url")
        if (
            parsed.scheme.lower() != "https"
            or parsed.username
            or parsed.password
            or not parsed.netloc
            or "." not in host
            or host.startswith("[")
            or re.fullmatch(r"[0-9.]+", host)
            or host.rsplit(".", 1)[-1].isdigit()
            or any(host.endswith(suffix) for suffix in (".local", ".internal", ".localhost"))
        ):
            V.invalid("trackedLinks.url")


def follow_up(value: object) -> None:
    if value is None:
        return
    v = fields(value, ["delaySeconds", "expirySeconds", "message"], ["message"], "followUp")
    delay = (
        V.integer(v["delaySeconds"], "delaySeconds", 60, 604800) if "delaySeconds" in v else 86400
    )
    expiry = (
        V.integer(v["expirySeconds"], "expirySeconds", 86400, 2592000)
        if "expirySeconds" in v
        else 604800
    )
    if expiry <= delay:
        V.invalid("followUp.expirySeconds")
    message = obj(v["message"], "followUp.message")
    if message.get("type") == "text":
        fields(message, ["type", "text"], ["type", "text"], "followUp.message")
        text = V.text(message["text"], "followUp.message.text", 1, 16384)
        if re.search(r"\{\{[" + V.ECMA_WHITESPACE + r"]*link:", text, re.IGNORECASE | re.ASCII):
            V.invalid("followUp.message.text")
    else:
        fields(message, ["type", "templateId"], ["type", "templateId"], "followUp.message")
        V.choice(message["type"], ("template",), "followUp.message.type")
        V.uuid(message["templateId"], "followUp.message.templateId")


ORDINARY_MAX_DELAY = 86400
DRIP_MAX_DELAY = 2592000


def composed(value: object, max_delay: int = ORDINARY_MAX_DELAY) -> None:
    if not isinstance(value, list) or len(value) > 10:
        V.invalid("messagesArray")
    for item in value:
        v = obj(item, "messagesArray")
        if "version" in v and (type(v["version"]) is not int or v["version"] != 2):
            V.invalid("version")
        for key in ("source", "footer"):
            if key in v:
                V.text(v[key], key, 0)
        if "delayAfterSec" in v:
            V.integer(v["delayAfterSec"], "delayAfterSec", 0, max_delay)
        if "media" in v:
            m = obj(v["media"], "media")
            V.choice(m.get("kind"), ("image", "video", "audio", "document"), "media.kind")
            V.text(m.get("url"), "media.url", 0)
            for key in ("filename", "caption"):
                if key in m:
                    V.text(m[key], key, 0)
        if "buttons" in v:
            if not isinstance(v["buttons"], list):
                V.invalid("buttons")
            for entry in v["buttons"]:
                b = obj(entry, "button")
                V.choice(b.get("kind"), ("reply", "link", "call"), "button.kind")
                V.text(b.get("label"), "button.label", 0)
                for key in ("url", "phone"):
                    if key in b:
                        V.text(b[key], key, 0)


def alternatives(value: object, variants: bool, platform: bool) -> None:
    if not isinstance(value, list) or not 2 <= len(value) <= (4 if variants else 5):
        V.invalid("variants")
    keys: set[str] = set()
    total = 0
    for entry in value:
        allowed = ["key", "weight", "blueprint"] + (["label"] if variants else [])
        v = fields(entry, allowed, allowed, "variants")
        key = V.text(v["key"], "key", 1, 16)
        if not re.fullmatch(r"[a-z][a-z0-9_-]{0,15}", key) or key in keys:
            V.invalid("key")
        keys.add(key)
        if variants:
            raw = V.text(v["label"], "label")
            V.text(raw if platform else V.trim(raw), "label", 1, 100)
        total += V.integer(v["weight"], "weight", 1, 99)
        blueprint = obj(v["blueprint"], "blueprint")
        if type(blueprint.get("version")) is not int or blueprint["version"] != 2:
            V.invalid("blueprint.version")
        if not V.trim(V.text(blueprint.get("source"), "blueprint.source", 1, 4096)):
            V.invalid("blueprint.source")
    if total != 100:
        V.invalid("weight")


def campaign(value: object, *, platform: bool = False, patch: bool = False) -> None:
    v = obj(value)
    if not platform and patch and not v:
        V.invalid("body")
    if "variableMapping" in v and not (patch and v["variableMapping"] is None):
        mapping(v["variableMapping"])
    if "trackedLinks" in v:
        links(v["trackedLinks"])
    if "templateId" in v and patch and v["templateId"] is not None:
        V.uuid(v["templateId"], "templateId")
    if "followUp" in v:
        follow_up(v["followUp"])
    if "messagesArray" in v:
        # A PATCH can target a stored drip without repeating its settings; the API
        # keeps delay-unit, eligibility and stored-state authority.
        drip = patch or ("drip" in v and v["drip"] is not None)
        composed(v["messagesArray"], DRIP_MAX_DELAY if drip else ORDINARY_MAX_DELAY)
    for key, variant in (("variants", True), ("messageVariations", False)):
        if key in v and not (v[key] is None and (not platform or patch)):
            alternatives(v[key], variant, platform)
    if "variantStrategy" in v and not (v["variantStrategy"] is None and (not platform or patch)):
        s = fields(
            v["variantStrategy"],
            [
                "winnerCriterion",
                "holdoutPercent",
                "testSlicePercent",
                "autoPromote",
                "testWindowMinutes",
            ],
            ["winnerCriterion", "holdoutPercent", "autoPromote", "testWindowMinutes"],
            "variantStrategy",
        )
        V.choice(s["winnerCriterion"], ("delivery", "read", "reply"), "winnerCriterion")
        V.integer(s["holdoutPercent"], "holdoutPercent", 0, 30)
        if "testSlicePercent" in s:
            V.integer(s["testSlicePercent"], "testSlicePercent", 5, 50)
        if s["autoPromote"] is not True:
            V.invalid("autoPromote")
        V.integer(s["testWindowMinutes"], "testWindowMinutes", 15, 1440)


def recipients(value: object, platform: bool = False) -> None:
    from typing import get_args

    from .campaign_contract_models import CampaignRecipientFailureReason

    v = fields(
        value,
        ["status", "reason", "cursor", "limit"] + (["projectId"] if platform else []),
        ["projectId"] if platform else [],
        "params",
    )
    if platform:
        V.uuid(v["projectId"], "projectId")
    if "reason" in v:
        V.choice(v["reason"], get_args(CampaignRecipientFailureReason), "reason")
    if "status" in v:
        V.choice(
            v["status"],
            ("queued", "sending", "sent", "delivered", "read", "failed", "skipped"),
            "status",
        )
    if "cursor" in v:
        V.text(v["cursor"], "cursor", 1, 256)
    if "limit" in v:
        V.integer(v["limit"], "limit", 1, 100)


def launch(value: object, platform: bool = False) -> None:
    v = fields(
        value,
        ["scheduledAt", "skipMissingVariables"] + (["projectId"] if platform else []),
        ["projectId"] if platform else [],
        "body",
    )
    if platform:
        V.uuid(v["projectId"], "projectId")
    if "scheduledAt" in v and not V.finite(v["scheduledAt"]):
        V.invalid("scheduledAt")
    if "skipMissingVariables" in v and type(v["skipMissingVariables"]) is not bool:
        V.invalid("skipMissingVariables")


def selection(value: object, *, slug: bool = False) -> None:
    v = fields(value, ["projectId"] + (["projectSlug"] if slug else []), ["projectId"], "params")
    V.uuid(v["projectId"], "projectId")
    if "projectSlug" in v:
        V.text(v["projectSlug"], "projectSlug")


def protected_extra(value: Mapping[str, object] | None, known: set[str]) -> None:
    if value is not None and set(value) & (
        known
        | {
            "projectId",
            "projectSlug",
            "campaignId",
            "id",
            "method",
            "path",
            "body",
            "query",
            "options",
        }
    ):
        from .errors import ValidationError

        raise ValidationError(
            "Use the typed body for named campaign or owner fields.", param="extra_fields"
        )
