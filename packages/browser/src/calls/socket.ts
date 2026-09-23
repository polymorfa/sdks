import {
  LifecycleSocket,
  capabilitiesFrom,
  isParticipant,
  parseLifecycleFrame,
  type LifecycleFrame,
} from "@polymorfa/sdk/calls/internal";
import type { CallEndReason, CallLifecycleEvent } from "./controller.js";
import type { CallsSignaling, TrickleCandidate } from "./signaling.js";

/** Server → browser frames on the calls WebSocket. */
export type CallsSocketServerMessage = LifecycleFrame;

/**
 * A failure delivered to {@link CallsSocket.onError}. A `CallsAuthError`
 * (`code: "unauthorized"`) means the platform closed the socket with 4401;
 * the socket mints a fresh ticket before reconnecting.
 */
export interface CallsSocketError {
  readonly code: string;
  readonly message: string;
}

/** Browser → server frames on the calls WebSocket. */
export type CallsSocketClientMessage =
  | {
      readonly type: "candidate";
      readonly callId: string;
      readonly connectionId: string;
      readonly candidate: TrickleCandidate;
    }
  | { readonly type: "ping" };

export interface CallsSocketOptions {
  /** Signaling client that supplies a ticket and the socket URL. */
  readonly signaling: Pick<CallsSignaling, "socketTicket" | "socketUrl">;
  /** Session to follow when the credential is a server key. */
  readonly session?: string;
  /** Participant name used by other Calls operations. */
  readonly participant?: string;
  /** Reconnect backoff bounds in milliseconds. Defaults 1 000 → 30 000. */
  readonly minBackoffMs?: number;
  readonly maxBackoffMs?: number;
  /** Heartbeat period in milliseconds; 0 disables it. Defaults to 15 000. */
  readonly heartbeatMs?: number;
  /**
   * Deadline in milliseconds from opening until the platform sends ready;
   * 0 disables it. Defaults to 10 000.
   */
  readonly openTimeoutMs?: number;
  /** Deprecated: reconnect mints a fresh ticket. */
  readonly refreshBeforeExpiryMs?: number;
  readonly WebSocket?: typeof globalThis.WebSocket;
  readonly setTimeout?: typeof globalThis.setTimeout;
  readonly clearTimeout?: typeof globalThis.clearTimeout;
  readonly setInterval?: typeof globalThis.setInterval;
  readonly clearInterval?: typeof globalThis.clearInterval;
  readonly random?: () => number;
  readonly now?: () => number;
}

/**
 * The calls WebSocket: one socket per client at `/voip/ws?ticket=…`. A client
 * token is exchanged for a single-use ticket over REST before every attempt.
 * It pushes the session's `call.*` lifecycle events, delivers the
 * pod's ICE candidates, and carries the browser's candidates. It reconnects
 * with capped exponential backoff until {@link close}. Pass it as a
 * backend's `incoming` source and as the media factory's candidate transport.
 */
export class CallsSocket {
  readonly #lifecycle = new Set<(event: CallLifecycleEvent) => void>();
  readonly #candidates = new Set<
    (callId: string, candidate: TrickleCandidate, connectionId?: string) => void
  >();
  readonly #state = new Set<(connected: boolean) => void>();
  readonly #errors = new Set<(error: CallsSocketError) => void>();
  readonly #socket: LifecycleSocket | undefined;

