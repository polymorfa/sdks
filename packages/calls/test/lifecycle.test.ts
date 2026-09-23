import { describe, expect, it, vi } from "vitest";

import { CallsAuthError } from "../src/errors.js";
import { LifecycleSocket } from "../src/lifecycle.js";
import { FakeWebSocket, fakeApi, flush, timers } from "./helpers.js";

function lifecycleWith(report = vi.fn(), now = () => 0) {
  FakeWebSocket.instances = [];
  const api = fakeApi();
  const t = timers();
  const socket = new LifecycleSocket({
    api,
    session: "support",
    WebSocket: FakeWebSocket as unknown as typeof globalThis.WebSocket,
    setTimeout: t.setTimeout,
    clearTimeout: t.clearTimeout,
    setInterval: t.setInterval,
    clearInterval: t.clearInterval,
    random: () => 0.5,
    now,
    reportError: report,
  });
  return { api, t, report, socket };
}

describe("LifecycleSocket authentication", () => {
  it("authenticates with the first frame and waits for ready", async () => {
    const h = lifecycleWith();
    const states: boolean[] = [];
    h.socket.on("state", (up) => states.push(up));
    const connecting = h.socket.connect();
    await flush();
    const ws = FakeWebSocket.instances[0]!;
    expect(ws.url).toBe("wss://api.example/voip/ws?ticket=pmfa_wst_test");
    expect(ws.url).not.toContain("token");
    ws.open();
    expect(ws.texts).toEqual([]);
    expect(h.socket.connected).toBe(false);
    // The socket does not claim to be up before the platform accepts the token.
    expect(h.socket.sendCandidate("c", "conn-0001", { candidate: "x" })).toBe(
      false,
    );
    ws.text({ type: "ready", session: "support", participant: "client:e1" });
    await connecting;
    expect(states).toEqual([true]);
    expect(h.socket.connected).toBe(true);
    expect(h.socket.participant).toBe("client:e1");
    expect(h.socket.sendCandidate("c", "conn-0001", { candidate: "x" })).toBe(
      true,
    );
    expect(ws.lastText).toEqual({
      type: "candidate",
      callId: "c",
      connectionId: "conn-0001",
      candidate: { candidate: "x" },
    });
    h.socket.close();
  });

  it("mints a new ticket on reconnect without sending an auth frame", async () => {
    const h = lifecycleWith();
    h.api.socketTicket
      .mockResolvedValueOnce({
        ticket: "first",
        expiresAt: 1,
        url: "/voip/ws?ticket=first",
      })
      .mockResolvedValueOnce({
        ticket: "second",
        expiresAt: 2,
        url: "/voip/ws?ticket=second",
      });
    const connecting = h.socket.connect();
    await flush();
    const first = FakeWebSocket.instances[0]!;
    expect(first.url).toBe("wss://api.example/voip/ws?ticket=first");
    first.authenticate();
    await connecting;
    expect(first.texts).toEqual([]);
    first.drop();
    h.t.fireTimeouts();
    await flush();
    expect(FakeWebSocket.instances[1]!.url).toBe(
      "wss://api.example/voip/ws?ticket=second",
    );
    expect(h.api.socketTicket).toHaveBeenCalledTimes(2);
    h.socket.close();
  });

  it("surfaces a 4401 close as CallsAuthError and mints a new ticket before reconnecting", async () => {
    const h = lifecycleWith();
    const errors: unknown[] = [];
    const states: boolean[] = [];
    h.socket.on("error", (e) => errors.push(e));
    h.socket.on("state", (up) => states.push(up));
    const connecting = h.socket.connect();
    await flush();
    FakeWebSocket.instances[0]!.authenticate();
    await connecting;
    FakeWebSocket.instances[0]!.drop(4401, "unauthorized");
    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(CallsAuthError);
    expect((errors[0] as CallsAuthError).code).toBe("unauthorized");
    expect(states).toEqual([true, false]);
    // Reconnect runs from the backoff timer with a new single-use ticket.
    h.t.fireTimeouts();
    await flush();
    expect(h.api.socketTicket).toHaveBeenCalledTimes(2);
    expect(FakeWebSocket.instances).toHaveLength(2);
    FakeWebSocket.instances[1]!.authenticate();
    expect(h.socket.connected).toBe(true);
    h.socket.close();
  });

  it("names the session and participant in the query for server credentials", async () => {
    FakeWebSocket.instances = [];
    const api = fakeApi();
    api.token.mockResolvedValue({ value: "pmfa_live_key" });
    const t = timers();
    const socket = new LifecycleSocket({
      api,
      session: "support",
      participant: "voice-agent",
      WebSocket: FakeWebSocket as unknown as typeof globalThis.WebSocket,
      setTimeout: t.setTimeout,
      clearTimeout: t.clearTimeout,
      setInterval: t.setInterval,
      clearInterval: t.clearInterval,
    });
    const connecting = socket.connect();
    await flush();
    const ws = FakeWebSocket.instances[0]!;
    expect(ws.url).toBe("wss://api.example/voip/ws?ticket=pmfa_wst_test");
    ws.open();
    expect(ws.texts).toEqual([]);
    expect(api.socketTicket).toHaveBeenCalledWith(
      "support",
      expect.any(AbortSignal),
    );
    ws.text({
      type: "ready",
      session: "support",
      participant: "server:voice-agent",
    });
    await connecting;
    expect(socket.participant).toBe("server:voice-agent");
    socket.close();
  });

  it("stops reconnecting after a 4400 refusal and keeps retrying 4429 and 1013", async () => {
    for (const [code, errorCode, retries] of [
      [4400, "invalid_request", false],
      [4429, "rate_limited", true],
      [4409, "socket_conflict", true],
      [1013, undefined, true],
      [1008, undefined, true],
    ] as const) {
      const h = lifecycleWith();
      const errors: string[] = [];
      h.socket.on("error", (e) => errors.push(e.code));
      const connecting = h.socket.connect();
      await flush();
      FakeWebSocket.instances[0]!.open();
      FakeWebSocket.instances[0]!.drop(code);
      await connecting;
      expect(errors).toEqual(errorCode === undefined ? [] : [errorCode]);
      expect(
        h.t.timeouts.some((x) => x.cleared !== true && x.ms !== 10_000),
      ).toBe(retries);
      h.socket.close();
    }
  });

  it("settles and retries when a handshake fails with an error and no close", async () => {
    const h = lifecycleWith();
    const connecting = h.socket.connect();
    await flush();
    const first = FakeWebSocket.instances[0]!;
    first.failHandshake();
    await connecting;
    expect(h.socket.connected).toBe(false);
    expect(first.closed).toBeDefined();
    // A late close from the failed socket is ignored.
    first.drop(1006);
    h.t.fireTimeouts();
    await flush();
    expect(FakeWebSocket.instances).toHaveLength(2);
    FakeWebSocket.instances[1]!.authenticate();
    await flush();
    expect(h.socket.connected).toBe(true);
    h.socket.close();
  });

  it("reports an error frame sent before ready without authenticating", async () => {
    const h = lifecycleWith();
    const errors: string[] = [];
    h.socket.on("error", (e) => errors.push(e.code));
    const connecting = h.socket.connect();
    await flush();
    const ws = FakeWebSocket.instances[0]!;
    ws.open();
    ws.text({ type: "error", code: "forbidden", message: "no voip_signal" });
    ws.text({
      type: "event",
      event: "call.received",
      callId: "c",
      payload: {},
      timestamp: "",
    });
    expect(errors).toEqual(["forbidden"]);
    expect(h.socket.connected).toBe(false);
    ws.drop(4401);
    await connecting;
    expect(errors).toEqual(["forbidden", "unauthorized"]);
    h.socket.close();
  });

  it("times out an attempt that opens but never receives ready", async () => {
    const h = lifecycleWith();
    const errors: string[] = [];
    h.socket.on("error", (e) => errors.push(e.code));
    const connecting = h.socket.connect();
    await flush();
    FakeWebSocket.instances[0]!.open();
    h.t.fireTimeouts();
    await connecting;
    expect(errors).toEqual(["connect_timeout"]);
    expect(FakeWebSocket.instances[0]!.readyState).toBe(FakeWebSocket.CLOSED);
    h.socket.close();
  });
});

