import type { CallsApi, SocketTicket } from "./api.js";
import { Emitter } from "./events.js";
import { parseLifecycleFrame, type LifecycleFrame } from "./protocol.js";

/** A `call.*` event as the platform emits it, before the client shapes it. */
export interface LifecycleEvent {
  readonly event: string;
  readonly callId: string;
  readonly payload: Record<string, unknown>;
  readonly timestamp: string;
}

export interface LifecycleSocketOptions {
  readonly api: Pick<CallsApi, "socketTicket">;
  readonly session: string;
  readonly WebSocket?: typeof globalThis.WebSocket;
  readonly setTimeout?: typeof globalThis.setTimeout;
  readonly clearTimeout?: typeof globalThis.clearTimeout;
  readonly setInterval?: typeof globalThis.setInterval;
  readonly clearInterval?: typeof globalThis.clearInterval;
  readonly random?: () => number;
  /** Reconnect backoff bounds; defaults 1 000 → 30 000 ms. */
  readonly minBackoffMs?: number;
  readonly maxBackoffMs?: number;
  /** Heartbeat period; 0 disables. Default 15 000 ms. */
  readonly heartbeatMs?: number;
  /** Bound on one attempt's WebSocket open; 0 disables. Default 10 000 ms. */
  readonly connectTimeoutMs?: number;
  /**
   * Where a listener exception raised at an asynchronous boundary (a `state`
   * or `error` listener throwing after a ticket request settled) is reported.
   * Emissions inside WebSocket handlers propagate to the platform's event
   * dispatch like any listener bug; this covers the emissions that have no
   * synchronous caller. Defaults to the platform's `reportError`, else a
   * microtask rethrow — an uncaught error either way, never a swallowed one.
   */
  readonly reportError?: (cause: unknown) => void;
}

type Events = {
  event: [LifecycleEvent];
  state: [connected: boolean];
  error: [{ code: string; message: string }];
};

/**
 * The client's one lifecycle socket. Mints a fresh single-use ticket for every
 * attempt, reconnects with capped backoff until {@link close}, and heartbeats
 * so a half-open connection is dropped rather than silently swallowing events.
 */
export class LifecycleSocket extends Emitter<Events> {
  readonly #o: LifecycleSocketOptions;
  readonly #WS: typeof globalThis.WebSocket;
  #socket: WebSocket | undefined;
  #closed = true;
  #attempt = 0;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #beat: ReturnType<typeof setInterval> | undefined;
  #awaitingPong = false;
  #generation = 0;
  #settle: (() => void) | undefined;
  #abort: AbortController | undefined;
  /** Bounds the current attempt's WebSocket open; cleared on open, close, or close(). */
  #openTimer: ReturnType<typeof setTimeout> | undefined;

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

  get connected(): boolean {
    return (
      this.#socket !== undefined && this.#socket.readyState === this.#WS.OPEN
    );
  }

