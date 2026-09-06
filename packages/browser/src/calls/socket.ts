import type {
  CallEndReason,
  CallLifecycleEvent,
  CallLine,
} from "./controller.js";
import type { CallsSignaling, TrickleCandidate } from "./signaling.js";

/** Server → browser frames on the calls WebSocket. */
export type CallsSocketServerMessage =
  | { readonly type: "ready"; readonly session: string }
  | {
      readonly type: "event";
      readonly event: string;
      readonly callId: string;
      readonly payload: unknown;
      readonly timestamp: string;
    }
  | {
      readonly type: "candidate";
      readonly callId: string;
      readonly candidate: TrickleCandidate;
    }
  | { readonly type: "error"; readonly code: string; readonly message: string }
  | { readonly type: "pong" };

/** A server-sent `error` frame, delivered to {@link CallsSocket.onError}. */
export interface CallsSocketError {
  readonly code: string;
  readonly message: string;
}

/** Browser → server frames on the calls WebSocket. */
export type CallsSocketClientMessage =
  | {
      readonly type: "candidate";
      readonly callId: string;
      readonly candidate: TrickleCandidate;
    }
  | { readonly type: "teardown"; readonly callId: string }
  | { readonly type: "ping" };

export interface CallsSocketOptions {
  /** Signaling client able to mint socket tickets. */
  readonly signaling: Pick<CallsSignaling, "socketTicket" | "socketUrl">;
  /** Session to follow when the credential is a server key. */
  readonly session?: string;
  /**
   * Calling line the session's inbound calls arrive on. Defaults to
   * `linkedDevice`; set `cloudApi` for a Business Calling API session, or the
   * controller would offer video controls on an audio-only line.
   */
  readonly line?: CallLine;
  /** Reconnect backoff bounds in milliseconds. Defaults 1 000 → 30 000. */
  readonly minBackoffMs?: number;
  readonly maxBackoffMs?: number;
  /**
   * Heartbeat period in milliseconds; 0 disables it. Defaults to 15 000. A
   * `ping` goes out each period and the socket is dropped when the previous
   * one was never answered, so a half-open connection is detected within two
   * periods rather than never.
   */
  readonly heartbeatMs?: number;
  /**
   * Handshake deadline in milliseconds; 0 disables it. Defaults to 10 000.
   * The WebSocket API has no handshake timeout of its own, so a stalled
   * upgrade would otherwise leave `connect()` pending — and, because the
   * attempt holds the socket slot, suppress reconnects — for as long as the
   * browser cares to wait. The heartbeat cannot see this: it starts on open.
   */
  readonly openTimeoutMs?: number;
  readonly WebSocket?: typeof globalThis.WebSocket;
  readonly setTimeout?: typeof globalThis.setTimeout;
  readonly clearTimeout?: typeof globalThis.clearTimeout;
  readonly setInterval?: typeof globalThis.setInterval;
  readonly clearInterval?: typeof globalThis.clearInterval;
  readonly random?: () => number;
}

/**
 * The calls WebSocket: one socket per client, opened with a single-use ticket
 * from `POST /api/voip/ws-ticket`. It pushes the session's `call.*` lifecycle
 * events (so an incoming call rings without any webhook plumbing), delivers
 * the pod's ICE candidates, and carries the browser's candidates and
 * teardown. It reconnects with capped exponential backoff — a fresh ticket
 * each time — until {@link close}. It is a {@link CallsBackend} lifecycle
 * source: pass it as the backend's `incoming`.
 */
export class CallsSocket {
  readonly #options: CallsSocketOptions;
  readonly #WebSocket: typeof globalThis.WebSocket;
  readonly #setTimeout: typeof globalThis.setTimeout;
  readonly #clearTimeout: typeof globalThis.clearTimeout;
  readonly #setInterval: typeof globalThis.setInterval;
  readonly #clearInterval: typeof globalThis.clearInterval;
  readonly #random: () => number;
  readonly #lifecycle = new Set<(event: CallLifecycleEvent) => void>();
  readonly #candidates = new Set<
    (callId: string, candidate: TrickleCandidate) => void
  >();
  readonly #state = new Set<(connected: boolean) => void>();
  readonly #errors = new Set<(error: CallsSocketError) => void>();
  #socket: WebSocket | undefined;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #attempt = 0;
  #closed = true;
  /** Settles the promise of an in-flight `connect()`; cleared once it fires. */
  #settle: (() => void) | undefined;
  /** Aborts the in-flight ticket request when `close()` interrupts an attempt. */
  #attemptAbort: AbortController | undefined;
  /** Bumped by `close()` so a stale ticket completion never opens a socket. */
  #generation = 0;
  #heartbeatTimer: ReturnType<typeof setInterval> | undefined;
  /** Handshake deadline for the socket currently opening. */
  #openTimer: ReturnType<typeof setTimeout> | undefined;
  /** True between sending a `ping` and receiving the matching `pong`. */
  #awaitingPong = false;

