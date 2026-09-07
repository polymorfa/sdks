import { beforeEach, describe, expect, it } from "vitest";
import {
  CallsClient,
  MediaSocket,
  encodeAudioFrame,
  type Call,
} from "../src/index.js";
import { FakeWebSocket, fakeApi, flush, timers } from "./helpers.js";

function clientWith(api = fakeApi()) {
  FakeWebSocket.instances = [];
  const t = timers();
  const client = new CallsClient({
    session: "support",
    api,
    WebSocket: FakeWebSocket as unknown as typeof globalThis.WebSocket,
    setInterval: t.setInterval,
    clearInterval: t.clearInterval,
    setTimeout: t.setTimeout,
    clearTimeout: t.clearTimeout,
    random: () => 0.5,
    now: () => 1_000,
  });
  return { client, api, t, ws: (i = 0) => FakeWebSocket.instances[i]! };
}

async function connected(h: ReturnType<typeof clientWith>) {
  const connecting = h.client.connect();
  await flush();
  h.ws(0).open();
  await connecting;
  return h.ws(0);
}

function ring(life: FakeWebSocket, callId = "CALL-1", video = false) {
  life.text({
    type: "event",
    event: "call.received",
    callId,
    payload: { callId, from: { phoneNumber: "+15550100" }, hasVideo: video },
    timestamp: "2026-09-06T12:00:00Z",
  });
}

/** Drive the pod side of an accept: open the media socket and report bridged. */
async function bridge(
  h: ReturnType<typeof clientWith>,
  index = 1,
  sampleRate = 16_000,
) {
  await flush();
  const media = h.ws(index);
  media.open();
  media.text({ type: "ready", sampleRate, video: false });
  await flush();
  return media;
}

beforeEach(() => {
  FakeWebSocket.instances = [];
});

