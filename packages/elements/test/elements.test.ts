// @vitest-environment happy-dom
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createLocale } from "@polymorfa/ui";
import {
  definePolymorfaElements,
  type ElementController,
  PolymorfaQuickLinkElement,
  PolymorfaChatDrawerElement,
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
});
