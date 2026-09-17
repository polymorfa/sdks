// @vitest-environment happy-dom
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createLocale } from "@polymorfa/ui";
import {
  CallsController,
  ConversationController,
  MessageComposerController,
  IncomingCallRelay,
  createSignalingCallsBackend,
  TemplateBuilderController,
} from "@polymorfa/browser";
import {
  definePolymorfaElements,
  type ElementController,
  PolymorfaMessageListElement,
  PolymorfaChatDrawerElement,
  PolymorfaComposeBoxElement,
  PolymorfaTemplateBuilderElement,
} from "../src/index.js";

function fixtureController<T extends object>(initial: T) {
  let snapshot = initial;
  const listeners = new Set<() => void>();
  const controller: ElementController<T> & {
    loadMore: ReturnType<typeof vi.fn>;
  } = {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    loadMore: vi.fn(async () => undefined),
  };
  return {
    controller,
    update: (next: T) => {
      snapshot = next;
      for (const listener of listeners) listener();
    },
    listeners,
  };
}

beforeAll(() => definePolymorfaElements());

describe("portable elements", () => {
  it("registers every product surface without React", () => {
    expect(
      [
        "pmfa-chat-drawer",
        "pmfa-message-list",
        "pmfa-compose-box",
        "pmfa-template-builder",
        "pmfa-call",
      ].every((name) => customElements.get(name) !== undefined),
    ).toBe(true);
  });
  it("binds state, actions, direction, parts, and cleanup", () => {
    const fixture = fixtureController({
      messages: [] as { id: string; text: string; direction: string }[],
      hasMore: true,
      revision: 0,
      updatedAt: 0,
    });
    const node = document.createElement(
      "pmfa-message-list",
    ) as PolymorfaMessageListElement;
    node.configuration = {
      locale: createLocale("ar"),
      appearance: { variables: { colorPrimary: "#123456" } },
    };
    node.controller = fixture.controller as never;
    document.body.append(node);
    expect(node.dir).toBe("rtl");
    expect(node.style.getPropertyValue("--pmfa-color-primary")).toBe("#123456");
    (
      node.shadowRoot?.querySelector('[part="load-more"]') as HTMLButtonElement
    ).click();
    expect(fixture.controller.loadMore).toHaveBeenCalledTimes(1);
    fixture.update({
      messages: [{ id: "m1", text: "Hello", direction: "inbound" }],
      hasMore: false,
      revision: 1,
      updatedAt: 1,
    });
    expect(node.shadowRoot?.textContent).toContain("Hello");
    node.remove();
    expect(fixture.listeners.size).toBe(0);
  });
  it("renders the call element's status heading as an assertive region", () => {
    const base = {
      status: "connected",
      revision: 0,
      updatedAt: 0,
      line: "linkedDevice",
      capabilities: { video: true, mute: true },
      video: true,
      audioMuted: false,
      videoMuted: false,
      selectedDevices: {},
      devices: [],
      peer: "+12025550123",
    };
    const fixture = fixtureController(base);
    const node = document.createElement("pmfa-call");
    (node as unknown as { controller: unknown }).controller =
      fixture.controller;
    document.body.append(node);
    const root = node.shadowRoot;
    try {
      // The element re-renders wholesale, so an assertive panel re-announced
      // the peer number and every control each time a mute label changed.
      expect(root?.querySelector("section[aria-live]")).toBeNull();
      expect(
        root?.querySelector('h2[part="status"]')?.getAttribute("aria-live"),
      ).toBe("assertive");
      expect(root?.querySelector('h2[part="status"]')?.textContent).toBe(
        "Connected",
      );

      // idle and ready have nothing to announce and no message to announce it
      // with; a raw status identifier must not reach the DOM.
      fixture.update({ ...base, status: "ready", revision: 1 });
      expect(root?.querySelector('h2[part="status"]')).toBeNull();
    } finally {
      node.remove();
    }
  });

  it("offers the camera controls only where they can act", () => {
    const base = {
      status: "connected",
      revision: 0,
      updatedAt: 0,
      line: "linkedDevice",
      capabilities: { video: true, mute: true },
      video: true,
      audioMuted: false,
      videoMuted: false,
      selectedDevices: {},
      devices: [],
      peer: "+12025550123",
    };
    const fixture = fixtureController(base);
    const enableVideo = vi.fn(async () => undefined);
    const setMuted = vi.fn();
    const ctl = fixture.controller as unknown as {
      enableVideo: unknown;
      setMuted: unknown;
      canEnableVideo: boolean;
    };
    Object.assign(ctl, { enableVideo, setMuted, canEnableVideo: true });
    const node = document.createElement("pmfa-call");
    (node as unknown as { controller: unknown }).controller =
      fixture.controller;
    document.body.append(node);
    const root = node.shadowRoot;
    try {
      // The upgrade needs a media session, so it is not offered before the
      // call connects — the button would have done nothing there.
      fixture.update({
        ...base,
        revision: 1,
        video: false,
        status: "connecting",
      });
      expect(root?.querySelector('[part="camera"]')).toBeNull();

      // Nor when the session cannot renegotiate: the element takes any
      // controller, and one that reports no upgrade must not show the button.
      ctl.canEnableVideo = false;
      fixture.update({ ...base, revision: 2, video: false });
      expect(root?.querySelector('[part="camera"]')).toBeNull();

      // An audio call on a video-capable line offers the upgrade, matching
      // the React dock; without it the element could never reach video.
      ctl.canEnableVideo = true;
      fixture.update({ ...base, revision: 3, video: false });
      const camera = root?.querySelector(
        '[part="camera"]',
      ) as HTMLButtonElement;
      expect(camera.textContent).toBe("Turn camera on");
      camera.click();
      expect(enableVideo).toHaveBeenCalledTimes(1);
      expect(setMuted).not.toHaveBeenCalled();

      // On a video call the same button mutes the outgoing track, throughout.
      fixture.update({ ...base, revision: 4, status: "connecting" });
      expect(root?.querySelector('[part="camera"]')).not.toBeNull();
      fixture.update({ ...base, revision: 5 });
      (root?.querySelector('[part="camera"]') as HTMLButtonElement).click();
      expect(setMuted).toHaveBeenCalledWith({ video: true });
      expect(enableVideo).toHaveBeenCalledTimes(1);

      // A line without mute must not be offered the control.
      fixture.update({ ...base, revision: 6 });
      expect(root?.querySelector('[part="mute"]')).not.toBeNull();
      fixture.update({
        ...base,
        revision: 7,
        capabilities: { video: true, mute: false },
      });
      expect(root?.querySelector('[part="mute"]')).toBeNull();
      expect(root?.querySelector('[part="hangup"]')).not.toBeNull();
    } finally {
      node.remove();
    }
  });
  it("absorbs answer and reject rejections on the call element", async () => {
    const rejections: unknown[] = [];
    // Node's hook, not the DOM event: happy-dom does not dispatch
    // `unhandledrejection`, so listening for that would assert nothing.
    const onRejection = (reason: unknown) => rejections.push(reason);
    process.on("unhandledRejection", onRejection);
    const node = document.createElement("pmfa-call");
    // Detached even when an assertion fails: left attached it would go on
    // swallowing Node's reporting and could hide a later test's failure.
    try {
      const fixture = fixtureController({
        status: "incoming",
        revision: 0,
        updatedAt: 0,
        line: "linkedDevice",
        capabilities: { video: true, mute: true },
        video: false,
        audioMuted: false,
        videoMuted: false,
        selectedDevices: {},
        devices: [],
        peer: "+12025550123",
      });
      // A remote hang-up between render and click leaves both rejecting.
      Object.assign(fixture.controller, {
        answer: async () => {
          throw new Error("No incoming call is available to answer.");
        },
        reject: async () => {
          throw new Error("No incoming call is available to reject.");
        },
      });
      (node as unknown as { controller: unknown }).controller =
        fixture.controller;
      document.body.append(node);

      (
        node.shadowRoot?.querySelector('[part~="answer"]') as HTMLButtonElement
      ).click();
      (
        node.shadowRoot?.querySelector('[part="reject"]') as HTMLButtonElement
      ).click();
      // Node reports these after the microtask queue drains, so wait a macrotask.
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(rejections).toEqual([]);
    } finally {
      node.remove();
      process.off("unhandledRejection", onRejection);
    }
  });

  it("absorbs mute clicks on the call element after disposal", () => {
    const base = {
      status: "connected",
      revision: 0,
      updatedAt: 0,
      line: "linkedDevice",
      capabilities: { video: true, mute: true },
      video: true,
      audioMuted: false,
      videoMuted: false,
      selectedDevices: {},
      devices: [],
      peer: "+12025550123",
    };
    const fixture = fixtureController(base);
    // A disposed controller throws synchronously from setMuted while the
    // element stays rendered on its last snapshot.
    Object.assign(fixture.controller, {
      setMuted: () => {
        throw new Error("CallsController is disposed.");
      },
    });
    const node = document.createElement("pmfa-call");
    (node as unknown as { controller: unknown }).controller =
      fixture.controller;
    document.body.append(node);
    try {
      for (const part of ["mute", "camera"]) {
        const button = node.shadowRoot?.querySelector(
          `[part="${part}"]`,
        ) as HTMLButtonElement | null;
        expect(button).not.toBeNull();
        expect(() => button?.click()).not.toThrow();
      }
    } finally {
      node.remove();
    }
  });

  it("restores drawer focus and emits a composed close event", () => {
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();
    const drawer = document.createElement(
      "pmfa-chat-drawer",
    ) as PolymorfaChatDrawerElement;
    drawer.opener = opener;
    drawer.controller = fixtureController({
      status: "ready",
      messages: [],
      hasMore: false,
      revision: 0,
      updatedAt: 0,
    }).controller as never;
    const closed = vi.fn();
    drawer.addEventListener("pmfa-close", closed);
    document.body.append(drawer);
    (
      drawer.shadowRoot?.querySelector('[part~="close"]') as HTMLButtonElement
    ).click();
    expect(closed).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(opener);
  });
  it("renders canonical template fields and structured previews", async () => {
    const templateDocument = {
      id: "tpl-1",
      name: "order_ready",
      category: "UTILITY",
      language: "en_US",
      status: "draft",
      kind: "standard",
      definition: {
        version: 1 as const,
        kind: "standard" as const,
        category: "UTILITY" as const,
        language: "en_US",
        header: { format: "text" as const, text: "Order {{order_id}}" },
        body: "Hello {{name}}",
        buttons: [{ type: "quick_reply" as const, text: "Track order" }],
        variables: [
          { name: "order_id", type: "text" as const, example: "A-100" },
          { name: "name", type: "text" as const, example: "Ada" },
        ],
      },
      sampleValues: { order_id: "A-100", name: "Ada" },
      cloudLinks: [],
      createdAt: 1,
      updatedAt: 2,
    };
    const controller = new TemplateBuilderController({
      load: async () => templateDocument,
      save: async () => templateDocument,
      preview: async () => ({
        surface: "preview",
        rendered: {
          kind: "standard",
          category: "UTILITY",
          header: { format: "text", text: "Order A-100" },
          body: "Hello Ada",
          buttons: [{ type: "quick_reply", text: "Track order" }],
          cards: [],
        },
      }),
      submitToMeta: async () => ({ ...templateDocument, status: "PENDING" }),
      delete: async () => undefined,
    });
    await controller.load("tpl-1");
    const node = document.createElement(
      "pmfa-template-builder",
    ) as PolymorfaTemplateBuilderElement;
    node.controller = controller;
    document.body.append(node);

    expect(
      node.shadowRoot?.querySelector('[data-field="header"]'),
    ).not.toBeNull();
    expect(
      (
        node.shadowRoot?.querySelector(
          '[data-field="body"]',
        ) as HTMLTextAreaElement
      ).value,
    ).toBe("Hello {{name}}");
    await controller.refreshPreview();
    expect(node.shadowRoot?.textContent).toContain("Hello Ada");
    expect(node.shadowRoot?.textContent).toContain("Track order");
    expect(node.shadowRoot?.textContent).toContain("Save draft");
    expect(node.shadowRoot?.textContent).toContain("Submit to Meta");
    node.remove();
  });
});

