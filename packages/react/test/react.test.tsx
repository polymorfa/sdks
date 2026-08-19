// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { TemplateBuilderController } from "@polymorfa/browser";
import {
  PolymorfaProvider,
  QuickLink,
  TemplateBuilder,
  useController,
} from "../src/index.js";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function fixtureController() {
  let snapshot = { status: "idle" as const, revision: 0, updatedAt: 0 };
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose: vi.fn(),
    launch: vi.fn(async () => undefined),
    retry: vi.fn(async () => undefined),
    cancel: vi.fn(async () => undefined),
    update: () => {
      snapshot = { status: "idle", revision: 1, updatedAt: 1 };
      for (const listener of listeners) listener();
    },
  };
}

describe("React bindings", () => {
  it("subscribes through useSyncExternalStore and applies provider direction", () => {
    const controller = fixtureController();
    let renders = 0;
    function Probe() {
      useController(controller);
      renders += 1;
      return null;
    }
    const host = document.createElement("div");
    const root = createRoot(host);
    act(() => {
      root.render(
        <PolymorfaProvider
          locale={{ code: "ar", direction: "rtl", messages: {} as never }}
        >
          <Probe />
          <QuickLink controller={controller as never} />
        </PolymorfaProvider>,
      );
    });
    expect(host.querySelector("section")?.dir).toBe("rtl");
    act(() => controller.update());
    expect(renders).toBeGreaterThan(1);
    act(() => root.unmount());
    expect(controller.dispose).not.toHaveBeenCalled();
  });

  it("owns and disposes only factory-created controllers", () => {
    const controller = fixtureController();
    const root = createRoot(document.createElement("div"));
    act(() =>
      root.render(<QuickLink createController={() => controller as never} />),
    );
    act(() => root.unmount());
    expect(controller.dispose).toHaveBeenCalledTimes(1);
  });

  it("edits and previews canonical template structures", async () => {
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
        footer: "Thanks",
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
          footer: "Thanks",
          buttons: [{ type: "quick_reply", text: "Track order" }],
          cards: [],
        },
      }),
      submitToMeta: async () => ({ ...templateDocument, status: "PENDING" }),
      delete: async () => undefined,
    });
    await controller.load("tpl-1");
    const host = document.createElement("div");
    const root = createRoot(host);
    act(() => root.render(<TemplateBuilder controller={controller} />));

    expect(host.querySelector('[aria-label="Header text"]')).not.toBeNull();
    const body = host.querySelector(
      '[aria-label="Template body"]',
    ) as HTMLTextAreaElement;
    expect(body.value).toBe("Hello {{name}}");
    expect(
      host.querySelector('[aria-label="Variable name example"]'),
    ).not.toBeNull();

    await act(async () => controller.refreshPreview());
    expect(host.querySelector("output")?.textContent).toContain("Hello Ada");
    expect(host.querySelector("output")?.textContent).toContain("Track order");
    expect(host.textContent).toContain("Save draft");
    expect(host.textContent).toContain("Submit to Meta");
    act(() => root.unmount());
  });
});
