import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it, vi } from "vitest";

import {
  createPolymorfaStore,
  type BroadcastChannelLike,
  type StoreChange,
} from "../src/index.js";
import { BASE_TIME, chat, event, openStore, received } from "./helpers.js";

describe("createPolymorfaStore routing", () => {
  it("files messages and updates the conversation summary", async () => {
    const store = await openStore();
    expect(store.mode).toBe("indexeddb");
    await store.ingest([
      received("m1", "hello", { at: 1_000 }),
      received("m2", "again", { at: 2_000 }),
    ]);
    const messages = await store.messages.list({ conversationId: "chat_1" });
    expect(messages.map(({ id }) => id)).toEqual(["m2", "m1"]);
    expect(messages[0]).toMatchObject({
      text: "again",
      fromMe: false,
      senderId: "contact_1",
      status: "sent",
      createdAt: Math.floor((BASE_TIME + 2_000) / 1000) * 1000,
    });
    const [conversation] = await store.conversations.list({ limit: 10 });
    expect(conversation).toMatchObject({
      id: "chat_1",
      unreadCount: 2,
      name: "Ada",
      lastMessage: { id: "m2", text: "again" },
    });
    const older = await store.messages.list({
      conversationId: "chat_1",
      before: messages[0]?.createdAt ?? 0,
      limit: 1,
    });
    expect(older.map(({ id }) => id)).toEqual(["m1"]);
    store.close();
  });

  it("tracks sent messages, acknowledgements, reactions, votes, and deletes", async () => {
    const store = await openStore();
    const conversation = { ...chat };
    await store.ingest([
      event("message.sent", {
        id: "out1",
        whatsapp_ids: { linked_devices: "wa_out1" },
        conversation,
        type: "text",
        timestamp: 1,
      }),
      event("message.ack", {
        messages: [{ id: "out1", whatsapp_ids: { linked_devices: "wa_out1" } }],
        conversation,
        type: "read",
        timestamp: 2,
      }),
      event("message.reaction", {
        id: "r1",
        whatsapp_ids: { linked_devices: "wa_r1" },
        conversation: { ...chat, sender: { id: "contact_1" } },
        fromMe: false,
        timestamp: 3,
        pushName: "Ada",
        isGroup: false,
        type: "reaction",
        reaction: "👍",
        reactionTo: "out1",
      }),
      event("message.vote", {
        conversation,
        pollMessageId: "out1",
        voter: { id: "contact_1" },
        selectedHashes: ["h1"],
        timestamp: 4,
      }),
      received("gone", "bye", { at: 5_000 }),
      event("message.delete", {
        from: chat,
        sender: chat,
        id: "gone",
        whatsapp_ids: { linked_devices: "wa_gone" },
        conversation,
        fromMe: false,
      }),
    ]);
    expect(await store.messages.get("out1")).toMatchObject({
      fromMe: true,
      status: "read",
      reactions: { contact_1: "👍" },
      votes: { contact_1: ["h1"] },
    });
    expect(await store.messages.get("gone")).toMatchObject({ deleted: true });
    expect((await store.messages.get("gone"))?.text).toBeUndefined();
    const listed = await store.messages.list({ conversationId: "chat_1" });
    expect(listed.map(({ id }) => id)).toEqual(["out1"]);
    // A late replay of the deleted message does not resurrect it.
    await store.ingest(received("gone", "bye", { at: 5_000 }));
    expect(await store.messages.get("gone")).toMatchObject({ deleted: true });
    store.close();
  });

  it("applies chat, contact, presence, label, session, template, and group events", async () => {
    const store = await openStore();
    await store.ingest([
      received("m1", "hi", { at: 1_000 }),
      event("chat.archive", { from: chat, archive: true, pinned: false }),
      event("chat.mute", { from: chat, muted: true, muteEndTimestamp: 99 }),
      event("chat.read", { from: chat, read: true }),
      event("contact.update", {
        id: "contact_1",
        pushName: "Ada L.",
        fullName: "Ada Lovelace",
      }),
      event("blocklist.update", {
        action: "modify",
        changes: [{ action: "block", id: "contact_2" }],
      }),
      event("presence.update", {
        observedAt: BASE_TIME + 10,
        from: { id: "contact_1" },
        state: "online",
      }),
      event("labels.update", {
        action: "label_edit",
        labelId: "l1",
        name: "VIP",
        color: 3,
      }),
      event("labels.update", {
        action: "label_association_chat",
        labelId: "l1",
        from: chat,
        labeled: true,
      }),
      event("labels.update", {
        action: "star",
        messageId: "m1",
        starred: true,
      }),
      event("session.connected", {
        phoneNumber: "+15559999",
        pushName: "Support",
        phonePlatform: "android",
        accountType: "business",
      }),
      event("session.status", { status: "ready" }),
      event("template.status", {
        templateName: "welcome",
        templateId: "t1",
        status: "APPROVED",
        category: "UTILITY",
        reason: "",
        qualityRating: "GREEN",
      }),
      event("group.update", { id: "group_1", newSubject: "Team" }),
    ]);
    expect(await store.conversations.get("chat_1")).toMatchObject({
      archived: true,
      pinned: false,
      muted: true,
      muteEndTimestamp: 99,
      unreadCount: 0,
      labelIds: ["l1"],
    });
    expect(await store.conversations.list({ unreadOnly: true })).toEqual([]);
    expect(await store.contacts.get("contact_1")).toMatchObject({
      pushName: "Ada L.",
      fullName: "Ada Lovelace",
    });
    expect(await store.contacts.get("contact_2")).toMatchObject({
      blocked: true,
    });
    expect(await store.presence.get("contact_1")).toMatchObject({
      state: "online",
      observedAt: BASE_TIME + 10,
    });
    expect(await store.labels.get("l1")).toMatchObject({
      name: "VIP",
      color: 3,
    });
    expect(await store.messages.get("m1")).toMatchObject({ starred: true });
    expect(await store.sessions.get("support")).toMatchObject({
      status: "ready",
      phoneNumber: "+15559999",
    });
    expect(await store.templates.get("t1")).toMatchObject({
      templateName: "welcome",
      status: "APPROVED",
    });
    expect(await store.conversations.get("group_1")).toMatchObject({
      isGroup: true,
      name: "Team",
    });
    store.close();
  });

  it("tracks the call lifecycle and ignores a late ringing event", async () => {
    const store = await openStore();
    const from = { id: "contact_1" };
    await store.ingest([
      event("call.received", { from, callId: "c1" }, { at: 10 }),
      event("call.accepted", { from, callId: "c1" }, { at: 20 }),
      event(
        "call.participant_joined",
        {
          callId: "c1",
          participant: {
            id: "p1",
            audioMuted: false,
            video: false,
            state: "connected",
          },
        },
        { at: 25 },
      ),
      event(
        "call.ended",
        {
          from,
          callId: "c1",
          durationSeconds: 42,
          reason: "hangup",
          direction: "inbound",
          hadVideo: false,
        },
        { at: 30 },
      ),
      event("call.received", { from, callId: "c1" }, { at: 5 }),
      event("call.telemetry", { callId: "c1", codec: "opus" }, { at: 40 }),
    ]);
    expect(await store.calls.get("c1")).toMatchObject({
      state: "ended",
      direction: "inbound",
      durationSeconds: 42,
      startedAt: BASE_TIME + 5,
      acceptedAt: BASE_TIME + 20,
      endedAt: BASE_TIME + 30,
      participants: { p1: { state: "connected" } },
      telemetry: { callId: "c1", codec: "opus" },
    });
    store.close();
  });

  it("files unknown and unrouted events in custom and logs every event", async () => {
    const store = await openStore();
    await store.ingest([
      event("campaign.completed", { campaignId: "cmp_1" }),
      event("future.event", { anything: true }),
      event("message.failed", {
        to: chat,
        type: "text",
        error: "send_failed",
        timestamp: 1,
      }),
      received("m1", "hi"),
    ]);
    const custom = await store.custom.list();
    expect(custom.map(({ type }) => type)).toEqual([
      "campaign.completed",
      "future.event",
      "message.failed",
    ]);
    const log = await store.events.list({
      types: ["message.received", "future.event"],
    });
    expect(log.map(({ type }) => type).sort()).toEqual([
      "future.event",
      "message.received",
    ]);
    const since = await store.events.list({ since: BASE_TIME + 1_000 });
    expect(since.map(({ type }) => type)).toEqual(["message.received"]);
    store.close();
  });

  it("runs registered reducers and files handled types out of custom", async () => {
    const store = await openStore();
    const reducer = vi.fn(async (incoming, context) => {
      context.put("contacts", { id: "from-reducer", _t: context.time });
    });
    const unregister = store.registerReducer("acme.sync", reducer);
    await store.ingest(event("acme.sync", { value: 1 }));
    expect(reducer).toHaveBeenCalledOnce();
    expect(await store.contacts.get("from-reducer")).toBeDefined();
    expect(await store.custom.list()).toEqual([]);
    unregister();
    await store.ingest(event("acme.sync", { value: 2 }));
    expect(await store.custom.list()).toHaveLength(1);
    store.close();
  });
});

