import { CallClaimedError } from "@polymorfa/calls";
import { describe, expect, it, vi } from "vitest";
import {
  BrowserTransport,
  CallsController,
  CallsSignalingClient,
  type CallLifecycleEvent,
  type CallMediaFactory,
  type CallMediaSession,
  type CallsBackend,
} from "../src/internal.js";

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
  it("keeps custom-backend calls active when a second placement is requested", async () => {
    const f = fixture();
    const controller = new CallsController(f.backend, f.media);
    controller.initialize();
    await controller.place("+15550100");
    f.connect("connected");
    await expect(controller.place("+15550101")).rejects.toThrow(
      "Finish the active call",
    );
    expect(f.backend.place).toHaveBeenCalledOnce();
    expect(f.session.close).not.toHaveBeenCalled();
    expect(controller.getSnapshot().status).toBe("connected");
    controller.dispose();
  });
  it("allows device selection and refresh after remote end, before answering the next call", async () => {
    const f = fixture();
    const devices = [
      { deviceId: "mic-2", kind: "audioinput" as const, label: "Microphone" },
    ];
    const controller = new CallsController(f.backend, {
      ...f.media,
      listDevices: async () => devices,
    });
    controller.initialize();
    await controller.place("+15550100");
    f.emit({ type: "ended", callId: "call-1", reason: "remote_hangup" });
    await controller.switchDevice("audioInput", "mic-2");
    await controller.refreshDevices();
    expect(controller.getSnapshot()).toMatchObject({
      selectedDevices: { audioInput: "mic-2" },
      devices,
    });
    f.emit({
      type: "incomingCall",
      call: { callId: "call-2", from: "+15550101", video: false },
    });
    await controller.switchDevice("audioInput", "mic-3");
    expect(controller.getSnapshot().selectedDevices.audioInput).toBe("mic-3");
    controller.dispose();
  });
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
    // The default answer leaves the call open for other participants.
    expect(f.backend.answer).toHaveBeenCalledWith(
      "call-1",
      expect.any(AbortSignal),
      { exclusive: false, video: true },
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
  it("applies a mute pressed while the microphone was still being acquired", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const f = fixture();
    (f.media.open as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      await gate;
      return f.session;
    });
    const controller = new CallsController(f.backend, f.media);
    controller.initialize();
    f.emit({
      type: "incomingCall",
      call: { callId: "call-1", from: "+12025550123", video: false },
    });

    const answering = controller.answer();
    await Promise.resolve();
    // Mute now reaches only the snapshot — there are no tracks yet. If it were
    // dropped here the dock would report muted over a live microphone.
    controller.setMuted({ audio: true });
    expect(f.session.setMuted).not.toHaveBeenCalled();
    release();
    await answering;

    expect(f.session.setMuted).toHaveBeenCalledWith({
      audio: true,
      video: false,
    });
    expect(controller.getSnapshot().audioMuted).toBe(true);
    controller.dispose();
  });
});

