import { CALLS_SDK_VERSION, reportPlatform } from "./diagnostics.js";
import { HttpCallsApi, type CallsApi, type FetchLike } from "./api.js";
import {
  Call,
  capabilitiesFrom,
  type CallCapabilities,
  type CallEndReason,
} from "./call.js";
import type { CallsError } from "./errors.js";
import { Emitter } from "./events.js";
import {
  LifecycleSocket,
  type LifecycleEvent,
  type LifecycleCandidate,
} from "./lifecycle.js";
import {
  isParticipantName,
  parseMediaControlValue,
  type MediaControlFrame,
} from "./protocol.js";
import { isClientToken, type CallsTokenProvider } from "./token.js";

export interface CallsClientOptions {
  /**
   * Credential. A client token (or a provider of client tokens minted by your
   * server with `POST /platform/client-tokens`), or a server API key or
   * project token. Never ship a server credential to a browser.
   */
  readonly token?: string | CallsTokenProvider;
  /** Server API key or project token; same as passing it as `token`. */
  readonly apiKey?: string;
  /** The session whose calls this client follows and places from. */
  readonly session: string;
  /**
   * Participant name for server credentials (`[A-Za-z0-9._:@-]{1,128}`,
   * default `default`). Client tokens always act as their own participant.
   */
  readonly participant?: string;
  /** Defaults to `https://api.polymorfa.com`. */
  readonly baseUrl?: string;
  /** Media reattach attempts after an unexpected drop. Default 3. */
  readonly reconnectAttempts?: number;
  readonly fetch?: FetchLike;
  readonly WebSocket?: typeof globalThis.WebSocket;
  readonly setTimeout?: typeof globalThis.setTimeout;
  readonly clearTimeout?: typeof globalThis.clearTimeout;
  readonly setInterval?: typeof globalThis.setInterval;
  readonly clearInterval?: typeof globalThis.clearInterval;
  readonly random?: () => number;
  readonly now?: () => number;
  readonly createIdempotencyKey?: () => string;
  /**
   * Send call diagnostics for this client's media connections (default
   * `true`): an error code when media fails to connect, times out, loses its
   * token or gives up reconnecting, and the connection's reconnect count when
   * it closes. Reports carry no personal data. `false` sends none.
   */
  readonly diagnostics?: boolean;
}

/**
 * Options only sibling Polymorfa packages pass: a replacement platform seam
 * and externally managed (WebRTC) media. Not part of the public API.
 * @internal
 */
export interface InternalCallsClientOptions extends CallsClientOptions {
  readonly api?: CallsApi;
  readonly mediaMode?: "socket" | "external";
}

/** Build a client with internal options. @internal */
export function createInternalCallsClient(
  options: InternalCallsClientOptions,
): CallsClient {
  return new CallsClient(options);
}

export interface PlaceOptions {
  readonly video?: boolean;
  /** Claim the call for this participant. Default `false`. */
  readonly exclusive?: boolean;
  readonly idempotencyKey?: string;
  readonly signal?: AbortSignal;
}

type ClientEvents = {
  /**
   * A call is ringing this session. Answer, join, reject, or ignore it; the
   * client never declines on its own.
   */
  incoming: [Call];
  /** Any call became known to the client — inbound or placed. */
  call: [Call];
  ended: [Call, CallEndReason];
  /** Lifecycle socket authenticated. */
  ready: [];
  disconnected: [];
  /** Includes `CallsAuthError` when the platform closes the socket with 4401. */
  error: [CallsError];
};

/**
 * The programmatic Calls client: follows one session, rings on inbound calls,
 * places outbound ones, and hands each call back as a {@link Call} with media
 * you read and write from code.
 *
 * ```ts
 * const client = new CallsClient({ token: getToken, session: "support" });
 * client.on("incoming", async (call) => {
 *   await call.answer({ exclusive: true });
 *   call.audio.on("data", (pcm) => transcribe(pcm));
 *   call.audio.write(synthesize("Hello"));
 * });
 * await client.connect();
 * ```
 */
