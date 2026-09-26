import type { MediaStateRequest, MediaStateReply } from "./media-state.js";
/**
 * The wire contract between this client and the platform (Calls contract
 * revision 1). Two sockets carry a call:
 *
 * 1. The **lifecycle socket** (`GET /voip/ws`) — one per client. No credential
 *    travels in the URL: the first frame is `{ type: "auth", token }` and the
 *    platform answers `ready`. Server credentials name the session with
 *    `?session=` (and optionally `&participant=`); client tokens send no query
 *    parameters. A later `auth` frame replaces an expiring token and must
 *    resolve to the same organization, project, session and participant. The
 *    platform closes the socket with 4401 once the token stops authorizing
 *    the session.
 *
 * 2. The **media socket** (`GET /voip/calls/{callId}/media`, subprotocol
 *    `pmfa.calls.v2`) — one per media connection. The first frame is
 *    `{ type: "auth", token, connectionId, participant? }`; the URL carries no
 *    query parameters. Replacement auth frames cannot change the connection
 *    or participant. Binary frames
 *    carry media, text frames carry JSON control. Every binary frame starts
 *    with a one-byte kind tag so audio and video share the socket.
 */

// ── Identifiers ──────────────────────────────────────────────────────────

/** Lifecycle socket path on the API host. */
export const LIFECYCLE_SOCKET_PATH = "/voip/ws";
/** Close code for a token that no longer authorizes the socket. */
export const AUTH_FAILED_CLOSE_CODE = 4401;
/** Media socket subprotocol. */
export const MEDIA_SUBPROTOCOL = "pmfa.calls.v2";

export function mediaSocketPath(callId: string): string {
  return `/voip/calls/${encodeURIComponent(callId)}/media`;
}

const CONNECTION_ID = /^[A-Za-z0-9_-]{8,64}$/;
const PARTICIPANT = /^[A-Za-z0-9._:@-]{1,128}$/;

/** A media connection id: 8–64 characters of `[A-Za-z0-9_-]`. */
export function isConnectionId(value: unknown): value is string {
  return typeof value === "string" && CONNECTION_ID.test(value);
}

/** A server-credential participant name: 1–128 characters of `[A-Za-z0-9._:@-]`. */
export function isParticipantName(value: unknown): value is string {
  return typeof value === "string" && PARTICIPANT.test(value);
}

/**
 * A new connection id: 18 crypto-random bytes as base64url (24 characters).
 * Reuse the same id to reconnect the same connection.
 */
