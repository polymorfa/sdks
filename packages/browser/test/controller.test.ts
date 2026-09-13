import { describe, expect, it, vi } from "vitest";

import { ObservableController, type ControllerSnapshot } from "../src/index.js";

interface FixtureState extends ControllerSnapshot {
  readonly status: "idle" | "ready";
  readonly value: number;
}

class FixtureController extends ObservableController<FixtureState> {
  constructor() {
    super({ status: "idle", value: 0 });
  }

  setValue(value: number): void {
    this.transition({ status: "ready", value });
  }
}

describe("ObservableController", () => {
  it("emits one immutable revision per transition and stops after disposal", () => {
    const controller = new FixtureController();
    const listener = vi.fn();
    const unsubscribe = controller.subscribe(listener);
    controller.setValue(1);
    expect(controller.getSnapshot()).toMatchObject({
      status: "ready",
      value: 1,
      revision: 1,
    });
    expect(Object.isFrozen(controller.getSnapshot())).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    controller.setValue(2);
    expect(listener).toHaveBeenCalledTimes(1);
    controller.dispose();
    expect(() => controller.setValue(3)).toThrow("disposed");
  });
});
