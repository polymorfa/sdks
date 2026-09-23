// @vitest-environment happy-dom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { MessageComposerController } from "@polymorfa/browser";
import {
  definePolymorfaElements,
  type PolymorfaChatDrawerElement,
  type PolymorfaComposeBoxElement,
} from "../src/index.js";

beforeAll(() => definePolymorfaElements());

function composer(send = vi.fn(async () => undefined)) {
  return new MessageComposerController({
    upload: async (attachment) => ({
      id: attachment.id,
      name: attachment.name,
      size: attachment.size,
      contentType: attachment.contentType,
    }),
    send,
  });
}

function mount(
  controller: MessageComposerController,
  attributes: Record<string, string> = {},
) {
  const box = document.createElement(
    "pmfa-compose-box",
  ) as PolymorfaComposeBoxElement;
  for (const [name, value] of Object.entries(attributes))
    box.setAttribute(name, value);
  box.controller = controller as never;
  document.body.append(box);
  return { box, root: box.shadowRoot! };
}

function type(input: HTMLTextAreaElement, value: string, caret = value.length) {
  input.value = value;
  input.setSelectionRange(caret, caret);
  input.dispatchEvent(new Event("input"));
}

function key(target: Element, name: string) {
  target.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: name,
      bubbles: true,
      composed: true,
      cancelable: true,
    }),
  );
}

afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  delete (navigator as { mediaDevices?: unknown }).mediaDevices;
  localStorage.clear();
});

describe("pmfa-compose-box parity", () => {
  it("offers quick replies with the combobox pattern and an event", () => {
    const controller = composer();
    const { box, root } = mount(controller, { placeholder: "Reply" });
    box.quickReplies = [
      { id: "a", shortcut: "thanks", text: "Thank you!" },
      { id: "b", shortcut: "hours", text: "Open 9 to 5." },
    ];
    const events: unknown[] = [];
    box.addEventListener("pmfa-quick-reply", (event) =>
      events.push((event as CustomEvent).detail),
    );
    const input = root.querySelector("textarea")!;
    expect(input.placeholder).toBe("Reply");
    expect(input.getAttribute("role")).toBe("combobox");
    type(input, "/");
    expect(input.getAttribute("aria-expanded")).toBe("true");
    const menu = root.querySelector('[part~="quick-reply-menu"]')!;
    const options = menu.querySelectorAll('[role="option"]');
    expect(options).toHaveLength(2);
    key(input, "ArrowDown");
    expect(input.getAttribute("aria-activedescendant")).toBe(options[1]!.id);
    key(input, "Enter");
    expect(controller.getSnapshot().text).toBe("Open 9 to 5.");
    expect(events).toEqual([box.quickReplies[1]]);
    expect(input.getAttribute("aria-expanded")).toBe("false");
    type(input, "/t");
    key(input, "Escape");
    expect(input.getAttribute("aria-expanded")).toBe("false");
    controller.dispose();
  });

  it("inserts emoji at the caret and honours emoji=false", () => {
    const controller = composer();
    const { box, root } = mount(controller);
    const input = root.querySelector("textarea")!;
    type(input, "ab", 1);
    const button = root.querySelector<HTMLButtonElement>(
      '[part~="emoji-button"]',
    )!;
    button.click();
    expect(button.getAttribute("aria-expanded")).toBe("true");
    const picker = root.querySelector('[part~="emoji-picker"]')!;
    expect(picker.getAttribute("role")).toBe("dialog");
    const cell = picker.querySelector<HTMLButtonElement>(".pmfa-emoji-cell")!;
    cell.click();
    expect(controller.getSnapshot().text).toBe(`a${cell.textContent}b`);
    expect(input.selectionStart).toBe(1 + cell.textContent!.length);
    key(picker, "Escape");
    expect(root.querySelector('[part~="emoji-picker"]')).toBeNull();
    box.setAttribute("emoji", "false");
    expect(
      root.querySelector<HTMLElement>('[part~="emoji-button"]')!.hidden,
    ).toBe(true);
    controller.dispose();
  });

  it("exposes start and end action slots", () => {
    const controller = composer();
    const { root } = mount(controller);
    const names = [...root.querySelectorAll("slot")].map((slot) => slot.name);
    expect(names).toEqual(["start-actions", "end-actions"]);
    controller.dispose();
  });

  it("records a voice note and honours voice-notes=false", async () => {
    const track = { stop: vi.fn() };
    class FakeRecorder {
      static isTypeSupported = () => true;
      state = "inactive";
      mimeType = "audio/webm;codecs=opus";
      ondataavailable: ((event: { data: Blob }) => void) | null = null;
      onstop: (() => void) | null = null;
      start() {
        this.state = "recording";
      }
      stop() {
        this.ondataavailable?.({ data: new Blob(["x"]) });
        this.onstop?.();
      }
    }
    vi.stubGlobal("MediaRecorder", FakeRecorder);
    vi.stubGlobal("AudioContext", undefined);
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: async () => ({ getTracks: () => [track] }) },
    });
    const send = vi.fn(async () => undefined);
    const controller = composer(send);
    const { box, root } = mount(controller);
    const mic = root.querySelector<HTMLButtonElement>(
      '[part~="voice-button"]',
    )!;
    expect(mic.isConnected).toBe(true);
    mic.click();
    await vi.waitFor(() =>
      expect(root.querySelector('[part~="recording-bar"]')).not.toBeNull(),
    );
    root.querySelector<HTMLButtonElement>('[part~="stop-recording"]')!.click();
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    expect(track.stop).toHaveBeenCalled();
    box.remove();

    const other = composer();
    const off = mount(other, { "voice-notes": "false" });
    expect(off.root.querySelector('[part~="voice-button"]')).toBeNull();
    expect(off.root.querySelector('[part~="composer-send"]')).not.toBeNull();
    controller.dispose();
    other.dispose();
  });

  it("releases an active recording when the drawer closes", async () => {
    const track = { stop: vi.fn() };
    class FakeRecorder {
      static isTypeSupported = () => true;
      state = "inactive";
      mimeType = "audio/webm;codecs=opus";
      ondataavailable: ((event: { data: Blob }) => void) | null = null;
      onstop: (() => void) | null = null;
      start() {
        this.state = "recording";
      }
      stop() {
        this.state = "inactive";
        this.onstop?.();
      }
    }
    vi.stubGlobal("MediaRecorder", FakeRecorder);
    vi.stubGlobal("AudioContext", undefined);
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: async () => ({ getTracks: () => [track] }) },
    });
    const controller = composer();
    const drawer = document.createElement(
      "pmfa-chat-drawer",
    ) as PolymorfaChatDrawerElement;
    drawer.composerController = controller;
    document.body.append(drawer);
    const root = drawer.shadowRoot!;
    root.querySelector<HTMLButtonElement>('[part~="voice-button"]')!.click();
    await vi.waitFor(() =>
      expect(root.querySelector('[part~="recording-bar"]')).not.toBeNull(),
    );
    drawer.open = false;
    expect(track.stop).toHaveBeenCalled();
    expect(root.querySelector("form")).toBeNull();
    drawer.open = true;
    expect(root.querySelector('[part~="recording-bar"]')).toBeNull();
    expect(root.querySelector('[part~="voice-button"]')).not.toBeNull();
    drawer.remove();
    controller.dispose();
  });
});
