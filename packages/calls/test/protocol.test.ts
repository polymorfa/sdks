import { describe, expect, it } from "vitest";
import {
  MediaFrameKind,
  VIDEO_HEADER_BYTES,
  VideoCodec,
  decodeMediaFrame,
  encodeAudioFrame,
  encodeVideoFrame,
  parseLifecycleFrame,
  parseMediaControl,
} from "../src/index.js";

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
      width: 640,
      height: 360,
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
            handle: "+15550100",
            audioMuted: false,
            video: false,
            state: "connected",
          },
        }),
      ),
    ).toMatchObject({ type: "participant_joined" });
  });
});
