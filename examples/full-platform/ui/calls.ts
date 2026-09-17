"use client";

import {
  BrowserCallsApi,
  BrowserTransport,
  CallsController,
  CallsSignalingClient,
  IncomingCallRelay,
  WebRtcMediaFactory,
  createClientTokenProvider,
  createSignalingCallsBackend,
  incomingCallFromWebhook,
  type CallLifecycleEvent,
  type CallMediaFactory,
  type CallsBackend,
} from "@polymorfa/browser";

import { liveEvents } from "../lib/browser/live-events.js";

export interface DeskCalls {
  readonly controller: CallsController;
  /** Demo only: rings the agent as if a customer called. */
  readonly simulateIncoming?: (from: string, video: boolean) => void;
  readonly dispose: () => void;
}

/** Real calling: client-token signaling plus webhook-relayed inbound calls. */
function createLiveCalls(session: string): DeskCalls {
  const transport = new BrowserTransport({
    getClientToken: createClientTokenProvider({
      path: "/api/messaging/calls/token",
    }),
  });
  const signaling = new CallsSignalingClient(transport);
  const api = new BrowserCallsApi(transport);
  // Inbound calls arrive as webhooks on the server and are relayed here.
  const relay = new IncomingCallRelay();
  const controller = new CallsController(
    createSignalingCallsBackend({
      signaling,
      incoming: relay,
      // The client token places the call; the controller supplies the key.
      place: ({ to, video, idempotencyKey }, signal) =>
        api.place({ session, to, video, idempotencyKey }, signal),
    }),
    new WebRtcMediaFactory({ signaling }),
  );
  controller.initialize();
  // The same webhook events the server verified, relayed unchanged.
  const unsubscribe = liveEvents.subscribe({
    "call.received": (event) =>
      relay.receive(
        incomingCallFromWebhook({
          callId: event.payload.callId,
          from: event.payload.from,
        }),
      ),
    "call.ended": (event) =>
      relay.ended(event.payload.callId, event.payload.reason),
    "call.missed": (event) =>
      relay.ended(event.payload.callId, event.payload.reason),
  });
  return {
    controller,
    dispose: () => {
      unsubscribe();
      controller.dispose();
    },
  };
}

/**
 * Demo calling: a backend that rings, connects and hangs up on timers, and
 * media sessions with empty streams, so the call UI runs without a network.
 */
function createDemoCalls(): DeskCalls {
  const listeners = new Set<(event: CallLifecycleEvent) => void>();
  const emit = (event: CallLifecycleEvent) =>
    listeners.forEach((listener) => listener(event));
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const later = (ms: number, run: () => void) => {
    const timer = setTimeout(() => {
      timers.delete(timer);
      run();
    }, ms);
    timers.add(timer);
  };

  const backend: CallsBackend = {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async place() {
      const callId = `demo_call_${Date.now()}`;
      later(400, () => emit({ type: "ringing", callId }));
      later(2600, () => emit({ type: "accepted", callId }));
      return { callId };
    },
    async answer() {},
    async reject() {},
    async hangup() {},
  };

  const media: CallMediaFactory = {
    async open(callId, video, callbacks) {
      const local = new MediaStream();
      const remote = new MediaStream();
      let audio = true;
      let camera = video;
      later(600, () => {
        callbacks.onRemoteStream(remote);
        callbacks.onConnectionState("connected");
      });
      return {
        localStream: local,
        remoteStream: remote,
        setMuted(muted) {
          if (muted.audio !== undefined) audio = !muted.audio;
          if (muted.video !== undefined) camera = !muted.video;
        },
        audioEnabled: () => audio,
        videoEnabled: () => camera,
        async close() {
          void callId;
        },
      };
    },
    async listDevices() {
      return [
        {
          deviceId: "default",
          kind: "audioinput",
          label: "Built-in microphone",
        },
        {
          deviceId: "default",
          kind: "audiooutput",
          label: "Built-in speakers",
        },
        { deviceId: "cam", kind: "videoinput", label: "FaceTime HD Camera" },
      ];
    },
  };

  const controller = new CallsController(backend, media);
  controller.initialize();
  return {
    controller,
    simulateIncoming: (from, video) =>
      emit({
        type: "incomingCall",
        call: { callId: `demo_in_${Date.now()}`, from, video },
      }),
    dispose: () => {
      timers.forEach(clearTimeout);
      controller.dispose();
    },
  };
}

export function createDeskCalls(options: {
  readonly demo: boolean;
  readonly session: string;
}): DeskCalls {
  return options.demo ? createDemoCalls() : createLiveCalls(options.session);
}
