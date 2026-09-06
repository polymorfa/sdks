import type { MediaTicket } from "./api.js";
import { Emitter } from "./events.js";
import {
  DEFAULT_SAMPLE_RATE,
  decodeMediaFrame,
  encodeAudioFrame,
  encodeVideoFrame,
  parseMediaControl,
  type MediaControlFrame,
  type Participant,
  type VideoFrame,
} from "./protocol.js";

export interface MediaSocketOptions {
  readonly ticket: MediaTicket;
  readonly WebSocket?: typeof globalThis.WebSocket;
  readonly setInterval?: typeof globalThis.setInterval;
  readonly clearInterval?: typeof globalThis.clearInterval;
  /** Heartbeat period; 0 disables. Default 5 000 ms — media is latency-sensitive. */
  readonly heartbeatMs?: number;
  /**
   * Bound on connect(): from the attempt until the pod's `ready` frame. 0
   * disables. Default 10 000 ms. Without it a socket stuck CONNECTING, or one
   * that answers pings but never bridges, leaves answer() pending forever.
   */
  readonly readyTimeoutMs?: number;
  readonly setTimeout?: typeof globalThis.setTimeout;
  readonly clearTimeout?: typeof globalThis.clearTimeout;
}

type Events = {
  ready: [{ sampleRate: number; video: boolean }];
  audio: [Int16Array];
  video: [VideoFrame];
  videoState: [enabled: boolean];
  participantJoined: [Participant];
  participantLeft: [participantId: string, reason: string | undefined];
  participantState: [Participant];
  hangup: [];
  error: [{ code: string; message: string }];
  close: [];
};

/**
 * One call's media socket to the pod: tagged binary frames for audio and
 * video, JSON text frames for control. Unlike the lifecycle socket this does
 * not reconnect — a dropped media socket means the call is gone, and the pod
 * reports that through the lifecycle stream.
 */
export class MediaSocket extends Emitter<Events> {
  readonly #o: MediaSocketOptions;
  readonly #WS: typeof globalThis.WebSocket;
  #socket: WebSocket | undefined;
  #beat: ReturnType<typeof setInterval> | undefined;
  #awaitingPong = false;
  #sampleRate = DEFAULT_SAMPLE_RATE;
  #closed = false;
  /** Settles the in-flight `connect()`; a local `close()` rejects it. */
  #pending: ((err?: Error) => void) | undefined;

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

  /** The PCM rate in force; updated from the pod's `ready` frame. */
  get sampleRate(): number {
    return this.#sampleRate;
  }

  get connected(): boolean {
    return (
      this.#socket !== undefined && this.#socket.readyState === this.#WS.OPEN
    );
  }

  /** Opens the socket; resolves when the pod reports media bridged, rejects on failure or hang-up first. */
  connect(): Promise<void> {
    if (this.#closed)
      return Promise.reject(new Error("Media socket is closed."));
    if (this.#socket !== undefined) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      const readyMs = this.#o.readyTimeoutMs ?? 10_000;
      let readyTimer: ReturnType<typeof setTimeout> | undefined;
      let settled = false;
      // Every settlement clears the ready bound, so the timer can only fire
      // for an attempt that is still genuinely pending.
      const done = (err?: Error) => {
        if (settled) return;
        settled = true;
        if (readyTimer !== undefined) {
          (this.#o.clearTimeout ?? clearTimeout)(readyTimer);
          readyTimer = undefined;
        }
        if (this.#pending === done) this.#pending = undefined;
        if (err) reject(err);
        else resolve();
      };
      this.#pending = done;
      if (readyMs > 0)
        readyTimer = (this.#o.setTimeout ?? setTimeout)(() => {
          readyTimer = undefined;
          // A socket stuck CONNECTING, or one that answers pings but never
          // bridges, would otherwise hold answer() open forever.
          done(new Error("The pod did not report media ready in time."));
          this.close();
        }, readyMs);
      let socket: WebSocket;
      try {
        // The ticket is a bearer credential; browsers cannot set headers on a
        // WebSocket, so it rides the subprotocol slot, which the pod also reads.
        socket = new this.#WS(this.#o.ticket.url, [
          `pmfa.ticket.${this.#o.ticket.token}`,
        ]);
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
      socket.onopen = () => this.#startHeartbeat(socket);
      socket.onmessage = (event) => {
        const data = (event as MessageEvent).data;
        if (typeof data === "string") {
          const control = parseMediaControl(data);
          if (control === undefined) return;
          if (control.type === "ready") {
            this.#sampleRate = control.sampleRate;
            // done() in finally: a throwing `ready` listener must not leave
            // answer() pending, and the exception still reaches its owner.
            try {
              this.emit("ready", {
                sampleRate: control.sampleRate,
                video: control.video,
              });
            } finally {
              done();
            }
            return;
          }
          if (control.type === "error")
            done(new Error(`${control.code}: ${control.message}`));
          if (control.type === "hangup")
            done(new Error("Call ended before media was bridged."));
          this.#control(control);
          return;
        }
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
      socket.onerror = () => undefined;
      socket.onclose = () => {
        this.#stopHeartbeat();
        if (this.#socket === socket) this.#socket = undefined;
        done(new Error("Media socket closed before media was bridged."));
        this.emit("close");
      };
    });
  }

  /** Push s16le mono PCM at {@link sampleRate} toward WhatsApp. Returns false when not connected. */
  writeAudio(pcm: Int16Array): boolean {
    if (!this.connected) return false;
    this.#socket!.send(encodeAudioFrame(pcm));
    return true;
  }

  writeVideo(frame: VideoFrame): boolean {
    if (!this.connected) return false;
    this.#socket!.send(encodeVideoFrame(frame));
    return true;
  }

  sendControl(frame: MediaControlFrame): boolean {
    if (!this.connected) return false;
    this.#socket!.send(JSON.stringify(frame));
    return true;
  }

  close(): void {
    this.#closed = true;
    this.#stopHeartbeat();
    // A call that ends while media is still connecting must not leave the
    // caller's answer() pending forever: reject the in-flight connect first.
    this.#pending?.(new Error("Media socket closed before media was bridged."));
    const socket = this.#socket;
    this.#socket = undefined;
    if (socket === undefined) return;
    socket.onopen = socket.onmessage = socket.onclose = socket.onerror = null;
    try {
      socket.close();
    } catch {
      // already closed
    }
    this.emit("close");
  }

  #control(frame: MediaControlFrame): void {
    switch (frame.type) {
      case "pong":
        this.#awaitingPong = false;
        return;
      case "hangup":
        this.emit("hangup");
        return;
      case "video_state":
        this.emit("videoState", frame.enabled);
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
      case "error":
        this.emit("error", { code: frame.code, message: frame.message });
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
        try {
          this.emit("error", {
            code: "heartbeat_timeout",
            message: "The pod stopped answering.",
          });
        } finally {
          this.close();
        }
        return;
      }
      if (socket.readyState === this.#WS.OPEN) {
        socket.send(JSON.stringify({ type: "ping" }));
        this.#awaitingPong = true;
      }
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
