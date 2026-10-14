import type { WebhookEvent } from "@polymorfa/sdk";

import { createStorage, type Storage } from "./engine.js";
import type { HistorySyncChunk } from "./history-types.js";
import { canonicalJson, publicRow } from "./merge.js";
import { reduceEvent } from "./reducer/events.js";
import { reduceHistoryChunk } from "./reducer/history.js";
import {
  ENTITY_NAMES,
  encodeKey,
  entityDefinition,
  type EntityName,
} from "./schema.js";
import type {
  FieldValue,
  JsonValue,
  OperationBatch,
  StorageAdapter,
  StorageOperation,
} from "./types.js";

/** The test functions the suite needs; pass Vitest's, Jest's or `node:test`'s. */
export interface ConformanceTestApi {
  describe(name: string, body: () => void): void;
  it(name: string, body: () => Promise<void>, timeout?: number): void;
  beforeAll?(body: () => Promise<void>, timeout?: number): void;
  afterAll?(body: () => Promise<void>, timeout?: number): void;
}

export interface ConformanceOptions {
  /** Messages in the large history chunk test. Default 2000. */
  readonly largeChunkMessages?: number;
  /** Per-test timeout in milliseconds. Default 60 000. */
  readonly timeout?: number;
}

class ConformanceFailure extends Error {
  override readonly name = "ConformanceFailure";
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new ConformanceFailure(message);
}

function assertEqual(actual: unknown, expected: unknown, message: string) {
  const a = canonicalJson(actual as JsonValue);
  const b = canonicalJson(expected as JsonValue);
  if (a !== b) throw new ConformanceFailure(`${message}\nexpected ${b}\nreceived ${a}`);
}

