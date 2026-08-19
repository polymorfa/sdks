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
  | (string & {});
export interface IncomingCall {
  readonly callId: string;
  readonly from: string;
  readonly video: boolean;
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
  readonly video: boolean;
  readonly audioMuted: boolean;
  readonly videoMuted: boolean;
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
}

export class CallsController extends ObservableController<CallsSnapshot> {
  readonly #backend: CallsBackend;
  readonly #mediaFactory: CallMediaFactory;
  readonly #createKey: () => string;
  #abort = new AbortController();
  #unsubscribe: (() => void) | undefined;
  #media: CallMediaSession | undefined;
  #operation = 0;

  constructor(
    backend: CallsBackend,
    mediaFactory: CallMediaFactory,
    options: CallsControllerOptions = {},
  ) {
    super(
      { status: "idle", video: false, audioMuted: false, videoMuted: false },
      options.now,
    );
    this.#backend = backend;
    this.#mediaFactory = mediaFactory;
    this.#createKey =
      options.createIdempotencyKey ?? (() => crypto.randomUUID());
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
    options: { readonly video?: boolean } = {},
  ): Promise<void> {
    const operation = this.#begin();
    const video = options.video ?? false;
    try {
      const { callId } = await this.#backend.place(
        { to, video, idempotencyKey: this.#createKey() },
        this.#abort.signal,
      );
      if (operation !== this.#operation) return;
      this.transition({
        status: "ringing",
        callId,
        peer: to,
        direction: "outgoing",
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
    const video = options.video ?? current.video;
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
  get localStream(): MediaStream | undefined {
    return this.#media?.localStream;
  }
  get remoteStream(): MediaStream | undefined {
    return this.#media?.remoteStream;
  }

  protected override onDispose(): void {
    this.#operation += 1;
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
        onRemoteStream: () => {
          const current = this.getSnapshot();
          if (current.callId === callId)
            this.transition({ ...callFields(current), status: current.status });
        },
      },
      this.#abort.signal,
    );
    if (operation !== this.#operation) {
      await media.close();
      return;
    }
    this.#media = media;
  }
  #connection(callId: string, state: RTCPeerConnectionState): void {
    const current = this.getSnapshot();
    if (current.callId !== callId) return;
    if (state === "connected")
      this.transition({ ...callFields(current), status: "connected" });
    else if (state === "failed" || state === "closed") {
      void this.#closeMedia();
      this.transition({
        ...callFields(current),
        status: "ended",
        endReason: "connection_failed",
      });
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
      this.transition({
        status: "incoming",
        callId: event.call.callId,
        peer: event.call.from,
        direction: "incoming",
        video: event.call.video,
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
  #requireIncoming(): CallsSnapshot & { callId: string } {
    const current = this.getSnapshot();
    if (current.status !== "incoming" || current.callId === undefined)
      throw new Error("No incoming call is available to reject.");
    return current as CallsSnapshot & { callId: string };
  }
  async #closeMedia(): Promise<void> {
    const media = this.#media;
    this.#media = undefined;
    await media?.close();
  }
  #fail(cause: unknown, operation: number, code: string): void {
    if (operation !== this.#operation || this.#abort.signal.aborted) return;
    void this.#closeMedia();
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
    video: snapshot.video,
    audioMuted: snapshot.audioMuted,
    videoMuted: snapshot.videoMuted,
    ...(snapshot.endReason === undefined
      ? {}
      : { endReason: snapshot.endReason }),
    ...(snapshot.error === undefined ? {} : { error: snapshot.error }),
  };
}
