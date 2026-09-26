import { CallsError } from "./errors.js";
import { createConnectionId } from "./protocol.js";

/** This connection's media preferences, independent of remote reception. */
export interface MediaState {
  readonly audioMuted: boolean;
  readonly videoEnabled: boolean;
  /** Absent or false when the outgoing source is the camera. */
  readonly screenSharing?: boolean;
}
export type MediaStateUpdate = Partial<MediaState>;
export type MediaStateRequest = MediaStateUpdate & {
  readonly type: "media_state";
  readonly requestId: string;
};
export type MediaStateReply =
  | (MediaState & { readonly type: "media_state"; readonly requestId: string })
  | {
      readonly type: "media_error";
      readonly requestId: string;
      readonly code: string;
    };

/** @internal Ordered, bounded commands. A timeout is unknown and is never replayed. */
export class MediaStateCommands {
  #tail: Promise<unknown> = Promise.resolve();
  #queued = 0;
  #closed = false;
  #pending:
    { id: string; finish: (reply?: MediaStateReply) => void } | undefined;
  constructor(readonly send: (frame: MediaStateRequest) => boolean) {}

  set(update: MediaStateUpdate): Promise<MediaState> {
    if (this.#closed || this.#queued >= 16)
      return Promise.reject(
        new CallsError(
          "media_control_unavailable",
          "Media controls are unavailable.",
        ),
      );
    if (
      update.audioMuted === undefined &&
      update.videoEnabled === undefined &&
      update.screenSharing === undefined
    )
      return Promise.reject(
        new TypeError("Specify audioMuted, videoEnabled or screenSharing."),
      );
    if (
      (update.audioMuted !== undefined &&
        typeof update.audioMuted !== "boolean") ||
      (update.videoEnabled !== undefined &&
        typeof update.videoEnabled !== "boolean") ||
      (update.screenSharing !== undefined &&
        typeof update.screenSharing !== "boolean")
    )
      return Promise.reject(
        new TypeError("Media preferences must be booleans."),
      );
    const requested: MediaStateUpdate = {
      ...(update.screenSharing === undefined
        ? {}
        : { screenSharing: update.screenSharing }),
      ...(update.audioMuted === undefined
        ? {}
        : { audioMuted: update.audioMuted }),
      ...(update.videoEnabled === undefined
        ? {}
        : { videoEnabled: update.videoEnabled }),
    };
    this.#queued++;
    const next = this.#tail.then(() => this.#request(requested));
    this.#tail = next
      .catch(() => undefined)
      .finally(() => {
        this.#queued--;
      });
    return next;
  }
  receive(reply: MediaStateReply): void {
    if (reply.requestId === this.#pending?.id) this.#pending.finish(reply);
  }
  close(): void {
    this.#closed = true;
    this.#pending?.finish();
  }
  #request(update: MediaStateUpdate): Promise<MediaState> {
    if (this.#closed)
      return Promise.reject(
        new CallsError("media_control_unavailable", "Media connection closed."),
      );
    return new Promise((resolve, reject) => {
      const id = createConnectionId();
      const timer = setTimeout(() => finish(), 5000);
      const finish = (reply?: MediaStateReply) => {
        clearTimeout(timer);
        this.#pending = undefined;
        if (
          reply?.type === "media_state" &&
          (update.audioMuted === undefined ||
            reply.audioMuted === update.audioMuted) &&
          (update.videoEnabled === undefined ||
            reply.videoEnabled === update.videoEnabled) &&
          (update.screenSharing === undefined ||
            (reply.screenSharing === true) === update.screenSharing)
        )
          resolve({
            audioMuted: reply.audioMuted,
            videoEnabled: reply.videoEnabled,
            ...(reply.screenSharing ? { screenSharing: true } : {}),
          });
        else
          reject(
            new CallsError(
              reply?.type === "media_state"
                ? "media_control_failed"
                : (reply?.code ?? "media_control_unknown"),
              "Media control was not confirmed.",
            ),
          );
      };
      this.#pending = { id, finish };
      try {
        if (!this.send({ type: "media_state", requestId: id, ...update }))
          finish();
      } catch {
        finish();
      }
    });
  }
}
