import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CALLS_SDK_VERSION,
  Call,
  CallReporter,
  CallsApiError,
  HttpCallsApi,
  createInternalCallsClient,
  type CallReport,
  type InternalCallsClientOptions,
} from "../src/internal.js";
import { FakeWebSocket, fakeApi, flush, timers } from "./helpers.js";

const client = {
  sdk: "@polymorfa/sdk",
  version: CALLS_SDK_VERSION,
  platform: "node",
} as const;

beforeEach(() => {
  FakeWebSocket.instances = [];
});

describe("CallReporter", () => {
  function reporter(
    send = vi.fn<(report: CallReport) => Promise<unknown>>(
      async () => undefined,
    ),
  ) {
    let now = 0;
    const r = new CallReporter({
      connectionId: "conn_0123456789",
      client,
      send,
      now: () => now,
    });
    return { r, send, advance: (ms: number) => (now += ms) };
  }

  it("sends one quality report per 5 seconds unless forced, and cleans figures", () => {
    const { r, send, advance } = reporter();
    r.quality({
      rttMs: 41.6,
      jitterMs: -3,
      packetsLost: Number.NaN,
      audioCodec: "audio/opus",
      videoCodec: "bad codec",
      candidateType: "relay",
      reconnects: 5_000,
    });
    expect(send).toHaveBeenLastCalledWith({
      kind: "quality",
      connectionId: "conn_0123456789",
      client,
      quality: {
        rttMs: 42,
        jitterMs: 0,
        audioCodec: "audio/opus",
        candidateType: "relay",
        reconnects: 1000,
      },
    });
    advance(4_999);
    r.quality({ rttMs: 1 });
    expect(send).toHaveBeenCalledTimes(1);
    r.quality({ rttMs: 1 }, true);
    expect(send).toHaveBeenCalledTimes(2);
    advance(5_000);
    r.quality({ rttMs: 2 });
    expect(send).toHaveBeenCalledTimes(3);
    // Nothing measured: nothing sent.
    advance(5_000);
    r.quality({ videoCodec: "?" });
    expect(send).toHaveBeenCalledTimes(3);
  });

  it("sends at most 20 error reports a minute", () => {
    const { r, send, advance } = reporter();
    for (let i = 0; i < 25; i += 1) r.error("ice_failed");
    expect(send).toHaveBeenCalledTimes(20);
    advance(60_000);
    r.error("media_timeout");
    expect(send).toHaveBeenCalledTimes(21);
  });

  it("drops a report refused with 429 or 503 and stops after any other 4xx", async () => {
    const send = vi
      .fn<(report: CallReport) => Promise<unknown>>()
      .mockRejectedValueOnce(new CallsApiError(429, "rate_limited", "slow"))
      .mockRejectedValueOnce(new CallsApiError(503, "unavailable", "later"))
      .mockRejectedValueOnce(new CallsApiError(403, "forbidden", "no"))
      .mockResolvedValue(undefined);
    const { r } = reporter(send);
    r.error("other");
    await flush();
    expect(r.stopped).toBe(false);
    r.error("other");
    await flush();
    expect(r.stopped).toBe(false);
    r.error("other");
    await flush();
    expect(r.stopped).toBe(true);
    r.error("other");
    r.quality({ rttMs: 1 }, true);
    expect(send).toHaveBeenCalledTimes(3);
  });

  it("never throws, even when sending throws synchronously", () => {
    const { r } = reporter(
      vi.fn(() => {
        throw new Error("boom");
      }),
    );
    expect(() => r.error("other")).not.toThrow();
    expect(() => r.quality({ rttMs: 1 })).not.toThrow();
  });
});

describe("HttpCallsApi.report", () => {
  it("posts the report and drops participant for client tokens", async () => {
    const fetch = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(
      async () =>
        new Response(JSON.stringify({ success: true }), { status: 202 }),
    );
    const report: CallReport = {
      kind: "error",
      connectionId: "conn_0123456789",
      participant: "desk-1",
      client,
      error: { code: "media_timeout" },
    };
    for (const [token, expected] of [
      ["pmfa_ct_browser", { ...report, participant: undefined }],
      ["pmfa_sk_server", report],
    ] as const) {
      fetch.mockClear();
      const api = new HttpCallsApi({ token, fetch, baseUrl: "https://api.x" });
      await api.report("call/1", report);
      const [url, init] = fetch.mock.calls[0]!;
      expect(url).toBe("https://api.x/messaging/voip/calls/call%2F1/reports");
      expect(init.method).toBe("POST");
      expect(JSON.parse(String(init.body))).toEqual(
        JSON.parse(JSON.stringify(expected)),
      );
    }
  });
});