  constructor(options: CallsSocketOptions) {
    this.#options = options;
    this.#WebSocket = options.WebSocket ?? globalThis.WebSocket;
    this.#setTimeout =
      options.setTimeout ?? globalThis.setTimeout.bind(globalThis);
    this.#clearTimeout =
      options.clearTimeout ?? globalThis.clearTimeout.bind(globalThis);
    this.#setInterval =
      options.setInterval ?? globalThis.setInterval.bind(globalThis);
    this.#clearInterval =
      options.clearInterval ?? globalThis.clearInterval.bind(globalThis);
    this.#random = options.random ?? Math.random;
  }

  /** True while the socket is open. */
  get connected(): boolean {
    return (
      this.#socket !== undefined &&
      this.#socket.readyState === this.#WebSocket.OPEN
    );
  }

  /**
   * Open the socket; resolves after the first attempt settles (open, failed,
   * or {@link close} called meanwhile). Calling it while a socket exists or
   * an attempt is in flight is a no-op.
   */
  async connect(): Promise<void> {
    this.#closed = false;
    if (this.#timer !== undefined) {
      // A reconnect is scheduled; run it now instead of waiting.
      this.#clearTimeout(this.#timer);
      this.#timer = undefined;
    }
    await this.#open();
  }

  /** Close the socket and stop reconnecting. */
  close(): void {
    this.#closed = true;
    this.#stopHeartbeat();
    this.#clearOpenTimer();
    if (this.#timer !== undefined) {
      this.#clearTimeout(this.#timer);
      this.#timer = undefined;
    }
    const socket = this.#socket;
    this.#socket = undefined;
    if (socket !== undefined) {
      socket.onopen = null;
      socket.onmessage = null;
      socket.onclose = null;
      socket.onerror = null;
      try {
        socket.close();
      } catch {
        // already closed
      }
      this.#emitState(false);
    }
    // A connect() awaiting this attempt must not hang on teardown: settle it
    // and abort a ticket request still in flight. Any completion that slips
    // through belongs to an old generation and is ignored.
    this.#generation += 1;
    this.#attemptAbort?.abort();
    this.#attemptAbort = undefined;
    this.#settle?.();
  }

  /** Lifecycle source for {@link CallsBackend.subscribe}. */
  subscribe(listener: (event: CallLifecycleEvent) => void): () => void {
    this.#lifecycle.add(listener);
    return () => this.#lifecycle.delete(listener);
  }

  /** Remote ICE candidates pushed by the pod. */
  onCandidate(
    listener: (callId: string, candidate: TrickleCandidate) => void,
  ): () => void {
    this.#candidates.add(listener);
    return () => this.#candidates.delete(listener);
  }

  /** Connection state changes (true = open). */
  onState(listener: (connected: boolean) => void): () => void {
    this.#state.add(listener);
    return () => this.#state.delete(listener);
  }

  /**
   * Failures worth surfacing: server-sent `error` frames, a ticket request
   * that failed (`ticket_failed`), and a signaling client that cannot mint
   * tickets at all (`unsupported`).
   *
   * Only `unsupported` stops the socket, because retrying it can never
   * succeed. The rest keep reconnecting, so a consumer that recognises a
   * permanent failure — a revoked credential, a session it may not follow —
   * should call {@link close} rather than let the backoff retry it forever.
   */
  onError(listener: (error: CallsSocketError) => void): () => void {
    this.#errors.add(listener);
    return () => this.#errors.delete(listener);
  }

  /** Send a local ICE candidate; false when the socket is down (use REST). */
  sendCandidate(callId: string, candidate: TrickleCandidate): boolean {
    return this.#send({ type: "candidate", callId, candidate });
  }

  /** Ask the pod to release a call; false when the socket is down. */
  sendTeardown(callId: string): boolean {
    return this.#send({ type: "teardown", callId });
  }

  #send(message: CallsSocketClientMessage): boolean {
    const socket = this.#socket;
    if (socket === undefined || socket.readyState !== this.#WebSocket.OPEN)
      return false;
    socket.send(JSON.stringify(message));
    return true;
  }

