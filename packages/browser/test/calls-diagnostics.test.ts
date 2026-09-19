import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CallsApiError, type CallReport } from "@polymorfa/sdk/calls/internal";
import {
  BROWSER_SDK_VERSION,
  mediaErrorCode,
  qualityFromStats,
} from "../src/calls/diagnostics.js";
import {
  CallsController,
  type CallLifecycleEvent,
  type CallMediaCallbacks,
  type CallMediaFactory,
  type CallMediaSession,
  type CallsBackend,
} from "../src/internal.js";

const client = {
  sdk: "@polymorfa/browser",
  version: BROWSER_SDK_VERSION,
  platform: "browser",
};

/** A getStats() result as Chromium reports it, trimmed to what is read. */
function stats(received: number, rtt = 0.0415): RTCStatsReport {
  const entries: [string, Record<string, unknown>][] = [
    [
      "CP1",
      {
        type: "candidate-pair",
        nominated: true,
        state: "succeeded",
        currentRoundTripTime: rtt,
        localCandidateId: "L1",
      },
    ],
    ["CP2", { type: "candidate-pair", nominated: false, state: "waiting" }],
    ["L1", { type: "local-candidate", candidateType: "relay" }],
    [
      "IA",
      {
        type: "inbound-rtp",
        kind: "audio",
        jitter: 0.0123,
        packetsLost: 3,
        packetsReceived: received,
        codecId: "C1",
      },
    ],
    [
      "IV",
      {
        type: "inbound-rtp",
        kind: "video",
        packetsLost: -2,
        packetsReceived: 100,
        codecId: "C2",
      },
    ],
    ["C1", { type: "codec", mimeType: "audio/opus" }],
    ["C2", { type: "codec", mimeType: "video/H264" }],
    ["R1", { type: "remote-inbound-rtp", roundTripTime: 0.2 }],
  ];
  return new Map(entries) as unknown as RTCStatsReport;
}

describe("qualityFromStats", () => {
  it("maps the selected pair, inbound RTP and codecs onto report figures", () => {
    expect(qualityFromStats(stats(900))).toEqual({
      figures: {
        rttMs: 42,
        jitterMs: 12,
        packetsLost: 1,
        packetsReceived: 1000,
        audioCodec: "audio/opus",
        videoCodec: "video/H264",
        candidateType: "relay",
      },
      packetsReceived: 1000,
    });
  });

  it("falls back to the remote inbound RTP round-trip time", () => {
    const report = new Map([
      ["R1", { type: "remote-inbound-rtp", roundTripTime: 0.2 }],
    ]) as unknown as RTCStatsReport;
    expect(qualityFromStats(report)).toEqual({
      figures: { rttMs: 200 },
      packetsReceived: undefined,
    });
  });
});

describe("mediaErrorCode", () => {
  const named = (name: string) => Object.assign(new Error(name), { name });
  it.each([
    ["NotAllowedError", "media_permission_denied"],
    ["NotFoundError", "device_not_found"],
    ["NotReadableError", "device_in_use"],
    ["NotSupportedError", "unsupported_browser"],
    ["OperationError", "negotiation_failed"],
    ["AbortError", undefined],
    ["CallClaimedError", undefined],
  ])("maps %s to %s", (name, code) => {
    expect(mediaErrorCode(named(name))).toBe(code);
  });
});