describe("CallsSignalingClient", () => {
  function client(responses: Record<string, unknown> = {}) {
    const fetch = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      const suffix = Object.keys(responses).find((key) => url.includes(key));
      const body =
        suffix !== undefined
          ? responses[suffix]
          : url.includes("/offer") || url.includes("/renegotiate")
            ? { data: { sdp: "answer", iceServers: [] } }
            : url.includes("/candidates")
              ? { data: { candidates: [] } }
              : url.endsWith("/accept")
                ? {
                    success: true,
                    data: {
                      answered: true,
                      answeredBy: "client:e1",
                      exclusive: false,
                    },
                  }
                : { success: true };
      const status =
        (body as { status?: number } | undefined)?.status ??
        (url.endsWith("/candidate") ? 202 : 200);
      return new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      });
    });
    const transport = new BrowserTransport({
      baseUrl: "https://api.polymorfa.test",
      getClientToken: async () => ({
        value: "pmfa_ct_test",
        audience: "browser",
        expiresAt: Date.now() + 600_000,
      }),
      fetch,
      maxNetworkRetries: 0,
    });
    return { fetch, signaling: new CallsSignalingClient(transport) };
  }
  const bodies = (fetch: ReturnType<typeof vi.fn>) =>
    (fetch.mock.calls as unknown as [string, RequestInit][]).map(
      ([input, init]) => [
        init.method,
        String(input),
        init.body === undefined ? undefined : JSON.parse(String(init.body)),
      ],
    );

  it("sends the connection id with offers, candidates and leave", async () => {
    const { fetch, signaling } = client();
    await signaling.offer("call/1", {
      sdp: "offer",
      connectionId: "conn-0001",
    });
    await signaling.renegotiate("call/1", {
      sdp: "offer2",
      connectionId: "conn-0001",
    });
    await signaling.candidate(
      "call/1",
      { candidate: "ice", sdpMid: "0" },
      "conn-0001",
    );
    await signaling.candidates("call/1");
    await signaling.leave("call/1", "conn-0001");
    await signaling.end("call/1");
    const base = "https://api.polymorfa.test/messaging/voip/calls/call%2F1";
    expect(bodies(fetch)).toEqual([
      ["POST", `${base}/offer`, { sdp: "offer", connectionId: "conn-0001" }],
      [
        "POST",
        `${base}/renegotiate`,
        { sdp: "offer2", connectionId: "conn-0001" },
      ],
      [
        "POST",
        `${base}/candidate`,
        { candidate: "ice", sdpMid: "0", connectionId: "conn-0001" },
      ],
      ["GET", `${base}/candidates`, undefined],
      ["POST", `${base}/leave`, { connectionId: "conn-0001" }],
      ["DELETE", base, undefined],
    ]);
  });

  it("accepts with an explicit claim choice and declines with an empty body", async () => {
    const { fetch, signaling } = client();
    await expect(
      signaling.accept("c1", { exclusive: true, video: false }),
    ).resolves.toEqual({
      answered: true,
      answeredBy: "client:e1",
      exclusive: false,
    });
    await signaling.accept("c1", {});
    await signaling.reject("c1");
    const base = "https://api.polymorfa.test/messaging/voip/calls/c1";
    expect(bodies(fetch)).toEqual([
      ["POST", `${base}/accept`, { exclusive: true, video: false }],
      ["POST", `${base}/accept`, { exclusive: false }],
      ["POST", `${base}/reject`, undefined],
    ]);
  });

  it("turns 409 call_claimed into CallClaimedError", async () => {
    const { signaling } = client({
      "/accept": {
        status: 409,
        success: false,
        error: { code: "call_claimed", message: "Claimed." },
        code: "call_claimed",
      },
    });
    await expect(signaling.accept("c1", {})).rejects.toBeInstanceOf(
      CallClaimedError,
    );
  });

  it("authenticates sockets with the client token and never puts it in the URL", async () => {
    const { fetch, signaling } = client();
    await expect(signaling.token()).resolves.toMatchObject({
      value: "pmfa_ct_test",
      expiresAt: expect.any(Number),
    });
    expect(signaling.socketUrl("/voip/ws")).toBe(
      "wss://api.polymorfa.test/voip/ws",
    );
    expect(signaling.socketUrl("/voip/calls/c1/media")).toBe(
      "wss://api.polymorfa.test/voip/calls/c1/media",
    );
    // No ticket or mode request is made.
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("CallsController resumption and terminal offers", () => {
  // Fake timers that honour cancellation: a cleared or already-fired entry is
  // never run again, so a missing clearTimeout in the controller shows up as a
  // failing test rather than passing silently.
  function timers() {
    const queue: Array<{ fn: () => void; ms: number; cancelled?: boolean }> =
      [];
    return {
      queue,
      setTimeout: ((fn: () => void, ms: number) => {
        queue.push({ fn, ms });
        return queue.length as unknown as ReturnType<typeof setTimeout>;
      }) as unknown as typeof globalThis.setTimeout,
      clearTimeout: ((handle: number) => {
        const entry = queue[handle - 1];
        if (entry !== undefined) entry.cancelled = true;
      }) as unknown as typeof globalThis.clearTimeout,
      fire: (ms: number) => {
        // Re-check cancellation inside the loop: a callback may clear another
        // timer queued at the same delay, and the pre-filtered snapshot would
        // otherwise still run it.
        for (const entry of [...queue]) {
          if (entry.ms !== ms || entry.cancelled === true) continue;
          entry.cancelled = true;
          entry.fn();
        }
      },
      pending: () => queue.filter((t) => t.cancelled !== true).length,
    };
  }

  it("clears the recovery timers when the backend reports connected first", async () => {
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
      now: () => 5_000,
    });
    controller.initialize();
    await controller.place("+12025550123");
    ice?.("disconnected");
    expect(controller.getSnapshot().status).toBe("reconnecting");

    // The pod can beat the WebRTC callback to this. If it only set the status,
    // the pending restart would fire an ICE restart on a connected call and
    // the give-up timer could still end it.
    f.emit({ type: "connected", callId: "call-1" });
    expect(controller.getSnapshot()).toMatchObject({
      status: "connected",
      connectedAt: 5_000,
    });
    expect(t.pending()).toBe(0);
    t.fire(2_000);
    t.fire(15_000);
    expect(restartIce).not.toHaveBeenCalled();
    expect(controller.getSnapshot().status).toBe("connected");
    controller.dispose();
  });

  it("keeps a placement failure recoverable when the pod hints are absent", async () => {
    const f = fixture();
    // 503 from the application's own placement route means retry; only the
    // pod's answer to an offer carries a terminal meaning.
    (f.backend.place as ReturnType<typeof vi.fn>).mockRejectedValue(
      Object.assign(new Error("Service Unavailable"), { status: 503 }),
    );
    const controller = new CallsController(f.backend, f.media);
    controller.initialize();
    await controller.place("+12025550123");
    expect(controller.getSnapshot()).toMatchObject({
      status: "error",
      error: { code: "place_failed", recoverable: true },
    });
    controller.dispose();
  });

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
    // A flap that never moved `connectionState` still has to end: recovery
    // restores the call itself rather than waiting for a state change that
    // may never come. This one flapped during setup, so it recovers to
    // `connecting` — reporting `connected` here would start the duration
    // counter on a call whose media never came up.
    expect(controller.getSnapshot().status).toBe("connecting");
    expect(controller.getSnapshot().connectedAt).toBeUndefined();
    // ICE recovery must cancel the give-up timer, or the call would still be
    // dropped mid-conversation once the window elapsed.
    expect(t.pending()).toBe(0);
    t.fire(15_000);
    expect(controller.getSnapshot().status).toBe("connecting");
    controller.dispose();
    expect(t.pending()).toBe(0);
  });

  it("recovers an established call back to connected", async () => {
    const f = fixture();
    Object.assign(f.session, { restartIce: vi.fn(async () => undefined) });
    let ice: ((state: RTCIceConnectionState) => void) | undefined;
    let connection: ((state: RTCPeerConnectionState) => void) | undefined;
    (f.media.open as ReturnType<typeof vi.fn>).mockImplementation(
      async (_id, _video, callbacks) => {
        ice = callbacks.onIceConnectionState;
        connection = callbacks.onConnectionState;
        return f.session;
      },
    );
    const t = timers();
    const controller = new CallsController(f.backend, f.media, {
      setTimeout: t.setTimeout,
      clearTimeout: t.clearTimeout,
      now: () => 7_000,
    });
    controller.initialize();
    await controller.place("+12025550123");
    connection?.("connected");
    expect(controller.getSnapshot()).toMatchObject({
      status: "connected",
      connectedAt: 7_000,
    });

    ice?.("disconnected");
    expect(controller.getSnapshot().status).toBe("reconnecting");
    ice?.("connected");
    // This call was up before the flap, so it goes back to connected and
    // keeps the original connectedAt.
    expect(controller.getSnapshot()).toMatchObject({
      status: "connected",
      connectedAt: 7_000,
    });
    controller.dispose();
    expect(t.pending()).toBe(0);
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

  it("drops a video upgrade that lands after the call ended", async () => {
    const f = fixture();
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    Object.assign(f.session, {
      enableVideo: vi.fn(async () => {
        await gate;
      }),
    });
    const controller = new CallsController(f.backend, f.media);
    controller.initialize();
    await controller.place("+12025550123");

    const upgrading = controller.enableVideo();
    f.emit({ type: "ended", callId: "call-1", reason: "remote_hangup" });
    expect(controller.getSnapshot().status).toBe("ended");
    release();
    await upgrading;
    // The terminal snapshot keeps the callId, so the id alone cannot say the
    // call is still live — this would otherwise show a camera on an ended call.
    expect(controller.getSnapshot()).toMatchObject({
      status: "ended",
      video: false,
    });
    controller.dispose();
  });

  it("ignores a backend connected event after the call ended", async () => {
    const f = fixture();
    const controller = new CallsController(f.backend, f.media);
    controller.initialize();
    await controller.place("+12025550123");
    f.emit({ type: "ended", callId: "call-1", reason: "remote_hangup" });
    expect(controller.getSnapshot().status).toBe("ended");

    // The ended snapshot keeps the callId, so matching on it alone would
    // bring the call back to life.
    f.emit({ type: "connected", callId: "call-1" });
    expect(controller.getSnapshot()).toMatchObject({
      status: "ended",
      endReason: "remote_hangup",
    });
    expect(controller.getSnapshot().connectedAt).toBeUndefined();
    controller.dispose();
  });

  it("ignores every non-terminal lifecycle event once the call has ended", async () => {
    for (const event of [
      { type: "connected" as const, callId: "call-1" },
      { type: "accepted" as const, callId: "call-1" },
      { type: "ringing" as const, callId: "call-1" },
      { type: "videostate" as const, callId: "call-1", video: true },
    ]) {
      const f = fixture();
      const controller = new CallsController(f.backend, f.media);
      controller.initialize();
      await controller.place("+12025550123");
      f.emit({ type: "ended", callId: "call-1", reason: "remote_hangup" });

      // The ended snapshot keeps its callId, so matching on the id alone let
      // any of these put a finished call back into a live status — or turn
      // video on after it was over.
      f.emit(event);
      expect(controller.getSnapshot()).toMatchObject({
        status: "ended",
        endReason: "remote_hangup",
        video: false,
      });
      controller.dispose();
    }
  });

  it("keeps the first end reason when a duplicate ended arrives", async () => {
    const f = fixture();
    const controller = new CallsController(f.backend, f.media);
    controller.initialize();
    await controller.place("+12025550123");
    f.emit({ type: "ended", callId: "call-1", reason: "remote_hangup" });
    // Both the relay and the socket can deliver a late duplicate with its own
    // reason; the call ended once, for the first reason.
    f.emit({ type: "ended", callId: "call-1", reason: "missed" });
    expect(controller.getSnapshot()).toMatchObject({
      status: "ended",
      endReason: "remote_hangup",
    });
    controller.dispose();
  });

  it("still accepts a new incoming call after one ended", async () => {
    const f = fixture();
    const controller = new CallsController(f.backend, f.media);
    controller.initialize();
    await controller.place("+12025550123");
    f.emit({ type: "ended", callId: "call-1", reason: "remote_hangup" });
    // The terminal guard must not wall off the next call.
    f.emit({
      type: "incomingCall",
      call: { callId: "call-2", from: "+15550100", video: false },
    });
    expect(controller.getSnapshot()).toMatchObject({
      status: "incoming",
      callId: "call-2",
    });
    controller.dispose();
  });

  it("ignores connection-state callbacks that land after the call ended", async () => {
    const f = fixture();
    const controller = new CallsController(f.backend, f.media, {
      now: () => 9_000,
    });
    controller.initialize();
    await controller.place("+12025550123");
    await controller.hangup();
    expect(controller.getSnapshot()).toMatchObject({
      status: "ended",
      endReason: "hangup",
    });
    // Media teardown is asynchronous, so these can still fire afterwards. A
    // late `connected` would revive the call; a late `closed` would rewrite a
    // clean hangup as a connection failure.
    f.connect("connected");
    f.connect("closed");
    expect(controller.getSnapshot()).toMatchObject({
      status: "ended",
      endReason: "hangup",
    });
    expect(controller.getSnapshot().connectedAt).toBeUndefined();
    controller.dispose();
  });

  it("reports whether a video upgrade is possible", async () => {
    const f = fixture();
    const controller = new CallsController(f.backend, f.media);
    controller.initialize();
    expect(controller.canEnableVideo).toBe(false);
    await controller.place("+12025550123");
    // The session cannot renegotiate: capability alone is not enough.
    expect(controller.canEnableVideo).toBe(false);
    Object.assign(f.session, { enableVideo: vi.fn(async () => undefined) });
    expect(controller.canEnableVideo).toBe(true);
    await controller.enableVideo();
    expect(controller.canEnableVideo).toBe(false); // already video
    controller.dispose();
  });

  it("upgrades an audio call to video through the media session", async () => {
    const f = fixture();
    const enableVideo = vi.fn(async () => undefined);
    Object.assign(f.session, { enableVideo });
    const controller = new CallsController(f.backend, f.media);
    controller.initialize();
    await controller.place("+12025550123");
    expect(controller.getSnapshot().video).toBe(false);
    // A camera chosen on an audio-only call never reaches a sender, so the
    // upgrade has to carry the current selection rather than the one captured
    // when the call opened.
    controller.setPreferredDevices({ videoInput: "cam-9" });
    await controller.enableVideo();
    expect(enableVideo).toHaveBeenCalledWith(expect.any(AbortSignal), {
      videoInput: "cam-9",
    });
    expect(controller.getSnapshot()).toMatchObject({
      video: true,
      videoMuted: false,
    });
    await controller.enableVideo(); // idempotent
    expect(enableVideo).toHaveBeenCalledTimes(1);
  });
});

