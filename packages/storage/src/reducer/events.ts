import type {
  ChatArchivePayload,
  ChatMutePayload,
  ChatReadPayload,
  ContactUpdatePayload,
  GroupParticipantPayload,
  GroupUpdatePayload,
  IdentityReference,
  BlocklistUpdatePayload,
  LabelsUpdatePayload,
  LinkedHistorySyncPayload,
  MessageAckPayload,
  MessageDeletePayload,
  MessageSentPayload,
  NewsletterUpdatePayload,
  PollVotePayload,
  RuntimeSessionStatusPayload,
  SessionConnectedPayload,
  SessionLoggedOutPayload,
  WebhookEvent,
} from "@polymorfa/sdk";

import { FINAL_VERSION } from "../merge.js";
import type {
  ChatWatermarkGuard,
  JsonValue,
  OperationBatch,
  StorageOperation,
} from "../types.js";
import {
  chatKind,
  clearedContent,
  clearedMedia,
  type Fields,
  finite,
  isoMillis,
  type MessageStatus,
  nonEmpty,
  put,
  SELF_ID,
  statusWrites,
  toMillis,
  upsert,
} from "./common.js";
import { historyProgressOperations, historySyncTypeName } from "./history.js";

/**
 * Event types whose payload changes stored state. Every other event type
 * maps to an empty batch (calls, campaigns, billing, presence and similar
 * events are not WhatsApp chat data).
 */
export const STORED_EVENT_TYPES = [
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
] as const;

type Payload = Record<string, unknown>;

/** A webhook `conversation`: the chat identity, plus the sender in groups. */
type ConversationReference = IdentityReference & {
  readonly sender?: IdentityReference;
};

/**
 * Maps one webhook or event-stream event to storage operations. Pure and
 * deterministic: the same event always produces the same batch. The batch
 * carries the event ID, so applying it twice is a no-op.
 */
export function reduceEvent(event: WebhookEvent): OperationBatch {
  const sessionId = event.session;
  const at = isoMillis(event.timestamp);
  const operations = eventOperations(event, sessionId, at);
  return {
    sessionId,
    eventId: event.id,
    eventType: event.event,
    operations,
  };
}

