import type { LinkedHistorySyncPayload } from "@polymorfa/sdk";

import {
  HISTORY_SYNC_TYPES,
  type HistoryChunkInput,
  type HistoryConversation,
  type HistoryIdentityIndex,
  type HistoryMediaMessage,
  type HistoryMessageContent,
  type HistoryMessageKey,
  type HistorySyncChunk,
  type ProtoBytes,
  type ProtoInt,
  type WebMessageInfo,
} from "../history-types.js";
import { FINAL_VERSION } from "../merge.js";
import type {
  ChatWatermarkGuard,
  OperationBatch,
  StorageOperation,
} from "../types.js";
import {
  chatKind,
  clearedContent,
  clearedMedia,
  type Fields,
  type MessageStatus,
  nonEmpty,
  put,
  SELF_ID,
  statusWrites,
  toMillis,
  upsert,
} from "./common.js";

const SYNC_TYPE_NAMES = Object.fromEntries(
  Object.entries(HISTORY_SYNC_TYPES).map(([name, value]) => [value, name]),
) as Record<number, string>;

/** Normalizes a sync type enum number or name to its name, e.g. `RECENT`. */
export function historySyncTypeName(value: unknown): string {
  if (typeof value === "number") return SYNC_TYPE_NAMES[value] ?? String(value);
  if (typeof value === "string" && value.length > 0) {
    const upper = value.toUpperCase();
    return upper in HISTORY_SYNC_TYPES ? upper : value;
  }
  return "UNKNOWN";
}

export function protoNumber(value: ProtoInt): number | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  if (typeof value.toNumber === "function") return value.toNumber();
  return undefined;
}

function base64(value: ProtoBytes): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "string") return value.length > 0 ? value : undefined;
  if (value.byteLength === 0) return undefined;
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function enumNumber(
  value: number | string | null | undefined,
  names: Readonly<Record<string, number>>,
): number | undefined {
  if (typeof value === "number") return value;
  if (typeof value === "string") return names[value.toUpperCase()];
  return undefined;
}

/** Bare user or chat JID: drops the device and agent parts. */
export function normalizeJid(jid: string): string {
  const at = jid.indexOf("@");
  if (at < 0) return jid.toLowerCase();
  const user = jid.slice(0, at).split(":")[0]!.split("_")[0]!;
  return `${user}@${jid.slice(at + 1)}`.toLowerCase();
}

export interface HistoryProgressInput {
  readonly syncType: string;
  readonly chunkOrder: number | undefined;
  readonly progress: number | undefined;
  readonly conversationCount?: number | undefined;
  readonly messageCount?: number | undefined;
  readonly pushnameCount?: number | undefined;
}

/** Records a chunk and advances the per-sync-type progress. */
export function historyProgressOperations(
  sessionId: string,
  input: HistoryProgressInput,
): StorageOperation[] {
  const operations: StorageOperation[] = [];
  const syncType = input.syncType;
  if (input.chunkOrder !== undefined) {
    const chunk: Fields = {};
    put(chunk, "progress", input.progress, 0);
    put(chunk, "conversationCount", input.conversationCount, 0);
    put(chunk, "messageCount", input.messageCount, 0);
    put(chunk, "pushnameCount", input.pushnameCount, 0);
    operations.push(
      upsert(
        "history_chunks",
        { sessionId, syncType, chunkOrder: String(input.chunkOrder) },
        chunk,
      ),
    );
  }
  const progress: Fields = {};
  // Progress only moves forward: the value is its own version.
  put(progress, "progress", input.progress, input.progress ?? 0);
  put(progress, "lastChunkOrder", input.chunkOrder, input.chunkOrder ?? 0);
  operations.push(upsert("history_progress", { sessionId, syncType }, progress));
  return operations;
}

/**
 * Builds the identity index from a `history.sync` event payload, which lists
 * the Polymorfa ID of each message in the chunk.
 */
