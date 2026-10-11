/**
 * The storage schema: every entity, its key, its fields and the one index
 * each adapter must support. Adapters, migrations and ORM exports are all
 * derived from these definitions, so a field is added in exactly one place.
 */

export type FieldType = "string" | "number" | "boolean" | "json";

export interface IndexDefinition {
  /** Stable index name, used in SQL index names and DynamoDB/Firestore indexes. */
  readonly name: string;
  /** Fields matched by equality. Always starts with `sessionId`. */
  readonly equals: readonly string[];
  /** Numeric field the index orders by. */
  readonly sort: string;
}

export interface EntityDefinition {
  readonly name: EntityName;
  /** Key fields, all strings. Together they identify one row. */
  readonly key: readonly string[];
  /** Non-key fields. Every field is nullable. */
  readonly fields: Readonly<Record<string, FieldType>>;
  readonly indexes: readonly IndexDefinition[];
}

export const ENTITY_NAMES = [
  "sessions",
  "chats",
  "messages",
  "reactions",
  "receipts",
  "poll_votes",
  "contacts",
  "groups",
  "group_participants",
  "media",
  "labels",
  "label_associations",
  "history_chunks",
  "history_progress",
  "checkpoints",
  "events",
] as const;

export type EntityName = (typeof ENTITY_NAMES)[number];

const entities = {
  sessions: {
    name: "sessions",
    key: ["sessionId"],
    fields: {
      phoneNumber: "string",
      waId: "string",
      pushName: "string",
      phonePlatform: "string",
      accountType: "string",
      businessName: "string",
      connected: "boolean",
      status: "string",
      statusReason: "string",
      loggedOutReason: "string",
      loggedOutCode: "number",
    },
    indexes: [],
  },
  chats: {
    name: "chats",
    key: ["sessionId", "chatId"],
    fields: {
      jid: "string",
      kind: "string",
      phoneNumber: "string",
      bsuid: "string",
      username: "string",
      name: "string",
      archived: "boolean",
      pinned: "boolean",
      muted: "boolean",
      muteEndAt: "number",
      markedUnread: "boolean",
      unreadCount: "number",
      readOnly: "boolean",
      ephemeralExpiration: "number",
      lastMessageAt: "number",
      clearedAt: "number",
      deletedAt: "number",
    },
    indexes: [
      { name: "by_activity", equals: ["sessionId"], sort: "lastMessageAt" },
    ],
  },
  messages: {
    name: "messages",
    key: ["sessionId", "messageId"],
    fields: {
      chatId: "string",
      waMessageId: "string",
      cloudMessageId: "string",
      fromMe: "boolean",
      senderId: "string",
      senderJid: "string",
      pushName: "string",
      timestamp: "number",
      type: "string",
      text: "string",
      caption: "string",
      mimeType: "string",
      fileName: "string",
      latitude: "number",
      longitude: "number",
      displayName: "string",
      title: "string",
      quotedId: "string",
      pollOptions: "json",
      extra: "json",
      editedAt: "number",
      revokedAt: "number",
      deletedAt: "number",
      starred: "boolean",
      status: "string",
      statusAt: "number",
    },
    indexes: [
      { name: "by_chat", equals: ["sessionId", "chatId"], sort: "timestamp" },
    ],
  },
  reactions: {
    name: "reactions",
    key: ["sessionId", "messageId", "senderId"],
    fields: { chatId: "string", emoji: "string", timestamp: "number" },
    indexes: [
      {
        name: "by_message",
        equals: ["sessionId", "messageId"],
        sort: "timestamp",
      },
    ],
  },
  receipts: {
    name: "receipts",
    key: ["sessionId", "messageId", "recipientId"],
    fields: { chatId: "string", status: "string", timestamp: "number" },
    indexes: [
      {
        name: "by_message",
        equals: ["sessionId", "messageId"],
        sort: "timestamp",
      },
    ],
  },
  poll_votes: {
    name: "poll_votes",
    key: ["sessionId", "messageId", "voterId"],
    fields: { chatId: "string", selectedHashes: "json", timestamp: "number" },
    indexes: [
      {
        name: "by_message",
        equals: ["sessionId", "messageId"],
        sort: "timestamp",
      },
    ],
  },
  contacts: {
    name: "contacts",
    key: ["sessionId", "contactId"],
    fields: {
      jid: "string",
      lidJid: "string",
      phoneNumber: "string",
      bsuid: "string",
      username: "string",
      fullName: "string",
      firstName: "string",
      pushName: "string",
      businessName: "string",
      pictureId: "string",
      blocked: "boolean",
    },
    indexes: [],
  },
  groups: {
    name: "groups",
    key: ["sessionId", "groupId"],
    fields: {
      jid: "string",
      subject: "string",
      description: "string",
      createdAt: "number",
      createdBy: "string",
      inviteLink: "string",
      joinApprovalRequired: "boolean",
      lastAction: "string",
    },
    indexes: [],
  },
  group_participants: {
    name: "group_participants",
    key: ["sessionId", "groupId", "participantId"],
    fields: {
      jid: "string",
      phoneNumber: "string",
      role: "string",
      active: "boolean",
      changedAt: "number",
      leaveReason: "string",
    },
    indexes: [
      {
        name: "by_group",
        equals: ["sessionId", "groupId"],
        sort: "changedAt",
      },
    ],
  },
  media: {
    name: "media",
    key: ["sessionId", "messageId"],
    fields: {
      chatId: "string",
      kind: "string",
      mimeType: "string",
      fileName: "string",
      fileLength: "number",
      fileSha256: "string",
      fileEncSha256: "string",
      directPath: "string",
      mediaKey: "string",
      mediaKeyTimestamp: "number",
      descriptor: "string",
      downloadUrl: "string",
      archiveLocation: "string",
      archiveContentType: "string",
      archiveSize: "number",
      archiveSha256: "string",
      archivedAt: "number",
    },
    indexes: [],
  },
  labels: {
    name: "labels",
    key: ["sessionId", "labelId"],
    fields: {
      name: "string",
      color: "number",
      orderIndex: "number",
      deleted: "boolean",
    },
    indexes: [],
  },
  label_associations: {
    name: "label_associations",
    key: ["sessionId", "labelId", "targetKind", "targetId"],
    fields: { labeled: "boolean", changedAt: "number" },
    indexes: [],
  },
  history_chunks: {
    name: "history_chunks",
    key: ["sessionId", "syncType", "chunkOrder"],
    fields: {
      progress: "number",
      conversationCount: "number",
      messageCount: "number",
      pushnameCount: "number",
    },
    indexes: [],
  },
  history_progress: {
    name: "history_progress",
    key: ["sessionId", "syncType"],
    fields: { progress: "number", lastChunkOrder: "number" },
    indexes: [],
  },
  checkpoints: {
    name: "checkpoints",
    key: ["sessionId", "stream"],
    fields: { cursor: "string", position: "json", updatedAt: "number" },
    indexes: [],
  },
  events: {
    name: "events",
    key: ["sessionId", "eventId"],
    fields: { type: "string" },
    indexes: [],
  },
} as const satisfies Record<EntityName, EntityDefinition>;

