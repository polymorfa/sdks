"""Shared pure reduction helpers; no I/O or plaintext leaves customer storage."""

from __future__ import annotations

import math
from datetime import datetime
from typing import cast

from ..transport import Json
from .core import FINAL_VERSION, FieldWrite, Unset, finite

SELF_ID = "self"
MESSAGE_STATUS_RANK = {"pending": 1, "failed": 2, "sent": 3, "delivered": 4, "read": 5, "played": 6}
CONTENT_FIELDS = (
    "text",
    "caption",
    "mimeType",
    "fileName",
    "latitude",
    "longitude",
    "displayName",
    "title",
    "pollOptions",
    "extra",
)
MEDIA_SECRET_FIELDS = (
    "mediaKey",
    "descriptor",
    "directPath",
    "downloadUrl",
    "fileSha256",
    "fileEncSha256",
)
Fields = dict[str, FieldWrite]


def record(value: object) -> dict[str, Json]:
    return cast(dict[str, Json], value) if isinstance(value, dict) else {}


def records(value: object) -> list[dict[str, Json]]:
    return [record(item) for item in value] if isinstance(value, list) else []


def text(value: object) -> str | None:
    return value if isinstance(value, str) and value else None


def number(value: object) -> float | None:
    if isinstance(value, str):
        try:
            converted = float(value)
        except ValueError:
            return None
        return converted if finite(converted) else None
    return cast(float, value) if finite(value) else None


def to_millis(value: object) -> float | None:
    raw = number(value)
    if raw is None or raw <= 0:
        return None
    result = math.floor(raw * 1000 + 0.5) if raw < 100_000_000_000 else math.floor(raw + 0.5)
    return float(result) if abs(result) > FINAL_VERSION else result


def iso_millis(value: str | None) -> float:
    try:
        return datetime.fromisoformat((value or "").replace("Z", "+00:00")).timestamp() * 1000
    except (ValueError, OverflowError):
        return 0


def put(fields: Fields, name: str, value: Json | Unset, version: float) -> None:
    if value is not Unset.VALUE:
        fields[name] = FieldWrite(value, version)


def put_present(fields: Fields, name: str, value: Json, version: float) -> None:
    if value is not None:
        fields[name] = FieldWrite(value, version)


def cleared_content() -> Fields:
    return {name: FieldWrite(None, FINAL_VERSION) for name in CONTENT_FIELDS}


def cleared_media() -> Fields:
    return {name: FieldWrite(None, FINAL_VERSION) for name in MEDIA_SECRET_FIELDS}


def status_writes(fields: Fields, status: str, at: float | None = None) -> None:
    rank = MESSAGE_STATUS_RANK[status]
    put(fields, "status", status, rank)
    put_present(fields, "statusAt", at, rank)


def chat_kind(jid: str | None = None, is_group: bool | None = None) -> str | None:
    if is_group is True:
        return "group"
    if jid:
        return (
            "group"
            if jid.endswith("@g.us")
            else "channel"
            if jid.endswith("@newsletter")
            else "broadcast"
            if jid.endswith("@broadcast")
            else "direct"
        )
    return "direct" if is_group is False else None