export function createConnectionId(
  random: (bytes: Uint8Array<ArrayBuffer>) => Uint8Array = (bytes) =>
    globalThis.crypto.getRandomValues(bytes),
): string {
  const bytes = random(new Uint8Array(new ArrayBuffer(18)));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// ── Lifecycle socket ──────────────────────────────────────────────────────

export interface TrickleCandidate {
  readonly candidate: string;
  readonly sdpMid?: string;
  readonly sdpMLineIndex?: number;
}

export type LifecycleFrame =
  | {
      readonly type: "ready";
      readonly session?: string;
      /** Participant reference of the authenticated credential, when sent. */
      readonly participant?: string;
    }
  | {
      readonly type: "event";
      readonly event: string;
      readonly callId: string;
      readonly payload: unknown;
      readonly timestamp: string;
    }
  | {
      readonly type: "candidate";
      readonly callId: string;
      readonly connectionId?: string;
      readonly candidate: TrickleCandidate;
    }
  | { readonly type: "error"; readonly code: string; readonly message: string }
  | { readonly type: "pong" };

export type LifecycleClientFrame =
  | { readonly type: "auth"; readonly token: string }
  | { readonly type: "ping" }
  | {
      readonly type: "candidate";
      readonly callId: string;
      readonly connectionId: string;
      readonly candidate: TrickleCandidate;
    };

/** Parse one lifecycle frame; unknown or malformed frames yield `undefined`. */
export function parseLifecycleFrame(data: unknown): LifecycleFrame | undefined {
  const f = parseObject(data);
  if (f === undefined) return undefined;
  switch (f["type"]) {
    case "ready":
      return optionalString(f["session"]) && optionalString(f["participant"])
        ? (f as LifecycleFrame)
        : undefined;
    case "event":
      return isString(f["event"]) &&
        isString(f["callId"]) &&
        isString(f["timestamp"]) &&
        "payload" in f
        ? (f as LifecycleFrame)
        : undefined;
    case "candidate":
      return isString(f["callId"]) &&
        (f["connectionId"] === undefined ||
          isConnectionId(f["connectionId"])) &&
        isCandidate(f["candidate"])
        ? (f as LifecycleFrame)
        : undefined;
    case "error":
      return isString(f["code"]) && isString(f["message"])
        ? (f as LifecycleFrame)
        : undefined;
    case "pong":
      return f as LifecycleFrame;
    default:
      return undefined;
  }
}

// ── Media socket ──────────────────────────────────────────────────────────

/** First byte of every binary media frame. */
export const MediaFrameKind = {
  /** s16le mono PCM at the `ready` frame's sample rate. */
  Audio: 0x01,
  /** One encoded access unit; payload is {@link VIDEO_HEADER_BYTES} of header then the bytes. */
  Video: 0x02,
} as const;
export type MediaFrameKind =
  (typeof MediaFrameKind)[keyof typeof MediaFrameKind];

/** Default PCM rate until the `ready` frame names one. */
export const DEFAULT_SAMPLE_RATE = 16_000;

/**
 * Header that follows the {@link MediaFrameKind.Video} tag. Fixed 14 bytes,
 * big-endian: codec (1) · flags (1) · source (4) · timestamp µs (8), then one
 * Annex-B access unit.
 */
export const VIDEO_HEADER_BYTES = 14;
export const VideoCodec = { H264: 0x01 } as const;
export type VideoCodec = (typeof VideoCodec)[keyof typeof VideoCodec];
export const VideoFlags = { Keyframe: 0x01 } as const;

export interface VideoFrameHeader {
  readonly codec: VideoCodec;
  readonly keyframe: boolean;
  /**
   * Source handle. Inbound frames carry the producing source announced by a
   * `video_source` frame. Clients send 0; the platform assigns the handle.
   */
  readonly source: number;
  /** Capture timestamp in microseconds. */
  readonly timestampUs: number;
}

export interface VideoFrame extends VideoFrameHeader {
  readonly data: Uint8Array;
}

/** An outbound frame; `source` defaults to 0 and `codec` to H.264. */
export type OutboundVideoFrame = Omit<VideoFrame, "source" | "codec"> & {
  readonly source?: number;
  readonly codec?: VideoCodec;
};

export function encodeAudioFrame(pcm: Int16Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(new ArrayBuffer(1 + pcm.length * 2));
  out[0] = MediaFrameKind.Audio;
  const view = new DataView(out.buffer, out.byteOffset + 1);
  for (let i = 0; i < pcm.length; i += 1)
    view.setInt16(i * 2, pcm[i] ?? 0, true);
  return out;
}

export function encodeVideoFrame(
  frame: OutboundVideoFrame,
): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(
    new ArrayBuffer(1 + VIDEO_HEADER_BYTES + frame.data.byteLength),
  );
  out[0] = MediaFrameKind.Video;
  const view = new DataView(out.buffer, out.byteOffset + 1, VIDEO_HEADER_BYTES);
  view.setUint8(0, frame.codec ?? VideoCodec.H264);
  view.setUint8(1, frame.keyframe ? VideoFlags.Keyframe : 0);
  view.setUint32(2, (frame.source ?? 0) >>> 0);
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
    if (body.byteLength <= VIDEO_HEADER_BYTES) return undefined;
    const view = new DataView(body.buffer, body.byteOffset, VIDEO_HEADER_BYTES);
    const codec = view.getUint8(0);
    if (codec !== VideoCodec.H264) return undefined;
    return {
      kind: "video",
      frame: {
        codec,
        keyframe: (view.getUint8(1) & VideoFlags.Keyframe) !== 0,
        source: view.getUint32(2),
        timestampUs: Number(view.getBigUint64(6)),
        data: body.subarray(VIDEO_HEADER_BYTES),
      },
    };
  }
  return undefined;
}

export interface Participant {
  readonly id: string;
  readonly phoneNumber?: string;
  readonly bsuid?: string;
  readonly username?: string;
  readonly audioMuted: boolean;
  readonly video: boolean;
  readonly state: "invited" | "ringing" | "connected" | "left";
}

/**
 * Who sends a video source: another media connection of this call, or a
 * WhatsApp participant.
 */
export type VideoSourceOwner =
  | {
      readonly connectionId: string;
      /** Participant reference (`client:<id>` or `server:<name>`) of that connection, when known. */
      readonly connectionParticipant?: string;
      readonly participant?: undefined;
    }
  | {
      readonly participant: Participant;
      readonly connectionId?: undefined;
      readonly connectionParticipant?: undefined;
    };

export type VideoSourceFrame = {
  readonly type: "video_source";
  readonly source: number;
} & VideoSourceOwner;

/** Text frames the platform sends on the media socket. */
export type MediaControlFrame =
  | MediaStateReply
  | { readonly type: "remote_media"; readonly audioMuted: boolean | null }
  | {
      readonly type: "ready";
      readonly callId?: string;
      readonly connectionId?: string;
      /** PCM rate both directions use. */
      readonly sampleRate: number;
      readonly video: boolean;
    }
  | { readonly type: "pong" }
  | { readonly type: "participant_joined"; readonly participant: Participant }
  | {
      readonly type: "participant_left";
      readonly participantId: string;
      readonly reason?: string;
    }
  | { readonly type: "participant_state"; readonly participant: Participant }
  | VideoSourceFrame
  | { readonly type: "video_source_removed"; readonly source: number }
  /** Send a keyframe (with decoder configuration) on the next video frame. */
  | { readonly type: "keyframe_request" }
  /** `message` is absent on authentication refusals. */
  | {
      readonly type: "error";
      readonly code: string;
      readonly message?: string;
    };

