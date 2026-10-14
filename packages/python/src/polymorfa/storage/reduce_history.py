"""Pinned history reduction with scoped native IDs and optional Polymorfa identity mapping."""

from __future__ import annotations

import base64
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from typing import cast

from ..transport import Json
from .core import (
    FINAL_VERSION,
    ChatWatermarkGuard,
    FieldWrite,
    OperationBatch,
    StorageOperation,
    Upsert,
)
from .reducer_common import (
    SELF_ID,
    Fields,
    chat_kind,
    cleared_content,
    cleared_media,
    number,
    put,
    put_present,
    record,
    records,
    status_writes,
    text,
    to_millis,
)

HISTORY_SYNC_TYPES = {
    "INITIAL_BOOTSTRAP": 0,
    "INITIAL_STATUS_V3": 1,
    "FULL": 2,
    "RECENT": 3,
    "PUSH_NAME": 4,
    "NON_BLOCKING_DATA": 5,
    "ON_DEMAND": 6,
}
_STATUS_NAMES = {
    "ERROR": 0,
    "PENDING": 1,
    "SERVER_ACK": 2,
    "DELIVERY_ACK": 3,
    "READ": 4,
    "PLAYED": 5,
}
_STATUSES = {0: "failed", 1: "pending", 2: "sent", 3: "delivered", 4: "read", 5: "played"}


def history_sync_type_name(value: object) -> str:
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return next(
            (name for name, code in HISTORY_SYNC_TYPES.items() if code == value), str(value)
        )
    if isinstance(value, str) and value:
        return value.upper() if value.upper() in HISTORY_SYNC_TYPES else value
    return "UNKNOWN"


def normalize_jid(jid: str) -> str:
    user, separator, server = jid.partition("@")
    return (
        (user.split(":")[0].split("_")[0] + separator + server).lower()
        if separator
        else jid.lower()
    )


def _enum(value: object, names: Mapping[str, int]) -> int | None:
    if isinstance(value, str):
        return names.get(value.upper())
    numeric = number(value)
    return int(numeric) if numeric is not None and float(numeric).is_integer() else None


def _binary_text(value: object) -> str | None:
    return base64.b64encode(value).decode() if isinstance(value, bytes) and value else text(value)


def history_progress_operations(
    session: str,
    sync_type: str,
    chunk_order: float | None,
    progress: float | None,
    *,
    conversation_count: float | None = None,
    message_count: float | None = None,
    pushname_count: float | None = None,
) -> list[StorageOperation]:
    operations: list[StorageOperation] = []
    if chunk_order is not None:
        fields: Fields = {}
        for name, value in (
            ("progress", progress),
            ("conversationCount", conversation_count),
            ("messageCount", message_count),
            ("pushnameCount", pushname_count),
        ):
            put_present(fields, name, value, 0)
        operations.append(
            Upsert(
                "history_chunks",
                {
                    "sessionId": session,
                    "syncType": sync_type,
                    "chunkOrder": str(int(chunk_order))
                    if float(chunk_order).is_integer()
                    else str(chunk_order),
                },
                fields,
            )
        )
    fields = {}
    put_present(fields, "progress", progress, progress or 0)
    put_present(fields, "lastChunkOrder", chunk_order, chunk_order or 0)
    operations.append(
        Upsert("history_progress", {"sessionId": session, "syncType": sync_type}, fields)
    )
    return operations


@dataclass(frozen=True)
class HistoryMessageIdentity:
    native_id: str
    id: str
    chat_id: str
    from_me: bool | None = None


@dataclass(frozen=True)
class HistoryIdentityIndex:
    conversations: Mapping[str, str] = field(default_factory=dict)
    contacts: Mapping[str, str] = field(default_factory=dict)
    messages: Sequence[HistoryMessageIdentity] = ()


