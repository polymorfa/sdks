// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MessageComposerController } from "@polymorfa/browser";
import { ComposeBox, PolymorfaProvider } from "../src/index.js";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function mount(node: React.ReactNode) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(<PolymorfaProvider>{node}</PolymorfaProvider>));
  return {
    host,
    unmount: () => {
      act(() => root.unmount());
      host.remove();
    },
  };
}

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

function type(
  textarea: HTMLTextAreaElement,
  value: string,
  caret = value.length,
) {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )?.set;
    setter?.call(textarea, value);
    textarea.setSelectionRange(caret, caret);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function key(target: Element, name: string, init: KeyboardEventInit = {}) {
  act(() => {
    target.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: name,
        bubbles: true,
        cancelable: true,
        ...init,
      }),
    );
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

const replies = [
  { id: "thanks", shortcut: "thanks", text: "Thank you!" },
  {
    id: "hours",
    shortcut: "hours",
    text: "We are open 9 to 5.",
    description: "Opening hours",
  },
];

describe("ComposeBox quick replies", () => {
  it("follows the combobox pattern with the keyboard", () => {
    const controller = composer();
    const onQuickReply = vi.fn();
    const view = mount(
      <ComposeBox
        controller={controller}
        quickReplies={replies}
        onQuickReply={onQuickReply}
      />,
    );
    const input = view.host.querySelector("textarea")!;
    expect(input.getAttribute("role")).toBe("combobox");
    expect(input.getAttribute("aria-expanded")).toBe("false");

    type(input, "/");
    expect(input.getAttribute("aria-expanded")).toBe("true");
    const listbox = view.host.querySelector('[role="listbox"]')!;
    expect(input.getAttribute("aria-controls")).toBe(listbox.id);
    const options = listbox.querySelectorAll('[role="option"]');
    expect(options).toHaveLength(2);
    expect(input.getAttribute("aria-activedescendant")).toBe(options[0]!.id);

    key(input, "ArrowDown");
    expect(input.getAttribute("aria-activedescendant")).toBe(options[1]!.id);
    expect(options[1]!.getAttribute("aria-selected")).toBe("true");
    key(input, "ArrowDown");
    expect(input.getAttribute("aria-activedescendant")).toBe(options[0]!.id);
    key(input, "ArrowUp");
    key(input, "Enter");
    expect(controller.getSnapshot().text).toBe("We are open 9 to 5.");
    expect(onQuickReply).toHaveBeenCalledWith(replies[1]);
    expect(input.getAttribute("aria-expanded")).toBe("false");

    type(input, "Hi /th");
    expect(view.host.querySelectorAll('[role="option"]')).toHaveLength(1);
    key(input, "Tab");
    expect(controller.getSnapshot().text).toBe("Hi Thank you!");

    type(input, "/zz");
    expect(input.getAttribute("aria-expanded")).toBe("false");
    type(input, "/h");
    key(input, "Escape");
    expect(input.getAttribute("aria-expanded")).toBe("false");
    key(input, "Enter");
    // Enter sends once the menu is dismissed.
    expect(controller.getSnapshot().sending).toBe(true);
    view.unmount();
    controller.dispose();
  });
});

describe("ComposeBox emoji picker", () => {
  it("inserts at the caret, remembers recents, and closes on Escape", () => {
    const controller = composer();
    const view = mount(
      <ComposeBox controller={controller} placeholder="Say hi" />,
    );
    const input = view.host.querySelector("textarea")!;
    expect(input.placeholder).toBe("Say hi");
    type(input, "Hello world", 5);
    const button = view.host.querySelector<HTMLButtonElement>(
      '[data-slot="emojiButton"]',
    )!;
    expect(button.getAttribute("aria-expanded")).toBe("false");
    act(() => button.click());
    expect(button.getAttribute("aria-expanded")).toBe("true");
    const picker = view.host.querySelector('[data-slot="emojiPicker"]')!;
    expect(picker.getAttribute("role")).toBe("dialog");
    expect(picker.querySelectorAll('[role="tab"]')).toHaveLength(10);

    const search = picker.querySelector<HTMLInputElement>(
      'input[type="search"]',
    )!;
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set;
      setter?.call(search, "thumbs up");
      search.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const cell = picker.querySelector<HTMLButtonElement>(".pmfa-emoji-cell")!;
    expect(cell.textContent).toBe("👍");
    act(() => cell.click());
    expect(controller.getSnapshot().text).toBe("Hello👍 world");
    expect(input.selectionStart).toBe(7);
    expect(JSON.parse(localStorage.getItem("polymorfa:recent-emoji")!)).toEqual(
      ["👍"],
    );

    // Arrow keys move through the grid.
    key(search, "ArrowDown");
    const cells =
      picker.querySelectorAll<HTMLButtonElement>(".pmfa-emoji-cell");
    expect(picker.ownerDocument.activeElement).toBe(cells[0]);

    key(picker, "Escape");
    expect(view.host.querySelector('[data-slot="emojiPicker"]')).toBeNull();
    expect(document.activeElement).toBe(button);
    view.unmount();
    controller.dispose();
  });

  it("can be turned off", () => {
    const controller = composer();
    const view = mount(<ComposeBox controller={controller} emoji={false} />);
    expect(view.host.querySelector('[data-slot="emojiButton"]')).toBeNull();
    view.unmount();
    controller.dispose();
  });
});

