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
  const from =
    typeof payload.from === "string"
      ? payload.from
      : (payload.from.phoneNumber ?? payload.from.lid ?? payload.from.id ?? "");
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
  /** Call id generator for outbound calls. Defaults to `crypto.randomUUID`. */
  readonly createCallId?: () => string;
}

/**
 * A {@link CallsBackend} over the REST signaling surface alone. Outbound calls
 * mint a browser-side call id and establish media by posting the SDP offer
 * (the media factory does that); answering an inbound call likewise posts an
 * offer for the announced call id; reject and hang-up release the pod's
 * session with the idempotent teardown route. No server API key is involved:
 * everything runs on the client token.
 */
export function createSignalingCallsBackend(
  options: SignalingCallsBackendOptions,
): CallsBackend {
  const createCallId = options.createCallId ?? (() => crypto.randomUUID());
  return {
    subscribe: (listener) => options.incoming.subscribe(listener),
    place: async (input: PlaceCallInput, signal: AbortSignal) => {
      throwIfAborted(signal);
      return { callId: createCallId() };
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

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw signal.reason;
}
