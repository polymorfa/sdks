import type { CallsApi } from "./api.js";
import { CallClaimedError, CallsAuthError, CallsError } from "./errors.js";
import { Emitter } from "./events.js";
import {
  MediaSocket,
  type MediaClose,
  type MediaReady,
  type MediaSocketOptions,
  type MediaVideoSource,
} from "./media.js";
import {
  createConnectionId,
  isConnectionId,
  type MediaControlFrame,
  type Participant,
  type VideoFrame,
} from "./protocol.js";

export type CallDirection = "inbound" | "outbound";

/**
 * `incoming` — ringing, or answered by another participant and open to join ·
 * `ringing` — we placed it, remote not yet answered · `connecting` — accepted,
 * media not yet attached · `connected` — media flowing · `reconnecting` —
 * media dropped and is being reattached with the same connection id ·
 * `ended` — terminal for this client.
 */
export type CallState =
  | "incoming"
  | "ringing"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "ended";

/**
 * `hangup` — this client ended the call for everyone · `left` — this client
 * left; the call may continue for others · `claimed` — another participant
 * claimed the call.
 */
export type CallEndReason =
  | "hangup"
  | "left"
  | "claimed"
  | "remote_hangup"
  | "rejected"
  | "missed"
  | "busy"
  | "timeout"
  | "connection_failed"
  | "pod_lost"
  | "capacity"
  | "unknown";

/** Who answered the call, and whether they claimed it. */
export interface CallClaim {
  readonly answered: boolean;
  readonly answeredBy?: string;
  readonly exclusive: boolean;
  /** Another participant claimed the call: stop ringing and do not decline it. */
  readonly claimedByOther: boolean;
  /** The call is answered without a claim and this client can join it. */
  readonly canJoin: boolean;
}

export interface AnswerOptions {
  /**
   * Claim the call so nobody else can answer or join it. Default `false`:
   * other participants keep ringing and can join.
   */
  readonly exclusive?: boolean;
  /** Send video. Defaults to whether the call offered video. */
  readonly video?: boolean;
}

/**
 * One remote participant's video in a call. `id` identifies the video within
 * the call; frames carry it as `source`.
 */
export interface CallVideoSource {
  readonly id: number;
  /** Display label: the participant's number or ID, or the other connection's participant reference. */
  readonly label: string;
  /** The WhatsApp participant sending this video. */
  readonly participant?: Participant;
  /** Another application connection sending this video. */
  readonly connectionId?: string;
  /** Participant reference (`client:<id>` or `server:<name>`) of that connection, when known. */
  readonly connectionParticipant?: string;
}

/** One received encoded video frame (H.264, Annex-B access unit). */
export interface CallVideoFrame {
  /** `id` of the {@link CallVideoSource} that sent it. */
  readonly source: number;
  readonly keyframe: boolean;
  /** Capture timestamp in microseconds. */
  readonly timestampUs: number;
  readonly data: Uint8Array;
}

/**
 * One encoded video frame to send (H.264, Annex-B access unit). Include the
 * decoder configuration (SPS/PPS) with every keyframe.
 */
export interface OutgoingVideoFrame {
  readonly keyframe: boolean;
  /** Capture timestamp in microseconds. */
  readonly timestampUs: number;
  readonly data: Uint8Array;
}

type AudioEvents = { data: [Int16Array] };
type VideoEvents = {
  /** A received frame; `frame.source` names its {@link CallVideoSource}. */
  frame: [CallVideoFrame];
  source: [CallVideoSource];
  sourceRemoved: [id: number];
  /** Send a keyframe with decoder configuration on the next write. */
  keyframeRequest: [];
};

function videoSource(source: MediaVideoSource): CallVideoSource {
  if (source.participant !== undefined)
    return {
      id: source.source,
      label: source.participant.phoneNumber ?? source.participant.id,
      participant: source.participant,
    };
  return {
    id: source.source,
    label: source.connectionParticipant ?? source.connectionId,
    connectionId: source.connectionId,
    ...(source.connectionParticipant === undefined
      ? {}
      : { connectionParticipant: source.connectionParticipant }),
  };
}

