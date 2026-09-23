import type { CallsApi } from "./api.js";
import { CallsAuthError, CallsError } from "./errors.js";
import { Emitter } from "./events.js";
import {
  parseLifecycleFrame,
  type LifecycleClientFrame,
  type LifecycleFrame,
  type TrickleCandidate,
} from "./protocol.js";

/** A `call.*` event as the platform emits it, before the client shapes it. */
export interface LifecycleEvent {
  readonly event: string;
  readonly callId: string;
  readonly payload: Record<string, unknown>;
  readonly timestamp: string;
}

export interface LifecycleCandidate {
  readonly callId: string;
  readonly connectionId?: string;
  readonly candidate: TrickleCandidate;
}

export interface LifecycleReady {
  readonly session?: string;
  /** Participant reference of the authenticated credential, when the platform sends it. */
  readonly participant?: string;
}

export interface LifecycleSocketOptions {
  readonly api: Pick<CallsApi, "socketTicket" | "socketUrl">;
  /**
   * Session to follow. Server credentials send it when minting a ticket;
   * client tokens are bound to one session.
   */
  readonly session?: string;
  /**
   * Participant name used by other Calls operations. Ticket issuance binds
   * only the session; the current socket route does not accept a participant.
   */
  readonly participant?: string;
  readonly WebSocket?: typeof globalThis.WebSocket;
  readonly setTimeout?: typeof globalThis.setTimeout;
  readonly clearTimeout?: typeof globalThis.clearTimeout;
  readonly setInterval?: typeof globalThis.setInterval;
  readonly clearInterval?: typeof globalThis.clearInterval;
  readonly random?: () => number;
  /** Deprecated: retained for callers that supply a clock. */
  readonly now?: () => number;
  /** Reconnect backoff bounds; defaults 1 000 → 30 000 ms. */
  readonly minBackoffMs?: number;
  readonly maxBackoffMs?: number;
  /** Heartbeat period; 0 disables. Default 15 000 ms. */
  readonly heartbeatMs?: number;
  /**
   * Bound on one attempt, from construction until the platform's `ready`
   * frame. 0 disables. Default 10 000 ms.
   */
  readonly connectTimeoutMs?: number;
  /**
   * Deprecated: tickets are single-use; reconnect mints a new one.
   */
  readonly refreshBeforeExpiryMs?: number;
  /**
   * Where a listener exception raised at an asynchronous boundary (a `state`
   * or `error` listener throwing after a ticket request settled) is reported.
   * Defaults to the platform's `reportError`, else a microtask rethrow.
   */
  readonly reportError?: (cause: unknown) => void;
}

type Events = {
  event: [LifecycleEvent];
  candidate: [LifecycleCandidate];
  ready: [LifecycleReady];
  /** True once authenticated (`ready`), false when that socket goes away. */
  state: [connected: boolean];
  error: [CallsError];
};

/** Close codes the platform uses on the lifecycle and media sockets. */
export const SocketCloseCode = {
  /** The credential does not (or no longer) authorize the socket. */
  Unauthorized: 4401,
  /** Call or session state refused the socket (for example a claimed call). */
  Conflict: 4409,
  /** Too many attempts. */
  RateLimited: 4429,
  /** The request is invalid (for example an unknown session or participant). */
  InvalidRequest: 4400,
  /** A policy violation, including an invalid client frame. */
  PolicyViolation: 1008,
  /** Authorization or the call is temporarily unavailable. */
  TryAgainLater: 1013,
} as const;

/**
 * The client's one lifecycle socket. Every attempt mints a fresh single-use
 * ticket, waits for `ready`, reconnects with capped backoff until {@link close},
 * and heartbeats so a half-open connection is dropped.
 */
export class LifecycleSocket extends Emitter<Events> {
  readonly #o: LifecycleSocketOptions;
  readonly #WS: typeof globalThis.WebSocket;
  #socket: WebSocket | undefined;
  #authenticated = false;
  #closed = true;
  #attempt = 0;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #beat: ReturnType<typeof setInterval> | undefined;
  #awaitingPong = false;
  #generation = 0;
  #settle: (() => void) | undefined;
  #abort: AbortController | undefined;
  #openTimer: ReturnType<typeof setTimeout> | undefined;
  /** Set by a 4400 close: retrying the same request cannot succeed. */
  #refused = false;
  #participant: string | undefined;

  constructor(options: LifecycleSocketOptions) {
    super();
    this.#o = options;
    const WS = options.WebSocket ?? globalThis.WebSocket;
    if (WS === undefined)
      throw new Error(
        "No WebSocket implementation: pass `WebSocket` (Node < 22) or run on Node 22+.",
      );
    this.#WS = WS;
  }

  /** True while an authenticated socket is open. */
  get connected(): boolean {
    return (
      this.#authenticated &&
      this.#socket !== undefined &&
      this.#socket.readyState === this.#WS.OPEN
    );
  }

  /** Participant reference from the last `ready` frame, when the platform sent one. */
  get participant(): string | undefined {
    return this.#participant;
  }

