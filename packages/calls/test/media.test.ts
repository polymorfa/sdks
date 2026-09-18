import { describe, expect, it } from "vitest";

import {
  CallClaimedError,
  CallsAuthError,
  CallsDisabledError,
} from "../src/errors.js";
import { MediaSocket, type MediaClose } from "../src/media.js";
import { encodeVideoFrame, type VideoFrame } from "../src/protocol.js";
import { FakeWebSocket, fakeApi, flush, timers } from "./helpers.js";

function mediaWith(
  WS: unknown = FakeWebSocket,
  extra: { participant?: string; refreshToken?: boolean } = {},
) {
  FakeWebSocket.instances = [];
  const t = timers();
  const api = fakeApi();
  const media = new MediaSocket({
    api,
    callId: "CALL 1",
    connectionId: "conn-0001",
    WebSocket: WS as typeof globalThis.WebSocket,
    setInterval: t.setInterval,
    clearInterval: t.clearInterval,
    setTimeout: t.setTimeout,
    clearTimeout: t.clearTimeout,
    ...extra,
  });
  return { media, t, api };
}

const ready = { type: "ready", sampleRate: 16_000, video: true };

describe("MediaSocket authentication", () => {
  it("opens the v2 media path and authenticates with the first frame", async () => {
    const { media } = mediaWith();
    const connecting = media.connect();
    await flush();
    const ws = FakeWebSocket.instances[0]!;
    expect(ws.url).toBe("wss://api.example/voip/calls/CALL%201/media");
    expect(ws.protocols).toEqual(["pmfa.calls.v2"]);
    ws.open();
    expect(ws.texts).toEqual([
      { type: "auth", token: "pmfa_ct_test", connectionId: "conn-0001" },
    ]);
    ws.text({ ...ready, callId: "CALL 1", connectionId: "conn-0001" });
    await connecting;
    expect(media.connected).toBe(true);
    media.close();
  });

  it("sends the participant name only for server credentials", async () => {
    const { media, api } = mediaWith(FakeWebSocket, { participant: "agent-7" });
    api.token.mockResolvedValue({ value: "pmfa_live_key" });
    const connecting = media.connect();
    await flush();
    FakeWebSocket.instances[0]!.open();
    expect(FakeWebSocket.instances[0]!.texts[0]).toEqual({
      type: "auth",
      token: "pmfa_live_key",
      connectionId: "conn-0001",
      participant: "agent-7",
    });
    FakeWebSocket.instances[0]!.text(ready);
    await connecting;
    media.close();

    const client = mediaWith(FakeWebSocket, { participant: "agent-7" });
    const again = client.media.connect();
    await flush();
    FakeWebSocket.instances[0]!.open();
    expect(FakeWebSocket.instances[0]!.texts[0]).not.toHaveProperty(
      "participant",
    );
    client.media.close();
    await expect(again).rejects.toThrow();
  });

  it("asks for a fresh token when reconnecting after an auth failure", async () => {
    const { media, api } = mediaWith(FakeWebSocket, { refreshToken: true });
    void media.connect().catch(() => undefined);
    await flush();
    expect(api.token).toHaveBeenCalledWith({ refresh: true });
    media.close();
  });

  it("rejects with CallClaimedError when the platform refuses a claimed call", async () => {
    const { media } = mediaWith();
    const closes: MediaClose[] = [];
    media.on("close", (c) => closes.push(c));
    const connecting = media.connect();
    await flush();
    const ws = FakeWebSocket.instances[0]!;
    ws.open();
    ws.drop(1008, "call claimed");
    await expect(connecting).rejects.toBeInstanceOf(CallClaimedError);
    expect(closes).toEqual([{ reason: "claimed", code: 1008 }]);
  });

  it("rejects when the handshake fails with an error and no close", async () => {
    const { media } = mediaWith();
    const closes: MediaClose[] = [];
    media.on("close", (close) => closes.push(close));
    const connecting = media.connect();
    await flush();
    const ws = FakeWebSocket.instances[0]!;
    ws.failHandshake();
    await expect(connecting).rejects.toThrow();
    expect(media.connected).toBe(false);
    expect(ws.closed).toBeDefined();
    ws.drop(1006);
    expect(closes).toEqual([{ reason: "lost", code: 1006 }]);
  });

  it("rejects with CallsAuthError on a 4401 close", async () => {
    const { media } = mediaWith();
    const connecting = media.connect();
    await flush();
    FakeWebSocket.instances[0]!.open();
    FakeWebSocket.instances[0]!.drop(4401, "unauthorized");
    await expect(connecting).rejects.toBeInstanceOf(CallsAuthError);
  });

  it("maps a call_claimed error frame to CallClaimedError", async () => {
    const { media } = mediaWith();
    const connecting = media.connect();
    await flush();
    FakeWebSocket.instances[0]!.open();
    // Refusals carry only a code, then the socket closes with 4409.
    FakeWebSocket.instances[0]!.text({ type: "error", code: "call_claimed" });
    FakeWebSocket.instances[0]!.drop(4409, "unauthorized");
    await expect(connecting).rejects.toBeInstanceOf(CallClaimedError);
  });

  it("maps a calls_disabled refusal to CallsDisabledError without retrying", async () => {
    const { media } = mediaWith();
    const closes: MediaClose[] = [];
    media.on("close", (c) => closes.push(c));
    const connecting = media.connect();
    await flush();
    FakeWebSocket.instances[0]!.open();
    FakeWebSocket.instances[0]!.text({ type: "error", code: "calls_disabled" });
    FakeWebSocket.instances[0]!.drop(4403, "calls disabled");
    await expect(connecting).rejects.toBeInstanceOf(CallsDisabledError);
    expect(closes.at(-1)).toMatchObject({ reason: "refused", code: 4403 });
  });

  it("classifies the platform's close codes", async () => {
    const cases: [number, string, string | undefined, string][] = [
      [4409, "call claimed", undefined, "claimed"],
      [4409, "unauthorized", "state_conflict", "ended"],
      [1000, "media connection closed", undefined, "ended"],
      [4400, "unauthorized", "invalid_parameter", "refused"],
      [4403, "calls disabled", "calls_disabled", "refused"],
      [1008, "authentication timeout", undefined, "refused"],
      [4429, "unauthorized", "rate_limit_exceeded", "lost"],
      [1013, "authorization unavailable", undefined, "lost"],
      [1011, "", undefined, "lost"],
    ];
    for (const [code, reason, errorCode, expected] of cases) {
      const { media } = mediaWith();
      const closes: MediaClose[] = [];
      media.on("close", (c) => closes.push(c));
      const connecting = media.connect().catch((e: unknown) => e);
      await flush();
      const ws = FakeWebSocket.instances[0]!;
      ws.open();
      if (errorCode !== undefined) ws.text({ type: "error", code: errorCode });
      ws.drop(code, reason);
      const error = (await connecting) as { code?: string };
      expect([code, closes[0]?.reason]).toEqual([code, expected]);
      if (errorCode !== undefined && expected !== "claimed")
        expect(error.code).toBe(errorCode);
    }
  });

  it("refuses to open with any query parameter", async () => {
    const { media } = mediaWith();
    void media.connect().catch(() => undefined);
    await flush();
    expect(new URL(FakeWebSocket.instances[0]!.url).search).toBe("");
    media.close();
  });
});

