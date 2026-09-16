// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import {
  CallsController,
  CallsSocket,
  createSignalingCallsBackend,
  lifecycleEventFrom,
  parseCallsSocketMessage,
  type CallMediaFactory,
  type CallMediaSession,
  type CallsSignaling,
} from "../src/index.js";

class FakeWebSocket {
  static readonly OPEN = 1;
  static readonly CLOSED = 3;
  static instances: FakeWebSocket[] = [];
  readyState = 0;
  sent: string[] = [];
  onopen: ((event: unknown) => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: ((event: unknown) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }
  open(): void {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.({});
  }
  /** Open, then accept the auth frame as the platform does. */
  authenticate(): void {
    this.open();
    this.receive({ type: "ready", session: "support" });
  }
  receive(message: unknown): void {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
  drop(code = 1006): void {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.({ code, reason: "" });
  }
  send(data: string): void {
    this.sent.push(data);
  }
  close(): void {
    this.readyState = FakeWebSocket.CLOSED;
  }
}

function signaling(): CallsSignaling & {
  token: ReturnType<typeof vi.fn>;
} {
  return {
    offer: vi.fn(async () => ({ sdp: "v=0", iceServers: [] })),
    candidate: vi.fn(async () => undefined),
    candidates: vi.fn(async () => []),
    accept: vi.fn(async () => ({
      answered: true,
      answeredBy: "client:self",
      exclusive: false,
    })),
    reject: vi.fn(async () => undefined),
    leave: vi.fn(async () => undefined),
    end: vi.fn(async () => undefined),
    token: vi.fn(async () => ({ value: "pmfa_ct_abc" })),
    socketUrl: (path: string) => `wss://api.example${path}`,
  };
}

function socketWith(
  options: Partial<ConstructorParameters<typeof CallsSocket>[0]> = {},
) {
  FakeWebSocket.instances = [];
  const intervals: Array<{ fn: () => void; cleared?: boolean }> = [];
  const timers: Array<{
    fn: () => void;
    ms: number;
    cleared?: boolean;
    fired?: boolean;
  }> = [];
  const socket = new CallsSocket({
    signaling: signaling(),
    WebSocket: FakeWebSocket as unknown as typeof globalThis.WebSocket,
    setTimeout: ((fn: () => void, ms: number) => {
      const entry = {
        ms,
        fn: () => {
          entry.fired = true;
          fn();
        },
      } as (typeof timers)[number];
      timers.push(entry);
      return timers.length as unknown as ReturnType<typeof setTimeout>;
    }) as unknown as typeof globalThis.setTimeout,
    clearTimeout: ((handle: number) => {
      const entry = timers[handle - 1];
      if (entry !== undefined) entry.cleared = true;
    }) as unknown as typeof globalThis.clearTimeout,
    setInterval: ((fn: () => void) => {
      intervals.push({ fn });
      return intervals.length as unknown as ReturnType<typeof setInterval>;
    }) as unknown as typeof globalThis.setInterval,
    clearInterval: ((handle: number) => {
      const entry = intervals[handle - 1];
      if (entry !== undefined) entry.cleared = true;
    }) as unknown as typeof globalThis.clearInterval,
    random: () => 0.5,
    ...options,
  });
  return {
    socket,
    timers,
    intervals,
    // Fire every live heartbeat tick.
    beat: () => {
      for (const entry of [...intervals])
        if (entry.cleared !== true) entry.fn();
    },
    ws: () => FakeWebSocket.instances.at(-1)!,
  };
}

describe("CallsSocket", () => {
  it("settles and retries when the WebSocket constructor throws", async () => {
    class Throwing {
      static readonly OPEN = 1;
      constructor() {
        throw new Error("insecure url");
      }
    }
    const { socket, timers } = socketWith({
      WebSocket: Throwing as unknown as typeof globalThis.WebSocket,
    });
    // A constructor that throws must not leave connect() pending forever, or
    // every later connect() would return that same dead promise.
    await socket.connect();
    expect(socket.connected).toBe(false);
    expect(timers).toHaveLength(1);
    await socket.connect();
    socket.close();
  });

  it("stops on a signaling client that cannot supply a token, retries on a failed request", async () => {
    const noTickets = socketWith({
      signaling: { token: undefined, socketUrl: undefined } as never,
    });
    const unsupported: { code: string; message: string }[] = [];
    noTickets.socket.onError((error) => unsupported.push(error));
    await noTickets.socket.connect();
    // Retrying this can never succeed, so it must report and stop rather than
    // back off against it for the life of the page.
    expect(unsupported.map((e) => e.code)).toEqual(["unsupported"]);
    expect(noTickets.timers).toHaveLength(0);
    noTickets.socket.close();

    const failing = signaling();
    failing.token = vi.fn(async () => {
      throw new Error("token route down");
    });
    const transient = socketWith({ signaling: failing });
    const errors: { code: string; message: string }[] = [];
    transient.socket.onError((error) => errors.push(error));
    await transient.socket.connect();
    // A token route that is merely down is worth retrying — but not silently.
    expect(errors.map((e) => ({ code: e.code, message: e.message }))).toEqual([
      { code: "token_failed", message: "token route down" },
    ]);
    expect(transient.timers).toHaveLength(1);
    transient.socket.close();
  });

  it("carries the configured line onto socket-delivered incoming calls", async () => {
    const { socket, ws } = socketWith({ line: "cloudApi" });
    const backend = createSignalingCallsBackend({
      signaling: signaling(),
      incoming: socket,
    });
    const session: CallMediaSession = {
      localStream: {} as MediaStream,
      remoteStream: {} as MediaStream,
      setMuted: vi.fn(),
      audioEnabled: () => true,
      videoEnabled: () => false,
      close: vi.fn(async () => undefined),
    };
    const controller = new CallsController(backend, {
      open: vi.fn(async () => session),
    });
    controller.initialize();
    const connecting = socket.connect();
    await Promise.resolve();
    await Promise.resolve();
    ws().authenticate();
    await connecting;

    ws().receive({
      type: "event",
      event: "call.received",
      callId: "CALL-9",
      payload: { callId: "CALL-9", from: "+15550100", hasVideo: true },
      timestamp: "",
    });
    // Hardcoding linkedDevice here offered video controls on a line that has
    // no video at all.
    expect(controller.getSnapshot()).toMatchObject({
      status: "incoming",
      line: "cloudApi",
      video: false,
      capabilities: { video: false },
    });
    controller.dispose();
    socket.close();
  });

  it("pings, and drops a socket that stops answering", async () => {
    const h = socketWith({ heartbeatMs: 1_000 });
    const states: boolean[] = [];
    h.socket.onState((connected) => states.push(connected));
    const connecting = h.socket.connect();
    await Promise.resolve();
    await Promise.resolve();
    const first = h.ws();
    first.authenticate();
    await connecting;

    h.beat();
    expect(JSON.parse(first.sent.at(-1) ?? "{}")).toEqual({ type: "ping" });
    // Answered every tick: the connection stays up.
    first.receive({ type: "pong" });
    h.beat();
    first.receive({ type: "pong" });
    expect(h.socket.connected).toBe(true);
    expect(states).toEqual([true]);

    // Unanswered: a half-open socket still reports OPEN and fires no onclose,
    // so nothing else would ever notice ICE had stopped flowing. The tick
    // after the unanswered ping drops it.
    h.beat();
    expect(h.socket.connected).toBe(true);
    h.beat();
    expect(states).toEqual([true, false]);
    expect(h.socket.connected).toBe(false);
    expect(h.timers.length).toBeGreaterThan(0);
    expect(h.intervals.every((t) => t.cleared === true)).toBe(true);
    h.socket.close();
  });

  it("drops a socket whose handshake never completes", async () => {
    const h = socketWith({ openTimeoutMs: 5_000, minBackoffMs: 100 });
    const states: boolean[] = [];
    h.socket.onState((connected) => states.push(connected));
    const connecting = h.socket.connect();
    await Promise.resolve();
    await Promise.resolve();
    const stalled = h.ws();
    // The browser never fires onopen or onclose for a stalled upgrade, so
    // only the handshake deadline can move this attempt on.
    const open = h.timers.find((t) => t.ms === 5_000);
    expect(open).toBeDefined();
    open?.fn();
    await connecting;
    expect(h.socket.connected).toBe(false);
    expect(stalled.readyState).toBe(FakeWebSocket.CLOSED);
    // It never authenticated, so no state change is reported.
    expect(states).toEqual([]);
    // A reconnect is scheduled with backoff, not another bare handshake.
    const backoff = h.timers.filter(
      (t) => t.cleared !== true && t.fired !== true,
    );
    expect(backoff).toHaveLength(1);
    // A second connect() is a fresh attempt rather than the dead one.
    backoff[0]?.fn();
    await Promise.resolve();
    await Promise.resolve();
    expect(FakeWebSocket.instances).toHaveLength(2);
    h.socket.close();
  });

  it("clears the handshake deadline once the platform accepts the token", async () => {
    const h = socketWith({ openTimeoutMs: 5_000 });
    const connecting = h.socket.connect();
    await Promise.resolve();
    await Promise.resolve();
    h.ws().open();
    // Opening alone does not clear the deadline; the auth answer does.
    expect(h.timers.find((t) => t.ms === 5_000)?.cleared).not.toBe(true);
    h.ws().receive({ type: "ready" });
    await connecting;
    const open = h.timers.find((t) => t.ms === 5_000);
    expect(open?.cleared).toBe(true);
    expect(h.socket.connected).toBe(true);
    h.socket.close();
  });

  it("surfaces server error frames to onError", async () => {
    const { socket, ws } = socketWith();
    const seen: { code: string; message: string }[] = [];
    socket.onError((error) => seen.push(error));
    const connecting = socket.connect();
    await Promise.resolve();
    await Promise.resolve();
    ws().authenticate();
    await connecting;

    ws().receive({ type: "error", code: "rate_limited", message: "Slow down" });
    expect(seen.map((e) => [e.code, e.message])).toEqual([
      ["rate_limited", "Slow down"],
    ]);
    ws().receive({ type: "pong" });
    ws().receive({ type: "error", code: "x" });
    expect(seen).toHaveLength(1);
    // A 4401 close is an authentication failure, and the next attempt asks
    // the token provider for a new token.
    ws().drop(4401);
    expect(seen.at(-1)).toMatchObject({ code: "unauthorized" });
    socket.close();
  });

  it("authenticates with the first frame and feeds lifecycle events to the backend", async () => {
    const { socket, ws } = socketWith();
    const connecting = socket.connect();
    await Promise.resolve();
    await Promise.resolve();
    expect(ws().url).toBe("wss://api.example/voip/ws");
    ws().open();
    expect(ws().sent.map((x) => JSON.parse(x) as unknown)).toEqual([
      { type: "auth", token: "pmfa_ct_abc" },
    ]);
    expect(socket.connected).toBe(false);
    ws().receive({ type: "ready", session: "support" });
    await connecting;
    expect(socket.connected).toBe(true);

    const backend = createSignalingCallsBackend({
      signaling: signaling(),
      incoming: socket,
    });
    const session: CallMediaSession = {
      localStream: {} as MediaStream,
      remoteStream: {} as MediaStream,
      setMuted: vi.fn(),
      audioEnabled: () => true,
      videoEnabled: () => false,
      close: vi.fn(async () => undefined),
    };
    const media: CallMediaFactory = { open: vi.fn(async () => session) };
    const controller = new CallsController(backend, media);
    controller.initialize();

    ws().receive({
      type: "event",
      event: "call.received",
      callId: "CALL-1",
      payload: {
        callId: "CALL-1",
        from: { id: "15550100@s.whatsapp.net", phoneNumber: "+15550100" },
        hasVideo: true,
      },
      timestamp: "2026-09-06T12:00:00.000Z",
    });
    expect(controller.getSnapshot()).toMatchObject({
      status: "incoming",
      callId: "CALL-1",
      peer: "+15550100",
      video: true,
    });

    ws().receive({
      type: "event",
      event: "call.ended",
      callId: "CALL-1",
      payload: { callId: "CALL-1", reason: "user_hangup" },
      timestamp: "",
    });
    expect(controller.getSnapshot()).toMatchObject({
      status: "ended",
      endReason: "remote_hangup",
    });
    controller.dispose();
  });

  it("carries candidates both ways and reports false while down", async () => {
    const { socket, ws } = socketWith();
    const remote: Array<[string, unknown]> = [];
    socket.onCandidate((callId, candidate) => remote.push([callId, candidate]));
    expect(
      socket.sendCandidate("CALL-1", { candidate: "c" }, "conn-0001"),
    ).toBe(false);
    const connecting = socket.connect();
    await Promise.resolve();
    await Promise.resolve();
    ws().authenticate();
    await connecting;
    expect(
      socket.sendCandidate(
        "CALL-1",
        { candidate: "candidate:1", sdpMid: "0" },
        "conn-0001",
      ),
    ).toBe(true);
    expect(JSON.parse(ws().sent.at(-1) ?? "{}")).toEqual({
      type: "candidate",
      callId: "CALL-1",
      connectionId: "conn-0001",
      candidate: { candidate: "candidate:1", sdpMid: "0" },
    });
    ws().receive({
      type: "candidate",
      callId: "CALL-1",
      connectionId: "conn-0001",
      candidate: { candidate: "candidate:9" },
    });
    expect(remote).toEqual([["CALL-1", { candidate: "candidate:9" }]]);
  });

  it("reconnects with capped backoff until closed", async () => {
    const { socket, timers, ws } = socketWith({
      minBackoffMs: 100,
      maxBackoffMs: 1_000,
    });
    const states: boolean[] = [];
    socket.onState((connected) => states.push(connected));
    const connecting = socket.connect();
    await Promise.resolve();
    await Promise.resolve();
    ws().authenticate();
    await connecting;
    ws().drop();
    expect(states).toEqual([true, false]);
    // Pending timers only: the open-handshake deadline is cleared on open and
    // a fired backoff stays in the list.
    const live = () =>
      timers.filter((t) => t.cleared !== true && t.fired !== true);
    expect(live()).toHaveLength(1);
    expect(live()[0]?.ms).toBe(75); // 100ms × (0.5 + 0.5/2)
    live()[0]?.fn();
    await Promise.resolve();
    await Promise.resolve();
    expect(FakeWebSocket.instances).toHaveLength(2);
    ws().drop();
    expect(live()[0]?.ms).toBe(150); // doubled
    socket.close();
    live()[0]?.fn();
    await Promise.resolve();
    await Promise.resolve();
    expect(FakeWebSocket.instances).toHaveLength(2); // no reconnect after close
  });
});

describe("CallsSocket lifecycle", () => {
  it("settles a pending connect() when close() is called mid-attempt", async () => {
    const { socket } = socketWith();
    const connecting = socket.connect();
    await Promise.resolve();
    await Promise.resolve();
    // The fake socket never opens; teardown must not leave connect() hanging.
    socket.close();
    await expect(
      Promise.race([
        connecting,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("connect() hung")), 200),
        ),
      ]),
    ).resolves.toBeUndefined();
    expect(socket.connected).toBe(false);
  });

