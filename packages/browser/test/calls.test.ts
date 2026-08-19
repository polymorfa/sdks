import { describe, expect, it, vi } from "vitest";

import {
  CallsController,
  type CallEvent,
  type CallsTransport,
} from "../src/index.js";

function fixtureTransport() {
  let listener: ((event: CallEvent) => void) | undefined;
  const unsubscribe = vi.fn();
  const transport: CallsTransport = {
    initialize: vi.fn(async () => ({
      capabilities: {
        video: true,
        waitingRoom: true,
        reactions: true,
        handRaise: true,
      },
      devices: [
        {
          id: "mic-1",
          kind: "audio_input" as const,
          label: "Microphone",
        },
      ],
      permissions: {
        microphone: "granted" as const,
        camera: "prompt" as const,
      },
    })),
    subscribe: vi.fn((next) => {
      listener = next;
      return unsubscribe;
    }),
    start: vi.fn(async () => ({ callId: "call-1" })),
    answer: vi.fn(async () => undefined),
    reject: vi.fn(async () => undefined),
    hangUp: vi.fn(async () => undefined),
    setDevice: vi.fn(async () => undefined),
    setMuted: vi.fn(async () => undefined),
    setVideoEnabled: vi.fn(async () => undefined),
    sendReaction: vi.fn(async () => undefined),
    setHandRaised: vi.fn(async () => undefined),
    admit: vi.fn(async () => undefined),
    deny: vi.fn(async () => undefined),
    selectVideoParticipant: vi.fn(async () => undefined),
    releaseMedia: vi.fn(async () => undefined),
  };
  return {
    transport,
    emit: (event: CallEvent) => listener?.(event),
    unsubscribe,
  };
}

describe("CallsController", () => {
  it("discovers capabilities and moves an outgoing call through reconnecting without ending it", async () => {
    const fixture = fixtureTransport();
    const controller = new CallsController(fixture.transport);
    await controller.initialize();
    await controller.start({ conversationId: "chat-1", mediaKind: "video" });
    expect(controller.getSnapshot()).toMatchObject({
      phase: "ringing",
      direction: "outgoing",
      callId: "call-1",
    });
    fixture.emit({ type: "phase", callId: "call-1", phase: "connecting" });
    fixture.emit({ type: "phase", callId: "call-1", phase: "active" });
    fixture.emit({ type: "phase", callId: "call-1", phase: "reconnecting" });
    expect(controller.getSnapshot().phase).toBe("reconnecting");
    expect(controller.getSnapshot().endReason).toBeUndefined();
    fixture.emit({ type: "phase", callId: "call-1", phase: "active" });
    expect(controller.getSnapshot().phase).toBe("active");
  });

  it("handles incoming waiting-room calls, participants, hand raise and selection", async () => {
    const fixture = fixtureTransport();
    const controller = new CallsController(fixture.transport);
    await controller.initialize();
    fixture.emit({
      type: "incoming",
      callId: "call-2",
      mediaKind: "audio",
      conversationId: "chat-2",
    });
    await controller.answer();
    fixture.emit({ type: "phase", callId: "call-2", phase: "waiting_room" });
    fixture.emit({
      type: "participants",
      callId: "call-2",
      participants: [
        {
          id: "p-1",
          displayName: "Ada",
          role: "host",
          state: "connected",
          handRaised: true,
        },
      ],
    });
    await controller.admit("p-1");
    await controller.setHandRaised(true);
    await controller.selectVideoParticipant("p-1");
    expect(fixture.transport.admit).toHaveBeenCalledWith(
      "call-2",
      "p-1",
      expect.any(AbortSignal),
    );
    expect(controller.getSnapshot()).toMatchObject({
      phase: "waiting_room",
      selectedVideoParticipantId: "p-1",
    });
  });

  it("surfaces permission and device loss separately from signaling failures", async () => {
    const fixture = fixtureTransport();
    const controller = new CallsController(fixture.transport);
    await controller.initialize();
    fixture.emit({
      type: "permission",
      permissions: { microphone: "denied", camera: "unavailable" },
    });
    expect(controller.getSnapshot()).toMatchObject({
      phase: "permission_denied",
    });
    fixture.emit({
      type: "permission",
      permissions: { microphone: "granted", camera: "prompt" },
    });
    fixture.emit({ type: "devices", devices: [] });
    expect(controller.getSnapshot()).toMatchObject({
      phase: "devices_unavailable",
      devices: [],
    });
    fixture.emit({
      type: "failure",
      code: "signaling_failed",
      message: "offline",
      recoverable: true,
    });
    expect(controller.getSnapshot()).toMatchObject({
      phase: "error",
      error: { code: "signaling_failed" },
    });
  });

  it("serializes media commands and releases media on end and disposal", async () => {
    const fixture = fixtureTransport();
    const order: string[] = [];
    vi.mocked(fixture.transport.setMuted).mockImplementation(async () => {
      order.push("mute-start");
      await Promise.resolve();
      order.push("mute-end");
    });
    vi.mocked(fixture.transport.setVideoEnabled).mockImplementation(
      async () => {
        order.push("video");
      },
    );
    const controller = new CallsController(fixture.transport);
    await controller.initialize();
    await controller.start({ conversationId: "chat-1", mediaKind: "video" });
    await Promise.all([
      controller.setMuted(true),
      controller.setVideoEnabled(false),
    ]);
    expect(order).toEqual(["mute-start", "mute-end", "video"]);
    fixture.emit({ type: "ended", callId: "call-1", reason: "remote_hangup" });
    expect(controller.getSnapshot()).toMatchObject({
      phase: "ended",
      endReason: "remote_hangup",
    });
    expect(fixture.transport.releaseMedia).toHaveBeenCalledTimes(1);
    controller.dispose();
    expect(fixture.unsubscribe).toHaveBeenCalledTimes(1);
  });
});
