"""Strict outbound checks. Responses retain producer normalization and extensions."""

from __future__ import annotations

import base64
import json
import math
import re
import unicodedata
from dataclasses import replace
from decimal import Decimal
from typing import NoReturn, TypeVar, cast

from .errors import ValidationError
from .transport import RequestOptions

T = TypeVar("T")
ECMA_WHITESPACE = "\u0009\u000a\u000b\u000c\u000d\u0020\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff"


def trim(value: str) -> str:
    return value.strip(ECMA_WHITESPACE)


def finite(value: object) -> bool:
    if type(value) not in (int, float):
        return False
    try:
        return math.isfinite(cast(float, value))
    except (OverflowError, ValueError):
        return False


UUID = r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"
NODE = r"[A-Za-z0-9][A-Za-z0-9._:-]{0,63}"


def invalid(field: str) -> NoReturn:
    raise ValidationError(f"Invalid {field}.", param=field)


def obj(value: object, field: str = "body") -> dict[str, object]:
    if type(value) is not dict or any(not isinstance(k, str) for k in value):
        invalid(field)
    return cast(dict[str, object], value)


def fields(
    value: object, allowed: list[str], required: list[str], field: str = "body"
) -> dict[str, object]:
    result = obj(value, field)
    if set(result) - set(allowed) or set(required) - set(result):
        invalid(field)
    return result


def text(
    value: object, field: str, minimum: int = 1, maximum: int = 2**53 - 1, *, byte: bool = False
) -> str:
    if not isinstance(value, str):
        invalid(field)
    try:
        length = (
            len(value.encode("utf-8"))
            if byte
            else len(value.encode("utf-16-le", errors="surrogatepass")) // 2
        )
    except UnicodeError:
        invalid(field)
        length = -1
    if not minimum <= length <= maximum:
        invalid(field)
    return value


def uuid(value: object, field: str) -> str:
    result = text(value, field)
    if re.fullmatch(UUID, result) is None:
        invalid(field)
    return result


def integer(value: object, field: str, minimum: int = 0, maximum: int = 2**53 - 1) -> int:
    if type(value) is not int or not minimum <= value <= maximum:
        invalid(field)
    return value


def choice(value: object, values: tuple[str, ...], field: str) -> None:
    if not isinstance(value, str) or value not in values:
        invalid(field)


def number_spelling(value: float) -> str:
    # API JSON numbers are IEEE-754 doubles. Use shortest round-trip digits,
    # with the producer's fixed/exponent thresholds and positive-exponent sign.
    numeric = float(value)
    if not math.isfinite(numeric):
        invalid("number")
    if numeric == 0:
        return "0"
    decimal = Decimal(repr(numeric))
    if 1e-6 <= abs(numeric) < 1e21:
        rendered = format(decimal, "f")
        return rendered.rstrip("0").rstrip(".") if "." in rendered else rendered
    mantissa, exponent = format(decimal.normalize(), "e").split("e")
    power = int(exponent)
    return mantissa + "e" + ("+" if power >= 0 else "-") + str(abs(power))


def semantic_json(value: object) -> str:
    if type(value) is dict:
        return (
            "{"
            + ",".join(
                semantic_json(key) + ":" + semantic_json(item) for key, item in value.items()
            )
            + "}"
        )
    if type(value) is list:
        return "[" + ",".join(semantic_json(item) for item in value) + "]"
    if type(value) in (int, float):
        return number_spelling(cast(float, value))
    if value is None or type(value) is bool or isinstance(value, str):
        rendered = json.dumps(value, ensure_ascii=False, allow_nan=False)
        return "".join(
            f"\\u{ord(char):04x}" if 0xD800 <= ord(char) <= 0xDFFF else char for char in rendered
        )
    invalid("body")
    raise AssertionError


def compact(value: object) -> bytes:
    try:
        return semantic_json(value).encode("utf-8")
    except (TypeError, ValueError, UnicodeError, OverflowError):
        invalid("body")
        raise AssertionError


def capture(value: T) -> T:
    # Preserve the caller's actual JSON values; semantic sizing is separate.
    try:
        return cast(T, json.loads(json.dumps(value, allow_nan=False)))
    except (TypeError, ValueError, OverflowError):
        invalid("body")
        raise AssertionError