describe("CallsClient", () => {
  it("rings on call.received and answers into a bridged media socket", async () => {
    const h = clientWith();
    const life = await connected(h);
    expect(h.api.socketTicket).toHaveBeenCalledWith(
      "support",
      expect.any(AbortSignal),
    );

    const incoming: Call[] = [];
    h.client.on("incoming", (call) => incoming.push(call));
    ring(life);
    expect(incoming).toHaveLength(1);
    const call = incoming[0]!;
    expect(call).toMatchObject({
      id: "CALL-1",
      direction: "inbound",
      peer: "+15550100",
      state: "incoming",
    });

    const answering = call.answer();
    await flush();
    expect(h.api.accept).toHaveBeenCalledWith("CALL-1", { video: false });
    expect(call.state).toBe("connecting");
    const media = await bridge(h);
    await answering;
    expect(call.state).toBe("connected");
    // The ticket rides the subprotocol slot; browsers cannot set headers.
    expect(media.protocols).toEqual(["pmfa.ticket.pmfa_at_CALL-1"]);

    // WA -> us
    const heard: Int16Array[] = [];
    call.audio.on("data", (pcm) => heard.push(pcm));
    media.binary(encodeAudioFrame(new Int16Array([5, 6, 7])));
    expect(heard.map((p) => [...p])).toEqual([[5, 6, 7]]);
    // us -> WA
    expect(call.audio.write(new Int16Array([1, 2]))).toBe(true);
    const sent = media.sent.at(-1) as Uint8Array;
    expect([...sent]).toEqual([...encodeAudioFrame(new Int16Array([1, 2]))]);

    const ended: string[] = [];
    call.on("ended", (reason) => ended.push(reason));
    await call.hangup();
    expect(h.api.hangup).toHaveBeenCalledWith("CALL-1");
    expect(media.lastText).toEqual({ type: "hangup" });
    expect(ended).toEqual(["hangup"]);
    expect(call.audio.write(new Int16Array([1]))).toBe(false);
    expect(h.client.calls).toEqual([]);
  });

  it("rejects an incoming call without touching media", async () => {
    const h = clientWith();
    const life = await connected(h);
    let call: Call | undefined;
    h.client.on("incoming", (c) => (call = c));
    ring(life);
    await call!.reject();
    expect(h.api.reject).toHaveBeenCalledWith("CALL-1");
    expect(h.api.mediaTicket).not.toHaveBeenCalled();
    expect(call!.endReason).toBe("rejected");
    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it("places a call and bridges media when the remote accepts", async () => {
    const h = clientWith();
    const life = await connected(h);
    const call = await h.client.place("+15550100", { video: true });
    expect(h.api.place).toHaveBeenCalledWith(
      expect.objectContaining({
        session: "support",
        to: "+15550100",
        video: true,
      }),
    );
    expect(call).toMatchObject({
      id: "CALL-OUT",
      direction: "outbound",
      state: "ringing",
    });
    expect(call.video).toBeDefined();

    const connectedEvents: number[] = [];
    call.on("connected", () => connectedEvents.push(1));
    life.text({
      type: "event",
      event: "call.accepted",
      callId: "CALL-OUT",
      payload: {},
      timestamp: "",
    });
    await bridge(h);
    expect(call.state).toBe("connected");
    expect(connectedEvents).toEqual([1]);
    expect(call.connectedAt).toBe(1_000);
  });

  it("ends a call from the lifecycle stream and ignores late events for it", async () => {
    const h = clientWith();
    const life = await connected(h);
    let call: Call | undefined;
    h.client.on("incoming", (c) => (call = c));
    ring(life);
    const ended: string[] = [];
    h.client.on("ended", (_c, reason) => ended.push(reason));
    life.text({
      type: "event",
      event: "call.ended",
      callId: "CALL-1",
      payload: { reason: "user_hangup" },
      timestamp: "",
    });
    expect(call!.state).toBe("ended");
    expect(ended).toEqual(["remote_hangup"]);
    // A stale accepted for a finished call must not resurrect it.
    life.text({
      type: "event",
      event: "call.accepted",
      callId: "CALL-1",
      payload: {},
      timestamp: "",
    });
    await flush();
    expect(call!.state).toBe("ended");
    expect(h.api.mediaTicket).not.toHaveBeenCalled();
    // Call ids are unique per call, so the same id ringing again is a
    // duplicate of the ended call — it must not ring the application twice.
    let again: Call | undefined;
    h.client.on("incoming", (c) => (again = c));
    ring(life);
    expect(again).toBeUndefined();
    expect(h.client.calls).toEqual([]);
  });

  it("reports a failed accept and returns the call to incoming", async () => {
    const api = fakeApi();
    api.accept.mockRejectedValueOnce(new Error("pod refused"));
    const h = clientWith(api);
    const life = await connected(h);
    let call: Call | undefined;
    h.client.on("incoming", (c) => (call = c));
    ring(life);
    await expect(call!.answer()).rejects.toThrow("pod refused");
    expect(call!.state).toBe("incoming");
    // It can be tried again.
    const second = call!.answer();
    await bridge(h);
    await second;
    expect(call!.state).toBe("connected");
  });

  it("drops a lifecycle socket that stops answering pings and reconnects with a fresh ticket", async () => {
    const h = clientWith();
    const life = await connected(h);
    const states: boolean[] = [];
    h.client.on("disconnected", () => states.push(false));
    h.t.beat();
    expect(life.lastText).toEqual({ type: "ping" });
    life.text({ type: "pong" });
    h.t.beat();
    expect(h.client.connected).toBe(true);
    h.t.beat(); // unanswered -> dropped
    expect(h.client.connected).toBe(false);
    expect(states).toEqual([false]);
    h.t.fireTimeouts();
    await flush();
    expect(h.api.socketTicket).toHaveBeenCalledTimes(2);
    expect(FakeWebSocket.instances).toHaveLength(2);
    h.client.disconnect();
  });

  it("claims the sdk answer mode before opening the lifecycle stream", async () => {
    const order: string[] = [];
    const api = fakeApi();
    api.setMode.mockImplementation(async (session: string, mode: string) => {
      order.push(`mode:${session}:${mode}`);
    });
    api.socketTicket.mockImplementation(async (session: string) => {
      order.push("ticket");
      return {
        ticket: "t",
        expiresAt: 1,
        url: `wss://api.example/voip/ws?s=${session}`,
      };
    });
    const h = clientWith(api);
    const connecting = h.client.connect();
    await flush();
    h.ws(0).open();
    await connecting;
    // Without the claim, inbound calls would be auto-answered elsewhere and
    // never ring here — so it goes first.
    expect(order).toEqual(["mode:support:sdk", "ticket"]);
    await h.client.disconnect();
  });

  it("opens no socket when the mode claim fails, and can opt out of claiming", async () => {
    const api = fakeApi();
    api.setMode.mockRejectedValue(new Error("403 voip_answer required"));
    const h = clientWith(api);
    await expect(h.client.connect()).rejects.toThrow("voip_answer required");
    expect(FakeWebSocket.instances).toHaveLength(0);
    expect(api.socketTicket).not.toHaveBeenCalled();

    FakeWebSocket.instances = [];
    const quiet = fakeApi();
    const t = timers();
    const client = new CallsClient({
      session: "support",
      api: quiet,
      claimMode: false,
      WebSocket: FakeWebSocket as unknown as typeof globalThis.WebSocket,
      setInterval: t.setInterval,
      clearInterval: t.clearInterval,
      setTimeout: t.setTimeout,
      clearTimeout: t.clearTimeout,
    });
    const connecting = client.connect();
    await flush();
    FakeWebSocket.instances[0]!.open();
    await connecting;
    expect(quiet.setMode).not.toHaveBeenCalled();
    await client.disconnect();
  });

  it("does not open a socket when disconnect() lands while the mode claim is pending", async () => {
    const api = fakeApi();
    let resolveClaim: () => void = () => undefined;
    api.setMode.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveClaim = resolve;
        }),
    );
    const h = clientWith(api);
    const connecting = h.client.connect();
    await flush();
    await h.client.disconnect();
    resolveClaim();
    await connecting;
    await flush();
    expect(FakeWebSocket.instances).toHaveLength(0);
    expect(api.socketTicket).not.toHaveBeenCalled();
    expect(h.client.connected).toBe(false);
  });

  it("keeps a socket opened by a later connect() while an earlier disconnect() awaits hang-ups", async () => {
    const api = fakeApi();
    let releaseHangup: () => void = () => undefined;
    api.hangup.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          releaseHangup = resolve;
        }),
    );
    const h = clientWith(api);
    const connecting = h.client.connect();
    await flush();
    h.ws(0).open();
    await connecting;
    h.ws(0).text({
      type: "event",
      event: { type: "call.received", callId: "C1", from: { lid: "2000@lid" } },
    });
    await flush();
    expect(h.client.calls).toHaveLength(1);

    const disconnecting = h.client.disconnect(); // hang-up is deferred
    await flush();
    expect(h.client.connected).toBe(false);
    const reconnecting = h.client.connect();
    await flush();
    h.ws(1).open();
    await reconnecting;
    releaseHangup();
    await disconnecting;
    await flush();
    // The later connection survives the earlier disconnect settling.
    expect(h.client.connected).toBe(true);
    expect(h.client.calls).toHaveLength(0);
    await h.client.disconnect();
  });

  it("hangs up live calls on disconnect", async () => {
    const h = clientWith();
    const life = await connected(h);
    let call: Call | undefined;
    h.client.on("incoming", (c) => (call = c));
    ring(life);
    const answering = call!.answer();
    await bridge(h);
    await answering;
    await h.client.disconnect();
    expect(h.api.hangup).toHaveBeenCalledWith("CALL-1");
    expect(call!.ended).toBe(true);
    expect(h.client.connected).toBe(false);
  });

  it("tracks participants from the media control channel", async () => {
    const h = clientWith();
    const life = await connected(h);
    let call: Call | undefined;
    h.client.on("incoming", (c) => (call = c));
    ring(life);
    const answering = call!.answer();
    const media = await bridge(h);
    await answering;
    const joined: string[] = [];
    call!.on("participantJoined", (p) => joined.push(p.handle));
    media.text({
      type: "participant_joined",
      participant: {
        id: "p1",
        handle: "+15550101",
        audioMuted: false,
        video: false,
        state: "connected",
      },
    });
    const added = await call!.addParticipant("+15550102");
    expect(h.api.addParticipant).toHaveBeenCalledWith("CALL-1", "+15550102");
    expect(joined).toEqual(["+15550101", "+15550102"]);
    expect(call!.participants.map((p) => p.id)).toEqual(["p1", added.id]);
    media.text({
      type: "participant_left",
      participantId: "p1",
      reason: "hangup",
    });
    expect(call!.participants.map((p) => p.id)).toEqual([added.id]);
  });

  it("refuses to construct without a credential or an api seam", () => {
    expect(() => new CallsClient({ session: "s" })).toThrow(/apiKey/);
  });
});

