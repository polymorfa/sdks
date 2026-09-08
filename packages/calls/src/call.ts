import type { CallsApi } from "./api.js";
import { Emitter } from "./events.js";
import { MediaSocket, type MediaSocketOptions } from "./media.js";
import type { MediaControlFrame, Participant, VideoFrame } from "./protocol.js";

export type CallDirection = "inbound" | "outbound";

/**
 * `incoming` — ringing us, not yet answered · `ringing` — we placed it, remote
 * not yet answered · `connecting` — accepted, media not yet bridged ·
 * `connected` — media flowing · `ended` — terminal.
 */
export type CallState =
  "incoming" | "ringing" | "connecting" | "connected" | "ended";

export type CallEndReason =
  | "hangup"
  | "remote_hangup"
  | "rejected"
  | "missed"
  | "busy"
  | "timeout"
  | "connection_failed"
  | "pod_lost"
  | "capacity"
  | "unknown";

type AudioEvents = { data: [Int16Array] };
type VideoEvents = { frame: [VideoFrame]; state: [enabled: boolean] };

/** The call's audio, both directions: `on("data")` is WhatsApp → you, `write()` is you → WhatsApp. */
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
  /** Push s16le mono PCM at {@link sampleRate}. Returns false when no media is bridged. */
  write(pcm: Int16Array): boolean {
    return this.#socket?.writeAudio(pcm) ?? false;
  }
  /** @internal */
  _attach(socket: MediaSocket, sampleRate: number): void {
    this.#socket = socket;
    this.#sampleRate = sampleRate;
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

/** The call's video, both directions, present when the call carries video. */
export class VideoTrack extends Emitter<VideoEvents> {
  #socket: MediaSocket | undefined;
  #enabled = false;
  get enabled(): boolean {
    return this.#enabled;
  }
  write(frame: VideoFrame): boolean {
    return this.#socket?.writeVideo(frame) ?? false;
  }
  /** @internal */
  _attach(socket: MediaSocket): void {
    this.#socket = socket;
  }
  /** @internal */
  _frame(frame: VideoFrame): void {
    this.emit("frame", frame);
  }
  /** @internal */
  _state(enabled: boolean): void {
    this.#enabled = enabled;
    this.emit("state", enabled);
  }
  /** @internal */
  _detach(): void {
    this.#socket = undefined;
    this.removeAllListeners();
  }
}

type CallEvents = {
  state: [CallState, previous: CallState];
  connected: [];
  ended: [reason: CallEndReason];
  participantJoined: [Participant];
  participantLeft: [participantId: string, reason: string | undefined];
  participantState: [Participant];
  error: [{ code: string; message: string }];
};

export interface CallInit {
  readonly id: string;
  readonly session: string;
  readonly direction: CallDirection;
  /** The other party as the platform presents it: number, LID, or pseudonym. */
  readonly peer: string;
  readonly video: boolean;
  readonly api: CallsApi;
  readonly media: Omit<MediaSocketOptions, "ticket">;
  /** External media is owned by a browser/WebRTC adapter, which calls mediaConnected(). */
  readonly mediaMode?: "socket" | "external";
  readonly now?: () => number;
}

/**
 * One call. Created by the client for every inbound `call.received` and every
 * successful `place()`. Lifecycle transitions arrive from the client's socket;
 * media arrives on this call's own socket once accepted.
 */
export class Call extends Emitter<CallEvents> {
  readonly id: string;
  readonly session: string;
  readonly direction: CallDirection;
  readonly peer: string;
  readonly audio: AudioTrack;
  readonly video: VideoTrack | undefined;
  readonly #api: CallsApi;
  readonly #mediaOptions: Omit<MediaSocketOptions, "ticket">;
  readonly #now: () => number;
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
  #accepting: Promise<void> | undefined;
  readonly #externalMedia: boolean;
  #mediaReady = false;

  constructor(init: CallInit) {
    super();
    this.id = init.id;
    this.session = init.session;
    this.direction = init.direction;
    this.peer = init.peer;
    this.#api = init.api;
    this.#mediaOptions = init.media;
    this.#externalMedia = init.mediaMode === "external";
    this.#now = init.now ?? Date.now;
    this.#state = init.direction === "inbound" ? "incoming" : "ringing";
    this.#startedAt = this.#now();
    this.audio = new AudioTrack(16_000);
    this.video = init.video ? new VideoTrack() : undefined;
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
  /** Seconds since media connected; 0 before that. */
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

  /**
   * Accept an incoming call and bridge media. Resolves once the pod reports
   * media flowing. With externally managed media, resolves after acceptance;
   * the adapter calls mediaConnected() when WebRTC connects. Idempotent while
   * in flight; rejects if the call is not incoming.
   */
  answer(options: { readonly video?: boolean } = {}): Promise<void> {
    if (this.#accepting !== undefined) return this.#accepting;
    if (this.#state !== "incoming")
      return Promise.reject(
        new Error(`Cannot answer a call in state "${this.#state}".`),
      );
    const video = options.video ?? this.video !== undefined;
    let accepted = false;
    this.#accepting = (async () => {
      this.#transition("connecting");
      await this.#api.accept(this.id, { video });
      accepted = true;
      await this.#bridge();
    })().catch((cause: unknown) => {
      this.#accepting = undefined;
      if (this.#state === "ended") throw cause;
      if (!accepted) {
        // The accept itself was refused: nothing changed on the platform, so
        // the call is still ringing and can be answered or rejected again.
        this.#transition("incoming");
        throw cause;
      }
      // The platform has accepted; only our media failed. Going back to
      // `incoming` would send a second accept and offer reject() for a call
      // that is no longer ringing. End it and say why.
      this.emit("error", {
        code: "media_failed",
        message:
          cause instanceof Error
            ? cause.message
            : "Media could not be bridged.",
      });
      this.#end("connection_failed");
      throw cause;
    });
    return this.#accepting;
  }

  /** Decline an incoming call. */
  async reject(): Promise<void> {
    if (this.#state !== "incoming")
      throw new Error(`Cannot reject a call in state "${this.#state}".`);
    await this.#api.reject(this.id);
    this.#end("rejected");
  }

  /** End the call from our side, in any live state. Idempotent. */
  async hangup(): Promise<void> {
    if (this.#state === "ended") return;
    this.#media?.sendControl({ type: "hangup" });
    try {
      await this.#api.hangup(this.id);
    } finally {
      this.#end("hangup");
    }
  }

  /** Invite another party, turning a 1:1 call into a group call. */
  async addParticipant(to: string): Promise<Participant> {
    if (this.#state === "ended")
      throw new Error("Cannot add a participant to an ended call.");
    const requestedAtRevision = this.#rosterRevision;
    const participant = await this.#api.addParticipant(this.id, to);
    // The lifecycle stream may move this participant forward, or report it
    // left, while the HTTP request is in flight. Its acknowledgement is then
    // older than the roster and must not overwrite or restore that entry.
    if (
      (this.#participantRevisions.get(participant.id) ?? 0) <=
      requestedAtRevision
    )
      this.#applyInviteReply(participant);
    return participant;
  }

  /** @internal Outbound call: the remote answered; bridge media. */
  async _remoteAccepted(): Promise<void> {
    if (this.#state !== "ringing") return;
    this.#transition("connecting");
    try {
      await this.#bridge();
    } catch (cause) {
      this.emit("error", {
        code: "media_failed",
        message:
          cause instanceof Error
            ? cause.message
            : "Media could not be bridged.",
      });
      this.#end("connection_failed");
    }
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

  /**
   * Notify an externally managed call that its media connected. An outbound
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

  async #bridge(): Promise<void> {
    if (this.#externalMedia) {
      if (this.#mediaReady) this.mediaConnected();
      return;
    }
    const ticket = await this.#api.mediaTicket(this.id);
    // The call can end while the ticket is in flight — a queued `ended` right
    // behind the `accepted` that started this. Creating the socket now would
    // leave an ended call holding a live socket and heartbeat.
    // Read through the getter: TypeScript narrows a private field across the
    // awaits above and would otherwise consider the later check unreachable.
    if (this.ended) throw new Error("Call ended before media was bridged.");
    const media = new MediaSocket({ ...this.#mediaOptions, ticket });
    this.#media = media;
    media.on("audio", (pcm) => this.audio._push(pcm));
    media.on("video", (frame) => this.video?._frame(frame));
    media.on("videoState", (enabled) => this.video?._state(enabled));
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
    media.on("hangup", () => this.#end("remote_hangup"));
    media.on("close", () => {
      if (this.#state === "connected") this.#end("connection_failed");
    });
    let ready: { sampleRate: number; video: boolean };
    try {
      ready = await new Promise<{ sampleRate: number; video: boolean }>(
        (resolve, reject) => {
          media.once("ready", resolve);
          media.connect().catch(reject);
        },
      );
    } catch (cause) {
      // Any bridge failure releases the socket and its heartbeat; left open,
      // a retry would overwrite #media and leak this one.
      media.close();
      if (this.#media === media) this.#media = undefined;
      throw cause;
    }
    if (this.ended) {
      media.close();
      return;
    }
    this.audio._attach(media, ready.sampleRate);
    this.video?._attach(media);
    this.#connectedAt = this.#now();
    this.#transition("connected");
    this.emit("connected");
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
    this.#transition("ended");
    const media = this.#media;
    this.#media = undefined;
    media?.close();
    this.audio._detach();
    this.video?._detach();
    this.emit("ended", reason);
    this.removeAllListeners();
  }
}

type ParticipantControlFrame = Extract<
  MediaControlFrame,
  { type: "participant_joined" | "participant_state" | "participant_left" }
>;

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
    a.handle === b.handle &&
    a.audioMuted === b.audioMuted &&
    a.video === b.video &&
    a.state === b.state
  );
}