export const STORAGE_SCHEMA: Readonly<Record<EntityName, EntityDefinition>> =
  entities;

/** Bumped when a field, entity or index changes. Stored by SQL migrations. */
export const STORAGE_SCHEMA_VERSION = 1;

/**
 * Columns every stored row carries in addition to its key and fields:
 * `_id` (encoded key), `_rev` (write counter used for conditional writes)
 * and `_v` (per-field merge versions, JSON).
 */
export const SYSTEM_FIELDS = ["_id", "_rev", "_v"] as const;

export function entityDefinition(name: EntityName): EntityDefinition {
  const definition = STORAGE_SCHEMA[name];
  if (!definition) throw new TypeError(`Unknown storage entity: ${name}`);
  return definition;
}

/** All key and field names of an entity, in a stable order. */
export function columnsOf(definition: EntityDefinition): readonly string[] {
  return [...definition.key, ...Object.keys(definition.fields)];
}

/**
 * Encodes key values as one string. The result never contains `/`, so it is
 * a valid Firestore document ID and DynamoDB/Cosmos item ID.
 */
export function encodeKey(
  definition: EntityDefinition,
  key: Readonly<Record<string, unknown>>,
): string {
  return (
    "k" +
    definition.key
      .map((field) => {
        const value = key[field];
        if (typeof value !== "string" || value.length === 0)
          throw new TypeError(
            `${definition.name}.${field} must be a non-empty string`,
          );
        return encodeURIComponent(value).replace(/\./g, "%2E");
      })
      .join(":")
  );
}