describe("terminal call control errors", () => {
  it.each(["closed", "failed"] as const)(
    "clears a refused hangup when media becomes %s",
    async (state) => {
      vi.useFakeTimers();
      const f = fixture();
      const controller = new CallsController(f.backend, f.media, {
        resumptionWindowMs: 500,
      });
      try {
        controller.initialize();
        await controller.place("+15550100");
        f.connect("connected");
        vi.mocked(f.backend.hangup).mockRejectedValueOnce(
          new Error("try again"),
        );
        await controller.hangup();
        expect(controller.getSnapshot().error?.code).toBe(
          "call_control_failed",
        );
        f.connect(state);
        if (state === "failed") await vi.advanceTimersByTimeAsync(501);
        expect(controller.getSnapshot().status).toBe("ended");
        expect(controller.getSnapshot().error).toBeUndefined();
      } finally {
        controller.dispose();
        vi.useRealTimers();
      }
    },
  );
  it("clears a refused hangup when pending media setup receives a terminal response", async () => {
    const f = fixture();
    let rejectMedia!: (error: Error) => void;
    vi.mocked(f.media.open).mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectMedia = reject;
        }),
    );
    const controller = new CallsController(f.backend, f.media);
    controller.initialize();
    const placing = controller.place("+15550100");
    await Promise.resolve();
    vi.mocked(f.backend.hangup).mockRejectedValueOnce(new Error("try again"));
    await controller.hangup();
    rejectMedia(Object.assign(new Error("call gone"), { status: 410 }));
    await placing;
    expect(controller.getSnapshot().status).toBe("ended");
    expect(controller.getSnapshot().error).toBeUndefined();
    controller.dispose();
  });
});