let runCounter = 0;
function uniqueSession(label: string): string {
  runCounter += 1;
  return `conf-${label}-${Date.now().toString(36)}-${runCounter}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

const T0 = Date.UTC(2026, 9, 1, 12, 0, 0);
const iso = (offsetSeconds: number) =>
  new Date(T0 + offsetSeconds * 1000).toISOString();
const secs = (offsetSeconds: number) => Math.floor(T0 / 1000) + offsetSeconds;

/**
 * A fixed set of events touching every merge rule: a message, its edit and
 * revoke, a reaction added and removed, receipts out of order, chat flags
 * toggled, contact and group changes, a poll vote, and labels.
 */
export function conformanceEvents(session: string): WebhookEvent[] {
  const chat = { id: "100200300", phoneNumber: "+15550001111" };
  const group = { id: "900800700" };
  const member = { id: "100200301", phoneNumber: "+15550002222" };
  const events: [string, number, Record<string, unknown>][] = [
    [
      "message.received",
      1,
      {
        id: "5001",
        whatsapp_ids: { linked_devices: "3EB0AAA1" },
        conversation: chat,
        fromMe: false,
        timestamp: secs(1),
        pushName: "Ana",
        isGroup: false,
        type: "text",
        text: "original",
      },
    ],
    [
      "message.update",
      5,
      {
        id: "5001",
        whatsapp_ids: { linked_devices: "3EB0AAA1" },
        conversation: chat,
        fromMe: false,
        timestamp: secs(5),
        pushName: "Ana",
        isGroup: false,
        type: "text",
        text: "edited once",
        edited: true,
      },
    ],
    [
      "message.edited",
      7,
      {
        id: "5001",
        whatsapp_ids: { linked_devices: "3EB0AAA1" },
        conversation: chat,
        fromMe: false,
        timestamp: secs(7),
        pushName: "Ana",
        isGroup: false,
        type: "text",
        text: "edited twice",
      },
    ],
    [
      "message.received",
      2,
      {
        id: "5002",
        whatsapp_ids: { linked_devices: "3EB0AAA2" },
        conversation: chat,
        fromMe: false,
        timestamp: secs(2),
        pushName: "Ana",
        isGroup: false,
        type: "image",
        caption: "photo",
        mimeType: "image/jpeg",
        media: "ZGVzY3JpcHRvcg==",
      },
    ],
    [
      "message.revoked",
      9,
      {
        id: "5009",
        whatsapp_ids: { linked_devices: "3EB0AAA9" },
        conversation: chat,
        fromMe: false,
        timestamp: secs(9),
        pushName: "Ana",
        isGroup: false,
        type: "revoke",
        revokedId: "5002",
      },
    ],
    [
      "message.edited",
      10,
      {
        id: "5002",
        whatsapp_ids: { linked_devices: "3EB0AAA2" },
        conversation: chat,
        fromMe: false,
        timestamp: secs(10),
        pushName: "Ana",
        isGroup: false,
        type: "image",
        caption: "late edit after revoke",
      },
    ],
    [
      "message.sent",
      3,
      {
        id: "5003",
        whatsapp_ids: { linked_devices: "3EB0BBB3" },
        conversation: chat,
        type: "text",
        timestamp: secs(3),
      },
    ],
    [
      "message.ack",
      12,
      {
        messages: [{ id: "5003", whatsapp_ids: { linked_devices: "3EB0BBB3" } }],
        conversation: chat,
        type: "read",
        timestamp: secs(12),
      },
    ],
    [
      "message.ack",
      11,
      {
        messages: [{ id: "5003", whatsapp_ids: { linked_devices: "3EB0BBB3" } }],
        conversation: chat,
        type: "delivered",
        timestamp: secs(11),
      },
    ],
    [
      "message.reaction",
      13,
      {
        id: "5013",
        whatsapp_ids: { linked_devices: "3EB0AAAD" },
        conversation: chat,
        fromMe: false,
        timestamp: secs(13),
        pushName: "Ana",
        isGroup: false,
        type: "reaction",
        reaction: "👍",
        reactionTo: "5003",
      },
    ],
    [
      "message.reaction",
      14,
      {
        id: "5014",
        whatsapp_ids: { linked_devices: "3EB0AAAE" },
        conversation: chat,
        fromMe: false,
        timestamp: secs(14),
        pushName: "Ana",
        isGroup: false,
        type: "reaction",
        reaction: "",
        reactionTo: "5003",
      },
    ],
    ["chat.archive", 20, { from: chat, archive: true }],
    ["chat.archive", 21, { from: chat, archive: false, pinned: true }],
    ["chat.mute", 22, { from: chat, muted: true, muteEndTimestamp: secs(3600) }],
    ["chat.read", 23, { from: chat, read: false }],
    ["contact.update", 24, { id: chat.id, pushName: "Ana B", fullName: "Ana Bell" }],
    ["contact.update", 25, { id: chat.id, pictureId: "pic-1" }],
    ["blocklist.update", 26, { action: "modify", changes: [{ action: "block", id: chat.id }] }],
    ["group.update", 30, { id: group.id, newSubject: "Team", action: "subject" }],
    ["group.update", 31, { id: group.id, newSubject: "Team B", action: "subject" }],
    ["group.participant", 32, { id: group.id, joined: [member] }],
    ["group.participant", 33, { id: group.id, promoted: [member] }],
    [
      "message.received",
      34,
      {
        id: "6001",
        whatsapp_ids: { linked_devices: "3EB0CCC1" },
        conversation: { ...group, sender: member },
        fromMe: false,
        timestamp: secs(34),
        pushName: "Bo",
        isGroup: true,
        type: "poll",
        title: "Lunch?",
        pollOptions: [{ name: "Yes", hash: "aa" }, { name: "No", hash: "bb" }],
      },
    ],
    [
      "message.vote",
      35,
      { conversation: group, pollMessageId: "6001", voter: member, selectedHashes: ["aa"], timestamp: secs(35) },
    ],
    [
      "message.vote",
      36,
      { conversation: group, pollMessageId: "6001", voter: member, selectedHashes: ["bb"], timestamp: secs(36) },
    ],
    ["labels.update", 37, { action: "label_edit", labelId: "1", name: "VIP", color: 2, orderIndex: 0, observedAt: secs(37) }],
    ["labels.update", 38, { action: "label_association_chat", labelId: "1", from: chat, labeled: true, observedAt: secs(38) }],
    ["labels.update", 39, { action: "star", messageId: "5001", from: chat, starred: true, observedAt: secs(39) }],
    ["session.connected", 40, { phoneNumber: "+15559990000", pushName: "Shop", phonePlatform: "android", accountType: "business" }],
    ["session.logged_out", 41, { reason: "device_removed", code: 401 }],
  ];
  return events.map(([event, offset, payload], index) => ({
    id: `evt-${index}-${event}`,
    session,
    timestamp: iso(offset),
    event,
    payload,
  })) as WebhookEvent[];
}

/** A decoded history chunk with `messages` messages across 20 chats. */
export function conformanceHistoryChunk(
  messages: number,
  chunkOrder = 1,
): HistorySyncChunk {
  const conversations = Array.from({ length: 20 }, (_, chat) => ({
    id: `1555000${String(chat).padStart(4, "0")}@s.whatsapp.net`,
    name: `Chat ${chat}`,
    unreadCount: chat % 3,
    archived: chat % 2 === 0,
    lastMsgTimestamp: secs(10_000),
    conversationTimestamp: secs(10_000),
    messages: [] as { message: Record<string, unknown> }[],
  }));
  for (let index = 0; index < messages; index += 1) {
    const conversation = conversations[index % conversations.length]!;
    conversation.messages.push({
      message: {
        key: {
          remoteJid: conversation.id,
          fromMe: index % 2 === 0,
          id: `HIST${String(index).padStart(6, "0")}`,
        },
        messageTimestamp: secs(index),
        status: index % 2 === 0 ? 4 : 1,
        pushName: index % 2 === 0 ? undefined : "Peer",
        message: { conversation: `history message ${index}` },
      },
    });
  }
  return {
    syncType: 3,
    chunkOrder,
    progress: 40,
    conversations,
    pushnames: conversations.map((conversation, index) => ({
      id: conversation.id,
      pushname: `Peer ${index}`,
    })),
  } as unknown as HistorySyncChunk;
}

/** The keys a set of batches touches, so a snapshot needs no table scan. */
function touchedKeys(batches: readonly OperationBatch[]) {
  const keys = new Map<string, { entity: EntityName; key: Record<string, string> }>();
  for (const batch of batches)
    for (const operation of batch.operations) {
      const entry = keyOf(operation);
      if (!entry) continue;
      keys.set(
        `${entry.entity}\u0000${encodeKey(entityDefinition(entry.entity), entry.key)}`,
        entry,
      );
    }
  return [...keys.values()];
}

function keyOf(
  operation: StorageOperation,
): { entity: EntityName; key: Record<string, string> } | undefined {
  switch (operation.kind) {
    case "upsert":
    case "patch":
    case "delete":
      return { entity: operation.entity, key: { ...operation.key } };
    case "checkpoint":
      return {
        entity: "checkpoints",
        key: { sessionId: operation.sessionId, stream: operation.stream },
      };
    default:
      return undefined;
  }
}

/** Stored state for the given keys, with the session ID removed. */
async function snapshot(
  storage: Storage,
  keys: readonly { entity: EntityName; key: Record<string, string> }[],
): Promise<string[]> {
  const lines: string[] = [];
  for (const { entity, key } of keys) {
    const row = await storage.get(entity, key);
    const anonymous = row ? { ...row, sessionId: "*" } : null;
    const anonymousKey = { ...key, sessionId: "*" };
    lines.push(`${entity} ${canonicalJson(anonymousKey)} ${canonicalJson(anonymous)}`);
  }
  return lines.sort();
}

function reSession(events: readonly WebhookEvent[], session: string): WebhookEvent[] {
  return events.map((event) => ({ ...event, session }));
}

function shuffled<T>(items: readonly T[], seed: number): T[] {
  const result = [...items];
  let state = seed;
  for (let index = result.length - 1; index > 0; index -= 1) {
    state = (state * 1103515245 + 12345) % 2147483648;
    const swap = state % (index + 1);
    [result[index], result[swap]] = [result[swap]!, result[index]!];
  }
  return result;
}

/**
 * Registers the shared conformance suite. Every adapter must pass it.
 *
 * `createAdapter` is called once; the suite isolates tests by session ID,
 * so it works against a shared database without truncating it.
 */
export function defineStorageConformance(
  api: ConformanceTestApi,
  name: string,
  createAdapter: () => Promise<StorageAdapter> | StorageAdapter,
  options: ConformanceOptions = {},
): void {
  const timeout = options.timeout ?? 60_000;
  const largeCount = options.largeChunkMessages ?? 2000;
  let adapter: StorageAdapter | undefined;
  let storage: Storage;
  const ready = async () => {
    if (!adapter) {
      adapter = await createAdapter();
      await adapter.setup?.();
      storage = createStorage(adapter);
    }
    return storage;
  };

  api.describe(`storage conformance: ${name}`, () => {
    api.beforeAll?.(async () => {
      await ready();
    }, timeout);
    api.afterAll?.(async () => {
      await adapter?.close?.();
    }, timeout);

    api.it(
      "applies an event once and skips its replay",
      async () => {
        const store = await ready();
        const session = uniqueSession("dedupe");
        const event = conformanceEvents(session)[0]!;
        const first = await store.apply(reduceEvent(event));
        assert(first.applied && first.writes > 0, "first apply must write");
        const second = await store.apply(reduceEvent(event));
        assertEqual(second, { applied: false, writes: 0 }, "replay must be skipped");
        assert(await store.hasEvent(session, event.id), "event marker must exist");
      },
      timeout,
    );

    api.it(
      "is idempotent without an event ID",
      async () => {
        const store = await ready();
        const session = uniqueSession("idem");
        const batches: OperationBatch[] = conformanceEvents(session).map((event) => {
          const batch = reduceEvent(event);
          return { sessionId: batch.sessionId, operations: batch.operations };
        });
        for (const batch of batches) await store.apply(batch);
        const before = await snapshot(store, touchedKeys(batches));
        let writes = 0;
        for (const batch of batches) writes += (await store.apply(batch)).writes;
        assertEqual(writes, 0, "re-applying merged batches must not write");
        assertEqual(await snapshot(store, touchedKeys(batches)), before, "state changed on replay");
      },
      timeout,
    );

    api.it(
      "converges when events arrive in any order",
      async () => {
        const store = await ready();
        const base = conformanceEvents("x");
        const orders = [
          base,
          [...base].reverse(),
          shuffled(base, 7),
          shuffled(base, 42),
          shuffled(base, 1337),
        ];
        let reference: string[] | undefined;
        for (const [index, order] of orders.entries()) {
          const session = uniqueSession(`order${index}`);
          const batches = reSession(order, session).map(reduceEvent);
          // Apply each batch twice in a row to mix replays into the order.
          for (const batch of batches) {
            await store.apply(batch);
            if (index % 2 === 1) await store.apply(batch);
          }
          const state = await snapshot(store, touchedKeys(batches));
          if (!reference) reference = state;
          else assertEqual(state, reference, `order ${index} diverged`);
        }
      },
      timeout,
    );

    api.it(
      "applies the documented merge rules",
      async () => {
        const store = await ready();
        const session = uniqueSession("rules");
        for (const event of shuffled(conformanceEvents(session), 3))
          await store.apply(reduceEvent(event));
        const message = await store.get("messages", { sessionId: session, messageId: "5001" });
        assertEqual(
          [message?.text, message?.editedAt, message?.starred, message?.type],
          ["edited twice", T0 + 7000, true, "text"],
          "latest edit and star must win",
        );
        const revoked = await store.get("messages", { sessionId: session, messageId: "5002" });
        assertEqual(
          [revoked?.caption, revoked?.revokedAt, revoked?.type],
          [null, T0 + 9000, "image"],
          "revoke must clear content permanently",
        );
        const media = await store.get("media", { sessionId: session, messageId: "5002" });
        assertEqual([media?.descriptor, media?.kind], [null, "image"], "revoke clears media secrets");
        const sent = await store.get("messages", { sessionId: session, messageId: "5003" });
        assertEqual([sent?.status, sent?.statusAt], ["read", T0 + 12000], "status only advances");
        const reaction = await store.get("reactions", {
          sessionId: session,
          messageId: "5003",
          senderId: "100200300",
        });
        assertEqual(reaction?.emoji, "", "latest reaction (removal) wins");
        const chat = await store.get("chats", { sessionId: session, chatId: "100200300" });
        assertEqual(
          [chat?.archived, chat?.pinned, chat?.muted, chat?.markedUnread, chat?.lastMessageAt],
          [false, true, true, true, T0 + 3000],
          "chat flags are last-writer-wins",
        );
        const contact = await store.get("contacts", { sessionId: session, contactId: "100200300" });
        assertEqual(
          [contact?.pushName, contact?.fullName, contact?.pictureId, contact?.blocked],
          ["Ana B", "Ana Bell", "pic-1", true],
          "contact fields merge independently",
        );
        const groupRow = await store.get("groups", { sessionId: session, groupId: "900800700" });
        assertEqual(groupRow?.subject, "Team B", "latest subject wins");
        const member = await store.get("group_participants", {
          sessionId: session,
          groupId: "900800700",
          participantId: "100200301",
        });
        assertEqual([member?.role, member?.active], ["admin", true], "participant role merges");
        const vote = await store.get("poll_votes", {
          sessionId: session,
          messageId: "6001",
          voterId: "100200301",
        });
        assertEqual(vote?.selectedHashes, ["bb"], "latest vote wins");
        const sessionRow = await store.get("sessions", { sessionId: session });
        assertEqual(
          [sessionRow?.connected, sessionRow?.loggedOutReason, sessionRow?.phoneNumber],
          [false, "device_removed", "+15559990000"],
          "session state",
        );
      },
      timeout,
    );

    api.it(
      "stores a checkpoint and cursor per session",
      async () => {
        const store = await ready();
        const a = uniqueSession("cpa");
        const b = uniqueSession("cpb");
        assertEqual(await store.getCheckpoint(a, "events"), null, "no checkpoint yet");
        const save = (sessionId: string, cursor: string, updatedAt: number) =>
          store.apply({
            sessionId,
            operations: [
              { kind: "checkpoint", sessionId, stream: "events", cursor, position: { n: updatedAt }, updatedAt },
            ],
          });
        await save(a, "cursor-1", 1);
        await save(b, "cursor-b", 5);
        await save(a, "cursor-2", 2);
        assertEqual(
          await store.getCheckpoint(a, "events"),
          { cursor: "cursor-2", position: { n: 2 }, updatedAt: 2 },
          "latest cursor saved",
        );
        assertEqual((await store.getCheckpoint(b, "events"))?.cursor, "cursor-b", "sessions are separate");
        assertEqual(await store.getCheckpoint(a, "other"), null, "streams are separate");
      },
      timeout,
    );

    api.it(
      "implements patch and delete",
      async () => {
        const store = await ready();
        const sessionId = uniqueSession("patch");
        const key = { sessionId, contactId: "c1" };
        await store.apply({
          sessionId,
          operations: [
            { kind: "patch", entity: "contacts", key, fields: { pushName: { value: "x", version: 1 } } },
          ],
        });
        assertEqual(await store.get("contacts", key), null, "patch must not create");
        await store.apply({
          sessionId,
          operations: [
            { kind: "upsert", entity: "contacts", key, fields: { pushName: { value: "x", version: 1 } } },
            { kind: "patch", entity: "contacts", key, fields: { fullName: { value: "X Y", version: 1 } } },
          ],
        });
        const row = await store.get("contacts", key);
        assertEqual([row?.pushName, row?.fullName], ["x", "X Y"], "patch merges into existing");
        await store.apply({ sessionId, operations: [{ kind: "delete", entity: "contacts", key }] });
        assertEqual(await store.get("contacts", key), null, "delete removes the row");
        await store.apply({
          sessionId,
          operations: [
            { kind: "upsert", entity: "contacts", key, fields: { pushName: { value: "z", version: 0 } } },
          ],
        });
        const recreated = await store.get("contacts", key);
        assertEqual([recreated?.pushName, recreated?.fullName], ["z", null], "upsert after delete starts fresh");
      },
      timeout,
    );

    api.it(
      "clears a chat and ignores older copies delivered later",
      async () => {
        const store = await ready();
        const sessionId = uniqueSession("clear");
        const chat = { id: "777" };
        const message = (id: string, offset: number) =>
          ({
            id: `m-${id}`,
            session: sessionId,
            timestamp: iso(offset),
            event: "message.received",
            payload: {
              id,
              whatsapp_ids: { linked_devices: `N${id}` },
              conversation: chat,
              fromMe: false,
              timestamp: secs(offset),
              pushName: "P",
              isGroup: false,
              type: "image",
              mimeType: "image/png",
              media: "ZA==",
            },
          }) as WebhookEvent;
        const reaction = {
          id: "r-1",
          session: sessionId,
          timestamp: iso(2),
          event: "message.reaction",
          payload: {
            id: "9",
            conversation: chat,
            fromMe: true,
            timestamp: secs(2),
            type: "reaction",
            reaction: "❤️",
            reactionTo: "1",
          },
        } as WebhookEvent;
        for (const event of [message("1", 1), message("2", 2), message("3", 30), reaction])
          await store.apply(reduceEvent(event));
        await store.apply(
          reduceEvent({
            id: "clear-1",
            session: sessionId,
            timestamp: iso(10),
            event: "chat.clear",
            payload: { from: chat },
          } as WebhookEvent),
        );
        const page = await store.query("messages", {
          index: "by_chat",
          equals: { sessionId, chatId: "777" },
          order: "asc",
          limit: 10,
        });
        assertEqual(page.rows.map((row) => row.messageId), ["3"], "only newer message remains");
        assertEqual(await store.get("media", { sessionId, messageId: "1" }), null, "media removed");
        assertEqual(
          await store.get("reactions", { sessionId, messageId: "1", senderId: "self" }),
          null,
          "reactions removed",
        );
        await store.apply(reduceEvent(message("4", 5)));
        assertEqual(await store.get("messages", { sessionId, messageId: "4" }), null, "older late copy ignored");
        await store.apply(reduceEvent(message("5", 40)));
        assert(await store.get("messages", { sessionId, messageId: "5" }), "newer message stored");
      },
      timeout,
    );

    api.it(
      "orders and pages index queries",
      async () => {
        const store = await ready();
        const sessionId = uniqueSession("query");
        const operations: StorageOperation[] = [];
        for (let index = 0; index < 25; index += 1)
          operations.push({
            kind: "upsert",
            entity: "messages",
            key: { sessionId, messageId: `m${String(index).padStart(2, "0")}` },
            fields: {
              chatId: { value: "c", version: 0 },
              // Ties on purpose: rows with equal timestamps order by ID.
              timestamp: { value: 1000 + Math.floor(index / 3), version: 0 },
            },
          });
        operations.push({
          kind: "upsert",
          entity: "messages",
          key: { sessionId, messageId: "other" },
          fields: { chatId: { value: "d", version: 0 }, timestamp: { value: 1001, version: 0 } },
        });
        await store.apply({ sessionId, operations });
        const all: string[] = [];
        let after: { sort: number; id: string } | undefined;
        do {
          const page = await store.query("messages", {
            index: "by_chat",
            equals: { sessionId, chatId: "c" },
            order: "asc",
            limit: 10,
            ...(after ? { after } : {}),
          });
          all.push(...page.rows.map((row) => String(row.messageId)));
          after = page.next;
        } while (after);
        assertEqual(
          all,
          Array.from({ length: 25 }, (_, index) => `m${String(index).padStart(2, "0")}`),
          "ascending pages",
        );
        const desc: string[] = [];
        after = undefined;
        do {
          const page = await store.query("messages", {
            index: "by_chat",
            equals: { sessionId, chatId: "c" },
            order: "desc",
            limit: 7,
            ...(after ? { after } : {}),
          });
          desc.push(...page.rows.map((row) => String(row.messageId)));
          after = page.next;
        } while (after);
        assertEqual(desc, [...all].reverse(), "descending pages");
        const ranged = await store.query("messages", {
          index: "by_chat",
          equals: { sessionId, chatId: "c" },
          range: { gte: 1002, lt: 1004 },
          order: "asc",
          limit: 100,
        });
        assertEqual(
          ranged.rows.map((row) => row.messageId),
          ["m06", "m07", "m08", "m09", "m10", "m11"],
          "range filter",
        );
      },
      timeout,
    );

    api.it(
      "stores a large history chunk and replays it without writes",
      async () => {
        const store = await ready();
        const sessionId = uniqueSession("large");
        const chunk = conformanceHistoryChunk(largeCount);
        const first = await store.apply(reduceHistoryChunk({ sessionId, chunk, chunkId: "n1" }));
        assert(first.applied && first.writes >= largeCount, "chunk must write every message");
        const replay = await store.apply(reduceHistoryChunk({ sessionId, chunk }));
        assertEqual(replay.writes, 0, "replay must not write");
        let count = 0;
        let after: { sort: number; id: string } | undefined;
        do {
          const page = await store.query("messages", {
            index: "by_chat",
            equals: { sessionId, chatId: "wa:15550000000@s.whatsapp.net" },
            order: "asc",
            limit: 50,
            ...(after ? { after } : {}),
          });
          count += page.rows.length;
          after = page.next;
        } while (after);
        assertEqual(count, Math.ceil(largeCount / 20), "messages of one chat");
        const progress = await store.get("history_progress", { sessionId, syncType: "RECENT" });
        assertEqual([progress?.progress, progress?.lastChunkOrder], [40, 1], "history progress");
        const sample = await store.get("messages", {
          sessionId,
          messageId: "wa:15550000000@s.whatsapp.net:1::HIST000000",
        });
        assertEqual([sample?.text, sample?.status], ["history message 0", "read"], "history message");
      },
      timeout * 3,
    );

    api.it(
      "merges concurrent writers to the same row",
      async () => {
        const store = await ready();
        const sessionId = uniqueSession("race");
        const key = { sessionId, contactId: "c" };
        const fields = ["fullName", "firstName", "pushName", "businessName", "username", "pictureId"];
        await Promise.all(
          fields.map((field, index) =>
            store.apply({
              sessionId,
              operations: [
                { kind: "upsert", entity: "contacts", key, fields: { [field]: { value: `v${index}`, version: 1 } } },
              ],
            }),
          ),
        );
        const row = await store.get("contacts", key);
        assertEqual(
          fields.map((field) => row?.[field]),
          fields.map((_, index) => `v${index}`),
          "every concurrent field write survives",
        );
      },
      timeout,
    );

    api.it(
      "round-trips every field type",
      async () => {
        const store = await ready();
        const sessionId = uniqueSession("types");
        const json = { nested: [1, "two", { three: true }], empty: {}, unicode: "çé😀" };
        await store.apply({
          sessionId,
          operations: [
            {
              kind: "upsert",
              entity: "messages",
              key: { sessionId, messageId: "a/b:c.d%e" },
              fields: {
                text: { value: "line\nbreak 'quote' \"dq\" 😀", version: 0 },
                latitude: { value: -12.5, version: 0 },
                fromMe: { value: false, version: 0 },
                starred: { value: true, version: 0 },
                timestamp: { value: 1_790_000_000_123, version: 0 },
                extra: { value: json, version: 0 },
                pollOptions: { value: [], version: 0 },
              },
            },
          ],
        });
        const row = await store.get("messages", { sessionId, messageId: "a/b:c.d%e" });
        const expected: Record<string, FieldValue> = {
          text: "line\nbreak 'quote' \"dq\" 😀",
          latitude: -12.5,
          fromMe: false,
          starred: true,
          timestamp: 1_790_000_000_123,
          extra: json,
          pollOptions: [],
          caption: null,
        };
        for (const [field, value] of Object.entries(expected))
          assertEqual(row?.[field], value, `field ${field}`);
      },
      timeout,
    );
  });
}

/** Exposed for adapter tests that inspect raw rows. */
export function publicRows(
  entity: EntityName,
  rows: readonly import("./types.js").StoredRow[],
) {
  return rows.map((row) => publicRow(entityDefinition(entity), row));
}

export { ENTITY_NAMES as CONFORMANCE_ENTITIES };