  async #open(): Promise<void> {
    if (
      this.#closed ||
      this.#attemptAbort !== undefined ||
      this.#socket !== undefined
    )
      return;
    // The whole attempt — ticket request included — is tracked from here so
    // close() can settle the caller and abort the request at any point.
    const generation = this.#generation;
    const abort = new AbortController();
    this.#attemptAbort = abort;
    await new Promise<void>((resolve) => {
      let settled = false;
      const settle = () => {
        if (settled) return;
        settled = true;
        if (this.#settle === settle) this.#settle = undefined;
        if (this.#attemptAbort === abort) this.#attemptAbort = undefined;
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
    let url: string;
    try {
      if (
        this.#options.signaling.socketTicket === undefined ||
        this.#options.signaling.socketUrl === undefined
      ) {
        // Not a failure that retrying can fix: this signaling client will
        // never mint a ticket. Report it and stop, rather than back off
        // against it for the lifetime of the page.
        this.#emitError({
          code: "unsupported",
          message: "The signaling client cannot mint socket tickets.",
        });
        settle();
        return;
      }
      const ticket = await this.#options.signaling.socketTicket(
        this.#options.session,
        signal,
      );
      url = this.#options.signaling.socketUrl(ticket);
    } catch (cause) {
      // An ordinary ticket request can fail transiently, so this keeps
      // reconnecting — but it no longer does so silently.
      this.#emitError({
        code: "ticket_failed",
        message:
          cause instanceof Error ? cause.message : "Could not mint a ticket.",
      });
      settle();
      if (!signal.aborted && !this.#closed) this.#scheduleReconnect();
      return;
    }
    // Closed (or closed and reopened) while the ticket was in flight: this
    // completion is stale and must not create a socket.
    if (this.#closed || signal.aborted || generation !== this.#generation) {
      settle();
      return;
    }
    let socket: WebSocket;
    try {
      socket = new this.#WebSocket(url);
    } catch {
      // A constructor that throws (a rejected URL, a blocked mixed-content
      // upgrade) would otherwise leave `connect()` pending forever, and the
      // still-set attempt would make every later `connect()` return it.
      settle();
      if (!signal.aborted && !this.#closed && generation === this.#generation)
        this.#scheduleReconnect();
      return;
    }
    this.#socket = socket;
    this.#startOpenTimer(socket, settle);
    socket.onopen = () => {
      this.#clearOpenTimer();
      this.#attempt = 0;
      this.#startHeartbeat(socket);
      this.#emitState(true);
      settle();
    };
    socket.onmessage = (event) => {
      const message = parseCallsSocketMessage(event.data);
      if (message !== undefined) this.#receive(message);
    };
    socket.onerror = () => undefined;
    socket.onclose = () => {
      this.#clearOpenTimer();
      this.#stopHeartbeat();
      if (this.#socket === socket) this.#socket = undefined;
      this.#emitState(false);
      settle();
      this.#scheduleReconnect();
    };
  }

  #scheduleReconnect(): void {
    if (this.#closed || this.#timer !== undefined) return;
    const min = this.#options.minBackoffMs ?? 1_000;
    const max = this.#options.maxBackoffMs ?? 30_000;
    const delay =
      Math.min(max, min * 2 ** this.#attempt) * (0.5 + this.#random() / 2);
    this.#attempt = Math.min(this.#attempt + 1, 10);
    this.#timer = this.#setTimeout(() => {
      this.#timer = undefined;
      void this.#open();
    }, delay);
  }

  #receive(message: CallsSocketServerMessage): void {
    if (message.type === "pong") {
      this.#awaitingPong = false;
      return;
    }
    if (message.type === "error") {
      this.#emitError({ code: message.code, message: message.message });
      return;
    }
    if (message.type === "candidate") {
      for (const listener of [...this.#candidates])
        listener(message.callId, message.candidate);
      return;
    }
    if (message.type !== "event") return;
    const lifecycle = lifecycleEventFrom(message, this.#options.line);
    if (lifecycle === undefined) return;
    for (const listener of [...this.#lifecycle]) listener(lifecycle);
  }

  /**
   * A silently dead connection still reports OPEN, so `sendCandidate` keeps
   * claiming success and the media factory keeps REST polling disabled: ICE
   * stops flowing both ways with nothing to notice it. Pinging turns that into
   * an ordinary close, which reconnects.
   */
  #startHeartbeat(socket: WebSocket): void {
    this.#stopHeartbeat();
    const every = this.#options.heartbeatMs ?? 15_000;
    if (every <= 0) return;
    this.#heartbeatTimer = this.#setInterval(() => {
      if (this.#socket !== socket) return;
      if (this.#awaitingPong) {
        this.#dropSocket(socket);
        return;
      }
      this.#awaitingPong = this.#send({ type: "ping" });
    }, every);
  }

  /**
   * Bound the handshake: a socket still not open when the deadline fires is
   * dropped like a dead one, which settles the pending `connect()` and
   * schedules a reconnect with a fresh ticket.
   */
  #startOpenTimer(socket: WebSocket, settle: () => void): void {
    this.#clearOpenTimer();
    const after = this.#options.openTimeoutMs ?? 10_000;
    if (after <= 0) return;
    this.#openTimer = this.#setTimeout(() => {
      this.#openTimer = undefined;
      if (this.#socket !== socket) return;
      settle();
      this.#dropSocket(socket);
    }, after);
  }

  #clearOpenTimer(): void {
    if (this.#openTimer !== undefined) {
      this.#clearTimeout(this.#openTimer);
      this.#openTimer = undefined;
    }
  }