describe("continuing after a refused reject", () => {
  it("clears the reject error when the incoming call is successfully answered", async () => {
    const f = fixture();
    const controller = new CallsController(f.backend, f.media);
    controller.initialize();
    f.emit({
      type: "incomingCall",
      call: { callId: "call-1", from: "+15550100", video: false },
    });
    vi.mocked(f.backend.reject).mockRejectedValueOnce(new Error("try again"));
    await controller.reject();
    expect(controller.getSnapshot().error?.code).toBe("call_control_failed");
    await controller.answer();
    expect(controller.getSnapshot().status).toBe("connecting");
    expect(controller.getSnapshot().error).toBeUndefined();
    f.connect("connected");
    expect(controller.getSnapshot().error).toBeUndefined();
    controller.dispose();
  });
});

describe("leaving an outgoing call before it connects", () => {
  it("ends the call instead of leaving the callee ringing", async () => {
    const f = fixture();
    const leave = vi.fn(async () => undefined);
    const controller = new CallsController({ ...f.backend, leave }, f.media);
    controller.initialize();
    await controller.place("+15550100");
    await controller.leave();
    expect(f.backend.hangup).toHaveBeenCalledWith(
      "call-1",
      expect.any(AbortSignal),
    );
    expect(leave).not.toHaveBeenCalled();
    expect(controller.getSnapshot()).toMatchObject({
      status: "ended",
      endReason: "hangup",
    });
    controller.dispose();
  });

  it("still leaves an outgoing call once it connected", async () => {
    const f = fixture();
    const leave = vi.fn(async () => undefined);
    const controller = new CallsController({ ...f.backend, leave }, f.media);
    controller.initialize();
    await controller.place("+15550100");
    f.emit({ type: "connected", callId: "call-1" });
    await controller.leave();
    expect(leave).toHaveBeenCalledOnce();
    expect(f.backend.hangup).not.toHaveBeenCalled();
    expect(controller.getSnapshot().endReason).toBe("left");
    controller.dispose();
  });
});

