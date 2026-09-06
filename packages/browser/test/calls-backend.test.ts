import { describe, expect, it, vi } from "vitest";
import {
  CallsController,
  IncomingCallRelay,
  capabilitiesFor,
  createSignalingCallsBackend,
  incomingCallFromWebhook,
  type CallMediaFactory,
  type CallMediaSession,
  type CallsSignaling,
} from "../src/index.js";

function signaling(): CallsSignaling & { teardown: ReturnType<typeof vi.fn> } {
  return {
    offer: vi.fn(async () => ({ sdp: "v=0", iceServers: [] })),
    candidate: vi.fn(async () => undefined),
    candidates: vi.fn(async () => []),
    teardown: vi.fn(async () => undefined),
  };
}

function media(): {
  factory: CallMediaFactory;
  session: CallMediaSession & { switchInput: ReturnType<typeof vi.fn> };
  listDevices: ReturnType<typeof vi.fn>;
} {
  const session = {
    localStream: {} as MediaStream,
    remoteStream: {} as MediaStream,
    setMuted: vi.fn(),
    audioEnabled: () => true,
    videoEnabled: () => true,
    switchInput: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
  };
  const listDevices = vi.fn(async () => [
    { deviceId: "mic-2", kind: "audioinput" as const, label: "Desk mic" },
    { deviceId: "cam-1", kind: "videoinput" as const, label: "Webcam" },
  ]);
  const factory: CallMediaFactory = {
    open: vi.fn(async () => session),
    listDevices,
  };
  return { factory, session, listDevices };
}

describe("incomingCallFromWebhook", () => {
  it("maps a call.received payload onto an IncomingCall", () => {
    expect(
      incomingCallFromWebhook({
        callId: "CALL-1",
        from: {
          id: "12025550123@s.whatsapp.net",
          phoneNumber: "+12025550123",
          lid: "5550123@lid",
        },
        hasVideo: true,
      }),
    ).toEqual({
      callId: "CALL-1",
      from: "+12025550123",
      video: true,
      line: "linkedDevice",
    });
    expect(
      incomingCallFromWebhook({ callId: "c", from: { lid: "5550123@lid" } })
        .from,
    ).toBe("5550123@lid");
    // An empty field falls through like an absent one, as it does on the
    // socket path — both routes feed the same IncomingCall.from.
    expect(
      incomingCallFromWebhook({
        callId: "c",
        from: { phoneNumber: "", lid: "5550123@lid" },
      }).from,
    ).toBe("5550123@lid");
    expect(
      incomingCallFromWebhook(
        { callId: "c", from: "+12025550123", hasVideo: true },
        { line: "cloudApi" },
      ).line,
    ).toBe("cloudApi");
  });
});