function eventOperations(
  event: WebhookEvent,
  sessionId: string,
  at: number,
): StorageOperation[] {
  const payload = (event.payload ?? {}) as Payload;
  switch (event.event) {
    case "message.received":
    case "message.update":
      return messageOperations(sessionId, payload, at, {
        edit: payload.edited === true,
      });
    case "message.edited":
      return messageOperations(sessionId, payload, at, { edit: true });
    case "message.sent":
      return sentOperations(sessionId, payload as unknown as MessageSentPayload);
    case "message.reaction":
      return reactionOperations(sessionId, payload, at);
    case "message.revoked":
      return revokeOperations(sessionId, payload, at);
    case "message.delete":
      return deleteForMeOperations(
        sessionId,
        payload as unknown as MessageDeletePayload,
        at,
      );
    case "message.ack":
      return ackOperations(sessionId, payload as unknown as MessageAckPayload, at);
    case "message.vote":
      return voteOperations(sessionId, payload as unknown as PollVotePayload, at);
    case "chat.archive": {
      const p = payload as unknown as ChatArchivePayload;
      const fields: Fields = {};
      put(fields, "archived", p.archive, at);
      put(fields, "pinned", p.pinned, at);
      return chatPatch(sessionId, p.from, fields, at);
    }
    case "chat.mute": {
      const p = payload as unknown as ChatMutePayload;
      const fields: Fields = {};
      put(fields, "muted", p.muted, at);
      put(
        fields,
        "muteEndAt",
        p.muted ? (toMillis(p.muteEndTimestamp) ?? null) : null,
        at,
      );
      return chatPatch(sessionId, p.from, fields, at);
    }
    case "chat.read": {
      const p = payload as unknown as ChatReadPayload;
      const fields: Fields = {};
      put(fields, "markedUnread", !p.read, at);
      if (p.read) put(fields, "unreadCount", 0, at);
      return chatPatch(sessionId, p.from, fields, at);
    }
    case "chat.clear":
    case "chat.delete": {
      const from = (payload as { from?: IdentityReference }).from;
      const chatId = nonEmpty(from?.id);
      if (!chatId || at === 0) return [];
      const fields: Fields = {};
      put(fields, event.event === "chat.clear" ? "clearedAt" : "deletedAt", at, at);
      return [
        upsert("chats", { sessionId, chatId }, fields),
        { kind: "clearChat", sessionId, chatId, upTo: at },
      ];
    }
    case "contact.update":
      return contactOperations(
        sessionId,
        payload as unknown as ContactUpdatePayload,
        at,
      );
    case "blocklist.update":
      return blocklistOperations(
        sessionId,
        payload as unknown as BlocklistUpdatePayload,
        at,
      );
    case "group.update":
      return groupUpdateOperations(
        sessionId,
        payload as unknown as GroupUpdatePayload,
        at,
      );
    case "group.participant":
      return participantOperations(
        sessionId,
        payload as unknown as GroupParticipantPayload,
        at,
      );
    case "labels.update":
      return labelOperations(
        sessionId,
        payload as unknown as LabelsUpdatePayload,
        at,
      );
    case "newsletter.update": {
      const p = payload as unknown as NewsletterUpdatePayload;
      const chatId = nonEmpty(p.id);
      if (!chatId) return [];
      const fields: Fields = {};
      put(fields, "kind", "channel", 0);
      put(fields, "muted", p.muted, at);
      return [upsert("chats", { sessionId, chatId }, fields)];
    }
    case "session.connected": {
      const p = payload as unknown as SessionConnectedPayload;
      const fields: Fields = {};
      put(fields, "connected", true, at);
      put(fields, "phoneNumber", nonEmpty(p.phoneNumber), at);
      put(fields, "waId", nonEmpty(p.id), at);
      put(fields, "pushName", nonEmpty(p.pushName), at);
      put(fields, "phonePlatform", nonEmpty(p.phonePlatform), at);
      put(fields, "accountType", nonEmpty(p.accountType), at);
      put(fields, "businessName", nonEmpty(p.businessName), at);
      return [upsert("sessions", { sessionId }, fields)];
    }
    case "session.status": {
      const p = payload as unknown as RuntimeSessionStatusPayload;
      if (typeof p.status !== "string") return [];
      const fields: Fields = {};
      put(fields, "status", p.status, at);
      put(fields, "statusReason", p.statusReason ?? null, at);
      return [upsert("sessions", { sessionId }, fields)];
    }
    case "session.logged_out": {
      const p = payload as unknown as SessionLoggedOutPayload;
      const fields: Fields = {};
      put(fields, "connected", false, at);
      put(fields, "loggedOutReason", nonEmpty(p.reason), at);
      put(fields, "loggedOutCode", finite(p.code), at);
      return [upsert("sessions", { sessionId }, fields)];
    }
    case "history.sync": {
      if ((payload as { kind?: unknown }).kind === "history") return [];
      const p = payload as unknown as LinkedHistorySyncPayload;
      return historyProgressOperations(sessionId, {
        syncType: historySyncTypeName(p.syncType),
        chunkOrder: finite(p.chunkOrder),
        progress: finite(p.progress),
        conversationCount: finite(p.conversationCount),
        messageCount: finite(p.messageCount),
        pushnameCount: finite(p.pushNameCount),
      });
    }
    default:
      return [];
  }
}

interface MessageIdentity {
  readonly messageId: string;
  readonly chatId: string;
  readonly timestamp: number | undefined;
  readonly fromMe: boolean;
  readonly senderId: string | undefined;
}

function messageIdentity(payload: Payload): MessageIdentity | undefined {
  const messageId = nonEmpty(payload.id);
  const conversation = payload.conversation as ConversationReference | undefined;
  const chatId = nonEmpty(conversation?.id);
  if (!messageId || !chatId) return undefined;
  const raw = payload.timestamp;
  const timestamp = toMillis(
    typeof raw === "string" ? Number(raw) : (raw as number | undefined),
  );
  const fromMe = payload.fromMe === true;
  const senderId = fromMe
    ? SELF_ID
    : (nonEmpty(conversation?.sender?.id) ?? (isGroupPayload(payload) ? undefined : chatId));
  return { messageId, chatId, timestamp, fromMe, senderId };
}

function isGroupPayload(payload: Payload): boolean {
  return payload.isGroup === true;
}

function guardFor(
  sessionId: string,
  identity: MessageIdentity,
): ChatWatermarkGuard | undefined {
  return identity.timestamp === undefined
    ? undefined
    : { sessionId, chatId: identity.chatId, timestamp: identity.timestamp };
}

