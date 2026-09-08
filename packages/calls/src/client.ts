import {
  HttpCallsApi,
  type AnswerMode,
  type CallsApi,
  type FetchLike,
} from "./api.js";
import { Call, type CallEndReason } from "./call.js";
import { Emitter } from "./events.js";
import { LifecycleSocket, type LifecycleEvent } from "./lifecycle.js";
import { parseMediaControlValue, type MediaControlFrame } from "./protocol.js";

export interface CallsClientOptions {
  /** Server API key (`pmfa_…`). Never ship this to a browser. */
  readonly apiKey?: string;
  /** The session whose calls this client follows and places from. */
  readonly session: string;
  /** Defaults to `https://api.polymorfa.com`. */
  readonly baseUrl?: string;
  /** Swap the platform seam entirely — tests, or a client-token transport. */
  readonly api?: CallsApi;
  /**
   * Claim the session's `sdk` answer mode on `connect()` so inbound calls ring
   * for this client instead of being auto-answered. Default `true`; set
   * `false` when another consumer owns the mode (a browser widget on the same
   * session, say).
   */
  readonly claimMode?: boolean;
  /** Answer mode to claim; defaults to sdk. WebRTC adapters use browser. */
  readonly answerMode?: AnswerMode;
  /** External media is connected by the browser adapter instead of an agent ticket. */
  readonly mediaMode?: "socket" | "external";
  readonly fetch?: FetchLike;
  readonly WebSocket?: typeof globalThis.WebSocket;
  readonly setTimeout?: typeof globalThis.setTimeout;
  readonly clearTimeout?: typeof globalThis.clearTimeout;
  readonly setInterval?: typeof globalThis.setInterval;
  readonly clearInterval?: typeof globalThis.clearInterval;
  readonly random?: () => number;
  readonly now?: () => number;
  readonly createIdempotencyKey?: () => string;
}

type ClientEvents = {
  /** A call is ringing this session. Answer or reject it. */
  incoming: [Call];
  /** Any call became known to the client — inbound or placed. */
  call: [Call];
  ended: [Call, CallEndReason];
  /** Lifecycle socket connectivity. */
  ready: [];
  disconnected: [];
  error: [{ code: string; message: string }];
};

/**
 * The programmatic Calls client: a discord.js-style bot that follows one
 * session, rings on inbound calls, places outbound ones, and hands each call
 * back as a {@link Call} with media you read and write from code.
 *
 * ```ts
 * const client = new CallsClient({ apiKey, session: "support" });
 * client.on("incoming", async (call) => {
 *   await call.answer();
 *   call.audio.on("data", (pcm) => transcribe(pcm));
 *   call.audio.write(synthesize("Hello"));
 * });
 * await client.connect();
 * ```
 */
export class CallsClient extends Emitter<ClientEvents> {
  readonly session: string;
  readonly #claimMode: boolean;
  /** Bumped by disconnect(); a connect() still claiming its mode then stops short of the socket. */
  #connectGeneration = 0;
  readonly #api: CallsApi;
  readonly #socket: LifecycleSocket;
  readonly #calls = new Map<string, Call>();
  /** Recently ended call ids, oldest first, so retention stays bounded. */
  readonly #endedOrder: string[] = [];
  /**
   * Lifecycle events for call ids the client does not know yet. A placed
   * call is tracked only when the POST resolves, and the socket can deliver
   * its `accepted` or `ended` before that; dropping those would leave the
   * call ringing forever.
   */
  readonly #pendingEvents = new Map<string, LifecycleEvent[]>();
  readonly #o: CallsClientOptions;
  readonly #createKey: () => string;