def history_identity_index(payload: Mapping[str, Json]) -> HistoryIdentityIndex:
    result = []
    for message in records(payload.get("messages")):
        native = text(record(message.get("whatsapp_ids")).get("linked_devices"))
        chat = text(record(message.get("conversation")).get("id"))
        identity = text(message.get("id"))
        if native and chat and identity:
            result.append(
                HistoryMessageIdentity(
                    native,
                    identity,
                    chat,
                    cast(bool, message["fromMe"])
                    if isinstance(message.get("fromMe"), bool)
                    else None,
                )
            )
    return HistoryIdentityIndex(messages=result)


class HistoryKeys:
    def __init__(
        self, index: HistoryIdentityIndex | None = None, chunk: Mapping[str, Json] | None = None
    ) -> None:
        index = index or HistoryIdentityIndex()
        self._chats = {
            normalize_jid(jid): identity for jid, identity in index.conversations.items()
        }
        self._contacts = {normalize_jid(jid): identity for jid, identity in index.contacts.items()}
        self._messages: dict[str, list[HistoryMessageIdentity]] = {}
        for message in index.messages:
            self._messages.setdefault(message.native_id, []).append(message)
        for conversation in records((chunk or {}).get("conversations")):
            jid = text(conversation.get("id"))
            if not jid or normalize_jid(jid) in self._chats:
                continue
            found = set()
            for entry in records(conversation.get("messages")):
                key = record(record(entry.get("message")).get("key"))
                native = text(key.get("id"))
                mine = key.get("fromMe")
                for candidate in self._messages.get(native or "", []):
                    if candidate.from_me is None or mine is None or candidate.from_me == mine:
                        found.add(candidate.chat_id)
            if len(found) == 1:
                self._chats[normalize_jid(jid)] = next(iter(found))

    def chat_id(self, jid: str) -> str:
        bare = normalize_jid(jid)
        return self._chats.get(bare, "wa:" + bare)

    def contact_id(self, jid: str) -> str:
        bare = normalize_jid(jid)
        return (
            self._contacts.get(bare)
            or (self._chats.get(bare) if chat_kind(bare) == "direct" else None)
            or "wa:" + bare
        )

    def message_id(self, key: Mapping[str, Json], chat_jid: str) -> str | None:
        native = text(key.get("id"))
        if not native:
            return None
        jid = normalize_jid(text(key.get("remoteJid")) or chat_jid)
        mine = key.get("fromMe") is True
        chat = self.chat_id(jid)
        candidates = [
            item
            for item in self._messages.get(native, [])
            if item.chat_id == chat and (item.from_me is None or item.from_me == mine)
        ]
        if len(candidates) == 1:
            return candidates[0].id
        sender = (
            normalize_jid(cast(str, key["participant"]))
            if not mine and chat_kind(jid) == "group" and text(key.get("participant"))
            else ""
        )
        return f"wa:{jid}:{int(mine)}:{sender}:{native}"


def _unwrap(content: Mapping[str, Json]) -> dict[str, Json]:
    current = dict(content)
    for _ in range(5):
        inner = next(
            (
                record(current.get(name)).get("message")
                for name in (
                    "ephemeralMessage",
                    "viewOnceMessage",
                    "viewOnceMessageV2",
                    "documentWithCaptionMessage",
                    "editedMessage",
                )
                if record(current.get(name)).get("message")
            ),
            None,
        )
        if not isinstance(inner, dict):
            break
        current = inner
    return current