describe("MediaSocket media", () => {
  it("reports per-source video, source changes and keyframe requests", async () => {
    const { media } = mediaWith();
    const sources: unknown[] = [];
    const removed: number[] = [];
    const frames: VideoFrame[] = [];
    let keyframes = 0;
    media.on("videoSource", (s) => sources.push(s));
    media.on("videoSourceRemoved", (s) => removed.push(s));
    media.on("video", (f) => frames.push(f));
    media.on("keyframeRequest", () => (keyframes += 1));
    const connecting = media.connect();
    await flush();
    const ws = FakeWebSocket.instances[0]!;
    ws.open();
    // Nothing is delivered before ready.
    ws.binary(
      encodeVideoFrame({
        source: 7,
        keyframe: true,
        timestampUs: 1,
        data: new Uint8Array([1]),
      }),
    );
    ws.text(ready);
    await connecting;
    expect(frames).toEqual([]);
    const participant = {
      id: "123",
      phoneNumber: "+15550100",
      audioMuted: false,
      video: true,
      state: "connected",
    };
    ws.text({
      type: "video_source",
      source: 7,
      connectionId: "peer-conn-1",
      connectionParticipant: "server:agent-7",
    });
    ws.text({ type: "video_source", source: 9, participant });
    ws.binary(
      encodeVideoFrame({
        source: 7,
        keyframe: true,
        timestampUs: 40_000,
        data: new Uint8Array([0, 0, 0, 1, 0x65]),
      }),
    );
    ws.binary(
      encodeVideoFrame({
        source: 9,
        keyframe: false,
        timestampUs: 80_000,
        data: new Uint8Array([0, 0, 0, 1, 0x41]),
      }),
    );
    ws.text({ type: "keyframe_request" });
    ws.text({ type: "video_source_removed", source: 7 });
    expect(sources).toEqual([
      {
        source: 7,
        connectionId: "peer-conn-1",
        connectionParticipant: "server:agent-7",
      },
      { source: 9, participant },
    ]);
    expect(frames.map((f) => [f.source, f.keyframe, f.timestampUs])).toEqual([
      [7, true, 40_000],
      [9, false, 80_000],
    ]);
    expect(keyframes).toBe(1);
    expect(removed).toEqual([7]);

    // Outbound video always carries source 0.
    expect(
      media.writeVideo({
        keyframe: true,
        timestampUs: 5,
        data: new Uint8Array([0, 0, 0, 1, 0x67]),
      }),
    ).toBe(true);
    const sent = ws.sent.at(-1) as Uint8Array;
    expect([...sent.subarray(0, 7)]).toEqual([2, 1, 1, 0, 0, 0, 0]);
    media.close();
  });

  it("sends leave and end_call control frames", async () => {
    const first = mediaWith();
    const closes: MediaClose[] = [];
    first.media.on("close", (c) => closes.push(c));
    const connecting = first.media.connect();
    await flush();
    FakeWebSocket.instances[0]!.open();
    FakeWebSocket.instances[0]!.text(ready);
    await connecting;
    expect(first.media.leave()).toBe(true);
    expect(FakeWebSocket.instances[0]!.lastText).toEqual({ type: "leave" });
    expect(closes).toEqual([{ reason: "left" }]);
    expect(first.media.connected).toBe(false);

    const second = mediaWith();
    const again = second.media.connect();
    await flush();
    FakeWebSocket.instances[0]!.open();
    FakeWebSocket.instances[0]!.text(ready);
    await again;
    expect(second.media.endCall()).toBe(true);
    expect(FakeWebSocket.instances[0]!.lastText).toEqual({ type: "end_call" });
  });
});

describe("MediaSocket.connect", () => {
  it("hands a second caller the in-flight attempt until ready settles it", async () => {
    const { media } = mediaWith();
    const first = media.connect();
    const second = media.connect();
    expect(second).toBe(first);
    let settled = false;
    void second.then(() => {
      settled = true;
    });
    await flush();
    const ws = FakeWebSocket.instances[0]!;
    ws.open();
    await flush();
    expect(settled).toBe(false);
    expect(FakeWebSocket.instances).toHaveLength(1);
    ws.text({ type: "ready", sampleRate: 16_000, video: false });
    await expect(second).resolves.toBeUndefined();
    await expect(media.connect()).resolves.toBeUndefined();
    media.close();
  });

  it("shares the attempt's failure with every caller", async () => {
    const { media } = mediaWith();
    const first = media.connect();
    const second = media.connect();
    media.close();
    await expect(first).rejects.toThrow(/closed/);
    await expect(second).rejects.toThrow(/closed/);
  });

  it("rejects when the socket cannot be constructed", async () => {
    class Throwing {
      constructor() {
        throw new Error("bad url");
      }
    }
    const { media } = mediaWith(Throwing);
    await expect(media.connect()).rejects.toThrow("bad url");
  });
});