function whatsappIds(payload: Payload): {
  linked?: string;
  official?: string;
} {
  const ids = payload.whatsapp_ids as
    | { linked_devices?: string; official_api?: string }
    | undefined;
  return {
    ...(nonEmpty(ids?.linked_devices) ? { linked: ids!.linked_devices! } : {}),
    ...(nonEmpty(ids?.official_api) ? { official: ids!.official_api! } : {}),
  };
}

function json(value: unknown): JsonValue | undefined {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}

function contentFields(payload: Payload, version: number): Fields {
  const fields: Fields = {};
  const cloudText = (payload.text as { body?: unknown } | undefined)?.body;
  put(fields, "text", nonEmpty(payload.text) ?? nonEmpty(cloudText) ?? null, version);
  put(fields, "caption", nonEmpty(payload.caption) ?? null, version);
  put(fields, "mimeType", nonEmpty(payload.mimeType) ?? null, version);
  put(fields, "fileName", nonEmpty(payload.filename) ?? null, version);
  put(fields, "latitude", finite(payload.latitude) ?? null, version);
  put(fields, "longitude", finite(payload.longitude) ?? null, version);
  put(fields, "displayName", nonEmpty(payload.displayName) ?? null, version);
  put(fields, "title", nonEmpty(payload.title) ?? null, version);
  put(fields, "pollOptions", json(payload.pollOptions) ?? null, version);
  const extra: Record<string, unknown> = {};
  for (const name of [
    "ptt",
    "nativeFlowResponse",
    "replyChoice",
    "unavailable",
    "unavailableReason",
    "interactive",
    "referral",
  ])
    if (payload[name] !== undefined) extra[name] = payload[name];
  put(
    fields,
    "extra",
    Object.keys(extra).length > 0 ? (json(extra) ?? null) : null,
    version,
  );
  return fields;
}

function chatFromConversation(
  sessionId: string,
  conversation: ConversationReference | undefined,
  isGroup: boolean | undefined,
  timestamp: number | undefined,
): StorageOperation[] {
  const chatId = nonEmpty(conversation?.id);
  if (!chatId) return [];
  const fields: Fields = {};
  const version = timestamp ?? 0;
  put(fields, "kind", chatKind(undefined, isGroup), 0);
  if (isGroup !== true) {
    put(fields, "phoneNumber", nonEmpty(conversation?.phoneNumber), version);
    put(fields, "bsuid", nonEmpty(conversation?.bsuid), version);
    put(fields, "username", nonEmpty(conversation?.username), version);
  }
  if (timestamp !== undefined) put(fields, "lastMessageAt", timestamp, timestamp);
  return [upsert("chats", { sessionId, chatId }, fields)];
}

function messageOperations(
  sessionId: string,
  payload: Payload,
  at: number,
  options: { readonly edit: boolean },
): StorageOperation[] {
  const identity = messageIdentity(payload);
  if (!identity) return [];
  const conversation = payload.conversation as ConversationReference;
  const isGroup =
    typeof payload.isGroup === "boolean" ? payload.isGroup : undefined;
  const type = nonEmpty(payload.type);
  if (type === "reaction") return reactionOperations(sessionId, payload, at);
  if (type === "revoke") return revokeOperations(sessionId, payload, at);
  const guard = guardFor(sessionId, identity);
  const editVersion = identity.timestamp ?? at;
  const fields: Fields = {};
  put(fields, "chatId", identity.chatId, 0);
  put(fields, "fromMe", identity.fromMe, 0);
  put(fields, "senderId", identity.senderId, 0);
  put(fields, "timestamp", options.edit ? undefined : (identity.timestamp ?? 0), 0);
  const ids = whatsappIds(payload);
  put(fields, "waMessageId", ids.linked, 0);
  put(fields, "cloudMessageId", ids.official, 0);
  put(fields, "quotedId", nonEmpty(payload.parentMessageId), 0);
  if (!identity.fromMe)
    put(fields, "pushName", nonEmpty(payload.pushName) ?? nonEmpty(payload.senderName), 0);
  if (options.edit) {
    Object.assign(fields, contentFields(payload, editVersion));
    put(fields, "editedAt", editVersion, editVersion);
  } else {
    put(fields, "type", type, 0);
    Object.assign(fields, contentFields(payload, 0));
  }
  const operations: StorageOperation[] = [
    ...chatFromConversation(
      sessionId,
      conversation,
      isGroup,
      options.edit ? undefined : identity.timestamp,
    ),
    upsert(
      "messages",
      { sessionId, messageId: identity.messageId },
      fields,
      guard,
    ),
  ];
  const media = mediaFields(payload, identity.chatId, options.edit ? editVersion : 0);
  if (media)
    operations.push(
      upsert("media", { sessionId, messageId: identity.messageId }, media, guard),
    );
  const pushName = nonEmpty(payload.pushName) ?? nonEmpty(payload.senderName);
  const contactId = identity.fromMe ? undefined : identity.senderId;
  if (contactId && pushName && identity.timestamp !== undefined) {
    const contact: Fields = {};
    put(contact, "pushName", pushName, identity.timestamp);
    const reference = isGroup ? conversation.sender : conversation;
    put(contact, "phoneNumber", nonEmpty(reference?.phoneNumber), identity.timestamp);
    operations.push(upsert("contacts", { sessionId, contactId }, contact));
  }
  return operations;
}

