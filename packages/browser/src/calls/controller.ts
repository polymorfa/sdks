import {
  CallClaimedError,
  type AcceptCallResult,
  type Call,
  type Participant,
} from "@polymorfa/calls/internal";
import {
  ObservableController,
  type ControllerSnapshot,
} from "../controller.js";
import type {
  CallMediaFactory,
  CallMediaSession,
  RemoteVideo,
} from "./media.js";
import { isCallClaimed } from "./signaling.js";

export type CallStatus =
  | "idle"
  | "ready"
  | "incoming"
  | "ringing"
  | "accepted"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "ended"
  | "error";
export type CallEndReason =
  | "hangup"
  | "left"
  | "rejected"
  | "missed"
  | "busy"
  | "connection_failed"
  | "ice_timeout"
  | "capacity"
  | "remote_hangup"
  | "pod_lost"
  | (string & {});
/**
 * What the displayed call supports. The platform reports video and invite
 * support per call; muting is always available.
 */
export interface CallCapabilities {
  readonly video: boolean;
  readonly mute: boolean;
  readonly invite: boolean;
}

const DEFAULT_CAPABILITIES: CallCapabilities = Object.freeze({
  video: true,
  mute: true,
  invite: true,
});

function capabilitiesOf(
  reported: { readonly video: boolean; readonly invite: boolean } | undefined,
): CallCapabilities {
  return reported === undefined
    ? DEFAULT_CAPABILITIES
    : { video: reported.video, invite: reported.invite, mute: true };
}

export type CallDeviceKind = "audioinput" | "videoinput" | "audiooutput";

export interface CallDevice {
  readonly deviceId: string;
  readonly kind: CallDeviceKind;
  readonly label: string;
}

/** Capture/playback device choices. `audioOutput` needs `setSinkId` support. */
export interface SelectedCallDevices {
  readonly audioInput?: string;
  readonly videoInput?: string;
  readonly audioOutput?: string;
}

export interface IncomingCall {
  readonly callId: string;
  readonly from: string;
  readonly video: boolean;
  /** Platform-reported capabilities; defaults allow video and invitations. */
  readonly capabilities?: { readonly video: boolean; readonly invite: boolean };
}

/** A call participant as the platform reports it. */
export type CallParticipant = Participant;

/**
 * An incoming call this client knows about. Several can ring at once; the
 * controller never declines one on its own.
 */
export interface CallInvitation {
  readonly callId: string;
  readonly from: string;
  readonly video: boolean;
  readonly capabilities: CallCapabilities;
  /** Somebody answered the call. */
  readonly answered: boolean;
  /** Participant reference that answered first, when known. */
  readonly answeredBy?: string;
  /** The answer claimed the call. */
  readonly exclusive: boolean;
  /** Another participant claimed the call: stop ringing, do not decline. */
  readonly claimedByOther: boolean;
  /** Answered without a claim: this client can join. */
  readonly canJoin: boolean;
}

/** One remote participant's video with its stream. */
export interface ParticipantVideo extends RemoteVideoInfo {
  readonly stream: MediaStream;
}

/** A remote video tile, without its media stream (see `controller.remoteVideos`). */
export interface RemoteVideoInfo {
  /** Stable key for rendering one participant's video. */
  readonly key: string;
  /** Display label: the participant's number or ID, or the other connection's participant reference. */
  readonly label: string;
  readonly connectionId?: string;
  /** Participant reference behind `connectionId`, when known. */
  readonly connectionParticipant?: string;
  readonly participant?: CallParticipant;
}

export type CallLifecycleEvent =
  | { readonly type: "incomingCall"; readonly call: IncomingCall }
  | {
      readonly type: "ringing" | "connected";
      readonly callId: string;
    }
  | {
      /**
       * The call was answered. On a call this client placed, the remote party
       * picked up. On an incoming call, `answeredBy` and `exclusive` say who
       * answered and whether they claimed it.
       */
      readonly type: "accepted";
      readonly callId: string;
      readonly answeredBy?: string;
      readonly exclusive?: boolean;
      /** Set by backends that know this client's participant reference. */
      readonly claimedByOther?: boolean;
    }
  | {
      readonly type: "ended";
      readonly callId: string;
      readonly reason?: CallEndReason;
    }
  | {
      readonly type: "videostate";
      readonly callId: string;
      readonly video: boolean;
    }
  | {
      readonly type: "participant";
      readonly callId: string;
      readonly participant: CallParticipant;
    }
  | {
      readonly type: "participantLeft";
      readonly callId: string;
      readonly participantId: string;
    };