def _content(
    content: Mapping[str, Json], version: float
) -> tuple[str, Fields, str | None, tuple[str, dict[str, Json]] | None] | None:
    fields = cleared_content()
    fields = {name: FieldWrite(None, version) for name in fields}
    quoted = None
    media = None
    if text(content.get("conversation")):
        kind = "text"
        put(fields, "text", content["conversation"], version)
    elif content.get("extendedTextMessage"):
        kind = "text"
        message = record(content["extendedTextMessage"])
        put(fields, "text", text(message.get("text")), version)
        quoted = text(record(message.get("contextInfo")).get("stanzaId"))
    else:
        entry = next(
            (
                (name, kind)
                for name, kind in (
                    ("imageMessage", "image"),
                    ("videoMessage", "video"),
                    ("ptvMessage", "video"),
                    ("audioMessage", "audio"),
                    ("documentMessage", "document"),
                    ("stickerMessage", "sticker"),
                )
                if content.get(name)
            ),
            None,
        )
        if entry is not None:
            field_name, kind = entry
            message = record(content[field_name])
            for target, source in (
                ("caption", "caption"),
                ("mimeType", "mimetype"),
                ("fileName", "fileName"),
                ("title", "title"),
            ):
                put(fields, target, text(message.get(source)), version)
            put(fields, "extra", {"ptt": True} if message.get("ptt") is True else None, version)
            quoted = text(record(message.get("contextInfo")).get("stanzaId"))
            media = (kind, message)
        elif content.get("locationMessage"):
            kind = "location"
            message = record(content["locationMessage"])
            put(fields, "latitude", message.get("degreesLatitude"), version)
            put(fields, "longitude", message.get("degreesLongitude"), version)
            put(fields, "title", text(message.get("name")), version)
            quoted = text(record(message.get("contextInfo")).get("stanzaId"))
        elif content.get("contactMessage"):
            kind = "contact"
            put(
                fields,
                "displayName",
                text(record(content["contactMessage"]).get("displayName")),
                version,
            )
        else:
            poll = next(
                (
                    record(content[name])
                    for name in (
                        "pollCreationMessage",
                        "pollCreationMessageV2",
                        "pollCreationMessageV3",
                    )
                    if content.get(name)
                ),
                None,
            )
            if poll is None:
                return None
            kind = "poll"
            put(fields, "title", text(poll.get("name")), version)
            put(
                fields,
                "pollOptions",
                [
                    {"name": cast(str, option["optionName"])}
                    for option in records(poll.get("options"))
                    if text(option.get("optionName"))
                ],
                version,
            )
            quoted = text(record(poll.get("contextInfo")).get("stanzaId"))
    return kind, fields, quoted, media


