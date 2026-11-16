// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CallsController, CallsSnapshot } from "@polymorfa/ui-kit";
import { CallConnectionPicker } from "../../src/react/call-connection-picker.js";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
const roots: Root[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  document.body.replaceChildren();
});
function connection(id: string) {
  let snapshot = { status: "ready", answering: false } as CallsSnapshot;
  const listeners = new Set<() => void>();
  return {
    id,
    label: `${id} · +1555`,
    controller: {
      getSnapshot: () => snapshot,
      subscribe: (listener: () => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    } as unknown as CallsController,
    set: (
      status: CallsSnapshot["status"],
      answering = false,
      placing = false,
    ) => {
      snapshot = { ...snapshot, status, answering, placing };
      for (const listener of listeners) listener();
    },
    listeners,
  };
}
function mount(
  connections: ReturnType<typeof connection>[],
  onChange = vi.fn(),
) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  act(() =>
    root.render(
      <CallConnectionPicker
        connections={connections}
        value="support"
        onChange={onChange}
      />,
    ),
  );
  return { select: host.querySelector("select")!, onChange, host };
}
describe("outgoing Connection selection", () => {
  it("selects only an application-supplied Connection without changing its controller", () => {
    const support = connection("support");
    const sales = connection("sales");
    const view = mount([support, sales]);
    expect(view.host.querySelector("label")?.textContent).toBe(
      "Outgoing connection",
    );
    act(() => {
      view.select.value = "sales";
      view.select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(view.onChange).toHaveBeenCalledWith("sales");
    expect(support.controller.getSnapshot().status).toBe("ready");
    expect(sales.controller.getSnapshot().status).toBe("ready");
  });
  it.each(["ringing", "connecting", "connected", "reconnecting"] as const)(
    "locks every choice while another Connection is %s",
    (status) => {
      const support = connection("support");
      const sales = connection("sales");
      const view = mount([support, sales]);
      act(() => sales.set(status));
      expect(view.select.disabled).toBe(true);
      act(() => {
        view.select.value = "sales";
        view.select.dispatchEvent(new Event("change", { bubbles: true }));
      });
      expect(view.onChange).not.toHaveBeenCalled();
      act(() => sales.set("ended"));
      expect(view.select.disabled).toBe(false);
    },
  );
  it("checks a new answer operation before a stale change handler can select", () => {
    const support = connection("support");
    const sales = connection("sales");
    const view = mount([support, sales]);
    act(() => {
      sales.set("incoming", true);
      view.select.value = "sales";
      view.select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(view.onChange).not.toHaveBeenCalled();
    act(() => roots[0]!.unmount());
    roots.splice(0);
    expect(support.listeners.size).toBe(0);
    expect(sales.listeners.size).toBe(0);
  });
  it("locks selection while placement is pending and the call remains ready", () => {
    const support = connection("support");
    const sales = connection("sales");
    const view = mount([support, sales]);
    act(() => support.set("ready", false, true));
    expect(view.select.disabled).toBe(true);
    act(() => {
      view.select.value = "sales";
      view.select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(view.onChange).not.toHaveBeenCalled();
    act(() => support.set("error"));
    expect(view.select.disabled).toBe(false);
  });
});