export interface PlaceCallInput {
  readonly to: string;
  readonly video: boolean;
  readonly idempotencyKey: string;
  /** Claim the placed call. Default `false`. */
  readonly exclusive?: boolean;
}
export interface AnswerCallInput {
  /** Claim the call. `false` leaves other participants ringing so they can join. */
  readonly exclusive: boolean;
  readonly video: boolean;
}
export interface CallsBackend {
  /** Shared call model, when this backend uses the Calls client. */
  getCall?(callId: string): Call | undefined;
  /** Media connection id to use for a call, when the backend owns one. */
  connectionId?(callId: string): string | undefined;
  /** Release an owned lifecycle client when the controller is disposed. */
  dispose?(): void;
  subscribe(listener: (event: CallLifecycleEvent) => void): () => void;
  place(
    input: PlaceCallInput,
    signal: AbortSignal,
  ): Promise<{ readonly callId: string }>;
  /**
   * Answer a ringing call. Rejects with `CallClaimedError` when another
   * participant claimed it.
   */
  answer(
    callId: string,
    signal: AbortSignal,
    input?: AnswerCallInput,
  ): Promise<void | AcceptCallResult>;
  /** Join an answered, unclaimed call. Defaults to `answer` without a claim. */
  join?(
    callId: string,
    signal: AbortSignal,
    input: { readonly video: boolean },
  ): Promise<void | AcceptCallResult>;
  /** Decline a ringing call. Ends it for every participant. */
  reject(callId: string, signal: AbortSignal): Promise<void>;
  /** End the call for every participant. */
  hangup(callId: string, signal: AbortSignal): Promise<void>;
  /**
   * Leave one media connection. When omitted, the media session leaves on
   * its own when it closes.
   */
  leave?(
    callId: string,
    connectionId: string | undefined,
    signal: AbortSignal,
  ): Promise<void>;
}
export interface CallsSnapshot extends ControllerSnapshot {
  readonly status: CallStatus;
  readonly callId?: string;
  readonly peer?: string;
  readonly direction?: "incoming" | "outgoing";
  readonly capabilities: CallCapabilities;
  readonly video: boolean;
  readonly audioMuted: boolean;
  readonly videoMuted: boolean;
  /** Set once media connected; drives the call duration display. */
  readonly connectedAt?: number;
  readonly devices: readonly CallDevice[];
  readonly selectedDevices: SelectedCallDevices;
  readonly endReason?: CallEndReason;
  readonly error?: {
    readonly code: string;
    readonly message: string;
    readonly recoverable: boolean;
  };
  /** Every incoming call this client knows about, displayed one included. */
  readonly invitations: readonly CallInvitation[];
  /** The displayed incoming call was claimed by another participant. */
  readonly claimedByOther: boolean;
  /** The displayed incoming call is answered without a claim; `join()` it. */
  readonly canJoin: boolean;
  /** Who answered the displayed call, when known. */
  readonly answeredBy?: string;
  /** The displayed call is claimed. */
  readonly exclusive: boolean;
  /** Participants of the displayed call. */
  readonly participants: readonly CallParticipant[];
  /** Remote video tiles of the displayed call; streams are on the controller. */
  readonly remoteVideos: readonly RemoteVideoInfo[];
}
export interface CallsControllerOptions {
  readonly createIdempotencyKey?: () => string;
  readonly now?: () => number;
  /**
   * Resumption window: how long media may stay disconnected before the call
   * is given up (default 15 000 ms), and how long `disconnected` may last
   * before an ICE restart is attempted (default 2 000 ms).
   */
  readonly resumptionWindowMs?: number;
  readonly iceRestartAfterMs?: number;
  readonly setTimeout?: typeof globalThis.setTimeout;
  readonly clearTimeout?: typeof globalThis.clearTimeout;
}

/** HTTP statuses on the offer that mean the call cannot be established at all. */
const TERMINAL_OFFER_REASONS: Readonly<Record<number, CallEndReason>> = {
  410: "pod_lost",
  503: "capacity",
};

const ACTIVE = new Set<CallStatus>([
  "ringing",
  "accepted",
  "connecting",
  "connected",
  "reconnecting",
]);

const EMPTY_CALL = {
  claimedByOther: false,
  canJoin: false,
  exclusive: false,
  participants: [] as readonly CallParticipant[],
  remoteVideos: [] as readonly RemoteVideoInfo[],
};