describe("createSignalingCallsBackend", () => {
  it("relays inbound calls, places through the hook, and tears down on reject/hangup", async () => {
    const relay = new IncomingCallRelay();
    const s = signaling();
    const backend = createSignalingCallsBackend({
      signaling: s,
      incoming: relay,
      place: async () => "call-out-1",
    });
    const m = media();
    const controller = new CallsController(backend, m.factory);
    controller.initialize();

    relay.receive({ callId: "CALL-1", from: "+12025550123", video: false });
    expect(controller.getSnapshot()).toMatchObject({
      status: "incoming",
      peer: "+12025550123",
      capabilities: { video: true, mute: true },
    });
    await controller.reject();
    expect(s.teardown).toHaveBeenCalledWith("CALL-1", expect.any(AbortSignal));
    expect(controller.getSnapshot()).toMatchObject({
      status: "ended",
      endReason: "rejected",
    });

    await controller.place("+12025550199", { video: true });
    expect(controller.getSnapshot()).toMatchObject({
      status: "connecting",
      callId: "call-out-1",
      direction: "outgoing",
      video: true,
    });
    expect(m.factory.open).toHaveBeenCalledWith(
      "call-out-1",
      true,
      expect.any(Object),
      expect.any(AbortSignal),
      { devices: {} },
    );
    await controller.hangup();
    expect(s.teardown).toHaveBeenLastCalledWith(
      "call-out-1",
      expect.any(AbortSignal),
    );

    relay.receive({ callId: "CALL-2", from: "+12025550123", video: false });
    relay.ended("CALL-2", "missed");
    expect(controller.getSnapshot()).toMatchObject({
      status: "ended",
      endReason: "missed",
    });
  });

  it("carries the destination to the place hook and adopts its call id", async () => {
    const place = vi.fn(async () => ({ callId: "server-call-9" }));
    const controller = new CallsController(
      createSignalingCallsBackend({
        signaling: signaling(),
        incoming: new IncomingCallRelay(),
        place,
      }),
      media().factory,
    );
    controller.initialize();

    await controller.place("+12025550199", { video: true });
    expect(place).toHaveBeenCalledWith(
      {
        to: "+12025550199",
        video: true,
        line: "linkedDevice",
        idempotencyKey: expect.any(String),
      },
      expect.any(AbortSignal),
    );
    expect(controller.getSnapshot()).toMatchObject({
      status: "connecting",
      callId: "server-call-9",
      peer: "+12025550199",
    });
  });

  it("rejects a placement result that carries no usable call id", async () => {
    for (const placed of [
      undefined,
      null,
      {},
      { callId: 7 },
      { callId: "" },
      "",
    ]) {
      const s = signaling();
      const controller = new CallsController(
        createSignalingCallsBackend({
          signaling: s,
          incoming: new IncomingCallRelay(),
          place: async () => placed as never,
        }),
        media().factory,
      );
      controller.initialize();
      await controller.place("+12025550199");
      // An undefined id would otherwise reach the offer path as `undefined`.
      expect(controller.getSnapshot().status).toBe("error");
      expect(s.offer).not.toHaveBeenCalled();
      controller.dispose();
    }
  });

  it("refuses to place a call when no placement hook is configured", async () => {
    // Inventing a call id here would post an offer for a call no pod owns,
    // which the platform answers with a permanent not-ready.
    const s = signaling();
    const controller = new CallsController(
      createSignalingCallsBackend({
        signaling: s,
        incoming: new IncomingCallRelay(),
      }),
      media().factory,
    );
    controller.initialize();

    await controller.place("+12025550199");
    const snapshot = controller.getSnapshot();
    expect(snapshot.status).toBe("error");
    expect(snapshot.error?.code).toBe("place_failed");
    expect(snapshot.error?.message).toMatch(/place/i);
    expect(s.offer).not.toHaveBeenCalled();
  });

  it("keeps the Business Calling API line audio-only", async () => {
    const relay = new IncomingCallRelay();
    const backend = createSignalingCallsBackend({
      signaling: signaling(),
      incoming: relay,
    });
    const m = media();
    const controller = new CallsController(backend, m.factory);
    controller.initialize();
    expect(capabilitiesFor("cloudApi")).toEqual({ video: false, mute: true });

    relay.receive({
      callId: "CALL-3",
      from: "+12025550123",
      video: true,
      line: "cloudApi",
    });
    expect(controller.getSnapshot()).toMatchObject({
      line: "cloudApi",
      video: false,
      capabilities: { video: false },
    });
    await controller.answer({ video: true });
    expect(m.factory.open).toHaveBeenCalledWith(
      "CALL-3",
      false,
      expect.any(Object),
      expect.any(AbortSignal),
      { devices: {} },
    );
  });

  it("stores device preferences, switches live inputs, and lists devices", async () => {
    const relay = new IncomingCallRelay();
    const backend = createSignalingCallsBackend({
      signaling: signaling(),
      incoming: relay,
      place: async () => "call-dev",
    });
    const m = media();
    const controller = new CallsController(backend, m.factory, {
      now: () => 1_000,
    });
    controller.initialize();
    controller.setPreferredDevices({ audioInput: "mic-1", audioOutput: "spk" });
    await controller.refreshDevices();
    expect(controller.getSnapshot().devices).toHaveLength(2);

    await controller.place("+12025550123");
    expect(m.factory.open).toHaveBeenLastCalledWith(
      "call-dev",
      false,
      expect.any(Object),
      expect.any(AbortSignal),
      { devices: { audioInput: "mic-1", audioOutput: "spk" } },
    );
    await controller.switchDevice("audioInput", "mic-2");
    expect(m.session.switchInput).toHaveBeenCalledWith(
      "audio",
      "mic-2",
      expect.any(AbortSignal),
    );
    expect(controller.getSnapshot().selectedDevices).toEqual({
      audioInput: "mic-2",
      audioOutput: "spk",
    });
  });
});