describe("call control retries", () => {
  it.each(["reject", "hangup"])(
    "retains the %s button after a refused request",
    async (part) => {
      const relay = new IncomingCallRelay();
      const teardown = vi.fn(async () => undefined);
      const close = vi.fn(async () => undefined);
      const controller = new CallsController(
        createSignalingCallsBackend({
          signaling: {
            offer: async () => ({ sdp: "v=0", iceServers: [] }),
            candidate: async () => undefined,
            candidates: async () => [],
            teardown,
          },
          incoming: relay,
        }),
        {
          open: async () => ({
            localStream: new MediaStream(),
            remoteStream: new MediaStream(),
            close,
            setMuted: vi.fn(),
            audioEnabled: () => true,
            videoEnabled: () => false,
          }),
        },
      );
      controller.initialize();
      const node = document.createElement("pmfa-call");
      (node as unknown as { controller: CallsController }).controller =
        controller;
      document.body.append(node);
      try {
        relay.receive({
          callId: "CALL-RETRY",
          from: "+15550100",
          video: false,
        });
        if (part === "hangup") await controller.answer();
        teardown.mockRejectedValueOnce(new Error("temporarily unavailable"));
        (
          node.shadowRoot?.querySelector(
            `[part="${part}"]`,
          ) as HTMLButtonElement
        ).click();
        await vi.waitFor(() =>
          expect(controller.getSnapshot().error?.code).toBe(
            "call_control_failed",
          ),
        );
        expect(
          node.shadowRoot?.querySelector(`[part="${part}"]`),
        ).not.toBeNull();
        expect(node.shadowRoot?.textContent).toContain(
          "Could not end the call. Try again.",
        );
        expect(close).not.toHaveBeenCalled();
        (
          node.shadowRoot?.querySelector(
            `[part="${part}"]`,
          ) as HTMLButtonElement
        ).click();
        await vi.waitFor(() =>
          expect(controller.getSnapshot().status).toBe("ended"),
        );
        expect(teardown).toHaveBeenCalledTimes(2);
        expect(controller.getSnapshot().error).toBeUndefined();
      } finally {
        node.remove();
        controller.dispose();
      }
    },
  );
  it("renders chat oldest first and labels template fields", () => {
    const list = document.createElement(
      "pmfa-message-list",
    ) as PolymorfaMessageListElement;
    list.controller = fixtureController({
      messages: [
        {
          id: "b",
          text: "Second",
          createdAt: 2_000,
          direction: "outbound",
          status: "sent",
        },
        {
          id: "a",
          text: "First",
          createdAt: 1_000,
          direction: "inbound",
          status: "sent",
        },
      ],
      hasMore: false,
      revision: 0,
      updatedAt: 0,
    }).controller as never;
    document.body.append(list);
    const ids = [
      ...(list.shadowRoot?.querySelectorAll<HTMLElement>(".pmfa-msg") ?? []),
    ].map((item) => item.dataset.messageId);
    expect(ids).toEqual(["a", "b"]);
    list.remove();

    const controller = new TemplateBuilderController({} as never);
    controller.create({
      name: "welcome",
      definition: {
        version: 1,
        kind: "standard",
        category: "UTILITY",
        language: "en",
        body: "Hello",
        variables: [],
      },
    });
    const builder = document.createElement(
      "pmfa-template-builder",
    ) as PolymorfaTemplateBuilderElement;
    builder.controller = controller as never;
    document.body.append(builder);
    const labels = [
      ...(builder.shadowRoot?.querySelectorAll(".pmfa-label") ?? []),
    ].map((label) => label.textContent);
    expect(labels).toEqual(["Template name", "Body"]);
    builder.remove();
    controller.dispose();
  });
});

