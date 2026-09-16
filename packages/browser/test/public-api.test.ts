import { describe, expect, it, vi } from "vitest";
import * as publicApi from "../src/index.js";
import {
  CallsController,
  type CallLifecycleEvent,
  type CallMediaCallbacks,
} from "../src/internal.js";

describe("@polymorfa/browser public entry point", () => {
  it("exposes the calling component without signaling or media transports", () => {
    const names = Object.keys(publicApi);
    for (const hidden of [
      "BrowserCallsApi",
      "CallsController",
      "CallsSignalingClient",
      "CallsSocket",
      "IncomingCallRelay",
      "WebRtcMediaFactory",
      "createSignalingCallsBackend",
      "incomingCallFromWebhook",
      "lifecycleEventFrom",
      "parseCallsSocketMessage",
      "parseDataChannelMessage",
      "CALLS_DATA_CHANNEL",
      "DEFAULT_VIDEO_SLOTS",
      "MAX_VIDEO_SLOTS",
    ])
      expect(names, hidden).not.toContain(hidden);
    expect(names).toContain("createBrowserCalls");
    expect(names).toContain("capabilitiesFor");
  });
});

describe("participant video", () => {
  it("exposes labels and streams, not transceiver data", async () => {
    let emit: (event: CallLifecycleEvent) => void = () => undefined;
    let callbacks: CallMediaCallbacks | undefined;
    const controller = new CallsController(
      {
        subscribe: (listener) => {
          emit = listener;
          return () => undefined;
        },
        place: vi.fn(),
        answer: vi.fn(async () => undefined),
        reject: vi.fn(),
        hangup: vi.fn(),
      },
      {
        open: vi.fn(async (_id, _video, c: CallMediaCallbacks) => {
          callbacks = c;
          return {
            localStream: {} as MediaStream,
            remoteStream: {} as MediaStream,
            setMuted: vi.fn(),
            audioEnabled: () => true,
            videoEnabled: () => false,
            close: vi.fn(async () => undefined),
          };
        }),
      },
    );
    controller.initialize();
    emit({
      type: "incomingCall",
      call: { callId: "C", from: "+15550100", video: true },
    });
    await controller.answer();
    const stream = {} as MediaStream;
    callbacks?.onRemoteVideos?.([
      {
        key: "connection:tab-conn-1",
        source: 7,
        mid: "3",
        connectionId: "tab-conn-1",
        connectionParticipant: "client:tab-1",
        stream,
      },
    ]);
    expect(controller.remoteVideos).toEqual([
      {
        key: "connection:tab-conn-1",
        label: "client:tab-1",
        connectionId: "tab-conn-1",
        connectionParticipant: "client:tab-1",
        stream,
      },
    ]);
    expect(controller.remoteVideos).toBe(controller.remoteVideos);
    expect(controller.getSnapshot().remoteVideos).toEqual([
      {
        key: "connection:tab-conn-1",
        label: "client:tab-1",
        connectionId: "tab-conn-1",
        connectionParticipant: "client:tab-1",
      },
    ]);
    controller.dispose();
  });
});