def reduce_web_message_info(
    info: Mapping[str, Json], *, session_id: str, keys: HistoryKeys, chat_jid: str = ""
) -> list[StorageOperation]:
    key = record(info.get("key"))
    jid = text(key.get("remoteJid")) or chat_jid
    if not jid:
        return []
    identity = keys.message_id(key, jid)
    if not identity:
        return []
    chat = keys.chat_id(jid)
    mine = key.get("fromMe") is True
    group = chat_kind(normalize_jid(jid)) == "group"
    sender_jid = (
        None
        if mine
        else text(key.get("participant"))
        or text(info.get("participant"))
        or (None if group else jid)
    )
    sender = SELF_ID if mine else keys.contact_id(sender_jid) if sender_jid else None
    timestamp = to_millis(info.get("messageTimestamp"))
    guard = ChatWatermarkGuard(session_id, chat, timestamp) if timestamp is not None else None
    content = _unwrap(record(info.get("message")))
    protocol = record(content.get("protocolMessage"))
    message_key = {"sessionId": session_id, "messageId": identity}
    if protocol:
        target = keys.message_id(record(protocol.get("key")), jid)
        if not target:
            return []
        target_key = {"sessionId": session_id, "messageId": target}
        code = _enum(protocol.get("type"), {"REVOKE": 0, "MESSAGE_EDIT": 14})
        if code == 0:
            fields = cleared_content()
            put(fields, "chatId", chat, 0)
            put(fields, "revokedAt", timestamp or 0, FINAL_VERSION)
            return [
                Upsert("messages", target_key, fields),
                Upsert("media", target_key, cleared_media()),
            ]
        if code == 14 and protocol.get("editedMessage"):
            version = to_millis(protocol.get("timestampMs")) or timestamp or 0
            mapped = _content(_unwrap(record(protocol.get("editedMessage"))), version)
            if mapped is not None:
                fields = mapped[1]
                put(fields, "chatId", chat, 0)
                put(fields, "editedAt", version, version)
                return [Upsert("messages", target_key, fields)]
        return []
    reaction = record(content.get("reactionMessage"))
    if reaction:
        target = keys.message_id(record(reaction.get("key")), jid)
        if not target or not sender:
            return []
        version = to_millis(reaction.get("senderTimestampMs")) or timestamp or 0
        return [
            Upsert(
                "reactions",
                {"sessionId": session_id, "messageId": target, "senderId": sender},
                {
                    "chatId": FieldWrite(chat, 0),
                    "emoji": FieldWrite(reaction.get("text") or "", version),
                    "timestamp": FieldWrite(version, version),
                },
            )
        ]
    fields = {}
    put(fields, "chatId", chat, 0)
    put(fields, "fromMe", mine, 0)
    put_present(fields, "senderId", sender, 0)
    put_present(fields, "senderJid", normalize_jid(sender_jid) if sender_jid else None, 0)
    put(fields, "timestamp", timestamp or 0, 0)
    put_present(fields, "waMessageId", text(key.get("id")), 0)
    if not mine:
        put_present(fields, "pushName", text(info.get("pushName")), 0)
    if isinstance(info.get("starred"), bool):
        put(fields, "starred", info["starred"], 0)
    status = _STATUSES.get(
        _enum(info.get("status"), _STATUS_NAMES)
        or (-1 if _enum(info.get("status"), _STATUS_NAMES) is None else 0)
    )
    if mine and status:
        status_writes(fields, status)
    operations: list[StorageOperation] = []
    media = None
    if _enum(info.get("messageStubType"), {"REVOKE": 1}) == 1:
        fields.update(cleared_content())
        put(
            fields,
            "revokedAt",
            to_millis(info.get("revokeMessageTimestamp")) or timestamp or 0,
            FINAL_VERSION,
        )
        operations.append(Upsert("media", message_key, cleared_media()))
    elif content:
        mapped = _content(content, 0)
        if mapped is not None:
            kind, mapped_fields, quoted, media = mapped
            fields.update(mapped_fields)
            put(fields, "type", kind, 0)
            put_present(fields, "quotedId", quoted, 0)
        else:
            put(fields, "type", "unknown", 0)
    operations.append(Upsert("messages", message_key, fields, guard))
    if media:
        kind, message = media
        media_fields: Fields = {"chatId": FieldWrite(chat, 0), "kind": FieldWrite(kind, 0)}
        for target, source in (
            ("mimeType", "mimetype"),
            ("fileName", "fileName"),
            ("fileSha256", "fileSha256"),
            ("fileEncSha256", "fileEncSha256"),
            ("directPath", "directPath"),
            ("mediaKey", "mediaKey"),
        ):
            put_present(
                media_fields,
                target,
                _binary_text(message.get(source))
                if target in ("mediaKey", "fileSha256", "fileEncSha256")
                else text(message.get(source)),
                0,
            )
        put_present(media_fields, "fileLength", number(message.get("fileLength")), 0)
        put_present(
            media_fields, "mediaKeyTimestamp", to_millis(message.get("mediaKeyTimestamp")), 0
        )
        operations.append(Upsert("media", message_key, media_fields, guard))
    for receipt in records(info.get("userReceipt")):
        user = text(receipt.get("userJid"))
        state = next(
            (
                (name, to_millis(receipt.get(source)))
                for name, source in (
                    ("played", "playedTimestamp"),
                    ("read", "readTimestamp"),
                    ("delivered", "receiptTimestamp"),
                )
                if to_millis(receipt.get(source)) is not None
            ),
            None,
        )
        if user and state:
            receipt_fields = {"chatId": FieldWrite(chat, 0)}
            status_writes(receipt_fields, state[0], state[1])
            receipt_fields["timestamp"] = receipt_fields.pop("statusAt")
            operations.append(
                Upsert(
                    "receipts",
                    {
                        "sessionId": session_id,
                        "messageId": identity,
                        "recipientId": keys.contact_id(user),
                    },
                    receipt_fields,
                    guard,
                )
            )
    for reaction in records(info.get("reactions")):
        reaction_key = record(reaction.get("key"))
        reactor = (
            SELF_ID
            if reaction_key.get("fromMe")
            else text(reaction_key.get("participant")) or (None if group else jid)
        )
        if reactor:
            version = to_millis(reaction.get("senderTimestampMs")) or timestamp or 0
            operations.append(
                Upsert(
                    "reactions",
                    {
                        "sessionId": session_id,
                        "messageId": identity,
                        "senderId": SELF_ID if reactor == SELF_ID else keys.contact_id(reactor),
                    },
                    {
                        "chatId": FieldWrite(chat, 0),
                        "emoji": FieldWrite(reaction.get("text") or "", version),
                        "timestamp": FieldWrite(version, version),
                    },
                    guard,
                )
            )
    if not mine and sender_jid and text(info.get("pushName")) and timestamp is not None:
        operations.append(
            Upsert(
                "contacts",
                {"sessionId": session_id, "contactId": keys.contact_id(sender_jid)},
                {
                    "jid": FieldWrite(normalize_jid(sender_jid), 0),
                    "pushName": FieldWrite(info["pushName"], timestamp),
                },
            )
        )
    return operations


