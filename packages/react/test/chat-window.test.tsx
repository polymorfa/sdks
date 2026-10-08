// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import {
  ConversationController,
  MessageComposerController,
  createConversationComposerActions,
} from "@polymorfa/browser";
import { ChatWindow, PolymorfaProvider } from "../src/index.js";
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

it("renders an inline thread with observed receipts, safe media, and host-controlled sending", async () => {
  const source = {
    load: vi.fn(async () => ({
      messages: [
        {
          id: "in",
          text: "Listen",
          createdAt: 1,
          direction: "inbound" as const,
          status: "sent" as const,
          attachments: [
            {
              id: "a",
              name: "voice.ogg",
              size: 12,
              contentType: "audio/ogg",
              url: "https://media.example/voice.ogg",
            },
            {
              id: "bad",
              name: "unsafe.mp4",
              size: 12,
              contentType: "video/mp4",
              url: "javascript:alert(1)",
            },
          ],
        },
        {
          id: "out",
          text: "Acknowledged",
          createdAt: 2,
          direction: "outbound" as const,
          status: "sent" as const,
          receipt: { state: "read" as const },
        },
      ],
    })),
    subscribe: () => () => undefined,
    send: vi.fn(),
  };
  const conversation = new ConversationController(source);
  await conversation.load();
  const composer = new MessageComposerController(
    createConversationComposerActions(conversation, vi.fn()),
  );
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const render = (
    disabled: boolean,
    filter?: (message: { id: string }) => boolean,
  ) =>
    act(() =>
      root.render(
        <PolymorfaProvider>
          <ChatWindow
            controller={conversation}
            composerController={composer}
            disabled={disabled}
            header={<h2>Marina</h2>}
            composerProps={{ attachments: false, voiceNotes: false }}
            {...(filter ? { messageFilter: filter } : {})}
          />
        </PolymorfaProvider>,
      ),
    );
  render(true);
  expect(host.querySelector('[role="dialog"]')).toBeNull();
  expect(host.querySelector("audio")?.getAttribute("src")).toBe(
    "https://media.example/voice.ogg",
  );
  expect(host.querySelector("audio")?.getAttribute("preload")).toBe("none");
  expect(host.querySelector("video")).toBeNull();
  expect(host.querySelector(".pmfa-status-read")).not.toBeNull();
  expect(host.querySelector("fieldset")?.disabled).toBe(true);
  expect(host.querySelector('[data-slot="replyButton"]')).toBeNull();
  render(false);
  act(() =>
    (
      host.querySelector('[data-slot="replyButton"]') as HTMLButtonElement
    ).click(),
  );
  expect(composer.getSnapshot().replyTo).toBe("in");
  render(false, (message) => message.id === "out");
  expect(host.querySelector('[data-message-id="in"]')).toBeNull();
  expect(conversation.getSnapshot().messages).toHaveLength(2);
  expect(source.load).toHaveBeenCalledTimes(1);
  act(() => root.unmount());
  host.remove();
  composer.dispose();
  conversation.dispose();
});

it("keeps latest messages in view on resize without pulling a reader from history", async () => {
  let resize = () => {};
  const disconnect = vi.fn();
  const originalObserver = globalThis.ResizeObserver;
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: () => void) {
        resize = callback;
      }
      observe() {}
      disconnect = disconnect;
    },
  );
  const conversation = new ConversationController({
    load: async () => ({ messages: [] }),
    subscribe: () => () => undefined,
    send: vi.fn(),
  });
  await conversation.load();
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    act(() =>
      root.render(
        <PolymorfaProvider>
          <ChatWindow controller={conversation} />
        </PolymorfaProvider>,
      ),
    );
    const list = host.querySelector('[role="log"]') as HTMLDivElement;
    Object.defineProperties(list, {
      scrollHeight: { value: 1000 },
      clientHeight: { value: 300 },
    });
    resize();
    expect(list.scrollTop).toBe(1000);
    act(() => {
      list.scrollTop = 200;
      list.dispatchEvent(new Event("scroll", { bubbles: true }));
    });
    resize();
    expect(list.scrollTop).toBe(200);
  } finally {
    act(() => root.unmount());
    host.remove();
    conversation.dispose();
    vi.stubGlobal("ResizeObserver", originalObserver);
  }
  expect(disconnect).toHaveBeenCalledOnce();
});

it("reports a history error and lets the host retry it", async () => {
  const load = vi
    .fn()
    .mockRejectedValueOnce(new Error("History access unavailable"))
    .mockResolvedValue({ messages: [] });
  const conversation = new ConversationController({
    load,
    subscribe: () => () => undefined,
    send: vi.fn(),
  });
  await conversation.load();
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  act(() =>
    root.render(
      <PolymorfaProvider>
        <ChatWindow controller={conversation} />
      </PolymorfaProvider>,
    ),
  );
  expect(host.querySelector('[role="alert"]')?.textContent).toContain(
    "History access unavailable",
  );
  await act(async () =>
    (host.querySelector('[role="alert"] button') as HTMLButtonElement).click(),
  );
  expect(host.querySelector('[role="alert"]')).toBeNull();
  expect(load).toHaveBeenCalledTimes(2);
  act(() => root.unmount());
  host.remove();
  conversation.dispose();
});