export function historyIdentityIndex(
  payload: Pick<LinkedHistorySyncPayload, "messages">,
): HistoryIdentityIndex {
  const messages: {
    nativeId: string;
    id: string;
    chatId: string;
    fromMe?: boolean;
  }[] = [];
  for (const message of payload.messages ?? []) {
    const nativeId = nonEmpty(message.whatsapp_ids?.linked_devices);
    const chatId = nonEmpty(message.conversation?.id);
    if (!nativeId || !chatId || !nonEmpty(message.id)) continue;
    messages.push({
      nativeId,
      id: message.id,
      chatId,
      ...(typeof message.fromMe === "boolean" ? { fromMe: message.fromMe } : {}),
    });
  }
  return { messages };
}

/**
 * Resolves native identifiers to storage keys. With an identity index, keys
 * are Polymorfa IDs and history rows merge with event rows. Without one,
 * keys are `wa:`-prefixed native IDs.
 */
export class HistoryKeys {
  readonly #conversations = new Map<string, string>();
  readonly #contacts = new Map<string, string>();
  readonly #messages = new Map<string, HistoryIdentityIndex["messages"]>();

  constructor(index: HistoryIdentityIndex | undefined, chunk?: HistorySyncChunk) {
    for (const [jid, id] of Object.entries(index?.conversations ?? {}))
      this.#conversations.set(normalizeJid(jid), id);
    for (const [jid, id] of Object.entries(index?.contacts ?? {}))
      this.#contacts.set(normalizeJid(jid), id);
    for (const message of index?.messages ?? []) {
      const list = this.#messages.get(message.nativeId) ?? [];
      this.#messages.set(message.nativeId, [...list, message]);
    }
    // Learn chat IDs from the messages the index knows about.
    for (const conversation of chunk?.conversations ?? []) {
      const jid = nonEmpty(conversation.id);
      if (!jid || this.#conversations.has(normalizeJid(jid))) continue;
      const found = new Set<string>();
      for (const entry of conversation.messages ?? []) {
        const nativeId = nonEmpty(entry.message?.key?.id);
        const fromMe = entry.message?.key?.fromMe ?? undefined;
        for (const candidate of (nativeId && this.#messages.get(nativeId)) || [])
          if (candidate.fromMe === undefined || fromMe === undefined || candidate.fromMe === fromMe)
            found.add(candidate.chatId);
      }
      if (found.size === 1)
        this.#conversations.set(normalizeJid(jid), [...found][0]!);
    }
  }

  chatId(jid: string): string {
    const bare = normalizeJid(jid);
    return this.#conversations.get(bare) ?? `wa:${bare}`;
  }

  contactId(jid: string): string {
    const bare = normalizeJid(jid);
    return (
      this.#contacts.get(bare) ??
      (chatKind(bare) === "direct" ? this.#conversations.get(bare) : undefined) ??
      `wa:${bare}`
    );
  }

  messageId(key: HistoryMessageKey, chatJid: string): string | undefined {
    const nativeId = nonEmpty(key.id);
    if (!nativeId) return undefined;
    const jid = normalizeJid(nonEmpty(key.remoteJid) ?? chatJid);
    const fromMe = key.fromMe === true;
    const chatId = this.chatId(jid);
    const candidates = (this.#messages.get(nativeId) ?? []).filter(
      (candidate) =>
        candidate.chatId === chatId &&
        (candidate.fromMe === undefined || candidate.fromMe === fromMe),
    );
    if (candidates.length === 1) return candidates[0]!.id;
    const sender =
      !fromMe && chatKind(jid) === "group" && nonEmpty(key.participant)
        ? normalizeJid(key.participant!)
        : "";
    return `wa:${jid}:${fromMe ? 1 : 0}:${sender}:${nativeId}`;
  }
}

const STATUS_BY_NUMBER: Readonly<Record<number, MessageStatus>> = {
  0: "failed",
  1: "pending",
  2: "sent",
  3: "delivered",
  4: "read",
  5: "played",
};

const STATUS_NAMES: Readonly<Record<string, number>> = {
  ERROR: 0,
  PENDING: 1,
  SERVER_ACK: 2,
  DELIVERY_ACK: 3,
  READ: 4,
  PLAYED: 5,
};

const PROTOCOL_TYPES: Readonly<Record<string, number>> = {
  REVOKE: 0,
  MESSAGE_EDIT: 14,
};

const STUB_TYPES: Readonly<Record<string, number>> = { REVOKE: 1 };

/** Removes wrapper messages (ephemeral, view once, document with caption). */
function unwrap(content: HistoryMessageContent | null | undefined) {
  let current = content ?? undefined;
  for (let depth = 0; current && depth < 5; depth += 1) {
    const inner =
      current.ephemeralMessage?.message ??
      current.viewOnceMessage?.message ??
      current.viewOnceMessageV2?.message ??
      current.documentWithCaptionMessage?.message ??
      current.editedMessage?.message;
    if (!inner) break;
    current = inner;
  }
  return current;
}

interface MappedContent {
  readonly type: string;
  readonly fields: Fields;
  readonly quotedId: string | undefined;
  readonly media: { readonly kind: string; readonly message: HistoryMediaMessage } | undefined;
}

function mapContent(
  content: HistoryMessageContent,
  version: number,
): MappedContent | undefined {
  const fields: Fields = {};
  const set = (name: string, value: unknown) =>
    put(fields, name, (value ?? null) as never, version);
  let type: string;
  let quotedId: string | undefined;
  let media: MappedContent["media"];
  const mediaKinds = [
    ["imageMessage", "image"],
    ["videoMessage", "video"],
    ["ptvMessage", "video"],
    ["audioMessage", "audio"],
    ["documentMessage", "document"],
    ["stickerMessage", "sticker"],
  ] as const;
  const mediaEntry = mediaKinds.find(([field]) => content[field]);
  if (nonEmpty(content.conversation)) {
    type = "text";
    set("text", content.conversation);
  } else if (content.extendedTextMessage) {
    type = "text";
    set("text", nonEmpty(content.extendedTextMessage.text));
    quotedId = nonEmpty(content.extendedTextMessage.contextInfo?.stanzaId);
  } else if (mediaEntry) {
    const message = content[mediaEntry[0]]!;
    type = mediaEntry[1];
    set("caption", nonEmpty(message.caption));
    set("mimeType", nonEmpty(message.mimetype));
    set("fileName", nonEmpty(message.fileName));
    set("title", nonEmpty(message.title));
    set("extra", message.ptt === true ? { ptt: true } : null);
    quotedId = nonEmpty(message.contextInfo?.stanzaId);
    media = { kind: type, message };
  } else if (content.locationMessage) {
    type = "location";
    set("latitude", content.locationMessage.degreesLatitude);
    set("longitude", content.locationMessage.degreesLongitude);
    set("title", nonEmpty(content.locationMessage.name));
    quotedId = nonEmpty(content.locationMessage.contextInfo?.stanzaId);
  } else if (content.contactMessage) {
    type = "contact";
    set("displayName", nonEmpty(content.contactMessage.displayName));
  } else {
    const poll =
      content.pollCreationMessage ??
      content.pollCreationMessageV2 ??
      content.pollCreationMessageV3;
    if (!poll) return undefined;
    type = "poll";
    set("title", nonEmpty(poll.name));
    set(
      "pollOptions",
      (poll.options ?? [])
        .map((option) => nonEmpty(option.optionName))
        .filter((name): name is string => name !== undefined)
        .map((name) => ({ name })),
    );
    quotedId = nonEmpty(poll.contextInfo?.stanzaId);
  }
  // Fields this content type does not use are cleared so an edit to another
  // shape leaves no stale values.
  for (const field of [
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
  ])
    if (!(field in fields)) set(field, null);
  return { type, fields, quotedId, media };
}

function mediaWrites(
  media: NonNullable<MappedContent["media"]>,
  chatId: string,
  version: number,
): Fields {
  const fields: Fields = {};
  const message = media.message;
  put(fields, "chatId", chatId, 0);
  put(fields, "kind", media.kind, 0);
  put(fields, "mimeType", nonEmpty(message.mimetype), version);
  put(fields, "fileName", nonEmpty(message.fileName), version);
  put(fields, "fileLength", protoNumber(message.fileLength), version);
  put(fields, "fileSha256", base64(message.fileSha256), version);
  put(fields, "fileEncSha256", base64(message.fileEncSha256), version);
  put(fields, "directPath", nonEmpty(message.directPath), version);
  put(fields, "mediaKey", base64(message.mediaKey), version);
  put(fields, "mediaKeyTimestamp", toMillis(protoNumber(message.mediaKeyTimestamp)), version);
  return fields;
}

export interface WebMessageContext {
  readonly sessionId: string;
  readonly keys: HistoryKeys;
  /** Chat JID from the enclosing conversation, used when the key lacks one. */
  readonly chatJid?: string;
}

/**
 * Maps one `WebMessageInfo` to operations: the message, its media
 * reference, receipts and reactions. Also handles revoke, edit and reaction
 * protocol messages, which target another message.
 */
export function reduceWebMessageInfo(
  info: WebMessageInfo,
  context: WebMessageContext,
): StorageOperation[] {
  const { sessionId, keys } = context;
  const key = info.key ?? {};
  const jid = nonEmpty(key.remoteJid) ?? context.chatJid;
  if (!jid) return [];
  const messageId = keys.messageId(key, jid);
  if (!messageId) return [];
  const chatId = keys.chatId(jid);
  const fromMe = key.fromMe === true;
  const group = chatKind(normalizeJid(jid)) === "group";
  const senderJid = fromMe
    ? undefined
    : (nonEmpty(key.participant) ?? nonEmpty(info.participant) ?? (group ? undefined : jid));
  const senderId = fromMe ? SELF_ID : senderJid ? keys.contactId(senderJid) : undefined;
  const timestamp = toMillis(protoNumber(info.messageTimestamp));
  const guard: ChatWatermarkGuard | undefined =
    timestamp === undefined ? undefined : { sessionId, chatId, timestamp };
  const operations: StorageOperation[] = [];
  const content = unwrap(info.message);

  // Protocol messages act on another message.
  const protocol = content?.protocolMessage;
  if (protocol) {
    const type = enumNumber(protocol.type, PROTOCOL_TYPES);
    const target = protocol.key ? keys.messageId(protocol.key, jid) : undefined;
    if (!target) return [];
    if (type === 0) {
      const fields = clearedContent();
      put(fields, "chatId", chatId, 0);
      put(fields, "revokedAt", timestamp ?? 0, FINAL_VERSION);
      return [
        upsert("messages", { sessionId, messageId: target }, fields),
        upsert("media", { sessionId, messageId: target }, clearedMedia()),
      ];
    }
    if (type === 14 && protocol.editedMessage) {
      const version = toMillis(protoNumber(protocol.timestampMs)) ?? timestamp ?? 0;
      const mapped = mapContent(unwrap(protocol.editedMessage) ?? {}, version);
      if (!mapped) return [];
      const fields: Fields = { ...mapped.fields };
      put(fields, "chatId", chatId, 0);
      put(fields, "editedAt", version, version);
      return [upsert("messages", { sessionId, messageId: target }, fields)];
    }
    return [];
  }
  if (content?.reactionMessage) {
    const reaction = content.reactionMessage;
    const target = reaction.key ? keys.messageId(reaction.key, jid) : undefined;
    if (!target || !senderId) return [];
    const version = toMillis(protoNumber(reaction.senderTimestampMs)) ?? timestamp ?? 0;
    const fields: Fields = {};
    put(fields, "chatId", chatId, 0);
    put(fields, "emoji", reaction.text ?? "", version);
    put(fields, "timestamp", version, version);
    return [
      upsert("reactions", { sessionId, messageId: target, senderId }, fields),
    ];
  }

  const fields: Fields = {};
  put(fields, "chatId", chatId, 0);
  put(fields, "fromMe", fromMe, 0);
  put(fields, "senderId", senderId, 0);
  put(fields, "senderJid", senderJid ? normalizeJid(senderJid) : undefined, 0);
  put(fields, "timestamp", timestamp ?? 0, 0);
  if (!messageId.startsWith("wa:") || nonEmpty(key.id))
    put(fields, "waMessageId", nonEmpty(key.id), 0);
  if (!fromMe) put(fields, "pushName", nonEmpty(info.pushName), 0);
  if (info.starred === true || info.starred === false)
    put(fields, "starred", info.starred, 0);
  const status = STATUS_BY_NUMBER[enumNumber(info.status, STATUS_NAMES) ?? -1];
  if (fromMe && status) statusWrites(fields, status, undefined);

  const stub = enumNumber(info.messageStubType, STUB_TYPES);
  let media: MappedContent["media"];
  if (stub === 1) {
    Object.assign(fields, clearedContent());
    put(
      fields,
      "revokedAt",
      toMillis(protoNumber(info.revokeMessageTimestamp)) ?? timestamp ?? 0,
      FINAL_VERSION,
    );
    operations.push(upsert("media", { sessionId, messageId }, clearedMedia()));
  } else if (content) {
    const mapped = mapContent(content, 0);
    if (mapped) {
      put(fields, "type", mapped.type, 0);
      put(fields, "quotedId", mapped.quotedId, 0);
      Object.assign(fields, mapped.fields);
      media = mapped.media;
    } else put(fields, "type", "unknown", 0);
  }
  operations.push(upsert("messages", { sessionId, messageId }, fields, guard));
  if (media)
    operations.push(
      upsert("media", { sessionId, messageId }, mediaWrites(media, chatId, 0), guard),
    );

  for (const receipt of info.userReceipt ?? []) {
    const userJid = nonEmpty(receipt.userJid);
    if (!userJid) continue;
    const played = toMillis(protoNumber(receipt.playedTimestamp));
    const read = toMillis(protoNumber(receipt.readTimestamp));
    const delivered = toMillis(protoNumber(receipt.receiptTimestamp));
    const state: [MessageStatus, number] | undefined = played
      ? ["played", played]
      : read
        ? ["read", read]
        : delivered
          ? ["delivered", delivered]
          : undefined;
    if (!state) continue;
    const receiptFields: Fields = {};
    put(receiptFields, "chatId", chatId, 0);
    statusWrites(receiptFields, state[0], state[1]);
    receiptFields.timestamp = receiptFields.statusAt!;
    delete receiptFields.statusAt;
    operations.push(
      upsert(
        "receipts",
        { sessionId, messageId, recipientId: keys.contactId(userJid) },
        receiptFields,
        guard,
      ),
    );
  }
  for (const reaction of info.reactions ?? []) {
    const reactionKey = reaction.key ?? {};
    const reactor = reactionKey.fromMe
      ? SELF_ID
      : nonEmpty(reactionKey.participant) ?? (group ? undefined : jid);
    if (!reactor) continue;
    const reactorId = reactor === SELF_ID ? SELF_ID : keys.contactId(reactor);
    const version = toMillis(protoNumber(reaction.senderTimestampMs)) ?? timestamp ?? 0;
    const reactionFields: Fields = {};
    put(reactionFields, "chatId", chatId, 0);
    put(reactionFields, "emoji", reaction.text ?? "", version);
    put(reactionFields, "timestamp", version, version);
    operations.push(
      upsert(
        "reactions",
        { sessionId, messageId, senderId: reactorId },
        reactionFields,
        guard,
      ),
    );
  }
  if (!fromMe && senderJid && nonEmpty(info.pushName) && timestamp !== undefined) {
    const contact: Fields = {};
    put(contact, "jid", normalizeJid(senderJid), 0);
    put(contact, "pushName", nonEmpty(info.pushName), timestamp);
    operations.push(
      upsert("contacts", { sessionId, contactId: keys.contactId(senderJid) }, contact),
    );
  }
  return operations;
}

const RANKS: Readonly<Record<number, string>> = {
  0: "member",
  1: "admin",
  2: "superadmin",
};

function conversationOperations(
  sessionId: string,
  conversation: HistoryConversation,
  keys: HistoryKeys,
): StorageOperation[] {
  const jid = nonEmpty(conversation.id);
  if (!jid) return [];
  const bare = normalizeJid(jid);
  const chatId = keys.chatId(bare);
  const kind = chatKind(bare);
  const lastMessageAt = toMillis(protoNumber(conversation.lastMsgTimestamp));
  const snapshot =
    Math.max(
      toMillis(protoNumber(conversation.conversationTimestamp)) ?? 0,
      lastMessageAt ?? 0,
    ) || 0;
  const fields: Fields = {};
  put(fields, "jid", bare, 0);
  put(fields, "kind", kind, 0);
  put(fields, "name", nonEmpty(conversation.name) ?? nonEmpty(conversation.displayName), snapshot);
  put(fields, "username", nonEmpty(conversation.username), snapshot);
  if (kind === "direct" && conversation.pnJid)
    put(fields, "phoneNumber", `+${normalizeJid(conversation.pnJid).split("@")[0]}`, snapshot);
  put(fields, "archived", conversation.archived ?? undefined, snapshot);
  put(fields, "markedUnread", conversation.markedAsUnread ?? undefined, snapshot);
  put(fields, "unreadCount", conversation.unreadCount ?? undefined, snapshot);
  put(fields, "readOnly", conversation.readOnly ?? undefined, snapshot);
  put(fields, "ephemeralExpiration", conversation.ephemeralExpiration ?? undefined, snapshot);
  const pinned = protoNumber(conversation.pinned);
  if (pinned !== undefined) put(fields, "pinned", pinned > 0, snapshot);
  const muteEnd = protoNumber(conversation.muteEndTime);
  if (muteEnd !== undefined) {
    put(fields, "muted", muteEnd !== 0, snapshot);
    put(fields, "muteEndAt", muteEnd > 0 ? toMillis(muteEnd) ?? null : null, snapshot);
  }
  if (lastMessageAt !== undefined)
    put(fields, "lastMessageAt", lastMessageAt, lastMessageAt);
  const operations: StorageOperation[] = [
    upsert("chats", { sessionId, chatId }, fields),
  ];
  if (kind === "group") {
    const group: Fields = {};
    put(group, "jid", bare, 0);
    put(group, "subject", nonEmpty(conversation.name), snapshot);
    put(group, "description", nonEmpty(conversation.description), snapshot);
    put(group, "createdAt", toMillis(protoNumber(conversation.createdAt)), 0);
    put(
      group,
      "createdBy",
      conversation.createdBy ? normalizeJid(conversation.createdBy) : undefined,
      0,
    );
    operations.push(upsert("groups", { sessionId, groupId: chatId }, group));
    for (const participant of conversation.participant ?? []) {
      const userJid = nonEmpty(participant.userJid);
      if (!userJid) continue;
      const rank =
        typeof participant.rank === "number"
          ? participant.rank
          : ({ REGULAR: 0, ADMIN: 1, SUPERADMIN: 2 } as Record<string, number>)[
              String(participant.rank ?? "REGULAR").toUpperCase()
            ];
      const member: Fields = {};
      put(member, "jid", normalizeJid(userJid), 0);
      put(member, "role", RANKS[rank ?? 0] ?? "member", snapshot);
      put(member, "active", true, snapshot);
      put(member, "changedAt", snapshot, snapshot);
      operations.push(
        upsert(
          "group_participants",
          { sessionId, groupId: chatId, participantId: keys.contactId(userJid) },
          member,
        ),
      );
    }
  }
  for (const entry of conversation.messages ?? []) {
    if (entry.message)
      operations.push(
        ...reduceWebMessageInfo(entry.message, { sessionId, keys, chatJid: bare }),
      );
  }
  return operations;
}

/**
 * Maps a decoded history chunk to storage operations. Pure and
 * deterministic. Applying chunks in any order, or the same chunk twice,
 * gives the same state.
 */
export function reduceHistoryChunk(input: HistoryChunkInput): OperationBatch {
  const { sessionId, chunk } = input;
  const keys = new HistoryKeys(input.identities, chunk);
  const operations: StorageOperation[] = [];
  for (const conversation of chunk.conversations ?? [])
    operations.push(...conversationOperations(sessionId, conversation, keys));
  for (const pushname of chunk.pushnames ?? []) {
    const jid = nonEmpty(pushname.id);
    const name = nonEmpty(pushname.pushname);
    if (!jid || !name || chatKind(normalizeJid(jid)) !== "direct") continue;
    const fields: Fields = {};
    put(fields, "jid", normalizeJid(jid), 0);
    put(fields, "pushName", name, 0);
    operations.push(
      upsert("contacts", { sessionId, contactId: keys.contactId(jid) }, fields),
    );
  }
  for (const mapping of chunk.phoneNumberToLidMappings ?? []) {
    const pn = nonEmpty(mapping.pnJid);
    const lid = nonEmpty(mapping.lidJid);
    if (!pn || !lid) continue;
    const phoneNumber = `+${normalizeJid(pn).split("@")[0]}`;
    for (const jid of [pn, lid]) {
      const fields: Fields = {};
      put(fields, "phoneNumber", phoneNumber, 0);
      put(fields, "lidJid", normalizeJid(lid), 0);
      operations.push(
        upsert("contacts", { sessionId, contactId: keys.contactId(jid) }, fields),
      );
    }
  }
  for (const past of chunk.pastParticipants ?? []) {
    const groupJid = nonEmpty(past.groupJid);
    if (!groupJid) continue;
    const groupId = keys.chatId(groupJid);
    for (const participant of past.pastParticipants ?? []) {
      const userJid = nonEmpty(participant.userJid);
      if (!userJid) continue;
      const leftAt = toMillis(protoNumber(participant.leaveTs)) ?? 0;
      const reason = enumNumber(participant.leaveReason, { LEFT: 0, REMOVED: 1 });
      const fields: Fields = {};
      put(fields, "jid", normalizeJid(userJid), 0);
      put(fields, "active", false, leftAt);
      put(fields, "leaveReason", reason === 1 ? "removed" : "left", leftAt);
      put(fields, "changedAt", leftAt, leftAt);
      operations.push(
        upsert(
          "group_participants",
          { sessionId, groupId, participantId: keys.contactId(userJid) },
          fields,
        ),
      );
    }
  }
  operations.push(
    ...historyProgressOperations(sessionId, {
      syncType: historySyncTypeName(chunk.syncType),
      chunkOrder: protoNumber(chunk.chunkOrder),
      progress: protoNumber(chunk.progress),
      conversationCount: chunk.conversations?.length ?? 0,
      messageCount: (chunk.conversations ?? []).reduce(
        (total, conversation) => total + (conversation.messages?.length ?? 0),
        0,
      ),
      pushnameCount: chunk.pushnames?.length ?? 0,
    }),
  );
  return {
    sessionId,
    ...(input.chunkId === undefined ? {} : { eventId: `history:${input.chunkId}` }),
    eventType: "history.chunk",
    operations,
  };
}