describe("waiting invitations and call history", () => {
  it("keeps a waiting call's roster current and shows it when selected", async () => {
    const f = fixture();
    const controller = new CallsController(f.backend, f.media);
    controller.initialize();
    const participant = (id: string) => ({
      id,
      phoneNumber: `+1555010${id.slice(-1)}`,
      audioMuted: false,
      video: false,
      state: "connected" as const,
    });
    f.emit({
      type: "incomingCall",
      call: { callId: "A", from: "+15550100", video: false },
    });
    f.emit({
      type: "incomingCall",
      call: { callId: "B", from: "+15550101", video: false },
    });
    expect(controller.getSnapshot().callId).toBe("A");
    f.emit({
      type: "participant",
      callId: "B",
      participant: participant("p1"),
    });
    f.emit({
      type: "participant",
      callId: "B",
      participant: participant("p2"),
    });
    f.emit({ type: "participantLeft", callId: "B", participantId: "p1" });
    // The displayed call's roster is untouched by B's events.
    expect(controller.getSnapshot().participants).toEqual([]);
    controller.select("B");
    expect(controller.getSnapshot()).toMatchObject({
      callId: "B",
      participants: [participant("p2")],
    });
    // A keeps its own (empty) roster when it is shown again.
    controller.select("A");
    expect(controller.getSnapshot().participants).toEqual([]);
    controller.dispose();
  });

  it("remembers only a bounded number of placed calls", async () => {
    const f = fixture();
    let next = 0;
    vi.mocked(f.backend.place).mockImplementation(async () => ({
      callId: `call-${next++}`,
    }));
    const controller = new CallsController(f.backend, f.media);
    controller.initialize();
    for (let i = 0; i < 201; i += 1) {
      await controller.place("+15550100");
      f.emit({ type: "ended", callId: `call-${i}`, reason: "remote_hangup" });
    }
    // A replayed invitation for a recent placed call is still ignored...
    f.emit({
      type: "incomingCall",
      call: { callId: "call-200", from: "+15550100", video: false },
    });
    expect(controller.getSnapshot().invitations).toEqual([]);
    // ...while the oldest id has been dropped from the history.
    f.emit({
      type: "incomingCall",
      call: { callId: "call-0", from: "+15550100", video: false },
    });
    expect(controller.getSnapshot().invitations.map((i) => i.callId)).toEqual([
      "call-0",
    ]);
    controller.dispose();
  });
});