  #stopHeartbeat(): void {
    if (this.#heartbeatTimer !== undefined) {
      this.#clearInterval(this.#heartbeatTimer);
      this.#heartbeatTimer = undefined;
    }
    this.#awaitingPong = false;
  }

  /**
   * Tear down a socket the heartbeat found dead. `close()` on a half-open
   * connection may never fire `onclose`, so the close path runs here directly,
   * with the handlers detached so it cannot run twice.
   */
  #dropSocket(socket: WebSocket): void {
    this.#clearOpenTimer();
    this.#stopHeartbeat();
    if (this.#socket === socket) this.#socket = undefined;
    socket.onopen = null;
    socket.onmessage = null;
    socket.onclose = null;
    socket.onerror = null;
    try {
      socket.close();
    } catch {
      // already gone
    }
    this.#emitState(false);
    this.#scheduleReconnect();
  }

  #emitError(error: CallsSocketError): void {
    for (const listener of [...this.#errors]) listener(error);
  }

  #emitState(connected: boolean): void {
    for (const listener of [...this.#state]) listener(connected);
  }
}

/** Parse one server frame; unknown or malformed frames yield `undefined`. */
export function parseCallsSocketMessage(
  data: unknown,
): CallsSocketServerMessage | undefined {
  if (typeof data !== "string") return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    return undefined;
  }
  if (parsed === null || typeof parsed !== "object") return undefined;
  const frame = parsed as Record<string, unknown>;
  switch (frame["type"]) {
    case "ready":
      return isString(frame["session"])
        ? (parsed as CallsSocketServerMessage)
        : undefined;
    case "event":
      return isString(frame["event"]) &&
        isString(frame["callId"]) &&
        isString(frame["timestamp"]) &&
        "payload" in frame
        ? (parsed as CallsSocketServerMessage)
        : undefined;
    case "candidate":
      return isString(frame["callId"]) && isCandidate(frame["candidate"])
        ? (parsed as CallsSocketServerMessage)
        : undefined;
    case "error":
      return isString(frame["code"]) && isString(frame["message"])
        ? (parsed as CallsSocketServerMessage)
        : undefined;
    case "pong":
      return parsed as CallsSocketServerMessage;
    default:
      return undefined;
  }
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isCandidate(value: unknown): value is TrickleCandidate {
  if (value === null || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  // `null` is what a serialized `RTCIceCandidate` carries for an absent
  // `sdpMid` / `sdpMLineIndex`, so it is tolerated rather than treated as a
  // malformed frame.
  return (
    isString(candidate["candidate"]) &&
    (candidate["sdpMid"] == null || isString(candidate["sdpMid"])) &&
    (candidate["sdpMLineIndex"] == null ||
      typeof candidate["sdpMLineIndex"] === "number")
  );
}

/**
 * Map a pushed `call.*` event onto the controller's lifecycle vocabulary. The
 * runner identifies the remote party as a JID reference; the number wins,
 * then the LID, then the raw JID. Outgoing offers are the browser's own.
 */
export function lifecycleEventFrom(
  message: Extract<CallsSocketServerMessage, { type: "event" }>,
  line: CallLine = "linkedDevice",
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
          line,
        },
      };
    }
    case "call.accepted":
      return { type: "accepted", callId: message.callId };
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
    default:
      return undefined;
  }
}

function peerFrom(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === null || typeof value !== "object") return "";
  const ref = value as {
    readonly phoneNumber?: unknown;
    readonly lid?: unknown;
    readonly id?: unknown;
  };
  for (const candidate of [ref.phoneNumber, ref.lid, ref.id])
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