/**
 * The call's merged audio as signed 16-bit mono PCM samples at
 * {@link sampleRate}: `on("data")` is the call → you, `write()` is you → the call.
 */
export class AudioTrack extends Emitter<AudioEvents> {
  #socket: MediaSocket | undefined;
  #sampleRate: number;
  constructor(sampleRate: number) {
    super();
    this.#sampleRate = sampleRate;
  }
  /** s16le mono PCM rate both directions use. Final once the call is connected. */
  get sampleRate(): number {
    return this.#sampleRate;
  }
  /** Push s16le mono PCM at {@link sampleRate}. Returns false when no media is attached. */
  write(pcm: Int16Array): boolean {
    return this.#socket?.writeAudio(pcm) ?? false;
  }
  /** @internal */
  _attach(socket: MediaSocket | undefined, sampleRate?: number): void {
    this.#socket = socket;
    if (sampleRate !== undefined) this.#sampleRate = sampleRate;
  }
  /** @internal */
  _push(pcm: Int16Array): void {
    this.emit("data", pcm);
  }
  /** @internal */
  _detach(): void {
    this.#socket = undefined;
    this.removeAllListeners();
  }
}

/**
 * The call's video: one outgoing H.264 stream, and one received stream per
 * remote participant. Streams are separate; nothing is composed.
 */
