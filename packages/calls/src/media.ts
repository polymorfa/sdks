import type { CallsApi } from "./api.js";
import {
  CallClaimedError,
  CallsAuthError,
  CallsDisabledError,
  CallsError,
} from "./errors.js";
import { Emitter } from "./events.js";
import {
  AUTH_FAILED_CLOSE_CODE,
  DEFAULT_SAMPLE_RATE,
  MEDIA_SUBPROTOCOL,
  decodeMediaFrame,
  encodeAudioFrame,
  encodeVideoFrame,
  mediaSocketPath,
  parseMediaControl,
  type MediaClientFrame,
  type MediaControlFrame,
  type OutboundVideoFrame,
  type Participant,
  type VideoFrame,
  type VideoSourceOwner,
} from "./protocol.js";
import { isClientToken } from "./token.js";

/**
 * Close code for a call-state refusal. With the reason "call claimed" (or a
 * preceding `call_claimed` error frame) another participant claimed the call;
 * otherwise the call is not available (ended or not ready).
 */
export const CALL_CLAIMED_CLOSE_CODE = 4409;
/** Close code for a connection refused because calling is turned off. */
export const CALLS_DISABLED_CLOSE_CODE = 4403;
/** Close codes after which reattaching can succeed. */
const RETRYABLE_CLOSE_CODES = new Set([1001, 1006, 1011, 1012, 1013, 4429]);

export interface MediaSocketOptions {
  readonly api: Pick<CallsApi, "token" | "socketUrl">;
  readonly callId: string;
  /** Reuse the same id to reconnect this connection. */
  readonly connectionId: string;
  /** Participant name for server credentials; ignored for client tokens. */
  readonly participant?: string;
  /** Ask the token provider for a fresh token (after a 4401 close). */
  readonly refreshToken?: boolean;
  readonly WebSocket?: typeof globalThis.WebSocket;
  readonly setInterval?: typeof globalThis.setInterval;
  readonly clearInterval?: typeof globalThis.clearInterval;
  /** Heartbeat period; 0 disables. Default 5 000 ms — media is latency-sensitive. */
  readonly heartbeatMs?: number;
  /**
   * Bound on connect(): from the attempt until the platform's `ready` frame.
   * 0 disables. Default 10 000 ms.
   */
  readonly readyTimeoutMs?: number;
  readonly setTimeout?: typeof globalThis.setTimeout;
  readonly clearTimeout?: typeof globalThis.clearTimeout;
}

export interface MediaReady {
  readonly sampleRate: number;
  readonly video: boolean;
  readonly callId?: string;
  readonly connectionId?: string;
}

/** A remote video source announced on the media socket. */
export type MediaVideoSource = { readonly source: number } & VideoSourceOwner;

/**
 * Why the socket closed: `local` (this client closed it), `left` (after
 * {@link MediaSocket.leave}), `ended` (the platform closed the connection
 * normally or the call is no longer available), `claimed` (another
 * participant claimed the call), `unauthorized` (4401), `refused` (4400, 4403
 * while calling is turned off, or a policy violation; retrying cannot help),
 * or `lost` (retryable).
 */
export type MediaCloseReason =
  "local" | "left" | "ended" | "claimed" | "unauthorized" | "refused" | "lost";

export interface MediaClose {
  readonly reason: MediaCloseReason;
  readonly code?: number;
}

type Events = {
  ready: [MediaReady];
  audio: [Int16Array];
  video: [VideoFrame];
  videoSource: [MediaVideoSource];
  videoSourceRemoved: [source: number];
  keyframeRequest: [];
  participantJoined: [Participant];
  participantLeft: [participantId: string, reason: string | undefined];
  participantState: [Participant];
  error: [CallsError];
  close: [MediaClose];
};

/**
 * One media connection to a call: tagged binary frames for audio and video,
 * JSON text frames for control. The first frame authenticates the
 * connection. A socket does not reconnect by itself; the call opens a new one
 * with the same connection id.
 */
