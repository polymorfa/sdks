import {
  CallsClient,
  type Call,
  type CallsClientOptions,
  type InternalCallsClientOptions,
} from "@polymorfa/calls/internal";
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
  readonly controller?: CallsControllerOptions;
  /**
   * Failures that do not belong to one call. `code: "unauthorized"` means the
   * platform stopped accepting the client token; the next attempt asks
   * `getClientToken` for a new one.
   */
  readonly onError?: (error: { code: string; message: string }) => void;
}

/**
 * Media overrides used by Polymorfa's own tests and embedded runtimes.
 * @internal
 */
export interface InternalBrowserCallsOptions extends BrowserCallsOptions {
  readonly media?: Omit<WebRtcMediaFactoryOptions, "signaling">;
  readonly mediaFactory?: CallMediaFactory;
}

/** @internal */
export function createInternalBrowserCalls(
  options: InternalBrowserCallsOptions,
): BrowserCalls {
  return createBrowserCalls(options);
}

export interface BrowserCalls {
  readonly controller: CallsController;
  readonly connected: boolean;
  /** Connect the authenticated lifecycle stream; rejects if the first attempt fails. */
  connect(): Promise<void>;
  /**
   * Release the widget, media and lifecycle stream. Joined calls are left,
   * not ended; a placed call that is still ringing is ended. Create a new
   * instance to reconnect.
   */
  dispose(): Promise<void>;
}

/**
 * The browser calling component: incoming calls, placement, answer, join,
 * leave and end, microphone, camera and device control, with a
 * `CallsController` for the UI packages. The client token from
 * `getClientToken` is the only credential. Incoming calls ring until the
 * application answers, joins, or declines them.
 */
export function createBrowserCalls(
  publicOptions: BrowserCallsOptions,
): BrowserCalls {
  const options = publicOptions as InternalBrowserCallsOptions;
  const transport = new BrowserTransport(options);
  const api = new BrowserCallsApi(transport);
  const clientOptions: InternalCallsClientOptions = {
    session: options.session,
    api,
    mediaMode: "external",
    ...(options.WebSocket === undefined
      ? {}
      : { WebSocket: options.WebSocket }),
    ...(options.now === undefined ? {} : { now: options.now }),
  };
  const client = new CallsClient(clientOptions);
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
    connectionId: (id) => client.getCall(id)?.connectionId,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    place: async (input, signal) => {
      if (disposed || !client.connected)
        throw new Error("Connect browser calls before placing a call.");
      if (placing || client.calls.some((call) => call.state !== "incoming"))
        throw new Error("Finish the active call before placing another.");
      placing = true;
      try {
        const call = await client.place(input.to, {
          video: input.video,
          idempotencyKey: input.idempotencyKey,
          ...(input.exclusive === undefined
            ? {}
            : { exclusive: input.exclusive }),
          signal,
        });
        return { callId: call.id };
      } finally {
        placing = false;
      }
    },
    answer: async (id, signal, input) => {
      signal.throwIfAborted();
      const call = requireCall(id);
      await call.answer({
        exclusive: input?.exclusive === true,
        ...(input === undefined ? {} : { video: input.video }),
      });
      return {
        answered: true,
        answeredBy: call.claim.answeredBy ?? "",
        exclusive: call.claim.exclusive,
      };
    },
    join: async (id, signal, input) => {
      signal.throwIfAborted();
      const call = requireCall(id);
      await call.join({ video: input.video });
      return {
        answered: true,
        answeredBy: call.claim.answeredBy ?? "",
        exclusive: call.claim.exclusive,
      };
    },
    reject: async (id, signal) => {
      signal.throwIfAborted();
      await requireCall(id).reject();
    },
    leave: async (id, _connectionId, signal) => {
      signal.throwIfAborted();
      // The call's own connection id is the one the media session used.
      await requireCall(id).leave();
    },
    hangup: async (id, signal) => {
      signal.throwIfAborted();
      // Keep the model live if the request fails, so the widget can retry.
      await requireCall(id).end();
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
    // Every invitation is listed; none is declined on the application's behalf.
    emit({
      type: "incomingCall",
      call: {
        callId: call.id,
        from: call.peer,
        video: call.hasVideo,
        capabilities: call.capabilities,
      },
    });
    for (const participant of call.participants)
      emit({ type: "participant", callId: call.id, participant });
  });
  client.on("call", (call) => {
    call.on("connected", () => emit({ type: "connected", callId: call.id }));
    call.on("error", (error) => options.onError?.(error));
    call.on("claim", (claim) => {
      if (call.direction === "outbound") return;
      emit({
        type: "accepted",
        callId: call.id,
        ...(claim.answeredBy === undefined
          ? {}
          : { answeredBy: claim.answeredBy }),
        exclusive: claim.exclusive,
        claimedByOther: claim.claimedByOther,
      });
    });
    call.on("state", (state, previous) => {
      if (call.direction === "outbound" && previous === "ringing")
        if (state === "connecting" || state === "connected")
          emit({ type: "accepted", callId: call.id });
    });
    call.on("participantJoined", (participant) =>
      emit({ type: "participant", callId: call.id, participant }),
    );
    call.on("participantState", (participant) =>
      emit({ type: "participant", callId: call.id, participant }),
    );
    call.on("participantLeft", (participantId) =>
      emit({ type: "participantLeft", callId: call.id, participantId }),
    );
  });
  client.on("ended", (call, reason) => {
    const snapshot = controller.getSnapshot();
    const listed = snapshot.invitations.some((i) => i.callId === call.id);
    if (snapshot.callId !== call.id && !listed) return;
    // Early outbound events are replayed before place() returns. The
    // controller adopts the terminal Call after the HTTP response.
    if (
      snapshot.callId === call.id &&
      ["error", "ended"].includes(snapshot.status)
    )
      return;
    emit({ type: "ended", callId: call.id, reason });
  });
  client.on("error", (error) => options.onError?.(error));
  // Keep the shared call's terminal state in sync with browser media failures.
  const unsubscribe = controller.subscribe(() => {
    const snapshot = controller.getSnapshot();
    const call = client.getCall(snapshot.callId ?? "");
    if (
      call &&
      !call.ended &&
      call.state !== "incoming" &&
      snapshot.error?.code !== "call_control_failed" &&
      (snapshot.status === "ended" || snapshot.status === "error")
    ) {
      const reason =
        snapshot.endReason === "capacity"
          ? "capacity"
          : snapshot.endReason === "pod_lost"
            ? "pod_lost"
            : "connection_failed";
      // Nobody else is on an outbound call that is still ringing, and nobody
      // can take over a call this client claimed (exclusive answer or
      // placement). Leaving either would strand the other party, so end it,
      // as @polymorfa/calls does for socket media.
      const release =
        (call.direction === "outbound" && call.state === "ringing") ||
        call._claimedBySelf;
      call._remoteEnded(reason);
      if (release)
        void api
          .end(call.id)
          .catch((cause: unknown) =>
            options.onError?.({ code: "end_failed", message: message(cause) }),
          );
      // Media failed locally: leave the connection; the call continues for
      // others. The platform requires a connection id; the call's own id is
      // the one the media session offers with.
      else
        void api.leave(call.id, call.connectionId).catch((cause: unknown) =>
          options.onError?.({
            code: "leave_failed",
            message: message(cause),
          }),
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
