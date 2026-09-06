import type { CallsApi } from "./api.js";
import { Emitter } from "./events.js";
import { MediaSocket, type MediaSocketOptions } from "./media.js";
import type { Participant, VideoFrame } from "./protocol.js";

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
  #state: CallState;
  #media: MediaSocket | undefined;
  #endReason: CallEndReason | undefined;
  #startedAt: number;
  #connectedAt: number | undefined;
  #accepting: Promise<void> | undefined;

  constructor(init: CallInit) {
    super();
    this.id = init.id;
    this.session = init.session;
    this.direction = init.direction;
    this.peer = init.peer;
    this.#api = init.api;
    this.#mediaOptions = init.media;
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
  get duration(): number {
    return this.#connectedAt === undefined
      ? 0
      : Math.max(0, Math.floor((this.#now() - this.#connectedAt) / 1000));
  }
  get participants(): readonly Participant[] {
    return [...this.#participants.values()];
  }

  /**
   * Accept an incoming call and bridge media. Resolves once the pod reports
   * media flowing. Idempotent while in flight; rejects if the call is not
   * incoming.
   */
  answer(options: { readonly video?: boolean } = {}): Promise<void> {
    if (this.#accepting !== undefined) return this.#accepting;
    if (this.#state !== "incoming")
      return Promise.reject(
        new Error(`Cannot answer a call in state "${this.#state}".`),
      );
    const video = options.video ?? this.video !== undefined;
    this.#accepting = (async () => {
      this.#transition("connecting");
      await this.#api.accept(this.id, { video });
      await this.#bridge();
    })().catch((cause: unknown) => {
      this.#accepting = undefined;
      if (this.#state !== "ended") this.#transition("incoming");
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
    const participant = await this.#api.addParticipant(this.id, to);
    this.#participants.set(participant.id, participant);
    this.emit("participantJoined", participant);
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

  async #bridge(): Promise<void> {
    const ticket = await this.#api.mediaTicket(this.id);
    const media = new MediaSocket({ ...this.#mediaOptions, ticket });
    this.#media = media;
    media.on("audio", (pcm) => this.audio._push(pcm));
    media.on("video", (frame) => this.video?._frame(frame));
    media.on("videoState", (enabled) => this.video?._state(enabled));
    media.on("participantJoined", (p) => {
      this.#participants.set(p.id, p);
      this.emit("participantJoined", p);
    });
    media.on("participantState", (p) => {
      this.#participants.set(p.id, p);
      this.emit("participantState", p);
    });
    media.on("participantLeft", (id, reason) => {
      this.#participants.delete(id);
      this.emit("participantLeft", id, reason);
    });
    media.on("error", (error) => this.emit("error", error));
    media.on("hangup", () => this.#end("remote_hangup"));
    media.on("close", () => {
      if (this.#state === "connected") this.#end("connection_failed");
    });
    const ready = await new Promise<{ sampleRate: number; video: boolean }>(
      (resolve, reject) => {
        media.once("ready", resolve);
        media.connect().catch(reject);
      },
    );
    if (this.#state === "ended") {
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
