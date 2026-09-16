// @vitest-environment happy-dom
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createLocale } from "@polymorfa/ui";
import {
  CallsController,
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
      node.shadowRoot?.querySelector('[aria-label="Header text"]'),
    ).not.toBeNull();
    expect(
      (
        node.shadowRoot?.querySelector(
          '[aria-label="Template body"]',
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
    const controller = new CallsController(
      createSignalingCallsBackend({
        signaling,
        incoming: {
          subscribe: (listener) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
          },
        },
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
    return { node, controller, signaling, close, part, emit };
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
