"use client";

import {
  createBrowserCalls,
  createClientTokenProvider,
  type CallsController,
} from "@polymorfa/browser";
// Demo mode only: the in-memory backend below needs the controller class,
// which applications normally get from `createBrowserCalls`.
import {
  CallsController as DemoCallsController,
  type CallLifecycleEvent,
  type CallMediaFactory,
  type CallsBackend,
} from "@polymorfa/browser/internal";

export interface DeskCalls {
  readonly controller: CallsController;
  /** Demo only: rings the agent as if a customer called. */
  readonly simulateIncoming?: (from: string, video: boolean) => void;
  readonly dispose: () => void;
}

/**
 * Real calling. The client token from /api/messaging/calls/token is the only
 * credential; the lifecycle stream delivers incoming calls and their answers.
 */
function createLiveCalls(session: string): DeskCalls {
  const calls = createBrowserCalls({
    session,
    getClientToken: createClientTokenProvider({
      path: "/api/messaging/calls/token",
    }),
    onError: (error) => {
      // "unauthorized": the token expired or was revoked; the next reconnect
      // asks the token route for a new one.
      console.warn("Calls:", error.code);
    },
  });
  calls.connect().catch((error: unknown) => {
    console.warn("Calls could not connect", error);
  });
  return {
    controller: calls.controller,
    dispose: () => {
      void calls.dispose();
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

  const controller = new DemoCallsController(backend, media);
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
