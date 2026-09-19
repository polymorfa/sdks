import {
  InboxController,
  type InboxConversation,
  type InboxDataSource,
} from "@polymorfa/browser";
import { describe, expect, it, vi } from "vitest";

import { createStoreInboxSource } from "../src/index.js";
import { openStore, received } from "./helpers.js";

function backend(): InboxDataSource {
  return {
    listConversations: vi.fn(async () => ({
      conversations: [
        {
          id: "remote_1",
          lastActivity: 1,
          unreadCount: 0,
        } as InboxConversation,
      ],
    })),
    conversation: () => ({
      load: vi.fn(async () => ({ messages: [] })),
      subscribe: () => () => undefined,
      send: vi.fn(),
    }),
  };
}

describe("createStoreInboxSource", () => {
  it("falls back to the backend while the store is empty", async () => {
    const store = await openStore();
    const remote = backend();
    const inbox = new InboxController(
      createStoreInboxSource(store, { backend: remote }),
    );
    await inbox.load();
    expect(inbox.getSnapshot().conversations.map(({ id }) => id)).toEqual([
      "remote_1",
    ]);
    inbox.dispose();
    store.close();
  });

  it("lists stored conversations and follows ingested events", async () => {
    const store = await openStore();
    await store.ingest(received("m1", "first", { at: 1_000 }));
    const remote = backend();
    const inbox = new InboxController(
      createStoreInboxSource(store, { backend: remote }),
    );
    await inbox.load();
    expect(remote.listConversations).not.toHaveBeenCalled();
    expect(inbox.getSnapshot().conversations[0]).toMatchObject({
      id: "chat_1",
      session: "support",
      lastMessage: { text: "first", direction: "inbound" },
      unreadCount: 1,
    });
    await store.ingest(received("m2", "second", { at: 2_000 }));
    await vi.waitFor(() =>
      expect(inbox.getSnapshot().conversations[0]).toMatchObject({
        lastMessage: { text: "second" },
        unreadCount: 2,
      }),
    );
    const conversation = inbox.conversation(
      inbox.getSnapshot().conversations[0]!,
    );
    await vi.waitFor(() =>
      expect(conversation.getSnapshot().messages.map(({ id }) => id)).toEqual([
        "m1",
        "m2",
      ]),
    );
    inbox.dispose();
    store.close();
  });
});
