"""Handwritten deterministic reduction of the 24 stored native webhook types."""

from __future__ import annotations

from typing import cast

from ..transport import Json
from ..webhooks import WebhookEvent
from .core import (
    FINAL_VERSION,
    ChatWatermarkGuard,
    ClearChat,
    FieldWrite,
    OperationBatch,
    StorageOperation,
    Unset,
    Upsert,
)
from .reducer_common import (
    CONTENT_FIELDS,
    SELF_ID,
    Fields,
    cleared_content,
    cleared_media,
    iso_millis,
    number,
    put,
    put_present,
    record,
    records,
    status_writes,
    text,
    to_millis,
)

STORED_EVENT_TYPES = (
    "blocklist.update",
    "chat.archive",
    "chat.clear",
    "chat.delete",
    "chat.mute",
    "chat.read",
    "contact.update",
    "group.participant",
    "group.update",
    "history.sync",
    "labels.update",
    "message.ack",
    "message.delete",
    "message.edited",
    "message.reaction",
    "message.received",
    "message.revoked",
    "message.sent",
    "message.update",
    "message.vote",
    "newsletter.update",
    "session.connected",
    "session.logged_out",
    "session.status",
)
_ACK_STATUS = {
    "pending": "pending",
    "error": "failed",
    "failed": "failed",
    "sent": "sent",
    "server": "sent",
    "server_ack": "sent",
    "delivered": "delivered",
    "delivery": "delivered",
    "delivery_ack": "delivered",
    "read": "read",
    "read-self": "read",
    "read_self": "read",
    "played": "played",
    "played-self": "played",
}


def ack_status(value: str | None) -> str | None:
    return _ACK_STATUS.get(value.lower()) if value is not None else None


def reduce_event(event: WebhookEvent) -> OperationBatch:
    return OperationBatch(
        event.session,
        _operations(event.event, event.session, record(event.payload), iso_millis(event.timestamp)),
        event.id,
        event.event,
    )


