import { ConversationController } from "@polymorfa/browser";
import { describe, expect, it, vi } from "vitest";

import { createStoreConversationSource } from "../src/index.js";
import { BASE_TIME, chat, event, openStore } from "./helpers.js";

const JPEG = "/9j/4AAQSkZJRgABAQ==";

function media(id: string, at: number, extra: Record<string, unknown> = {}) {
  return event(
    "message.received",
    {
      id,
      conversation: { ...chat, sender: { id: "contact_1" } },
      fromMe: false,
      timestamp: Math.floor((BASE_TIME + at) / 1000),
      type: "image",
      mimeType: "image/jpeg",
      width: 1280,
      height: 960,
      thumbnail: {
        contentType: "image/jpeg",
        data: JPEG,
        width: 100,
        height: 75,
      },
      ...extra,
    },
    { at },
  );
}

describe("media metadata and HD pairing", () => {
  it("maps media metadata and link previews without a download URL", async () => {
    const store = await openStore();
    await store.ingest([
      media("p1", 1_000, { media: "b3BhcXVl" }),
      event(
        "message.received",
        {
          id: "t1",
          conversation: { ...chat, sender: { id: "contact_1" } },
          fromMe: false,
          timestamp: Math.floor((BASE_TIME + 2_000) / 1000),
          type: "text",
          text: "see https://example.com/a",
          linkPreview: {
            url: "https://example.com/a",
            title: "Example",
            thumbnail: { contentType: "image/png", data: "xx" },
          },
        },
        { at: 2_000 },
      ),
    ]);
    const picture = await store.messages.get("p1");
    // The opaque `media` descriptor is never used as an ID.
    expect(picture?.attachments?.[0]).toMatchObject({
      id: "p1:media",
      contentType: "image/jpeg",
      width: 1280,
      height: 960,
      thumbnail: { contentType: "image/jpeg", data: JPEG },
    });
    expect(picture?.attachments?.[0]).not.toHaveProperty("url");
    const text = await store.messages.get("t1");
    // A thumbnail with the wrong content type is dropped, not the preview.
    expect(text?.linkPreview).toEqual({
      url: "https://example.com/a",
      title: "Example",
    });
    store.close();
  });

  for (const order of ["parent first", "HD first"] as const) {
    it(`shows one picture with an HD variant when the ${order === "parent first" ? "parent" : "HD child"} arrives first`, async () => {
      const store = await openStore();
      const parent = media("parent", 1_000, {
        mediaUrl: "https://cdn.example/sd.jpg",
      });
      const child = media("child", 1_500, {
        mediaUrl: "https://cdn.example/hd.jpg",
        width: 4000,
        height: 3000,
        quality: "hd",
        association: { type: "hd_image", parentMessageId: "parent" },
      });
      await store.ingest(order === "parent first" ? [parent] : [child]);
      const controller = new ConversationController(
        createStoreConversationSource(store, {
          conversationId: chat.id,
          send: vi.fn(),
        }),
      );
      await controller.load();
      await store.ingest(order === "parent first" ? [child] : [parent]);
      await vi.waitFor(() => {
        const messages = controller.getSnapshot().messages;
        expect(messages.map(({ id }) => id)).toEqual(["parent"]);
        expect(messages[0]?.attachments?.[0]?.hd).toEqual({
          url: "https://cdn.example/hd.jpg",
          width: 4000,
          height: 3000,
        });
      });
      // A fresh load pairs them from stored rows.
      const reloaded = new ConversationController(
        createStoreConversationSource(store, {
          conversationId: chat.id,
          send: vi.fn(),
        }),
      );
      await reloaded.load();
      expect(reloaded.getSnapshot().messages.map(({ id }) => id)).toEqual([
        "parent",
      ]);
      expect(
        reloaded.getSnapshot().messages[0]?.attachments?.[0]?.hd?.url,
      ).toBe("https://cdn.example/hd.jpg");
      controller.dispose();
      reloaded.dispose();
      store.close();
    });
  }
});

describe("HD children and conversation bookkeeping", () => {
  it("does not count an HD child as unread or use it as the preview", async () => {
    const store = await openStore();
    await store.ingest([
      media("parent", 1_000, { caption: "beach" }),
      media("child", 1_500, {
        quality: "hd",
        association: { type: "hd_image", parentMessageId: "parent" },
      }),
    ]);
    const conversation = await store.conversations.get(chat.id);
    expect(conversation?.unreadCount).toBe(1);
    expect(conversation?.lastMessage?.id).toBe("parent");
    store.close();
  });

  it("refreshes an already shown parent when its HD child is on a later page", async () => {
    const store = await openStore();
    // Same timestamp: the parent sorts first, so the child is on page two.
    await store.ingest([
      media("p-parent", 1_000, { mediaUrl: "https://cdn.example/sd.jpg" }),
      media("c-child", 1_000, {
        mediaUrl: "https://cdn.example/hd.jpg",
        quality: "hd",
        association: { type: "hd_image", parentMessageId: "p-parent" },
      }),
      media("older", 500, { mediaUrl: "https://cdn.example/old.jpg" }),
    ]);
    const controller = new ConversationController(
      createStoreConversationSource(store, {
        conversationId: chat.id,
        pageSize: 1,
        send: vi.fn(),
      }),
    );
    await controller.load();
    expect(
      controller.getSnapshot().messages[0]?.attachments?.[0]?.hd,
    ).toBeUndefined();
    await controller.loadMore();
    await vi.waitFor(() => {
      const messages = controller.getSnapshot().messages;
      expect(messages.map(({ id }) => id)).toEqual(["p-parent"]);
      expect(messages[0]?.attachments?.[0]?.hd?.url).toBe(
        "https://cdn.example/hd.jpg",
      );
    });
    controller.dispose();
    store.close();
  });
});