  constructor(options: CallsSocketOptions) {
    const signaling = options.signaling;
    if (
      signaling.socketTicket === undefined ||
      signaling.socketUrl === undefined
    ) {
      this.#socket = undefined;
      return;
    }
    // Read the methods on every call so a replaced provider takes effect.
    this.#socket = new LifecycleSocket({
      api: {
        socketTicket: (session, signal) =>
          unsupported(signaling.socketTicket).call(signaling, session, signal),
        socketUrl: (path) =>
          unsupported(signaling.socketUrl).call(signaling, path),
      },
      ...(options.session === undefined ? {} : { session: options.session }),
      ...(options.participant === undefined
        ? {}
        : { participant: options.participant }),
      ...(options.WebSocket === undefined
        ? {}
        : { WebSocket: options.WebSocket }),
      ...(options.setTimeout === undefined
        ? {}
        : { setTimeout: options.setTimeout }),
      ...(options.clearTimeout === undefined
        ? {}
        : { clearTimeout: options.clearTimeout }),
      ...(options.setInterval === undefined
        ? {}
        : { setInterval: options.setInterval }),
      ...(options.clearInterval === undefined
        ? {}
        : { clearInterval: options.clearInterval }),
      ...(options.random === undefined ? {} : { random: options.random }),
      ...(options.now === undefined ? {} : { now: options.now }),
      ...(options.minBackoffMs === undefined
        ? {}
        : { minBackoffMs: options.minBackoffMs }),
      ...(options.maxBackoffMs === undefined
        ? {}
        : { maxBackoffMs: options.maxBackoffMs }),
      ...(options.heartbeatMs === undefined
        ? {}
        : { heartbeatMs: options.heartbeatMs }),
      ...(options.openTimeoutMs === undefined
        ? {}
        : { connectTimeoutMs: options.openTimeoutMs }),
      ...(options.refreshBeforeExpiryMs === undefined
        ? {}
        : { refreshBeforeExpiryMs: options.refreshBeforeExpiryMs }),
    });
    this.#socket.on("event", (event) => {
      const lifecycle = lifecycleEventFrom({
        type: "event",
        event: event.event,
        callId: event.callId,
        payload: event.payload,
        timestamp: event.timestamp,
      });
      if (lifecycle === undefined) return;
      for (const listener of [...this.#lifecycle]) listener(lifecycle);
    });
    this.#socket.on("candidate", ({ callId, candidate, connectionId }) => {
      for (const listener of [...this.#candidates])
        listener(callId, candidate, connectionId);
    });
    this.#socket.on("state", (connected) => {
      for (const listener of [...this.#state]) listener(connected);
    });
    this.#socket.on("error", (error) => this.#emitError(error));
  }

  /** True while an authenticated socket is open. */
  get connected(): boolean {
    return this.#socket?.connected ?? false;
  }

  /**
   * Open the socket; resolves after the first attempt settles (authenticated,
   * failed, or {@link close} called meanwhile).
   */
  async connect(): Promise<void> {
    if (this.#socket === undefined) {
      // Not a failure that retrying can fix.
      this.#emitError({
        code: "unsupported",
        message: "The signaling client cannot authenticate the calls socket.",
      });
      return;
    }
    await this.#socket.connect();
  }

  /** Close the socket and stop reconnecting. */
  close(): void {
    this.#socket?.close();
  }

  /** Lifecycle source for {@link CallsBackend.subscribe}. */
  subscribe(listener: (event: CallLifecycleEvent) => void): () => void {
    this.#lifecycle.add(listener);
    return () => this.#lifecycle.delete(listener);
  }

  /** Remote ICE candidates pushed by the pod. */
  onCandidate(
    listener: (
      callId: string,
      candidate: TrickleCandidate,
      connectionId?: string,
    ) => void,
  ): () => void {
    this.#candidates.add(listener);
    return () => this.#candidates.delete(listener);
  }

  /** Authenticated connection state changes (true = ready). */
  onState(listener: (connected: boolean) => void): () => void {
    this.#state.add(listener);
    return () => this.#state.delete(listener);
  }

  /**
   * Failures worth surfacing: server `error` frames, `ticket_failed`,
   * `connect_timeout`, `unauthorized` (a 4401 close), and `unsupported`.
   * Only `unsupported` stops the socket. For a revoked credential your token
   * credential provider decides: throw from it, or call {@link close}.
   */
  onError(listener: (error: CallsSocketError) => void): () => void {
    this.#errors.add(listener);
    return () => this.#errors.delete(listener);
  }

  /** Send a local ICE candidate; false while the socket is not ready (use REST). */
  sendCandidate(
    callId: string,
    candidate: TrickleCandidate,
    connectionId: string,
  ): boolean {
    return (
      this.#socket?.sendCandidate(callId, connectionId, candidate) ?? false
    );
  }

  #emitError(error: CallsSocketError): void {
    for (const listener of [...this.#errors]) listener(error);
  }
}

