import {
  ObservableController,
  type ControllerSnapshot,
} from "../controller.js";

export type VoiceNoteStatus =
  "idle" | "requesting" | "recording" | "stopping" | "error";

/** Why the last recording attempt failed. */
export type VoiceNoteError = "permission-denied" | "unavailable" | "failed";

export interface VoiceNoteRecorderSnapshot extends ControllerSnapshot {
  readonly status: VoiceNoteStatus;
  /** Milliseconds recorded so far; `0` when idle. */
  readonly elapsed: number;
  /** Input level from `0` to `1`, updated about every animation frame. */
  readonly level: number;
  /** Container type of the recording: `audio/webm`, `audio/ogg`, or `audio/mp4`. */
  readonly mimeType?: string;
  readonly error?: VoiceNoteError;
}

type MediaRecorderLike = Pick<
  MediaRecorder,
  "start" | "stop" | "state" | "mimeType"
> & {
  ondataavailable: ((event: { readonly data: Blob }) => void) | null;
  onstop: (() => void) | null;
  onerror: (() => void) | null;
};

export interface MediaRecorderConstructor {
  new (stream: MediaStream, options?: { mimeType?: string }): MediaRecorderLike;
  isTypeSupported?(type: string): boolean;
}

type AudioContextLike = {
  createMediaStreamSource(stream: MediaStream): {
    connect(node: unknown): void;
  };
  createAnalyser(): Pick<
    AnalyserNode,
    "fftSize" | "frequencyBinCount" | "getByteTimeDomainData"
  >;
  close(): Promise<void>;
};

export interface VoiceNoteRecorderOptions {
  readonly mediaDevices?: Pick<MediaDevices, "getUserMedia">;
  readonly MediaRecorder?: MediaRecorderConstructor;
  /** Pass `null` to skip the level meter. */
  readonly AudioContext?: (new () => AudioContextLike) | null;
  readonly requestAnimationFrame?: (callback: () => void) => number;
  readonly cancelAnimationFrame?: (handle: number) => void;
  readonly now?: () => number;
  /** Shortest interval between published level updates. Defaults to 50 ms. */
  readonly updateInterval?: number;
}

const CANDIDATE_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/ogg",
  "audio/mp4",
] as const;

function environment(options: VoiceNoteRecorderOptions) {
  const scope = globalThis as {
    navigator?: { mediaDevices?: Pick<MediaDevices, "getUserMedia"> };
    MediaRecorder?: MediaRecorderConstructor;
    AudioContext?: new () => AudioContextLike;
    webkitAudioContext?: new () => AudioContextLike;
  };
  return {
    mediaDevices: options.mediaDevices ?? scope.navigator?.mediaDevices,
    Recorder: options.MediaRecorder ?? scope.MediaRecorder,
    Audio:
      options.AudioContext === null
        ? undefined
        : (options.AudioContext ??
          scope.AudioContext ??
          scope.webkitAudioContext),
  };
}

function errorKind(cause: unknown): VoiceNoteError {
  const name = (cause as { name?: unknown } | null)?.name;
  if (name === "NotAllowedError" || name === "SecurityError")
    return "permission-denied";
  if (name === "NotFoundError" || name === "OverconstrainedError")
    return "unavailable";
  return "failed";
}

/**
 * Records a voice note from the microphone with `getUserMedia` and
 * `MediaRecorder`, publishing status, elapsed time, and input level.
 * `stop()` resolves with the recording as a `File`; `cancel()` discards it.
 * Microphone tracks stop whenever recording ends and on `dispose()`.
 */
export class VoiceNoteRecorder extends ObservableController<VoiceNoteRecorderSnapshot> {
  readonly #options: VoiceNoteRecorderOptions;
  readonly #clock: () => number;
  #stream: MediaStream | undefined;
  #recorder: MediaRecorderLike | undefined;
  #audio: AudioContextLike | undefined;
  #frame: number | undefined;
  #timer: ReturnType<typeof setInterval> | undefined;
  #chunks: Blob[] = [];
  #startedAt = 0;
  #lastPublish = 0;
  #attempt = 0;
  #finish: ((file: File | undefined) => void) | undefined;

  constructor(options: VoiceNoteRecorderOptions = {}) {
    super({ status: "idle", elapsed: 0, level: 0 }, options.now);
    this.#options = options;
    this.#clock = options.now ?? Date.now;
  }

