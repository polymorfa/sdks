import { expect, it, vi } from "vitest";
import {
  createConversationSession,
  type ConversationMessage,
  type OutgoingMessage,
} from "../../src/browser/index.js";

it("keeps the draft and retry identity until confirmation, then uses the server receipt", async () => {
  let attempts = 0;
  const send = vi.fn(
    async (outgoing: OutgoingMessage): Promise<ConversationMessage> => {
      if (attempts++ === 0) throw new Error("Connection lost");
      return {
        ...outgoing,
        id: "server-id",
        createdAt: 23,
        direction: "outbound",
        status: "sent",
      };
    },
  );
  const session = createConversationSession(
    {
      load: async () => ({ messages: [] }),
      subscribe: () => () => undefined,
      send,
    },
    { draft: "Hello", conversation: { createClientId: () => "request-id" } },
  );
  await session.conversation.load();
  session.composer.setReplyTo("parent");
  await session.composer.submit();
  expect(session.composer.getSnapshot().error).toBe("Connection lost");
  expect(session.composer.getSnapshot().text).toBe("Hello");
  await session.composer.submit();
  expect(send).toHaveBeenCalledTimes(2);
  expect(
    send.mock.calls.map(([message]) => [message.clientId, message.replyTo]),
  ).toEqual([
    ["request-id", "parent"],
    ["request-id", "parent"],
  ]);
  expect(session.conversation.getSnapshot().messages).toEqual([
    expect.objectContaining({ id: "server-id", createdAt: 23, status: "sent" }),
  ]);
  expect(session.composer.getSnapshot().text).toBe("");
  session.dispose();
});

it("aborts an in-flight history read and upload together when the owning scope closes", async () => {
  let readSignal: AbortSignal | undefined;
  let uploadSignal: AbortSignal | undefined;
  const session = createConversationSession(
    {
      load: async (_, signal) => {
        readSignal = signal;
        return new Promise(() => {});
      },
      subscribe: () => () => undefined,
      send: vi.fn(),
    },
    {
      upload: async (_, __, signal) => {
        uploadSignal = signal;
        return new Promise(() => {});
      },
    },
  );
  void session.conversation.load();
  void session.composer.addAttachment({
    id: "a",
    name: "photo.png",
    contentType: "image/png",
    size: 1,
    file: new Blob(["a"]),
  });
  session.dispose();
  session.dispose();
  expect(readSignal?.aborted).toBe(true);
  expect(uploadSignal?.aborted).toBe(true);
});

it("refuses to send while unavailable, keeping the draft and adding no failed message", async () => {
  const send = vi.fn();
  const session = createConversationSession(
    {
      load: async () => ({ messages: [] }),
      subscribe: () => () => undefined,
      send,
    },
    { draft: "Keep this draft", sendUnavailable: "Sending is not available" },
  );
  await session.conversation.load();
  await session.composer.submit();
  expect(session.composer.getSnapshot().error).toBe("Sending is not available");
  expect(session.composer.getSnapshot().text).toBe("Keep this draft");
  expect(session.conversation.getSnapshot().messages).toHaveLength(0);
  expect(send).not.toHaveBeenCalled();
  session.dispose();
});