function stubMedia(options: { readonly deny?: boolean } = {}) {
  const track = { stop: vi.fn() };
  class FakeRecorder {
    static isTypeSupported = (type: string) => type === "audio/webm";
    state = "inactive";
    mimeType = "audio/webm";
    ondataavailable: ((event: { data: Blob }) => void) | null = null;
    onstop: (() => void) | null = null;
    start() {
      this.state = "recording";
    }
    stop() {
      this.state = "inactive";
      this.ondataavailable?.({ data: new Blob(["ogg"]) });
      this.onstop?.();
    }
  }
  vi.stubGlobal("MediaRecorder", FakeRecorder);
  vi.stubGlobal("AudioContext", undefined);
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia: vi.fn(async () => {
        if (options.deny)
          throw Object.assign(new Error("no"), { name: "NotAllowedError" });
        return { getTracks: () => [track] };
      }),
    },
  });
  return track;
}

describe("ComposeBox voice notes", () => {
  afterEach(() => {
    delete (navigator as { mediaDevices?: unknown }).mediaDevices;
  });

  it("records, attaches, and auto-sends a voice note", async () => {
    const track = stubMedia();
    const send = vi.fn(async () => undefined);
    const controller = composer(send);
    const view = mount(<ComposeBox controller={controller} />);
    expect(view.host.querySelector('[data-slot="composerSend"]')).toBeNull();
    const mic = view.host.querySelector<HTMLButtonElement>(
      '[data-slot="voiceButton"]',
    )!;
    await act(async () => mic.click());
    const bar = view.host.querySelector('[data-slot="recordingBar"]')!;
    expect(bar).not.toBeNull();
    expect(bar.querySelector('[role="timer"]')?.textContent).toBe("00:00");
    expect(view.host.querySelector('[aria-live="polite"]')?.textContent).toBe(
      "Recording voice note",
    );
    const stop = bar.querySelector<HTMLButtonElement>(
      '[aria-label="Send voice note"]',
    )!;
    await act(async () => stop.click());
    await act(async () => undefined);
    expect(track.stop).toHaveBeenCalled();
    expect(send).toHaveBeenCalledTimes(1);
    const draft = (
      send.mock.calls[0] as unknown as [
        { attachments: { name: string; contentType: string }[] },
      ]
    )[0];
    expect(draft.attachments[0]?.contentType).toBe("audio/webm");
    expect(draft.attachments[0]?.name).toMatch(/^voice-note-.*\.webm$/);
    expect(view.host.querySelector('[data-slot="recordingBar"]')).toBeNull();
    view.unmount();
    controller.dispose();
  });

  it("cancels, reports denial, and stops tracks on unmount", async () => {
    const track = stubMedia();
    const controller = composer();
    const view = mount(
      <ComposeBox controller={controller} voiceNoteAutoSend={false} />,
    );
    const mic = () =>
      view.host.querySelector<HTMLButtonElement>('[data-slot="voiceButton"]')!;
    await act(async () => mic().click());
    await act(async () =>
      view.host
        .querySelector<HTMLButtonElement>('[aria-label="Delete voice note"]')!
        .click(),
    );
    expect(view.host.querySelector('[data-slot="recordingBar"]')).toBeNull();
    expect(controller.getSnapshot().attachments).toEqual([]);
    expect(track.stop).toHaveBeenCalledTimes(1);

    await act(async () => mic().click());
    view.unmount();
    expect(track.stop).toHaveBeenCalledTimes(2);
    controller.dispose();

    stubMedia({ deny: true });
    const denied = composer();
    const second = mount(<ComposeBox controller={denied} />);
    await act(async () =>
      second.host
        .querySelector<HTMLButtonElement>('[data-slot="voiceButton"]')!
        .click(),
    );
    expect(second.host.querySelector('[role="alert"]')?.textContent).toContain(
      "Microphone permission was denied",
    );
    second.unmount();
    denied.dispose();
  });

  it("hides the mic when voice notes are off", () => {
    stubMedia();
    const controller = composer();
    const view = mount(
      <ComposeBox controller={controller} voiceNotes={false} />,
    );
    expect(view.host.querySelector('[data-slot="voiceButton"]')).toBeNull();
    expect(
      view.host.querySelector('[data-slot="composerSend"]'),
    ).not.toBeNull();
    view.unmount();
    controller.dispose();
  });
});

describe("ComposeBox toolbar", () => {
  it("renders start and end actions around the built-ins", () => {
    const controller = composer();
    const view = mount(
      <ComposeBox
        controller={controller}
        maxRows={4}
        startActions={<button type="button">Start</button>}
        endActions={<button type="button">End</button>}
      />,
    );
    const toolbar = view.host.querySelector('[data-slot="composerToolbar"]')!;
    const labels = [...toolbar.querySelectorAll("button")].map(
      (button) => button.getAttribute("aria-label") ?? button.textContent,
    );
    expect(labels).toEqual(["Start", "Emoji", "Attach files", "End", "Send"]);
    expect(
      view.host
        .querySelector("textarea")!
        .style.getPropertyValue("--pmfa-composer-max-rows"),
    ).toBe("4");
    view.unmount();
    controller.dispose();
  });
});
