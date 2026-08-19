import {
  ObservableController,
  type ControllerSnapshot,
} from "../controller.js";

export type CallDirection = "incoming" | "outgoing";
export type CallMediaKind = "audio" | "video";
export type CallPhase =
  | "idle"
  | "initializing"
  | "ready"
  | "incoming"
  | "ringing"
  | "waiting_room"
  | "connecting"
  | "active"
  | "reconnecting"
  | "permission_denied"
  | "devices_unavailable"
  | "ending"
  | "ended"
  | "error";
export type CallEndReason =
  "local_hangup" | "remote_hangup" | "rejected" | "missed" | "busy" | "failed";
export type MediaPermission = "prompt" | "granted" | "denied" | "unavailable";

export interface CallCapabilities {
  readonly video: boolean;
  readonly waitingRoom: boolean;
  readonly reactions: boolean;
  readonly handRaise: boolean;
}
export interface MediaDevice {
  readonly id: string;
  readonly kind: "audio_input" | "audio_output" | "video_input";
  readonly label: string;
}
export interface MediaPermissions {
  readonly microphone: MediaPermission;
  readonly camera: MediaPermission;
}
export interface CallParticipant {
  readonly id: string;
  readonly displayName: string;
  readonly role: "host" | "participant";
  readonly state: "invited" | "waiting" | "connecting" | "connected" | "left";
  readonly muted?: boolean;
  readonly videoEnabled?: boolean;
  readonly activeSpeaker?: boolean;
  readonly handRaised?: boolean;
}
export interface StartCallInput {
  readonly conversationId: string;
  readonly mediaKind: CallMediaKind;
  readonly participantIds?: readonly string[];
}

export type CallEvent =
  | {
      readonly type: "incoming";
      readonly callId: string;
      readonly conversationId: string;
      readonly mediaKind: CallMediaKind;
    }
  | {
      readonly type: "phase";
      readonly callId: string;
      readonly phase:
        "ringing" | "waiting_room" | "connecting" | "active" | "reconnecting";
    }
  | {
      readonly type: "participants";
      readonly callId: string;
      readonly participants: readonly CallParticipant[];
    }
  | {
      readonly type: "ended";
      readonly callId: string;
      readonly reason: CallEndReason;
    }
  | { readonly type: "devices"; readonly devices: readonly MediaDevice[] }
  | { readonly type: "permission"; readonly permissions: MediaPermissions }
  | {
      readonly type: "failure";
      readonly callId?: string;
      readonly code: string;
      readonly message: string;
      readonly recoverable: boolean;
    };

export interface CallsTransport {
  initialize(signal: AbortSignal): Promise<{
    readonly capabilities: CallCapabilities;
    readonly devices: readonly MediaDevice[];
    readonly permissions: MediaPermissions;
  }>;
  subscribe(listener: (event: CallEvent) => void): () => void;
  start(
    input: StartCallInput,
    signal: AbortSignal,
  ): Promise<{ readonly callId: string }>;
  answer(callId: string, signal: AbortSignal): Promise<void>;
  reject(callId: string, signal: AbortSignal): Promise<void>;
  hangUp(callId: string, signal: AbortSignal): Promise<void>;
  setDevice(
    callId: string,
    kind: MediaDevice["kind"],
    deviceId: string,
    signal: AbortSignal,
  ): Promise<void>;
  setMuted(callId: string, muted: boolean, signal: AbortSignal): Promise<void>;
  setVideoEnabled(
    callId: string,
    enabled: boolean,
    signal: AbortSignal,
  ): Promise<void>;
  sendReaction(
    callId: string,
    emoji: string,
    signal: AbortSignal,
  ): Promise<void>;
  setHandRaised(
    callId: string,
    raised: boolean,
    signal: AbortSignal,
  ): Promise<void>;
  admit(
    callId: string,
    participantId: string,
    signal: AbortSignal,
  ): Promise<void>;
  deny(
    callId: string,
    participantId: string,
    signal: AbortSignal,
  ): Promise<void>;
  selectVideoParticipant(
    callId: string,
    participantId: string | undefined,
    signal: AbortSignal,
  ): Promise<void>;
  releaseMedia(callId?: string): Promise<void> | void;
}