describe("browser call diagnostics", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function fixture(
    options: { diagnostics?: boolean; open?: () => Promise<never> } = {},
  ) {
    let emit: ((event: CallLifecycleEvent) => void) | undefined;
    let callbacks: CallMediaCallbacks | undefined;
    let received = 0;
    const getStats = vi.fn(async () => stats(received));
    const session: CallMediaSession = {
      connectionId: "conn_media_0001",
      localStream: {
        getAudioTracks: () => [],
        getVideoTracks: () => [],
      } as never,
      remoteStream: {} as MediaStream,
      setMuted: vi.fn(),
      audioEnabled: () => true,
      videoEnabled: () => false,
      getStats,
      close: vi.fn(async () => undefined),
    };
    const report = vi.fn<(callId: string, report: CallReport) => Promise<void>>(
      async () => undefined,
    );
    const backend: CallsBackend = {
      subscribe: (listener) => {
        emit = listener;
        return () => undefined;
      },
      place: vi.fn(async () => ({ callId: "call-1" })),
      answer: vi.fn(async () => undefined),
      reject: vi.fn(async () => undefined),
      hangup: vi.fn(async () => undefined),
      connectionId: () => "conn_media_0001",
      report,
    };
    const opened: CallMediaFactory["open"] = async (_id, _video, c) => {
      callbacks = c;
      return session;
    };
    const media: CallMediaFactory = {
      open: vi.fn(options.open ?? opened),
    };
    const controller = new CallsController(backend, media, {
      ...(options.diagnostics === undefined
        ? {}
        : { diagnostics: options.diagnostics }),
    });
    controller.initialize();
    const reports = () => report.mock.calls.map(([id, body]) => ({ id, body }));
    return {
      controller,
      session,
      report,
      reports,
      getStats,
      emit: (event: CallLifecycleEvent) => emit?.(event),
      callbacks: () => callbacks!,
      receive: (packets: number) => (received = packets),
    };
  }

  async function connected(f: ReturnType<typeof fixture>) {
    await f.controller.place("+15550100");
    f.emit({ type: "accepted", callId: "call-1" });
    f.callbacks().onConnectionState("connected");
    expect(f.controller.getSnapshot().status).toBe("connected");
  }

  const settle = () => vi.advanceTimersByTimeAsync(0);

  it("reports figures every 15 seconds and once more when the connection closes", async () => {
    const f = fixture();
    await connected(f);
    f.receive(500);
    await vi.advanceTimersByTimeAsync(14_999);
    expect(f.report).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(f.reports()).toEqual([
      {
        id: "call-1",
        body: {
          kind: "quality",
          connectionId: "conn_media_0001",
          client,
          quality: {
            rttMs: 42,
            jitterMs: 12,
            packetsLost: 1,
            packetsReceived: 600,
            audioCodec: "audio/opus",
            videoCodec: "video/H264",
            candidateType: "relay",
            reconnects: 0,
          },
        },
      },
    ]);
    f.receive(900);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(f.report).toHaveBeenCalledTimes(2);
    await f.controller.hangup();
    await settle();
    expect(f.report).toHaveBeenCalledTimes(3);
    expect(f.reports()[2]!.body).toMatchObject({ kind: "quality" });
    // The loop stopped with the connection.
    await vi.advanceTimersByTimeAsync(60_000);
    expect(f.report).toHaveBeenCalledTimes(3);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("reports media_timeout once when nothing arrives while connected", async () => {
    const f = fixture();
    await connected(f);
    f.receive(500);
    await vi.advanceTimersByTimeAsync(30_000);
    await vi.advanceTimersByTimeAsync(15_000);
    const errors = f
      .reports()
      .filter(({ body }) => body.kind === "error")
      .map(({ body }) => (body.kind === "error" ? body.error.code : ""));
    expect(errors).toEqual(["media_timeout"]);
    f.controller.dispose();
  });

  it("counts recoveries, and reports ICE failure and giving up", async () => {
    const f = fixture();
    await connected(f);
    f.callbacks().onIceConnectionState?.("disconnected");
    f.callbacks().onIceConnectionState?.("connected");
    f.receive(10);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(f.reports().at(-1)!.body).toMatchObject({
      quality: { reconnects: 1 },
    });
    f.callbacks().onConnectionState("failed");
    await vi.advanceTimersByTimeAsync(15_000);
    await settle();
    const codes = f
      .reports()
      .filter(({ body }) => body.kind === "error")
      .map(({ body }) => (body.kind === "error" ? body.error.code : ""));
    expect(codes).toEqual(["ice_failed", "reconnect_exhausted"]);
    expect(f.controller.getSnapshot().endReason).toBe("connection_failed");
  });

  it("reports a denied microphone for the connection that failed to open", async () => {
    const f = fixture({
      open: async () => {
        throw Object.assign(new Error("denied"), { name: "NotAllowedError" });
      },
    });
    await f.controller.place("+15550100");
    expect(f.controller.getSnapshot().status).toBe("error");
    expect(f.reports()).toEqual([
      {
        id: "call-1",
        body: {
          kind: "error",
          connectionId: "conn_media_0001",
          client,
          error: { code: "media_permission_denied" },
        },
      },
    ]);
  });

  it("sends nothing with diagnostics off", async () => {
    const f = fixture({ diagnostics: false });
    await connected(f);
    await vi.advanceTimersByTimeAsync(60_000);
    await f.controller.hangup();
    await settle();
    expect(f.report).not.toHaveBeenCalled();
  });

  it("stops after a refusal other than 429 and never disturbs the call", async () => {
    const f = fixture();
    f.report
      .mockRejectedValueOnce(new CallsApiError(429, "rate_limited", "slow"))
      .mockRejectedValueOnce(new CallsApiError(403, "forbidden", "scope"));
    await connected(f);
    f.receive(1);
    await vi.advanceTimersByTimeAsync(15_000);
    f.receive(2);
    await vi.advanceTimersByTimeAsync(15_000);
    f.receive(3);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(f.report).toHaveBeenCalledTimes(2);
    expect(f.controller.getSnapshot().status).toBe("connected");
    f.getStats.mockRejectedValue(new Error("closed"));
    await f.controller.hangup();
    expect(f.controller.getSnapshot().status).toBe("ended");
  });
});

describe("BROWSER_SDK_VERSION", () => {
  it("matches the @polymorfa/browser package version", () => {
    const pkg = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    ) as { version: string };
    expect(BROWSER_SDK_VERSION).toBe(pkg.version);
  });
});
