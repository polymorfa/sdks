import { describe, expect, it, vi } from "vitest";

import {
  ConversationController,
  MessageComposerController,
  type ConversationDataSource,
  type ConversationEvent,
} from "../src/index.js";

const message = (id: string, text = id) => ({
  id,
  text,
  createdAt: 1,
  direction: "inbound" as const,
  status: "sent" as const,
});

function fixtureSource() {
  let listener: ((event: ConversationEvent) => void) | undefined;
  const unsubscribe = vi.fn();
  const source: ConversationDataSource = {
    load: vi.fn(async (cursor?: string) =>
      cursor
        ? { messages: [message("older")] }
        : { messages: [], nextCursor: "next" },
    ),
    subscribe: vi.fn((next) => {
      listener = next;
      return unsubscribe;
    }),
    send: vi.fn(async (draft) => ({
      ...message("server-1", draft.text),
      direction: "outbound" as const,
      clientId: draft.clientId,
    })),
  };
  return {
    source,
    emit: (event: ConversationEvent) => listener?.(event),
    unsubscribe,
  };
}

describe("ConversationController", () => {
  it("treats empty application history as ready and paginates", async () => {
    const fixture = fixtureSource();
    const controller = new ConversationController(fixture.source);
    await controller.load();
    expect(controller.getSnapshot()).toMatchObject({
      status: "ready",
      messages: [],
      hasMore: true,
    });
    await controller.loadMore();
    expect(controller.getSnapshot()).toMatchObject({
      status: "ready",
      hasMore: false,
    });
    expect(controller.getSnapshot().messages.map(({ id }) => id)).toEqual([
      "older",
    ]);
  });

  it("merges subscription updates and deduplicates acknowledgements", async () => {
    const fixture = fixtureSource();
    const controller = new ConversationController(fixture.source, {
      createClientId: () => "client-1",
    });
    await controller.load();
    const sending = controller.send({ text: "hello" });
    expect(controller.getSnapshot().messages[0]).toMatchObject({
      clientId: "client-1",
      status: "pending",
    });
    fixture.emit({ type: "upsert", message: message("incoming") });
    await sending;
    fixture.emit({
      type: "upsert",
      message: { ...message("server-1", "hello"), clientId: "client-1" },
    });
    expect(
      controller
        .getSnapshot()
        .messages.map(({ id }) => id)
        .sort(),
    ).toEqual(["incoming", "server-1"]);
  });

  it("marks failed sends, retries them, and tears down", async () => {
    const fixture = fixtureSource();
    vi.mocked(fixture.source.send).mockRejectedValueOnce(new Error("offline"));
    const controller = new ConversationController(fixture.source, {
      createClientId: () => "client-1",
    });
    await controller.load();
    await controller.send({ text: "hello" });
    expect(controller.getSnapshot().messages[0]).toMatchObject({
      status: "failed",
      error: "offline",
    });
    await controller.retry("client-1");
    expect(controller.getSnapshot().messages[0]).toMatchObject({
      id: "server-1",
      status: "sent",
    });
    controller.dispose();
    expect(fixture.unsubscribe).toHaveBeenCalledTimes(1);
  });
});

describe("MessageComposerController", () => {
  it("manages reply context, upload progress, send locking, and resets after send", async () => {
    const upload = vi.fn(
      async (_attachment, progress: (value: number) => void) => {
        progress(0.5);
        return {
          id: "media-1",
          name: "photo.png",
          size: 10,
          contentType: "image/png",
        };
      },
    );
    let resolveSend!: () => void;
    const send = vi.fn(
      () => new Promise<void>((resolve) => (resolveSend = resolve)),
    );
    const controller = new MessageComposerController({ upload, send });
    controller.setText("hello");
    controller.setReplyTo("message-1");
    await controller.addAttachment({
      id: "local-1",
      name: "photo.png",
      size: 10,
      contentType: "image/png",
    });
    expect(controller.getSnapshot().attachments[0]).toMatchObject({
      status: "ready",
      progress: 1,
    });
    const submitting = controller.submit();
    expect(controller.getSnapshot().sending).toBe(true);
    await expect(controller.submit()).rejects.toThrow("already sending");
    resolveSend();
    await submitting;
    expect(controller.getSnapshot()).toMatchObject({
      text: "",
      attachments: [],
      sending: false,
    });
    expect(controller.getSnapshot().replyTo).toBeUndefined();
    expect(send).toHaveBeenCalledWith(
      {
        text: "hello",
        replyTo: "message-1",
        attachments: [
          {
            id: "media-1",
            name: "photo.png",
            size: 10,
            contentType: "image/png",
          },
        ],
      },
      expect.any(AbortSignal),
    );
  });

  it("validates drafts and cancels in-flight uploads", async () => {
    const upload = vi.fn(
      (_attachment, _progress, signal: AbortSignal) =>
        new Promise<never>((_resolve, reject) =>
          signal.addEventListener("abort", () =>
            reject(new Error("cancelled")),
          ),
        ),
    );
    const controller = new MessageComposerController(
      { upload, send: vi.fn(async () => undefined) },
      { maxTextLength: 3 },
    );
    controller.setText("long");
    await expect(controller.submit()).rejects.toThrow("3 characters");
    const pending = controller.addAttachment({
      id: "local-1",
      name: "a.txt",
      size: 1,
      contentType: "text/plain",
    });
    controller.cancelAttachment("local-1");
    await pending;
    expect(controller.getSnapshot().attachments).toEqual([]);
  });
});