def _conversation(
    session: str, conversation: dict[str, Json], keys: HistoryKeys
) -> list[StorageOperation]:
    jid = text(conversation.get("id"))
    if not jid:
        return []
    bare = normalize_jid(jid)
    chat = keys.chat_id(bare)
    kind = chat_kind(bare)
    last = to_millis(conversation.get("lastMsgTimestamp"))
    snapshot = max(to_millis(conversation.get("conversationTimestamp")) or 0, last or 0)
    fields: Fields = {"jid": FieldWrite(bare, 0)}
    put_present(fields, "kind", kind, 0)
    put_present(
        fields,
        "name",
        text(conversation.get("name")) or text(conversation.get("displayName")),
        snapshot,
    )
    put_present(fields, "username", text(conversation.get("username")), snapshot)
    if kind == "direct" and text(conversation.get("pnJid")):
        put(
            fields,
            "phoneNumber",
            "+" + normalize_jid(cast(str, conversation["pnJid"])).split("@")[0],
            snapshot,
        )
    for target, source in (
        ("archived", "archived"),
        ("markedUnread", "markedAsUnread"),
        ("unreadCount", "unreadCount"),
        ("readOnly", "readOnly"),
        ("ephemeralExpiration", "ephemeralExpiration"),
    ):
        put_present(fields, target, conversation.get(source), snapshot)
    pinned, mute = number(conversation.get("pinned")), number(conversation.get("muteEndTime"))
    if pinned is not None:
        put(fields, "pinned", pinned > 0, snapshot)
    if mute is not None:
        put(fields, "muted", mute != 0, snapshot)
        put(fields, "muteEndAt", to_millis(mute) if mute > 0 else None, snapshot)
    put_present(fields, "lastMessageAt", last, last or 0)
    operations: list[StorageOperation] = [
        Upsert("chats", {"sessionId": session, "chatId": chat}, fields)
    ]
    if kind == "group":
        group: Fields = {"jid": FieldWrite(bare, 0)}
        put_present(group, "subject", text(conversation.get("name")), snapshot)
        put_present(group, "description", text(conversation.get("description")), snapshot)
        put_present(group, "createdAt", to_millis(conversation.get("createdAt")), 0)
        creator = text(conversation.get("createdBy"))
        put_present(group, "createdBy", normalize_jid(creator) if creator else None, 0)
        operations.append(Upsert("groups", {"sessionId": session, "groupId": chat}, group))
        for participant in records(conversation.get("participant")):
            user = text(participant.get("userJid"))
            if user:
                role = {0: "member", 1: "admin", 2: "superadmin"}.get(
                    _enum(participant.get("rank"), {"REGULAR": 0, "ADMIN": 1, "SUPERADMIN": 2})
                    or 0,
                    "member",
                )
                operations.append(
                    Upsert(
                        "group_participants",
                        {
                            "sessionId": session,
                            "groupId": chat,
                            "participantId": keys.contact_id(user),
                        },
                        {
                            "jid": FieldWrite(normalize_jid(user), 0),
                            "role": FieldWrite(role, snapshot),
                            "active": FieldWrite(True, snapshot),
                            "changedAt": FieldWrite(snapshot, snapshot),
                        },
                    )
                )
    for entry in records(conversation.get("messages")):
        if entry.get("message"):
            operations.extend(
                reduce_web_message_info(
                    record(entry["message"]), session_id=session, keys=keys, chat_jid=bare
                )
            )
    return operations


