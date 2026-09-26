import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  Call,
  MediaSocket,
  encodeAudioFrame,
  createInternalCallsClient,
  type InternalCallsClientOptions,
  type Participant,
} from "../src/internal.js";
import { FakeWebSocket, fakeApi, flush, timers } from "./helpers.js";

function clientWith(
  api = fakeApi(),
  options: Pick<InternalCallsClientOptions, "mediaMode"> = {},
) {
  FakeWebSocket.instances = [];
  const t = timers();
  const client = createInternalCallsClient({
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
  return { client, api, t, ws: (i = 0) => FakeWebSocket.instances[i]! };
}

async function connected(h: ReturnType<typeof clientWith>) {
  const connecting = h.client.connect();
  await flush();
  h.ws(0).authenticate();
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
    expect(life.url).toBe("wss://api.example/voip/ws");
    // No credential in the URL: the first frame authenticates.
    expect(life.texts[0]).toEqual({ type: "auth", token: "pmfa_ct_test" });

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
    expect(h.api.accept).toHaveBeenCalledWith("CALL-1", {
      exclusive: false,
      video: false,
    });
    expect(call.state).toBe("connecting");
    const media = await bridge(h);
    await answering;
    expect(call.state).toBe("connected");
    expect(media.url).toBe("wss://api.example/voip/calls/CALL-1/media");
    expect(media.protocols).toEqual(["pmfa.calls.v2"]);
    expect(media.texts[0]).toEqual({
      type: "auth",
      token: "pmfa_ct_test",
      connectionId: call.connectionId,
    });
    expect(call.connectionId).toMatch(/^[A-Za-z0-9_-]{8,64}$/);

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
    await call.end();
    expect(h.api.end).toHaveBeenCalledWith("CALL-1");
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
    expect(h.api.reject).toHaveBeenCalledWith("CALL-1", undefined, undefined);
    expect(call!.endReason).toBe("rejected");
    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it("places an ad-hoc group through one request and does not invent roster state", async () => {
    const h = clientWith();
    await connected(h);
    const call = await h.client.place(["+15550100", "+15550101"], {
      video: true,
    });
    expect(h.api.place).toHaveBeenCalledTimes(1);
    expect(h.api.place).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "+15550100",
        participants: ["+15550100", "+15550101"],
        video: true,
      }),
    );
    expect(call.participants).toEqual([]);
    await call.ringParticipant("+15550100");
    expect(h.api.ringParticipant).toHaveBeenCalledWith(call.id, "+15550100");
    expect(call.participants).toEqual([]);
    await call.end();
    await expect(call.ringParticipant("+15550100")).rejects.toThrow(
      "ended call",
    );
    expect(h.api.ringParticipant).toHaveBeenCalledTimes(1);
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
    expect(FakeWebSocket.instances).toHaveLength(1);
    // Call ids are unique per call, so the same id ringing again is a
    // duplicate of the ended call — it must not ring the application twice.
    let again: Call | undefined;
    h.client.on("incoming", (c) => (again = c));
    ring(life);
    expect(again).toBeUndefined();
    expect(h.client.calls).toEqual([]);
  });

  it.each([
    ["call_restricted", "call_restricted"],
    ["a_future_end_reason", "unknown"],
  ])("maps lifecycle end reason %s to %s", async (reason, expected) => {
    const h = clientWith();
    const life = await connected(h);
    let call: Call | undefined;
    h.client.on("incoming", (value) => (call = value));
    ring(life);
    const ended = vi.fn();
    const clientEnded = vi.fn();
    call!.on("ended", ended);
    h.client.on("ended", clientEnded);
    life.text({
      type: "event",
      event: "call.ended",
      callId: "CALL-1",
      payload: { reason },
      timestamp: "",
    });
    expect(call!.endReason).toBe(expected);
    expect(call!.state).toBe("ended");
    expect(ended).toHaveBeenCalledExactlyOnceWith(expected);
    expect(clientEnded).toHaveBeenCalledExactlyOnceWith(call, expected);
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

  it("drops a lifecycle socket that stops answering pings and reconnects", async () => {
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
    expect(FakeWebSocket.instances).toHaveLength(2);
    h.client.disconnect();
  });

  it("does not open a socket when disconnect() lands while the token is pending", async () => {
    const api = fakeApi();
    let resolveToken: (v: { value: string }) => void = () => undefined;
    api.token.mockImplementationOnce(
      () => new Promise((resolve) => (resolveToken = resolve)),
    );
    const h = clientWith(api);
    const connecting = h.client.connect();
    await flush();
    await h.client.disconnect();
    resolveToken({ value: "pmfa_ct_test" });
    await connecting;
    await flush();
    expect(FakeWebSocket.instances).toHaveLength(0);
    expect(h.client.connected).toBe(false);
  });

  it("reports connected only after the platform answers the auth frame", async () => {
    const h = clientWith();
    const connecting = h.client.connect();
    await flush();
    const life = h.ws(0);
    life.open();
    expect(life.texts).toEqual([{ type: "auth", token: "pmfa_ct_test" }]);
    expect(h.client.connected).toBe(false);
    // Nothing but ready is processed before authentication.
    ring(life);
    expect(h.client.calls).toEqual([]);
    life.text({ type: "ready", session: "support" });
    await connecting;
    expect(h.client.connected).toBe(true);
    await h.client.disconnect();
  });

  it("names the session in the query for server credentials only", async () => {
    const client = clientWith();
    await connected(client);
    // Client tokens send no query parameters.
    expect(client.ws(0).url).toBe("wss://api.example/voip/ws");
    await client.client.disconnect();

    const api = fakeApi();
    api.token.mockResolvedValue({ value: "pmfa_live_server" });
    const h = clientWith(api);
    await connected(h);
    expect(h.ws(0).url).toBe("wss://api.example/voip/ws?session=support");
    // The auth frame is exactly { type, token }.
    expect(h.ws(0).texts[0]).toEqual({
      type: "auth",
      token: "pmfa_live_server",
    });
    expect(h.client.participantReference).toBe("server:default");
    await h.client.disconnect();
  });

  it("keeps a socket opened by a later connect() while an earlier disconnect() awaits leaves", async () => {
    const api = fakeApi();
    let releaseLeave: () => void = () => undefined;
    api.leave.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          releaseLeave = resolve;
        }),
    );
    const h = clientWith(api, { mediaMode: "external" });
    const connecting = h.client.connect();
    await flush();
    h.ws(0).authenticate();
    await connecting;
    ring(h.ws(0), "C1");
    await flush();
    await h.client.calls[0]!.answer();
    expect(h.client.calls).toHaveLength(1);

    const disconnecting = h.client.disconnect(); // hang-up is deferred
    await flush();
    expect(h.client.connected).toBe(false);
    const reconnecting = h.client.connect();
    await flush();
    h.ws(1).authenticate();
    await reconnecting;
    releaseLeave();
    await disconnecting;
    await flush();
    // The later connection survives the earlier disconnect settling.
    expect(h.client.connected).toBe(true);
    expect(h.client.calls).toHaveLength(0);
    await h.client.disconnect();
  });

  it("leaves joined calls on disconnect without ending or declining any call", async () => {
    const h = clientWith();
    const life = await connected(h);
    const calls: Call[] = [];
    h.client.on("incoming", (c) => calls.push(c));
    ring(life, "CALL-1");
    ring(life, "CALL-2");
    const answering = calls[0]!.answer();
    const media = await bridge(h);
    await answering;
    await h.client.disconnect();
    // The joined call is left over its media connection; nobody else loses it.
    expect(media.lastText).toEqual({ type: "leave" });
    expect(calls[0]!.endReason).toBe("left");
    // The ringing call is not declined on the application's behalf.
    expect(h.api.reject).not.toHaveBeenCalled();
    expect(h.api.end).not.toHaveBeenCalled();
    expect(h.api.leave).not.toHaveBeenCalled();
    expect(calls[1]!.endReason).toBe("left");
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
    call!.on("participantJoined", (p) => joined.push(p.phoneNumber ?? p.id));
    media.text({
      type: "participant_joined",
      participant: {
        id: "p1",
        phoneNumber: "+15550101",
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

  it("tracks lifecycle roster events only for the matching external-media call", async () => {
    const h = clientWith(fakeApi(), { mediaMode: "external" });
    const life = await connected(h);
    let call: Call | undefined;
    h.client.on("incoming", (c) => (call = c));
    ring(life);

    const joined: string[] = [];
    const states: string[] = [];
    const left: string[] = [];
    call!.on("participantJoined", (p) => joined.push(p.state));
    call!.on("participantState", (p) => states.push(p.state));
    call!.on("participantLeft", (id) => left.push(id));
    const participant = {
      id: "p1",
      phoneNumber: "+15550101",
      audioMuted: false,
      video: false,
      state: "ringing",
    } satisfies Participant;

    life.text({
      type: "event",
      event: "call.participant_joined",
      callId: "CALL-1",
      payload: { callId: "CALL-1", participant },
      timestamp: "",
    });
    life.text({
      type: "event",
      event: "call.participant_state",
      callId: "CALL-1",
      payload: {
        callId: "CALL-1",
        participant: { ...participant, audioMuted: true, state: "connected" },
      },
      timestamp: "",
    });
    // The event envelope and payload must identify the same call.
    life.text({
      type: "event",
      event: "call.participant_state",
      callId: "CALL-1",
      payload: {
        callId: "CALL-OTHER",
        participant: { ...participant, phoneNumber: "wrong-call" },
      },
      timestamp: "",
    });
    expect(call!.participants).toEqual([
      { ...participant, audioMuted: true, state: "connected" },
    ]);
    expect(joined).toEqual(["ringing"]);
    expect(states).toEqual(["connected"]);

    // Lifecycle state is authoritative even when it moves backward during a
    // participant reconnect; only stale HTTP invitation replies are ranked.
    life.text({
      type: "event",
      event: "call.participant_state",
      callId: "CALL-1",
      payload: { callId: "CALL-1", participant },
      timestamp: "",
    });
    expect(call!.participants).toEqual([participant]);
    expect(states).toEqual(["connected", "ringing"]);

    life.text({
      type: "event",
      event: "call.participant_left",
      callId: "CALL-1",
      payload: { callId: "CALL-1", participantId: "p1", reason: "hangup" },
      timestamp: "",
    });
    expect(call!.participants).toEqual([]);
    expect(left).toEqual(["p1"]);

    // Duplicate departures do not notify the application twice.
    life.text({
      type: "event",
      event: "call.participant_left",
      callId: "CALL-1",
      payload: { callId: "CALL-1", participantId: "p1" },
      timestamp: "",
    });
    expect(call!.participants).toEqual([]);
    expect(joined).toEqual(["ringing"]);
    expect(left).toEqual(["p1"]);
  });

  it("applies lifecycle roster events to socket-media calls and ignores ended calls", async () => {
    const h = clientWith();
    const life = await connected(h);
    let call: Call | undefined;
    h.client.on("incoming", (c) => (call = c));
    ring(life);
    const event = {
      type: "event",
      event: "call.participant_joined",
      callId: "CALL-1",
      payload: {
        callId: "CALL-1",
        participant: {
          id: "p1",
          phoneNumber: "+15550101",
          audioMuted: false,
          video: false,
          state: "connected",
        },
      },
      timestamp: "",
    };
    life.text(event);
    expect(call!.participants.map((p) => p.id)).toEqual(["p1"]);

    const external = clientWith(fakeApi(), { mediaMode: "external" });
    const externalLife = await connected(external);
    let endedCall: Call | undefined;
    external.client.on("incoming", (c) => (endedCall = c));
    ring(externalLife);
    externalLife.text({
      type: "event",
      event: "call.ended",
      callId: "CALL-1",
      payload: { reason: "hangup" },
      timestamp: "",
    });
    externalLife.text(event);
    expect(endedCall!.participants).toEqual([]);
  });

  it("keeps newer lifecycle roster state when an invite reply arrives late", async () => {
    const api = fakeApi();
    let resolveInvite: (participant: Participant) => void = () => undefined;
    api.addParticipant.mockImplementationOnce(
      () =>
        new Promise<Participant>((resolve) => {
          resolveInvite = resolve;
        }),
    );
    const h = clientWith(api, { mediaMode: "external" });
    const life = await connected(h);
    let call: Call | undefined;
    h.client.on("incoming", (c) => (call = c));
    ring(life);
    const joined: string[] = [];
    call!.on("participantJoined", (p) => joined.push(p.state));

    const adding = call!.addParticipant("+15550102");
    await flush();
    life.text({
      type: "event",
      event: "call.participant_joined",
      callId: "CALL-1",
      payload: {
        callId: "CALL-1",
        participant: {
          id: "p-late",
          phoneNumber: "+15550102",
          audioMuted: false,
          video: false,
          state: "connected",
        },
      },
      timestamp: "",
    });
    resolveInvite({
      id: "p-late",
      phoneNumber: "+15550102",
      audioMuted: false,
      video: false,
      state: "invited",
    });
    await adding;
    expect(call!.participants.map((p) => p.state)).toEqual(["connected"]);
    expect(joined).toEqual(["connected"]);

    life.text({
      type: "event",
      event: "call.participant_left",
      callId: "CALL-1",
      payload: { callId: "CALL-1", participantId: "p-late" },
      timestamp: "",
    });
    expect(call!.participants).toEqual([]);

    let resolveDepartedInvite: (participant: Participant) => void = () =>
      undefined;
    api.addParticipant.mockImplementationOnce(
      () =>
        new Promise<Participant>((resolve) => {
          resolveDepartedInvite = resolve;
        }),
    );
    const departedAdding = call!.addParticipant("+15550103");
    await flush();
    const departed = {
      id: "p-departed",
      phoneNumber: "+15550103",
      audioMuted: false,
      video: false,
      state: "connected",
    } satisfies Participant;
    life.text({
      type: "event",
      event: "call.participant_joined",
      callId: "CALL-1",
      payload: { callId: "CALL-1", participant: departed },
      timestamp: "",
    });
    life.text({
      type: "event",
      event: "call.participant_left",
      callId: "CALL-1",
      payload: { callId: "CALL-1", participantId: departed.id },
      timestamp: "",
    });
    resolveDepartedInvite({ ...departed, state: "invited" });
    await departedAdding;
    expect(call!.participants).toEqual([]);

    api.addParticipant.mockResolvedValueOnce({ ...departed, state: "left" });
    await call!.addParticipant("+15550103");
    expect(call!.participants).toEqual([]);

    // A later explicit reinvite is newer than the departure and may restore it.
    api.addParticipant.mockResolvedValueOnce({ ...departed, state: "invited" });
    await call!.addParticipant("+15550103");
    expect(call!.participants).toEqual([{ ...departed, state: "invited" }]);
  });

  it("does not apply an invite reply after the call ends", async () => {
    const api = fakeApi();
    let resolveInvite: (participant: Participant) => void = () => undefined;
    api.addParticipant.mockImplementationOnce(
      () =>
        new Promise<Participant>((resolve) => {
          resolveInvite = resolve;
        }),
    );
    const h = clientWith(api, { mediaMode: "external" });
    const life = await connected(h);
    let call: Call | undefined;
    h.client.on("incoming", (c) => (call = c));
    ring(life);
    const adding = call!.addParticipant("+15550104");
    await flush();
    life.text({
      type: "event",
      event: "call.ended",
      callId: "CALL-1",
      payload: { reason: "hangup" },
      timestamp: "",
    });
    resolveInvite({
      id: "p-ended",
      phoneNumber: "+15550104",
      audioMuted: false,
      video: false,
      state: "invited",
    });
    await adding;
    expect(call!.ended).toBe(true);
    expect(call!.participants).toEqual([]);
  });

  it("ignores concurrent duplicate invite replies after newer lifecycle state", async () => {
    const api = fakeApi();
    const resolveInvites: ((participant: Participant) => void)[] = [];
    api.addParticipant.mockImplementation(
      () =>
        new Promise<Participant>((resolve) => {
          resolveInvites.push(resolve);
        }),
    );
    const h = clientWith(api, { mediaMode: "external" });
    const life = await connected(h);
    let call: Call | undefined;
    h.client.on("incoming", (c) => (call = c));
    ring(life);

    const first = call!.addParticipant("+15550105");
    const duplicate = call!.addParticipant("+15550105");
    await flush();
    const connectedParticipant = {
      id: "p-concurrent",
      phoneNumber: "+15550105",
      audioMuted: false,
      video: false,
      state: "connected",
    } satisfies Participant;
    life.text({
      type: "event",
      event: "call.participant_state",
      callId: "CALL-1",
      payload: { callId: "CALL-1", participant: connectedParticipant },
      timestamp: "",
    });
    for (const resolve of resolveInvites)
      resolve({ ...connectedParticipant, state: "invited" });
    await Promise.all([first, duplicate]);
    expect(call!.participants).toEqual([connectedParticipant]);
  });

  it("refuses to construct without a credential or an api seam", () => {
    expect(() => createInternalCallsClient({ session: "s" })).toThrow(/token/);
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
    const h = clientWith(api);
    const life = await connected(h);
    let call: Call | undefined;
    h.client.on("incoming", (c) => (call = c));
    ring(life);
    const errors: string[] = [];
    call!.on("error", (e) => errors.push(e.code));
    api.token.mockRejectedValueOnce(new Error("no token"));
    await expect(call!.answer()).rejects.toThrow("no token");
    // The platform already accepted: a second accept or a reject would be wrong.
    expect(api.accept).toHaveBeenCalledTimes(1);
    expect(call!.state).toBe("ended");
    expect(call!.endReason).toBe("connection_failed");
    expect(errors).toEqual(["token_failed"]);
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
    media.drop(1008, "unauthorized");
    await expect(answering).rejects.toThrow("no");
    expect(media.readyState).toBe(FakeWebSocket.CLOSED);
    // The media heartbeat starts only after `ready`; the lifecycle one stays live.
    expect(h.t.intervals).toHaveLength(1);
    expect(h.t.intervals[0]?.cleared).not.toBe(true);
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
    const client = createInternalCallsClient({
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
    FakeWebSocket.instances[0]!.authenticate();
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
    await call!.end();
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
    const client = createInternalCallsClient({
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
    // The token was fetched by the accepted replay, but no socket may exist
    // for a call that ended before the socket was created.
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(h.t.intervals.filter((i) => !i.cleared)).toHaveLength(1); // lifecycle heartbeat only
  });
});

describe("CallsClient — review round three", () => {
  it("rejects answer() when the call ends while the media token is in flight", async () => {
    const api = fakeApi();
    let resolveToken: (v: { value: string }) => void = () => undefined;
    const h = clientWith(api);
    const life = await connected(h);
    api.token.mockImplementationOnce(
      () => new Promise((r) => (resolveToken = r)),
    );
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
    resolveToken({ value: "pmfa_ct_test" });
    // Resolving here would tell the caller the call connected; it ended.
    await expect(answering).rejects.toThrow(/closed before media/);
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

  it("does not report token_failed for a token request that close() aborted", async () => {
    const api = fakeApi();
    api.token.mockImplementationOnce(async () => ({ value: "pmfa_ct_test" }));
    api.token.mockImplementationOnce(
      (request?: { signal?: AbortSignal }) =>
        new Promise((_r, reject) =>
          request?.signal?.addEventListener("abort", () =>
            reject(new Error("aborted")),
          ),
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
      api: fakeApi(),
      callId: "X",
      connectionId: "conn-0001",
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
    await flush();
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
    h.ws(0).open();
    expect(() => h.ws(0).text({ type: "ready" })).toThrow("ready handler bug");
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

describe("pending placement roster pressure", () => {
  it.each([
    [
      "a duplicate departure omits it",
      "call.participant_left",
      { callId: "CALL-FAST", participantId: "p-1" },
    ],
    [
      "a state-left frame follows it",
      "call.participant_state",
      {
        callId: "CALL-FAST",
        participant: {
          id: "p-1",
          phoneNumber: "+15550101",
          state: "left",
          audioMuted: false,
          video: false,
        },
      },
    ],
    [
      "a joined-left frame follows it",
      "call.participant_joined",
      {
        callId: "CALL-FAST",
        participant: {
          id: "p-1",
          phoneNumber: "+15550101",
          state: "left",
          audioMuted: false,
          video: false,
        },
      },
    ],
  ] as const)(
    "retains the first departure reason when %s",
    async (_, event, payload) => {
      const applied: Parameters<Call["_remoteParticipant"]>[0][] = [];
      const original = Call.prototype._remoteParticipant;
      const participant = vi
        .spyOn(Call.prototype, "_remoteParticipant")
        .mockImplementation(function (this: Call, frame) {
          applied.push(frame);
          original.call(this, frame);
        });
      const api = fakeApi();
      let resolvePlace!: (value: { callId: string }) => void;
      api.place.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolvePlace = resolve;
          }),
      );
      const h = clientWith(api, { mediaMode: "external" });
      const life = await connected(h);
      const placing = h.client.place("+15550100");
      await flush();

      life.text({
        type: "event",
        event: "call.participant_left",
        callId: "CALL-FAST",
        timestamp: "",
        payload: {
          callId: "CALL-FAST",
          participantId: "p-1",
          reason: "hangup",
        },
      });
      life.text({
        type: "event",
        event,
        callId: "CALL-FAST",
        timestamp: "",
        payload,
      });

      resolvePlace({ callId: "CALL-FAST" });
      await placing;
      expect(applied).toEqual([
        { type: "participant_left", participantId: "p-1", reason: "hangup" },
      ]);
      participant.mockRestore();
    },
  );

  it("evicts the oldest roster entry when a ninth participant arrives", async () => {
    const api = fakeApi();
    let resolvePlace!: (value: { callId: string }) => void;
    api.place.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolvePlace = resolve;
        }),
    );
    const h = clientWith(api, { mediaMode: "external" });
    const life = await connected(h);
    const placing = h.client.place("+15550100");
    await flush();

    for (let i = 0; i < 9; i++) {
      life.text({
        type: "event",
        event: "call.participant_joined",
        callId: "CALL-FAST",
        timestamp: "",
        payload: {
          callId: "CALL-FAST",
          participant: {
            id: `p-${i}`,
            phoneNumber: `+1555010${i}`,
            state: "connected",
            audioMuted: false,
            video: false,
          },
        },
      });
    }

    resolvePlace({ callId: "CALL-FAST" });
    const call = await placing;
    expect(call.participants.map((participant) => participant.id)).toEqual([
      "p-1",
      "p-2",
      "p-3",
      "p-4",
      "p-5",
      "p-6",
      "p-7",
      "p-8",
    ]);
  });

  it.each(["call.ended", "call.missed", "call.rejected", "call.accepted"])(
    "preserves %s after roster bursts",
    async (event) => {
      const api = fakeApi();
      let resolvePlace!: (value: { callId: string }) => void;
      api.place.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolvePlace = resolve;
          }),
      );
      const h = clientWith(api, { mediaMode: "external" });
      const life = await connected(h);
      const placing = h.client.place("+15550100");
      await flush();
      const roster = (i: number) =>
        life.text({
          type: "event",
          event: "call.participant_joined",
          callId: "CALL-FAST",
          timestamp: "",
          payload: {
            callId: "CALL-FAST",
            participant: {
              id: `p-${i}`,
              phoneNumber: "+15550101",
              state: "connected",
              audioMuted: false,
              video: false,
            },
          },
        });
      for (let i = 0; i < 12; i++) roster(i);
      life.text({
        type: "event",
        event,
        callId: "CALL-FAST",
        payload: { reason: "remote_hangup" },
        timestamp: "",
      });
      for (let i = 12; i < 24; i++) roster(i);
      resolvePlace({ callId: "CALL-FAST" });
      const call = await placing;
      if (event === "call.accepted") expect(call.state).toBe("connecting");
      else expect(call.ended).toBe(true);
    },
  );
});

describe("participant departure metadata", () => {
  it.each([null, 42, {}])(
    "retains departure when optional reason is %j",
    async (reason) => {
      const h = clientWith(fakeApi(), { mediaMode: "external" });
      const life = await connected(h);
      let call!: Call;
      h.client.on("incoming", (value) => {
        call = value;
      });
      ring(life);
      life.text({
        type: "event",
        event: "call.participant_joined",
        callId: "CALL-1",
        timestamp: "",
        payload: {
          callId: "CALL-1",
          participant: {
            id: "p1",
            phoneNumber: "+15550101",
            audioMuted: false,
            video: false,
            state: "connected",
          },
        },
      });
      let departed: string | undefined;
      call.on("participantLeft", (id) => {
        departed = id;
      });
      life.text({
        type: "event",
        event: "call.participant_left",
        callId: "CALL-1",
        timestamp: "",
        payload: { callId: "CALL-1", participantId: "p1", reason },
      });
      expect(call.participants).toEqual([]);
      expect(departed).toBe("p1");
    },
  );
});

describe("CallsClient — concurrent answers", () => {
  it("resolves a second answer() only once media is connected", async () => {
    const h = clientWith();
    const life = await connected(h);
    let call: Call | undefined;
    h.client.on("incoming", (c) => (call = c));
    ring(life);
    const first = call!.answer();
    const second = call!.join();
    let settled = false;
    void second.then(() => (settled = true));
    await flush();
    // The platform accepted the call, but media is not attached yet.
    expect(h.api.accept).toHaveBeenCalledTimes(1);
    expect(settled).toBe(false);
    await bridge(h);
    await expect(first).resolves.toBeUndefined();
    await expect(second).resolves.toBeUndefined();
    expect(call!.state).toBe("connected");
  });

  it("rejects a second answer() when media fails after acceptance", async () => {
    const h = clientWith();
    const life = await connected(h);
    let call: Call | undefined;
    h.client.on("incoming", (c) => (call = c));
    ring(life);
    const first = call!.answer();
    const second = call!.answer();
    await flush();
    h.ws(1).open(); // no ready frame: the media attempt times out
    h.t.fireTimeouts();
    await expect(first).rejects.toThrow(/did not report media ready/);
    await expect(second).rejects.toThrow(/did not report media ready/);
    expect(call!.state).toBe("ended");
  });
});

describe("CallsClient — releasing a call whose media failed", () => {
  async function answered(
    exclusive: boolean,
    fail: (h: ReturnType<typeof clientWith>) => void,
  ) {
    const h = clientWith();
    const life = await connected(h);
    let call: Call | undefined;
    h.client.on("incoming", (c) => (call = c));
    ring(life);
    const seen: string[] = [];
    const record = (kind: string) => async () => {
      seen.push(`${kind}:${call!.state}`);
    };
    h.api.leave.mockImplementation(record("leave"));
    h.api.end.mockImplementation(record("end"));
    h.api.accept.mockImplementationOnce(async () => ({
      answered: true,
      answeredBy: "client:self",
      exclusive,
    }));
    const errors: string[] = [];
    call!.on("error", (e) => errors.push(e.code));
    fail(h);
    const answering = call!.answer({ exclusive });
    return { h, call: call!, answering, seen, errors };
  }

  const tokenFailure = (h: ReturnType<typeof clientWith>) =>
    h.api.token.mockRejectedValue(new Error("token service down"));

  it.each([
    [true, "end"],
    [false, "leave"],
  ] as const)(
    "releases (exclusive: %s → %s) before ending locally when the media token fails",
    async (exclusive, kind) => {
      const r = await answered(exclusive, tokenFailure);
      await expect(r.answering).rejects.toThrow();
      // Released while the call was still live here.
      expect(r.seen).toEqual([`${kind}:connecting`]);
      if (kind === "leave")
        expect(r.h.api.leave).toHaveBeenCalledWith(
          "CALL-1",
          r.call.connectionId,
          expect.any(AbortSignal),
          undefined,
        );
      else
        expect(r.h.api.end).toHaveBeenCalledWith(
          "CALL-1",
          expect.any(AbortSignal),
        );
      expect(r.call.state).toBe("ended");
      expect(r.call.endReason).toBe("connection_failed");
    },
  );

  it.each([
    [true, "end"],
    [false, "leave"],
  ] as const)(
    "releases (exclusive: %s → %s) when the media-ready timeout expires",
    async (exclusive, kind) => {
      const r = await answered(exclusive, () => undefined);
      await flush();
      r.h.ws(1).open(); // no ready frame
      r.h.t.fireTimeouts();
      await expect(r.answering).rejects.toThrow(/did not report media ready/);
      expect(r.seen).toEqual([`${kind}:connecting`]);
      expect(r.call.endReason).toBe("connection_failed");
    },
  );

  it("reports the media error when the release fails, and bounds a release that hangs", async () => {
    const failing = await answered(false, tokenFailure);
    failing.h.api.leave.mockRejectedValue(new Error("release refused"));
    await expect(failing.answering).rejects.not.toThrow("release refused");
    expect(failing.call.endReason).toBe("connection_failed");

    const hanging = await answered(true, tokenFailure);
    hanging.h.api.end.mockImplementation(() => new Promise(() => {}));
    let settled = false;
    void hanging.answering.catch(() => (settled = true));
    await flush(20);
    expect(settled).toBe(false);
    expect(hanging.call.state).toBe("connecting");
    // The release timeout fires; the call ends locally anyway.
    hanging.h.t.fireTimeouts();
    await flush(20);
    expect(settled).toBe(true);
    expect(hanging.call.endReason).toBe("connection_failed");
  });

  it("ends a call placed exclusively when its media fails after the callee answers", async () => {
    const h = clientWith();
    const life = await connected(h);
    const call = await h.client.place("+15550100", { exclusive: true });
    h.api.token.mockRejectedValue(new Error("token service down"));
    life.text({
      type: "event",
      event: "call.accepted",
      callId: call.id,
      payload: {},
      timestamp: "",
    });
    await flush(20);
    expect(h.api.end).toHaveBeenCalledWith(call.id, expect.any(AbortSignal));
    expect(h.api.leave).not.toHaveBeenCalled();
    expect(call.endReason).toBe("connection_failed");
  });

  it("leaves before ending when media reattachment is exhausted", async () => {
    const h = clientWith();
    const life = await connected(h);
    let call: Call | undefined;
    h.client.on("incoming", (c) => (call = c));
    ring(life);
    const answering = call!.answer();
    const media = await bridge(h);
    await answering;
    const states: string[] = [];
    h.api.leave.mockImplementation(async () => {
      states.push(call!.state);
    });
    h.api.token.mockRejectedValue(new Error("token service down"));
    media.drop(1006);
    for (let i = 0; i < 6; i += 1) {
      h.t.fireTimeouts();
      await flush(20);
    }
    expect(states).toEqual(["reconnecting"]);
    expect(call!.endReason).toBe("connection_failed");
  });
});

describe("CallsClient — terminal events that arrive before call.received", () => {
  it.each([
    ["call.ended", "remote_hangup"],
    ["call.missed", "missed"],
    ["call.rejected", "rejected"],
  ] as const)(
    "does not ring for a call whose %s was buffered first",
    async (event, reason) => {
      const h = clientWith();
      const life = await connected(h);
      const incoming: Call[] = [];
      const ended: [Call, string][] = [];
      h.client.on("incoming", (call) => incoming.push(call));
      h.client.on("ended", (call, why) => ended.push([call, why]));
      life.text({
        type: "event",
        event,
        callId: "CALL-1",
        payload: { reason: "user_hangup" },
        timestamp: "",
      });
      ring(life);
      expect(incoming).toEqual([]);
      const call = h.client.getCall("CALL-1");
      expect(call?.ended).toBe(true);
      expect(call?.endReason).toBe(reason);
      expect(ended.map(([c, why]) => [c.id, why])).toEqual([
        ["CALL-1", reason],
      ]);
      expect(h.client.calls).not.toContain(call);
      // A duplicate call.received for the retained ended id is still ignored.
      ring(life);
      expect(incoming).toEqual([]);
    },
  );
});

describe("CallsClient — capabilities reported on call.accepted", () => {
  function accepted(
    life: FakeWebSocket,
    callId: string,
    payload: Record<string, unknown>,
  ) {
    life.text({
      type: "event",
      event: "call.accepted",
      callId,
      payload,
      timestamp: "",
    });
  }

  it("updates an outbound call's capabilities from the answer", async () => {
    const h = clientWith(undefined, { mediaMode: "external" });
    const life = await connected(h);
    const call = await h.client.place("+15550100", { video: true });
    expect(call.capabilities).toEqual({ video: true, invite: true });
    expect(call.hasVideo).toBe(true);
    const reported: unknown[] = [];
    call.on("capabilities", (c) => reported.push(c));
    accepted(life, call.id, { capabilities: { video: false, invite: false } });
    await flush();
    expect(call.capabilities).toEqual({ video: false, invite: false });
    expect(call.hasVideo).toBe(false);
    expect(reported).toEqual([{ video: false, invite: false }]);
    expect(call.state).toBe("connecting");
  });

  it.each([
    ["absent", {}, { video: true, invite: true }],
    ["malformed", { capabilities: "none" }, { video: true, invite: true }],
    [
      "partial",
      { capabilities: { invite: false, video: "no" } },
      { video: true, invite: false },
    ],
  ] as const)(
    "keeps current values for %s reports",
    async (_label, payload, expected) => {
      const h = clientWith(undefined, { mediaMode: "external" });
      const life = await connected(h);
      const call = await h.client.place("+15550100");
      accepted(life, call.id, payload);
      await flush();
      expect(call.capabilities).toEqual(expected);
    },
  );

  it("applies capabilities from an answer that arrived before placement returned", async () => {
    const api = fakeApi();
    let resolvePlace!: (value: { callId: string }) => void;
    api.place.mockImplementationOnce(
      () => new Promise((resolve) => (resolvePlace = resolve)),
    );
    const h = clientWith(api, { mediaMode: "external" });
    const life = await connected(h);
    const placing = h.client.place("+15550100");
    await flush();
    accepted(life, "CALL-FAST", {
      capabilities: { video: false, invite: false },
    });
    resolvePlace({ callId: "CALL-FAST" });
    const call = await placing;
    expect(call.capabilities).toEqual({ video: false, invite: false });
  });

  it("updates an inbound call's capabilities when it is answered elsewhere", async () => {
    const h = clientWith();
    const life = await connected(h);
    let call: Call | undefined;
    h.client.on("incoming", (c) => (call = c));
    ring(life);
    accepted(life, "CALL-1", {
      answeredBy: "client:other",
      capabilities: { video: true, invite: false },
    });
    await flush();
    expect(call!.capabilities).toEqual({ video: true, invite: false });
    expect(call!.canJoin).toBe(true);
  });
});

describe("Call.leave()", () => {
  it("ends a placed call that is still ringing instead of leaving it", async () => {
    const h = clientWith(undefined, { mediaMode: "external" });
    await connected(h);
    const call = await h.client.place("+15550100");
    expect(call.state).toBe("ringing");
    await call.leave();
    expect(h.api.end).toHaveBeenCalledWith(call.id);
    expect(h.api.leave).not.toHaveBeenCalled();
    expect(call.endReason).toBe("hangup");
  });

  it("keeps the call live and retryable when the leave request fails", async () => {
    const h = clientWith(undefined, { mediaMode: "external" });
    const life = await connected(h);
    let call: Call | undefined;
    h.client.on("incoming", (c) => (call = c));
    ring(life);
    await call!.answer();
    h.api.leave.mockRejectedValueOnce(new Error("network down"));
    await expect(call!.leave()).rejects.toThrow("network down");
    expect(call!.ended).toBe(false);
    expect(h.client.calls).toContain(call);
    await call!.leave();
    expect(h.api.leave).toHaveBeenCalledTimes(2);
    expect(call!.endReason).toBe("left");
  });
});

describe("CallsClient — answering a settled call", () => {
  it("rejects answer() and join() once the call is connected or ended", async () => {
    const h = clientWith();
    const life = await connected(h);
    let call: Call | undefined;
    h.client.on("incoming", (c) => (call = c));
    ring(life);
    const answering = call!.answer();
    await bridge(h);
    await answering;
    expect(call!.state).toBe("connected");
    await expect(call!.answer()).rejects.toMatchObject({
      code: "invalid_state",
    });
    await expect(call!.join()).rejects.toMatchObject({ code: "invalid_state" });
    await call!.end();
    await expect(call!.answer()).rejects.toMatchObject({
      code: "invalid_state",
    });
    expect(h.api.accept).toHaveBeenCalledTimes(1);
  });
});

describe("CallsClient — disconnecting during an answer", () => {
  it.each([false, true])(
    "leaves a call whose answer (exclusive: %s) succeeds after disconnect()",
    async (exclusive) => {
      const api = fakeApi();
      let finish!: () => void;
      api.accept.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = () =>
              resolve({ answered: true, answeredBy: "client:self", exclusive });
          }),
      );
      const h = clientWith(api, { mediaMode: "external" });
      const life = await connected(h);
      let call: Call | undefined;
      h.client.on("incoming", (c) => (call = c));
      ring(life);
      const answering = call!.answer({ exclusive }).catch(() => undefined);
      await flush();
      const disconnecting = h.client.disconnect();
      await flush();
      // Nothing is sent before the accept settles.
      expect(api.leave).not.toHaveBeenCalled();
      finish();
      await disconnecting;
      await answering;
      expect(api.leave).toHaveBeenCalledWith(
        "CALL-1",
        call!.connectionId,
        undefined,
        undefined,
      );
      expect(call!.endReason).toBe("left");
    },
  );

  it("only stops tracking when the in-flight answer is refused", async () => {
    const api = fakeApi();
    let refuse!: (cause: Error) => void;
    api.accept.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          refuse = reject;
        }),
    );
    const h = clientWith(api, { mediaMode: "external" });
    const life = await connected(h);
    let call: Call | undefined;
    h.client.on("incoming", (c) => (call = c));
    ring(life);
    const answering = call!.answer().catch(() => undefined);
    await flush();
    const disconnecting = h.client.disconnect();
    refuse(new Error("offline"));
    await disconnecting;
    await answering;
    expect(api.leave).not.toHaveBeenCalled();
    expect(call!.ended).toBe(true);
  });
});

describe("CallsClient — claim state of a placed call", () => {
  it.each([
    [false, {}, { answered: true, exclusive: false }],
    [true, {}, { answered: true, exclusive: true }],
    [
      false,
      { answeredBy: "15550100", exclusive: true },
      { answered: true, answeredBy: "15550100", exclusive: true },
    ],
  ] as const)(
    "records the answer (placed exclusive: %s, event %j)",
    async (exclusive, payload, expected) => {
      const h = clientWith(undefined, { mediaMode: "external" });
      const life = await connected(h);
      const call = await h.client.place("+15550100", { exclusive });
      expect(call.claim.answered).toBe(false);
      const claims: unknown[] = [];
      call.on("claim", (claim) => claims.push(claim));
      life.text({
        type: "event",
        event: "call.accepted",
        callId: call.id,
        payload,
        timestamp: "",
      });
      await flush();
      expect(call.claim).toMatchObject(expected);
      expect(claims).toHaveLength(1);
      expect(call.state).toBe("connecting");
    },
  );
});
