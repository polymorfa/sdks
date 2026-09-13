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
      "https://api.polymorfa.test/messaging/voip/calls/call%2F1/offer",
      "https://api.polymorfa.test/messaging/voip/calls/call%2F1/candidate",
      "https://api.polymorfa.test/messaging/voip/calls/call%2F1/candidates",
      "https://api.polymorfa.test/messaging/voip/calls/call%2F1",
    ]);
  });
});

describe("CallsSignalingClient socket tickets", () => {
  it("never names a session: the client token is already bound to one", async () => {
    const fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            data: { ticket: "pmfa_wst_a", expiresAt: 1, url: "/voip/ws?t=a" },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    );
    const client = new CallsSignalingClient(
      new BrowserTransport({
        baseUrl: "https://api.example",
        getClientToken: async () => "pmfa_ct_x",
        fetch: fetch as unknown as typeof globalThis.fetch,
      }),
    );
    await client.socketTicket("support");
    // The API answers 403 "client token cannot follow another session" when a
    // client token names one, so the bound session must be left implicit.
    const [, init] = (
      fetch.mock.calls as unknown as [string, RequestInit][]
    )[0] ?? ["", {}];
    expect(JSON.parse(String(init.body))).toEqual({});
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