describe("changing the displayed invitation while an answer is in flight", () => {
  function pending() {
    const f = fixture();
    let finish!: () => void;
    let fail!: (cause: unknown) => void;
    vi.mocked(f.backend.answer).mockImplementationOnce(
      () =>
        new Promise<void>((resolve, reject) => {
          finish = resolve;
          fail = reject;
        }),
    );
    const leave = vi.fn(async () => undefined);
    const controller = new CallsController({ ...f.backend, leave }, f.media);
    controller.initialize();
    f.emit({
      type: "incomingCall",
      call: { callId: "A", from: "+15550100", video: false },
    });
    f.emit({
      type: "incomingCall",
      call: { callId: "B", from: "+15550101", video: false },
    });
    return {
      ...f,
      leave,
      controller,
      finish: () => finish(),
      fail: (cause: unknown) => fail(cause),
    };
  }

  it("shows the answered call with its controls after another invitation was selected", async () => {
    const h = pending();
    const answering = h.controller.answer();
    expect(h.controller.getSnapshot()).toMatchObject({
      callId: "A",
      status: "incoming",
      answering: true,
    });
    h.controller.select("B");
    expect(h.controller.getSnapshot()).toMatchObject({
      callId: "B",
      status: "incoming",
      answering: true,
    });
    // Nothing else can start while the answer is in flight.
    await expect(h.controller.answer()).rejects.toThrow(
      "An answer is in progress",
    );
    await expect(h.controller.reject()).rejects.toThrow(
      "An answer is in progress",
    );
    await expect(h.controller.place("+15550102")).rejects.toThrow(
      "An answer is in progress",
    );
    h.finish();
    await answering;
    expect(h.controller.getSnapshot()).toMatchObject({
      callId: "A",
      peer: "+15550100",
      status: "connecting",
      answering: false,
    });
    expect(h.media.open).toHaveBeenCalledWith(
      "A",
      false,
      expect.any(Object),
      expect.any(AbortSignal),
      expect.any(Object),
    );
    // Media callbacks reach the displayed call.
    h.connect("connected");
    expect(h.controller.getSnapshot().status).toBe("connected");
    // B is still waiting.
    expect(h.controller.getSnapshot().invitations.map((i) => i.callId)).toEqual(
      ["B"],
    );
    expect(h.leave).not.toHaveBeenCalled();
    expect(h.backend.hangup).not.toHaveBeenCalled();
    h.controller.dispose();
  });

  it("keeps the displayed invitation intact when the answer for another fails", async () => {
    const h = pending();
    const answering = h.controller.answer();
    h.controller.select("B");
    h.fail(new Error("network down"));
    await answering;
    expect(h.controller.getSnapshot()).toMatchObject({
      callId: "B",
      status: "incoming",
      answering: false,
    });
    expect(h.controller.getSnapshot().error).toBeUndefined();
    expect(h.media.open).not.toHaveBeenCalled();
    h.controller.dispose();
  });

  it.each([
    [false, "leaves"],
    [true, "ends"],
  ] as const)(
    "dismissing an answer in flight (exclusive: %s) %s the call once answered",
    async (exclusive, outcome) => {
      expect(outcome).toBe(exclusive ? "ends" : "leaves");
      const h = pending();
      const answering = h.controller.answer({ exclusive });
      h.controller.dismiss("A");
      // The next waiting call is shown; the answer still completes.
      expect(h.controller.getSnapshot()).toMatchObject({
        callId: "B",
        status: "incoming",
        answering: true,
      });
      h.finish();
      await answering;
      if (exclusive) {
        expect(h.backend.hangup).toHaveBeenCalledWith(
          "A",
          expect.any(AbortSignal),
        );
        expect(h.leave).not.toHaveBeenCalled();
      } else {
        expect(h.leave).toHaveBeenCalledWith(
          "A",
          undefined,
          expect.any(AbortSignal),
        );
        expect(h.backend.hangup).not.toHaveBeenCalled();
      }
      expect(h.media.open).not.toHaveBeenCalled();
      expect(h.controller.getSnapshot()).toMatchObject({
        callId: "B",
        status: "incoming",
        answering: false,
      });
      expect(
        h.controller.getSnapshot().invitations.map((i) => i.callId),
      ).toEqual(["B"]);
      h.controller.dispose();
    },
  );
});

