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

function fileEvent(type: string, files: File[]): Event {
  const event = new Event(type, {
    bubbles: true,
    cancelable: true,
    composed: true,
  });
  Object.defineProperty(event, "dataTransfer", {
    value: { types: ["Files"], files, dropEffect: "none" },
  });
  return event;
}

it("attaches files dropped anywhere on the inline chat through its composer", async () => {
  defineChatElements();
  const conversation = new ConversationController({
    load: async () => ({ messages: [] }),
    subscribe: () => () => undefined,
    send: vi.fn(),
  });
  await conversation.load();
  const composer = new MessageComposerController(
    createConversationComposerActions(conversation, vi.fn() as never),
  );
  const add = vi.spyOn(composer, "addAttachment").mockResolvedValue();
  const node = document.createElement(
    "pmfa-chat-window",
  ) as PolymorfaChatWindowElement;
  node.controller = conversation;
  node.composerController = composer;
  document.body.append(node);
  await Promise.resolve();
  const root = node.shadowRoot!;
  const panel = root.querySelector<HTMLElement>(".pmfa-chat-window")!;
  const list = root.querySelector<HTMLElement>('[role="log"]')!;
  const file = new File(["x"], "photo.png", { type: "image/png" });
  list.dispatchEvent(fileEvent("dragenter", [file]));
  expect(panel.hasAttribute("data-dropping")).toBe(true);
  expect(root.querySelector(".pmfa-window-drop")).not.toBeNull();
  list.dispatchEvent(fileEvent("drop", [file]));
  expect(panel.hasAttribute("data-dropping")).toBe(false);
  expect(root.querySelector(".pmfa-window-drop")).toBeNull();
  expect(add).toHaveBeenCalledTimes(1);
  root.querySelector("form")!.dispatchEvent(fileEvent("drop", [file]));
  expect(add).toHaveBeenCalledTimes(2);
  node.remove();
  composer.dispose();
  conversation.dispose();
});