describe("CallsClient — review round one", () => {
  it("settles answer() when the call ends while media is still connecting", async () => {
    const h = clientWith();
    const life = await connected(h);
    let call: Call | undefined;
    h.client.on("incoming", (c) => (call = c));
    ring(life);
    const answering = call!.answer();
    await flush();
    const media = h.ws(1);
    media.open(); // connecting, no `ready` yet
    // Remote hangs up before media bridges. close() must reject the pending
    // connect, or answer() would hang forever.
    life.text({
      type: "event",
      event: "call.ended",
      callId: "CALL-1",
      payload: { reason: "user_hangup" },
      timestamp: "",
    });
    await expect(answering).rejects.toThrow(/closed before media/);
    expect(call!.state).toBe("ended");
    expect(call!.endReason).toBe("remote_hangup");
  });

  it("ends the call, rather than returning to incoming, when media fails after a successful accept", async () => {
    const api = fakeApi();
    api.mediaTicket.mockRejectedValueOnce(new Error("no ticket"));
    const h = clientWith(api);
    const life = await connected(h);
    let call: Call | undefined;
    h.client.on("incoming", (c) => (call = c));
    ring(life);
    const errors: string[] = [];
    call!.on("error", (e) => errors.push(e.code));
    await expect(call!.answer()).rejects.toThrow("no ticket");
    // The platform already accepted: a second accept or a reject would be wrong.
    expect(api.accept).toHaveBeenCalledTimes(1);
    expect(call!.state).toBe("ended");
    expect(call!.endReason).toBe("connection_failed");
    expect(errors).toEqual(["media_failed"]);
    await expect(call!.reject()).rejects.toThrow(/ended/);
  });

  it("closes the media socket when bridging fails after it opened", async () => {
    const h = clientWith();
    const life = await connected(h);
    let call: Call | undefined;
    h.client.on("incoming", (c) => (call = c));
    ring(life);
    const answering = call!.answer();
    await flush();
    const media = h.ws(1);
    media.open();
    media.text({ type: "error", code: "pod_refused", message: "no" });
    await expect(answering).rejects.toThrow(/pod_refused/);
    expect(media.readyState).toBe(FakeWebSocket.CLOSED);
    // The lifecycle heartbeat is still live; the media socket's — the last one
    // registered — must have been cleared with the socket.
    expect(h.t.intervals.at(-1)?.cleared).toBe(true);
    expect(h.t.intervals.at(0)?.cleared).not.toBe(true);
  });

  it("applies lifecycle events that arrive before place() resolves", async () => {
    const api = fakeApi();
    let resolvePlace: (v: { callId: string }) => void = () => undefined;
    api.place.mockImplementationOnce(
      () => new Promise((r) => (resolvePlace = r)),
    );
    const h = clientWith(api);
    const life = await connected(h);
    const placing = h.client.place("+15550100");
    await flush();
    // The remote answers before our POST returns.
    life.text({
      type: "event",
      event: "call.accepted",
      callId: "CALL-FAST",
      payload: {},
      timestamp: "",
    });
    resolvePlace({ callId: "CALL-FAST" });
    const call = await placing;
    await bridge(h);
    expect(call.state).toBe("connected");
  });

  it("freezes duration when the call ends", async () => {
    let now = 10_000;
    const api = fakeApi();
    FakeWebSocket.instances = [];
    const t = timers();
    const client = new CallsClient({
      session: "support",
      api,
      WebSocket: FakeWebSocket as unknown as typeof globalThis.WebSocket,
      setInterval: t.setInterval,
      clearInterval: t.clearInterval,
      setTimeout: t.setTimeout,
      clearTimeout: t.clearTimeout,
      now: () => now,
    });
    const connecting = client.connect();
    await flush();
    FakeWebSocket.instances[0]!.open();
    await connecting;
    let call: Call | undefined;
    client.on("incoming", (c) => (call = c));
    ring(FakeWebSocket.instances[0]!);
    const answering = call!.answer();
    await flush();
    FakeWebSocket.instances[1]!.open();
    FakeWebSocket.instances[1]!.text({
      type: "ready",
      sampleRate: 16_000,
      video: false,
    });
    await answering;
    now = 25_000;
    expect(call!.duration).toBe(15);
    await call!.hangup();
    now = 99_000;
    expect(call!.duration).toBe(15);
    expect(call!.endedAt).toBe(25_000);
  });

  it("bounds how many ended calls it retains", async () => {
    const h = clientWith();
    const life = await connected(h);
    for (let i = 0; i < 205; i += 1) {
      const id = `CALL-${i}`;
      ring(life, id);
      life.text({
        type: "event",
        event: "call.ended",
        callId: id,
        payload: {},
        timestamp: "",
      });
    }
    // 205 ended; only the most recent 200 are still known, so a duplicate
    // ended for the oldest is simply unknown (and harmless), not a leak.
    expect(h.client.calls).toEqual([]);
    const known = (h.client as unknown as { calls: unknown[] }).calls;
    expect(known).toHaveLength(0);
  });

  it("times out a socket that never opens and reconnects", async () => {
    const api = fakeApi();
    FakeWebSocket.instances = [];
    const t = timers();
    const client = new CallsClient({
      session: "support",
      api,
      WebSocket: FakeWebSocket as unknown as typeof globalThis.WebSocket,
      setInterval: t.setInterval,
      clearInterval: t.clearInterval,
      setTimeout: t.setTimeout,
      clearTimeout: t.clearTimeout,
      random: () => 0.5,
    });
    const errors: string[] = [];
    client.on("error", (e) => errors.push(e.code));
    const connecting = client.connect();
    await flush();
    expect(FakeWebSocket.instances).toHaveLength(1);
    // Never opens. The open timeout is the first queued timeout; firing it
    // must settle connect(), report, and schedule a reconnect.
    t.fireTimeouts();
    await connecting;
    expect(errors).toEqual(["connect_timeout"]);
    // The handler scheduled a reconnect; fireTimeouts snapshots the queue
    // first, so that new timer is still pending here.
    expect(t.timeouts.filter((x) => x.cleared !== true)).toHaveLength(1);
    expect(FakeWebSocket.instances[0]!.readyState).toBe(FakeWebSocket.CLOSED);
    client.disconnect();
  });
});