  /** Whether this environment can record: `getUserMedia` and `MediaRecorder`. */
  static isSupported(options: VoiceNoteRecorderOptions = {}): boolean {
    const { mediaDevices, Recorder } = environment(options);
    return (
      typeof mediaDevices?.getUserMedia === "function" &&
      typeof Recorder === "function"
    );
  }

  /** Ask for the microphone and start recording. Resolves once recording. */
  async start(): Promise<void> {
    this.assertActive();
    const status = this.getSnapshot().status;
    if (status === "requesting" || status === "recording") return;
    const { mediaDevices, Recorder, Audio } = environment(this.#options);
    if (typeof mediaDevices?.getUserMedia !== "function" || !Recorder) {
      this.#fail("unavailable");
      return;
    }
    const attempt = ++this.#attempt;
    this.transition({ status: "requesting", elapsed: 0, level: 0 });
    let stream: MediaStream;
    try {
      stream = await mediaDevices.getUserMedia({ audio: true });
    } catch (cause) {
      if (attempt === this.#attempt && !this.#disposed())
        this.#fail(errorKind(cause));
      return;
    }
    if (attempt !== this.#attempt || this.#disposed()) {
      stopTracks(stream);
      return;
    }
    const mimeType = CANDIDATE_TYPES.find(
      (type) => Recorder.isTypeSupported?.(type) === true,
    );
    let recorder: MediaRecorderLike;
    try {
      recorder = new Recorder(
        stream,
        mimeType === undefined ? undefined : { mimeType },
      );
    } catch {
      stopTracks(stream);
      this.#fail("failed");
      return;
    }
    this.#stream = stream;
    this.#recorder = recorder;
    this.#chunks = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) this.#chunks.push(event.data);
    };
    recorder.onstop = () => this.#finalize(recorder);
    recorder.onerror = () => {
      this.#release();
      this.#resolve(undefined);
      if (!this.#disposed()) this.#fail("failed");
    };
    try {
      recorder.start(250);
    } catch {
      this.#release();
      this.#fail("failed");
      return;
    }
    this.#startedAt = this.#clock();
    const container = containerType(recorder.mimeType || mimeType);
    this.transition({
      status: "recording",
      elapsed: 0,
      level: 0,
      ...(container === undefined ? {} : { mimeType: container }),
    });
    this.#startMeter(stream, Audio);
  }

  /**
   * Stop recording and resolve with the voice note, or `undefined` when
   * nothing was recording or the recorder produced no audio.
   */
  stop(): Promise<File | undefined> {
    const recorder = this.#recorder;
    if (recorder === undefined || this.getSnapshot().status !== "recording")
      return Promise.resolve(undefined);
    const current = this.getSnapshot();
    this.transition({
      status: "stopping",
      elapsed: this.#clock() - this.#startedAt,
      level: 0,
      ...(current.mimeType === undefined ? {} : { mimeType: current.mimeType }),
    });
    this.#stopMeter();
    return new Promise((resolve) => {
      this.#finish = resolve;
      try {
        if (recorder.state === "inactive") this.#finalize(recorder);
        else recorder.stop();
      } catch {
        this.#finalize(recorder);
      }
    });
  }

  /** Discard the recording, or abandon a pending permission request. */
  cancel(): void {
    this.#attempt += 1;
    const recorder = this.#recorder;
    this.#chunks = [];
    if (recorder !== undefined) {
      recorder.ondataavailable = null;
      recorder.onstop = null;
      recorder.onerror = null;
      try {
        if (recorder.state !== "inactive") recorder.stop();
      } catch {
        // Already stopped.
      }
    }
    this.#release();
    this.#resolve(undefined);
    if (!this.#disposed())
      this.transition({ status: "idle", elapsed: 0, level: 0 });
  }

  protected override onDispose(): void {
    this.#attempt += 1;
    const recorder = this.#recorder;
    if (recorder !== undefined) {
      recorder.onstop = null;
      recorder.onerror = null;
      recorder.ondataavailable = null;
      try {
        if (recorder.state !== "inactive") recorder.stop();
      } catch {
        // Already stopped.
      }
    }
    this.#release();
    this.#resolve(undefined);
  }

  #disposedFlag = false;
  #disposed(): boolean {
    return this.#disposedFlag;
  }
  override dispose(): void {
    this.#disposedFlag = true;
    super.dispose();
  }

  #finalize(recorder: MediaRecorderLike): void {
    if (this.#recorder !== recorder) return;
    const reported = recorder.mimeType;
    const type =
      reported === undefined || reported === ""
        ? (this.getSnapshot().mimeType ?? "audio/webm")
        : containerType(reported);
    if (type === undefined) {
      // Never relabel audio in a container the upload path cannot name.
      this.#chunks = [];
      this.#release();
      this.#resolve(undefined);
      if (!this.#disposed()) this.#fail("failed");
      return;
    }
    const blob = new Blob(this.#chunks, { type });
    this.#chunks = [];
    this.#release();
    const file =
      blob.size === 0
        ? undefined
        : new File([blob], voiceNoteName(type, this.#clock()), { type });
    if (!this.#disposed())
      this.transition({ status: "idle", elapsed: 0, level: 0 });
    this.#resolve(file);
  }

  #resolve(file: File | undefined): void {
    const finish = this.#finish;
    this.#finish = undefined;
    finish?.(file);
  }

  #fail(error: VoiceNoteError): void {
    this.transition({ status: "error", elapsed: 0, level: 0, error });
  }

  #startMeter(
    stream: MediaStream,
    Audio: (new () => AudioContextLike) | undefined,
  ): void {
    let read: (() => number) | undefined;
    if (Audio !== undefined) {
      try {
        const audio = new Audio();
        const analyser = audio.createAnalyser();
        analyser.fftSize = 512;
        audio.createMediaStreamSource(stream).connect(analyser);
        const samples = new Uint8Array(analyser.frequencyBinCount);
        this.#audio = audio;
        read = () => {
          analyser.getByteTimeDomainData(samples);
          let sum = 0;
          for (const sample of samples) {
            const centered = (sample - 128) / 128;
            sum += centered * centered;
          }
          return Math.min(1, Math.sqrt(sum / samples.length) * 3);
        };
      } catch {
        read = undefined;
      }
    }
    const raf =
      this.#options.requestAnimationFrame ??
      (typeof requestAnimationFrame === "function"
        ? (callback: () => void) => requestAnimationFrame(callback)
        : undefined);
    const interval = this.#options.updateInterval ?? 50;
    const tick = () => {
      if (this.getSnapshot().status !== "recording") return;
      const now = this.#clock();
      if (now - this.#lastPublish >= interval) {
        this.#lastPublish = now;
        const current = this.getSnapshot();
        this.transition({
          status: "recording",
          elapsed: now - this.#startedAt,
          level: read === undefined ? 0 : read(),
          ...(current.mimeType === undefined
            ? {}
            : { mimeType: current.mimeType }),
        });
      }
    };
    if (raf !== undefined) {
      const loop = () => {
        tick();
        if (this.#recorder !== undefined && !this.#disposed())
          this.#frame = raf(loop);
      };
      this.#frame = raf(loop);
    } else this.#timer = setInterval(tick, Math.max(interval, 250));
  }

  #stopMeter(): void {
    if (this.#frame !== undefined) {
      const cancel =
        this.#options.cancelAnimationFrame ??
        (typeof cancelAnimationFrame === "function"
          ? (handle: number) => cancelAnimationFrame(handle)
          : undefined);
      cancel?.(this.#frame);
      this.#frame = undefined;
    }
    if (this.#timer !== undefined) {
      clearInterval(this.#timer);
      this.#timer = undefined;
    }
    const audio = this.#audio;
    this.#audio = undefined;
    audio?.close().catch(() => undefined);
  }

  #release(): void {
    this.#stopMeter();
    if (this.#stream !== undefined) stopTracks(this.#stream);
    this.#stream = undefined;
    this.#recorder = undefined;
  }
}

function stopTracks(stream: MediaStream): void {
  for (const track of stream.getTracks()) track.stop();
}

/** Recording containers the SDK can upload, with their file extensions. */
const CONTAINER_EXTENSIONS: ReadonlyMap<string, string> = new Map([
  ["audio/webm", "webm"],
  ["audio/ogg", "ogg"],
  ["audio/mp4", "m4a"],
]);

/** The allowlisted container for a reported type, or `undefined`. */
function containerType(type: string | undefined): string | undefined {
  if (type === undefined || type === "") return undefined;
  const base = type.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  return CONTAINER_EXTENSIONS.has(base) ? base : undefined;
}

/**
 * `voice-note-<ISO time>.webm` (`.ogg` or `.m4a` for those containers), with
 * `:` replaced for portability.
 */
export function voiceNoteName(type: string, time: number = Date.now()): string {
  const stamp = new Date(time).toISOString().replace(/[:.]/g, "-");
  const container = containerType(type) ?? "audio/webm";
  return `voice-note-${stamp}.${CONTAINER_EXTENSIONS.get(container) ?? "webm"}`;
}
