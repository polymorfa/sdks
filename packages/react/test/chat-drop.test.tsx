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

function fileEvent(type: string, files: File[]): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "dataTransfer", {
    value: { types: ["Files"], files, dropEffect: "none" },
  });
  return event;
}

async function mount(attachments: boolean, disabled = false) {
  const conversation = new ConversationController({
    load: async () => ({ messages: [] }),
    subscribe: () => () => undefined,
    send: vi.fn(),
  });
  await conversation.load();
  const upload = vi.fn(async (file: { name: string }) => ({
    id: "uploaded",
    name: file.name,
    size: 1,
    contentType: "image/png",
  }));
  const composer = new MessageComposerController(
    createConversationComposerActions(conversation, upload as never),
  );
  const add = vi.spyOn(composer, "addAttachment");
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(() =>
    root.render(
      <PolymorfaProvider>
        <ChatWindow
          controller={conversation}
          composerController={composer}
          disabled={disabled}
          composerProps={{ attachments, voiceNotes: false }}
        />
      </PolymorfaProvider>,
    ),
  );
  return {
    host,
    add,
    unmount: () => {
      act(() => root.unmount());
      host.remove();
      composer.dispose();
      conversation.dispose();
    },
  };
}

it("attaches files dropped anywhere on the chat window through the composer", async () => {
  const view = await mount(true);
  const windowNode = view.host.querySelector<HTMLElement>(".pmfa-chat-window")!;
  const list = view.host.querySelector<HTMLElement>('[role="log"]')!;
  const file = new File(["x"], "photo.png", { type: "image/png" });
  act(() => {
    list.dispatchEvent(fileEvent("dragenter", [file]));
  });
  expect(windowNode.hasAttribute("data-dropping")).toBe(true);
  expect(view.host.querySelector(".pmfa-window-drop")?.textContent).toContain(
    "Drop files to attach",
  );
  act(() => {
    list.dispatchEvent(fileEvent("drop", [file]));
  });
  expect(windowNode.hasAttribute("data-dropping")).toBe(false);
  expect(view.add).toHaveBeenCalledTimes(1);
  // A drop on the composer itself is handled once, not twice.
  act(() => {
    view.host.querySelector("form")!.dispatchEvent(fileEvent("drop", [file]));
  });
  expect(view.add).toHaveBeenCalledTimes(2);
  view.unmount();
});

it("ignores dropped files when attachments are off or the window is disabled", async () => {
  for (const [attachments, disabled] of [
    [false, false],
    [true, true],
  ] as const) {
    const view = await mount(attachments, disabled);
    const list = view.host.querySelector<HTMLElement>('[role="log"]')!;
    const file = new File(["x"], "photo.png", { type: "image/png" });
    act(() => {
      list.dispatchEvent(fileEvent("dragenter", [file]));
      list.dispatchEvent(fileEvent("drop", [file]));
    });
    expect(view.host.querySelector(".pmfa-window-drop")).toBeNull();
    expect(view.add).not.toHaveBeenCalled();
    view.unmount();
  }
});