describe("Call diagnostics (socket media)", () => {
  function clientWith(
    options: Pick<InternalCallsClientOptions, "diagnostics" | "mediaMode"> & {
      participant?: string;
    } = {},
  ) {
    const api = fakeApi();
    const t = timers();
    const c = createInternalCallsClient({
      session: "support",
      api,
      WebSocket: FakeWebSocket as unknown as typeof globalThis.WebSocket,
      setInterval: t.setInterval,
      clearInterval: t.clearInterval,
      setTimeout: t.setTimeout,
      clearTimeout: t.clearTimeout,
      random: () => 0.5,
      now: () => 1_000,
      ...options,
    });
    return { c, api, t };
  }
  async function ringing(h: ReturnType<typeof clientWith>) {
    const connecting = h.c.connect();
    await flush();
    FakeWebSocket.instances[0]!.authenticate();
    await connecting;
    let call: Call | undefined;
    h.c.on("incoming", (x) => (call = x));
    FakeWebSocket.instances[0]!.text({
      type: "event",
      event: "call.received",
      callId: "CALL-1",
      payload: { callId: "CALL-1", from: { phoneNumber: "+15550100" } },
      timestamp: "",
    });
    return call!;
  }
  const reports = (h: ReturnType<typeof clientWith>) =>
    h.api.report!.mock.calls.map(([, report]) => report as CallReport);

  it("reports a token failure with the connection and client", async () => {
    const h = clientWith();
    const call = await ringing(h);
    h.api.token.mockRejectedValue(new Error("token service down"));
    await expect(call.answer()).rejects.toThrow();
    await flush();
    expect(h.api.report!.mock.calls[0]![0]).toBe("CALL-1");
    expect(reports(h)).toEqual([
      {
        kind: "error",
        connectionId: call.connectionId,
        client,
        error: { code: "token_refresh_failed" },
      },
    ]);
  });

  it("reports a media-ready timeout", async () => {
    const h = clientWith({ participant: "desk-1" });
    const call = await ringing(h);
    const answering = call.answer();
    await flush();
    FakeWebSocket.instances[1]!.open();
    h.t.fireTimeouts();
    await expect(answering).rejects.toThrow(/did not report media ready/);
    expect(reports(h)).toEqual([
      {
        kind: "error",
        connectionId: call.connectionId,
        client,
        participant: "desk-1",
        error: { code: "media_timeout" },
      },
    ]);
  });

  async function connectedCall(h: ReturnType<typeof clientWith>) {
    const call = await ringing(h);
    const answering = call.answer();
    await flush();
    const media = FakeWebSocket.instances[1]!;
    media.open();
    media.text({ type: "ready", sampleRate: 16_000, video: false });
    await answering;
    return call;
  }

  it("counts reconnections and sends them when the connection closes", async () => {
    const h = clientWith();
    const call = await connectedCall(h);
    FakeWebSocket.instances[1]!.drop(1006);
    h.t.fireTimeouts();
    await flush();
    const again = FakeWebSocket.instances[2]!;
    again.open();
    again.text({ type: "ready", sampleRate: 16_000, video: false });
    await flush();
    expect(call.state).toBe("connected");
    await call.end();
    expect(reports(h)).toEqual([
      {
        kind: "quality",
        connectionId: call.connectionId,
        client,
        quality: { reconnects: 1 },
      },
    ]);
  });

  it("reports giving up on reconnection", async () => {
    const h = clientWith();
    const call = await connectedCall(h);
    h.api.token.mockRejectedValue(new Error("unreachable"));
    FakeWebSocket.instances[1]!.drop(1006);
    for (let i = 0; i < 6; i += 1) {
      h.t.fireTimeouts();
      await flush(20);
    }
    expect(call.endReason).toBe("connection_failed");
    expect(
      reports(h).map((r) => (r.kind === "error" ? r.error.code : r)),
    ).toEqual([
      "reconnect_exhausted",
      {
        kind: "quality",
        connectionId: call.connectionId,
        client,
        quality: { reconnects: 0 },
      },
    ]);
  });

  it("sends nothing when diagnostics are off or media is external", async () => {
    for (const options of [
      { diagnostics: false },
      { mediaMode: "external" as const },
    ]) {
      FakeWebSocket.instances = [];
      const h = clientWith(options);
      const call = await ringing(h);
      h.api.token.mockRejectedValue(new Error("token service down"));
      await call.answer().catch(() => undefined);
      await call.end().catch(() => undefined);
      expect(h.api.report!).not.toHaveBeenCalled();
    }
  });
});

describe("CALLS_SDK_VERSION", () => {
  it("matches the @polymorfa/sdk package version that ships the Calls client", () => {
    const root = JSON.parse(
      readFileSync(new URL("../../../package.json", import.meta.url), "utf8"),
    ) as { version: string };
    expect(CALLS_SDK_VERSION).toBe(root.version);
  });
});
