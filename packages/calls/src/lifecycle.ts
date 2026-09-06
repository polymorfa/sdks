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
    if (this.#timer !== undefined) {
      (this.#o.clearTimeout ?? clearTimeout)(this.#timer);
      this.#timer = undefined;
    }
    const socket = this.#socket;
    this.#socket = undefined;
    if (socket !== undefined) {
      socket.onopen = socket.onmessage = socket.onclose = socket.onerror = null;
      try {
        socket.close();
      } catch {
        // already closed
      }
      this.emit("state", false);
    }
    this.#generation += 1;
    this.#abort?.abort();
    this.#abort = undefined;
    this.#settle?.();
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
      void this.#openOnce(generation, abort.signal, settle);
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
      this.emit("error", {
        code: "ticket_failed",
        message:
          cause instanceof Error
            ? cause.message
            : "Could not mint a lifecycle ticket.",
      });
      settle();
      if (!signal.aborted && !this.#closed) this.#scheduleReconnect();
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
    socket.onopen = () => {
      this.#attempt = 0;
      this.#startHeartbeat(socket);
      this.emit("state", true);
      settle();
    };
    socket.onmessage = (event) => {
      const frame = parseLifecycleFrame((event as MessageEvent).data);
      if (frame !== undefined) this.#receive(frame);
    };
    socket.onerror = () => undefined;
    socket.onclose = () => {
      this.#stopHeartbeat();
      if (this.#socket === socket) this.#socket = undefined;
      this.emit("state", false);
      settle();
      this.#scheduleReconnect();
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
        this.emit("state", false);
        this.#scheduleReconnect();
        return;
      }
      if (socket.readyState === this.#WS.OPEN) {
        socket.send(JSON.stringify({ type: "ping" }));
        this.#awaitingPong = true;
      }
    }, every);
  }

  #stopHeartbeat(): void {
    if (this.#beat !== undefined) {
      (this.#o.clearInterval ?? clearInterval)(this.#beat);
      this.#beat = undefined;
    }
    this.#awaitingPong = false;
  }
}
