// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { PolymorfaProvider, QuickLink, useController } from "../src/index.js";

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
});