describe("idempotency and ordering", () => {
  it("skips repeated event IDs within and across batches", async () => {
    const store = await openStore();
    const first = received("m1", "hello");
    const result = await store.ingest([first, first]);
    expect(result).toEqual({ accepted: 1, duplicates: 1, ignored: 0 });
    expect(await store.ingest(first)).toEqual({
      accepted: 0,
      duplicates: 1,
      ignored: 0,
    });
    expect((await store.conversations.get("chat_1"))?.unreadCount).toBe(1);
    expect(await store.events.list()).toHaveLength(1);
    store.close();
  });

  it("ignores malformed envelopes and other sessions", async () => {
    const store = await openStore({ session: "support" });
    const result = await store.ingest([
      { id: "", session: "support", timestamp: "x", event: "a", payload: {} },
      event("contact.update", { id: "c" }, { session: "sales" }),
    ]);
    expect(result).toEqual({ accepted: 0, duplicates: 0, ignored: 2 });
    store.close();
  });

  it("never downgrades message status when acknowledgements arrive out of order", async () => {
    const store = await openStore();
    const conversation = { ...chat };
    const ack = (type: string, at: number) =>
      event(
        "message.ack",
        {
          messages: [{ id: "out1", whatsapp_ids: { linked_devices: "wa" } }],
          conversation,
          type,
          timestamp: 1,
        },
        { at },
      );
    // Read arrives before the message itself and before delivered.
    await store.ingest(ack("read", 30));
    expect(await store.messages.list({ conversationId: "chat_1" })).toEqual([]);
    await store.ingest([
      received("out1", "hello", { at: 10, fromMe: true }),
      ack("delivered", 20),
    ]);
    expect(await store.messages.get("out1")).toMatchObject({
      status: "read",
      text: "hello",
    });
    await store.ingest(ack("played", 40));
    await store.ingest(ack("delivered", 50));
    expect((await store.messages.get("out1"))?.status).toBe("played");
    store.close();
  });

  it("keeps newer contact fields and presence over older events", async () => {
    const store = await openStore();
    await store.ingest([
      event("contact.update", { id: "c1", pushName: "New" }, { at: 20 }),
      event(
        "contact.update",
        { id: "c1", pushName: "Old", fullName: "Full" },
        { at: 10 },
      ),
      event("presence.update", {
        observedAt: BASE_TIME + 20,
        from: { id: "c1" },
        state: "online",
      }),
      event("presence.update", {
        observedAt: BASE_TIME + 10,
        from: { id: "c1" },
        state: "offline",
      }),
    ]);
    expect(await store.contacts.get("c1")).toMatchObject({
      pushName: "New",
      fullName: "Full",
    });
    expect((await store.presence.get("c1"))?.state).toBe("online");
    store.close();
  });

  it("does not let an older message replace the conversation summary or restore cleared history", async () => {
    const store = await openStore();
    await store.ingest([
      received("new", "newer", { at: 5_000 }),
      received("old", "older", { at: 1_000 }),
    ]);
    expect((await store.conversations.get("chat_1"))?.lastMessage?.id).toBe(
      "new",
    );
    await store.ingest(event("chat.clear", { from: chat }, { at: 6_000 }));
    expect(await store.messages.list({ conversationId: "chat_1" })).toEqual([]);
    await store.ingest(received("late", "late", { at: 2_000 }));
    expect(await store.messages.get("late")).toBeUndefined();
    await store.ingest(received("after", "after", { at: 7_000 }));
    expect(
      (await store.messages.list({ conversationId: "chat_1" })).map(
        ({ id }) => id,
      ),
    ).toEqual(["after"]);
    store.close();
  });

  it("keeps a message written after a clear in the same batch", async () => {
    for (const indexedDB of [new IDBFactory(), null] as const) {
      const store = await openStore({ indexedDB });
      await store.ingest(received("before", "before", { at: 1_000 }));
      const changes: StoreChange[] = [];
      store.subscribe("messages", (change) => changes.push(change));
      await store.ingest([
        event("chat.clear", { from: chat }, { at: 6_000 }),
        received("after", "after", { at: 7_000 }),
      ]);
      expect(
        (await store.messages.list({ conversationId: "chat_1" })).map(
          ({ id }) => id,
        ),
      ).toEqual(["after"]);
      expect(changes.flatMap(({ deleted }) => deleted)).not.toContain("after");
      store.close();
    }
  });

  it("writes large backfills in bounded batches", async () => {
    const store = await openStore({ batchSize: 50 });
    const events = Array.from({ length: 180 }, (_, index) =>
      received(`m${index}`, `text ${index}`, { at: 1_000 + index * 1_000 }),
    );
    const result = await store.ingest(events);
    expect(result.accepted).toBe(180);
    expect(
      await store.messages.list({ conversationId: "chat_1", limit: 500 }),
    ).toHaveLength(180);
    expect((await store.conversations.get("chat_1"))?.unreadCount).toBe(180);
    store.close();
  });
});