describe("CallsClient — review round two", () => {
  it("does not open media when accepted and ended are both queued before place() resolves", async () => {
    const api = fakeApi();
    let resolvePlace: (v: { callId: string }) => void = () => undefined;
    api.place.mockImplementationOnce(
      () => new Promise((r) => (resolvePlace = r)),
    );
    const h = clientWith(api);
    const life = await connected(h);
    const placing = h.client.place("+15550100");
    await flush();
    life.text({
      type: "event",
      event: "call.accepted",
      callId: "CALL-Q",
      payload: {},
      timestamp: "",
    });
    life.text({
      type: "event",
      event: "call.ended",
      callId: "CALL-Q",
      payload: { reason: "user_hangup" },
      timestamp: "",
    });
    resolvePlace({ callId: "CALL-Q" });
    const call = await placing;
    await flush(20);
    expect(call.state).toBe("ended");
    // The ticket was fetched by the accepted replay, but no socket may exist
    // for a call that ended before the socket was created.
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(h.t.intervals.filter((i) => !i.cleared)).toHaveLength(1); // lifecycle heartbeat only
  });
});

describe("CallsClient — review round three", () => {
  it("rejects answer() when the call ends while the media ticket is in flight", async () => {
    const api = fakeApi();
    let resolveTicket: (v: {
      token: string;
      expiresAt: number;
      url: string;
    }) => void = () => undefined;
    api.mediaTicket.mockImplementationOnce(
      () => new Promise((r) => (resolveTicket = r)),
    );
    const h = clientWith(api);
    const life = await connected(h);
    let call: Call | undefined;
    h.client.on("incoming", (c) => (call = c));
    ring(life);
    const answering = call!.answer();
    await flush();
    life.text({
      type: "event",
      event: "call.ended",
      callId: "CALL-1",
      payload: { reason: "user_hangup" },
      timestamp: "",
    });
    resolveTicket({
      token: "t",
      expiresAt: 1,
      url: "wss://pod.example/voip/sdk?callId=CALL-1",
    });
    // Resolving here would tell the caller the call connected; it ended.
    await expect(answering).rejects.toThrow(/ended before media/);
    expect(call!.endReason).toBe("remote_hangup"); // not rewritten to connection_failed
    expect(FakeWebSocket.instances).toHaveLength(1); // no media socket was created
  });

  it("clears the open timer on close() so a Node process can exit", async () => {
    const h = clientWith();
    const connecting = h.client.connect();
    await flush();
    // Socket never opens; close() must disarm the attempt's open timer.
    h.client.disconnect();
    await connecting;
    expect(h.t.timeouts.filter((x) => x.cleared !== true)).toHaveLength(0);
  });

  it("does not report ticket_failed for a ticket request that close() aborted", async () => {
    const api = fakeApi();
    api.socketTicket.mockImplementationOnce(
      (_s: string, signal?: AbortSignal) =>
        new Promise((_r, reject) =>
          signal?.addEventListener("abort", () => reject(new Error("aborted"))),
        ),
    );
    const h = clientWith(api);
    const errors: string[] = [];
    h.client.on("error", (e) => errors.push(e.code));
    const connecting = h.client.connect();
    await flush();
    h.client.disconnect();
    await connecting;
    expect(errors).toEqual([]);
  });

  it("bounds media connect() with a ready timeout", async () => {
    const h = clientWith();
    const life = await connected(h);
    let call: Call | undefined;
    h.client.on("incoming", (c) => (call = c));
    ring(life);
    const answering = call!.answer();
    await flush();
    const media = h.ws(1);
    media.open(); // pod answers nothing — no ready, no error, no close
    h.t.fireTimeouts();
    await expect(answering).rejects.toThrow(/did not report media ready/);
    expect(media.readyState).toBe(FakeWebSocket.CLOSED);
    expect(call!.state).toBe("ended"); // media failed after a successful accept
  });
});

