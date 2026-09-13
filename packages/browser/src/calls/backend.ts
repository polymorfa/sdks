import type {
  CallEndReason,
  CallLifecycleEvent,
  CallLine,
  CallsBackend,
  IncomingCall,
  PlaceCallInput,
} from "./controller.js";
import type { CallsSignaling } from "./signaling.js";

/**
 * The parts of the `call.received` webhook payload the browser needs. The
 * caller is a JID reference; a bare string is accepted for hand-built
 * payloads.
 */
export interface CallReceivedWebhookPayload {
  readonly callId: string;
  readonly from:
    | string
    | {
        readonly id?: string;
        readonly phoneNumber?: string;
        readonly lid?: string;
      };
  readonly hasVideo?: boolean;
}

/**
 * Turn a `call.received` webhook payload into an {@link IncomingCall}. The
 * application receives the webhook on its server, relays it to the browser
 * over its own realtime channel, and hands it to {@link IncomingCallRelay}.
 * The caller is shown by phone number when present, else by LID, else by
 * raw JID.
 */
export function incomingCallFromWebhook(
  payload: CallReceivedWebhookPayload,
  options: { readonly line?: CallLine } = {},
): IncomingCall {
  // Empty strings fall through like absent fields, matching `peerFrom` on the
  // socket path — the two inbound routes must agree on the same payload.
  const from =
    typeof payload.from === "string"
      ? payload.from
      : (firstNonEmpty(
          payload.from.phoneNumber,
          payload.from.lid,
          payload.from.id,
        ) ?? "");
  return {
    callId: payload.callId,
    from,
    video: payload.hasVideo === true,
    line: options.line ?? "linkedDevice",
  };
}

/**
 * Application-fed source of inbound call notifications for deployments that
 * relay `call.received` (and optionally `call.ended`) webhook events over
 * their own realtime channel. {@link CallsSocket} is the push alternative:
 * it subscribes to the same lifecycle stream directly from the API.
 */
export class IncomingCallRelay {
  readonly #listeners = new Set<(event: CallLifecycleEvent) => void>();

  /** Announce an inbound call; the controller moves to `incoming`. */
  receive(call: IncomingCall): void {
    this.#emit({ type: "incomingCall", call });
  }

  /** Announce that the remote side ended a call (from `call.ended`). */
  ended(callId: string, reason?: CallEndReason): void {
    this.#emit(
      reason === undefined
        ? { type: "ended", callId }
        : { type: "ended", callId, reason },
    );
  }

  subscribe(listener: (event: CallLifecycleEvent) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  #emit(event: CallLifecycleEvent): void {
    for (const listener of [...this.#listeners]) listener(event);
  }
}

export interface SignalingCallsBackendOptions {
  /** REST signaling client for the `/api/voip/calls/{id}` paths. */
  readonly signaling: CallsSignaling;
  /** Inbound call notifications: a {@link CallsSocket} or an application-fed {@link IncomingCallRelay}. */
  readonly incoming: Pick<IncomingCallRelay, "subscribe">;
  /**
   * Places an outbound call through the application's own server and resolves
   * the call id the platform assigned it.
   *
   * This custom backend delegates placement to the supplied hook. Use
   * createBrowserCalls for built-in client-token placement. Without a hook,
   * outbound calling reports place_failed instead of inventing a call id.
   */
  readonly place?: (
    input: PlaceCallInput,
    signal: AbortSignal,
  ) => Promise<string | { readonly callId: string }>;
}

/**
 * A {@link CallsBackend} over the REST signaling surface alone. Answering an
 * inbound call posts an SDP offer for the announced call id (the media factory
 * does that); reject and hang-up release the pod's session with the idempotent
 * teardown route. No server API key is involved: everything the browser does
 * runs on the client token.
 *
 * Supply place for custom outbound placement. createBrowserCalls provides
 * direct client-token placement through the shared Calls client.
 */
export function createSignalingCallsBackend(
  options: SignalingCallsBackendOptions,
): CallsBackend {
  return {
    subscribe: (listener) => options.incoming.subscribe(listener),
    place: async (input: PlaceCallInput, signal: AbortSignal) => {
      throwIfAborted(signal);
      const placeWith = options.place;
      if (placeWith === undefined)
        throw new Error(
          "This backend needs a `place` hook. Use createBrowserCalls for direct client-token placement.",
        );
      const placed = await placeWith(input, signal);
      throwIfAborted(signal);
      // `place` is application code behind a public interface: a response that
      // did not match its declared shape must not reach signaling as an
      // `undefined` call id.
      const callId =
        typeof placed === "string"
          ? placed
          : (placed as { readonly callId?: unknown } | null)?.callId;
      if (typeof callId !== "string" || callId === "")
        throw new Error("`place` resolved without a call id.");
      return { callId };
    },
    answer: async (_callId: string, signal: AbortSignal) => {
      throwIfAborted(signal);
    },
    reject: (callId: string, signal: AbortSignal) =>
      options.signaling.teardown(callId, signal),
    hangup: (callId: string, signal: AbortSignal) =>
      options.signaling.teardown(callId, signal),
  };
}

function firstNonEmpty(
  ...values: readonly (string | undefined)[]
): string | undefined {
  for (const value of values)
    if (typeof value === "string" && value.length > 0) return value;
  return undefined;
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw signal.reason;
}