function unsupported<T>(method: T | undefined): T {
  if (method === undefined)
    throw new Error(
      "The signaling client cannot authenticate the calls socket.",
    );
  return method;
}

/** Parse one server frame; unknown or malformed frames yield `undefined`. */
export function parseCallsSocketMessage(
  data: unknown,
): CallsSocketServerMessage | undefined {
  return parseLifecycleFrame(data);
}

/**
 * Map a pushed `call.*` event onto the controller's lifecycle vocabulary. The
 * number wins over the public ID. Outgoing offers are the browser's own.
 */
/** The capability flags a payload actually reports, if any. */
function reportedCapabilities(
  value: unknown,
): { readonly video?: boolean; readonly invite?: boolean } | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    return undefined;
  const reported = value as Record<string, unknown>;
  const flags = {
    ...(typeof reported["video"] === "boolean"
      ? { video: reported["video"] }
      : {}),
    ...(typeof reported["invite"] === "boolean"
      ? { invite: reported["invite"] }
      : {}),
  };
  return Object.keys(flags).length === 0 ? undefined : flags;
}

export function lifecycleEventFrom(
  message: Extract<CallsSocketServerMessage, { type: "event" }>,
): CallLifecycleEvent | undefined {
  const payload = (message.payload ?? {}) as Record<string, unknown>;
  switch (message.event) {
    case "call.received": {
      if (payload.direction === "outgoing") return undefined;
      return {
        type: "incomingCall",
        call: {
          callId: message.callId,
          from: peerFrom(payload.from),
          video: payload.hasVideo === true || payload.has_video === true,
          capabilities: capabilitiesFrom(payload.capabilities),
        },
      };
    }
    case "call.accepted": {
      const answeredBy = payload.answeredBy;
      const capabilities = reportedCapabilities(payload.capabilities);
      return {
        type: "accepted",
        callId: message.callId,
        ...(typeof answeredBy === "string" && answeredBy.length > 0
          ? { answeredBy }
          : {}),
        exclusive: payload.exclusive === true,
        // Reported fields only: the controller merges them with what the
        // call already has, so a partial report cannot flip the other flag.
        ...(capabilities === undefined ? {} : { capabilities }),
      };
    }
    case "call.ended": {
      const reason = endReasonFrom(payload.reason);
      return reason === undefined
        ? { type: "ended", callId: message.callId }
        : { type: "ended", callId: message.callId, reason };
    }
    case "call.missed":
      return { type: "ended", callId: message.callId, reason: "missed" };
    case "call.rejected":
      return { type: "ended", callId: message.callId, reason: "rejected" };
    case "call.participant_joined":
    case "call.participant_state": {
      if (payload.callId !== message.callId) return undefined;
      const participant = payload.participant;
      if (!isParticipant(participant)) return undefined;
      return participant.state === "left"
        ? {
            type: "participantLeft",
            callId: message.callId,
            participantId: participant.id,
          }
        : { type: "participant", callId: message.callId, participant };
    }
    case "call.participant_left": {
      if (payload.callId !== message.callId) return undefined;
      const participantId = payload.participantId;
      if (typeof participantId !== "string" || participantId.length === 0)
        return undefined;
      return { type: "participantLeft", callId: message.callId, participantId };
    }
    default:
      return undefined;
  }
}

function peerFrom(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === null || typeof value !== "object") return "";
  const ref = value as {
    readonly phoneNumber?: unknown;
    readonly id?: unknown;
  };
  for (const candidate of [ref.phoneNumber, ref.id])
    if (typeof candidate === "string" && candidate.length > 0) return candidate;
  return "";
}

function endReasonFrom(value: unknown): CallEndReason | undefined {
  if (typeof value !== "string" || value.length === 0) return undefined;
  switch (value) {
    case "user_hangup":
      return "remote_hangup";
    case "setup_timeout":
    case "media_timeout":
      return "ice_timeout";
    case "lost_connection":
      return "connection_failed";
    default:
      return value;
  }
}