def _operations(kind: str, session: str, p: dict[str, Json], at: float) -> list[StorageOperation]:
    if kind in ("message.received", "message.update", "message.edited", "message.sent"):
        return _message(
            session,
            p,
            at,
            edit=kind == "message.edited" or p.get("edited") is True,
            sent=kind == "message.sent",
        )
    if kind in (
        "message.reaction",
        "message.revoked",
        "message.delete",
        "message.ack",
        "message.vote",
    ):
        return _message_action(kind, session, p, at)
    fields: Fields = {}
    if kind in ("chat.archive", "chat.mute", "chat.read", "chat.clear", "chat.delete"):
        chat = text(record(p.get("from")).get("id"))
        if not chat or not at:
            return []
        if kind == "chat.archive":
            for target, source in (("archived", "archive"), ("pinned", "pinned")):
                put(fields, target, p.get(source, Unset.VALUE), at)
        elif kind == "chat.mute":
            put(fields, "muted", p.get("muted", Unset.VALUE), at)
            put(
                fields,
                "muteEndAt",
                to_millis(p.get("muteEndTimestamp")) if p.get("muted") else None,
                at,
            )
        elif kind == "chat.read":
            put(fields, "markedUnread", not bool(p.get("read")), at)
            if p.get("read"):
                put(fields, "unreadCount", 0, at)
        else:
            put(fields, "clearedAt" if kind == "chat.clear" else "deletedAt", at, at)
            return [
                Upsert("chats", {"sessionId": session, "chatId": chat}, fields),
                ClearChat(session, chat, at),
            ]
        return [Upsert("chats", {"sessionId": session, "chatId": chat}, fields)] if fields else []
    if kind in ("session.connected", "session.status", "session.logged_out"):
        if kind == "session.connected":
            put(fields, "connected", True, at)
            for target, source in (
                ("phoneNumber", "phoneNumber"),
                ("waId", "id"),
                ("pushName", "pushName"),
                ("phonePlatform", "phonePlatform"),
                ("accountType", "accountType"),
                ("businessName", "businessName"),
            ):
                put_present(fields, target, text(p.get(source)), at)
        elif kind == "session.status":
            if not isinstance(p.get("status"), str):
                return []
            put(fields, "status", p["status"], at)
            put(fields, "statusReason", p.get("statusReason"), at)
        else:
            put(fields, "connected", False, at)
            put_present(fields, "loggedOutReason", text(p.get("reason")), at)
            put_present(fields, "loggedOutCode", number(p.get("code")), at)
        return [Upsert("sessions", {"sessionId": session}, fields)]
    if kind == "contact.update":
        identity = text(p.get("id"))
        if not identity:
            return []
        for name in (
            "phoneNumber",
            "bsuid",
            "username",
            "fullName",
            "firstName",
            "pushName",
            "businessName",
        ):
            put_present(fields, name, text(p.get(name)), at)
        if p.get("pictureRemoved") is True:
            put(fields, "pictureId", None, at)
        else:
            put_present(fields, "pictureId", text(p.get("pictureId")), at)
        return (
            [Upsert("contacts", {"sessionId": session, "contactId": identity}, fields)]
            if fields
            else []
        )
    if kind == "blocklist.update":
        result: list[StorageOperation] = []
        for change in records(p.get("changes")):
            identity, action = text(change.get("id")), text(change.get("action"))
            if identity and action and action.lower() in ("block", "unblock"):
                fields = {}
                put(fields, "blocked", action.lower() == "block", at)
                put_present(fields, "phoneNumber", text(change.get("phoneNumber")), at)
                result.append(
                    Upsert("contacts", {"sessionId": session, "contactId": identity}, fields)
                )
        return result
    if kind == "group.update":
        identity = text(p.get("id"))
        if not identity:
            return []
        for target, source in (
            ("subject", "newSubject"),
            ("lastAction", "action"),
            ("inviteLink", "inviteLink"),
        ):
            put_present(fields, target, text(p.get(source)), at)
        for target, source in (
            ("description", "newDescription"),
            ("joinApprovalRequired", "joinApprovalRequired"),
        ):
            put(fields, target, p.get(source, Unset.VALUE), at)
        group_chat: Fields = {}
        put(group_chat, "kind", "group", 0)
        put_present(group_chat, "name", text(p.get("newSubject")), at)
        return [
            Upsert("groups", {"sessionId": session, "groupId": identity}, fields),
            Upsert("chats", {"sessionId": session, "chatId": identity}, group_chat),
        ]
    if kind == "group.participant":
        group = text(p.get("id"))
        if not group:
            return []
        result = [Upsert("groups", {"sessionId": session, "groupId": group}, {})]
        for action in ("joined", "left", "promoted", "demoted"):
            for participant in records(p.get(action)):
                identity = text(participant.get("id"))
                if not identity:
                    continue
                fields = {}
                if action == "joined":
                    fields = {
                        "active": FieldWrite(True, at),
                        "role": FieldWrite("member", at),
                        "leaveReason": FieldWrite(None, at),
                    }
                elif action == "left":
                    fields = {
                        "active": FieldWrite(False, at),
                        "leaveReason": FieldWrite(text(p.get("reason")) or "left", at),
                    }
                else:
                    put(fields, "role", "admin" if action == "promoted" else "member", at)
                put_present(fields, "phoneNumber", text(participant.get("phoneNumber")), at)
                put(fields, "changedAt", at, at)
                result.append(
                    Upsert(
                        "group_participants",
                        {"sessionId": session, "groupId": group, "participantId": identity},
                        fields,
                    )
                )
        return result
    if kind == "newsletter.update":
        identity = text(p.get("id"))
        if not identity:
            return []
        put(fields, "kind", "channel", 0)
        put(fields, "muted", p.get("muted", Unset.VALUE), at)
        return [Upsert("chats", {"sessionId": session, "chatId": identity}, fields)]
    if kind == "history.sync" and p.get("kind") != "history":
        from .reduce_history import history_progress_operations, history_sync_type_name

        return history_progress_operations(
            session,
            history_sync_type_name(p.get("syncType")),
            number(p.get("chunkOrder")),
            number(p.get("progress")),
            conversation_count=number(p.get("conversationCount")),
            message_count=number(p.get("messageCount")),
            pushname_count=number(p.get("pushNameCount")),
        )
    if kind == "labels.update":
        version = to_millis(p.get("observedAt")) or at
        label = text(p.get("labelId"))
        label_action = p.get("action")
        if label_action == "label_edit" and label:
            put_present(fields, "name", text(p.get("name")) or text(p.get("label")), version)
            put_present(fields, "color", number(p.get("color")), version)
            put_present(fields, "orderIndex", number(p.get("orderIndex")), version)
            put(fields, "deleted", p.get("deleted", False), version)
            return [Upsert("labels", {"sessionId": session, "labelId": label}, fields)]
        if (
            label_action in ("label_association_chat", "label_association_message")
            and label
            and isinstance(p.get("labeled"), bool)
        ):
            association_target = (
                text(record(p.get("from")).get("id"))
                if label_action == "label_association_chat"
                else text(p.get("messageId"))
            )
            if association_target:
                put(fields, "labeled", p["labeled"], version)
                put(fields, "changedAt", version, version)
                return [
                    Upsert(
                        "label_associations",
                        {
                            "sessionId": session,
                            "labelId": label,
                            "targetKind": "chat"
                            if label_action == "label_association_chat"
                            else "message",
                            "targetId": association_target,
                        },
                        fields,
                    )
                ]
        if (
            label_action == "star"
            and text(p.get("messageId"))
            and isinstance(p.get("starred"), bool)
        ):
            put(fields, "starred", p["starred"], version)
            put_present(fields, "chatId", text(record(p.get("from")).get("id")), 0)
            return [
                Upsert(
                    "messages",
                    {"sessionId": session, "messageId": cast(str, p["messageId"])},
                    fields,
                )
            ]
    return []