  it("settles connect() and aborts the token request when closed during acquisition", async () => {
    let resolveToken: ((t: { value: string }) => void) | undefined;
    let tokenSignal: AbortSignal | undefined;
    const sig = signaling();
    sig.token = vi.fn((request?: { signal?: AbortSignal }) => {
      tokenSignal = request?.signal;
      return new Promise<{ value: string }>((resolve) => {
        resolveToken = resolve;
      });
    });
    FakeWebSocket.instances = [];
    const socket = new CallsSocket({
      signaling: sig,
      WebSocket: FakeWebSocket as unknown as typeof globalThis.WebSocket,
    });
    const connecting = socket.connect();
    await Promise.resolve();
    socket.close();
    await expect(
      Promise.race([
        connecting,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("connect() hung")), 200),
        ),
      ]),
    ).resolves.toBeUndefined();
    expect(tokenSignal?.aborted).toBe(true);
    // The stale token completing later must not open a socket.
    resolveToken?.({ value: "pmfa_ct_late" });
    await Promise.resolve();
    await Promise.resolve();
    expect(FakeWebSocket.instances).toHaveLength(0);
    // A fresh connect() after close works again.
    sig.token = vi.fn(async () => ({ value: "pmfa_ct_new" }));
    const again = socket.connect();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(FakeWebSocket.instances).toHaveLength(1);
    FakeWebSocket.instances[0]?.authenticate();
    await again;
    expect(socket.connected).toBe(true);
    socket.close();
  });

  it("ignores a second connect() while a socket exists", async () => {
    const { socket, ws } = socketWith();
    const first = socket.connect();
    await Promise.resolve();
    await Promise.resolve();
    ws().authenticate();
    await first;
    await socket.connect();
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(socket.connected).toBe(true);
  });
});