describe("an answer in flight is bound to its own call", () => {
  function waiting() {
    const f = fixture();
    let finish!: () => void;
    vi.mocked(f.backend.answer).mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const leave = vi.fn(async () => undefined);
    const controller = new CallsController({ ...f.backend, leave }, f.media);
    controller.initialize();
    for (const [callId, from] of [
      ["A", "+15550100"],
      ["B", "+15550101"],
      ["C", "+15550102"],
    ] as const)
      f.emit({
        type: "incomingCall",
        call: { callId, from, video: false },
      });
    return { ...f, leave, controller, finish: () => finish() };
  }

  it("still shows and connects the answered call after the selected call ends", async () => {
    const h = waiting();
    const answering = h.controller.answer();
    h.controller.select("B");
    // B's end advances the display; it must not invalidate A's answer.
    h.emit({ type: "ended", callId: "B", reason: "remote_hangup" });
    h.finish();
    await answering;
    expect(h.controller.getSnapshot()).toMatchObject({
      callId: "A",
      status: "connecting",
      answering: false,
    });
    expect(h.media.open).toHaveBeenCalledOnce();
    h.connect("connected");
    expect(h.controller.getSnapshot().status).toBe("connected");
    expect(h.leave).not.toHaveBeenCalled();
    expect(h.backend.hangup).not.toHaveBeenCalled();
    h.controller.dispose();
  });

  it("does not show or connect a call that ended while its answer was in flight", async () => {
    const h = waiting();
    const answering = h.controller.answer();
    h.controller.select("B");
    h.emit({ type: "ended", callId: "A", reason: "remote_hangup" });
    h.finish();
    await answering;
    expect(h.controller.getSnapshot()).toMatchObject({
      callId: "B",
      status: "incoming",
      answering: false,
    });
    expect(h.media.open).not.toHaveBeenCalled();
    h.controller.dispose();
  });

  it("refuses to end another call while an answer is in flight", async () => {
    const h = waiting();
    const answering = h.controller.answer();
    h.controller.select("B");
    await expect(h.controller.end()).rejects.toThrow(
      "An answer is in progress",
    );
    expect(h.backend.hangup).not.toHaveBeenCalled();
    h.finish();
    await answering;
    expect(h.controller.getSnapshot().callId).toBe("A");
    h.controller.dispose();
  });
});

