/**
 * The wire contract between this client and the platform. Two sockets carry a
 * call:
 *
 * 1. The **lifecycle socket** (`GET /voip/ws?ticket=`, ticket from
 *    `POST /api/voip/ws-ticket`) — one per client, follows one session. It
 *    pushes `call.*` events and answers `ping` with `pong`.
 *
 * 2. The **media socket** (pod `/voip/sdk?callId=`, bearer ticket from
 *    `POST /api/voip/calls/{id}/agent-token`) — one per call. Binary frames
 *    carry media, text frames carry JSON control. Every binary frame starts
 *    with a one-byte kind tag so audio and video share the socket.
 *
 * The voip pod implements the same contract from this file's definitions; the
 * constants here are the single place the framing is written down on the
 * client side.
 */

// ── Lifecycle socket ──────────────────────────────────────────────────────

export type LifecycleFrame =
  | { readonly type: "ready"; readonly session: string }
  | {
      readonly type: "event";
      readonly event: string;
      readonly callId: string;
      readonly payload: unknown;
      readonly timestamp: string;
    }
  | { readonly type: "error"; readonly code: string; readonly message: string }
  | { readonly type: "pong" };

export type LifecycleClientFrame =
  | { readonly type: "ping" }
  | { readonly type: "teardown"; readonly callId: string };

/** Parse one lifecycle frame; unknown or malformed frames yield `undefined`. */
export function parseLifecycleFrame(data: unknown): LifecycleFrame | undefined {
  if (typeof data !== "string") return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    return undefined;
  }
  if (parsed === null || typeof parsed !== "object") return undefined;
  const f = parsed as Record<string, unknown>;
  switch (f["type"]) {
    case "ready":
      return isString(f["session"]) ? (parsed as LifecycleFrame) : undefined;
    case "event":
      return isString(f["event"]) &&
        isString(f["callId"]) &&
        isString(f["timestamp"]) &&
        "payload" in f
        ? (parsed as LifecycleFrame)
        : undefined;
    case "error":
      return isString(f["code"]) && isString(f["message"])
        ? (parsed as LifecycleFrame)
        : undefined;
    case "pong":
      return parsed as LifecycleFrame;
    default:
      return undefined;
  }
}

// ── Media socket ──────────────────────────────────────────────────────────

/** First byte of every binary media frame. */
export const MediaFrameKind = {
  /** s16le mono PCM at the negotiated sample rate; payload is the samples. */
  Audio: 0x01,
  /** One encoded video frame; payload is {@link VideoFrameHeader} then the bytes. */
  Video: 0x02,
} as const;
export type MediaFrameKind =
  (typeof MediaFrameKind)[keyof typeof MediaFrameKind];

/** Default PCM rate both directions of the media socket use. */
export const DEFAULT_SAMPLE_RATE = 16_000;

/**
 * Header that follows the {@link MediaFrameKind.Video} tag. Fixed 14 bytes,
 * big-endian: codec (1) · flags (1) · width (2) · height (2) · timestamp µs (8).
 * Written out as a constant so the pod and the client cannot drift apart.
 */
export const VIDEO_HEADER_BYTES = 14;
export const VideoCodec = { H264: 0x01, VP8: 0x02 } as const;
export type VideoCodec = (typeof VideoCodec)[keyof typeof VideoCodec];
export const VideoFlags = { Keyframe: 0x01 } as const;

export interface VideoFrameHeader {
  readonly codec: VideoCodec;
  readonly keyframe: boolean;
  readonly width: number;
  readonly height: number;
  /** Capture timestamp in microseconds. */
  readonly timestampUs: number;
}

export interface VideoFrame extends VideoFrameHeader {
  readonly data: Uint8Array;
}

export function encodeAudioFrame(pcm: Int16Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(new ArrayBuffer(1 + pcm.length * 2));
  out[0] = MediaFrameKind.Audio;
  const view = new DataView(out.buffer, out.byteOffset + 1);
  for (let i = 0; i < pcm.length; i += 1)
    view.setInt16(i * 2, pcm[i] ?? 0, true);
  return out;
}

export function encodeVideoFrame(frame: VideoFrame): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(
    new ArrayBuffer(1 + VIDEO_HEADER_BYTES + frame.data.byteLength),
  );
  out[0] = MediaFrameKind.Video;
  const view = new DataView(out.buffer, out.byteOffset + 1, VIDEO_HEADER_BYTES);
  view.setUint8(0, frame.codec);
  view.setUint8(1, frame.keyframe ? VideoFlags.Keyframe : 0);
  view.setUint16(2, frame.width);
  view.setUint16(4, frame.height);
  view.setBigUint64(6, BigInt(Math.max(0, Math.floor(frame.timestampUs))));
  out.set(frame.data, 1 + VIDEO_HEADER_BYTES);
  return out;
}