def _identity(p: dict[str, Json]) -> tuple[str, str, float | None, bool, str | None] | None:
    message, chat = text(p.get("id")), text(record(p.get("conversation")).get("id"))
    if not message or not chat:
        return None
    mine = p.get("fromMe") is True
    sender = (
        SELF_ID
        if mine
        else text(record(record(p.get("conversation")).get("sender")).get("id"))
        or (None if p.get("isGroup") is True else chat)
    )
    return message, chat, to_millis(p.get("timestamp")), mine, sender


def _chat(
    session: str, p: dict[str, Json], timestamp: float | None, is_group: bool | None
) -> list[StorageOperation]:
    conversation = record(p.get("conversation"))
    chat = text(conversation.get("id"))
    if not chat:
        return []
    fields: Fields = {}
    if is_group is not None:
        put(fields, "kind", "group" if is_group else "direct", 0)
    if is_group is not True:
        for name in ("phoneNumber", "bsuid", "username"):
            put_present(fields, name, text(conversation.get(name)), timestamp or 0)
    put_present(fields, "lastMessageAt", timestamp, timestamp or 0)
    return [Upsert("chats", {"sessionId": session, "chatId": chat}, fields)]


def _content(p: dict[str, Json], version: float) -> Fields:
    result = {name: FieldWrite(None, version) for name in CONTENT_FIELDS}
    put(result, "text", text(p.get("text")) or text(record(p.get("text")).get("body")), version)
    for target, source in (
        ("caption", "caption"),
        ("mimeType", "mimeType"),
        ("fileName", "filename"),
        ("displayName", "displayName"),
        ("title", "title"),
    ):
        put(result, target, text(p.get(source)), version)
    for name in ("latitude", "longitude"):
        put(result, name, number(p.get(name)), version)
    put(result, "pollOptions", p.get("pollOptions"), version)
    extra: dict[str, Json] = {
        name: p[name]
        for name in (
            "ptt",
            "nativeFlowResponse",
            "replyChoice",
            "unavailable",
            "unavailableReason",
            "interactive",
            "referral",
        )
        if name in p
    }
    put(result, "extra", extra or None, version)
    return result


