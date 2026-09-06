import { describe, expect, it, vi } from "vitest";
import {
  BrowserTransport,
  CallsController,
  CallsSignalingClient,
  type CallLifecycleEvent,
  type CallMediaFactory,
  type CallMediaSession,
  type CallsBackend,
} from "../src/index.js";

function fixture() {
  let emit: ((event: CallLifecycleEvent) => void) | undefined;
  let connection: ((state: RTCPeerConnectionState) => void) | undefined;
  const session: CallMediaSession = {
    localStream: {} as MediaStream,
    remoteStream: {} as MediaStream,
    setMuted: vi.fn(),
    audioEnabled: () => true,
    videoEnabled: () => true,
    close: vi.fn(async () => undefined),
  };
  const backend: CallsBackend = {
    subscribe: vi.fn((listener) => {
      emit = listener;
      return vi.fn();
    }),
    place: vi.fn(async () => ({ callId: "call-1" })),
    answer: vi.fn(async () => undefined),
    reject: vi.fn(async () => undefined),
    hangup: vi.fn(async () => undefined),
  };
  const media: CallMediaFactory = {
    open: vi.fn(async (_id, _video, callbacks) => {
      connection = callbacks.onConnectionState;
      return session;
    }),
  };
  return {
    backend,
    media,
    session,
    emit: (event: CallLifecycleEvent) => emit?.(event),
    connect: (state: RTCPeerConnectionState) => connection?.(state),
  };
}

describe("CallsController (voip-v2 contract)", () => {
  it("receives and answers an incoming WebRTC call", async () => {
    const f = fixture();
    const controller = new CallsController(f.backend, f.media);
    controller.initialize();
    f.emit({
      type: "incomingCall",
      call: { callId: "call-1", from: "+12025550123", video: true },
    });
    expect(controller.getSnapshot()).toMatchObject({
      status: "incoming",
      direction: "incoming",
      video: true,
    });
    await controller.answer();
    expect(f.backend.answer).toHaveBeenCalledWith(
      "call-1",
      expect.any(AbortSignal),
    );
    expect(controller.getSnapshot().status).toBe("connecting");
    f.connect("connected");
    expect(controller.getSnapshot().status).toBe("connected");
    expect(controller.localStream).toBe(f.session.localStream);
  });
  it("places with an idempotency key, mutes tracks, and hangs up", async () => {
    const f = fixture();
    const controller = new CallsController(f.backend, f.media, {
      createIdempotencyKey: () => "idem-1",
    });
    controller.initialize();
    await controller.place("+12025550123", { video: true });
    expect(f.backend.place).toHaveBeenCalledWith(
      {
        to: "+12025550123",
        video: true,
        line: "linkedDevice",
        idempotencyKey: "idem-1",
      },
      expect.any(AbortSignal),
    );
    controller.setMuted({ audio: true, video: true });
    expect(f.session.setMuted).toHaveBeenCalledWith({
      audio: true,
      video: true,
    });
    await controller.hangup();
    expect(controller.getSnapshot()).toMatchObject({
      status: "ended",
      endReason: "hangup",
    });
    expect(f.session.close).toHaveBeenCalledTimes(1);
  });
  it("rejects incoming calls and ignores stale lifecycle events", async () => {
    const f = fixture();
    const controller = new CallsController(f.backend, f.media);
    controller.initialize();
    f.emit({
      type: "incomingCall",
      call: { callId: "call-1", from: "+1", video: false },
    });
    await controller.reject();
    expect(controller.getSnapshot()).toMatchObject({
      status: "ended",
      endReason: "rejected",
    });
    f.emit({ type: "connected", callId: "old-call" });
    expect(controller.getSnapshot().status).toBe("ended");
  });
});

describe("CallsSignalingClient", () => {
  it("uses the voip-v2 REST offer, ICE, polling, and teardown paths", async () => {
    const fetch = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      const body = url.endsWith("/offer")
        ? { data: { sdp: "answer", iceServers: [] } }
        : url.endsWith("/candidates")
          ? { data: { candidates: [] } }
          : { success: true };
      return new Response(JSON.stringify(body), {
        status: url.endsWith("/candidate") ? 202 : 200,
        headers: { "content-type": "application/json" },
      });
    });
    const transport = new BrowserTransport({
      baseUrl: "https://api.polymorfa.test",
      getClientToken: async () => "pmfa_ct_test",
      fetch,
      maxNetworkRetries: 0,
    });
    const signaling = new CallsSignalingClient(transport);
    await signaling.offer("call/1", "offer");
    await signaling.candidate("call/1", { candidate: "ice" });
    await signaling.candidates("call/1");
    await signaling.teardown("call/1");
    expect(fetch.mock.calls.map(([input]) => String(input))).toEqual([
      "https://api.polymorfa.test/api/voip/calls/call%2F1/offer",
      "https://api.polymorfa.test/api/voip/calls/call%2F1/candidate",
      "https://api.polymorfa.test/api/voip/calls/call%2F1/candidates",
      "https://api.polymorfa.test/api/voip/calls/call%2F1",
    ]);
  });
});