def reduce_history_chunk(
    session_id: str,
    chunk: object,
    *,
    identities: HistoryIdentityIndex | None = None,
    chunk_id: str | None = None,
) -> OperationBatch:
    if not isinstance(chunk, Mapping):
        from ..history import HistorySync, history_sync_to_dict

        if not isinstance(chunk, HistorySync):
            raise TypeError("A decoded HistorySync protobuf or mapping is required")
        data = history_sync_to_dict(chunk)
    else:
        data = cast(dict[str, Json], dict(chunk))
    keys = HistoryKeys(identities, data)
    operations: list[StorageOperation] = []
    for conversation in records(data.get("conversations")):
        operations.extend(_conversation(session_id, conversation, keys))
    for pushname in records(data.get("pushnames")):
        jid, name = text(pushname.get("id")), text(pushname.get("pushname"))
        if jid and name and chat_kind(normalize_jid(jid)) == "direct":
            operations.append(
                Upsert(
                    "contacts",
                    {"sessionId": session_id, "contactId": keys.contact_id(jid)},
                    {"jid": FieldWrite(normalize_jid(jid), 0), "pushName": FieldWrite(name, 0)},
                )
            )
    for mapping in records(data.get("phoneNumberToLidMappings")):
        pn, lid = text(mapping.get("pnJid")), text(mapping.get("lidJid"))
        if pn and lid:
            for jid in (pn, lid):
                operations.append(
                    Upsert(
                        "contacts",
                        {"sessionId": session_id, "contactId": keys.contact_id(jid)},
                        {
                            "phoneNumber": FieldWrite("+" + normalize_jid(pn).split("@")[0], 0),
                            "lidJid": FieldWrite(normalize_jid(lid), 0),
                        },
                    )
                )
    for past in records(data.get("pastParticipants")):
        group = text(past.get("groupJid"))
        if group:
            for participant in records(past.get("pastParticipants")):
                user = text(participant.get("userJid"))
                if user:
                    at = to_millis(participant.get("leaveTs")) or 0
                    reason = _enum(participant.get("leaveReason"), {"LEFT": 0, "REMOVED": 1})
                    operations.append(
                        Upsert(
                            "group_participants",
                            {
                                "sessionId": session_id,
                                "groupId": keys.chat_id(group),
                                "participantId": keys.contact_id(user),
                            },
                            {
                                "jid": FieldWrite(normalize_jid(user), 0),
                                "active": FieldWrite(False, at),
                                "leaveReason": FieldWrite("removed" if reason == 1 else "left", at),
                                "changedAt": FieldWrite(at, at),
                            },
                        )
                    )
    conversations = records(data.get("conversations"))
    operations.extend(
        history_progress_operations(
            session_id,
            history_sync_type_name(data.get("syncType")),
            number(data.get("chunkOrder")),
            number(data.get("progress")),
            conversation_count=len(conversations),
            message_count=sum(len(records(item.get("messages"))) for item in conversations),
            pushname_count=len(records(data.get("pushnames"))),
        )
    )
    return OperationBatch(
        session_id,
        operations,
        "history:" + chunk_id if chunk_id is not None else None,
        "history.chunk",
    )