export class VideoTrack extends Emitter<VideoEvents> {
  #socket: MediaSocket | undefined;
  readonly #sources = new Map<number, CallVideoSource>();
  /** Remote participant videos by `id`. */
  get sources(): ReadonlyMap<number, CallVideoSource> {
    return this.#sources;
  }
  /** Send one encoded frame. Returns false when no media is attached. */
  write(frame: OutgoingVideoFrame): boolean {
    return (
      this.#socket?.writeVideo({
        keyframe: frame.keyframe,
        timestampUs: frame.timestampUs,
        data: frame.data,
      }) ?? false
    );
  }
  /** @internal */
  _attach(socket: MediaSocket | undefined): void {
    this.#socket = socket;
  }
  /** @internal */
  _frame(frame: VideoFrame): void {
    this.emit("frame", {
      source: frame.source,
      keyframe: frame.keyframe,
      timestampUs: frame.timestampUs,
      data: frame.data,
    });
  }
  /** @internal */
  _source(source: MediaVideoSource): void {
    const neutral = videoSource(source);
    this.#sources.set(neutral.id, neutral);
    this.emit("source", neutral);
  }
  /** @internal */
  _sourceRemoved(handle: number): void {
    if (!this.#sources.delete(handle)) return;
    this.emit("sourceRemoved", handle);
  }
  /** @internal */
  _clearSources(): void {
    for (const handle of [...this.#sources.keys()]) this._sourceRemoved(handle);
  }
  /** @internal */
  _keyframeRequest(): void {
    this.emit("keyframeRequest");
  }
  /** @internal */
  _detach(): void {
    this.#socket = undefined;
    this.#sources.clear();
    this.removeAllListeners();
  }
}

type CallEvents = {
  state: [CallState, previous: CallState];
  connected: [];
  ended: [reason: CallEndReason];
  /** Answer or claim information changed. */
  claim: [CallClaim];
  /** The platform reported different capabilities (on `call.accepted`). */
  capabilities: [CallCapabilities];
  participantJoined: [Participant];
  participantLeft: [participantId: string, reason: string | undefined];
  participantState: [Participant];
  error: [CallsError];
};

/**
 * What a call supports, as reported by the platform. Defaults allow video and
 * invitations when the platform does not report capabilities.
 */
export interface CallCapabilities {
  /** The call can carry video. */
  readonly video: boolean;
  /** More participants can be invited into the call. */
  readonly invite: boolean;
}

export const DEFAULT_CALL_CAPABILITIES: CallCapabilities = Object.freeze({
  video: true,
  invite: true,
});

/**
 * Read platform-reported capabilities, keeping `fallback` (the defaults
 * unless given) for absent or malformed fields.
 */
export function capabilitiesFrom(
  value: unknown,
  fallback: CallCapabilities = DEFAULT_CALL_CAPABILITIES,
): CallCapabilities {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    return fallback;
  const reported = value as Record<string, unknown>;
  return {
    video:
      typeof reported["video"] === "boolean"
        ? reported["video"]
        : fallback.video,
    invite:
      typeof reported["invite"] === "boolean"
        ? reported["invite"]
        : fallback.invite,
  };
}

export interface CallInit {
  readonly id: string;
  readonly session: string;
  readonly direction: CallDirection;
  /** The other party as the platform presents it: number or public ID. */
  readonly peer: string;
  readonly video: boolean;
  /** Platform-reported capabilities. */
  readonly capabilities?: CallCapabilities;
  readonly api: CallsApi;
  readonly media: Omit<
    MediaSocketOptions,
    "api" | "callId" | "connectionId" | "participant" | "refreshToken"
  >;
  /** External media is owned by a browser/WebRTC adapter, which calls mediaConnected(). */
  readonly mediaMode?: "socket" | "external";
  /** Participant name for server credentials. */
  readonly participant?: string;
  /** Participant reference of this client, when known. */
  readonly self?: () => string | undefined;
  /** Media connection id; generated when omitted. */
  readonly connectionId?: string;
  /** Media reattach attempts after an unexpected drop. Default 3. */
  readonly reconnectAttempts?: number;
  readonly now?: () => number;
  /** An outbound call this client placed with `exclusive: true`. */
  readonly exclusive?: boolean;
}

/** Upper bound on the platform release after a local media failure. */
const RELEASE_TIMEOUT_MS = 5_000;

/**
 * One call. Created by the client for every inbound `call.received` and every
 * successful `place()`. Lifecycle transitions arrive from the client's socket;
 * media arrives on this call's own connection once accepted.
 */
export class Call extends Emitter<CallEvents> {
  readonly id: string;
  readonly session: string;
  readonly direction: CallDirection;
  readonly peer: string;
  /** True when the call offered video and the call can carry it. */
  get hasVideo(): boolean {
    return this.#offeredVideo && this.#capabilities.video;
  }
  /**
   * What this call supports. An outbound call starts with the defaults and
   * takes the platform's report from `call.accepted` (`capabilities` event).
   */
  get capabilities(): CallCapabilities {
    return this.#capabilities;
  }
  readonly #offeredVideo: boolean;
  #capabilities: CallCapabilities;
  /** This client's media connection id; reused on reconnect. */
  readonly connectionId: string;
  readonly audio: AudioTrack;
  readonly video: VideoTrack;
  readonly #api: CallsApi;
  readonly #mediaOptions: CallInit["media"];
  readonly #participant: string | undefined;
  readonly #self: () => string | undefined;
  readonly #now: () => number;
  readonly #reconnectAttempts: number;
  readonly #participants = new Map<string, Participant>();
  readonly #departedParticipants = new Set<string>();
  readonly #participantRevisions = new Map<string, number>();
  #rosterRevision = 0;
  #state: CallState;
  #media: MediaSocket | undefined;
  #endReason: CallEndReason | undefined;
  #startedAt: number;
  #connectedAt: number | undefined;
  #endedAt: number | undefined;
  /** The in-flight answer or join, through media attachment. */
  #accepting: Promise<void> | undefined;
  /** This client's accept succeeded. */
  #accepted = false;
  #answered = false;
  #answeredBy: string | undefined;
  #exclusive = false;
  #claimedByOther = false;
  /** This client claimed the call: its own answer, or an exclusive placement. */
  #claimedByUs = false;
  #reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  readonly #externalMedia: boolean;
  #mediaReady = false;

  constructor(init: CallInit) {
    super();
    this.id = init.id;
    this.session = init.session;
    this.direction = init.direction;
    this.peer = init.peer;
    this.#capabilities = init.capabilities ?? DEFAULT_CALL_CAPABILITIES;
    this.#offeredVideo = init.video;
    if (init.connectionId !== undefined && !isConnectionId(init.connectionId))
      throw new CallsError(
        "invalid_connection_id",
        "connectionId must be 8–64 characters of A–Z, a–z, 0–9, _ or -.",
      );
    this.connectionId = init.connectionId ?? createConnectionId();
    this.#api = init.api;
    this.#mediaOptions = init.media;
    this.#participant = init.participant;
    this.#self = init.self ?? (() => undefined);
    this.#externalMedia = init.mediaMode === "external";
    this.#reconnectAttempts = init.reconnectAttempts ?? 3;
    this.#now = init.now ?? Date.now;
    this.#state = init.direction === "inbound" ? "incoming" : "ringing";
    this.#startedAt = this.#now();
    this.audio = new AudioTrack(16_000);
    this.video = new VideoTrack();
    // The placing participant owns an outbound call.
    if (init.direction === "outbound") {
      this.#accepted = true;
      this.#claimedByUs = init.exclusive === true;
    }
  }

  get state(): CallState {
    return this.#state;
  }
  get ended(): boolean {
    return this.#state === "ended";
  }
  get endReason(): CallEndReason | undefined {
    return this.#endReason;
  }
  get startedAt(): number {
    return this.#startedAt;
  }
  get connectedAt(): number | undefined {
    return this.#connectedAt;
  }
  /** Seconds of connected time; frozen at the end so a retained call stops counting. */
  get duration(): number {
    if (this.#connectedAt === undefined) return 0;
    const until = this.#endedAt ?? this.#now();
    return Math.max(0, Math.floor((until - this.#connectedAt) / 1000));
  }
  get endedAt(): number | undefined {
    return this.#endedAt;
  }
  get participants(): readonly Participant[] {
    return [...this.#participants.values()];
  }
  /** Answer and claim state, as last reported by the platform. */
  get claim(): CallClaim {
    return {
      answered: this.#answered,
      ...(this.#answeredBy === undefined
        ? {}
        : { answeredBy: this.#answeredBy }),
      exclusive: this.#exclusive,
      claimedByOther: this.claimedByOther,
      canJoin: this.canJoin,
    };
  }
  /**
   * @internal This client holds the claim: its own exclusive answer, or a
   * placement with `exclusive: true`. Media adapters end such a call, rather
   * than leave it, when its media fails.
   */
  get _claimedBySelf(): boolean {
    return this.#claimedByUs;
  }
  get claimedByOther(): boolean {
    return this.#claimedByOther && !this.#accepted && !this.ended;
  }
  get canJoin(): boolean {
    return (
      this.#state === "incoming" &&
      this.#answered &&
      !this.#exclusive &&
      !this.#claimedByOther
    );
  }

  /**
   * Answer a ringing call and attach media. With `exclusive: true` the call
   * is claimed: other participants stop ringing and cannot join. Resolves
   * once media is connected (after acceptance for external media). Rejects
   * with {@link CallClaimedError} when another participant claimed the call;
   * the call then stays visible as `claimedByOther`.
   */
  answer(options: AnswerOptions = {}): Promise<void> {
    return this.#accept({
      exclusive: options.exclusive === true,
      video: options.video ?? this.hasVideo,
    });
  }

  /**
   * Join a call another participant answered without claiming it. Never
   * claims. Rejects with {@link CallClaimedError} when the call is claimed.
   */
  join(options: { readonly video?: boolean } = {}): Promise<void> {
    if (!this.#answered && this.#state === "incoming")
      return Promise.reject(
        new CallsError(
          "call_not_answered",
          "Nobody has answered this call yet; answer it instead.",
        ),
      );
    return this.#accept({
      exclusive: false,
      video: options.video ?? this.hasVideo,
    });
  }

  #accept(options: { exclusive: boolean; video: boolean }): Promise<void> {
    // A concurrent answer or join settles with the attempt already running,
    // so it also waits for media and fails if media fails.
    if (this.#accepting !== undefined) return this.#accepting;
    if (this.#state !== "incoming")
      return Promise.reject(
        new CallsError(
          "invalid_state",
          `Cannot answer a call in state "${this.#state}".`,
        ),
      );
    if (this.claimedByOther) return Promise.reject(new CallClaimedError());
    let accepted = false;
    const accepting = (async () => {
      this.#transition("connecting");
      const result = await this.#api.accept(this.id, {
        exclusive: options.exclusive,
        video: options.video,
        ...(this.#participant === undefined
          ? {}
          : { participant: this.#participant }),
      });
      accepted = true;
      this.#accepted = true;
      this.#claimedByUs = result.exclusive;
      this.#applyClaim({
        answered: result.answered,
        answeredBy: result.answeredBy,
        exclusive: result.exclusive,
      });
    })();
    const run = accepting
      .then(() => this.#bridge())
      .catch(async (cause: unknown) => {
        this.#accepting = undefined;
        if (this.#state === "ended") throw cause;
        if (!accepted) {
          // The accept itself was refused: nothing changed on the platform.
          if (cause instanceof CallClaimedError) {
            this.#claimedByOther = true;
            this.#applyClaim({ answered: true, exclusive: true });
          }
          this.#transition("incoming");
          throw cause;
        }
        await this.#release(cause);
        this.#mediaFailed(cause);
        throw cause;
      });
    this.#accepting = run;
    return run;
  }

  /**
   * Decline a ringing call. This ends the call for every participant, so
   * applications decide when to call it; the client never declines on its own.
   */
  async reject(): Promise<void> {
    if (this.#state !== "incoming")
      throw new CallsError(
        "invalid_state",
        `Cannot reject a call in state "${this.#state}".`,
      );
    if (this.#answered)
      throw new CallsError(
        "call_not_ringing",
        "The call is already answered. Join it or leave it; declining is not possible.",
      );
    await this.#api.reject(this.id, undefined, this.#participant);
    this.#end("rejected");
  }

  /**
   * Leave the call: close this client's media connection. The call continues
   * for everyone else. On a call this client never joined, only local
   * tracking stops.
   */
  async leave(): Promise<void> {
    if (this.#state === "ended") return;
    // Nobody else is on a placed call the remote party has not answered, so
    // leaving it would keep that party ringing with no way to stop it.
    if (this.direction === "outbound" && this.#state === "ringing") {
      await this.end();
      return;
    }
    const attached = this.#accepted;
    const media = this.#media;
    // A refused request leaves the call live so it can be retried; the local
    // model only goes terminal once this client is really out of the call.
    if (attached && !(media?.leave() ?? false))
      await this.#api.leave(
        this.id,
        this.connectionId,
        undefined,
        this.#participant,
      );
    this.#end("left");
  }

  /** End the call for every participant. Idempotent. */
  async end(): Promise<void> {
    if (this.#state === "ended") return;
    await this.#api.end(this.id);
    this.#end("hangup");
  }

  /** Invite another party, turning a 1:1 call into a group call. */
  async addParticipant(to: string): Promise<Participant> {
    if (this.#state === "ended")
      throw new CallsError(
        "invalid_state",
        "Cannot add a participant to an ended call.",
      );
    const requestedAtRevision = this.#rosterRevision;
    const participant = await this.#api.addParticipant(this.id, to);
    // The lifecycle stream may move this participant forward, or report it
    // left, while the request is in flight. Its acknowledgement is then older
    // than the roster and must not overwrite or restore that entry.
    if (
      (this.#participantRevisions.get(participant.id) ?? 0) <=
      requestedAtRevision
    )
      this.#applyInviteReply(participant);
    return participant;
  }

  /**
   * @internal `call.accepted` arrived. For an outbound call the remote party
   * answered; for an inbound call it names who answered and whether they
   * claimed it.
   */
  async _remoteAccepted(
    claim: {
      readonly answeredBy?: string;
      readonly exclusive?: boolean;
      /** Reported capabilities; absent keeps the current ones. */
      readonly capabilities?: CallCapabilities;
    } = {},
  ): Promise<void> {
    if (
      !this.ended &&
      claim.capabilities !== undefined &&
      (claim.capabilities.video !== this.#capabilities.video ||
        claim.capabilities.invite !== this.#capabilities.invite)
    ) {
      this.#capabilities = Object.freeze({ ...claim.capabilities });
      this.emit("capabilities", this.#capabilities);
    }
    if (this.direction === "outbound") {
      if (this.#state !== "ringing") return;
      this.#transition("connecting");
      try {
        await this.#bridge();
      } catch (cause) {
        await this.#release(cause);
        this.#mediaFailed(cause);
      }
      return;
    }
    if (this.ended) return;
    const exclusive = claim.exclusive === true;
    const answeredBy = claim.answeredBy;
    const self = this.#self();
    const byUs =
      answeredBy !== undefined && self !== undefined && answeredBy === self;
    if (exclusive && !byUs && !this.#accepted && this.#accepting === undefined)
      this.#claimedByOther = true;
    this.#applyClaim({
      answered: true,
      ...(answeredBy === undefined ? {} : { answeredBy }),
      exclusive,
    });
  }

  /** @internal The platform reported the call over. */
  _remoteEnded(reason: CallEndReason): void {
    this.#end(reason);
  }

  /** @internal Apply a validated participant update from either transport. */
  _remoteParticipant(frame: ParticipantControlFrame): void {
    if (this.ended) return;
    const participantId =
      frame.type === "participant_left"
        ? frame.participantId
        : frame.participant.id;
    this.#rosterRevision += 1;
    this.#participantRevisions.set(participantId, this.#rosterRevision);
    this.#applyParticipant(frame);
  }

  /**
   * @internal Media owned by another Polymorfa package connected. An outbound
   * call still waits for the remote party to accept. Socket media ignores this.
   */
  mediaConnected(): void {
    if (!this.#externalMedia || this.ended) return;
    this.#mediaReady = true;
    if (this.#state !== "connecting") return;
    this.#connectedAt = this.#now();
    this.#transition("connected");
    this.emit("connected");
  }

  #applyClaim(next: {
    answered: boolean;
    answeredBy?: string;
    exclusive: boolean;
  }): void {
    const before = this.claim;
    this.#answered = this.#answered || next.answered;
    if (next.answeredBy !== undefined) this.#answeredBy = next.answeredBy;
    this.#exclusive = next.exclusive;
    const after = this.claim;
    if (
      before.answered !== after.answered ||
      before.answeredBy !== after.answeredBy ||
      before.exclusive !== after.exclusive ||
      before.claimedByOther !== after.claimedByOther ||
      before.canJoin !== after.canJoin
    )
      this.emit("claim", after);
  }

  #applyInviteReply(participant: Participant): void {
    if (this.ended) return;
    const previous = this.#participants.get(participant.id);
    if (
      previous !== undefined &&
      participantStateRank(participant.state) <
        participantStateRank(previous.state)
    )
      return;
    if (previous !== undefined && sameParticipant(previous, participant))
      return;
    this.#rosterRevision += 1;
    this.#participantRevisions.set(participant.id, this.#rosterRevision);
    this.#applyParticipant({ type: "participant_joined", participant });
  }

  #applyParticipant(frame: ParticipantControlFrame): void {
    if (this.ended) return;
    if (frame.type === "participant_left") {
      if (this.#departedParticipants.has(frame.participantId)) return;
      this.#departedParticipants.add(frame.participantId);
      this.#participants.delete(frame.participantId);
      this.emit("participantLeft", frame.participantId, frame.reason);
      return;
    }
    const participant = frame.participant;
    if (participant.state === "left") {
      this.#applyParticipant({
        type: "participant_left",
        participantId: participant.id,
      });
      return;
    }
    this.#departedParticipants.delete(participant.id);
    const previous = this.#participants.get(participant.id);
    if (previous !== undefined && sameParticipant(previous, participant))
      return;
    this.#participants.set(participant.id, participant);
    if (previous === undefined) this.emit("participantJoined", participant);
    else this.emit("participantState", participant);
  }

  #mediaFailed(cause: unknown): void {
    if (this.ended) return;
    // The platform accepted; only our media failed. End this client's view
    // of the call and say why.
    this.emit(
      "error",
      cause instanceof CallsError
        ? cause
        : new CallsError(
            "media_failed",
            cause instanceof Error ? cause.message : "Media could not attach.",
            { cause },
          ),
    );
    this.#end(
      cause instanceof CallClaimedError ? "claimed" : "connection_failed",
    );
  }

  async #bridge(): Promise<void> {
    if (this.#externalMedia) {
      if (this.#mediaReady) this.mediaConnected();
      return;
    }
    const ready = await this.#attach(false);
    if (ready === undefined) return;
    this.#connectedAt = this.#now();
    this.#transition("connected");
    this.emit("connected");
  }

  /** Open one media socket with this call's connection id. */
  async #attach(refreshToken: boolean): Promise<MediaReady | undefined> {
    if (this.ended)
      throw new CallsError("call_ended", "Call ended before media attached.");
    const media = new MediaSocket({
      ...this.#mediaOptions,
      api: this.#api,
      callId: this.id,
      connectionId: this.connectionId,
      ...(this.#participant === undefined
        ? {}
        : { participant: this.#participant }),
      refreshToken,
    });
    this.#media = media;
    media.on("audio", (pcm) => this.audio._push(pcm));
    media.on("video", (frame) => this.video._frame(frame));
    media.on("videoSource", (source) => this.video._source(source));
    media.on("videoSourceRemoved", (handle) =>
      this.video._sourceRemoved(handle),
    );
    media.on("keyframeRequest", () => this.video._keyframeRequest());
    media.on("participantJoined", (participant) =>
      this._remoteParticipant({ type: "participant_joined", participant }),
    );
    media.on("participantState", (participant) =>
      this._remoteParticipant({ type: "participant_state", participant }),
    );
    media.on("participantLeft", (participantId, reason) =>
      this._remoteParticipant({
        type: "participant_left",
        participantId,
        ...(reason === undefined ? {} : { reason }),
      }),
    );
    media.on("error", (error) => this.emit("error", error));
    let ready: MediaReady | undefined;
    const readyListener = (value: MediaReady) => {
      ready = value;
    };
    media.once("ready", readyListener);
    let attached = false;
    media.on("close", (close) => {
      if (attached) this.#mediaClosed(media, close);
    });
    try {
      await media.connect();
    } catch (cause) {
      if (this.#media === media) this.#media = undefined;
      media.close();
      throw cause;
    }
    if (this.ended || this.#media !== media) {
      media.close();
      return undefined;
    }
    if (!media.connected) {
      // Closed between `ready` and this continuation.
      this.#media = undefined;
      throw new CallsError("media_closed", "Media connection closed.");
    }
    attached = true;
    this.audio._attach(media, ready?.sampleRate ?? media.sampleRate);
    this.video._attach(media);
    return ready;
  }

  #mediaClosed(media: MediaSocket, close: MediaClose): void {
    if (this.#media !== media || this.ended) return;
    this.#media = undefined;
    this.audio._attach(undefined);
    this.video._attach(undefined);
    this.video._clearSources();
    switch (close.reason) {
      case "local":
        return;
      case "left":
        this.#end("left");
        return;
      case "ended":
        this.#end("remote_hangup");
        return;
      case "claimed":
        this.#end("claimed");
        return;
      case "refused":
        void this.#failAfterRelease(
          new CallsError(
            "media_refused",
            "The platform refused the media connection.",
          ),
        );
        return;
      case "unauthorized":
      case "lost":
        this.#reconnect(close.reason === "unauthorized", 0);
        return;
    }
  }

  #reconnect(refreshToken: boolean, attempt: number): void {
    if (this.ended) return;
    if (attempt >= this.#reconnectAttempts) {
      void this.#failAfterRelease(
        refreshToken
          ? new CallsAuthError()
          : new CallsError("media_lost", "Media connection lost."),
      );
      return;
    }
    this.#transition("reconnecting");
    const delay = Math.min(8_000, 1_000 * 2 ** attempt);
    this.#reconnectTimer = (this.#mediaOptions.setTimeout ?? setTimeout)(() => {
      this.#reconnectTimer = undefined;
      void this.#attach(refreshToken).then(
        (ready) => {
          if (ready === undefined || this.ended) return;
          this.#transition("connected");
        },
        (cause: unknown) => {
          if (this.ended) return;
          if (cause instanceof CallClaimedError) {
            this.#end("claimed");
            return;
          }
          if (!retryable(cause)) {
            // Refused or no longer available: reattaching cannot help.
            void this.#failAfterRelease(
              cause instanceof CallsError
                ? cause
                : new CallsError("media_failed", "Media could not attach."),
            );
            return;
          }
          this.#reconnect(
            cause instanceof CallsAuthError || refreshToken,
            attempt + 1,
          );
        },
      );
    }, delay);
  }

  /**
   * The platform still counts this client as on the call after its media
   * failed. Release it before the call becomes terminal here, so the remote
   * party is not left on a call nobody controls: end a call this client
   * claimed (nobody else can take it over), otherwise leave with this
   * connection. A claim by someone else needs nothing. Bounded by
   * RELEASE_TIMEOUT_MS; failures are swallowed so the media error stays the
   * one reported. External media adapters release the call themselves.
   */
  async #release(cause?: unknown): Promise<void> {
    if (this.ended || !this.#accepted || this.#externalMedia) return;
    if (cause instanceof CallClaimedError) return;
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<void>((resolve) => {
      timer = (this.#mediaOptions.setTimeout ?? setTimeout)(() => {
        abort.abort();
        resolve();
      }, RELEASE_TIMEOUT_MS);
    });
    const request = this.#claimedByUs
      ? this.#api.end(this.id, abort.signal)
      : this.#api.leave(
          this.id,
          this.connectionId,
          abort.signal,
          this.#participant,
        );
    try {
      await Promise.race([request.catch(() => undefined), timeout]);
    } finally {
      (this.#mediaOptions.clearTimeout ?? clearTimeout)(timer);
    }
  }

  /** Release the call on the platform, then report `error` and end here. */
  async #failAfterRelease(error: CallsError): Promise<void> {
    await this.#release();
    if (this.ended) return;
    this.emit("error", error);
    this.#end("connection_failed");
  }

  #transition(next: CallState): void {
    const previous = this.#state;
    if (previous === next) return;
    this.#state = next;
    this.emit("state", next, previous);
  }

  #end(reason: CallEndReason): void {
    if (this.#state === "ended") return;
    this.#endReason = reason;
    this.#endedAt = this.#now();
    if (this.#reconnectTimer !== undefined) {
      (this.#mediaOptions.clearTimeout ?? clearTimeout)(this.#reconnectTimer);
      this.#reconnectTimer = undefined;
    }
    this.#transition("ended");
    const media = this.#media;
    this.#media = undefined;
    media?.close();
    this.audio._detach();
    this.video._detach();
    this.emit("ended", reason);
    this.removeAllListeners();
  }
}

type ParticipantControlFrame = Extract<
  MediaControlFrame,
  { type: "participant_joined" | "participant_state" | "participant_left" }
>;

/** Whether a failed reattach is worth another attempt. */
function retryable(cause: unknown): boolean {
  if (cause instanceof CallsAuthError) return true;
  if (!(cause instanceof CallsError)) return true;
  return ["media_closed", "media_timeout", "token_failed"].includes(cause.code);
}

function participantStateRank(state: Participant["state"]): number {
  switch (state) {
    case "invited":
      return 0;
    case "ringing":
      return 1;
    case "connected":
      return 2;
    case "left":
      return 3;
  }
}

function sameParticipant(a: Participant, b: Participant): boolean {
  return (
    a.id === b.id &&
    a.phoneNumber === b.phoneNumber &&
    a.bsuid === b.bsuid &&
    a.username === b.username &&
    a.audioMuted === b.audioMuted &&
    a.video === b.video &&
    a.state === b.state
  );
}
