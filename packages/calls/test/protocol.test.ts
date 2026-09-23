import { describe, expect, it } from "vitest";
import {
  MediaFrameKind,
  VIDEO_HEADER_BYTES,
  VideoCodec,
  decodeMediaFrame,
  encodeAudioFrame,
  encodeVideoFrame,
  createConnectionId,
  isConnectionId,
  parseLifecycleFrame,
  parseMediaControl,
} from "../src/internal.js";

describe("media framing", () => {
  it("round-trips audio as little-endian s16 behind a kind tag", () => {
    const pcm = new Int16Array([0, 1, -1, 32767, -32768]);
    const bytes = encodeAudioFrame(pcm);
    expect(bytes[0]).toBe(MediaFrameKind.Audio);
    expect(bytes.byteLength).toBe(1 + pcm.length * 2);
    const decoded = decodeMediaFrame(bytes);
    expect(decoded?.kind).toBe("audio");
    expect(decoded?.kind === "audio" && [...decoded.pcm]).toEqual([...pcm]);
  });

  it("round-trips a video frame with its fixed header", () => {
    const frame = {
      codec: VideoCodec.H264,
      keyframe: true,
      source: 0xdead_beef,
      timestampUs: 1_234_567_890_123,
      data: new Uint8Array([9, 8, 7]),
    };
    const bytes = encodeVideoFrame(frame);
    expect(bytes.byteLength).toBe(1 + VIDEO_HEADER_BYTES + 3);
    const decoded = decodeMediaFrame(bytes);
    expect(decoded?.kind).toBe("video");
    if (decoded?.kind !== "video") throw new Error("expected video");
    expect({ ...decoded.frame, data: [...decoded.frame.data] }).toEqual({
      ...frame,
      data: [9, 8, 7],
    });
  });

  it("refuses frames it cannot trust", () => {
    expect(decodeMediaFrame(new Uint8Array([]))).toBeUndefined();
    expect(decodeMediaFrame(new Uint8Array([0x7f, 1, 2]))).toBeUndefined();
    // Odd audio payload cannot be s16.
    expect(
      decodeMediaFrame(new Uint8Array([MediaFrameKind.Audio, 1])),
    ).toBeUndefined();
    // Truncated video header.
    expect(
      decodeMediaFrame(new Uint8Array([MediaFrameKind.Video, 1, 2, 3])),
    ).toBeUndefined();
  });

  it("lays the v2 video header out as codec, flags, source, timestamp", () => {
    // Exactly the bytes the platform writes: kind 0x02, codec 0x01 (H.264),
    // flags bit0 keyframe, source u32 big-endian, timestamp u64 big-endian.
    const bytes = new Uint8Array([
      0x02, 0x01, 0x01, 0x00, 0x00, 0x01, 0x02, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x0f, 0x42, 0x40, 0x00, 0x00, 0x00, 0x01, 0x65,
    ]);
    const decoded = decodeMediaFrame(bytes);
    if (decoded?.kind !== "video") throw new Error("expected video");
    expect(decoded.frame).toMatchObject({
      codec: VideoCodec.H264,
      keyframe: true,
      source: 258,
      timestampUs: 1_000_000,
    });
    expect([...decoded.frame.data]).toEqual([0, 0, 0, 1, 0x65]);
    // Clients always send source 0; the platform assigns the handle.
    const out = encodeVideoFrame({
      keyframe: false,
      timestampUs: 1_000_000,
      data: new Uint8Array([0, 0, 0, 1, 0x41]),
    });
    expect([...out.subarray(0, 15)]).toEqual([
      0x02, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x0f, 0x42, 0x40,
    ]);
    // Header-only frames and unknown codecs are refused.
    expect(decodeMediaFrame(bytes.subarray(0, 15))).toBeUndefined();
    const vp8 = bytes.slice();
    vp8[1] = 0x02;
    expect(decodeMediaFrame(vp8)).toBeUndefined();
  });
});