function mediaFields(
  payload: Payload,
  chatId: string,
  version: number,
): Fields | undefined {
  const descriptor = nonEmpty(payload.media);
  const downloadUrl = nonEmpty(payload.mediaUrl);
  const type = nonEmpty(payload.type);
  const isMedia =
    descriptor !== undefined ||
    downloadUrl !== undefined ||
    ["image", "video", "audio", "document", "sticker"].includes(type ?? "");
  if (!isMedia) return undefined;
  const fields: Fields = {};
  put(fields, "chatId", chatId, 0);
  put(fields, "kind", type, 0);
  put(fields, "mimeType", nonEmpty(payload.mimeType), version);
  put(fields, "fileName", nonEmpty(payload.filename), version);
  put(fields, "descriptor", descriptor, version);
  put(fields, "downloadUrl", downloadUrl, version);
  return fields;
}

function sentOperations(
  sessionId: string,
  payload: MessageSentPayload,
): StorageOperation[] {
  const identity = messageIdentity({ ...payload, fromMe: true } as unknown as Payload);
  if (!identity) return [];
  const fields: Fields = {};
  put(fields, "chatId", identity.chatId, 0);
  put(fields, "fromMe", true, 0);
  put(fields, "senderId", SELF_ID, 0);
  put(fields, "timestamp", identity.timestamp ?? 0, 0);
  put(fields, "type", nonEmpty(payload.type), 0);
  const ids = whatsappIds(payload as unknown as Payload);
  put(fields, "waMessageId", ids.linked, 0);
  put(fields, "cloudMessageId", ids.official, 0);
  statusWrites(fields, "sent", identity.timestamp);
  return [
    ...chatFromConversation(
      sessionId,
      payload.conversation,
      undefined,
      identity.timestamp,
    ),
    upsert(
      "messages",
      { sessionId, messageId: identity.messageId },
      fields,
      guardFor(sessionId, identity),
    ),
  ];
}

function reactionOperations(
  sessionId: string,
  payload: Payload,
  at: number,
): StorageOperation[] {
  const identity = messageIdentity(payload);
  const target = nonEmpty(payload.reactionTo);
  if (!identity || !target || !identity.senderId) return [];
  const version = identity.timestamp ?? at;
  const fields: Fields = {};
  put(fields, "chatId", identity.chatId, 0);
  put(fields, "emoji", typeof payload.reaction === "string" ? payload.reaction : "", version);
  put(fields, "timestamp", version, version);
  return [
    upsert(
      "reactions",
      { sessionId, messageId: target, senderId: identity.senderId },
      fields,
    ),
  ];
}

function revokeOperations(
  sessionId: string,
  payload: Payload,
  at: number,
): StorageOperation[] {
  const identity = messageIdentity(payload);
  const target = nonEmpty(payload.revokedId);
  if (!identity || !target) return [];
  const revokedAt = identity.timestamp ?? at;
  const fields = clearedContent();
  put(fields, "chatId", identity.chatId, 0);
  put(fields, "revokedAt", revokedAt, FINAL_VERSION);
  return [
    upsert("messages", { sessionId, messageId: target }, fields),
    upsert("media", { sessionId, messageId: target }, clearedMedia()),
  ];
}

function deleteForMeOperations(
  sessionId: string,
  payload: MessageDeletePayload,
  at: number,
): StorageOperation[] {
  const messageId = nonEmpty(payload.id);
  const chatId = nonEmpty(payload.conversation?.id);
  if (!messageId || !chatId) return [];
  const fields = clearedContent();
  put(fields, "chatId", chatId, 0);
  put(fields, "deletedAt", at, FINAL_VERSION);
  return [
    upsert("messages", { sessionId, messageId }, fields),
    upsert("media", { sessionId, messageId }, clearedMedia()),
  ];
}

