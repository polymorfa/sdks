// @vitest-environment happy-dom
import { expect, it, vi } from "vitest";
import {
  ConversationController,
  MessageComposerController,
  createConversationComposerActions,
} from "@polymorfa/browser";
import {
  defineChatElements,
  type PolymorfaChatWindowElement,
} from "../src/index.js";

it("composes an inline portable chat and leaves Escape to the host", async () => {
  defineChatElements();
  const conversation = new ConversationController({
    load: async () => ({
      messages: [
        {
          id: "one",
          text: "Hello",
          createdAt: 1,
          direction: "outbound",
          status: "sent",
          receipt: { state: "delivered" },
          attachments: [
            {
              id: "a",
              name: "demo.mp4",
              size: 12,
              contentType: "video/mp4",
              url: "https://media.example/demo.mp4",
            },
          ],
        },
      ],
    }),
    subscribe: () => () => undefined,
    send: vi.fn(),
  });
  await conversation.load();
  const composer = new MessageComposerController(
    createConversationComposerActions(conversation, vi.fn()),
  );
  const node = document.createElement(
    "pmfa-chat-window",
  ) as PolymorfaChatWindowElement;
  node.setAttribute("heading", "Marina");
  node.controller = conversation;
  node.composerController = composer;
  document.body.append(node);
  expect(node.shadowRoot?.querySelector('[role="dialog"]')).toBeNull();
  expect(node.shadowRoot?.querySelector('[role="region"]')).not.toBeNull();
  expect(
    node.shadowRoot?.querySelector(".pmfa-status-delivered"),
  ).not.toBeNull();
  expect(node.shadowRoot?.querySelector("video")?.preload).toBe("none");
  window.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
    }),
  );
  expect(node.open).toBe(true);
  node.messageFilter = () => false;
  expect(node.shadowRoot?.querySelector("[data-message-id]")).toBeNull();
  expect(conversation.getSnapshot().messages).toHaveLength(1);
  node.remove();
  composer.dispose();
  conversation.dispose();
});

it("keeps the reader position on resize and disconnects its observer", async () => {
  let resize = () => {};
  const disconnect = vi.fn();
  const observe = vi.fn();
  const originalObserver = globalThis.ResizeObserver;
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: () => void) {
        resize = callback;
      }
      observe = observe;
      disconnect = disconnect;
    },
  );
  defineChatElements();
  const conversation = new ConversationController({
    load: async () => ({ messages: [] }),
    subscribe: () => () => undefined,
    send: vi.fn(),
  });
  await conversation.load();
  const node = document.createElement(
    "pmfa-chat-window",
  ) as PolymorfaChatWindowElement;
  node.controller = conversation;
  document.body.append(node);
  await Promise.resolve();
  try {
    const list = node.shadowRoot!.querySelector(
      '[role="log"]',
    ) as HTMLDivElement;
    expect(observe).toHaveBeenCalledWith(list);
    expect(observe).toHaveBeenCalledWith(list.firstElementChild);
    Object.defineProperties(list, {
      scrollHeight: { value: 1000 },
      clientHeight: { value: 300 },
    });
    resize();
    expect(list.scrollTop).toBe(1000);
    list.scrollTop = 200;
    list.dispatchEvent(new Event("scroll"));
    resize();
    expect(list.scrollTop).toBe(200);
  } finally {
    node.remove();
    conversation.dispose();
    vi.stubGlobal("ResizeObserver", originalObserver);
  }
  expect(disconnect).toHaveBeenCalledOnce();
});