describe("CallsController resumption and terminal offers", () => {
  function timers() {
    const queue: Array<{ fn: () => void; ms: number }> = [];
    return {
      queue,
      setTimeout: ((fn: () => void, ms: number) => {
        queue.push({ fn, ms });
        return queue.length as unknown as ReturnType<typeof setTimeout>;
      }) as unknown as typeof globalThis.setTimeout,
      clearTimeout: (() =>
        undefined) as unknown as typeof globalThis.clearTimeout,
      fire: (ms: number) =>
        queue.filter((t) => t.ms === ms).forEach((t) => t.fn()),
    };
  }

  it("shows reconnecting, restarts ICE, and recovers when media returns", async () => {
    const f = fixture();
    const restartIce = vi.fn(async () => undefined);
    Object.assign(f.session, { restartIce });
    let ice: ((state: RTCIceConnectionState) => void) | undefined;
    (f.media.open as ReturnType<typeof vi.fn>).mockImplementation(
      async (_id, _video, callbacks) => {
        ice = callbacks.onIceConnectionState;
        return f.session;
      },
    );
    const t = timers();
    const controller = new CallsController(f.backend, f.media, {
      setTimeout: t.setTimeout,
      clearTimeout: t.clearTimeout,
    });
    controller.initialize();
    await controller.place("+12025550123");
    ice?.("connected");
    // The connection state machine, not ICE, marks connected.
    expect(controller.getSnapshot().status).toBe("connecting");
    ice?.("disconnected");
    expect(controller.getSnapshot().status).toBe("reconnecting");
    t.fire(2_000);
    expect(restartIce).toHaveBeenCalledTimes(1);
    ice?.("connected");
    expect(controller.getSnapshot().status).toBe("reconnecting"); // waits for connectionstate
    controller.dispose();
  });

  it("gives the call up after the resumption window", async () => {
    const f = fixture();
    let ice: ((state: RTCIceConnectionState) => void) | undefined;
    (f.media.open as ReturnType<typeof vi.fn>).mockImplementation(
      async (_id, _video, callbacks) => {
        ice = callbacks.onIceConnectionState;
        return f.session;
      },
    );
    const t = timers();
    const controller = new CallsController(f.backend, f.media, {
      setTimeout: t.setTimeout,
      clearTimeout: t.clearTimeout,
      resumptionWindowMs: 500,
    });
    controller.initialize();
    await controller.place("+12025550123");
    ice?.("disconnected");
    t.fire(500);
    expect(controller.getSnapshot()).toMatchObject({
      status: "ended",
      endReason: "connection_failed",
    });
    expect(f.session.close).toHaveBeenCalled();
  });

  it("ends (not errors) when the offer is answered pod-lost or at capacity", async () => {
    for (const [status, reason] of [
      [410, "pod_lost"],
      [503, "capacity"],
    ] as const) {
      const f = fixture();
      (f.media.open as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        Object.assign(new Error("gone"), { status }),
      );
      const controller = new CallsController(f.backend, f.media);
      controller.initialize();
      await controller.place("+12025550123");
      expect(controller.getSnapshot()).toMatchObject({
        status: "ended",
        endReason: reason,
      });
    }
  });

  it("upgrades an audio call to video through the media session", async () => {
    const f = fixture();
    const enableVideo = vi.fn(async () => undefined);
    Object.assign(f.session, { enableVideo });
    const controller = new CallsController(f.backend, f.media);
    controller.initialize();
    await controller.place("+12025550123");
    expect(controller.getSnapshot().video).toBe(false);
    await controller.enableVideo();
    expect(enableVideo).toHaveBeenCalledWith(expect.any(AbortSignal));
    expect(controller.getSnapshot()).toMatchObject({
      video: true,
      videoMuted: false,
    });
    await controller.enableVideo(); // idempotent
    expect(enableVideo).toHaveBeenCalledTimes(1);
  });
});
