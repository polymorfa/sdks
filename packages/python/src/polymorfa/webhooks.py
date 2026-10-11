"""Native raw-body HMAC validation before JSON parsing.

Native signatures have no timestamp or replay fence. Applications can deduplicate
event IDs after verification; the CLI forwarding protocol is a separate contract.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import re
from dataclasses import dataclass, field
from typing import cast

from .errors import ValidationError, WebhookSignatureError
from .transport import Json, JsonObject

KNOWN_EVENT_TYPES = frozenset(
    [
        "bansafe.action",
        "bansafe.claim",
        "bansafe.health_threshold",
        "bansafe.incident",
        "blocklist.update",
        "business.quick_reply.update",
        "call.accepted",
        "call.connection_joined",
        "call.connection_left",
        "call.ended",
        "call.missed",
        "call.participant_joined",
        "call.participant_left",
        "call.participant_state",
        "call.permission_changed",
        "call.received",
        "call.rejected",
        "call.telemetry",
        "campaign.cap_reached",
        "campaign.cold_blocked",
        "campaign.completed",
        "campaign.failed",
        "campaign.launched",
        "campaign.paused",
        "campaign.recipient_failed",
        "campaign.recipient_sent",
        "campaign.recipient_skipped",
        "campaign.rescheduled",
        "campaign.resumed",
        "campaign.stopped",
        "campaign.throttled",
        "chat.archive",
        "chat.clear",
        "chat.delete",
        "chat.mute",
        "chat.read",
        "command.result",
        "contact.opted_in",
        "contact.opted_out",
        "contact.sync",
        "contact.update",
        "customer.archived",
        "customer.archiving",
        "customer.created",
        "customer.enabled",
        "customer.number.attached",
        "customer.number.disconnected",
        "customer.number.transferred",
        "customer.pairing_link.connected",
        "customer.pairing_link.created",
        "customer.pairing_link.expired",
        "customer.pairing_link.failed",
        "customer.pairing_link.opened",
        "customer.pairing_link.revoked",
        "customer.restored",
        "customer.updated",
        "group.participant",
        "group.update",
        "history.sync",
        "labels.update",
        "message.ack",
        "message.delete",
        "message.echo",
        "message.edited",
        "message.failed",
        "message.reaction",
        "message.received",
        "message.revoked",
        "message.sent",
        "message.update",
        "message.vote",
        "newsletter.update",
        "order.payment_updated",
        "presence.update",
        "session.capabilities_updated",
        "session.connected",
        "session.logged_out",
        "session.phone_offline",
        "session.restriction_updated",
        "session.status",
        "template.status",
        "usage.recorded",
        "voice.asset_failed",
        "voice.asset_ready",
    ]
)


@dataclass(frozen=True)
class WebhookEvent:
    id: str
    session: str
    timestamp: str
    event: str
    payload: Json = field(repr=False)
    raw: JsonObject = field(repr=False)
    known: bool


def verify_webhook_signature(raw_body: bytes, signature: str, secret: str) -> bool:
    normalized = signature.removeprefix("sha256=")
    if not secret or re.fullmatch(r"[a-fA-F0-9]{64}", normalized) is None:
        return False
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).digest()
    return hmac.compare_digest(expected, bytes.fromhex(normalized))


def parse_verified_webhook_event(raw_body: bytes) -> WebhookEvent:
    try:
        value = json.loads(raw_body.decode("utf-8", errors="strict"))
    except (UnicodeDecodeError, ValueError):
        raise ValidationError(
            "Webhook body must be valid UTF-8 JSON.", code="invalid_webhook_json"
        ) from None
    if (
        not isinstance(value, dict)
        or not all(
            isinstance(value.get(key), str) and value[key] for key in ("id", "timestamp", "event")
        )
        or not isinstance(value.get("session"), str)
        or "payload" not in value
    ):
        raise ValidationError("Invalid webhook envelope.", code="invalid_webhook_event")
    return WebhookEvent(
        value["id"],
        value["session"],
        value["timestamp"],
        value["event"],
        cast(Json, value["payload"]),
        cast(JsonObject, value),
        value["event"] in KNOWN_EVENT_TYPES,
    )


def construct_webhook_event(raw_body: bytes, signature: str, secret: str) -> WebhookEvent:
    if not verify_webhook_signature(raw_body, signature, secret):
        raise WebhookSignatureError(
            "Webhook signature verification failed.", code="invalid_webhook_signature"
        )
    return parse_verified_webhook_event(raw_body)