export type DecodedMediaFrame =
  | { readonly kind: "audio"; readonly pcm: Int16Array }
  | { readonly kind: "video"; readonly frame: VideoFrame };

/** Decode one binary media frame; malformed frames yield `undefined`. */
export function decodeMediaFrame(
  bytes: Uint8Array,
): DecodedMediaFrame | undefined {
  if (bytes.byteLength < 1) return undefined;
  const kind = bytes[0];
  const body = bytes.subarray(1);
  if (kind === MediaFrameKind.Audio) {
    if (body.byteLength % 2 !== 0) return undefined;
    const pcm = new Int16Array(body.byteLength / 2);
    const view = new DataView(body.buffer, body.byteOffset, body.byteLength);
    for (let i = 0; i < pcm.length; i += 1) pcm[i] = view.getInt16(i * 2, true);
    return { kind: "audio", pcm };
  }
  if (kind === MediaFrameKind.Video) {
    if (body.byteLength < VIDEO_HEADER_BYTES) return undefined;
    const view = new DataView(body.buffer, body.byteOffset, VIDEO_HEADER_BYTES);
    const codec = view.getUint8(0);
    if (codec !== VideoCodec.H264 && codec !== VideoCodec.VP8) return undefined;
    return {
      kind: "video",
      frame: {
        codec,
        keyframe: (view.getUint8(1) & VideoFlags.Keyframe) !== 0,
        width: view.getUint16(2),
        height: view.getUint16(4),
        timestampUs: Number(view.getBigUint64(6)),
        data: body.subarray(VIDEO_HEADER_BYTES),
      },
    };
  }
  return undefined;
}

/** Text frames on the media socket, both directions. */
export type MediaControlFrame =
  | { readonly type: "hangup" }
  | { readonly type: "ping" }
  | { readonly type: "pong" }
  /** Sent by the pod once media is bridged; carries the PCM rate in force. */
  | {
      readonly type: "ready";
      readonly sampleRate: number;
      readonly video: boolean;
    }
  | { readonly type: "video_state"; readonly enabled: boolean }
  | { readonly type: "participant_joined"; readonly participant: Participant }
  | {
      readonly type: "participant_left";
      readonly participantId: string;
      readonly reason?: string;
    }
  | { readonly type: "participant_state"; readonly participant: Participant }
  | { readonly type: "error"; readonly code: string; readonly message: string };

export interface Participant {
  readonly id: string;
  /** Display handle; a phone number, LID, or pseudonym as the platform provides. */
  readonly handle: string;
  readonly audioMuted: boolean;
  readonly video: boolean;
  readonly state: "invited" | "ringing" | "connected" | "left";
}

export function parseMediaControl(
  data: unknown,
): MediaControlFrame | undefined {
  if (typeof data !== "string") return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    return undefined;
  }
  if (parsed === null || typeof parsed !== "object") return undefined;
  const f = parsed as Record<string, unknown>;
  switch (f["type"]) {
    case "hangup":
    case "ping":
    case "pong":
      return parsed as MediaControlFrame;
    case "ready":
      return typeof f["sampleRate"] === "number" &&
        typeof f["video"] === "boolean"
        ? (parsed as MediaControlFrame)
        : undefined;
    case "video_state":
      return typeof f["enabled"] === "boolean"
        ? (parsed as MediaControlFrame)
        : undefined;
    case "participant_joined":
    case "participant_state":
      return isParticipant(f["participant"])
        ? (parsed as MediaControlFrame)
        : undefined;
    case "participant_left":
      return isString(f["participantId"])
        ? (parsed as MediaControlFrame)
        : undefined;
    case "error":
      return isString(f["code"]) && isString(f["message"])
        ? (parsed as MediaControlFrame)
        : undefined;
    default:
      return undefined;
  }
}

function isParticipant(value: unknown): value is Participant {
  if (value === null || typeof value !== "object") return false;
  const p = value as Record<string, unknown>;
  return (
    isString(p["id"]) &&
    isString(p["handle"]) &&
    typeof p["audioMuted"] === "boolean" &&
    typeof p["video"] === "boolean" &&
    ["invited", "ringing", "connected", "left"].includes(p["state"] as string)
  );
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}