const ACK_STATUS: Readonly<Record<string, MessageStatus>> = {
  pending: "pending",
  error: "failed",
  failed: "failed",
  sent: "sent",
  server: "sent",
  server_ack: "sent",
  delivered: "delivered",
  delivery: "delivered",
  delivery_ack: "delivered",
  read: "read",
  "read-self": "read",
  read_self: "read",
  played: "played",
  "played-self": "played",
};

/** Maps a receipt type such as `read` or `delivered` to a message status. */
export function ackStatus(type: string | undefined): MessageStatus | undefined {
  return type === undefined ? undefined : ACK_STATUS[type.toLowerCase()];
}

function ackOperations(
  sessionId: string,
  payload: MessageAckPayload,
  at: number,
): StorageOperation[] {
  const status = ackStatus(payload.type);
  const chatId = nonEmpty(payload.conversation?.id);
  if (!status || !chatId || !Array.isArray(payload.messages)) return [];
  const timestamp = toMillis(payload.timestamp) ?? at;
  const recipientId =
    nonEmpty(payload.from?.id) ?? nonEmpty(payload.sender?.id) ?? chatId;
  const operations: StorageOperation[] = [];
  for (const message of payload.messages) {
    const messageId = nonEmpty(message?.id);
    if (!messageId) continue;
    const fields: Fields = {};
    put(fields, "chatId", chatId, 0);
    statusWrites(fields, status, timestamp);
    operations.push(upsert("messages", { sessionId, messageId }, fields));
    const receipt: Fields = {};
    put(receipt, "chatId", chatId, 0);
    statusWrites(receipt, status, timestamp);
    receipt.timestamp = receipt.statusAt!;
    delete receipt.statusAt;
    operations.push(
      upsert("receipts", { sessionId, messageId, recipientId }, receipt),
    );
  }
  return operations;
}

function voteOperations(
  sessionId: string,
  payload: PollVotePayload,
  at: number,
): StorageOperation[] {
  const messageId = nonEmpty(payload.pollMessageId);
  const voterId = nonEmpty(payload.voter?.id);
  const chatId = nonEmpty(payload.conversation?.id);
  if (!messageId || !voterId || !chatId) return [];
  const version = toMillis(payload.timestamp) ?? at;
  const fields: Fields = {};
  put(fields, "chatId", chatId, 0);
  put(fields, "selectedHashes", [...(payload.selectedHashes ?? [])], version);
  put(fields, "timestamp", version, version);
  return [upsert("poll_votes", { sessionId, messageId, voterId }, fields)];
}

function chatPatch(
  sessionId: string,
  from: IdentityReference | undefined,
  fields: Fields,
  at: number,
): StorageOperation[] {
  const chatId = nonEmpty(from?.id);
  if (!chatId || Object.keys(fields).length === 0 || at === 0) return [];
  return [upsert("chats", { sessionId, chatId }, fields)];
}

function contactOperations(
  sessionId: string,
  payload: ContactUpdatePayload,
  at: number,
): StorageOperation[] {
  const contactId = nonEmpty(payload.id);
  if (!contactId) return [];
  const fields: Fields = {};
  put(fields, "phoneNumber", nonEmpty(payload.phoneNumber), at);
  put(fields, "bsuid", nonEmpty(payload.bsuid), at);
  put(fields, "username", nonEmpty(payload.username), at);
  put(fields, "fullName", nonEmpty(payload.fullName), at);
  put(fields, "firstName", nonEmpty(payload.firstName), at);
  put(fields, "pushName", nonEmpty(payload.pushName), at);
  put(fields, "businessName", nonEmpty(payload.businessName), at);
  if (payload.pictureRemoved === true) put(fields, "pictureId", null, at);
  else put(fields, "pictureId", nonEmpty(payload.pictureId), at);
  if (Object.keys(fields).length === 0) return [];
  return [upsert("contacts", { sessionId, contactId }, fields)];
}