export interface CallError {
  readonly code: string;
  readonly message: string;
  readonly recoverable: boolean;
}
export interface CallsSnapshot extends ControllerSnapshot {
  readonly phase: CallPhase;
  readonly callId?: string;
  readonly conversationId?: string;
  readonly direction?: CallDirection;
  readonly mediaKind?: CallMediaKind;
  readonly capabilities?: CallCapabilities;
  readonly devices: readonly MediaDevice[];
  readonly permissions: MediaPermissions;
  readonly participants: readonly CallParticipant[];
  readonly selectedVideoParticipantId?: string;
  readonly muted: boolean;
  readonly videoEnabled: boolean;
  readonly handRaised: boolean;
  readonly endReason?: CallEndReason;
  readonly error?: CallError;
}

const DEFAULT_PERMISSIONS: MediaPermissions = {
  microphone: "prompt",
  camera: "prompt",
};

export class CallsController extends ObservableController<CallsSnapshot> {
  readonly #transport: CallsTransport;
  #abort = new AbortController();
  #unsubscribe: (() => void) | undefined;
  #operation = 0;
  #commands: Promise<void> = Promise.resolve();
  #lastStart: StartCallInput | undefined;

  constructor(transport: CallsTransport, now: () => number = Date.now) {
    super(
      {
        phase: "idle",
        devices: [],
        permissions: DEFAULT_PERMISSIONS,
        participants: [],
        muted: false,
        videoEnabled: false,
        handRaised: false,
      },
      now,
    );
    this.#transport = transport;
  }

  async initialize(): Promise<void> {
    const operation = this.#beginOperation();
    this.transition({
      ...callFields(this.getSnapshot()),
      phase: "initializing",
    });
    try {
      const initialized = await this.#transport.initialize(this.#abort.signal);
      if (operation !== this.#operation) return;
      this.transition({
        ...callFields(this.getSnapshot()),
        phase: permissionPhase(initialized.permissions, initialized.devices),
        ...initialized,
      });
      this.#unsubscribe?.();
      this.#unsubscribe = this.#transport.subscribe((event) =>
        this.#receive(event),
      );
    } catch (cause) {
      this.#fail(cause, operation, "initialization_failed");
    }
  }

  async start(input: StartCallInput): Promise<void> {
    this.assertActive();
    this.#lastStart = {
      ...input,
      ...(input.participantIds === undefined
        ? {}
        : { participantIds: [...input.participantIds] }),
    };
    const operation = ++this.#operation;
    this.transition({
      ...callFields(this.getSnapshot()),
      phase: "connecting",
      conversationId: input.conversationId,
      direction: "outgoing",
      mediaKind: input.mediaKind,
    });
    try {
      const call = await this.#transport.start(input, this.#abort.signal);
      if (operation !== this.#operation) return;
      this.transition({
        ...callFields(this.getSnapshot()),
        phase: "ringing",
        callId: call.callId,
        conversationId: input.conversationId,
        direction: "outgoing",
        mediaKind: input.mediaKind,
      });
    } catch (cause) {
      this.#fail(cause, operation, "start_failed");
    }
  }