def options(value: RequestOptions, *, write: bool = False, replay: bool = False) -> RequestOptions:
    if value.idempotency_key is not None:
        text(value.idempotency_key, "options.idempotency_key", 1, 255, byte=True)
    selected = replace(
        value,
        api_version=value.api_version if value.api_version is not None else "2026-10-14",
        max_network_retries=0
        if write and not replay and value.max_network_retries is None
        else value.max_network_retries,
    )
    return selected.with_idempotency_key() if replay else selected


def phone(value: object) -> str:
    result = text(value, "phone")
    if re.fullmatch(r"\+[1-9][0-9]{6,14}", result) is None:
        invalid("phone")
    return result


def page(value: object) -> dict[str, object]:
    result = fields(value, ["cursor", "limit"], [], "params")
    if "cursor" in result:
        uuid(result["cursor"], "params.cursor")
    if "limit" in result:
        integer(result["limit"], "params.limit", 1, 100)
    return dict(result)


def profile(value: object) -> None:
    data = fields(
        value,
        ["tags", "attributes", "expectedRevision", "provenance", "consent"],
        ["tags", "attributes"],
    )
    if "expectedRevision" in data:
        integer(data["expectedRevision"], "expectedRevision", 1)
    tags = data["tags"]
    if not isinstance(tags, list) or len(tags) > 20:
        invalid("tags")
    seen: set[str] = set()
    for raw in cast(list[object], tags):
        tag = text(raw, "tags", 1, 48, byte=True)
        if tag in seen or any(ord(c) < 32 or ord(c) == 127 for c in tag):
            invalid("tags")
        seen.add(tag)
    attributes = obj(data["attributes"], "attributes")
    if len(attributes) > 20 or len(compact(attributes)) > 8192:
        invalid("attributes")
    for key, item in attributes.items():
        if re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]{0,47}", key) is None:
            invalid("attributes")
        if item is None or type(item) is bool:
            continue
        if type(item) in (int, float) and finite(item):
            continue
        if isinstance(item, str) and "\0" not in text(item, "attributes", 0, 256, byte=True):
            continue
        invalid("attributes")
    for key in ("provenance", "consent"):
        if key not in data:
            continue
        names = ["source", "reference"] + (
            ["purpose", "allowed", "assertedAt"] if key == "consent" else []
        )
        entry = fields(data[key], names, names, key)
        choice(entry["source"], ("api", "csv", "form"), key)
        reference = text(entry["reference"], key, 1, 128, byte=True)
        if any(ord(c) < 32 or ord(c) == 127 for c in reference):
            invalid(key)
        if key == "consent":
            if entry["purpose"] != "campaigns" or type(entry["allowed"]) is not bool:
                invalid(key)
            integer(entry["assertedAt"], key, 0, 8_640_000_000_000_000)


def import_body(value: object) -> None:
    data = fields(value, ["replayKey", "csvBase64", "mapping"], ["replayKey", "csvBase64"])
    if re.fullmatch(r"[A-Za-z0-9._:-]{1,128}", text(data["replayKey"], "replayKey")) is None:
        invalid("replayKey")
    encoded = text(data["csvBase64"], "csvBase64", 1, 13_981_016)
    try:
        decoded = base64.b64decode(encoded, validate=True)
        if (
            len(decoded) > 10 * 1024 * 1024
            or base64.b64encode(decoded).decode() != encoded
            or "\0" in decoded.decode("utf-8")
        ):
            invalid("csvBase64")
    except (ValueError, UnicodeError):
        invalid("csvBase64")
    if "mapping" in data:
        mapping = fields(
            data["mapping"],
            [
                "phone",
                "tags",
                "attributes",
                "expectedRevision",
                "provenanceReference",
                "consentAllowed",
                "consentAssertedAt",
                "consentReference",
            ],
            ["phone", "tags", "attributes"],
            "mapping",
        )
        seen: set[str] = set()
        for raw_header in mapping.values():
            header = text(raw_header, "mapping", 1, 64, byte=True)
            if (
                trim(header) != header
                or header in seen
                or any(unicodedata.category(c) == "Cc" for c in header)
            ):
                invalid("mapping")
            seen.add(header)
    # Match the actual JSON encoding used by Transport.open_stream.
    if len(json.dumps(data, allow_nan=False).encode()) > 14 * 1024 * 1024:
        invalid("body")