describe("socket frame mapping", () => {
  it("drops unknown frames and maps pod reasons onto the controller vocabulary", () => {
    expect(parseCallsSocketMessage("not json")).toBeUndefined();
    expect(
      parseCallsSocketMessage(JSON.stringify({ type: "offer" })),
    ).toBeUndefined();
    expect(parseCallsSocketMessage(JSON.stringify({ type: "pong" }))).toEqual({
      type: "pong",
    });
    // A known `type` is not enough: an incomplete frame would otherwise reach
    // the receiver with missing fields.
    expect(
      parseCallsSocketMessage(JSON.stringify({ type: "event", event: "x" })),
    ).toBeUndefined();
    expect(
      parseCallsSocketMessage(
        JSON.stringify({ type: "candidate", callId: "c" }),
      ),
    ).toBeUndefined();
    expect(
      parseCallsSocketMessage(
        JSON.stringify({
          type: "candidate",
          callId: "c",
          candidate: { sdpMid: "0" },
        }),
      ),
    ).toBeUndefined();
    expect(parseCallsSocketMessage(JSON.stringify({ type: "ready" }))).toEqual({
      type: "ready",
    });
    expect(
      parseCallsSocketMessage(JSON.stringify({ type: "ready", session: 1 })),
    ).toBeUndefined();
    expect(
      parseCallsSocketMessage(JSON.stringify({ type: "error", code: "nope" })),
    ).toBeUndefined();
    // A serialized RTCIceCandidate carries null for an absent sdpMid.
    expect(
      parseCallsSocketMessage(
        JSON.stringify({
          type: "candidate",
          callId: "c",
          candidate: {
            candidate: "candidate:1",
            sdpMid: null,
            sdpMLineIndex: null,
          },
        }),
      ),
    ).toMatchObject({ type: "candidate", callId: "c" });
    const ev = (event: string, payload: unknown) =>
      lifecycleEventFrom({
        type: "event",
        event,
        callId: "CALL-1",
        payload,
        timestamp: "",
      });
    expect(ev("call.ended", { reason: "media_timeout" })).toEqual({
      type: "ended",
      callId: "CALL-1",
      reason: "ice_timeout",
    });
    expect(ev("call.ended", { reason: "pod_draining" })).toEqual({
      type: "ended",
      callId: "CALL-1",
      reason: "pod_draining",
    });
    expect(ev("call.missed", {})).toEqual({
      type: "ended",
      callId: "CALL-1",
      reason: "missed",
    });
    expect(
      ev("call.received", { from: "+15550100", direction: "outgoing" }),
    ).toBeUndefined();
    expect(
      ev("call.received", { from: { id: "739182640518203" } }),
    ).toMatchObject({
      type: "incomingCall",
      call: { from: "739182640518203", video: false },
    });
    expect(ev("call.telemetry", {})).toBeUndefined();
    expect(
      ev("call.accepted", { answeredBy: "client:abc", exclusive: true }),
    ).toEqual({
      type: "accepted",
      callId: "CALL-1",
      answeredBy: "client:abc",
      exclusive: true,
    });
    expect(ev("call.accepted", {})).toEqual({
      type: "accepted",
      callId: "CALL-1",
      exclusive: false,
    });
    const participant = {
      id: "p1",
      phoneNumber: "+15550101",
      audioMuted: false,
      video: false,
      state: "connected",
    };
    expect(
      ev("call.participant_joined", { callId: "CALL-1", participant }),
    ).toEqual({ type: "participant", callId: "CALL-1", participant });
    expect(
      ev("call.participant_joined", { callId: "OTHER", participant }),
    ).toBeUndefined();
    expect(
      ev("call.participant_left", { callId: "CALL-1", participantId: "p1" }),
    ).toEqual({
      type: "participantLeft",
      callId: "CALL-1",
      participantId: "p1",
    });
  });
});
