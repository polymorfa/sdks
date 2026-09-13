// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
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
    expect(mounted?.element.textContent).toContain("Polymorfa dev mode");
    mounted?.dispose();
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