def node_id(value: object, field: str) -> str:
    result = text(value, field)
    if re.fullmatch(NODE, result) is None:
        invalid(field)
    return result


def message(value: object, field: str, maximum: int, multiline: bool = False) -> None:
    result = text(value, field, 1, maximum, byte=True)
    if (multiline and not trim(result)) or any(
        unicodedata.category(c) == "Cc"
        for c in (
            result.replace("\r", "").replace("\n", "").replace("\t", "") if multiline else result
        )
    ):
        invalid(field)


def send(value: object) -> None:
    data = obj(value, "send")
    kind = data.get("kind")
    if not isinstance(kind, str):
        invalid("send.kind")
    if kind == "text":
        fields(data, ["kind", "text"], ["kind", "text"], "send")
        message(data["text"], "text", 4096, True)
        return
    extras = {
        "buttons": ["buttons"],
        "list": ["buttonText", "rows"],
        "flow_form": ["flowId", "buttonText", "screen"],
    }.get(kind)
    if extras is None:
        invalid("send.kind")
        return
    fields(data, ["kind", "body", "footer", *extras], ["kind", "body", *extras], "send")
    message(data["body"], "body", 1024, True)
    if "footer" in data:
        message(data["footer"], "footer", 60)
    if kind != "buttons":
        message(data["buttonText"], "buttonText", 20)
    if kind == "flow_form":
        uuid(data["flowId"], "flowId")
        if re.fullmatch(r"[A-Za-z0-9_]{1,64}", text(data["screen"], "screen")) is None:
            invalid("screen")
        return
    key = "buttons" if kind == "buttons" else "rows"
    values = data[key]
    if not isinstance(values, list) or not 1 <= len(values) <= (3 if kind == "buttons" else 10):
        invalid(key)
    seen: set[str] = set()
    for raw in cast(list[object], values):
        entry = fields(
            raw,
            ["id", "text"] if kind == "buttons" else ["id", "title", "description"],
            ["id", "text"] if kind == "buttons" else ["id", "title"],
            key,
        )
        ident = node_id(entry["id"], "id")
        if ident in seen:
            invalid("id")
        seen.add(ident)
        message(
            entry["text"] if kind == "buttons" else entry["title"],
            key,
            20 if kind == "buttons" else 24,
        )
        if "description" in entry:
            message(entry["description"], "description", 72)


def reply_create(value: object, project: bool = False) -> None:
    data = fields(
        value,
        ["name", "definition", "flowKey", "revision"] + (["projectId"] if project else []),
        ["name", "definition"] + (["projectId"] if project else []),
    )
    text(data["name"], "name", 1, 128, byte=True)
    if project:
        uuid(data["projectId"], "projectId")
    if "flowKey" in data:
        uuid(data["flowKey"], "flowKey")
    if "revision" in data:
        integer(data["revision"], "revision", 1, 1_000_000)
    definition = fields(
        data["definition"], ["entryNodeId", "nodes"], ["entryNodeId", "nodes"], "definition"
    )
    node_id(definition["entryNodeId"], "entryNodeId")
    nodes = definition["nodes"]
    if not isinstance(nodes, list) or not 2 <= len(nodes) <= 12 or len(compact(nodes)) > 24 * 1024:
        invalid("nodes")
    seen: set[str] = set()
    for raw in cast(list[object], nodes):
        entry = fields(raw, ["id", "send", "edges"], ["id", "edges"], "node")
        ident = node_id(entry["id"], "node.id")
        if ident in seen:
            invalid("node.id")
        seen.add(ident)
        if "send" in entry:
            send(entry["send"])
        edges = entry["edges"]
        if not isinstance(edges, list) or len(edges) > 3:
            invalid("edges")
        for raw_edge in cast(list[object], edges):
            edge = fields(raw_edge, ["match", "to"], ["match", "to"], "edge")
            node_id(edge["to"], "to")
            match = obj(edge["match"], "match")
            if match.get("kind") == "choice":
                fields(match, ["kind", "replyKind", "id"], ["kind", "replyKind", "id"], "match")
                choice(match["replyKind"], ("button", "list"), "replyKind")
                node_id(match["id"], "match.id")
            elif match.get("kind") == "keyword":
                fields(match, ["kind", "value"], ["kind", "value"], "match")
                message(match["value"], "match.value", 64)
            elif match.get("kind") == "flow_submission":
                fields(match, ["kind"], ["kind"], "match")
            else:
                invalid("match.kind")