/** Text frames the client sends on the media socket. */
export type MediaClientFrame =
  | MediaStateRequest
  | {
      readonly type: "auth";
      readonly token: string;
      readonly connectionId: string;
      readonly participant?: string;
    }
  | { readonly type: "ping" }
  /** Close this connection only. */
  | { readonly type: "leave" }
  /** End the call for every participant. */
  | { readonly type: "end_call" };

export function parseMediaControl(
  data: unknown,
): MediaControlFrame | undefined {
  const parsed = parseObject(data);
  return parsed === undefined ? undefined : parseMediaControlValue(parsed);
}

/** Validate an already-decoded media control value. @internal */
export function parseMediaControlValue(
  parsed: unknown,
): MediaControlFrame | undefined {
  if (parsed === null || typeof parsed !== "object") return undefined;
  const f = parsed as Record<string, unknown>;
  switch (f["type"]) {
    case "media_state":
      return isConnectionId(f["requestId"]) &&
        typeof f["audioMuted"] === "boolean" &&
        typeof f["videoEnabled"] === "boolean"
        ? (parsed as MediaControlFrame)
        : undefined;
    case "media_error":
      return isConnectionId(f["requestId"]) && isString(f["code"])
        ? (parsed as MediaControlFrame)
        : undefined;
    case "remote_media":
      return f["audioMuted"] === null || typeof f["audioMuted"] === "boolean"
        ? (parsed as MediaControlFrame)
        : undefined;
    case "pong":
    case "keyframe_request":
      return parsed as MediaControlFrame;
    case "ready":
      return typeof f["sampleRate"] === "number" &&
        Number.isFinite(f["sampleRate"]) &&
        f["sampleRate"] > 0 &&
        typeof f["video"] === "boolean" &&
        optionalString(f["callId"]) &&
        optionalString(f["connectionId"])
        ? (parsed as MediaControlFrame)
        : undefined;
    case "participant_joined":
    case "participant_state":
      return isParticipant(f["participant"])
        ? (parsed as MediaControlFrame)
        : undefined;
    case "participant_left":
      return isString(f["participantId"]) && optionalString(f["reason"])
        ? (parsed as MediaControlFrame)
        : undefined;
    case "video_source": {
      if (!isSourceHandle(f["source"])) return undefined;
      const byConnection =
        isConnectionId(f["connectionId"]) &&
        optionalString(f["connectionParticipant"]) &&
        f["participant"] === undefined;
      const byParticipant =
        isParticipant(f["participant"]) &&
        f["connectionId"] === undefined &&
        f["connectionParticipant"] === undefined;
      return byConnection || byParticipant
        ? (parsed as MediaControlFrame)
        : undefined;
    }
    case "video_source_removed":
      return isSourceHandle(f["source"])
        ? (parsed as MediaControlFrame)
        : undefined;
    case "error":
      return isString(f["code"]) && optionalString(f["message"])
        ? (parsed as MediaControlFrame)
        : undefined;
    default:
      return undefined;
  }
}

/** A positive uint32 source handle. */
export function isSourceHandle(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value > 0 &&
    value <= 0xffff_ffff
  );
}

export function isParticipant(value: unknown): value is Participant {
  if (value === null || typeof value !== "object") return false;
  const p = value as Record<string, unknown>;
  return (
    isString(p["id"]) &&
    p["id"].length > 0 &&
    !Object.hasOwn(p, "handle") &&
    ["phoneNumber", "bsuid", "username"].every((key) =>
      optionalString(p[key]),
    ) &&
    typeof p["audioMuted"] === "boolean" &&
    typeof p["video"] === "boolean" &&
    ["invited", "ringing", "connected", "left"].includes(p["state"] as string)
  );
}

function isCandidate(value: unknown): value is TrickleCandidate {
  if (value === null || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  // `null` is what a serialized `RTCIceCandidate` carries for an absent
  // `sdpMid` / `sdpMLineIndex`, so it is tolerated.
  return (
    isString(candidate["candidate"]) &&
    (candidate["sdpMid"] == null || isString(candidate["sdpMid"])) &&
    (candidate["sdpMLineIndex"] == null ||
      typeof candidate["sdpMLineIndex"] === "number")
  );
}

function parseObject(data: unknown): Record<string, unknown> | undefined {
  if (typeof data !== "string") return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    return undefined;
  }
  return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : undefined;
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function optionalString(value: unknown): boolean {
  return value === undefined || typeof value === "string";
}