describe("CallsClient — review round four", () => {
  it("settles connect() even when a ready listener throws", async () => {
    // At the transport: Call's own ready listener is a promise resolver and
    // cannot throw, so the case that matters is a consumer listening on the
    // socket directly. The exception must surface; the settlement must not
    // depend on it.
    FakeWebSocket.instances = [];
    const t = timers();
    const media = new MediaSocket({
      ticket: {
        token: "t",
        expiresAt: 1,
        url: "wss://pod.example/voip/sdk?callId=X",
      },
      WebSocket: FakeWebSocket as unknown as typeof globalThis.WebSocket,
      setInterval: t.setInterval,
      clearInterval: t.clearInterval,
      setTimeout: t.setTimeout,
      clearTimeout: t.clearTimeout,
    });
    media.on("ready", () => {
      throw new Error("consumer bug");
    });
    const connecting = media.connect();
    const ws = FakeWebSocket.instances[0]!;
    ws.open();
    expect(() =>
      ws.text({ type: "ready", sampleRate: 16_000, video: false }),
    ).toThrow("consumer bug");
    await expect(connecting).resolves.toBeUndefined();
    expect(media.connected).toBe(true);
    media.close();
  });

  it("settles connect() and still reconnects when a state listener throws", async () => {
    const h = clientWith();
    h.client.on("ready", () => {
      throw new Error("ready handler bug");
    });
    const connecting = h.client.connect();
    await flush();
    expect(() => h.ws(0).open()).toThrow("ready handler bug");
    await expect(connecting).resolves.toBeUndefined();
    h.client.on("disconnected", () => {
      throw new Error("disconnected handler bug");
    });
    expect(() => h.ws(0).drop()).toThrow("disconnected handler bug");
    // The drop still scheduled a reconnect.
    expect(
      h.t.timeouts.filter((x) => x.cleared !== true).length,
    ).toBeGreaterThan(0);
    h.client.disconnect();
  });
});