describe("LifecycleSocket listener failures", () => {
  it("settles a pending connect() and retires the attempt when a state listener throws on close()", async () => {
    const h = lifecycleWith();
    const connecting = h.socket.connect();
    await flush();
    FakeWebSocket.instances[0]!.open();
    FakeWebSocket.instances[0]!.text({ type: "ready" });
    await connecting;
    h.socket.on("state", (up) => {
      if (!up) throw new Error("state bug");
    });
    // The consumer's bug still surfaces to close()'s caller...
    expect(() => h.socket.close()).toThrow("state bug");
    // ...and the attempt is retired: nothing reconnects or installs a socket later.
    h.t.fireTimeouts();
    await flush();
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(h.socket.connected).toBe(false);
  });

  it("settles connect() when close() lands during the handshake", async () => {
    const h = lifecycleWith();
    const connecting = h.socket.connect();
    await flush();
    h.socket.close();
    const outcome = await Promise.race([
      connecting.then(() => "settled" as const),
      flush().then(() => "pending" as const),
    ]);
    expect(outcome).toBe("settled");
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
      await h.socket.connect();
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(rejections).toEqual([]);
      expect(h.report).toHaveBeenCalledTimes(1);
      expect((h.report.mock.calls[0]?.[0] as Error).message).toBe(
        "listener bug",
      );
      expect(h.t.timeouts.length).toBeGreaterThan(0);
    } finally {
      process.off("unhandledRejection", onRejection);
    }
    h.socket.close();
  });

  it("falls back to the microtask rethrow when the reporter itself throws", async () => {
    const h = lifecycleWith(
      vi.fn(() => {
        throw new Error("reporter bug");
      }),
    );
    h.api.socketTicket.mockRejectedValue(new Error("mint failed"));
    h.socket.on("error", () => {
      throw new Error("listener bug");
    });
    const scheduled: Array<() => void> = [];
    const original = globalThis.queueMicrotask;
    globalThis.queueMicrotask = (fn: () => void) => {
      scheduled.push(fn);
    };
    const rejections: unknown[] = [];
    const onRejection = (reason: unknown) => {
      rejections.push(reason);
    };
    process.on("unhandledRejection", onRejection);
    try {
      await h.socket.connect();
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(rejections).toEqual([]);
      expect(scheduled).toHaveLength(1);
      expect(() => scheduled[0]?.()).toThrow("listener bug");
    } finally {
      globalThis.queueMicrotask = original;
      process.off("unhandledRejection", onRejection);
    }
    h.socket.close();
  });
});