describe("retention", () => {
  it("removes expired and excess rows on open and on sweep", async () => {
    let now = BASE_TIME + 10_000;
    const factory = new IDBFactory();
    const name = "retention";
    const store = await createPolymorfaStore({
      name,
      indexedDB: factory,
      broadcastChannel: null,
      sweepIntervalMs: 0,
      now: () => now,
      retention: {
        events: { maxAgeMs: 5_000 },
        messages: { maxRows: 2 },
        presence: false,
      },
    });
    await store.ingest([
      received("m1", "a", { at: 1_000 }),
      received("m2", "b", { at: 2_000 }),
      received("m3", "c", { at: 8_000 }),
      event(
        "presence.update",
        { observedAt: 1, from: { id: "p" }, state: "online" },
        { at: 1 },
      ),
    ]);
    const deleted: StoreChange[] = [];
    store.subscribe("*", (change) => deleted.push(change));
    await store.sweep();
    expect(
      (await store.messages.list({ conversationId: "chat_1" })).map(
        ({ id }) => id,
      ),
    ).toEqual(["m3", "m2"]);
    expect(
      (await store.events.list()).map(({ timestamp }) => timestamp),
    ).toEqual([new Date(BASE_TIME + 8_000).toISOString()]);
    expect(await store.presence.get("p")).toBeDefined();
    expect(deleted.find(({ store: s }) => s === "messages")?.deleted).toEqual([
      "m1",
    ]);
    store.close();

    now += 100_000;
    const reopened = await createPolymorfaStore({
      name,
      indexedDB: factory,
      broadcastChannel: null,
      sweepIntervalMs: 0,
      now: () => now,
      retention: { events: { maxAgeMs: 5_000 } },
    });
    expect(await reopened.events.list()).toEqual([]);
    reopened.close();
  });

  it("sweeps periodically", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    try {
      const store = await openStore({
        sweepIntervalMs: 1_000,
        retention: { custom: { maxRows: 0 } },
        indexedDB: null,
      });
      await store.ingest(event("x.y", {}));
      expect(await store.custom.list()).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(1_000);
      await store.custom.list();
      await vi.waitFor(async () =>
        expect(await store.custom.list()).toEqual([]),
      );
      store.close();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("modes, privacy, and lifecycle", () => {
  it("falls back to memory when IndexedDB is missing or fails", async () => {
    const missing = await openStore({ indexedDB: null });
    expect(missing.mode).toBe("memory");
    expect(missing.fallbackReason).toMatch(/not available/);
    await missing.ingest([received("m1", "hi"), received("m2", "there")]);
    expect(
      await missing.messages.list({ conversationId: "chat_1", limit: 1 }),
    ).toHaveLength(1);
    expect(await missing.conversations.list()).toHaveLength(1);
    missing.close();

    const broken = {
      open: () => {
        throw new Error("denied");
      },
    } as unknown as IDBFactory;
    const failed = await openStore({ indexedDB: broken });
    expect(failed.mode).toBe("memory");
    expect(failed.fallbackReason).toMatch(/denied/);
    failed.close();
  });

  it("clears every store and notifies listeners", async () => {
    const store = await openStore();
    await store.ingest([received("m1", "hi"), event("x.y", {})]);
    await store.checkpoints.set("default", "cursor-1");
    const changes: StoreChange[] = [];
    store.subscribe("messages", (change) => changes.push(change));
    await store.clear();
    expect(await store.messages.get("m1")).toBeUndefined();
    expect(await store.conversations.list()).toEqual([]);
    expect(await store.events.list()).toEqual([]);
    expect(await store.custom.list()).toEqual([]);
    expect(await store.checkpoints.get("default")).toBeUndefined();
    expect(changes).toEqual([
      {
        store: "messages",
        keys: [],
        deleted: [],
        cleared: true,
        origin: "local",
      },
    ]);
    // Cleared IDs can be ingested again.
    expect((await store.ingest(received("m1", "hi"))).accepted).toBe(1);
    store.close();
    await expect(store.ingest(received("m9", "x"))).rejects.toThrow(/closed/);
  });

  it("wipes data when the application version changes", async () => {
    const factory = new IDBFactory();
    const first = await openStore({
      name: "v",
      indexedDB: factory,
      version: 1,
    });
    await first.ingest(received("m1", "hi"));
    first.close();
    const same = await openStore({ name: "v", indexedDB: factory, version: 1 });
    expect(await same.messages.get("m1")).toBeDefined();
    same.close();
    const next = await openStore({ name: "v", indexedDB: factory, version: 2 });
    expect(await next.messages.get("m1")).toBeUndefined();
    next.close();
  });

  it("seals sensitive fields, redacts paths, and strips tokens", async () => {
    const factory = new IDBFactory();
    const encrypt = vi.fn((fields: Record<string, unknown>) =>
      btoa(JSON.stringify(fields)),
    );
    const decrypt = vi.fn(
      (sealed: unknown) =>
        JSON.parse(atob(sealed as string)) as Record<string, unknown>,
    );
    const store = await openStore({
      name: "sealed",
      indexedDB: factory,
      encrypt,
      decrypt,
      redact: [{ events: "message.*", paths: ["pushName"] }],
    });
    await store.ingest([
      received("m1", "secret text"),
      event("x.y", {
        clientToken: "abc",
        nested: { access_token: "t", value: "pmfa_ct_live", keep: 1 },
      }),
    ]);
    expect(await store.messages.get("m1")).toMatchObject({
      text: "secret text",
    });
    expect((await store.messages.get("m1"))?.pushName).toBeUndefined();
    const [custom] = await store.custom.list();
    expect(custom?.payload).toEqual({
      nested: { value: "[redacted]", keep: 1 },
    });
    store.close();

    const raw = await openStore({ name: "sealed", indexedDB: factory });
    const row = await raw.messages.get("m1");
    // Without decrypt the sealed fields stay hidden.
    expect(row?.text).toBeUndefined();
    expect(row).toMatchObject({ id: "m1", conversationId: "chat_1" });
    expect(encrypt).toHaveBeenCalledWith(
      expect.objectContaining({ text: "secret text" }),
      { store: "messages", id: "m1" },
    );
    raw.close();

    await expect(openStore({ encrypt: (fields) => fields })).rejects.toThrow(
      /encrypt and decrypt/,
    );
    await expect(openStore({ name: " " })).rejects.toThrow(/name/);
  });

  it("broadcasts committed changes to other tabs", async () => {
    const channels: FakeChannel[] = [];
    class FakeChannel implements BroadcastChannelLike {
      onmessage: ((event: MessageEvent) => void) | null = null;
      closed = false;
      constructor(readonly name: string) {
        channels.push(this);
      }
      postMessage(message: unknown) {
        for (const peer of channels)
          if (peer !== this && peer.name === this.name && !peer.closed)
            peer.onmessage?.({
              data: structuredClone(message),
            } as MessageEvent);
      }
      close() {
        this.closed = true;
      }
    }
    const factory = new IDBFactory();
    const options = {
      name: "tabs",
      indexedDB: factory,
      broadcastChannel: (name: string) => new FakeChannel(name),
    };
    const tabA = await openStore(options);
    const tabB = await openStore(options);
    const seen: StoreChange[] = [];
    tabB.subscribe("messages", (change) => seen.push(change));
    await tabA.ingest(received("m1", "hi"));
    expect(seen).toEqual([
      { store: "messages", keys: ["m1"], deleted: [], origin: "remote" },
    ]);
    expect(await tabB.messages.get("m1")).toMatchObject({ text: "hi" });
    tabA.close();
    tabB.close();
    expect(channels.every(({ closed }) => closed)).toBe(true);
  });

  it("reports storage usage and persistence when the browser supports it", async () => {
    const store = await openStore({ indexedDB: null });
    const storage = {
      estimate: vi.fn(async () => ({ usage: 10, quota: 100 })),
      persist: vi.fn(async () => true),
    };
    vi.stubGlobal("navigator", { storage });
    try {
      expect(await store.estimateUsage()).toEqual({ usage: 10, quota: 100 });
      expect(await store.persist()).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
    vi.stubGlobal("navigator", {});
    try {
      expect(await store.estimateUsage()).toBeUndefined();
      expect(await store.persist()).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
    store.close();
  });
});
