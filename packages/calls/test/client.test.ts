import { beforeEach, describe, expect, it } from "vitest";
import { CallsClient, encodeAudioFrame, type Call } from "../src/index.js";
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
    // The same id ringing again is a new call. Hold the first object: the
    // earlier listener above reassigns `call` on the next ring.
    const first = call!;
    let again: Call | undefined;
    h.client.on("incoming", (c) => (again = c));
    ring(life);
    expect(again).toBeDefined();
    expect(again).not.toBe(first);
    expect(again!.state).toBe("incoming");
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