  /**
   * Resolves once the first attempt settles: authenticated, failed (a retry
   * is scheduled), or closed.
   */
  async connect(): Promise<void> {
    this.#closed = false;
    this.#refused = false;
    if (this.#timer !== undefined) {
      (this.#o.clearTimeout ?? clearTimeout)(this.#timer);
      this.#timer = undefined;
    }
    await this.#open();
  }

  /** Send a local ICE candidate; false while no authenticated socket is open. */
  sendCandidate(
    callId: string,
    connectionId: string,
    candidate: TrickleCandidate,
  ): boolean {
    return this.#send({ type: "candidate", callId, connectionId, candidate });
  }

  close(): void {
    this.#closed = true;
    this.#stopHeartbeat();
    this.#clearOpenTimer();
    if (this.#timer !== undefined) {
      (this.#o.clearTimeout ?? clearTimeout)(this.#timer);
      this.#timer = undefined;
    }
    const socket = this.#socket;
    const wasAuthenticated = this.#authenticated;
    this.#socket = undefined;
    this.#authenticated = false;
    try {
      if (socket !== undefined) {
        detach(socket);
        try {
          socket.close();
        } catch {
          // already closed
        }
        if (wasAuthenticated) this.emit("state", false);
      }
    } finally {
      // A throwing state listener must not leave a pending connect() hanging,
      // the ticket request in flight, or the generation stale.
      this.#generation += 1;
      this.#abort?.abort();
      this.#abort = undefined;
      this.#settle?.();
    }
  }

  #send(frame: LifecycleClientFrame): boolean {
    const socket = this.#socket;
    if (!this.#authenticated) return false;
    if (socket === undefined || socket.readyState !== this.#WS.OPEN)
      return false;
    socket.send(JSON.stringify(frame));
    return true;
  }

  #open(): Promise<void> {
    if (this.#socket !== undefined || this.#abort !== undefined)
      return Promise.resolve();
    return new Promise<void>((resolve) => {
      const generation = this.#generation;
      const abort = new AbortController();
      this.#abort = abort;
      let settled = false;
      const settle = () => {
        if (settled) return;
        settled = true;
        if (this.#settle === settle) this.#settle = undefined;
        if (this.#abort === abort) this.#abort = undefined;
        resolve();
      };
      this.#settle = settle;
      this.#openOnce(generation, abort.signal, settle).catch((cause: unknown) =>
        this.#report(cause),
      );
    });
  }

  #report(cause: unknown): void {
    const report =
      this.#o.reportError ??
      (globalThis as { reportError?: (cause: unknown) => void }).reportError;
    if (report !== undefined) {
      try {
        report(cause);
        return;
      } catch {
        // fall through
      }
    }
    queueMicrotask(() => {
      throw cause;
    });
  }

  async #openOnce(
    generation: number,
    signal: AbortSignal,
    settle: () => void,
  ): Promise<void> {
    let socket: WebSocket;
    try {
      const ticket = await this.#o.api.socketTicket(this.#o.session, signal);
      if (this.#closed || signal.aborted || generation !== this.#generation) {
        settle();
        return;
      }
      socket = new this.#WS(this.#o.api.socketUrl(ticket.url));
    } catch (cause) {
      try {
        if (!signal.aborted && !this.#closed && generation === this.#generation)
          this.emit(
            "error",
            new CallsError(
              "ticket_failed",
              cause instanceof Error
                ? cause.message
                : "Could not mint a lifecycle ticket.",
              { cause },
            ),
          );
      } finally {
        settle();
        if (!signal.aborted && !this.#closed && generation === this.#generation)
          this.#scheduleReconnect();
      }
      return;
    }
    this.#socket = socket;
    this.#authenticated = false;
    // A socket stuck CONNECTING, or one that never answers with ready,
    // would otherwise hold the attempt forever.
    const timeoutMs = this.#o.connectTimeoutMs ?? 10_000;
    this.#clearOpenTimer();
    this.#openTimer =
      timeoutMs > 0
        ? (this.#o.setTimeout ?? setTimeout)(() => {
            this.#openTimer = undefined;
            if (this.#socket !== socket) return;
            this.#socket = undefined;
            detach(socket);
            try {
              socket.close();
            } catch {
              // never opened
            }
            try {
              this.emit(
                "error",
                new CallsError(
                  "connect_timeout",
                  "The lifecycle socket did not authenticate in time.",
                ),
              );
            } finally {
              settle();
              this.#scheduleReconnect();
            }
          }, timeoutMs)
        : undefined;
    let opened = false;
    socket.onopen = () => {
      opened = true;
      // The ticket was authenticated during the WebSocket upgrade.
    };
    socket.onmessage = (event) => {
      if (this.#socket !== socket) return;
      const frame = parseLifecycleFrame((event as MessageEvent).data);
      if (frame === undefined) return;
      if (!this.#authenticated) {
        if (frame.type === "ready") {
          this.#clearOpenTimer();
          this.#authenticated = true;
          this.#attempt = 0;
          this.#participant = frame.participant ?? this.#participant;
          this.#startHeartbeat(socket);
          try {
            this.emit("ready", {
              ...(frame.session === undefined
                ? {}
                : { session: frame.session }),
              ...(frame.participant === undefined
                ? {}
                : { participant: frame.participant }),
            });
            this.emit("state", true);
          } finally {
            settle();
          }
        } else if (frame.type === "error") {
          this.emit("error", new CallsError(frame.code, frame.message));
        }
        return;
      }
      this.#receive(frame);
    };
    // Node 22's WebSocket reports a failed handshake (refused, reset, or a
    // non-101 reply) with an error event and never fires close, so treat an
    // error before open as the close that other runtimes deliver.
    socket.onerror = () => {
      if (opened || this.#socket !== socket) return;
      const onclose = socket.onclose;
      detach(socket);
      try {
        socket.close();
      } catch {
        // never opened
      }
      onclose?.call(socket, { code: 1006 } as CloseEvent);
    };
    socket.onclose = (event) => {
      this.#clearOpenTimer();
      this.#stopHeartbeat();
      if (this.#socket !== socket) return;
      const wasAuthenticated = this.#authenticated;
      this.#socket = undefined;
      this.#authenticated = false;
      const code = (event as CloseEvent | undefined)?.code;
      try {
        const error = closeError(code);
        if (code === SocketCloseCode.InvalidRequest) this.#refused = true;
        if (error !== undefined) this.emit("error", error);
        if (wasAuthenticated) this.emit("state", false);
      } finally {
        settle();
        this.#scheduleReconnect();
      }
    };
  }

  #receive(frame: LifecycleFrame): void {
    switch (frame.type) {
      case "pong":
        this.#awaitingPong = false;
        return;
      case "error":
        this.emit("error", new CallsError(frame.code, frame.message));
        return;
      case "candidate":
        this.emit("candidate", {
          callId: frame.callId,
          ...(frame.connectionId === undefined
            ? {}
            : { connectionId: frame.connectionId }),
          candidate: frame.candidate,
        });
        return;
      case "event": {
        const payload =
          frame.payload !== null && typeof frame.payload === "object"
            ? (frame.payload as Record<string, unknown>)
            : {};
        this.emit("event", {
          event: frame.event,
          callId: frame.callId,
          payload,
          timestamp: frame.timestamp,
        });
        return;
      }
      default:
        return;
    }
  }

  #scheduleReconnect(): void {
    if (this.#closed || this.#refused || this.#timer !== undefined) return;
    const min = this.#o.minBackoffMs ?? 1_000;
    const max = this.#o.maxBackoffMs ?? 30_000;
    const random = this.#o.random ?? Math.random;
    const delay =
      Math.min(max, min * 2 ** this.#attempt) * (0.5 + random() / 2);
    this.#attempt = Math.min(this.#attempt + 1, 10);
    this.#timer = (this.#o.setTimeout ?? setTimeout)(() => {
      this.#timer = undefined;
      void this.#open();
    }, delay);
  }

  #startHeartbeat(socket: WebSocket): void {
    this.#stopHeartbeat();
    const every = this.#o.heartbeatMs ?? 15_000;
    if (every <= 0) return;
    this.#beat = (this.#o.setInterval ?? setInterval)(() => {
      if (this.#socket !== socket) return;
      if (this.#awaitingPong) {
        // Half-open: still OPEN on paper, never answering. Drop it so the
        // close path reconnects instead of silently losing every event.
        this.#stopHeartbeat();
        this.#socket = undefined;
        this.#authenticated = false;
        detach(socket);
        try {
          socket.close();
        } catch {
          // already gone
        }
        try {
          this.emit("state", false);
        } finally {
          this.#scheduleReconnect();
        }
        return;
      }
      this.#awaitingPong = this.#send({ type: "ping" });
    }, every);
  }

  #clearOpenTimer(): void {
    if (this.#openTimer !== undefined) {
      (this.#o.clearTimeout ?? clearTimeout)(this.#openTimer);
      this.#openTimer = undefined;
    }
  }

  #stopHeartbeat(): void {
    if (this.#beat !== undefined) {
      (this.#o.clearInterval ?? clearInterval)(this.#beat);
      this.#beat = undefined;
    }
    this.#awaitingPong = false;
  }
}

function detach(socket: WebSocket): void {
  socket.onopen = socket.onmessage = socket.onclose = socket.onerror = null;
}

function closeError(code: number | undefined): CallsError | undefined {
  switch (code) {
    case SocketCloseCode.Unauthorized:
      return new CallsAuthError();
    case SocketCloseCode.Conflict:
      return new CallsError(
        "socket_conflict",
        "The platform refused the socket for the current session state.",
      );
    case SocketCloseCode.RateLimited:
      return new CallsError(
        "rate_limited",
        "Too many socket attempts; reconnecting with backoff.",
      );
    case SocketCloseCode.InvalidRequest:
      return new CallsError(
        "invalid_request",
        "The platform refused the socket request; check the session and participant. Reconnection stopped.",
      );
    default:
      return undefined;
  }
}
