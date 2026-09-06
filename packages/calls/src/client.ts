import { HttpCallsApi, type CallsApi, type FetchLike } from "./api.js";
import { Call, type CallEndReason } from "./call.js";
import { Emitter } from "./events.js";
import { LifecycleSocket, type LifecycleEvent } from "./lifecycle.js";

export interface CallsClientOptions {
  /** Server API key (`pmfa_…`). Never ship this to a browser. */
  readonly apiKey?: string;
  /** The session whose calls this client follows and places from. */
  readonly session: string;
  /** Defaults to `https://api.polymorfa.com`. */
  readonly baseUrl?: string;
  /** Swap the platform seam entirely — tests, or a client-token transport. */
  readonly api?: CallsApi;
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
  readonly #api: CallsApi;
  readonly #socket: LifecycleSocket;
  readonly #calls = new Map<string, Call>();
  readonly #o: CallsClientOptions;
  readonly #createKey: () => string;

  constructor(options: CallsClientOptions) {
    super();
    this.#o = options;
    this.session = options.session;
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

  /** Open the lifecycle stream. Resolves after the first attempt settles; reconnects until `disconnect()`. */
  connect(): Promise<void> {
    return this.#socket.connect();
  }

  /** Stop following the session. Live calls are hung up first. */
  async disconnect(): Promise<void> {
    await Promise.allSettled(this.calls.map((call) => call.hangup()));
    this.#socket.close();
  }

  /**
   * Place an outbound call. Resolves once the platform has accepted the
   * request; listen for `connected` (or `ended`) on the returned call.
   */
  async place(
    to: string,
    options: { readonly video?: boolean } = {},
  ): Promise<Call> {
    const video = options.video ?? false;
    const { callId } = await this.#api.place({
      session: this.session,
      to,
      video,
      idempotencyKey: this.#createKey(),
    });
    const call = this.#track(
      new Call({
        id: callId,
        session: this.session,
        direction: "outbound",
        peer: to,
        video,
        api: this.#api,
        media: timerOptions(this.#o),
        ...(this.#o.now === undefined ? {} : { now: this.#o.now }),
      }),
    );
    return call;
  }

  #receive(event: LifecycleEvent): void {
    const existing = this.#calls.get(event.callId);
    switch (event.event) {
      case "call.received": {
        if (event.payload["direction"] === "outgoing") return;
        if (existing !== undefined && !existing.ended) return;
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
            ...(this.#o.now === undefined ? {} : { now: this.#o.now }),
          }),
        );
        this.emit("incoming", call);
        return;
      }
      case "call.accepted":
        void existing?._remoteAccepted();
        return;
      case "call.ended":
        existing?._remoteEnded(endReasonFrom(event.payload["reason"]));
        return;
      case "call.missed":
        existing?._remoteEnded("missed");
        return;
      case "call.rejected":
        existing?._remoteEnded("rejected");
        return;
      default:
        return;
    }
  }

  #track(call: Call): Call {
    this.#calls.set(call.id, call);
    call.once("ended", (reason) => {
      this.emit("ended", call, reason);
      // Keep the entry until a new call reuses the id, so a late duplicate
      // lifecycle event for this id is recognised and ignored.
    });
    this.emit("call", call);
    return call;
  }
}

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