  async retry(): Promise<void> {
    if (this.#lastStart === undefined)
      throw new Error("No outgoing call is available to retry.");
    await this.start(this.#lastStart);
  }
  async answer(): Promise<void> {
    const callId = this.#requireCall();
    await this.#command((signal) => this.#transport.answer(callId, signal));
    this.transition({ ...callFields(this.getSnapshot()), phase: "connecting" });
  }
  async reject(): Promise<void> {
    await this.#finish("rejected", (id, signal) =>
      this.#transport.reject(id, signal),
    );
  }
  async hangUp(): Promise<void> {
    await this.#finish("local_hangup", (id, signal) =>
      this.#transport.hangUp(id, signal),
    );
  }
  setDevice(kind: MediaDevice["kind"], deviceId: string): Promise<void> {
    const id = this.#requireCall();
    return this.#command((signal) =>
      this.#transport.setDevice(id, kind, deviceId, signal),
    );
  }
  async setMuted(muted: boolean): Promise<void> {
    const id = this.#requireCall();
    await this.#command((signal) =>
      this.#transport.setMuted(id, muted, signal),
    );
    const current = this.getSnapshot();
    this.transition({ ...callFields(current), phase: current.phase, muted });
  }
  async setVideoEnabled(videoEnabled: boolean): Promise<void> {
    const id = this.#requireCall();
    await this.#command((signal) =>
      this.#transport.setVideoEnabled(id, videoEnabled, signal),
    );
    const current = this.getSnapshot();
    this.transition({
      ...callFields(current),
      phase: current.phase,
      videoEnabled,
    });
  }
  sendReaction(emoji: string): Promise<void> {
    const id = this.#requireCall();
    return this.#command((signal) =>
      this.#transport.sendReaction(id, emoji, signal),
    );
  }
  async setHandRaised(handRaised: boolean): Promise<void> {
    const id = this.#requireCall();
    await this.#command((signal) =>
      this.#transport.setHandRaised(id, handRaised, signal),
    );
    const current = this.getSnapshot();
    this.transition({
      ...callFields(current),
      phase: current.phase,
      handRaised,
    });
  }
  admit(participantId: string): Promise<void> {
    const id = this.#requireCall();
    return this.#command((signal) =>
      this.#transport.admit(id, participantId, signal),
    );
  }
  deny(participantId: string): Promise<void> {
    const id = this.#requireCall();
    return this.#command((signal) =>
      this.#transport.deny(id, participantId, signal),
    );
  }
  async selectVideoParticipant(participantId?: string): Promise<void> {
    const id = this.#requireCall();
    await this.#command((signal) =>
      this.#transport.selectVideoParticipant(id, participantId, signal),
    );
    const current = this.getSnapshot();
    this.transition({
      ...callFieldsWithoutSelection(current),
      phase: current.phase,
      ...(participantId === undefined
        ? {}
        : { selectedVideoParticipantId: participantId }),
    });
  }

  protected override onDispose(): void {
    this.#operation += 1;
    this.#abort.abort();
    this.#unsubscribe?.();
    this.#unsubscribe = undefined;
    void this.#transport.releaseMedia(this.getSnapshot().callId);
  }
  #beginOperation(): number {
    this.assertActive();
    this.#operation += 1;
    this.#abort.abort();
    this.#abort = new AbortController();
    return this.#operation;
  }
  #requireCall(): string {
    this.assertActive();
    const id = this.getSnapshot().callId;
    if (id === undefined) throw new Error("No call is active.");
    return id;
  }
  #command(action: (signal: AbortSignal) => Promise<void>): Promise<void> {
    const task = this.#commands.then(() => action(this.#abort.signal));
    this.#commands = task.catch((cause) => {
      this.#transitionError(cause, "command_failed");
    });
    return task;
  }
  async #finish(
    reason: CallEndReason,
    action: (callId: string, signal: AbortSignal) => Promise<void>,
  ): Promise<void> {
    const callId = this.#requireCall();
    this.transition({ ...callFields(this.getSnapshot()), phase: "ending" });
    try {
      await this.#command((signal) => action(callId, signal));
      this.transition({
        ...callFields(this.getSnapshot()),
        phase: "ended",
        endReason: reason,
      });
    } finally {
      await this.#transport.releaseMedia(callId);
    }
  }
  #receive(event: CallEvent): void {
    const current = this.getSnapshot();
    if (
      "callId" in event &&
      event.type !== "incoming" &&
      current.callId !== undefined &&
      event.callId !== undefined &&
      event.callId !== current.callId
    )
      return;
    if (event.type === "incoming")
      this.transition({
        ...callFields(current),
        phase: "incoming",
        callId: event.callId,
        conversationId: event.conversationId,
        direction: "incoming",
        mediaKind: event.mediaKind,
      });
    else if (event.type === "phase")
      this.transition({
        ...callFields(current),
        phase: event.phase,
        callId: event.callId,
      });
    else if (event.type === "participants")
      this.transition({
        ...callFields(current),
        phase: current.phase,
        participants: event.participants,
      });
    else if (event.type === "permission")
      this.transition({
        ...callFields(current),
        phase: permissionPhase(event.permissions, current.devices),
        permissions: event.permissions,
      });
    else if (event.type === "devices")
      this.transition({
        ...callFields(current),
        phase: permissionPhase(current.permissions, event.devices),
        devices: event.devices,
      });
    else if (event.type === "ended") {
      this.transition({
        ...callFields(current),
        phase: "ended",
        endReason: event.reason,
      });
      void this.#transport.releaseMedia(event.callId);
    } else {
      this.#transitionError(event, event.code);
      void this.#transport.releaseMedia(current.callId);
    }
  }
  #fail(cause: unknown, operation: number, code: string): void {
    if (operation !== this.#operation || this.#abort.signal.aborted) return;
    this.#transitionError(cause, code);
    void this.#transport.releaseMedia(this.getSnapshot().callId);
  }
  #transitionError(cause: unknown, code: string): void {
    const error = isCallFailure(cause)
      ? {
          code: cause.code,
          message: cause.message,
          recoverable: cause.recoverable,
        }
      : {
          code,
          message:
            cause instanceof Error ? cause.message : "Call operation failed.",
          recoverable: true,
        };
    this.transition({
      ...callFields(this.getSnapshot()),
      phase: "error",
      error,
    });
  }
}