export class MediaSocket extends Emitter<Events> {
  readonly #o: MediaSocketOptions;
  readonly #WS: typeof globalThis.WebSocket;
  #socket: WebSocket | undefined;
  #beat: ReturnType<typeof setInterval> | undefined;
  #awaitingPong = false;
  #sampleRate = DEFAULT_SAMPLE_RATE;
  #closed = false;
  #ready = false;
  #intent: "left" | "ended" | undefined;
  #claimed = false;
  /** The last error frame before `ready`; the close that follows explains it. */
  #refusal: CallsError | undefined;
  #pending: ((err?: Error) => void) | undefined;
  #connecting: Promise<void> | undefined;

  constructor(options: MediaSocketOptions) {
    super();
    this.#o = options;
    const WS = options.WebSocket ?? globalThis.WebSocket;
    if (WS === undefined)
      throw new Error(
        "No WebSocket implementation: pass `WebSocket` (Node < 22) or run on Node 22+.",
      );
    this.#WS = WS;
  }

  get connectionId(): string {
    return this.#o.connectionId;
  }

  /** The PCM rate in force; updated from the platform's `ready` frame. */
  get sampleRate(): number {
    return this.#sampleRate;
  }

  get connected(): boolean {
    return (
      this.#ready &&
      this.#socket !== undefined &&
      this.#socket.readyState === this.#WS.OPEN
    );
  }