  /** Resolves once the first attempt settles: open, failed (a retry is scheduled), or closed. */
  async connect(): Promise<void> {
    this.#closed = false;
    if (this.#timer !== undefined) {
      (this.#o.clearTimeout ?? clearTimeout)(this.#timer);
      this.#timer = undefined;
    }
    await this.#open();
  }

  close(): void {
    this.#closed = true;
    this.#stopHeartbeat();
    // An armed open timer keeps a Node process alive for up to connectTimeoutMs.
    this.#clearOpenTimer();
    if (this.#timer !== undefined) {
      (this.#o.clearTimeout ?? clearTimeout)(this.#timer);
      this.#timer = undefined;
    }
    const socket = this.#socket;
    this.#socket = undefined;
    try {
      if (socket !== undefined) {
        socket.onopen =
          socket.onmessage =
          socket.onclose =
          socket.onerror =
            null;
        try {
          socket.close();
        } catch {
          // already closed
        }
        this.emit("state", false);
      }
    } finally {
      // A throwing state listener must not leave a pending connect() hanging,
      // the ticket request in flight, or the generation stale (which would let
      // a late #openOnce install a socket after close()).
      this.#generation += 1;
      this.#abort?.abort();
      this.#abort = undefined;
      this.#settle?.();
    }
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
      // #openOnce settles the attempt itself; what can still reject here is a
      // listener throwing on an emission with no synchronous caller. Report it
      // as an uncaught error instead of an unhandled rejection of a voided
      // promise.
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
      // A reporter that itself throws would reject the .catch() chain in
      // #open() with nothing left to handle it; fall back to the rethrow.
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
    let ticket: SocketTicket;
    try {
      ticket = await this.#o.api.socketTicket(this.#o.session, signal);
    } catch (cause) {
      // close() aborts an in-flight ticket request; that is not a failure the
      // consumer should hear about after asking for the socket to close.
      try {
        if (!signal.aborted && !this.#closed)
          this.emit("error", {
            code: "ticket_failed",
            message:
              cause instanceof Error
                ? cause.message
                : "Could not mint a lifecycle ticket.",
          });
      } finally {
        settle();
        if (!signal.aborted && !this.#closed) this.#scheduleReconnect();
      }
      return;
    }
    if (this.#closed || signal.aborted || generation !== this.#generation) {
      settle();
      return;
    }
    let socket: WebSocket;
    try {
      socket = new this.#WS(ticket.url);
    } catch {
      settle();
      if (!signal.aborted && !this.#closed && generation === this.#generation)
        this.#scheduleReconnect();
      return;
    }
    this.#socket = socket;
    // A socket stuck CONNECTING fires neither onopen nor onclose, and the
    // heartbeat only starts after onopen — without this bound the attempt
    // never settles and no reconnect is ever scheduled.
    const timeoutMs = this.#o.connectTimeoutMs ?? 10_000;
    this.#clearOpenTimer();
    this.#openTimer =
      timeoutMs > 0
        ? (this.#o.setTimeout ?? setTimeout)(() => {
            this.#openTimer = undefined;
            if (this.#socket !== socket) return;
            this.#socket = undefined;
            socket.onopen =
              socket.onmessage =
              socket.onclose =
              socket.onerror =
                null;
            try {
              socket.close();
            } catch {
              // never opened
            }
            try {
              this.emit("error", {
                code: "connect_timeout",
                message: "The lifecycle socket did not open in time.",
              });
            } finally {
              settle();
              this.#scheduleReconnect();
            }
          }, timeoutMs)
        : undefined;
    const clearOpenTimer = () => this.#clearOpenTimer();
    socket.onopen = () => {
      clearOpenTimer();
      this.#attempt = 0;
      this.#startHeartbeat(socket);
      // A throwing listener must not leave connect() pending: settle in
      // finally and let the exception surface to whoever registered it.
      try {
        this.emit("state", true);
      } finally {
        settle();
      }
    };
    socket.onmessage = (event) => {
      const frame = parseLifecycleFrame((event as MessageEvent).data);
      if (frame !== undefined) this.#receive(frame);
    };
    socket.onerror = () => undefined;
    socket.onclose = () => {
      clearOpenTimer();
      this.#stopHeartbeat();
      if (this.#socket === socket) this.#socket = undefined;
      try {
        this.emit("state", false);
      } finally {
        settle();
        this.#scheduleReconnect();
      }
    };
  }

  #receive(frame: LifecycleFrame): void {
    if (frame.type === "pong") {
      this.#awaitingPong = false;
      return;
    }
    if (frame.type === "error") {
      this.emit("error", { code: frame.code, message: frame.message });
      return;
    }
    if (frame.type !== "event") return;
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
  }

  #scheduleReconnect(): void {
    if (this.#closed || this.#timer !== undefined) return;
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
        // Half-open: still OPEN on paper, never answering. Drop it so the close
        // path reconnects instead of silently losing every event.
        this.#stopHeartbeat();
        this.#socket = undefined;
        socket.onopen =
          socket.onmessage =
          socket.onclose =
          socket.onerror =
            null;
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
      if (socket.readyState === this.#WS.OPEN) {
        socket.send(JSON.stringify({ type: "ping" }));
        this.#awaitingPong = true;
      }
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