function callFields(
  snapshot: CallsSnapshot,
): Omit<CallsSnapshot, "revision" | "updatedAt" | "phase"> {
  return {
    ...(snapshot.callId === undefined ? {} : { callId: snapshot.callId }),
    ...(snapshot.conversationId === undefined
      ? {}
      : { conversationId: snapshot.conversationId }),
    ...(snapshot.direction === undefined
      ? {}
      : { direction: snapshot.direction }),
    ...(snapshot.mediaKind === undefined
      ? {}
      : { mediaKind: snapshot.mediaKind }),
    ...(snapshot.capabilities === undefined
      ? {}
      : { capabilities: snapshot.capabilities }),
    devices: snapshot.devices,
    permissions: snapshot.permissions,
    participants: snapshot.participants,
    ...(snapshot.selectedVideoParticipantId === undefined
      ? {}
      : { selectedVideoParticipantId: snapshot.selectedVideoParticipantId }),
    muted: snapshot.muted,
    videoEnabled: snapshot.videoEnabled,
    handRaised: snapshot.handRaised,
    ...(snapshot.endReason === undefined
      ? {}
      : { endReason: snapshot.endReason }),
    ...(snapshot.error === undefined ? {} : { error: snapshot.error }),
  };
}
function callFieldsWithoutSelection(snapshot: CallsSnapshot) {
  const fields = { ...callFields(snapshot) };
  delete fields.selectedVideoParticipantId;
  return fields;
}
function permissionPhase(
  permissions: MediaPermissions,
  devices: readonly MediaDevice[],
): CallPhase {
  if (permissions.microphone === "denied" || permissions.camera === "denied")
    return "permission_denied";
  if (devices.length === 0 || permissions.microphone === "unavailable")
    return "devices_unavailable";
  return "ready";
}
function isCallFailure(
  value: unknown,
): value is Extract<CallEvent, { type: "failure" }> {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    value.type === "failure"
  );
}