export class CallsController extends ObservableController<CallsSnapshot> {
  readonly #backend: CallsBackend;
  readonly #mediaFactory: CallMediaFactory;
  readonly #createKey: () => string;
  readonly #now: () => number;
  readonly #resumptionWindowMs: number;
  readonly #iceRestartAfterMs: number;
  readonly #setTimeout: typeof globalThis.setTimeout;
  readonly #clearTimeout: typeof globalThis.clearTimeout;
  #abort = new AbortController();
  #unsubscribe: (() => void) | undefined;
  #media: CallMediaSession | undefined;
  #operation = 0;
  #placing = false;
  #resumeTimer: ReturnType<typeof setTimeout> | undefined;
  #giveUpTimer: ReturnType<typeof setTimeout> | undefined;
  /** The status resumption interrupted, restored when media comes back. */
  #resumedFrom: "connected" | "connecting" | undefined;
  /** Per-kind switch counter, so a stale failure cannot undo a newer switch. */
  readonly #deviceSwitches = new Map<string, number>();
  /** Incoming calls by id, oldest first. */
  readonly #invitations = new Map<string, CallInvitation>();
  /** Calls this controller answered or joined (their accepted echo is ours). */
  readonly #answered = new Set<string>();
  #answering: string | undefined;
  #remoteVideos: readonly RemoteVideo[] = [];
  #publicVideos: {
    source: readonly RemoteVideo[];
    videos: readonly ParticipantVideo[];
  } = { source: [], videos: [] };

  constructor(
    backend: CallsBackend,
    mediaFactory: CallMediaFactory,
    options: CallsControllerOptions = {},
  ) {
    super(
      {
        status: "idle",
        capabilities: DEFAULT_CAPABILITIES,
        video: false,
        audioMuted: false,
        videoMuted: false,
        devices: [],
        selectedDevices: {},
        invitations: [],
        ...EMPTY_CALL,
      },
      options.now,
    );
    this.#backend = backend;
    this.#mediaFactory = mediaFactory;
    this.#now = options.now ?? Date.now;
    this.#createKey =
      options.createIdempotencyKey ?? (() => crypto.randomUUID());
    this.#resumptionWindowMs = options.resumptionWindowMs ?? 15_000;
    this.#iceRestartAfterMs = options.iceRestartAfterMs ?? 2_000;
    this.#setTimeout =
      options.setTimeout ?? globalThis.setTimeout.bind(globalThis);
    this.#clearTimeout =
      options.clearTimeout ?? globalThis.clearTimeout.bind(globalThis);
  }

  initialize(): void {
    this.assertActive();
    if (this.#unsubscribe !== undefined) return;
    this.#unsubscribe = this.#backend.subscribe((event) =>
      this.#receive(event),
    );
    this.transition({ ...callFields(this.getSnapshot()), status: "ready" });
  }

  /** The shared call model for the displayed call, when supplied by the backend. */
  get call(): Call | undefined {
    const id = this.getSnapshot().callId;
    return id === undefined ? undefined : this.#backend.getCall?.(id);
  }

  async place(
    to: string,
    options: {
      readonly video?: boolean;
      /** Claim the placed call. Default `false`. */
      readonly exclusive?: boolean;
    } = {},
  ): Promise<void> {
    this.assertActive();
    if (this.#placing)
      throw new Error("A call placement is already in progress.");
    const current = this.getSnapshot();
    if (
      (this.call && !this.call.ended && current.status !== "incoming") ||
      (current.callId !== undefined &&
        [...ACTIVE, "incoming"].includes(current.status))
    )
      throw new Error("Finish the active call before placing another.");
    const operation = this.#begin();
    const capabilities = DEFAULT_CAPABILITIES;
    const video = options.video ?? false;
    // Only a refused offer carries the pod's terminal hints.
    let offering = false;
    this.#placing = true;
    try {
      const { callId } = await this.#backend.place(
        {
          to,
          video,
          idempotencyKey: this.#createKey(),
          ...(options.exclusive === undefined
            ? {}
            : { exclusive: options.exclusive }),
        },
        this.#abort.signal,
      );
      if (operation !== this.#operation) return;
      this.#answered.add(callId);
      this.#remoteVideos = [];
      this.transition({
        ...this.#baseFields(),
        status: "ringing",
        callId,
        peer: to,
        direction: "outgoing",
        capabilities,
        video,
        audioMuted: false,
        videoMuted: false,
        exclusive: options.exclusive === true,
      });
      const call = this.call;
      if (call?.ended) {
        this.#receive({
          type: "ended",
          callId,
          ...(call.endReason === undefined ? {} : { reason: call.endReason }),
        });
        return;
      }
      offering = true;
      await this.#openMedia(callId, video, operation);
    } catch (cause) {
      this.#fail(cause, operation, "place_failed", offering);
    } finally {
      this.#placing = false;
    }
  }

  /**
   * Answer the displayed incoming call, or the invitation named by `callId`.
   * `exclusive` defaults to `false`: other participants keep ringing and can
   * join. A call claimed by another participant is not answered; the snapshot
   * reports `claimedByOther`.
   */
  async answer(
    options: {
      readonly video?: boolean;
      readonly exclusive?: boolean;
      readonly callId?: string;
    } = {},
  ): Promise<void> {
    const current = this.#showInvitation(options.callId, "answer");
    if (current.claimedByOther) throw new CallClaimedError();
    await this.#accept(current, {
      video: (options.video ?? current.video) && current.capabilities.video,
      exclusive: options.exclusive === true,
      join: false,
    });
  }

  /**
   * Join the displayed (or named) call that another participant answered
   * without claiming it. Never claims.
   */
  async join(
    options: { readonly video?: boolean; readonly callId?: string } = {},
  ): Promise<void> {
    const current = this.#showInvitation(options.callId, "join");
    if (current.claimedByOther) throw new CallClaimedError();
    if (!current.canJoin)
      throw new Error("This call has not been answered without a claim.");
    await this.#accept(current, {
      video: (options.video ?? current.video) && current.capabilities.video,
      exclusive: false,
      join: true,
    });
  }

  /**
   * Decline the displayed (or named) ringing call. This ends the call for
   * every participant; only call it on an explicit user action.
   */
  async reject(options: { readonly callId?: string } = {}): Promise<void> {
    const current = this.#showInvitation(options.callId, "reject");
    if (current.canJoin || current.claimedByOther || current.answeredBy)
      throw new Error(
        "The call is already answered and can no longer be declined.",
      );
    await this.#finish(current.callId, "rejected", (signal) =>
      this.#backend.reject(current.callId, signal),
    );
  }

  /**
   * Stop showing an incoming call without declining it. Other participants
   * keep ringing; the call is not affected.
   */
  dismiss(callId?: string): void {
    this.assertActive();
    const current = this.getSnapshot();
    const id = callId ?? current.callId;
    if (id === undefined) return;
    const known = this.#invitations.delete(id);
    if (current.callId === id && current.status === "incoming") {
      this.#advance({ ...this.#baseFields(), status: "ready" });
      return;
    }
    if (known)
      this.transition({ ...callFields(current), status: current.status });
  }

  /** Show a known invitation while no call is active. */
  select(callId: string): void {
    this.#showInvitation(callId, "select");
  }

  /**
   * Leave the displayed call: close this client's media connection. The call
   * continues for the other participants.
   */
  async leave(): Promise<void> {
    const current = this.getSnapshot();
    const callId = current.callId;
    if (callId === undefined) return;
    if (current.status === "incoming") {
      this.dismiss(callId);
      return;
    }
    if (current.status === "ended" || current.status === "error") return;
    const leave = this.#backend.leave;
    const connectionId =
      this.#media?.connectionId ?? this.#backend.connectionId?.(callId);
    await this.#finish(
      callId,
      "left",
      (signal) =>
        leave === undefined
          ? Promise.resolve()
          : leave.call(this.#backend, callId, connectionId, signal),
      { leave: leave === undefined },
    );
  }

  /** End the displayed call for every participant. */
  async end(): Promise<void> {
    const callId = this.getSnapshot().callId;
    if (callId !== undefined)
      await this.#finish(callId, "hangup", (signal) =>
        this.#backend.hangup(callId, signal),
      );
  }

  /** Same as {@link end}: ends the call for every participant. */
  hangup(): Promise<void> {
    return this.end();
  }

  setMuted(muted: {
    readonly audio?: boolean;
    readonly video?: boolean;
  }): void {
    this.assertActive();
    this.#media?.setMuted(muted);
    const current = this.getSnapshot();
    this.transition({
      ...callFields(current),
      status: current.status,
      audioMuted: muted.audio ?? current.audioMuted,
      videoMuted: muted.video ?? current.videoMuted,
    });
  }
  /**
   * Whether an audio→video upgrade is possible right now: the call carries
   * video, the call is not already video, and the media session can
   * renegotiate.
   */
  get canEnableVideo(): boolean {
    const current = this.getSnapshot();
    return (
      current.capabilities.video &&
      !current.video &&
      this.#media?.enableVideo !== undefined
    );
  }

  /**
   * Start sending the camera on an audio call and renegotiate on the same
   * connection. No-op when the call has no video, when video is already on,
   * or when the media session cannot renegotiate.
   */
  async enableVideo(): Promise<void> {
    this.assertActive();
    const current = this.getSnapshot();
    const media = this.#media;
    if (
      !current.capabilities.video ||
      current.video ||
      media?.enableVideo === undefined
    )
      return;
    await media.enableVideo(
      this.#abort.signal,
      this.getSnapshot().selectedDevices,
    );
    const after = this.getSnapshot();
    if (this.#abort.signal.aborted) return;
    if (
      after.callId !== current.callId ||
      after.status === "ended" ||
      after.status === "error"
    )
      return;
    this.transition({
      ...callFields(after),
      status: after.status,
      video: true,
      videoMuted: false,
    });
  }

  /** Choose the devices the next call acquires (and the speaker the UI plays through). */
  setPreferredDevices(devices: SelectedCallDevices): void {
    this.assertActive();
    const current = this.getSnapshot();
    this.transition({
      ...callFields(current),
      status: current.status,
      selectedDevices: { ...current.selectedDevices, ...devices },
    });
  }

  /**
   * Switch the live microphone or camera mid-call (the outgoing track is
   * replaced in place, mute state carries over) and remember the choice for
   * the next call.
   */
  async switchDevice(
    kind: "audioInput" | "videoInput",
    deviceId: string,
  ): Promise<void> {
    if (this.#abort.signal.aborted) return;
    const previous = this.getSnapshot().selectedDevices[kind];
    const generation = (this.#deviceSwitches.get(kind) ?? 0) + 1;
    this.#deviceSwitches.set(kind, generation);
    this.setPreferredDevices({ [kind]: deviceId });
    const media = this.#media;
    if (media?.switchInput === undefined) return;
    try {
      await media.switchInput(
        kind === "audioInput" ? "audio" : "video",
        deviceId,
        this.#abort.signal,
      );
    } catch {
      // Device unavailable: the capture kept the old track, so the stored
      // preference goes back with it, unless a newer switch has landed.
      if (this.#deviceSwitches.get(kind) !== generation) return;
      if (this.#abort.signal.aborted) return;
      const current = this.getSnapshot();
      const restored: Record<string, string | undefined> = {
        ...current.selectedDevices,
      };
      if (previous === undefined) delete restored[kind];
      else restored[kind] = previous;
      this.transition({
        ...callFields(current),
        status: current.status,
        selectedDevices: restored as SelectedCallDevices,
      });
    }
  }

  /** Re-enumerate capture/playback devices into the snapshot. */
  async refreshDevices(): Promise<void> {
    this.assertActive();
    if (this.#mediaFactory.listDevices === undefined) return;
    const devices = await this.#mediaFactory.listDevices();
    if (this.#abort.signal.aborted) return;
    const current = this.getSnapshot();
    this.transition({
      ...callFields(current),
      status: current.status,
      devices,
    });
  }

  get localStream(): MediaStream | undefined {
    return this.#media?.localStream;
  }
  /** Merged call audio. */
  get remoteStream(): MediaStream | undefined {
    return this.#media?.remoteStream;
  }
  /** One video per remote source, keyed like `snapshot.remoteVideos`. */
  get remoteVideos(): readonly ParticipantVideo[] {
    if (this.#publicVideos.source !== this.#remoteVideos)
      this.#publicVideos = {
        source: this.#remoteVideos,
        videos: this.#remoteVideos.map((video) => ({
          ...videoInfo(video),
          stream: video.stream,
        })),
      };
    return this.#publicVideos.videos;
  }

  protected override onDispose(): void {
    this.#operation += 1;
    this.#clearResumption();
    this.#abort.abort();
    this.#unsubscribe?.();
    this.#unsubscribe = undefined;
    this.#backend.dispose?.();
    // Disposal leaves the call; it never ends it for other participants.
    void this.#closeMedia().catch(() => undefined);
  }

  #showInvitation(
    callId: string | undefined,
    action: string,
  ): CallsSnapshot & { callId: string } {
    this.assertActive();
    const current = this.getSnapshot();
    if (callId !== undefined && callId !== current.callId) {
      const invitation = this.#invitations.get(callId);
      if (invitation === undefined)
        throw new Error(
          `No incoming call ${callId} is available to ${action}.`,
        );
      if (ACTIVE.has(current.status))
        throw new Error(
          `Finish the active call before you ${action} another one.`,
        );
      this.#display(invitation);
    }
    const shown = this.getSnapshot();
    if (shown.status !== "incoming" || shown.callId === undefined)
      throw new Error(`No incoming call is available to ${action}.`);
    return shown as CallsSnapshot & { callId: string };
  }

  #display(invitation: CallInvitation): void {
    const capabilities = invitation.capabilities;
    this.#remoteVideos = [];
    this.transition({
      ...this.#baseFields(),
      status: "incoming",
      callId: invitation.callId,
      peer: invitation.from,
      direction: "incoming",
      capabilities,
      video: invitation.video && capabilities.video,
      audioMuted: false,
      videoMuted: false,
      ...invitationFields(invitation),
    });
  }

  async #accept(
    current: CallsSnapshot & { callId: string },
    options: { video: boolean; exclusive: boolean; join: boolean },
  ): Promise<void> {
    const operation = this.#begin(false);
    const callId = current.callId;
    this.#answering = callId;
    let offering = false;
    try {
      const signal = this.#abort.signal;
      const join = this.#backend.join;
      const result =
        options.join && join !== undefined
          ? await join.call(this.#backend, callId, signal, {
              video: options.video,
            })
          : await this.#backend.answer(callId, signal, {
              exclusive: options.exclusive,
              video: options.video,
            });
      if (operation !== this.#operation) return;
      this.#answered.add(callId);
      this.#invitations.delete(callId);
      const accepted = result ?? undefined;
      this.transition({
        ...callFields(this.getSnapshot(), false),
        status: "accepted",
        video: options.video,
        claimedByOther: false,
        canJoin: false,
        exclusive: accepted?.exclusive ?? options.exclusive,
        ...(accepted?.answeredBy ? { answeredBy: accepted.answeredBy } : {}),
      });
      offering = true;
      await this.#openMedia(callId, options.video, operation);
    } catch (cause) {
      if (
        !offering &&
        operation === this.#operation &&
        isCallClaimed(cause) &&
        !this.#abort.signal.aborted
      ) {
        // Another participant claimed it. Keep the invitation visible so the
        // application can stop ringing; never decline it.
        const invitation = this.#invitations.get(callId);
        if (invitation !== undefined) {
          const claimed: CallInvitation = {
            ...invitation,
            answered: true,
            exclusive: true,
            claimedByOther: true,
            canJoin: false,
          };
          this.#invitations.set(callId, claimed);
          const snapshot = this.getSnapshot();
          this.transition({
            ...callFields(snapshot, false),
            status: "incoming",
            ...invitationFields(claimed),
            error: {
              code: "call_claimed",
              message:
                cause instanceof Error
                  ? cause.message
                  : "Another participant claimed this call.",
              recoverable: false,
            },
          });
        }
        return;
      }
      this.#fail(
        cause,
        operation,
        options.join ? "join_failed" : "answer_failed",
        offering,
      );
    } finally {
      if (this.#answering === callId) this.#answering = undefined;
    }
  }

  #begin(closeMedia = true): number {
    this.assertActive();
    this.#operation += 1;
    this.#abort.abort();
    this.#abort = new AbortController();
    if (closeMedia) void this.#closeMedia().catch(() => undefined);
    return this.#operation;
  }
  async #openMedia(
    callId: string,
    video: boolean,
    operation: number,
  ): Promise<void> {
    this.transition({
      ...callFields(this.getSnapshot()),
      status: "connecting",
    });
    const connectionId = this.#backend.connectionId?.(callId);
    const media = await this.#mediaFactory.open(
      callId,
      video,
      {
        onConnectionState: (state) => this.#connection(callId, state),
        onIceConnectionState: (state) => this.#ice(callId, state),
        onRemoteStream: () => {
          const current = this.getSnapshot();
          if (current.callId === callId)
            this.transition({ ...callFields(current), status: current.status });
        },
        onRemoteVideos: (videos) => {
          const current = this.getSnapshot();
          if (current.callId !== callId || this.#media !== media) return;
          if (current.status === "ended" || current.status === "error") return;
          this.#remoteVideos = videos;
          this.transition({
            ...callFields(current),
            status: current.status,
            remoteVideos: videos.map(videoInfo),
          });
        },
      },
      this.#abort.signal,
      {
        devices: this.getSnapshot().selectedDevices,
        ...(connectionId === undefined ? {} : { connectionId }),
      },
    );
    if (operation !== this.#operation) {
      await media.close();
      return;
    }
    this.#media = media;
    const initial = media.remoteVideos ?? [];
    if (initial.length > 0) {
      this.#remoteVideos = initial;
      const current = this.getSnapshot();
      this.transition({
        ...callFields(current),
        status: current.status,
        remoteVideos: initial.map(videoInfo),
      });
    }
    // Mute pressed while capture was still being acquired only reached the
    // snapshot. Apply it now.
    const pending = this.getSnapshot();
    if (pending.audioMuted || pending.videoMuted)
      media.setMuted({ audio: pending.audioMuted, video: pending.videoMuted });
  }
  #connection(callId: string, state: RTCPeerConnectionState): void {
    const current = this.getSnapshot();
    if (current.callId !== callId) return;
    // A terminal snapshot keeps its callId: late callbacks must not revive it.
    if (current.status === "ended" || current.status === "error") return;
    if (state === "connected") {
      const call = this.call;
      if (call !== undefined) {
        call.mediaConnected();
        if (current.status !== "reconnecting") return;
        if (call.state !== "connected") return;
      }
      this.#clearResumption();
      this.transition({
        ...callFields(current),
        status: "connected",
        connectedAt: current.connectedAt ?? this.#now(),
      });
    } else if (state === "closed") {
      void this.#closeMedia().catch(() => undefined);
      this.#advance({
        ...callFields(current, false),
        status: "ended",
        endReason: "connection_failed",
      });
    } else if (state === "failed") {
      // One ICE restart within the resumption window before giving up.
      this.#beginResumption(callId, 0);
    }
  }
  #ice(callId: string, state: RTCIceConnectionState): void {
    const current = this.getSnapshot();
    if (current.callId !== callId) return;
    if (state === "disconnected") {
      this.#beginResumption(callId, this.#iceRestartAfterMs);
      return;
    }
    if (state !== "connected" && state !== "completed") return;
    const resumed = this.#resumedFrom;
    this.#clearResumption();
    if (current.status !== "reconnecting") return;
    const status = resumed ?? "connected";
    this.transition({
      ...callFields(current),
      status,
      ...(status === "connected"
        ? { connectedAt: current.connectedAt ?? this.#now() }
        : {}),
    });
  }
  /**
   * Media dropped on a live call: show `reconnecting`, try an ICE restart
   * after `restartAfterMs`, and end the call locally as `connection_failed`
   * once the resumption window closes without media coming back.
   */
  #beginResumption(callId: string, restartAfterMs: number): void {
    if (this.#giveUpTimer !== undefined) return;
    const current = this.getSnapshot();
    if (current.status !== "connected" && current.status !== "connecting")
      return;
    this.#resumedFrom = current.status;
    this.transition({ ...callFields(current), status: "reconnecting" });
    this.#giveUpTimer = this.#setTimeout(() => {
      this.#giveUpTimer = undefined;
      this.#clearResumption();
      const now = this.getSnapshot();
      if (now.callId !== callId || now.status !== "reconnecting") return;
      void this.#closeMedia().catch(() => undefined);
      this.#advance({
        ...callFields(now, false),
        status: "ended",
        endReason: "connection_failed",
      });
    }, this.#resumptionWindowMs);
    this.#resumeTimer = this.#setTimeout(() => {
      this.#resumeTimer = undefined;
      const media = this.#media;
      if (media?.restartIce === undefined) return;
      if (this.getSnapshot().callId !== callId) return;
      void media.restartIce(this.#abort.signal).catch(() => undefined);
    }, restartAfterMs);
  }
  #clearResumption(): void {
    this.#resumedFrom = undefined;
    if (this.#resumeTimer !== undefined) {
      this.#clearTimeout(this.#resumeTimer);
      this.#resumeTimer = undefined;
    }
    if (this.#giveUpTimer !== undefined) {
      this.#clearTimeout(this.#giveUpTimer);
      this.#giveUpTimer = undefined;
    }
  }
  async #finish(
    callId: string,
    reason: CallEndReason,
    action: (signal: AbortSignal) => Promise<void>,
    close: { readonly leave: boolean } = { leave: false },
  ): Promise<void> {
    const operation = this.#operation;
    try {
      await action(this.#abort.signal);
    } catch (cause) {
      if (operation !== this.#operation || this.#abort.signal.aborted) return;
      // A refused control request does not end the remote call. Keep its live
      // state and media so the visible controls can retry.
      this.transition({
        ...this.getSnapshot(),
        error: {
          code: "call_control_failed",
          message:
            cause instanceof Error ? cause.message : "Call operation failed.",
          recoverable: true,
        },
      });
      return;
    }
    if (operation !== this.#operation) return;
    const finishedOperation = ++this.#operation;
    this.#invitations.delete(callId);
    try {
      await this.#closeMedia(close);
    } finally {
      if (finishedOperation === this.#operation)
        this.#advance({
          ...callFields(this.getSnapshot(), false),
          status: "ended",
          endReason: reason,
        });
    }
  }

  /**
   * Apply a terminal (or dismissed) snapshot, then show the next ringing
   * invitation, if any, so a waiting call is never hidden.
   */
  #advance(next: Omit<CallsSnapshot, "revision" | "updatedAt">): void {
    this.#remoteVideos = [];
    const closedId = next.callId;
    if (closedId !== undefined) this.#invitations.delete(closedId);
    const waiting = [...this.#invitations.values()][0];
    if (waiting !== undefined) {
      this.#display(waiting);
      return;
    }
    this.transition({
      ...next,
      invitations: [...this.#invitations.values()],
      remoteVideos: [],
    });
  }

  #receive(event: CallLifecycleEvent): void {
    const current = this.getSnapshot();
    if (event.type === "incomingCall") {
      if (this.#invitations.has(event.call.callId)) return;
      if (this.#answered.has(event.call.callId)) return;
      const invitation: CallInvitation = {
        callId: event.call.callId,
        from: event.call.from,
        video: event.call.video,
        capabilities: capabilitiesOf(event.call.capabilities),
        answered: false,
        exclusive: false,
        claimedByOther: false,
        canJoin: false,
      };
      this.#invitations.set(invitation.callId, invitation);
      if (["idle", "ready", "ended", "error"].includes(current.status)) {
        this.#display(invitation);
        return;
      }
      // Another call is showing: keep this one listed. Never decline it.
      this.transition({ ...callFields(current), status: current.status });
      return;
    }

    const displayed = current.callId === event.callId;
    const invitation = this.#invitations.get(event.callId);
    if (!displayed) {
      if (invitation === undefined) return;
      if (event.type === "ended") {
        this.#invitations.delete(event.callId);
        this.transition({ ...callFields(current), status: current.status });
      } else if (event.type === "accepted") {
        this.#invitations.set(
          event.callId,
          claimFrom(invitation, event, false),
        );
        this.transition({ ...callFields(current), status: current.status });
      }
      return;
    }

    // A terminal snapshot keeps its callId; only `ended` stays idempotent.
    if (
      event.type !== "ended" &&
      (current.status === "ended" || current.status === "error")
    )
      return;
    switch (event.type) {
      case "ended": {
        if (current.status === "ended") return;
        this.#operation += 1;
        this.#abort.abort();
        this.#abort = new AbortController();
        void this.#closeMedia({ leave: false }).catch(() => undefined);
        this.#advance({
          ...callFields(current, false),
          status: "ended",
          ...(event.reason === undefined ? {} : { endReason: event.reason }),
        });
        return;
      }
      case "accepted": {
        if (current.status === "incoming" && invitation !== undefined) {
          const ours = this.#answering === event.callId;
          const next = claimFrom(invitation, event, ours);
          this.#invitations.set(event.callId, next);
          this.transition({
            ...callFields(current),
            status: "incoming",
            ...invitationFields(next),
          });
          return;
        }
        // The remote party picked up a call this client placed.
        if (current.status === "ringing")
          this.transition({ ...callFields(current), status: "accepted" });
        return;
      }
      case "videostate":
        this.transition({
          ...callFields(current),
          status: current.status,
          video: event.video,
        });
        return;
      case "participant": {
        const others = current.participants.filter(
          (p) => p.id !== event.participant.id,
        );
        this.transition({
          ...callFields(current),
          status: current.status,
          participants: [...others, event.participant],
        });
        return;
      }
      case "participantLeft": {
        if (!current.participants.some((p) => p.id === event.participantId))
          return;
        this.transition({
          ...callFields(current),
          status: current.status,
          participants: current.participants.filter(
            (p) => p.id !== event.participantId,
          ),
        });
        return;
      }
      case "connected":
        // The backend can beat the WebRTC callback to this.
        this.#clearResumption();
        this.transition({
          ...callFields(current),
          status: "connected",
          connectedAt: current.connectedAt ?? this.#now(),
        });
        return;
      case "ringing":
        this.transition({ ...callFields(current), status: "ringing" });
        return;
    }
  }

  /** Fields every new displayed call starts from. */
  #baseFields(): Omit<CallsSnapshot, "revision" | "updatedAt" | "status"> {
    const { devices, selectedDevices } = this.getSnapshot();
    return {
      capabilities: DEFAULT_CAPABILITIES,
      video: false,
      audioMuted: false,
      videoMuted: false,
      devices,
      selectedDevices,
      invitations: [...this.#invitations.values()],
      ...EMPTY_CALL,
    };
  }

  async #closeMedia(options: { readonly leave?: boolean } = {}): Promise<void> {
    this.#clearResumption();
    const media = this.#media;
    this.#media = undefined;
    await media?.close(options);
  }
  #fail(
    cause: unknown,
    operation: number,
    code: string,
    fromOffer = false,
  ): void {
    if (operation !== this.#operation || this.#abort.signal.aborted) return;
    void this.#closeMedia().catch(() => undefined);
    // A pod-lost (410) or capacity (503) answer to the offer ends the call.
    const status = fromOffer
      ? (cause as { readonly status?: unknown } | null)?.status
      : undefined;
    const terminal =
      typeof status === "number" ? TERMINAL_OFFER_REASONS[status] : undefined;
    if (terminal !== undefined) {
      this.#advance({
        ...callFields(this.getSnapshot(), false),
        status: "ended",
        endReason: terminal,
      });
      return;
    }
    this.transition({
      ...callFields(this.getSnapshot()),
      status: "error",
      error: {
        code,
        message:
          cause instanceof Error ? cause.message : "Call operation failed.",
        recoverable: true,
      },
    });
  }

  /** Keeps `invitations` current on every transition. */
  protected override transition(
    next: Omit<CallsSnapshot, "revision" | "updatedAt">,
  ): void {
    super.transition({ ...next, invitations: [...this.#invitations.values()] });
  }
}

function claimFrom(
  invitation: CallInvitation,
  event: Extract<CallLifecycleEvent, { type: "accepted" }>,
  ours: boolean,
): CallInvitation {
  const exclusive = event.exclusive === true;
  const claimedByOther = ours ? false : (event.claimedByOther ?? exclusive);
  return {
    ...invitation,
    answered: true,
    ...(event.answeredBy === undefined ? {} : { answeredBy: event.answeredBy }),
    exclusive,
    claimedByOther,
    canJoin: !exclusive && !claimedByOther,
  };
}

function invitationFields(
  invitation: CallInvitation,
): Pick<
  CallsSnapshot,
  "claimedByOther" | "canJoin" | "exclusive" | "answeredBy"
> {
  return {
    claimedByOther: invitation.claimedByOther,
    canJoin: invitation.canJoin,
    exclusive: invitation.exclusive,
    ...(invitation.answeredBy === undefined
      ? {}
      : { answeredBy: invitation.answeredBy }),
  };
}

function videoInfo(video: RemoteVideo): RemoteVideoInfo {
  return {
    key: video.key,
    label:
      video.participant?.phoneNumber ??
      video.participant?.id ??
      video.connectionParticipant ??
      video.connectionId ??
      video.key,
    ...(video.connectionId === undefined
      ? {}
      : { connectionId: video.connectionId }),
    ...(video.connectionParticipant === undefined
      ? {}
      : { connectionParticipant: video.connectionParticipant }),
    ...(video.participant === undefined
      ? {}
      : { participant: video.participant }),
  };
}

function callFields(
  snapshot: CallsSnapshot,
  preserveError = true,
): Omit<CallsSnapshot, "revision" | "updatedAt" | "status"> {
  return {
    ...(snapshot.callId === undefined ? {} : { callId: snapshot.callId }),
    ...(snapshot.peer === undefined ? {} : { peer: snapshot.peer }),
    ...(snapshot.direction === undefined
      ? {}
      : { direction: snapshot.direction }),
    capabilities: snapshot.capabilities,
    video: snapshot.video,
    audioMuted: snapshot.audioMuted,
    videoMuted: snapshot.videoMuted,
    ...(snapshot.connectedAt === undefined
      ? {}
      : { connectedAt: snapshot.connectedAt }),
    devices: snapshot.devices,
    selectedDevices: snapshot.selectedDevices,
    ...(snapshot.endReason === undefined
      ? {}
      : { endReason: snapshot.endReason }),
    ...(!preserveError || snapshot.error === undefined
      ? {}
      : { error: snapshot.error }),
    invitations: snapshot.invitations,
    claimedByOther: snapshot.claimedByOther,
    canJoin: snapshot.canJoin,
    exclusive: snapshot.exclusive,
    ...(snapshot.answeredBy === undefined
      ? {}
      : { answeredBy: snapshot.answeredBy }),
    participants: snapshot.participants,
    remoteVideos: snapshot.remoteVideos,
  };
}