/**
 * The stylesheets applied inside a shadow root: adopted sheets when the
 * environment supports them, otherwise the `<style>` fallbacks' text.
 */
function appliedSheets(
  root: ShadowRoot | null | undefined,
): readonly (CSSStyleSheet | string)[] {
  const adopted = [...(root?.adoptedStyleSheets ?? [])];
  const tags = [...(root?.querySelectorAll("style") ?? [])].map(
    (tag) => tag.textContent ?? "",
  );
  return [...adopted, ...tags];
}

const today = Date.now();
const chatMessages = [
  {
    id: "m1",
    text: "Where is my order?",
    createdAt: today - 2 * 86_400_000,
    direction: "inbound",
    status: "sent",
  },
  {
    id: "m2",
    text: "",
    createdAt: today - 1,
    direction: "inbound",
    status: "sent",
    attachments: [
      {
        id: "a1",
        name: "photo.png",
        size: 2048,
        contentType: "image/png",
        url: "https://cdn.example/photo.png",
      },
      {
        id: "a2",
        name: "notes.txt",
        size: 512,
        contentType: "text/plain",
      },
    ],
  },
  {
    id: "m3",
    clientId: "c3",
    text: "It ships today",
    createdAt: today,
    direction: "outbound",
    status: "failed",
    replyTo: "m1",
  },
];