describe("connection identifiers", () => {
  it("generates base64url connection ids within the contract bounds", () => {
    const ids = new Set(Array.from({ length: 50 }, () => createConnectionId()));
    expect(ids.size).toBe(50);
    for (const id of ids) {
      expect(id).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
      expect(isConnectionId(id)).toBe(true);
    }
    expect(isConnectionId("short")).toBe(false);
    expect(isConnectionId("has space in it")).toBe(false);
    expect(isConnectionId("x".repeat(65))).toBe(false);
  });
});

describe("frame parsers", () => {
  it("accepts only complete lifecycle frames", () => {
    expect(parseLifecycleFrame("nope")).toBeUndefined();
    expect(
      parseLifecycleFrame(JSON.stringify({ type: "event", event: "x" })),
    ).toBeUndefined();
    expect(
      parseLifecycleFrame(
        JSON.stringify({
          type: "event",
          event: "call.received",
          callId: "c",
          payload: {},
          timestamp: "",
        }),
      ),
    ).toMatchObject({ type: "event", callId: "c" });
    expect(parseLifecycleFrame(JSON.stringify({ type: "pong" }))).toEqual({
      type: "pong",
    });
  });

  it("validates each media control variant", () => {
    expect(
      parseMediaControl(JSON.stringify({ type: "ready", sampleRate: 16000 })),
    ).toBeUndefined();
    expect(
      parseMediaControl(
        JSON.stringify({ type: "ready", sampleRate: 16000, video: false }),
      ),
    ).toMatchObject({
      type: "ready",
    });
    expect(
      parseMediaControl(
        JSON.stringify({
          type: "participant_joined",
          participant: { id: "p" },
        }),
      ),
    ).toBeUndefined();
    expect(
      parseMediaControl(
        JSON.stringify({
          type: "participant_joined",
          participant: {
            id: "p",
            phoneNumber: "+15550100",
            audioMuted: false,
            video: false,
            state: "connected",
          },
        }),
      ),
    ).toMatchObject({ type: "participant_joined" });
  });

  it("validates video source announcements", () => {
    const participant = {
      id: "123",
      phoneNumber: "+15550100",
      audioMuted: false,
      video: true,
      state: "connected",
    };
    const parse = (frame: unknown) => parseMediaControl(JSON.stringify(frame));
    expect(
      parse({ type: "video_source", source: 3, connectionId: "conn-abcd" }),
    ).toEqual({ type: "video_source", source: 3, connectionId: "conn-abcd" });
    expect(parse({ type: "video_source", source: 4, participant })).toEqual({
      type: "video_source",
      source: 4,
      participant,
    });
    // Exactly one owner, a positive handle, and a valid connection id.
    expect(
      parse({
        type: "video_source",
        source: 3,
        connectionId: "conn-abcd",
        participant,
      }),
    ).toBeUndefined();
    expect(parse({ type: "video_source", source: 3 })).toBeUndefined();
    expect(
      parse({ type: "video_source", source: 0, connectionId: "conn-abcd" }),
    ).toBeUndefined();
    expect(
      parse({ type: "video_source", source: 3, connectionId: "bad id" }),
    ).toBeUndefined();
    expect(parse({ type: "video_source_removed", source: 3 })).toEqual({
      type: "video_source_removed",
      source: 3,
    });
    expect(parse({ type: "keyframe_request" })).toEqual({
      type: "keyframe_request",
    });
  });
});

describe("participant_left", () => {
  it("accepts reason only when absent or a string", () => {
    expect(
      parseMediaControl(
        JSON.stringify({
          type: "participant_left",
          participantId: "p",
          reason: 42,
        }),
      ),
    ).toBeUndefined();
    expect(
      parseMediaControl(
        JSON.stringify({ type: "participant_left", participantId: "p" }),
      ),
    ).toMatchObject({ type: "participant_left" });
    expect(
      parseMediaControl(
        JSON.stringify({
          type: "participant_left",
          participantId: "p",
          reason: "hangup",
        }),
      ),
    ).toMatchObject({ reason: "hangup" });
  });
});