export class CallsClient extends Emitter<ClientEvents> {
  readonly session: string;
  /** Bumped by disconnect(); a placement that resolves later is ended. */
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
  readonly #o: InternalCallsClientOptions;
  readonly #createKey: () => string;
  #credentialReference: string | undefined;

  constructor(publicOptions: CallsClientOptions) {
    super();
    const options = publicOptions as InternalCallsClientOptions;
    this.#o = options;
    this.session = options.session;
    if (
      options.participant !== undefined &&
      !isParticipantName(options.participant)
    )
      throw new Error(
        "participant must be 1–128 characters of A–Z, a–z, 0–9, and . _ : @ -",
      );
    const credential = options.token ?? options.apiKey;
    if (options.api === undefined && credential === undefined)
      throw new Error("CallsClient needs a `token` or a custom `api`.");
    this.#api =
      options.api ??
      new HttpCallsApi({
        token: credential!,
        ...(options.baseUrl === undefined ? {} : { baseUrl: options.baseUrl }),
        ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
        ...(options.now === undefined ? {} : { now: options.now }),
      });
    this.#createKey =
      options.createIdempotencyKey ?? (() => crypto.randomUUID());
    this.#socket = new LifecycleSocket({
      api: this.#api,
      session: options.session,
      ...(options.participant === undefined
        ? {}
        : { participant: options.participant }),
      ...timerOptions(options),
      ...(options.now === undefined ? {} : { now: options.now }),
    });
    this.#socket.on("event", (event) => this.#receive(event));
    this.#socket.on("state", (connected) =>
      this.emit(connected ? "ready" : "disconnected"),
    );
    this.#socket.on("error", (error) => this.emit("error", error));
  }

  /** True while the lifecycle socket is authenticated. */
  get connected(): boolean {
    return this.#socket.connected;
  }
  /** Candidate channel for the browser media adapter. @internal */
  _sendCandidate(
    event: LifecycleCandidate & { connectionId: string },
  ): boolean {
    return this.#socket.sendCandidate(
      event.callId,
      event.connectionId,
      event.candidate,
    );
  }

  /** Subscribe to the existing authenticated socket. @internal */
  _onCandidate(listener: (event: LifecycleCandidate) => void): () => void {
    return this.#socket.on("candidate", listener);
  }

  /** Calls the client currently knows about that have not ended. */
  get calls(): readonly Call[] {
    return [...this.#calls.values()].filter((call) => !call.ended);
  }
  /**
   * This client's participant reference (`client:<id>` or `server:<name>`),
   * when known from the credential or the platform.
   */
  get participantReference(): string | undefined {
    return this.#socket.participant ?? this.#credentialReference;
  }

  /** Look up a known call, including the bounded recent history of ended calls. */
  getCall(callId: string): Call | undefined {
    return this.#calls.get(callId);
  }

  /**
   * Open the lifecycle stream. Resolves after the first attempt settles;
   * reconnects until `disconnect()`.
   */
  async connect(): Promise<void> {
    const generation = this.#connectGeneration;
    try {
      const token = await this.#api.token();
      if (!isClientToken(token.value))
        this.#credentialReference = `server:${this.#o.participant ?? "default"}`;
    } catch {
      // The socket attempt reports token failures itself.
    }
    if (generation !== this.#connectGeneration) return;
    return this.#socket.connect();
  }

  /**
   * Stop following the session. Calls this client joined are left, not
   * ended; outbound calls still ringing are ended; ringing inbound calls
   * are only forgotten locally.
   */
  async disconnect(): Promise<void> {
    this.#connectGeneration += 1;
    this.#socket.close();
    await Promise.allSettled(
      this.calls.map((call) =>
        call.direction === "outbound" && call.state === "ringing"
          ? call.end()
          : call.leave(),
      ),
    );
  }

  /**
   * Place an outbound call. Resolves once the platform has accepted the
   * request; listen for `connected` (or `ended`) on the returned call.
   */
  /** Call every remote member of an existing WhatsApp group after live policy checks. */
  placeGroup(groupId: string, options: PlaceOptions = {}): Promise<Call> {
    return this.place({ groupId }, options);
  }

  async place(
    to: string | readonly string[] | { readonly groupId: string },
    options: PlaceOptions = {},
  ): Promise<Call> {
    const participants = Array.isArray(to)
      ? (to as readonly string[])
      : undefined;
    const groupId =
      typeof to === "object" && !Array.isArray(to)
        ? (to as { groupId: string }).groupId
        : undefined;
    if (groupId !== undefined && !/^[1-9][0-9]{0,18}$/.test(groupId))
      throw new Error("A group call needs a public numeric group ID.");
    if (
      participants &&
      (participants.length < 2 ||
        participants.length > 31 ||
        new Set(participants).size !== participants.length ||
        participants.some((value) => !value.trim()))
    )
      throw new Error("A group call needs 2 to 31 distinct participants.");
    const primary =
      typeof to === "string" ? to : (groupId ?? participants![0]!);
    const generation = this.#connectGeneration;
    options.signal?.throwIfAborted();
    const video = options.video ?? false;
    const input = {
      session: this.session,
      to: primary,
      ...(participants ? { participants: [...participants] } : {}),
      ...(groupId ? { groupId } : {}),
      video,
      ...(options.exclusive === undefined
        ? {}
        : { exclusive: options.exclusive }),
      ...(this.#o.participant === undefined
        ? {}
        : { participant: this.#o.participant }),
      idempotencyKey: options.idempotencyKey ?? this.#createKey(),
    };
    const { callId } =
      options.signal === undefined
        ? await this.#api.place(input)
        : await this.#api.place(input, options.signal);
    const call = this.#newCall(
      callId,
      "outbound",
      primary,
      video,
      undefined,
      options.exclusive === true,
    );
    if (generation !== this.#connectGeneration || options.signal?.aborted) {
      await call.end();
      throw new Error("Call placement was cancelled.");
    }
    return this.#track(call);
  }

  #newCall(
    id: string,
    direction: "inbound" | "outbound",
    peer: string,
    video: boolean,
    capabilities?: CallCapabilities,
    exclusive = false,
  ): Call {
    return new Call({
      exclusive,
      id,
      session: this.session,
      direction,
      peer,
      video,
      ...(capabilities === undefined ? {} : { capabilities }),
      api: this.#api,
      media: timerOptions(this.#o),
      self: () => this.participantReference,
      ...(this.#o.participant === undefined
        ? {}
        : { participant: this.#o.participant }),
      ...(this.#o.mediaMode === undefined
        ? {}
        : { mediaMode: this.#o.mediaMode }),
      ...(this.#o.reconnectAttempts === undefined
        ? {}
        : { reconnectAttempts: this.#o.reconnectAttempts }),
      ...(this.#o.now === undefined ? {} : { now: this.#o.now }),
      ...(this.#o.diagnostics === false
        ? {}
        : {
            diagnostics: {
              sdk: "@polymorfa/sdk",
              version: CALLS_SDK_VERSION,
              platform: reportPlatform(),
            },
          }),
    });
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
          this.#newCall(
            event.callId,
            "inbound",
            peerFrom(event.payload["from"]),
            event.payload["hasVideo"] === true ||
              event.payload["has_video"] === true,
            capabilitiesFrom(event.payload["capabilities"]),
          ),
        );
        // A terminal event buffered before `call.received` has already ended
        // the call during tracking: it is reported as `ended`, never rung.
        if (!call.ended) this.emit("incoming", call);
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
      case "call.accepted": {
        const answeredBy = event.payload["answeredBy"];
        const reported = event.payload["capabilities"];
        void call._remoteAccepted({
          ...(typeof answeredBy === "string" && answeredBy.length > 0
            ? { answeredBy }
            : {}),
          exclusive: event.payload["exclusive"] === true,
          // The only capability report for an outbound call; absent or
          // malformed fields keep what the call already has.
          ...(reported !== null &&
          typeof reported === "object" &&
          !Array.isArray(reported)
            ? { capabilities: capabilitiesFrom(reported, call.capabilities) }
            : {}),
        });
        return;
      }
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

function timerOptions(o: InternalCallsClientOptions) {
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
    case "call_restricted":
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
