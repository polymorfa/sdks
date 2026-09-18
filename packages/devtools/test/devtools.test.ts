// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DevAssistant,
  createSimulatedFetch,
  mountDevAssistant,
} from "../src/index.js";

describe("DevAssistant", () => {
  it("cannot be enabled for production or mismatched token environments", () => {
    const production = new DevAssistant({
      environment: "production",
      tokenEnvironment: "production",
    });
    const mismatch = new DevAssistant({
      environment: "development",
      tokenEnvironment: "production",
    });
    expect(production.getSnapshot().enabled).toBe(false);
    expect(mismatch.getSnapshot().enabled).toBe(false);
    expect(mountDevAssistant(production)).toBeNull();
  });

  it("redacts diagnostics and renders explicit development controls", () => {
    const assistant = new DevAssistant({
      environment: "development",
      tokenEnvironment: "development",
    });
    assistant.diagnosticSink({
      type: "request.started",
      timestamp: 1,
      method: "POST",
      path: "/api/messages",
      attempt: 1,
      authorization: "secret",
    } as never);
    expect(JSON.stringify(assistant.getSnapshot().events)).not.toContain(
      "secret",
    );
    const mounted = mountDevAssistant(assistant);
    expect(mounted?.element.shadowRoot?.textContent).toContain(
      "Polymorfa dev mode",
    );
    mounted?.dispose();
  });
});

describe("mountDevAssistant", () => {
  const enabled = () =>
    new DevAssistant({
      environment: "development",
      tokenEnvironment: "development",
    });

  beforeEach(() => sessionStorage.clear());

  it("starts collapsed in the bottom-left corner and toggles the panel", () => {
    const assistant = enabled();
    const mounted = mountDevAssistant(assistant)!;
    const root = mounted.element.shadowRoot!;
    const launcher = root.querySelector<HTMLButtonElement>(
      'button[aria-label="Polymorfa dev mode"]',
    )!;
    const panel = root.querySelector<HTMLElement>('[role="dialog"]')!;
    expect(mounted.element.style.left).toBe("16px");
    expect(mounted.element.style.bottom).toBe("16px");
    expect(launcher.getAttribute("aria-expanded")).toBe("false");
    expect(launcher.getAttribute("aria-controls")).toBe(panel.id);
    expect(panel.hidden).toBe(true);
    expect(panel.getAttribute("aria-label")).toBeTruthy();

    launcher.click();
    expect(panel.hidden).toBe(false);
    expect(launcher.getAttribute("aria-expanded")).toBe("true");
    expect(sessionStorage.getItem("polymorfa:devtools:open")).toBe("1");

    root
      .querySelector<HTMLInputElement>('input[value="dark"]')!
      .dispatchEvent(new Event("change"));
    expect(assistant.getSnapshot().appearance.theme).toBe("system");
    const dark = root.querySelector<HTMLInputElement>('input[value="dark"]')!;
    dark.checked = true;
    dark.dispatchEvent(new Event("change"));
    expect(assistant.getSnapshot().appearance.theme).toBe("dark");

    panel.querySelector("select")!.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        composed: true,
      }),
    );
    expect(panel.hidden).toBe(true);
    expect(root.activeElement).toBe(launcher);
    launcher.click();
    launcher.click();
    expect(mounted.isOpen).toBe(false);
    mounted.dispose();
    expect(mounted.element.isConnected).toBe(false);
  });

  it("honours position, offset, defaultOpen, and the remembered state", () => {
    const first = mountDevAssistant(enabled(), {
      position: "top-right",
      offset: { x: 4, y: 8 },
      defaultOpen: true,
    })!;
    expect(first.element.style.top).toBe("8px");
    expect(first.element.style.right).toBe("4px");
    expect(first.isOpen).toBe(true);
    first.close();
    first.dispose();
    const second = mountDevAssistant(enabled(), { defaultOpen: true })!;
    expect(second.isOpen).toBe(false);
    second.dispose();
  });

  it("still accepts a parent element and survives blocked storage", () => {
    const parent = document.createElement("div");
    document.body.append(parent);
    const getItem = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new Error("blocked");
      });
    const mounted = mountDevAssistant(enabled(), parent)!;
    expect(mounted.element.parentElement).toBe(parent);
    expect(mounted.isOpen).toBe(false);
    getItem.mockRestore();
    mounted.dispose();
    parent.remove();
  });
});

describe("createSimulatedFetch", () => {
  it("fails locally when the explicit profile is offline", async () => {
    const fetch = createSimulatedFetch({
      profile: () => "offline",
      fetch: vi.fn(),
    });
    await expect(fetch("https://api.test")).rejects.toThrow(
      "Simulated offline",
    );
  });
});