def test_send(value: object, project: bool = False) -> None:
    data = fields(
        value,
        ["sessionId", "to", "sampleRecipientId", "variables"] + (["projectId"] if project else []),
        ["sessionId", "to"] + (["projectId"] if project else []),
    )
    uuid(data["sessionId"], "sessionId")
    text(data["to"], "to", 1, 32)
    if project:
        uuid(data["projectId"], "projectId")
    if "sampleRecipientId" in data:
        uuid(data["sampleRecipientId"], "sampleRecipientId")
    if "variables" in data:
        variables = obj(data["variables"], "variables")
        if len(variables) > 50:
            invalid("variables")
        for key, item in variables.items():
            if re.fullmatch(r"[A-Za-z0-9_][A-Za-z0-9_.-]{0,63}", key) is None:
                invalid("variables")
            if isinstance(item, str):
                text(item, "variables", 0, 1024)
            elif type(item) is bool:
                pass
            elif type(item) not in (int, float) or not finite(item):
                invalid("variables")


def assignment(value: object, project: bool = False) -> None:
    names = ["replyFlowId"] + (["projectId"] if project else [])
    data = fields(value, names, names)
    if data["replyFlowId"] is not None:
        uuid(data["replyFlowId"], "replyFlowId")
    if project:
        uuid(data["projectId"], "projectId")


def export(value: object, project: bool = False) -> dict[str, object]:
    data = fields(
        value,
        ["status", "reason", "cursor", "limit"] + (["projectId"] if project else []),
        ["projectId"] if project else [],
        "params",
    )
    if project:
        uuid(data["projectId"], "projectId")
    if "status" in data:
        choice(
            data["status"],
            ("queued", "sending", "sent", "delivered", "read", "failed", "skipped"),
            "status",
        )
    if "reason" in data:
        choice(
            data["reason"],
            (
                "opted_out",
                "cold_held",
                "campaign_cancelled",
                "invalid_recipient",
                "session_not_connected",
                "ack_timeout",
                "blocked_by_safety",
                "send_failed",
                "missing_variable",
                "other",
            ),
            "reason",
        )
    if "cursor" in data:
        text(data["cursor"], "cursor", 1, 256)
    if "limit" in data:
        integer(data["limit"], "limit", 1, 1000)
    if ("status" in data or "reason" in data) and (
        "cursor" in data or data.get("limit", 1000) != 1000
    ):
        invalid("params")
    return dict(data)


def selection(value: object) -> str:
    return uuid(fields(value, ["projectId"], ["projectId"], "params")["projectId"], "projectId")


def retarget(value: object) -> None:
    data = fields(
        value, ["name", "campaignId", "outcome", "projectId"], ["name", "campaignId", "outcome"]
    )
    name = text(data["name"], "name")
    text(trim(name), "name", 1, 200)
    uuid(data["campaignId"], "campaignId")
    if "projectId" in data:
        uuid(data["projectId"], "projectId")
    choice(
        data["outcome"],
        ("delivered", "not_delivered", "read", "not_read", "replied", "not_replied", "failed"),
        "outcome",
    )


def stop(value: object) -> None:
    data = fields(
        value,
        ["teamId", "enabled", "locale", "revision"],
        ["teamId", "enabled", "locale", "revision"],
    )
    uuid(data["teamId"], "teamId")
    integer(data["revision"], "revision", 0, 2_147_483_646)
    if type(data["enabled"]) is not bool:
        invalid("enabled")
    if data["locale"] is not None:
        choice(data["locale"], ("en", "pt-BR", "es"), "locale")
    elif data["enabled"]:
        invalid("locale")


def custody(value: object, customer: bool = False) -> None:
    data = fields(
        value, ["expectedRevision", "signalModeDefault"], ["expectedRevision", "signalModeDefault"]
    )
    integer(data["expectedRevision"], "expectedRevision")
    if not (customer and data["signalModeDefault"] is None):
        choice(data["signalModeDefault"], ("standard", "zero_knowledge"), "signalModeDefault")
