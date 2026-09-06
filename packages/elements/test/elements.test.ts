// @vitest-environment happy-dom
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createLocale } from "@polymorfa/ui";
import { TemplateBuilderController } from "@polymorfa/browser";
import {
  definePolymorfaElements,
  type ElementController,
  PolymorfaQuickLinkElement,
  PolymorfaChatDrawerElement,
  PolymorfaTemplateBuilderElement,
} from "../src/index.js";

function fixtureController<T extends object>(initial: T) {
  let snapshot = initial;
  const listeners = new Set<() => void>();
  const controller: ElementController<T> & {
    launch: ReturnType<typeof vi.fn>;
    retry: ReturnType<typeof vi.fn>;
    cancel: ReturnType<typeof vi.fn>;
  } = {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    launch: vi.fn(async () => undefined),
    retry: vi.fn(async () => undefined),
    cancel: vi.fn(async () => undefined),
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
        "pmfa-quicklink",
        "pmfa-chat-drawer",
        "pmfa-message-list",
        "pmfa-compose-box",
        "pmfa-template-builder",
        "pmfa-call",
      ].every((name) => customElements.get(name) !== undefined),
    ).toBe(true);
  });
  it("binds QuickLink state, actions, direction, parts, and cleanup", () => {
    const fixture = fixtureController({
      status: "idle",
      revision: 0,
      updatedAt: 0,
    });
    const node = document.createElement(
      "pmfa-quicklink",
    ) as PolymorfaQuickLinkElement;
    node.configuration = {
      locale: createLocale("ar"),
      appearance: { variables: { colorPrimary: "#123456" } },
    };
    node.controller = fixture.controller as never;
    document.body.append(node);
    expect(node.dir).toBe("rtl");
    expect(node.style.getPropertyValue("--pmfa-color-primary")).toBe("#123456");
    (node.shadowRoot?.querySelector("button") as HTMLButtonElement).click();
    expect(fixture.controller.launch).toHaveBeenCalledTimes(1);
    fixture.update({ status: "complete", revision: 1, updatedAt: 1 });
    expect(node.shadowRoot?.textContent).toContain("complete");
    node.remove();
    expect(fixture.listeners.size).toBe(0);
  });
  it("scopes the call element's assertive region to the status heading", () => {
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
    Object.assign(fixture.controller, { enableVideo, setMuted });
    const node = document.createElement("pmfa-call");
    (node as unknown as { controller: unknown }).controller =
      fixture.controller;
    document.body.append(node);

    const root = node.shadowRoot;
    // The element re-renders wholesale, so an assertive panel re-announced the
    // peer number and every control each time a mute label changed.
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

    // An audio call on a video-capable line offers the upgrade, matching the
    // React dock; without it the element could never reach video.
    fixture.update({ ...base, revision: 4, video: false });
    const camera = root?.querySelector('[part="camera"]') as HTMLButtonElement;
    expect(camera.textContent).toBe("Turn camera on");
    camera.click();
    expect(enableVideo).toHaveBeenCalledTimes(1);
    expect(setMuted).not.toHaveBeenCalled();

    // On a video call the same button mutes the outgoing track instead.
    fixture.update({ ...base, revision: 5 });
    (root?.querySelector('[part="camera"]') as HTMLButtonElement).click();
    expect(setMuted).toHaveBeenCalledWith({ video: true });
    expect(enableVideo).toHaveBeenCalledTimes(1);

    // The element takes any controller, so a line without mute must not be
    // offered the control.
    fixture.update({ ...base, revision: 2 });
    expect(root?.querySelector('[part="mute"]')).not.toBeNull();
    fixture.update({
      ...base,
      revision: 3,
      capabilities: { video: true, mute: false },
    });
    expect(root?.querySelector('[part="mute"]')).toBeNull();
    expect(root?.querySelector('[part="hangup"]')).not.toBeNull();
    node.remove();
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