def _message(
    session: str, p: dict[str, Json], at: float, *, edit: bool = False, sent: bool = False
) -> list[StorageOperation]:
    if sent:
        p = {**p, "fromMe": True}
    identity = _identity(p)
    if identity is None:
        return []
    message, chat, timestamp, mine, sender = identity
    kind = text(p.get("type"))
    if kind in ("reaction", "revoke"):
        return _message_action(
            "message.reaction" if kind == "reaction" else "message.revoked", session, p, at
        )
    fields: Fields = {}
    put(fields, "chatId", chat, 0)
    put(fields, "fromMe", mine, 0)
    put_present(fields, "senderId", sender, 0)
    if not edit:
        put(fields, "timestamp", timestamp or 0, 0)
    ids = record(p.get("whatsapp_ids"))
    put_present(fields, "waMessageId", text(ids.get("linked_devices")), 0)
    put_present(fields, "cloudMessageId", text(ids.get("official_api")), 0)
    guard = ChatWatermarkGuard(session, chat, timestamp) if timestamp is not None else None
    group = p.get("isGroup") if isinstance(p.get("isGroup"), bool) else None
    if sent:
        put_present(fields, "type", kind, 0)
        status_writes(fields, "sent", timestamp)
        return [
            *_chat(session, p, timestamp, None),
            Upsert("messages", {"sessionId": session, "messageId": message}, fields, guard),
        ]
    put_present(fields, "quotedId", text(p.get("parentMessageId")), 0)
    if not mine:
        put_present(fields, "pushName", text(p.get("pushName")) or text(p.get("senderName")), 0)
    if edit:
        version = timestamp or at
        fields.update(_content(p, version))
        put(fields, "editedAt", version, version)
    else:
        put_present(fields, "type", kind, 0)
        fields.update(_content(p, 0))
    operations = [
        *_chat(session, p, None if edit else timestamp, cast(bool | None, group)),
        Upsert("messages", {"sessionId": session, "messageId": message}, fields, guard),
    ]
    if (
        text(p.get("media"))
        or text(p.get("mediaUrl"))
        or kind in ("image", "video", "audio", "document", "sticker")
    ):
        media: Fields = {}
        put(media, "chatId", chat, 0)
        put_present(media, "kind", kind, 0)
        for target, source in (
            ("mimeType", "mimeType"),
            ("fileName", "filename"),
            ("descriptor", "media"),
            ("downloadUrl", "mediaUrl"),
        ):
            put_present(media, target, text(p.get(source)), timestamp or at if edit else 0)
        operations.append(
            Upsert("media", {"sessionId": session, "messageId": message}, media, guard)
        )
    push_name = text(p.get("pushName")) or text(p.get("senderName"))
    if not mine and sender and push_name and timestamp is not None:
        contact: Fields = {"pushName": FieldWrite(push_name, timestamp)}
        conversation = record(p.get("conversation"))
        reference = record(conversation.get("sender")) if group else conversation
        put_present(contact, "phoneNumber", text(reference.get("phoneNumber")), timestamp)
        operations.append(Upsert("contacts", {"sessionId": session, "contactId": sender}, contact))
    return operations


def _message_action(
    kind: str, session: str, p: dict[str, Json], at: float
) -> list[StorageOperation]:
    identity = _identity(p)
    chat = text(record(p.get("conversation")).get("id"))
    if kind == "message.reaction":
        target = text(p.get("reactionTo"))
        if identity is None or not target or not identity[4]:
            return []
        version = identity[2] or at
        return [
            Upsert(
                "reactions",
                {"sessionId": session, "messageId": target, "senderId": identity[4]},
                {
                    "chatId": FieldWrite(identity[1], 0),
                    "emoji": FieldWrite(
                        p.get("reaction") if isinstance(p.get("reaction"), str) else "", version
                    ),
                    "timestamp": FieldWrite(version, version),
                },
            )
        ]
    if kind in ("message.revoked", "message.delete"):
        target = text(p.get("revokedId")) if kind == "message.revoked" else text(p.get("id"))
        if not target or not chat or kind == "message.revoked" and identity is None:
            return []
        fields = cleared_content()
        put(fields, "chatId", chat, 0)
        put(
            fields,
            "revokedAt" if kind == "message.revoked" else "deletedAt",
            identity[2] or at if identity is not None and kind == "message.revoked" else at,
            FINAL_VERSION,
        )
        key = {"sessionId": session, "messageId": target}
        return [Upsert("messages", key, fields), Upsert("media", key, cleared_media())]
    if kind == "message.ack":
        status = ack_status(text(p.get("type")))
        if not status or not chat:
            return []
        timestamp = to_millis(p.get("timestamp")) or at
        recipient = (
            text(record(p.get("from")).get("id")) or text(record(p.get("sender")).get("id")) or chat
        )
        result: list[StorageOperation] = []
        for entry in records(p.get("messages")):
            message = text(entry.get("id"))
            if message:
                fields = {"chatId": FieldWrite(chat, 0)}
                status_writes(fields, status, timestamp)
                result.append(
                    Upsert("messages", {"sessionId": session, "messageId": message}, fields)
                )
                receipt = {"chatId": FieldWrite(chat, 0)}
                status_writes(receipt, status, timestamp)
                receipt["timestamp"] = receipt.pop("statusAt")
                result.append(
                    Upsert(
                        "receipts",
                        {"sessionId": session, "messageId": message, "recipientId": recipient},
                        receipt,
                    )
                )
        return result
    if kind == "message.vote":
        message, voter = text(p.get("pollMessageId")), text(record(p.get("voter")).get("id"))
        if not message or not voter or not chat:
            return []
        version = to_millis(p.get("timestamp")) or at
        return [
            Upsert(
                "poll_votes",
                {"sessionId": session, "messageId": message, "voterId": voter},
                {
                    "chatId": FieldWrite(chat, 0),
                    "selectedHashes": FieldWrite(p.get("selectedHashes", []), version),
                    "timestamp": FieldWrite(version, version),
                },
            )
        ]
    return []
