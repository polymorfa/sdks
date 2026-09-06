import {
  ObservableController,
  type ControllerSnapshot,
} from "../controller.js";
import type { CallMediaFactory, CallMediaSession } from "./media.js";

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
 * Which Polymorfa calling line carries a call: a linked WhatsApp device
 * session (audio + video) or the WhatsApp Business Calling API (audio only).
 */
export type CallLine = "linkedDevice" | "cloudApi";

export interface CallCapabilities {
  readonly video: boolean;
  readonly mute: boolean;
}

export function capabilitiesFor(line: CallLine): CallCapabilities {
  return { video: line !== "cloudApi", mute: true };
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
  /** Defaults to `linkedDevice`. */
  readonly line?: CallLine;
}
export type CallLifecycleEvent =
  | { readonly type: "incomingCall"; readonly call: IncomingCall }
  | {
      readonly type: "ringing" | "accepted" | "connected";
      readonly callId: string;
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
    };
export interface PlaceCallInput {
  readonly to: string;
  readonly video: boolean;
  readonly line: CallLine;
  readonly idempotencyKey: string;
}
export interface CallsBackend {
  subscribe(listener: (event: CallLifecycleEvent) => void): () => void;
  place(
    input: PlaceCallInput,
    signal: AbortSignal,
  ): Promise<{ readonly callId: string }>;
  answer(callId: string, signal: AbortSignal): Promise<void>;
  reject(callId: string, signal: AbortSignal): Promise<void>;
  hangup(callId: string, signal: AbortSignal): Promise<void>;
}
export interface CallsSnapshot extends ControllerSnapshot {
  readonly status: CallStatus;
  readonly callId?: string;
  readonly peer?: string;
  readonly direction?: "incoming" | "outgoing";
  readonly line: CallLine;
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
  #resumeTimer: ReturnType<typeof setTimeout> | undefined;
  #giveUpTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    backend: CallsBackend,
    mediaFactory: CallMediaFactory,
    options: CallsControllerOptions = {},
  ) {
    super(
      {
        status: "idle",
        line: "linkedDevice",
        capabilities: capabilitiesFor("linkedDevice"),
        video: false,
        audioMuted: false,
        videoMuted: false,
        devices: [],
        selectedDevices: {},
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

  async place(
    to: string,
    options: { readonly video?: boolean; readonly line?: CallLine } = {},
  ): Promise<void> {
    const operation = this.#begin();
    const line = options.line ?? "linkedDevice";
    const capabilities = capabilitiesFor(line);
    const video = (options.video ?? false) && capabilities.video;
    try {
      const { callId } = await this.#backend.place(
        { to, video, line, idempotencyKey: this.#createKey() },
        this.#abort.signal,
      );
      if (operation !== this.#operation) return;
      this.transition({
        ...this.#deviceFields(),
        status: "ringing",
        callId,
        peer: to,
        direction: "outgoing",
        line,
        capabilities,
        video,
        audioMuted: false,
        videoMuted: false,
      });
      await this.#openMedia(callId, video, operation);
    } catch (cause) {
      this.#fail(cause, operation, "place_failed");
    }
  }

  async answer(options: { readonly video?: boolean } = {}): Promise<void> {
    const current = this.getSnapshot();
    if (current.status !== "incoming" || current.callId === undefined)
      throw new Error("No incoming call is available to answer.");
    const operation = this.#begin(false);
    const video =
      (options.video ?? current.video) && current.capabilities.video;
    try {
      await this.#backend.answer(current.callId, this.#abort.signal);
      if (operation !== this.#operation) return;
      this.transition({ ...callFields(current), status: "accepted", video });
      await this.#openMedia(current.callId, video, operation);
    } catch (cause) {
      this.#fail(cause, operation, "answer_failed");
    }
  }

  async reject(): Promise<void> {
    const current = this.#requireIncoming();
    await this.#finish(current.callId, "rejected", (signal) =>
      this.#backend.reject(current.callId, signal),
    );
  }
  async hangup(): Promise<void> {
    const callId = this.getSnapshot().callId;
    if (callId !== undefined)
      await this.#finish(callId, "hangup", (signal) =>
        this.#backend.hangup(callId, signal),
      );
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
   * Upgrade an audio call to video: acquires the camera, adds the track and
   * renegotiates on the same connection. No-op when the line has no video,
   * when video is already on, or when the media session cannot renegotiate.
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
    await media.enableVideo(this.#abort.signal);
    const after = this.getSnapshot();
    if (after.callId !== current.callId) return;
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
   * the next call. Without an active media session only the preference is
   * stored.
   */
  async switchDevice(
    kind: "audioInput" | "videoInput",
    deviceId: string,
  ): Promise<void> {
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
      // Device unavailable — keep the current capture.
    }
  }

  /** Re-enumerate capture/playback devices into the snapshot. */
  async refreshDevices(): Promise<void> {
    this.assertActive();
    if (this.#mediaFactory.listDevices === undefined) return;
    const devices = await this.#mediaFactory.listDevices();
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
  get remoteStream(): MediaStream | undefined {
    return this.#media?.remoteStream;
  }

  protected override onDispose(): void {
    this.#operation += 1;
    this.#clearResumption();
    this.#abort.abort();
    this.#unsubscribe?.();
    this.#unsubscribe = undefined;
    void this.#closeMedia();
  }

  #begin(closeMedia = true): number {
    this.assertActive();
    this.#operation += 1;
    this.#abort.abort();
    this.#abort = new AbortController();
    if (closeMedia) void this.#closeMedia();
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
      },
      this.#abort.signal,
      { devices: this.getSnapshot().selectedDevices },
    );
    if (operation !== this.#operation) {
      await media.close();
      return;
    }
    this.#media = media;
    // Mute pressed while the camera and microphone were still being acquired
    // only reached the snapshot — there were no tracks to silence yet. Apply
    // it now, or the UI would report muted over a live microphone.
    const pending = this.getSnapshot();
    if (pending.audioMuted || pending.videoMuted)
      media.setMuted({ audio: pending.audioMuted, video: pending.videoMuted });
  }
  #connection(callId: string, state: RTCPeerConnectionState): void {
    const current = this.getSnapshot();
    if (current.callId !== callId) return;
    if (state === "connected") {
      this.#clearResumption();
      this.transition({
        ...callFields(current),
        status: "connected",
        connectedAt: current.connectedAt ?? this.#now(),
      });
    } else if (state === "closed") {
      void this.#closeMedia();
      this.transition({
        ...callFields(current),
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
    this.#clearResumption();
    // A short ICE flap need not move `connectionState`, so recovery cannot
    // wait for `#connection` to put the call back: clearing the timers alone
    // would strand it in `reconnecting` for the rest of its life.
    if (current.status === "reconnecting")
      this.transition({
        ...callFields(current),
        status: "connected",
        connectedAt: current.connectedAt ?? this.#now(),
      });
  }
  /**
   * Media dropped on a live call: show `reconnecting`, try an ICE restart
   * after `restartAfterMs`, and end the call as `connection_failed` once the
   * resumption window closes without media coming back.
   */
  #beginResumption(callId: string, restartAfterMs: number): void {
    if (this.#giveUpTimer !== undefined) return;
    const current = this.getSnapshot();
    if (current.status !== "connected" && current.status !== "connecting")
      return;
    this.transition({ ...callFields(current), status: "reconnecting" });
    this.#giveUpTimer = this.#setTimeout(() => {
      this.#giveUpTimer = undefined;
      this.#clearResumption();
      const now = this.getSnapshot();
      if (now.callId !== callId || now.status !== "reconnecting") return;
      void this.#closeMedia();
      this.transition({
        ...callFields(now),
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
  ): Promise<void> {
    const operation = ++this.#operation;
    try {
      await action(this.#abort.signal);
    } catch (cause) {
      this.#fail(cause, operation, "call_control_failed");
      return;
    }
    await this.#closeMedia();
    if (operation === this.#operation)
      this.transition({
        ...callFields(this.getSnapshot()),
        status: "ended",
        endReason: reason,
      });
  }
  #receive(event: CallLifecycleEvent): void {
    const current = this.getSnapshot();
    if (
      event.type !== "incomingCall" &&
      current.callId !== undefined &&
      event.callId !== current.callId
    )
      return;
    if (event.type === "incomingCall") {
      if (!["idle", "ready", "ended"].includes(current.status)) return;
      const line = event.call.line ?? "linkedDevice";
      const capabilities = capabilitiesFor(line);
      this.transition({
        ...this.#deviceFields(),
        status: "incoming",
        callId: event.call.callId,
        peer: event.call.from,
        direction: "incoming",
        line,
        capabilities,
        video: event.call.video && capabilities.video,
        audioMuted: false,
        videoMuted: false,
      });
    } else if (event.type === "ended") {
      void this.#closeMedia();
      this.transition({
        ...callFields(current),
        status: "ended",
        ...(event.reason === undefined ? {} : { endReason: event.reason }),
      });
    } else if (event.type === "videostate") {
      this.transition({
        ...callFields(current),
        status: current.status,
        video: event.video,
      });
    } else {
      this.transition({ ...callFields(current), status: event.type });
    }
  }
  #deviceFields(): Pick<CallsSnapshot, "devices" | "selectedDevices"> {
    const { devices, selectedDevices } = this.getSnapshot();
    return { devices, selectedDevices };
  }

  #requireIncoming(): CallsSnapshot & { callId: string } {
    const current = this.getSnapshot();
    if (current.status !== "incoming" || current.callId === undefined)
      throw new Error("No incoming call is available to reject.");
    return current as CallsSnapshot & { callId: string };
  }
  async #closeMedia(): Promise<void> {
    this.#clearResumption();
    const media = this.#media;
    this.#media = undefined;
    await media?.close();
  }
  #fail(cause: unknown, operation: number, code: string): void {
    if (operation !== this.#operation || this.#abort.signal.aborted) return;
    void this.#closeMedia();
    // A pod-lost (410) or capacity/draining (503) answer to the offer is not
    // an error to retry: the call is over. Surface it as an ended call.
    const status = (cause as { readonly status?: unknown } | null)?.status;
    const terminal =
      typeof status === "number" ? TERMINAL_OFFER_REASONS[status] : undefined;
    if (terminal !== undefined) {
      this.transition({
        ...callFields(this.getSnapshot()),
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
}

function callFields(
  snapshot: CallsSnapshot,
): Omit<CallsSnapshot, "revision" | "updatedAt" | "status"> {
  return {
    ...(snapshot.callId === undefined ? {} : { callId: snapshot.callId }),
    ...(snapshot.peer === undefined ? {} : { peer: snapshot.peer }),
    ...(snapshot.direction === undefined
      ? {}
      : { direction: snapshot.direction }),
    line: snapshot.line,
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
    ...(snapshot.error === undefined ? {} : { error: snapshot.error }),
  };
}