function blocklistOperations(
  sessionId: string,
  payload: BlocklistUpdatePayload,
  at: number,
): StorageOperation[] {
  const operations: StorageOperation[] = [];
  for (const change of payload.changes ?? []) {
    const contactId = nonEmpty(change?.id);
    const action = change?.action?.toLowerCase();
    if (!contactId || (action !== "block" && action !== "unblock")) continue;
    const fields: Fields = {};
    put(fields, "blocked", action === "block", at);
    put(fields, "phoneNumber", nonEmpty(change.phoneNumber), at);
    operations.push(upsert("contacts", { sessionId, contactId }, fields));
  }
  return operations;
}

function groupUpdateOperations(
  sessionId: string,
  payload: GroupUpdatePayload,
  at: number,
): StorageOperation[] {
  const groupId = nonEmpty(payload.id);
  if (!groupId) return [];
  const fields: Fields = {};
  put(fields, "subject", nonEmpty(payload.newSubject), at);
  put(fields, "description", payload.newDescription, at);
  put(fields, "lastAction", nonEmpty(payload.action), at);
  put(fields, "inviteLink", nonEmpty(payload.inviteLink), at);
  put(fields, "joinApprovalRequired", payload.joinApprovalRequired, at);
  const chat: Fields = {};
  put(chat, "kind", "group", 0);
  put(chat, "name", nonEmpty(payload.newSubject), at);
  return [
    upsert("groups", { sessionId, groupId }, fields),
    upsert("chats", { sessionId, chatId: groupId }, chat),
  ];
}

function participantOperations(
  sessionId: string,
  payload: GroupParticipantPayload,
  at: number,
): StorageOperation[] {
  const groupId = nonEmpty(payload.id);
  if (!groupId) return [];
  const operations: StorageOperation[] = [
    upsert("groups", { sessionId, groupId }, {}),
  ];
  const change = (
    list: readonly IdentityReference[] | undefined,
    apply: (fields: Fields) => void,
  ) => {
    for (const participant of list ?? []) {
      const participantId = nonEmpty(participant?.id);
      if (!participantId) continue;
      const fields: Fields = {};
      apply(fields);
      put(fields, "phoneNumber", nonEmpty(participant.phoneNumber), at);
      put(fields, "changedAt", at, at);
      operations.push(
        upsert("group_participants", { sessionId, groupId, participantId }, fields),
      );
    }
  };
  change(payload.joined, (fields) => {
    put(fields, "active", true, at);
    put(fields, "role", "member", at);
    put(fields, "leaveReason", null, at);
  });
  change(payload.left, (fields) => {
    put(fields, "active", false, at);
    put(fields, "leaveReason", nonEmpty(payload.reason) ?? "left", at);
  });
  change(payload.promoted, (fields) => put(fields, "role", "admin", at));
  change(payload.demoted, (fields) => put(fields, "role", "member", at));
  return operations;
}

function labelOperations(
  sessionId: string,
  payload: LabelsUpdatePayload,
  at: number,
): StorageOperation[] {
  const version = toMillis(payload.observedAt) ?? at;
  const labelId = nonEmpty(payload.labelId);
  switch (payload.action) {
    case "label_edit": {
      if (!labelId) return [];
      const fields: Fields = {};
      put(fields, "name", nonEmpty(payload.name) ?? nonEmpty(payload.label), version);
      put(fields, "color", finite(payload.color), version);
      put(fields, "orderIndex", finite(payload.orderIndex), version);
      put(fields, "deleted", payload.deleted ?? false, version);
      return [upsert("labels", { sessionId, labelId }, fields)];
    }
    case "label_association_chat":
    case "label_association_message": {
      const targetId =
        payload.action === "label_association_chat"
          ? nonEmpty(payload.from?.id)
          : nonEmpty(payload.messageId);
      if (!labelId || !targetId || typeof payload.labeled !== "boolean")
        return [];
      const fields: Fields = {};
      put(fields, "labeled", payload.labeled, version);
      put(fields, "changedAt", version, version);
      return [
        upsert(
          "label_associations",
          {
            sessionId,
            labelId,
            targetKind:
              payload.action === "label_association_chat" ? "chat" : "message",
            targetId,
          },
          fields,
        ),
      ];
    }
    case "star": {
      const messageId = nonEmpty(payload.messageId);
      const chatId = nonEmpty(payload.from?.id);
      if (!messageId || typeof payload.starred !== "boolean") return [];
      const fields: Fields = {};
      put(fields, "starred", payload.starred, version);
      put(fields, "chatId", chatId, 0);
      return [upsert("messages", { sessionId, messageId }, fields)];
    }
    default:
      return [];
  }
}