function chatSnapshot(messages: readonly object[], revision = 0) {
  return {
    status: "ready",
    messages,
    hasMore: false,
    revision,
    updatedAt: revision,
  };
}

describe("chat element features", () => {
  it("keeps unchanged message nodes and the log across updates", () => {
    const fixture = fixtureController(chatSnapshot(chatMessages));
    const list = document.createElement(
      "pmfa-message-list",
    ) as PolymorfaMessageListElement;
    list.controller = fixture.controller as never;
    document.body.append(list);
    try {
      const root = list.shadowRoot;
      const log = root?.querySelector('[role="log"]');
      expect(log?.getAttribute("aria-live")).toBe("polite");
      const first = root?.querySelector('[data-message-id="m1"]');
      (first as HTMLElement).focus();
      fixture.update(
        chatSnapshot(
          [
            ...chatMessages,
            {
              id: "m4",
              text: "Thanks",
              createdAt: today + 1,
              direction: "inbound",
              status: "sent",
            },
          ],
          1,
        ),
      );
      expect(root?.querySelector('[role="log"]')).toBe(log);
      expect(root?.querySelector('[data-message-id="m1"]')).toBe(first);
      expect(root?.activeElement).toBe(first);
      expect(
        [...(root?.querySelectorAll<HTMLElement>(".pmfa-msg") ?? [])].map(
          (node) => node.dataset.messageId,
        ),
      ).toEqual(["m1", "m2", "m3", "m4"]);
      // A changed message object gets a new node.
      const edited = { ...chatMessages[0], text: "Edited" };
      fixture.update(chatSnapshot([edited, ...chatMessages.slice(1)], 2));
      const replaced = root?.querySelector('[data-message-id="m1"]');
      expect(replaced).not.toBe(first);
      expect(replaced?.textContent).toContain("Edited");
    } finally {
      list.remove();
    }
  });

  it("renders attachments, quotes, date separators, status, and parts", () => {
    const fixture = fixtureController(chatSnapshot(chatMessages));
    const list = document.createElement(
      "pmfa-message-list",
    ) as PolymorfaMessageListElement;
    list.configuration = {
      appearance: {
        elements: {
          bubble: {
            className: "brand-bubble",
            styles: { backgroundColor: "rgb(1, 2, 3)" },
          },
        },
      },
    };
    list.controller = fixture.controller as never;
    document.body.append(list);
    try {
      const root = list.shadowRoot;
      const dates = [
        ...(root?.querySelectorAll('[part~="date-separator"]') ?? []),
      ].map((node) => node.textContent);
      expect(dates).toHaveLength(2);
      expect(dates[1]).toBe("Today");
      const image = root?.querySelector("img");
      expect(image?.alt).toBe("photo.png");
      expect(image?.getAttribute("loading")).toBe("lazy");
      expect(image?.getAttribute("decoding")).toBe("async");
      const file = root?.querySelector(".pmfa-att-file");
      expect(file?.tagName).toBe("DIV");
      expect(file?.textContent).toContain("512 bytes");
      const message = root?.querySelector('[data-message-id="m3"]');
      expect(message?.getAttribute("part")).toBe("message outbound");
      const bubble = message?.querySelector(".pmfa-bubble") as HTMLElement;
      expect(bubble.getAttribute("part")).toBe("bubble");
      expect(bubble.classList.contains("brand-bubble")).toBe(true);
      expect(bubble.style.backgroundColor).toBe("rgb(1, 2, 3)");
      expect(
        message?.querySelector('[part="meta message-meta"]'),
      ).not.toBeNull();
      expect(message?.textContent).toContain("Not delivered");
      const quote = message?.querySelector(
        '[part~="reply-quote"]',
      ) as HTMLButtonElement;
      expect(quote.textContent).toContain("Where is my order?");
      quote.click();
      expect(root?.activeElement?.getAttribute("data-message-id")).toBe("m1");
      // No reply handler or attribute: no Reply action.
      expect(root?.querySelector('[part~="reply-button"]')).toBeNull();
    } finally {
      list.remove();
    }
  });

  it("dispatches pmfa-reply and retries failed messages", async () => {
    const fixture = fixtureController(chatSnapshot(chatMessages));
    const retry = vi.fn(async () => {
      throw new Error("offline");
    });
    Object.assign(fixture.controller, { retry });
    const list = document.createElement(
      "pmfa-message-list",
    ) as PolymorfaMessageListElement;
    list.setAttribute("replyable", "");
    list.controller = fixture.controller as never;
    const replies: unknown[] = [];
    list.addEventListener("pmfa-reply", (event) =>
      replies.push((event as CustomEvent).detail),
    );
    document.body.append(list);
    try {
      const root = list.shadowRoot;
      (
        root?.querySelector(
          '[data-message-id="m1"] [part~="reply-button"]',
        ) as HTMLButtonElement
      ).click();
      expect(replies).toEqual([chatMessages[0]]);
      const retryButton = root?.querySelector(
        '[part~="retry-button"]',
      ) as HTMLButtonElement;
      expect(retryButton.getAttribute("aria-label")).toBe("Retry sending");
      retryButton.click();
      expect(retry).toHaveBeenCalledWith("c3");
      await new Promise((resolve) => setTimeout(resolve, 0));
    } finally {
      list.remove();
    }
  });

  it("wires drawer replies to its internal composer", async () => {
    const conversation = new ConversationController({
      load: async () => ({ messages: chatMessages as never }),
      subscribe: () => () => undefined,
      send: async () => {
        throw new Error("n/a");
      },
    });
    await conversation.load();
    const composer = new MessageComposerController({
      upload: vi.fn(),
      send: vi.fn(async () => undefined),
    });
    const drawer = document.createElement(
      "pmfa-chat-drawer",
    ) as PolymorfaChatDrawerElement;
    drawer.controller = conversation as never;
    drawer.composerController = composer;
    const slotted = document.createElement("p");
    slotted.textContent = "Slotted footer";
    drawer.append(slotted);
    document.body.append(drawer);
    try {
      const root = drawer.shadowRoot;
      await Promise.resolve();
      const textarea = root?.querySelector("textarea");
      expect(root?.activeElement).toBe(textarea);
      expect(root?.querySelector("slot")).not.toBeNull();
      const dialog = root?.querySelector('[role="dialog"]');
      const titleId = dialog?.getAttribute("aria-labelledby") ?? "";
      expect(root?.getElementById(titleId)?.textContent).toBe("Messages");
      const panel = root?.querySelector(".pmfa-drawer");
      (
        root?.querySelector(
          '[data-message-id="m1"] [part~="reply-button"]',
        ) as HTMLButtonElement
      ).click();
      expect(composer.getSnapshot().replyTo).toBe("m1");
      const banner = root?.querySelector('[part~="reply-banner"]');
      expect(banner?.textContent).toContain("Replying to Contact");
      expect(banner?.textContent).toContain("Where is my order?");
      // Stable panel and textarea across the composer update.
      expect(root?.querySelector(".pmfa-drawer")).toBe(panel);
      expect(root?.querySelector("textarea")).toBe(textarea);
      (
        banner?.querySelector('[aria-label="Cancel reply"]') as HTMLElement
      ).click();
      expect(composer.getSnapshot().replyTo).toBeUndefined();
      expect(root?.querySelector('[part~="reply-banner"]')).toBeNull();
    } finally {
      drawer.remove();
      composer.dispose();
      conversation.dispose();
    }
  });

  it("shows attachment chips with progress, removal, and rejections", async () => {
    let report: ((progress: number) => void) | undefined;
    const composer = new MessageComposerController(
      {
        upload: (_attachment, onProgress) => {
          report = onProgress;
          return new Promise(() => undefined);
        },
        send: vi.fn(async () => undefined),
      },
      { maxAttachmentSize: 10 },
    );
    const box = document.createElement(
      "pmfa-compose-box",
    ) as PolymorfaComposeBoxElement;
    box.setAttribute("accept", "image/*");
    box.setAttribute("multiple", "false");
    box.controller = composer as never;
    document.body.append(box);
    try {
      const root = box.shadowRoot;
      const textarea = root?.querySelector("textarea") as HTMLTextAreaElement;
      expect(textarea.getAttribute("part")).toBe("input composer-input");
      expect(textarea.getAttribute("aria-label")).toBe("Message");
      const input = root?.querySelector(
        'input[type="file"]',
      ) as HTMLInputElement;
      expect(input.accept).toBe("image/*");
      expect(input.multiple).toBe(false);
      const send = root?.querySelector('[part~="send"]') as HTMLButtonElement;
      expect(send.getAttribute("part")).toBe("primary send composer-send");
      expect(send.disabled).toBe(true);
      Object.defineProperty(input, "files", {
        configurable: true,
        value: [new File(["12345"], "small.txt")],
      });
      input.dispatchEvent(new Event("change"));
      report?.(0.25);
      const chip = root?.querySelector('[part~="attachment-chip"]');
      expect(chip?.textContent).toContain("small.txt");
      expect(
        chip
          ?.querySelector('[role="progressbar"]')
          ?.getAttribute("aria-valuenow"),
      ).toBe("25");
      report?.(0.75);
      expect(root?.querySelector('[part~="attachment-chip"]')).toBe(chip);
      expect(
        chip
          ?.querySelector('[role="progressbar"]')
          ?.getAttribute("aria-valuenow"),
      ).toBe("75");
      (
        chip?.querySelector('[aria-label="Remove small.txt"]') as HTMLElement
      ).click();
      expect(composer.getSnapshot().attachments).toEqual([]);
      expect(root?.querySelector('[part~="attachment-chip"]')).toBeNull();

      Object.defineProperty(input, "files", {
        configurable: true,
        value: [new File(["x".repeat(20)], "big.bin")],
      });
      input.dispatchEvent(new Event("change"));
      await Promise.resolve();
      await Promise.resolve();
      expect(root?.querySelector('[role="alert"]')?.textContent).toBe(
        "Attachment exceeds 10 bytes.",
      );

      composer.setText("hello");
      expect(root?.querySelector("textarea")).toBe(textarea);
      expect(textarea.value).toBe("hello");
      expect(send.disabled).toBe(false);
    } finally {
      box.remove();
      composer.dispose();
    }
  });

  it("adopts the default and extra stylesheets, or neither when unstyled", () => {
    const fixture = fixtureController(chatSnapshot([]));
    const list = document.createElement(
      "pmfa-message-list",
    ) as PolymorfaMessageListElement;
    list.controller = fixture.controller as never;
    list.configuration = { stylesheet: ".pmfa-bubble { color: red; }" };
    document.body.append(list);
    const other = document.createElement(
      "pmfa-message-list",
    ) as PolymorfaMessageListElement;
    other.controller = fixture.controller as never;
    document.body.append(other);
    try {
      const sheets = appliedSheets(list.shadowRoot);
      const shared = appliedSheets(other.shadowRoot);
      expect(sheets).toHaveLength(2);
      expect(shared).toHaveLength(1);
      if (typeof sheets[0] === "string") {
        expect(sheets[0]).toContain("@layer polymorfa");
        expect(sheets[1]).toContain("color: red");
      } else {
        // One constructed default sheet serves every element.
        expect(sheets[0]).toBe(shared[0]);
        expect(sheets[1]).not.toBe(sheets[0]);
      }
      // Re-rendering keeps the same nodes and sheets.
      const before = [...(list.shadowRoot?.childNodes ?? [])];
      fixture.update(chatSnapshot([], 1));
      expect([...(list.shadowRoot?.childNodes ?? [])]).toEqual(before);
      expect(appliedSheets(list.shadowRoot)).toEqual(sheets);

      const extra = sheets[1];
      list.configuration = {
        appearance: { unstyled: true },
        stylesheet: [".pmfa-bubble { color: red; }"],
      };
      const unstyled = appliedSheets(list.shadowRoot);
      expect(unstyled).toEqual([extra]);
      expect(list.shadowRoot?.querySelector(".pmfa-list")).not.toBeNull();
    } finally {
      list.remove();
      other.remove();
    }
  });

  it("emits dark color variables on the host", () => {
    const list = document.createElement(
      "pmfa-message-list",
    ) as PolymorfaMessageListElement;
    list.configuration = {
      appearance: { darkVariables: { colorBackground: "#000000" } },
    };
    document.body.append(list);
    expect(list.style.getPropertyValue("--pmfa-dark-color-background")).toBe(
      "#000000",
    );
    list.configuration = {};
    expect(list.style.getPropertyValue("--pmfa-dark-color-background")).toBe(
      "",
    );
    list.remove();
  });
});
