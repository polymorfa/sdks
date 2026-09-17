import {
  ConversationController,
  type ConversationMessage,
} from "@polymorfa/browser";
import { describe, expect, it, vi } from "vitest";

import {
  createStoreConversationSource,
  type PolymorfaStore,
} from "../src/index.js";
import { BASE_TIME, event, openStore, received } from "./helpers.js";

const at = (offset: number) => Math.floor((BASE_TIME + offset) / 1000) * 1000;

function remote(id: string, offset: number, text = id): ConversationMessage {
  return {
    id,
    text,
    createdAt: at(offset),
    direction: "inbound",
    status: "sent",
  };
}

async function settle(controller: ConversationController, ids: string[]) {
  await vi.waitFor(() =>
    expect(
      controller
        .getSnapshot()
        .messages.map(({ id }) => id)
        .sort(),
    ).toEqual([...ids].sort()),
  );
}

async function seeded(): Promise<PolymorfaStore> {
  const store = await openStore();
  await store.ingest([
    received("m1", "one", { at: 1_000 }),
    received("m2", "two", { at: 2_000 }),
    received("m3", "three", { at: 3_000 }),
  ]);
  return store;
}

describe("createStoreConversationSource with ConversationController", () => {
  it("hydrates from the store, then reconciles with the backend", async () => {
    const store = await seeded();
    let resolveLoad: (page: { messages: ConversationMessage[] }) => void = () =>
      undefined;
    const load = vi.fn(
      () =>
        new Promise<{ messages: ConversationMessage[]; nextCursor?: string }>(
          (resolve) => {
            resolveLoad = resolve;
          },
        ),
    );
    const controller = new ConversationController(
      createStoreConversationSource(store, {
        conversationId: "chat_1",
        pageSize: 2,
        load,
        send: vi.fn(),
      }),
    );
    await controller.load();
    expect(controller.getSnapshot()).toMatchObject({
      status: "ready",
      hasMore: true,
    });
    expect(
      controller
        .getSnapshot()
        .messages.map(({ id }) => id)
        .sort(),
    ).toEqual(["m2", "m3"]);
    resolveLoad({
      messages: [remote("m3", 3_000, "three"), remote("m4", 4_000, "four")],
    });
    await settle(controller, ["m2", "m3", "m4"]);
    expect(await store.messages.get("m4")).toMatchObject({ text: "four" });

    await controller.loadMore();
    await settle(controller, ["m1", "m2", "m3", "m4"]);
    // The local copy is exhausted and the backend reported no more pages.
    await controller.loadMore();
    expect(controller.getSnapshot().hasMore).toBe(false);
    controller.dispose();
    store.close();
  });

  it("waits for the backend when the store is empty and pages through it", async () => {
    const store = await openStore();
    const load = vi.fn(async (cursor?: string) =>
      cursor === undefined
        ? { messages: [remote("r2", 2_000)], nextCursor: "page-2" }
        : { messages: [remote("r1", 1_000)] },
    );
    const controller = new ConversationController(
      createStoreConversationSource(store, {
        conversationId: "chat_1",
        load,
        send: vi.fn(),
      }),
    );
    await controller.load();
    expect(controller.getSnapshot().messages.map(({ id }) => id)).toEqual([
      "r2",
    ]);
    await controller.loadMore();
    expect(load).toHaveBeenLastCalledWith("page-2", expect.any(AbortSignal));
    await settle(controller, ["r1", "r2"]);
    expect(controller.getSnapshot().hasMore).toBe(false);
    expect(await store.messages.get("r1")).toBeDefined();
    controller.dispose();
    store.close();
  });

  it("follows live store changes and deletions", async () => {
    const store = await seeded();
    const controller = new ConversationController(
      createStoreConversationSource(store, {
        conversationId: "chat_1",
        send: vi.fn(),
      }),
    );
    await controller.load();
    await store.ingest([
      received("m5", "live", { at: 5_000 }),
      received("other", "elsewhere", {
        at: 5_000,
        conversation: { id: "chat_2", phoneNumber: "+1" },
      }),
    ]);
    await settle(controller, ["m1", "m2", "m3", "m5"]);
    await store.ingest(
      event("message.revoked", {
        id: "rev",
        whatsapp_id: "wa",
        conversation: { id: "chat_1" },
        fromMe: false,
        timestamp: 6,
        pushName: "",
        isGroup: false,
        type: "revoke",
        revokedId: "m2",
      }),
    );
    await settle(controller, ["m1", "m3", "m5"]);
    controller.dispose();
    store.close();
  });

  it("sends through the callback and records the acknowledged message", async () => {
    const store = await openStore();
    const send = vi.fn(async (message: { clientId: string; text: string }) => ({
      id: "srv_1",
      clientId: message.clientId,
      text: message.text,
      createdAt: at(9_000),
      direction: "outbound" as const,
      status: "sent" as const,
    }));
    const controller = new ConversationController(
      createStoreConversationSource(store, {
        conversationId: "chat_1",
        send,
        session: "support",
      }),
      { createClientId: () => "client_1" },
    );
    await controller.load();
    await controller.send({ text: "hello" });
    expect(controller.getSnapshot().messages).toEqual([
      expect.objectContaining({
        id: "srv_1",
        clientId: "client_1",
        status: "sent",
      }),
    ]);
    expect(await store.messages.get("srv_1")).toMatchObject({
      fromMe: true,
      text: "hello",
      clientId: "client_1",
      session: "support",
    });
    // A later delivery receipt keeps the stored message current.
    await store.ingest(
      event("message.ack", {
        messages: [{ id: "srv_1", whatsapp_id: "wa" }],
        conversation: { id: "chat_1" },
        type: "delivered",
        timestamp: 10,
      }),
    );
    expect((await store.messages.get("srv_1"))?.status).toBe("delivered");
    expect(controller.getSnapshot().messages).toHaveLength(1);
    controller.dispose();
    store.close();
  });

  it("reports a failed background reconcile", async () => {
    const store = await seeded();
    const onError = vi.fn();
    const controller = new ConversationController(
      createStoreConversationSource(store, {
        conversationId: "chat_1",
        load: async () => {
          throw new Error("backend down");
        },
        send: vi.fn(),
        onError,
      }),
    );
    await controller.load();
    expect(controller.getSnapshot().status).toBe("ready");
    await vi.waitFor(() => expect(onError).toHaveBeenCalled());
    controller.dispose();
    store.close();
  });
});
