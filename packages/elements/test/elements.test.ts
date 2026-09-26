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
  type CallLifecycleEvent,
} from "@polymorfa/browser/internal";
import {
  definePolymorfaElements,
  type ElementController,
  PolymorfaMessageListElement,
  PolymorfaCallElement,
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
      const reject = vi.fn(async () => undefined);
      const end = vi.fn(async () => undefined);
      const control = part === "reject" ? reject : end;
      const close = vi.fn(async () => undefined);
      const controller = new CallsController(
        createSignalingCallsBackend({
          signaling: {
            offer: async () => ({ sdp: "v=0", iceServers: [] }),
            candidate: async () => undefined,
            candidates: async () => [],
            accept: async () => ({
              answered: true,
              answeredBy: "client:self",
              exclusive: false,
            }),
            reject,
            leave: async () => undefined,
            end,
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
        control.mockRejectedValueOnce(new Error("temporarily unavailable"));
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
        expect(control).toHaveBeenCalledTimes(2);
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
    drawer.setAttribute("autofocus", "");
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

describe("element review fixes", () => {
  const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
  const emptyConversation = () =>
    fixtureController({
      status: "ready",
      messages: [],
      hasMore: false,
      revision: 0,
      updatedAt: 0,
    }).controller as never;

  it("never renders unsafe attachment URLs as links or images", () => {
    const list = document.createElement(
      "pmfa-message-list",
    ) as PolymorfaMessageListElement;
    list.controller = fixtureController({
      status: "ready",
      hasMore: false,
      revision: 0,
      updatedAt: 0,
      messages: [
        {
          id: "x1",
          text: "",
          createdAt: Date.now(),
          direction: "inbound",
          status: "sent",
          attachments: [
            {
              id: "a1",
              name: "doc.pdf",
              size: 1,
              contentType: "application/pdf",
              url: "javascript:alert(document.domain)",
            },
            {
              id: "a2",
              name: "pic.png",
              size: 1,
              contentType: "image/png",
              url: "javascript:alert(1)",
              previewUrl: "https://cdn.example/pic.png",
            },
            {
              id: "a3",
              name: "bad.png",
              size: 1,
              contentType: "image/png",
              url: "vbscript:msgbox(1)",
              previewUrl: "javascript:alert(1)",
            },
            {
              id: "a4",
              name: "ok.pdf",
              size: 1,
              contentType: "application/pdf",
              url: "https://cdn.example/ok.pdf",
            },
          ],
        },
      ],
    }).controller as never;
    document.body.append(list);
    try {
      const root = list.shadowRoot;
      const hrefs = [...(root?.querySelectorAll("a") ?? [])].map((node) =>
        node.getAttribute("href"),
      );
      expect(hrefs).toEqual(["https://cdn.example/ok.pdf"]);
      const sources = [...(root?.querySelectorAll("img") ?? [])].map((node) =>
        node.getAttribute("src"),
      );
      expect(sources).toEqual(["https://cdn.example/pic.png"]);
      const cards = root?.querySelectorAll('[part~="attachment"]');
      expect(cards).toHaveLength(4);
      expect(cards?.[0]?.tagName).toBe("DIV");
      expect(cards?.[1]?.tagName).toBe("DIV");
      expect(cards?.[2]?.tagName).toBe("DIV");
      expect(cards?.[2]?.textContent).toContain("bad.png");
    } finally {
      list.remove();
    }
  });

  it("keeps template issue nodes across unrelated edits and names parts once", () => {
    const controller = new TemplateBuilderController({} as never);
    controller.create({
      name: "",
      definition: {
        version: 1,
        kind: "standard",
        category: "UTILITY",
        language: "en",
        body: "",
        variables: [],
      },
    } as never);
    const builder = document.createElement(
      "pmfa-template-builder",
    ) as PolymorfaTemplateBuilderElement;
    builder.controller = controller as never;
    document.body.append(builder);
    try {
      const root = builder.shadowRoot;
      const before = [...(root?.querySelectorAll('[role="alert"]') ?? [])];
      expect(before.length).toBeGreaterThan(0);
      const panel = root?.querySelector('[part~="template-builder"]');
      controller.setBody("Hello");
      const after = [...(root?.querySelectorAll('[role="alert"]') ?? [])];
      expect(after.length).toBeGreaterThan(0);
      expect(after.length).toBeLessThan(before.length);
      for (const node of after) expect(before).toContain(node);
      controller.setName("order_ready");
      const kept = [...(root?.querySelectorAll('[role="alert"]') ?? [])];
      for (const node of kept) expect(after).toContain(node);
      expect(root?.querySelector('[part~="template-builder"]')).toBe(panel);

      const previewParts = [
        ...(root?.querySelectorAll('[part~="preview"]') ?? []),
      ];
      expect(previewParts).toHaveLength(1);
      expect(previewParts[0]?.tagName).toBe("BUTTON");
      expect(root?.querySelectorAll('[part~="preview-panel"]')).toHaveLength(1);
    } finally {
      builder.remove();
      controller.dispose();
    }
  });

  it("leaves focus alone on connect unless autofocus is set", async () => {
    const outside = document.createElement("input");
    document.body.append(outside);
    outside.focus();
    const drawer = document.createElement(
      "pmfa-chat-drawer",
    ) as PolymorfaChatDrawerElement;
    drawer.controller = emptyConversation();
    document.body.append(drawer);
    try {
      await tick();
      expect(document.activeElement).toBe(outside);

      // Opening after mount moves focus in; closing returns it.
      drawer.open = false;
      drawer.open = true;
      await tick();
      expect(document.activeElement).toBe(drawer);
      expect(drawer.shadowRoot?.activeElement).toBe(
        drawer.shadowRoot?.querySelector('[part~="close"]'),
      );
      drawer.open = false;
      expect(document.activeElement).toBe(outside);

      const focused = document.createElement(
        "pmfa-chat-drawer",
      ) as PolymorfaChatDrawerElement;
      focused.controller = emptyConversation();
      focused.setAttribute("autofocus", "");
      document.body.append(focused);
      await tick();
      expect(document.activeElement).toBe(focused);
      focused.remove();
    } finally {
      drawer.remove();
      outside.remove();
    }
  });

  it("closes only the drawer that receives Escape, outside IME composition", async () => {
    const outside = document.createElement("input");
    document.body.append(outside);
    const first = document.createElement(
      "pmfa-chat-drawer",
    ) as PolymorfaChatDrawerElement;
    const second = document.createElement(
      "pmfa-chat-drawer",
    ) as PolymorfaChatDrawerElement;
    first.controller = emptyConversation();
    second.controller = emptyConversation();
    document.body.append(first, second);
    try {
      outside.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
      expect([first.open, second.open]).toEqual([true, true]);

      const close = first.shadowRoot?.querySelector(
        '[part~="close"]',
      ) as HTMLButtonElement;
      close.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Escape",
          bubbles: true,
          composed: true,
          isComposing: true,
        }),
      );
      expect(first.open).toBe(true);

      const escape = new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        composed: true,
        cancelable: true,
      });
      close.dispatchEvent(escape);
      expect(escape.defaultPrevented).toBe(true);
      expect([first.open, second.open]).toEqual([false, true]);
    } finally {
      first.remove();
      second.remove();
      outside.remove();
    }
  });

  it("clears a rejected-file error after a send, an edit, or a reset", async () => {
    const composer = new MessageComposerController(
      { upload: vi.fn(), send: vi.fn(async () => undefined) },
      { maxAttachmentSize: 1 },
    );
    const box = document.createElement(
      "pmfa-compose-box",
    ) as PolymorfaComposeBoxElement;
    box.controller = composer as never;
    document.body.append(box);
    const root = box.shadowRoot;
    const input = root?.querySelector('input[type="file"]') as HTMLInputElement;
    const reject = async () => {
      Object.defineProperty(input, "files", {
        configurable: true,
        value: [new File(["too big"], "big.txt")],
      });
      input.dispatchEvent(new Event("change"));
      await tick();
      expect(root?.querySelector(".pmfa-error")?.textContent).toBe(
        "Attachment exceeds 1 bytes.",
      );
    };
    try {
      await reject();
      composer.setText("hello");
      await composer.submit();
      expect(root?.querySelector(".pmfa-error")).toBeNull();

      await reject();
      const textarea = root?.querySelector("textarea") as HTMLTextAreaElement;
      textarea.value = "typed";
      textarea.dispatchEvent(new Event("input"));
      expect(root?.querySelector(".pmfa-error")).toBeNull();

      await reject();
      composer.reset();
      expect(root?.querySelector(".pmfa-error")).toBeNull();
    } finally {
      box.remove();
      composer.dispose();
    }
  });

  it("bounds the custom stylesheet cache", async () => {
    const { cachedTextSheetCount } = await import("../src/base.js");
    const node = document.createElement(
      "pmfa-message-list",
    ) as PolymorfaMessageListElement;
    node.controller = emptyConversation();
    document.body.append(node);
    try {
      for (let index = 0; index < 100; index += 1)
        node.configuration = {
          stylesheet: `.pmfa-bubble { order: ${index}; }`,
        };
      expect(cachedTextSheetCount()).toBeLessThanOrEqual(32);
    } finally {
      node.remove();
    }
  });

  it("re-renders the compose box reply banner when its conversation loads", async () => {
    let resolveLoad: (value: { messages: never }) => void = () => undefined;
    const conversation = new ConversationController({
      load: () =>
        new Promise((resolve) => {
          resolveLoad = resolve as never;
        }),
      subscribe: () => () => undefined,
      send: async () => {
        throw new Error("n/a");
      },
    });
    const composer = new MessageComposerController({
      upload: vi.fn(),
      send: vi.fn(async () => undefined),
    });
    composer.setReplyTo("m1");
    const box = document.createElement(
      "pmfa-compose-box",
    ) as PolymorfaComposeBoxElement;
    box.controller = composer as never;
    box.conversation = conversation;
    document.body.append(box);
    try {
      const loading = conversation.load();
      const banner = () =>
        box.shadowRoot?.querySelector('[part~="reply-banner"]')?.textContent;
      expect(banner()).not.toContain("Where is my order?");
      resolveLoad({ messages: chatMessages as never });
      await loading;
      expect(banner()).toContain("Where is my order?");
      box.remove();
      const renders = vi.fn();
      box.addEventListener("pmfa-render", renders);
      const reload = conversation.load();
      resolveLoad({ messages: chatMessages as never });
      await reload;
      expect(renders).not.toHaveBeenCalled();
    } finally {
      box.remove();
      composer.dispose();
      conversation.dispose();
    }
  });
});

