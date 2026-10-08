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