  /**
   * Authenticate and attach; resolves when the platform reports `ready`.
   * Rejects with {@link CallClaimedError} or {@link CallsAuthError} when the
   * platform refuses the connection for those reasons.
   */
  connect(): Promise<void> {
    if (this.#closed)
      return Promise.reject(new Error("Media socket is closed."));
    if (this.#connecting !== undefined) return this.#connecting;
    if (this.#socket !== undefined) return Promise.resolve();
    const attempt = new Promise<void>((resolve, reject) => {
      const readyMs = this.#o.readyTimeoutMs ?? 10_000;
      let readyTimer: ReturnType<typeof setTimeout> | undefined;
      let settled = false;
      const done = (err?: Error) => {
        if (settled) return;
        settled = true;
        if (readyTimer !== undefined) {
          (this.#o.clearTimeout ?? clearTimeout)(readyTimer);
          readyTimer = undefined;
        }
        if (this.#pending === done) this.#pending = undefined;
        this.#connecting = undefined;
        if (err) reject(err);
        else resolve();
      };
      this.#pending = done;
      if (readyMs > 0)
        readyTimer = (this.#o.setTimeout ?? setTimeout)(() => {
          readyTimer = undefined;
          done(
            new CallsError(
              "media_timeout",
              "The platform did not report media ready in time.",
            ),
          );
          this.close();
        }, readyMs);
      void this.#open(done);
    });
    this.#connecting = attempt;
    return attempt;
  }

  async #open(done: (err?: Error) => void): Promise<void> {
    let token: string;
    try {
      token = (
        await this.#o.api.token(
          this.#o.refreshToken === true ? { refresh: true } : {},
        )
      ).value;
    } catch (cause) {
      done(
        new CallsError(
          "token_failed",
          cause instanceof Error
            ? cause.message
            : "Could not obtain a token for the media socket.",
          { cause },
        ),
      );
      return;
    }
    if (this.#closed) return;
    let socket: WebSocket;
    try {
      socket = new this.#WS(
        this.#o.api.socketUrl(mediaSocketPath(this.#o.callId)),
        [MEDIA_SUBPROTOCOL],
      );
    } catch (cause) {
      done(
        cause instanceof Error
          ? cause
          : new Error("WebSocket construction failed."),
      );
      return;
    }
    socket.binaryType = "arraybuffer";
    this.#socket = socket;
    let opened = false;
    socket.onopen = () => {
      opened = true;
      const auth: MediaClientFrame = {
        type: "auth",
        token,
        connectionId: this.#o.connectionId,
        ...(this.#o.participant === undefined || isClientToken(token)
          ? {}
          : { participant: this.#o.participant }),
      };
      socket.send(JSON.stringify(auth));
    };
    socket.onmessage = (event) => {
      const data = (event as MessageEvent).data;
      if (typeof data === "string") {
        const control = parseMediaControl(data);
        if (control === undefined) return;
        if (control.type === "ready") {
          this.#sampleRate = control.sampleRate;
          this.#ready = true;
          this.#startHeartbeat(socket);
          try {
            this.emit("ready", {
              sampleRate: control.sampleRate,
              video: control.video,
              ...(control.callId === undefined
                ? {}
                : { callId: control.callId }),
              ...(control.connectionId === undefined
                ? {}
                : { connectionId: control.connectionId }),
            });
          } finally {
            done();
          }
          return;
        }
        if (control.type === "error" && control.code === "call_claimed")
          this.#claimed = true;
        if (!this.#ready) {
          // The platform sends an error frame and then closes; settle on the
          // close so the close code decides the error type.
          if (control.type === "error") this.#refusal = errorFrom(control);
          return;
        }
        this.#control(control);
        return;
      }
      if (!this.#ready) return;
      const bytes =
        data instanceof ArrayBuffer
          ? new Uint8Array(data)
          : ArrayBuffer.isView(data)
            ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
            : undefined;
      if (bytes === undefined) return;
      const frame = decodeMediaFrame(bytes);
      if (frame === undefined) return;
      if (frame.kind === "audio") this.emit("audio", frame.pcm);
      else this.emit("video", frame.frame);
    };
    // Node 22's WebSocket reports a failed handshake (refused, reset, or a
    // non-101 reply) with an error event and never fires close, so treat an
    // error before open as the close that other runtimes deliver.
    socket.onerror = () => {
      if (opened || this.#socket !== socket) return;
      const onclose = socket.onclose;
      socket.onopen = socket.onmessage = socket.onclose = socket.onerror = null;
      try {
        socket.close();
      } catch {
        // never opened
      }
      onclose?.call(socket, { code: 1006 } as CloseEvent);
    };
    socket.onclose = (event) => {
      this.#stopHeartbeat();
      if (this.#socket === socket) this.#socket = undefined;
      this.#closed = true;
      this.#ready = false;
      const close = this.#classify(event as CloseEvent | undefined);
      done(closeError(close, this.#refusal));
      this.emit("close", close);
    };
  }

  /** Push s16le mono PCM at {@link sampleRate}. Returns false when not connected. */
  writeAudio(pcm: Int16Array): boolean {
    if (!this.connected) return false;
    this.#socket!.send(encodeAudioFrame(pcm));
    return true;
  }

  /** Push one H.264 Annex-B access unit. Send decoder configuration with keyframes. */
  writeVideo(frame: OutboundVideoFrame): boolean {
    if (!this.connected) return false;
    this.#socket!.send(encodeVideoFrame({ ...frame, source: 0 }));
    return true;
  }

  send(frame: MediaClientFrame): boolean {
    if (!this.connected) return false;
    this.#socket!.send(JSON.stringify(frame));
    return true;
  }

  /** Close this connection only; the call continues. False when not connected. */
  leave(): boolean {
    if (!this.send({ type: "leave" })) return false;
    this.#intent = "left";
    this.#finish("left");
    return true;
  }

  /** End the call for every participant. False when not connected. */
  endCall(): boolean {
    if (!this.send({ type: "end_call" })) return false;
    this.#intent = "ended";
    this.#finish("ended");
    return true;
  }

  close(): void {
    this.#finish("local");
  }

  #finish(reason: MediaCloseReason): void {
    if (this.#closed) return;
    this.#closed = true;
    this.#stopHeartbeat();
    this.#pending?.(new Error("Media socket closed before media was bridged."));
    const socket = this.#socket;
    this.#socket = undefined;
    this.#ready = false;
    if (socket === undefined) return;
    socket.onopen = socket.onmessage = socket.onclose = socket.onerror = null;
    try {
      socket.close(1000, reason === "local" ? "closed" : reason);
    } catch {
      // already closed
    }
    this.emit("close", { reason });
  }

  #classify(event: CloseEvent | undefined): MediaClose {
    const code = event?.code;
    const text = (event?.reason ?? "").toLowerCase();
    const withCode = code === undefined ? {} : { code };
    if (this.#intent !== undefined)
      return { reason: this.#intent, ...withCode };
    if (code === AUTH_FAILED_CLOSE_CODE)
      return { reason: "unauthorized", ...withCode };
    if (
      this.#claimed ||
      text === "call claimed" ||
      (code === CALL_CLAIMED_CLOSE_CODE && this.#refusal === undefined)
    )
      return {
        reason: this.#claimed || text === "call claimed" ? "claimed" : "ended",
        ...withCode,
      };
    // 4409 for another reason: the call is ended or not available.
    if (code === CALL_CLAIMED_CLOSE_CODE)
      return { reason: "ended", ...withCode };
    // The platform closes a connection normally when it leaves or the call
    // ends; the lifecycle stream reports which.
    if (code === 1000) return { reason: "ended", ...withCode };
    if (
      code === 4400 ||
      code === CALLS_DISABLED_CLOSE_CODE ||
      code === 1008 ||
      code === 1009
    )
      return { reason: "refused", ...withCode };
    if (code === undefined || RETRYABLE_CLOSE_CODES.has(code))
      return { reason: "lost", ...withCode };
    return { reason: "lost", ...withCode };
  }

  #control(frame: MediaControlFrame): void {
    switch (frame.type) {
      case "pong":
        this.#awaitingPong = false;
        return;
      case "participant_joined":
        this.emit("participantJoined", frame.participant);
        return;
      case "participant_left":
        this.emit("participantLeft", frame.participantId, frame.reason);
        return;
      case "participant_state":
        this.emit("participantState", frame.participant);
        return;
      case "video_source":
        this.emit(
          "videoSource",
          frame.connectionId !== undefined
            ? {
                source: frame.source,
                connectionId: frame.connectionId,
                ...(frame.connectionParticipant === undefined
                  ? {}
                  : { connectionParticipant: frame.connectionParticipant }),
              }
            : { source: frame.source, participant: frame.participant },
        );
        return;
      case "video_source_removed":
        this.emit("videoSourceRemoved", frame.source);
        return;
      case "keyframe_request":
        this.emit("keyframeRequest");
        return;
      case "error":
        this.emit("error", errorFrom(frame));
        return;
      default:
        return;
    }
  }

  #startHeartbeat(socket: WebSocket): void {
    this.#stopHeartbeat();
    const every = this.#o.heartbeatMs ?? 5_000;
    if (every <= 0) return;
    this.#beat = (this.#o.setInterval ?? setInterval)(() => {
      if (this.#socket !== socket) return;
      if (this.#awaitingPong) {
        // Treat a silent socket as lost so the call can reconnect it.
        this.#stopHeartbeat();
        this.#closed = true;
        this.#socket = undefined;
        this.#ready = false;
        socket.onopen =
          socket.onmessage =
          socket.onclose =
          socket.onerror =
            null;
        try {
          socket.close();
        } catch {
          // already gone
        }
        this.emit("close", { reason: "lost" });
        return;
      }
      this.#awaitingPong = this.send({ type: "ping" });
    }, every);
  }

  #stopHeartbeat(): void {
    if (this.#beat !== undefined) {
      (this.#o.clearInterval ?? clearInterval)(this.#beat);
      this.#beat = undefined;
    }
    this.#awaitingPong = false;
  }
}

function errorFrom(frame: { code: string; message?: string }): CallsError {
  if (frame.code === "call_claimed") return new CallClaimedError(frame.message);
  if (frame.code === "unauthorized") return new CallsAuthError(frame.message);
  if (frame.code === "calls_disabled")
    return new CallsDisabledError(frame.message);
  return new CallsError(
    frame.code,
    frame.message ??
      `The platform refused the media connection (${frame.code}).`,
  );
}

function closeError(close: MediaClose, refusal: CallsError | undefined): Error {
  switch (close.reason) {
    case "claimed":
      return new CallClaimedError();
    case "unauthorized":
      return new CallsAuthError(refusal?.message);
    case "ended":
      return (
        refusal ?? new CallsError("call_ended", "The call is not available.")
      );
    case "refused":
      return (
        refusal ??
        new CallsError(
          "media_refused",
          "The platform refused the media connection.",
        )
      );
    default:
      return (
        refusal ??
        new CallsError(
          "media_closed",
          "Media socket closed before media was bridged.",
        )
      );
  }
}
