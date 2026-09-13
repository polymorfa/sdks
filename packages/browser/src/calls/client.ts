import {
  CallsClient,
  type Call,
  type CallsClientOptions,
} from "@polymorfa/calls";
import {
  BrowserTransport,
  type BrowserTransportOptions,
} from "../transport.js";
import { BrowserCallsApi } from "./api.js";
import {
  CallsController,
  type CallLifecycleEvent,
  type CallsBackend,
  type CallsControllerOptions,
} from "./controller.js";
import {
  WebRtcMediaFactory,
  type CallMediaFactory,
  type WebRtcMediaFactoryOptions,
} from "./media.js";
import { CallsSignalingClient } from "./signaling.js";

export interface BrowserCallsOptions extends BrowserTransportOptions {
  /** Local call identity. Requests use the client token's bound session. */
  readonly session: string;
  readonly WebSocket?: CallsClientOptions["WebSocket"];
  readonly media?: Omit<WebRtcMediaFactoryOptions, "signaling">;
  /** Supply a media adapter in embedded runtimes or tests. */
  readonly mediaFactory?: CallMediaFactory;
  readonly controller?: CallsControllerOptions;
  readonly onError?: (error: { code: string; message: string }) => void;
}

export interface BrowserCalls {
  readonly controller: CallsController;
  readonly connected: boolean;
  /** Claim browser mode and connect the lifecycle stream; rejects if the first attempt fails. */
  connect(): Promise<void>;
  /** Release the widget, media and lifecycle stream. Create a new instance to reconnect. */
  dispose(): Promise<void>;
}

/**
 * Calls client, client-token controls and the existing WebRTC widget as one
 * owned component. Browser mode auto-answers remotely; Answer attaches local
 * media. The controller keeps device selection, mute, video and ICE recovery.
 */
export function createBrowserCalls(options: BrowserCallsOptions): BrowserCalls {
  const transport = new BrowserTransport(options);
  const api = new BrowserCallsApi(transport);
  const client = new CallsClient({
    session: options.session,
    api,
    answerMode: "browser",
    mediaMode: "external",
    ...(options.WebSocket === undefined
      ? {}
      : { WebSocket: options.WebSocket }),
    ...(options.now === undefined ? {} : { now: options.now }),
  });
  const listeners = new Set<(event: CallLifecycleEvent) => void>();
  const emit = (event: CallLifecycleEvent) => {
    for (const listener of [...listeners]) listener(event);
  };
  let disposed = false;
  let placing = false;
  let disposal: Promise<void> | undefined;
  let connecting: Promise<void> | undefined;
  const requireCall = (id: string): Call => {
    const call = client.getCall(id);
    if (!call) throw new Error("Call is no longer available.");
    return call;
  };
  const backend: CallsBackend = {
    dispose: () => {
      void dispose();
    },
    getCall: (id) => client.getCall(id),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    place: async (input, signal) => {
      if (disposed || !client.connected)
        throw new Error("Connect browser calls before placing a call.");
      if (input.line !== "linkedDevice")
        throw new Error("Direct placement supports linked-device calls.");
      if (client.calls.length > 0)
        throw new Error("Finish the active call before placing another.");
      placing = true;
      try {
        const call = await client.place(input.to, {
          video: input.video,
          idempotencyKey: input.idempotencyKey,
          signal,
        });
        return { callId: call.id };
      } finally {
        placing = false;
      }
    },
    answer: async (id, signal) => {
      signal.throwIfAborted();
      await requireCall(id).answer();
    },
    reject: async (id, signal) => {
      signal.throwIfAborted();
      await requireCall(id).reject();
    },
    hangup: async (id, signal) => {
      signal.throwIfAborted();
      const call = requireCall(id);
      // WebRTC is owned by the controller. Keep the model live if the REST
      // teardown fails, so the widget can report the failure and retry it.
      await api.hangup(id, signal);
      call._remoteEnded("hangup");
    },
  };
  const media =
    options.mediaFactory ??
    new WebRtcMediaFactory({
      ...options.media,
      signaling: new CallsSignalingClient(transport),
    });
  const controller = new CallsController(backend, media, options.controller);
  client.on("incoming", (call) => {
    if (disposed || call.ended) return;
    // One widget owns one call. Decline additional calls instead of losing their controls.
    const activeCall = controller.call;
    if (
      placing ||
      (activeCall !== undefined && !activeCall.ended) ||
      !["idle", "ready", "ended", "error"].includes(
        controller.getSnapshot().status,
      )
    ) {
      void call
        .reject()
        .catch((cause: unknown) =>
          options.onError?.({ code: "reject_failed", message: message(cause) }),
        );
      return;
    }
    emit({
      type: "incomingCall",
      call: {
        callId: call.id,
        from: call.peer,
        video: call.video !== undefined,
      },
    });
  });
  client.on("call", (call) => {
    call.on("connected", () => emit({ type: "connected", callId: call.id }));
    call.on("error", (error) => options.onError?.(error));
  });
  client.on("ended", (call, reason) => {
    // Early outbound events are replayed before place() returns. The controller
    // adopts the terminal Call after the HTTP response, without opening media.
    if (controller.getSnapshot().callId !== call.id) return;
    if (
      controller.call?.id === call.id &&
      ["error", "ended"].includes(controller.getSnapshot().status)
    )
      return;
    emit({ type: "ended", callId: call.id, reason });
  });
  client.on("error", (error) => options.onError?.(error));
  // Keep the shared call's terminal state in sync with browser media failures.
  const unsubscribe = controller.subscribe(() => {
    const snapshot = controller.getSnapshot();
    const call = controller.call;
    if (
      call &&
      !call.ended &&
      snapshot.error?.code !== "call_control_failed" &&
      (snapshot.status === "ended" || snapshot.status === "error")
    ) {
      const reason =
        snapshot.endReason === "capacity"
          ? "capacity"
          : snapshot.endReason === "pod_lost"
            ? "pod_lost"
            : "connection_failed";
      call._remoteEnded(reason);
      // Media acquisition may fail before a session exists to run teardown.
      void api
        .hangup(call.id)
        .catch((cause: unknown) =>
          options.onError?.({ code: "hangup_failed", message: message(cause) }),
        );
    }
  });
  function dispose(): Promise<void> {
    if (disposal) return disposal;
    if (disposed) return Promise.resolve();
    disposed = true;
    unsubscribe();
    listeners.clear();
    controller.dispose();
    disposal = client.disconnect();
    return disposal;
  }
  return {
    controller,
    get connected() {
      return client.connected;
    },
    connect: () => {
      if (disposed)
        return Promise.reject(new Error("Browser calls is disposed."));
      if (connecting) return connecting;
      controller.initialize();
      connecting = client
        .connect()
        .then(() => {
          if (!client.connected)
            throw new Error(
              "Calls lifecycle stream is not connected; reconnection continues until disposal.",
            );
        })
        .finally(() => {
          connecting = undefined;
        });
      return connecting;
    },
    dispose,
  };
}

function message(cause: unknown): string {
  return cause instanceof Error ? cause.message : "Call operation failed.";
}
