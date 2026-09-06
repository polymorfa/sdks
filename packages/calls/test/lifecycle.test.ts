import { describe, expect, it, vi } from "vitest";

import { LifecycleSocket } from "../src/lifecycle.js";
import { FakeWebSocket, fakeApi, flush, timers } from "./helpers.js";

function lifecycleWith() {
  FakeWebSocket.instances = [];
  const api = fakeApi();
  const t = timers();
  const report = vi.fn();
  const socket = new LifecycleSocket({
    api,
    session: "support",
    WebSocket: FakeWebSocket as unknown as typeof globalThis.WebSocket,
    setTimeout: t.setTimeout,
    clearTimeout: t.clearTimeout,
    setInterval: t.setInterval,
    clearInterval: t.clearInterval,
    reportError: report,
  });
  return { api, t, report, socket };
}

describe("LifecycleSocket listener failures", () => {
  it("settles a pending connect() and retires the attempt when a state listener throws on close()", async () => {
    const h = lifecycleWith();
    const connecting = h.socket.connect();
    await flush(); // ticket minted, socket constructed, handshake still pending
    expect(FakeWebSocket.instances).toHaveLength(1);
    h.socket.on("state", (up) => {
      if (!up) throw new Error("state bug");
    });
    // The consumer's bug still surfaces to close()'s caller...
    expect(() => h.socket.close()).toThrow("state bug");
    // ...but connect() must not be left hanging behind it.
    const outcome = await Promise.race([
      connecting.then(() => "settled" as const),
      flush().then(() => "pending" as const),
    ]);
    expect(outcome).toBe("settled");
    // And the attempt is retired: nothing reconnects or installs a socket later.
    h.t.fireTimeouts();
    await flush();
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(h.socket.connected).toBe(false);
  });

  it("reports a listener exception from a failed ticket request instead of leaving an unhandled rejection", async () => {
    const h = lifecycleWith();
    h.api.socketTicket.mockRejectedValue(new Error("mint failed"));
    h.socket.on("error", () => {
      throw new Error("listener bug");
    });
    const rejections: unknown[] = [];
    const onRejection = (reason: unknown) => {
      rejections.push(reason);
    };
    process.on("unhandledRejection", onRejection);
    try {
      // The failed attempt still settles connect()...
      await h.socket.connect();
      // ...an unhandled rejection would fire by the next macrotask; none may.
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(rejections).toEqual([]);
      expect(h.report).toHaveBeenCalledTimes(1);
      expect((h.report.mock.calls[0]?.[0] as Error).message).toBe("listener bug");
      // The retry policy is unaffected by the consumer's bug.
      expect(h.t.timeouts.length).toBeGreaterThan(0);
    } finally {
      process.off("unhandledRejection", onRejection);
    }
    h.socket.close();
  });
});