  constructor(options: CallsClientOptions) {
    super();
    this.#o = options;
    this.session = options.session;
    this.#claimMode = options.claimMode ?? true;
    if (options.api === undefined && options.apiKey === undefined)
      throw new Error("CallsClient needs an `apiKey` or a custom `api`.");
    this.#api =
      options.api ??
      new HttpCallsApi({
        apiKey: options.apiKey!,
        ...(options.baseUrl === undefined ? {} : { baseUrl: options.baseUrl }),
        ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
      });
    this.#createKey =
      options.createIdempotencyKey ?? (() => crypto.randomUUID());
    this.#socket = new LifecycleSocket({
      api: this.#api,
      session: options.session,
      ...timerOptions(options),
    });
    this.#socket.on("event", (event) => this.#receive(event));
    this.#socket.on("state", (connected) =>
      this.emit(connected ? "ready" : "disconnected"),
    );
    this.#socket.on("error", (error) => this.emit("error", error));
  }

  get connected(): boolean {
    return this.#socket.connected;
  }
  /** Calls the client currently knows about that have not ended. */
  get calls(): readonly Call[] {
    return [...this.#calls.values()].filter((call) => !call.ended);
  }

  /** Look up a known call, including the bounded recent history of ended calls. */
  getCall(callId: string): Call | undefined {
    return this.#calls.get(callId);
  }

  /**
   * Claim the session's answer mode, then open the lifecycle stream. Resolves
   * after the first attempt settles; reconnects until `disconnect()`. A claim
   * that fails rejects before any socket opens: following a session whose
   * calls are being auto-answered elsewhere would ring nothing here.
   */
  async connect(): Promise<void> {
    const generation = this.#connectGeneration;
    if (this.#claimMode)
      await this.#api.setMode(this.session, this.#o.answerMode ?? "sdk");
    // disconnect() ran while the claim was in flight: opening the socket now
    // would reconnect a client the caller has already stopped.
    if (generation !== this.#connectGeneration) return;
    return this.#socket.connect();
  }

  /**
   * Stop following the session and hang up its live calls. The stream closes
   * first: a `connect()` issued while a slow hang-up is still in flight must
   * not have its fresh socket closed by this earlier disconnect. Each call
   * ends locally when its hang-up settles, so nothing is lost by closing early.
   */
  async disconnect(): Promise<void> {
    this.#connectGeneration += 1;
    this.#socket.close();
    await Promise.allSettled(this.calls.map((call) => call.hangup()));
  }

  /**
   * Place an outbound call. Resolves once the platform has accepted the
   * request; listen for `connected` (or `ended`) on the returned call.
   */
  async place(
    to: string,
    options: {
      readonly video?: boolean;
      readonly idempotencyKey?: string;
      readonly signal?: AbortSignal;
    } = {},
  ): Promise<Call> {
    const generation = this.#connectGeneration;
    options.signal?.throwIfAborted();
    const video = options.video ?? false;
    const input = {
      session: this.session,
      to,
      video,
      idempotencyKey: options.idempotencyKey ?? this.#createKey(),
    };
    const { callId } =
      options.signal === undefined
        ? await this.#api.place(input)
        : await this.#api.place(input, options.signal);
    const call = new Call({
      id: callId,
      session: this.session,
      direction: "outbound",
      peer: to,
      video,
      api: this.#api,
      media: timerOptions(this.#o),
      ...(this.#o.mediaMode === undefined
        ? {}
        : { mediaMode: this.#o.mediaMode }),
      ...(this.#o.now === undefined ? {} : { now: this.#o.now }),
    });
    if (generation !== this.#connectGeneration || options.signal?.aborted) {
      await call.hangup();
      throw new Error("Call placement was cancelled.");
    }
    return this.#track(call);
  }

  #receive(event: LifecycleEvent): void {
    const existing = this.#calls.get(event.callId);
    switch (event.event) {
      case "call.received": {
        if (event.payload["direction"] === "outgoing") return;
        // Call ids are unique per call, so a `call.received` for an id the
        // client already knows — live or retained-ended — is a duplicate, not
        // a new call. Reviving an ended one would ring the application twice.
        if (existing !== undefined) return;
        const call = this.#track(
          new Call({
            id: event.callId,
            session: this.session,
            direction: "inbound",
            peer: peerFrom(event.payload["from"]),
            video:
              event.payload["hasVideo"] === true ||
              event.payload["has_video"] === true,
            api: this.#api,
            media: timerOptions(this.#o),
            ...(this.#o.mediaMode === undefined
              ? {}
              : { mediaMode: this.#o.mediaMode }),
            ...(this.#o.now === undefined ? {} : { now: this.#o.now }),
          }),
        );
        this.emit("incoming", call);
        return;
      }
      case "call.accepted":
      case "call.ended":
      case "call.missed":
      case "call.rejected":
        if (existing === undefined) {
          this.#buffer(event);
          return;
        }
        this.#apply(existing, event);
        return;
      case "call.participant_joined":
      case "call.participant_state":
      case "call.participant_left":
        if (this.#o.mediaMode !== "external") return;
        if (participantControlFrom(event) === undefined) return;
        if (existing === undefined) {
          this.#buffer(event);
          return;
        }
        this.#apply(existing, event);
        return;
      default:
        return;
    }
  }

  #track(call: Call): Call {
    this.#calls.set(call.id, call);
    call.once("ended", (reason) => {
      this.emit("ended", call, reason);
      // Ended calls stay known for a while so a late duplicate lifecycle event
      // for the id is recognised and ignored — but bounded, or a long-lived
      // client would hold every call it ever handled.
      this.#endedOrder.push(call.id);
      while (this.#endedOrder.length > ENDED_RETENTION) {
        const oldest = this.#endedOrder.shift();
        if (oldest !== undefined && this.#calls.get(oldest)?.ended)
          this.#calls.delete(oldest);
      }
    });
    this.emit("call", call);
    // Anything that arrived for this id before the call existed applies now.
    const queued = this.#pendingEvents.get(call.id);
    if (queued !== undefined) {
      this.#pendingEvents.delete(call.id);
      for (const event of queued) this.#apply(call, event);
    }
    return call;
  }

  #apply(call: Call, event: LifecycleEvent): void {
    switch (event.event) {
      case "call.accepted":
        void call._remoteAccepted();
        return;
      case "call.ended":
        call._remoteEnded(endReasonFrom(event.payload["reason"]));
        return;
      case "call.missed":
        call._remoteEnded("missed");
        return;
      case "call.rejected":
        call._remoteEnded("rejected");
        return;
      case "call.participant_joined":
      case "call.participant_state":
      case "call.participant_left": {
        if (this.#o.mediaMode !== "external") return;
        const frame = participantControlFrom(event);
        if (frame !== undefined) call._remoteParticipant(frame);
        return;
      }
      default:
        return;
    }
  }

  #buffer(event: LifecycleEvent): void {
    let queue = this.#pendingEvents.get(event.callId);
    if (queue === undefined) {
      if (this.#pendingEvents.size >= PENDING_IDS) {
        const oldest = this.#pendingEvents.keys().next().value;
        if (oldest !== undefined) this.#pendingEvents.delete(oldest);
      }
      queue = [];
      this.#pendingEvents.set(event.callId, queue);
    }
    const terminal = (item: LifecycleEvent) =>
      item.event === "call.ended" ||
      item.event === "call.missed" ||
      item.event === "call.rejected";
    // A completed call cannot be revived by later roster or accepted events.
    if (queue.some(terminal)) return;
    if (terminal(event)) {
      queue.splice(0, queue.length, event);
      return;
    }
    if (event.event === "call.accepted") {
      if (queue.some((item) => item.event === "call.accepted")) return;
      // Reserve lifecycle progress even when roster updates filled the queue.
      if (queue.length >= PENDING_EVENTS_PER_ID) queue.shift();
      queue.push(event);
      return;
    }
    const frame = participantControlFrom(event);
    if (frame !== undefined) {
      const id =
        frame.type === "participant_left"
          ? frame.participantId
          : frame.participant.id;
      const previous = queue.findIndex((item) => {
        const queued = participantControlFrom(item);
        return (
          queued !== undefined &&
          (queued.type === "participant_left"
            ? queued.participantId
            : queued.participant.id) === id
        );
      });
      if (previous >= 0) {
        const queued = participantControlFrom(queue[previous]!);
        // A tracked call suppresses duplicate departures after emitting the
        // first one's metadata. Preserve the same behavior while pending.
        if (
          queued !== undefined &&
          isParticipantDeparture(queued) &&
          isParticipantDeparture(frame)
        )
          return;
        queue.splice(previous, 1);
      }
    }
    if (queue.length >= PENDING_EVENTS_PER_ID) {
      const oldestRoster = queue.findIndex(
        (item) => participantControlFrom(item) !== undefined,
      );
      if (oldestRoster < 0) return;
      queue.splice(oldestRoster, 1);
    }
    queue.push(event);
  }
}

/** Ended calls kept for duplicate-event suppression. */
const ENDED_RETENTION = 200;
/** Unknown call ids whose early events are held, and how many each. */
const PENDING_IDS = 64;
const PENDING_EVENTS_PER_ID = 8;

function timerOptions(o: CallsClientOptions) {
  return {
    ...(o.WebSocket === undefined ? {} : { WebSocket: o.WebSocket }),
    ...(o.setTimeout === undefined ? {} : { setTimeout: o.setTimeout }),
    ...(o.clearTimeout === undefined ? {} : { clearTimeout: o.clearTimeout }),
    ...(o.setInterval === undefined ? {} : { setInterval: o.setInterval }),
    ...(o.clearInterval === undefined
      ? {}
      : { clearInterval: o.clearInterval }),
    ...(o.random === undefined ? {} : { random: o.random }),
  };
}

function peerFrom(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === null || typeof value !== "object") return "";
  const ref = value as Record<string, unknown>;
  for (const candidate of [ref["phoneNumber"], ref["lid"], ref["id"]])
    if (typeof candidate === "string" && candidate.length > 0) return candidate;
  return "";
}

function endReasonFrom(value: unknown): CallEndReason {
  switch (value) {
    case "user_hangup":
    case "remote_hangup":
      return "remote_hangup";
    case "hangup":
      return "hangup";
    case "rejected":
    case "busy":
    case "missed":
    case "timeout":
    case "connection_failed":
    case "pod_lost":
    case "capacity":
      return value;
    case "media_timeout":
    case "setup_timeout":
      return "timeout";
    default:
      return "unknown";
  }
}

type ParticipantControlFrame = Extract<
  MediaControlFrame,
  { type: "participant_joined" | "participant_state" | "participant_left" }
>;

function isParticipantDeparture(frame: ParticipantControlFrame): boolean {
  return (
    frame.type === "participant_left" || frame.participant.state === "left"
  );
}

function participantControlFrom(
  event: LifecycleEvent,
): ParticipantControlFrame | undefined {
  if (event.payload["callId"] !== event.callId) return undefined;
  let value: unknown;
  switch (event.event) {
    case "call.participant_joined":
      value = {
        type: "participant_joined",
        participant: event.payload["participant"],
      };
      break;
    case "call.participant_state":
      value = {
        type: "participant_state",
        participant: event.payload["participant"],
      };
      break;
    case "call.participant_left":
      value = {
        type: "participant_left",
        participantId: event.payload["participantId"],
        ...(typeof event.payload["reason"] !== "string"
          ? {}
          : { reason: event.payload["reason"] }),
      };
      break;
    default:
      return undefined;
  }
  return parseMediaControlValue(value) as ParticipantControlFrame | undefined;
}
