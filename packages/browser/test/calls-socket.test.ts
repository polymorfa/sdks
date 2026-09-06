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
  type SocketTicket,
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
  receive(message: unknown): void {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
  drop(): void {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.({ code: 1006 });
  }
  send(data: string): void {
    this.sent.push(data);
  }
  close(): void {
    this.readyState = FakeWebSocket.CLOSED;
  }
}

function signaling(): CallsSignaling & {
  socketTicket: ReturnType<typeof vi.fn>;
} {
  return {
    offer: vi.fn(async () => ({ sdp: "v=0", iceServers: [] })),
    candidate: vi.fn(async () => undefined),
    candidates: vi.fn(async () => []),
    teardown: vi.fn(async () => undefined),
    socketTicket: vi.fn(async () => ({
      ticket: "pmfa_wst_abc",
      expiresAt: Date.now() + 60_000,
      url: "/voip/ws?ticket=pmfa_wst_abc",
    })),
    socketUrl: (ticket) => `wss://api.example${ticket.url}`,
  };
}

function socketWith(
  options: Partial<ConstructorParameters<typeof CallsSocket>[0]> = {},
) {
  FakeWebSocket.instances = [];
  const timers: Array<{ fn: () => void; ms: number }> = [];
  const socket = new CallsSocket({
    signaling: signaling(),
    WebSocket: FakeWebSocket as unknown as typeof globalThis.WebSocket,
    setTimeout: ((fn: () => void, ms: number) => {
      timers.push({ fn, ms });
      return timers.length as unknown as ReturnType<typeof setTimeout>;
    }) as unknown as typeof globalThis.setTimeout,
    clearTimeout: (() =>
      undefined) as unknown as typeof globalThis.clearTimeout,
    random: () => 0.5,
    ...options,
  });
  return { socket, timers, ws: () => FakeWebSocket.instances.at(-1)! };
}

describe("CallsSocket", () => {
  it("mints a ticket, opens the socket, and feeds lifecycle events to the backend", async () => {
    const { socket, ws } = socketWith();
    const connecting = socket.connect();
    await Promise.resolve();
    await Promise.resolve();
    expect(ws().url).toBe("wss://api.example/voip/ws?ticket=pmfa_wst_abc");
    ws().open();
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
    expect(socket.sendCandidate("CALL-1", { candidate: "c" })).toBe(false);
    const connecting = socket.connect();
    await Promise.resolve();
    await Promise.resolve();
    ws().open();
    await connecting;
    expect(
      socket.sendCandidate("CALL-1", { candidate: "candidate:1", sdpMid: "0" }),
    ).toBe(true);
    expect(JSON.parse(ws().sent[0] ?? "{}")).toEqual({
      type: "candidate",
      callId: "CALL-1",
      candidate: { candidate: "candidate:1", sdpMid: "0" },
    });
    ws().receive({
      type: "candidate",
      callId: "CALL-1",
      candidate: { candidate: "candidate:9" },
    });
    expect(remote).toEqual([["CALL-1", { candidate: "candidate:9" }]]);
  });

  it("reconnects with capped backoff and a fresh ticket until closed", async () => {
    const { socket, timers, ws } = socketWith({
      minBackoffMs: 100,
      maxBackoffMs: 1_000,
    });
    const states: boolean[] = [];
    socket.onState((connected) => states.push(connected));
    const connecting = socket.connect();
    await Promise.resolve();
    await Promise.resolve();
    ws().open();
    await connecting;
    ws().drop();
    expect(states).toEqual([true, false]);
    expect(timers).toHaveLength(1);
    expect(timers[0]?.ms).toBe(75); // 100ms × (0.5 + 0.5/2)
    timers[0]?.fn();
    await Promise.resolve();
    await Promise.resolve();
    expect(FakeWebSocket.instances).toHaveLength(2);
    ws().drop();
    expect(timers[1]?.ms).toBe(150); // doubled
    socket.close();
    timers[1]?.fn();
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

  it("settles connect() and aborts the ticket request when closed during acquisition", async () => {
    let resolveTicket: ((t: SocketTicket) => void) | undefined;
    let ticketSignal: AbortSignal | undefined;
    const sig = signaling();
    sig.socketTicket = vi.fn((_session?: string, signal?: AbortSignal) => {
      ticketSignal = signal;
      return new Promise<SocketTicket>((resolve) => {
        resolveTicket = resolve;
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
    expect(ticketSignal?.aborted).toBe(true);
    // The stale ticket completing later must not open a socket.
    resolveTicket?.({
      ticket: "pmfa_wst_late",
      expiresAt: Date.now() + 60_000,
      url: "/voip/ws?ticket=pmfa_wst_late",
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(FakeWebSocket.instances).toHaveLength(0);
    // A fresh connect() after close works again.
    sig.socketTicket = vi.fn(async () => ({
      ticket: "pmfa_wst_new",
      expiresAt: Date.now() + 60_000,
      url: "/voip/ws?ticket=pmfa_wst_new",
    }));
    const again = socket.connect();
    await Promise.resolve();
    await Promise.resolve();
    expect(FakeWebSocket.instances).toHaveLength(1);
    FakeWebSocket.instances[0]?.open();
    await again;
    expect(socket.connected).toBe(true);
  });

  it("ignores a second connect() while a socket exists", async () => {
    const { socket, ws } = socketWith();
    const first = socket.connect();
    await Promise.resolve();
    await Promise.resolve();
    ws().open();
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
    expect(ev("call.received", { from: { lid: "5550100@lid" } })).toMatchObject(
      { type: "incomingCall", call: { from: "5550100@lid", video: false } },
    );
    expect(ev("call.telemetry", {})).toBeUndefined();
  });
});