describe("a failed answer while other calls wait", () => {
  function two(openMedia?: () => Promise<CallMediaSession>) {
    const f = fixture();
    if (openMedia) vi.mocked(f.media.open).mockImplementationOnce(openMedia);
    const controller = new CallsController(f.backend, f.media);
    controller.initialize();
    const seen: string[] = [];
    controller.subscribe(() => {
      const s = controller.getSnapshot();
      seen.push(`${s.callId}:${s.status}`);
    });
    f.emit({
      type: "incomingCall",
      call: { callId: "A", from: "+15550100", video: false },
    });
    f.emit({
      type: "incomingCall",
      call: { callId: "B", from: "+15550101", video: false },
    });
    return { ...f, controller, seen };
  }

  it("reports a media failure, then shows the waiting call with it", async () => {
    const h = two(async () => {
      throw new Error("Microphone permission denied");
    });
    await h.controller.answer();
    // A's failure is published before B is shown.
    expect(h.seen).toContain("A:error");
    expect(h.controller.getSnapshot()).toMatchObject({
      callId: "B",
      status: "incoming",
      error: { code: "answer_failed", callId: "A", recoverable: true },
    });
    expect(h.controller.getSnapshot().invitations.map((i) => i.callId)).toEqual(
      ["B"],
    );
    h.controller.dispose();
  });

  it("publishes a terminal offer before showing the waiting call", async () => {
    const h = two(async () => {
      throw Object.assign(new Error("Capacity"), { status: 503 });
    });
    await h.controller.answer();
    expect(h.seen).toContain("A:ended");
    expect(h.controller.getSnapshot()).toMatchObject({
      callId: "B",
      status: "incoming",
    });
    expect(h.controller.getSnapshot().error).toBeUndefined();
    h.controller.dispose();
  });

  it("keeps a refused answer's call displayed and ringing so it can be retried", async () => {
    const h = two();
    vi.mocked(h.backend.answer).mockRejectedValueOnce(new Error("offline"));
    await h.controller.answer();
    expect(h.controller.getSnapshot()).toMatchObject({
      callId: "A",
      status: "incoming",
      answering: false,
      error: { code: "answer_failed", callId: "A", message: "offline" },
    });
    await h.controller.answer();
    expect(h.controller.getSnapshot()).toMatchObject({
      callId: "A",
      status: "connecting",
    });
    expect(h.controller.getSnapshot().error).toBeUndefined();
    h.controller.dispose();
  });
});