describe("unified call element", () => {
  function setup() {
    const listeners = new Set<(event: CallLifecycleEvent) => void>();
    const accept = vi.fn(
      async (_id: string, options: { exclusive?: boolean }) => ({
        answered: true,
        answeredBy: "client:self",
        exclusive: options.exclusive === true,
      }),
    );
    const signaling = {
      offer: async () => ({ sdp: "v=0", iceServers: [] }),
      candidate: async () => undefined,
      candidates: async () => [],
      accept,
      reject: vi.fn(async () => undefined),
      leave: vi.fn(async () => undefined),
      end: vi.fn(async () => undefined),
    };
    const close = vi.fn(async () => undefined);
    const media = {
      open: vi.fn(async () => ({
        localStream: new MediaStream(),
        remoteStream: new MediaStream(),
        close,
        setMuted: vi.fn(),
        audioEnabled: () => true,
        videoEnabled: () => false,
      })),
    };
    const controller = new CallsController(
      createSignalingCallsBackend({
        signaling,
        place: async () => "call-out",
        incoming: {
          subscribe: (listener) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
          },
        },
      }),
      media,
    );
    controller.initialize();
    const node = document.createElement("pmfa-call") as PolymorfaCallElement;
    node.controller = controller;
    document.body.append(node);
    const part = (name: string) =>
      node.shadowRoot?.querySelector(
        `[part~="${name}"]`,
      ) as HTMLButtonElement | null;
    const emit = (event: CallLifecycleEvent) => {
      for (const listener of [...listeners]) listener(event);
    };
    return { node, controller, signaling, close, media, part, emit };
  }

  it("answers without a claim unless the exclusive attribute is set", async () => {
    for (const exclusive of [false, true]) {
      const h = setup();
      if (exclusive) h.node.setAttribute("exclusive", "");
      expect(h.node.exclusive).toBe(exclusive);
      h.emit({
        type: "incomingCall",
        call: { callId: "C", from: "+15550100", video: false },
      });
      h.part("answer")?.click();
      await vi.waitFor(() =>
        expect(h.signaling.accept).toHaveBeenCalledWith(
          "C",
          { exclusive, video: false },
          expect.any(AbortSignal),
        ),
      );
      h.node.remove();
      h.controller.dispose();
    }
  });

  it("shows Dismiss for a claimed call and Join for a shared one", async () => {
    const h = setup();
    h.emit({
      type: "incomingCall",
      call: { callId: "A", from: "+15550100", video: false },
    });
    h.emit({
      type: "incomingCall",
      call: { callId: "B", from: "+15550101", video: false },
    });
    expect(h.part("invitations")?.textContent).toContain("+15550101");
    h.emit({
      type: "accepted",
      callId: "A",
      answeredBy: "client:other",
      exclusive: true,
    });
    expect(h.part("claimed")?.textContent).toBe(
      "Answered by another participant",
    );
    expect(h.part("answer")).toBeNull();
    expect(h.part("reject")).toBeNull();
    h.emit({ type: "accepted", callId: "B", answeredBy: "client:other" });
    h.part("dismiss")?.click();
    expect(h.controller.getSnapshot().callId).toBe("B");
    expect(h.part("reject")).toBeNull();
    h.part("join")?.click();
    await vi.waitFor(() =>
      expect(h.controller.getSnapshot().status).toBe("connecting"),
    );
    expect(h.signaling.accept).toHaveBeenCalledWith(
      "B",
      { exclusive: false, video: false },
      expect.any(AbortSignal),
    );
    expect(h.signaling.reject).not.toHaveBeenCalled();

    // Leave closes this connection only.
    expect(h.part("hangup")?.textContent).toBe("End call for everyone");
    h.part("leave")?.click();
    await vi.waitFor(() =>
      expect(h.controller.getSnapshot().endReason).toBe("left"),
    );
    expect(h.close).toHaveBeenCalledWith({ leave: true });
    expect(h.signaling.end).not.toHaveBeenCalled();
    h.node.remove();
    h.controller.dispose();
  });

  it("disables Answer and Reject while an answer is in flight", async () => {
    const h = setup();
    let finish!: () => void;
    h.signaling.accept.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = () =>
            resolve({
              answered: true,
              answeredBy: "client:self",
              exclusive: false,
            });
        }),
    );
    h.emit({
      type: "incomingCall",
      call: { callId: "A", from: "+15550100", video: false },
    });
    h.emit({
      type: "incomingCall",
      call: { callId: "B", from: "+15550101", video: false },
    });
    h.part("answer")?.click();
    expect(h.part("answer")?.disabled).toBe(true);
    expect(h.part("reject")?.disabled).toBe(true);
    h.part("show")?.click();
    expect(h.controller.getSnapshot().callId).toBe("B");
    expect(h.part("answer")?.disabled).toBe(true);
    finish();
    await vi.waitFor(() =>
      expect(h.controller.getSnapshot()).toMatchObject({
        callId: "A",
        answering: false,
      }),
    );
    expect(h.part("hangup")).not.toBeNull();
    h.node.remove();
    h.controller.dispose();
  });

  it("shows the waiting call after an answer's media fails, with a notice", async () => {
    const h = setup();
    h.media.open.mockRejectedValueOnce(new Error("denied"));
    h.emit({
      type: "incomingCall",
      call: { callId: "A", from: "+15550100", video: false },
    });
    h.emit({
      type: "incomingCall",
      call: { callId: "B", from: "+15550101", video: false },
    });
    await h.controller.answer();
    expect(h.controller.getSnapshot().callId).toBe("B");
    expect(h.part("peer")?.textContent).toBe("+15550101");
    expect(h.part("failure")?.textContent).toBe(
      "The previous call could not be connected.",
    );
    expect(h.part("answer")).not.toBeNull();
    h.node.remove();
    h.controller.dispose();
  });

  it("shows the failure on a call whose answer was refused", async () => {
    const h = setup();
    h.emit({
      type: "incomingCall",
      call: { callId: "A", from: "+15550100", video: false },
    });
    h.emit({
      type: "incomingCall",
      call: { callId: "B", from: "+15550101", video: false },
    });
    h.signaling.accept.mockRejectedValueOnce(new Error("offline"));
    await h.controller.answer();
    // A is still ringing: its card shows the failure and can retry.
    expect(h.part("failure")?.textContent).toBe(
      "Could not connect the call. Try again.",
    );
    expect(h.part("failure")?.getAttribute("role")).toBe("status");
    expect(h.part("answer")?.disabled).toBe(false);
    h.node.remove();
    h.controller.dispose();
  });

  it("offers only Hang up on a placed call until it connects", async () => {
    const h = setup();
    await h.controller.place("+15550100");
    expect(h.controller.getSnapshot().exclusive).toBe(false);
    // Leaving would drop this connection while the callee keeps ringing.
    expect(h.part("leave")).toBeNull();
    expect(h.part("hangup")?.textContent).toBe("Hang up");
    h.emit({ type: "connected", callId: "call-out" });
    expect(h.part("leave")).not.toBeNull();
    expect(h.part("hangup")?.textContent).toBe("End call for everyone");
    h.node.remove();
    h.controller.dispose();
  });

  it("lists participants of the active call", async () => {
    const h = setup();
    h.emit({
      type: "incomingCall",
      call: { callId: "A", from: "+15550100", video: false },
    });
    await h.controller.answer();
    h.emit({
      type: "participant",
      callId: "A",
      participant: {
        id: "p1",
        phoneNumber: "+15550102",
        audioMuted: true,
        video: false,
        state: "connected",
      },
    });
    const list = h.part("participants");
    expect(list?.getAttribute("aria-label")).toBe("Participants");
    expect(list?.textContent).toBe("+15550102");
    expect(list?.querySelector('[part~="muted"]')).not.toBeNull();
    h.node.remove();
    h.controller.dispose();
  });
});

