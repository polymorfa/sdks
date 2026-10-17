"""Validate descriptor intent at the raw storage boundary without retaining secrets."""

from __future__ import annotations

import math
import re
from collections.abc import Mapping
from typing import Literal, TypeAlias, cast

from ..webhook_models import DirectHistorySyncPayload

HistoryDescriptorMode: TypeAlias = Literal["decode", "metadata-only"]


def validate_mode(mode: HistoryDescriptorMode) -> None:
    if mode not in ("decode", "metadata-only"):
        raise ValueError("Invalid history descriptor mode")


def _text(value: object, minimum: int = 1, maximum: int | None = None) -> bool:
    return (
        isinstance(value, str)
        and len(value) >= minimum
        and (maximum is None or len(value) <= maximum)
    )


def _integer(value: object) -> bool:
    if not isinstance(value, (int, float)) or isinstance(value, bool):
        return False
    try:
        return math.isfinite(value) and value >= 0 and value == math.trunc(value)
    except OverflowError:
        return False


def _ids(value: object) -> bool:
    return (
        isinstance(value, Mapping)
        and bool(value)
        and all(
            k in ("linked_devices", "official_api") and _text(v, 1, 512) for k, v in value.items()
        )
    )


def _datetime(value: object) -> bool:
    if not isinstance(value, str):
        return False
    match = re.fullmatch(
        r"([0-9]{4})-(0[1-9]|1[0-2])-([0-9]{2})T(?:[01][0-9]|2[0-3]):[0-5][0-9](?::[0-5][0-9](?:\.[0-9]+)?)?Z",
        value,
    )
    if match is None:
        return False
    y, m, d = map(int, match.groups())
    days = [
        31,
        29 if y % 4 == 0 and (y % 100 != 0 or y % 400 == 0) else 28,
        31,
        30,
        31,
        30,
        31,
        31,
        30,
        31,
        30,
        31,
    ]
    return 1 <= d <= days[m - 1]


def validate_descriptor(value: object) -> DirectHistorySyncPayload:
    valid = isinstance(value, Mapping)
    p: Mapping[str, object] = cast(Mapping[str, object], value) if valid else {}
    valid = valid and p.get("delivery") == "descriptor" and _ids(p.get("whatsapp_ids"))
    valid = valid and _text(p.get("syncType")) and _integer(p.get("fileLength"))
    for key in ("whatsapp_id", "original_whatsapp_id"):
        valid = valid and (key not in p or _text(p[key], 1, 512))
    valid = valid and ("original_whatsapp_ids" not in p or _ids(p["original_whatsapp_ids"]))
    for key in ("chunkOrder", "progress"):
        valid = valid and (key not in p or _integer(p[key]))
    valid = valid and ("progress" not in p or cast(float, p["progress"]) <= 100)
    valid = valid and ("oldestMessageAt" not in p or _datetime(p["oldestMessageAt"]))
    valid = valid and (
        "peerDataRequestSessionId" not in p or _text(p["peerDataRequestSessionId"], 0)
    )
    valid = valid and (("media" in p) != ("inline" in p))
    if "media" in p:
        media = p["media"]
        valid = valid and isinstance(media, Mapping)
        if isinstance(media, Mapping):
            valid = (
                valid
                and media.get("type") == "md-msg-hist"
                and all(
                    _text(media.get(k))
                    for k in ("directPath", "mediaKey", "fileSha256", "fileEncSha256")
                )
                and ("encHandle" not in media or _text(media["encHandle"], 0))
            )
    else:
        inline = p.get("inline")
        valid = valid and isinstance(inline, Mapping)
        if isinstance(inline, Mapping):
            valid = (
                valid
                and inline.get("encoding") == "zlib-base64-protobuf"
                and _text(inline.get("data"))
            )
    if not valid:
        raise ValueError("Invalid history descriptor")
    return cast(DirectHistorySyncPayload, value)


def validate_chunk(value: object) -> None:
    if not isinstance(value, Mapping):
        # History remains an optional peer. Metadata-only and map projections do not load it.
        from ..history import HistorySync

        if not isinstance(value, HistorySync):
            raise TypeError("Invalid decoded history descriptor chunk")
        return
    for key in (
        "conversations",
        "statusV3Messages",
        "pushnames",
        "pastParticipants",
        "phoneNumberToLidMappings",
    ):
        items = value.get(key)
        if items is not None and (
            not isinstance(items, (list, tuple)) or not all(isinstance(v, Mapping) for v in items)
        ):
            raise ValueError("Invalid decoded history descriptor chunk")
    sync = value.get("syncType")
    if sync is not None and (isinstance(sync, bool) or not isinstance(sync, (str, int, float))):
        raise ValueError("Invalid decoded history descriptor chunk")