it("renders a remote mute observation independently of the local microphone", () => {
  const fixture = fixtureController({
    status: "connected",
    revision: 0,
    updatedAt: 0,
    capabilities: { video: false, mute: true },
    video: false,
    audioMuted: false,
    videoMuted: true,
    remoteAudioMuted: true,
    selectedDevices: {},
    devices: [],
  });
  const node = document.createElement("pmfa-call") as PolymorfaCallElement;
  node.controller = fixture.controller as never;
  document.body.append(node);
  expect(node.shadowRoot?.textContent).toContain("Their microphone is muted");
  expect(node.shadowRoot?.querySelector('[part="mute"]')?.textContent).toBe(
    "Mute",
  );
  node.remove();
});

it("offers the same screen start and stop controls without React", () => {
  const snapshot = {
    status: "connected",
    revision: 0,
    updatedAt: 0,
    capabilities: { video: true, mute: true },
    video: false,
    audioMuted: false,
    videoMuted: true,
    screenSharing: false,
    selectedDevices: {},
    devices: [],
  };
  const fixture = fixtureController(snapshot);
  const startScreenShare = vi.fn(() => Promise.resolve());
  const stopScreenShare = vi.fn(() => Promise.resolve());
  Object.assign(fixture.controller, {
    canShareScreen: true,
    startScreenShare,
    stopScreenShare,
  });
  const node = document.createElement("pmfa-call") as PolymorfaCallElement;
  node.controller = fixture.controller as never;
  document.body.append(node);
  const button = () =>
    node.shadowRoot!.querySelector<HTMLButtonElement>('[part="screen-share"]')!;
  expect(button().textContent).toBe("Share screen");
  button().click();
  expect(startScreenShare).toHaveBeenCalledOnce();
  fixture.update({ ...snapshot, screenSharing: true });
  expect(button().textContent).toBe("Stop sharing");
  button().click();
  expect(stopScreenShare).toHaveBeenCalledOnce();
  node.remove();
});
