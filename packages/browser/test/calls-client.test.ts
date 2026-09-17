import { afterEach, describe, expect, it, vi } from "vitest";
import { CallClaimedError, CallsDisabledError } from "@polymorfa/calls";
import { createInternalBrowserCalls as createBrowserCalls } from "../src/calls/client.js";
import { BrowserCallsApi } from "../src/calls/api.js";
import { BrowserTransport } from "../src/transport.js";
import type {
  CallMediaCallbacks,
  CallMediaSession,
} from "../src/calls/media.js";
import { FakeWebSocket, flush } from "../../calls/test/helpers.js";

const owned: ReturnType<typeof createBrowserCalls>[] = [];
afterEach(async () => {
  await Promise.all(owned.splice(0).map((calls) => calls.dispose()));
  FakeWebSocket.instances = [];
});

function fixture() {
  let callbacks: CallMediaCallbacks | undefined;
  const session: CallMediaSession = {
    localStream: {} as MediaStream,
    remoteStream: {} as MediaStream,
    setMuted: vi.fn(),
    audioEnabled: () => true,
    videoEnabled: () => false,
    close: vi.fn(async () => undefined),
    restartIce: vi.fn(async () => undefined),
  };
  const media = {
    open: vi.fn(async (_id, _video, c: CallMediaCallbacks) => {
      callbacks = c;
      return session;
    }),
  };
  const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
    const path = new URL(String(input)).pathname;
    const body =
      typeof init?.body === "string"
        ? (JSON.parse(init.body) as Record<string, unknown>)
        : {};
    const data = path.endsWith("/accept")
      ? {
          answered: true,
          answeredBy: "client:self",
          exclusive: body["exclusive"] === true,
        }
      : path === "/messaging/voip/calls"
        ? { callId: "CALL-OUT" }
        : {};
    return new Response(JSON.stringify({ data }), {
      headers: { "content-type": "application/json" },
    });
  });
  const calls = createBrowserCalls({
    session: "support",
    getClientToken: async () => "pmfa_ct_test",
    baseUrl: "https://api.polymorfa.test",
    fetch,
    maxNetworkRetries: 0,
    WebSocket: FakeWebSocket as unknown as typeof WebSocket,
    mediaFactory: media,
  });
  owned.push(calls);
  return {
    calls,
    fetch,
    media,
    session,
    callbacks: () => callbacks!,
    async connect() {
      const pending = calls.connect();
      await vi.waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));
      const socket = FakeWebSocket.instances[0]!;
      socket.authenticate();
      await pending;
      return socket;
    },
  };
}

function event(
  socket: FakeWebSocket,
  name: string,
  callId: string,
  payload: Record<string, unknown> = {},
) {
  socket.text({
    type: "event",
    event: name,
    callId,
    payload: { callId, ...payload },
    timestamp: new Date().toISOString(),
  });
}

describe("browser widget and shared calls client", () => {
  it("adopts a call that ended before placement returned without opening media", async () => {
    const f = fixture();
    const socket = await f.connect();
    let finish!: (response: Response) => void;
    f.fetch.mockImplementationOnce(
      async () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const placing = f.calls.controller.place("+15550100");
    await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
    event(socket, "call.ended", "CALL-OUT", { reason: "remote_hangup" });
    finish(
      new Response(JSON.stringify({ data: { callId: "CALL-OUT" } }), {
        headers: { "content-type": "application/json" },
      }),
    );
    await placing;
    expect(f.calls.controller.getSnapshot()).toMatchObject({
      callId: "CALL-OUT",
      status: "ended",
      endReason: "remote_hangup",
    });
    expect(f.calls.controller.call?.ended).toBe(true);
    expect(f.media.open).not.toHaveBeenCalled();
  });
  it("keeps participants reported before placement returned", async () => {
    const f = fixture();
    const socket = await f.connect();
    let finish!: (response: Response) => void;
    f.fetch.mockImplementationOnce(
      async () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const placing = f.calls.controller.place("+15550100");
    await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
    const participant = {
      id: "15550100",
      phoneNumber: "+15550100",
      audioMuted: false,
      video: false,
      state: "ringing",
    };
    event(socket, "call.participant_joined", "CALL-OUT", { participant });
    finish(
      new Response(JSON.stringify({ data: { callId: "CALL-OUT" } }), {
        headers: { "content-type": "application/json" },
      }),
    );
    await placing;
    expect(f.calls.controller.call?.participants).toEqual([participant]);
    expect(f.calls.controller.getSnapshot()).toMatchObject({
      callId: "CALL-OUT",
      participants: [participant],
    });
    // Later roster events still apply.
    event(socket, "call.participant_state", "CALL-OUT", {
      participant: { ...participant, state: "connected" },
    });
    expect(f.calls.controller.getSnapshot().participants).toEqual([
      { ...participant, state: "connected" },
    ]);
  });

  it("starts a placed call as answered when the callee picked up before placement returned", async () => {
    const f = fixture();
    const socket = await f.connect();
    let finish!: (response: Response) => void;
    f.fetch.mockImplementationOnce(
      async () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const statuses: string[] = [];
    f.calls.controller.subscribe(() => {
      const s = f.calls.controller.getSnapshot();
      if (s.callId === "CALL-OUT") statuses.push(s.status);
    });
    const placing = f.calls.controller.place("+15550100");
    await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
    event(socket, "call.accepted", "CALL-OUT");
    finish(
      new Response(JSON.stringify({ data: { callId: "CALL-OUT" } }), {
        headers: { "content-type": "application/json" },
      }),
    );
    await placing;
    expect(f.calls.controller.call?.state).toBe("connecting");
    expect(f.calls.controller.getSnapshot().status).toBe("connecting");
    expect(statuses).not.toContain("ringing");
    f.callbacks().onConnectionState("connected");
    await flush();
    expect(f.calls.controller.getSnapshot().status).toBe("connected");
  });

  it("reports a placed call as ringing until the callee answers", async () => {
    const f = fixture();
    const socket = await f.connect();
    await f.calls.controller.place("+15550100");
    // Media is open, but nobody has answered.
    expect(f.media.open).toHaveBeenCalled();
    expect(f.calls.controller.getSnapshot().status).toBe("ringing");
    // An ICE blip while ringing resumes to ringing.
    f.callbacks().onIceConnectionState?.("disconnected");
    expect(f.calls.controller.getSnapshot().status).toBe("reconnecting");
    f.callbacks().onIceConnectionState?.("connected");
    expect(f.calls.controller.getSnapshot().status).toBe("ringing");
    f.callbacks().onConnectionState("connected");
    event(socket, "call.accepted", "CALL-OUT");
    await flush();
    expect(f.calls.controller.getSnapshot().status).toBe("connected");
  });

  it("updates a placed call's capabilities from the answer", async () => {
    const f = fixture();
    const socket = await f.connect();
    await f.calls.controller.place("+15550100", { video: true });
    expect(f.calls.controller.getSnapshot().capabilities).toMatchObject({
      video: true,
      invite: true,
    });
    event(socket, "call.accepted", "CALL-OUT", {
      capabilities: { video: false, invite: false },
    });
    await flush();
    expect(f.calls.controller.getSnapshot()).toMatchObject({
      capabilities: { video: false, invite: false, mute: true },
      video: false,
    });
  });

  it("seeds a placed call's capabilities reported before placement returned", async () => {
    const f = fixture();
    const socket = await f.connect();
    let finish!: (response: Response) => void;
    f.fetch.mockImplementationOnce(
      async () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const placing = f.calls.controller.place("+15550100");
    await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
    event(socket, "call.accepted", "CALL-OUT", {
      capabilities: { video: false, invite: false },
    });
    finish(
      new Response(JSON.stringify({ data: { callId: "CALL-OUT" } }), {
        headers: { "content-type": "application/json" },
      }),
    );
    await placing;
    expect(f.calls.controller.getSnapshot().capabilities).toEqual({
      video: false,
      invite: false,
      mute: true,
    });
  });

  it("keeps capabilities reported for a waiting invitation", async () => {
    const f = fixture();
    const socket = await f.connect();
    event(socket, "call.received", "CALL-A", { from: "+15550100" });
    event(socket, "call.received", "CALL-B", {
      from: "+15550101",
      hasVideo: true,
    });
    event(socket, "call.accepted", "CALL-B", {
      answeredBy: "client:other",
      capabilities: { video: false, invite: false },
    });
    f.calls.controller.select("CALL-B");
    expect(f.calls.controller.getSnapshot()).toMatchObject({
      callId: "CALL-B",
      capabilities: { video: false, invite: false },
      video: false,
      canJoin: true,
    });
  });

  it("leaves, and never ends, a call when microphone acquisition fails", async () => {
    const f = fixture();
    const socket = await f.connect();
    f.media.open.mockRejectedValueOnce(
      new Error("Microphone permission denied"),
    );
    event(socket, "call.received", "CALL-IN", { from: "+15550100" });
    await f.calls.controller.answer();
    await vi.waitFor(() =>
      expect(
        f.fetch.mock.calls.some(([url]) =>
          String(url).endsWith("/CALL-IN/leave"),
        ),
      ).toBe(true),
    );
    const leave = f.fetch.mock.calls.find(([url]) =>
      String(url).endsWith("/CALL-IN/leave"),
    )!;
    expect(JSON.parse(String(leave[1]?.body))).toEqual({
      connectionId: f.calls.controller.call?.connectionId,
    });
    expect(
      f.fetch.mock.calls.some(([, init]) => init?.method === "DELETE"),
    ).toBe(false);
    expect(f.calls.controller.getSnapshot()).toMatchObject({
      status: "error",
      error: { code: "answer_failed" },
    });
    expect(f.calls.controller.call?.endReason).toBe("connection_failed");
  });

  it("ends, and does not only leave, a ringing outbound call when microphone acquisition fails", async () => {
    const f = fixture();
    await f.connect();
    f.media.open.mockRejectedValueOnce(
      new Error("Microphone permission denied"),
    );
    await f.calls.controller.place("+15550100");
    // Leaving would close this connection while the callee keeps ringing.
    await vi.waitFor(() =>
      expect(
        f.fetch.mock.calls.some(
          ([url, init]) =>
            init?.method === "DELETE" &&
            new URL(String(url)).pathname === "/messaging/voip/calls/CALL-OUT",
        ),
      ).toBe(true),
    );
    expect(
      f.fetch.mock.calls.some(([url]) => String(url).endsWith("/leave")),
    ).toBe(false);
    expect(f.calls.controller.getSnapshot().status).toBe("error");
    expect(f.calls.controller.call?.ended).toBe(true);
  });

  it("leaves a call the user dismissed while its answer was in flight", async () => {
    const f = fixture();
    const socket = await f.connect();
    event(socket, "call.received", "CALL-IN", { from: "+15550100" });
    let finish!: (response: Response) => void;
    f.fetch.mockImplementationOnce(
      async () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const answering = f.calls.controller.answer();
    await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
    f.calls.controller.dismiss("CALL-IN");
    finish(
      new Response(
        JSON.stringify({
          data: { answered: true, answeredBy: "client:self", exclusive: false },
        }),
        { headers: { "content-type": "application/json" } },
      ),
    );
    await answering;
    await vi.waitFor(() =>
      expect(
        f.fetch.mock.calls.some(([url]) =>
          String(url).endsWith("/CALL-IN/leave"),
        ),
      ).toBe(true),
    );
    expect(f.media.open).not.toHaveBeenCalled();
    expect(f.calls.controller.getSnapshot()).toMatchObject({
      status: "ready",
      answering: false,
    });
  });

  it("cleans up a call whose offer was terminal before showing a waiting call", async () => {
    const f = fixture();
    const socket = await f.connect();
    event(socket, "call.received", "CALL-A", { from: "+15550100" });
    event(socket, "call.received", "CALL-B", { from: "+15550101" });
    f.media.open.mockRejectedValueOnce(
      Object.assign(new Error("Capacity"), { status: 503 }),
    );
    await f.calls.controller.answer();
    expect(f.calls.controller.getSnapshot()).toMatchObject({
      callId: "CALL-B",
      status: "incoming",
    });
    // The shared model of A is ended and its connection left.
    await vi.waitFor(() =>
      expect(
        f.fetch.mock.calls.some(([url]) =>
          String(url).endsWith("/CALL-A/leave"),
        ),
      ).toBe(true),
    );
    f.calls.controller.dismiss("CALL-B");
    // A no longer counts as an active call, so a new placement goes through.
    await f.calls.controller.place("+15550102");
    expect(f.calls.controller.getSnapshot()).toMatchObject({
      callId: "CALL-OUT",
    });
    expect(f.calls.controller.getSnapshot().error).toBeUndefined();
  });

  it("ends, and does not leave, a call this browser claimed when the microphone is denied", async () => {
    const f = fixture();
    const socket = await f.connect();
    f.media.open.mockRejectedValueOnce(
      new Error("Microphone permission denied"),
    );
    event(socket, "call.received", "CALL-IN", { from: "+15550100" });
    await f.calls.controller.answer({ exclusive: true });
    // The claim stopped other participants from taking the call over.
    await vi.waitFor(() =>
      expect(
        f.fetch.mock.calls.some(
          ([url, init]) =>
            init?.method === "DELETE" &&
            new URL(String(url)).pathname === "/messaging/voip/calls/CALL-IN",
        ),
      ).toBe(true),
    );
    expect(
      f.fetch.mock.calls.some(([url]) => String(url).endsWith("/leave")),
    ).toBe(false);
    expect(f.calls.controller.call?.endReason).toBe("connection_failed");
  });

  it("ends an exclusive placement whose media fails after the callee answered", async () => {
    const f = fixture();
    const socket = await f.connect();
    let fail!: (cause: Error) => void;
    f.media.open.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          fail = reject;
        }),
    );
    const placing = f.calls.controller.place("+15550100", { exclusive: true });
    await vi.waitFor(() => expect(f.media.open).toHaveBeenCalled());
    event(socket, "call.accepted", "CALL-OUT");
    await flush();
    expect(f.calls.controller.call?.state).not.toBe("ringing");
    fail(new Error("Camera unplugged"));
    await placing;
    await vi.waitFor(() =>
      expect(
        f.fetch.mock.calls.some(
          ([url, init]) =>
            init?.method === "DELETE" &&
            new URL(String(url)).pathname === "/messaging/voip/calls/CALL-OUT",
        ),
      ).toBe(true),
    );
    expect(
      f.fetch.mock.calls.some(([url]) => String(url).endsWith("/leave")),
    ).toBe(false);
  });

  it("keeps a confirmed remote end terminal when local cleanup rejects", async () => {
    const f = fixture();
    const socket = await f.connect();
    event(socket, "call.received", "CALL-IN", { from: "+15550100" });
    await f.calls.controller.answer();
    vi.mocked(f.session.close).mockRejectedValueOnce(
      new Error("media cleanup failed"),
    );
    await f.calls.controller.hangup();
    await flush();
    expect(f.calls.controller.getSnapshot().status).toBe("ended");
    expect(f.calls.controller.call?.ended).toBe(true);
    expect(f.calls.controller.getSnapshot().error).toBeUndefined();
  });

  it.each(["reject", "hangup"] as const)(
    "surfaces a refused %s without ending the call, keeps new invitations ringing, and allows retry",
    async (action) => {
      const f = fixture();
      const socket = await f.connect();
      event(socket, "call.received", "CALL-IN", { from: "+15550100" });
      if (action === "hangup") await f.calls.controller.answer();
      f.fetch.mockImplementationOnce(
        async () =>
          new Response(
            JSON.stringify({
              error: { code: "unavailable", message: "Try again" },
            }),
            {
              status: 503,
              headers: { "content-type": "application/json" },
            },
          ),
      );
      await f.calls.controller[action]();
      await flush();
      expect(f.calls.controller.getSnapshot()).toMatchObject({
        status: action === "reject" ? "incoming" : "connecting",
        error: { code: "call_control_failed" },
      });
      expect(f.calls.controller.call?.ended).toBe(false);
      const controls = () =>
        f.fetch.mock.calls.filter(
          ([url, init]) =>
            init?.method === "DELETE" || String(url).endsWith("/reject"),
        );
      expect(controls()).toHaveLength(1);
      // A second call rings alongside; nothing declines it.
      event(socket, "call.received", "CALL-SECOND", { from: "+15550101" });
      await flush();
      expect(f.calls.controller.getSnapshot().callId).toBe("CALL-IN");
      expect(
        f.calls.controller.getSnapshot().invitations.map((i) => i.callId),
      ).toContain("CALL-SECOND");
      expect(controls()).toHaveLength(1);
      const first = f.calls.controller.call!;
      await f.calls.controller.hangup();
      expect(controls()).toHaveLength(2);
      expect(String(controls()[1]![0])).toMatch(/\/CALL-IN$/);
      expect(first.endReason).toBe("hangup");
      // The waiting invitation is shown next.
      expect(f.calls.controller.getSnapshot()).toMatchObject({
        status: "incoming",
        callId: "CALL-SECOND",
      });
      expect(f.calls.controller.getSnapshot().error).toBeUndefined();
    },
  );

  it("preserves terminal offer reasons in the shared model", async () => {
    const f = fixture();
    await f.connect();
    f.media.open.mockRejectedValueOnce(
      Object.assign(new Error("Capacity"), { status: 503 }),
    );
    await f.calls.controller.place("+15550100");
    expect(f.calls.controller.getSnapshot()).toMatchObject({
      status: "ended",
      endReason: "capacity",
    });
    expect(f.calls.controller.call?.endReason).toBe("capacity");
  });
  it("authenticates with the client token and answers through WebRTC without tickets or modes", async () => {
    const f = fixture();
    const socket = await f.connect();
    event(socket, "call.received", "CALL-IN", {
      from: "+15550100",
      hasVideo: true,
    });
    expect(f.calls.controller.getSnapshot().status).toBe("incoming");
    await f.calls.controller.answer();
    expect(f.calls.controller.call?.state).toBe("connecting");
    f.callbacks().onConnectionState("connected");
    expect(f.calls.controller.call?.state).toBe("connected");
    expect(f.calls.controller.getSnapshot().status).toBe("connected");
    f.calls.controller.setMuted({ audio: true });
    expect(f.session.setMuted).toHaveBeenCalledWith({ audio: true });
    expect(socket.url).toBe("wss://api.polymorfa.test/voip/ws");
    expect(socket.texts[0]).toEqual({ type: "auth", token: "pmfa_ct_test" });
    expect(
      f.fetch.mock.calls.map(([url]) => new URL(String(url)).pathname),
    ).toEqual(["/messaging/voip/calls/CALL-IN/accept"]);
    expect(
      f.fetch.mock.calls.map(([, init]) => JSON.parse(String(init?.body))),
    ).toEqual([{ exclusive: false, video: true }]);
    expect(f.media.open).toHaveBeenCalledWith(
      "CALL-IN",
      true,
      expect.any(Object),
      expect.any(AbortSignal),
      expect.objectContaining({
        connectionId: f.calls.controller.call?.connectionId,
      }),
    );
    for (const [, init] of f.fetch.mock.calls)
      expect(new Headers(init?.headers).get("authorization")).toBe(
        "Bearer pmfa_ct_test",
      );
    await f.calls.controller.hangup();
    expect(f.calls.controller.call?.endReason).toBe("hangup");
    expect(f.calls.controller.getSnapshot().endReason).toBe("hangup");
  });

  it("places directly, waits for acceptance and preserves the call when another placement is attempted", async () => {
    const f = fixture();
    const socket = await f.connect();
    await f.calls.controller.place("+15550100");
    f.callbacks().onConnectionState("connected");
    expect(f.calls.controller.call?.state).toBe("ringing");
    event(socket, "call.accepted", "CALL-OUT");
    await flush();
    expect(f.calls.controller.getSnapshot().status).toBe("connected");
    await expect(f.calls.controller.place("+15550101")).rejects.toThrow(
      "Finish the active call",
    );
    expect(f.session.close).not.toHaveBeenCalled();
    const placed = f.fetch.mock.calls.find(([url]) =>
      String(url).endsWith("/messaging/voip/calls"),
    )!;
    expect(JSON.parse(String(placed[1]?.body))).toEqual({
      to: "+15550100",
      video: false,
    });
    expect(new Headers(placed[1]?.headers).has("idempotency-key")).toBe(true);
  });

  it("ends pending media setup without reviving the call or retaining its tracks", async () => {
    const f = fixture();
    const socket = await f.connect();
    let finish!: (session: CallMediaSession) => void;
    f.media.open.mockImplementationOnce(
      async () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    event(socket, "call.received", "CALL-IN", { from: "+15550100" });
    const answering = f.calls.controller.answer();
    await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
    event(socket, "call.ended", "CALL-IN", { reason: "remote_hangup" });
    finish(f.session);
    await answering;
    expect(f.calls.controller.getSnapshot()).toMatchObject({
      status: "ended",
      endReason: "remote_hangup",
    });
    expect(f.calls.controller.call?.state).toBe("ended");
    expect(f.session.close).toHaveBeenCalledOnce();
    expect(f.calls.controller.localStream).toBeUndefined();
  });

  it("answers exclusively only when the application asks", async () => {
    const f = fixture();
    const socket = await f.connect();
    event(socket, "call.received", "CALL-IN", { from: "+15550100" });
    await f.calls.controller.answer({ exclusive: true });
    const accept = f.fetch.mock.calls.find(([url]) =>
      String(url).endsWith("/accept"),
    )!;
    expect(JSON.parse(String(accept[1]?.body))).toEqual({
      exclusive: true,
      video: false,
    });
    expect(f.calls.controller.getSnapshot()).toMatchObject({
      exclusive: true,
      answeredBy: "client:self",
    });
  });

  it("stops ringing when another participant claims the call, without declining", async () => {
    const f = fixture();
    const socket = await f.connect();
    event(socket, "call.received", "CALL-IN", { from: "+15550100" });
    event(socket, "call.accepted", "CALL-IN", {
      answeredBy: "client:other-tab",
      exclusive: true,
    });
    await flush();
    expect(f.calls.controller.getSnapshot()).toMatchObject({
      status: "incoming",
      claimedByOther: true,
      canJoin: false,
    });
    await expect(f.calls.controller.answer()).rejects.toMatchObject({
      code: "call_claimed",
    });
    expect(f.fetch).not.toHaveBeenCalled();
    // The claimer's call ends later; the invitation goes away.
    event(socket, "call.ended", "CALL-IN", { reason: "remote_hangup" });
    expect(f.calls.controller.getSnapshot().invitations).toEqual([]);
  });

  it("joins a shared call and leaves only its own connection", async () => {
    const f = fixture();
    const socket = await f.connect();
    event(socket, "call.received", "CALL-IN", { from: "+15550100" });
    event(socket, "call.accepted", "CALL-IN", { answeredBy: "client:first" });
    await flush();
    expect(f.calls.controller.getSnapshot()).toMatchObject({
      canJoin: true,
      claimedByOther: false,
    });
    await f.calls.controller.join();
    f.callbacks().onConnectionState("connected");
    expect(f.calls.controller.getSnapshot().status).toBe("connected");
    const connectionId = f.calls.controller.call!.connectionId;
    await f.calls.controller.leave();
    const paths = f.fetch.mock.calls.map(([url, init]) => [
      init?.method,
      new URL(String(url)).pathname,
      init?.body === undefined ? undefined : JSON.parse(String(init.body)),
    ]);
    expect(paths).toEqual([
      [
        "POST",
        "/messaging/voip/calls/CALL-IN/accept",
        { exclusive: false, video: false },
      ],
      ["POST", "/messaging/voip/calls/CALL-IN/leave", { connectionId }],
    ]);
    // The session does not send a second leave.
    expect(f.session.close).toHaveBeenCalledWith({ leave: false });
    expect(f.calls.controller.getSnapshot()).toMatchObject({
      status: "ended",
      endReason: "left",
    });
  });

  it("surfaces a 4401 close as an unauthorized error", async () => {
    const errors: string[] = [];
    const f = fixture();
    const socket = await f.connect();
    const calls = createBrowserCalls({
      session: "support",
      getClientToken: async () => "pmfa_ct_test",
      baseUrl: "https://api.polymorfa.test",
      fetch: f.fetch,
      WebSocket: FakeWebSocket as unknown as typeof WebSocket,
      mediaFactory: f.media,
      onError: (error) => errors.push(error.code),
    });
    owned.push(calls);
    const pending = calls.connect();
    await vi.waitFor(() => expect(FakeWebSocket.instances).toHaveLength(2));
    FakeWebSocket.instances[1]!.authenticate();
    await pending;
    FakeWebSocket.instances[1]!.drop(4401, "unauthorized");
    expect(errors).toEqual(["unauthorized"]);
    expect(calls.connected).toBe(false);
    void socket;
  });

  it("ignores unrelated terminal events and disposes the lifecycle socket", async () => {
    const f = fixture();
    const socket = await f.connect();
    event(socket, "call.ended", "OTHER", { reason: "rejected" });
    expect(f.calls.controller.getSnapshot().status).toBe("ready");
    await f.calls.dispose();
    expect(socket.readyState).toBe(FakeWebSocket.CLOSED);
    await expect(f.calls.connect()).rejects.toThrow("disposed");
  });
});

describe("BrowserCallsApi", () => {
  it.each(["phoneNumber", "bsuid", "username"])(
    "validates optional participant %s",
    async (field) => {
      let value: unknown = 42;
      const api = new BrowserCallsApi(
        new BrowserTransport({
          getClientToken: async () => "pmfa_ct_test",
          baseUrl: "https://api.example.test",
          fetch: async () =>
            Response.json({
              data: {
                id: "739182640518203",
                audioMuted: false,
                video: false,
                state: "invited",
                [field]: value,
              },
            }),
        }),
      );
      await expect(
        api.addParticipant("call-1", "739182640518203"),
      ).rejects.toMatchObject({ code: "malformed_response" });
      value = "public-alias";
      await expect(
        api.addParticipant("call-1", "739182640518203"),
      ).resolves.toMatchObject({ [field]: value });
    },
  );
  it("refuses a server key before sending and sends no mode or ticket requests", async () => {
    const fetch = vi.fn();
    const api = new BrowserCallsApi(
      new BrowserTransport({ getClientToken: async () => "pmfa_test", fetch }),
    );
    await expect(api.token()).rejects.toThrow("pmfa_ct_");
    await expect(api.accept("c1", {})).rejects.toThrow("pmfa_ct_");
    expect(fetch).not.toHaveBeenCalled();
    expect("setMode" in api).toBe(false);
    expect("mediaTicket" in api).toBe(false);
    expect("socketTicket" in api).toBe(false);
  });
  it("maps a claimed accept to CallClaimedError", async () => {
    const api = new BrowserCallsApi(
      new BrowserTransport({
        getClientToken: async () => "pmfa_ct_test",
        maxNetworkRetries: 0,
        fetch: async () =>
          Response.json(
            { error: { code: "call_claimed", message: "Claimed" } },
            { status: 409 },
          ),
      }),
    );
    await expect(api.accept("c1", {})).rejects.toBeInstanceOf(CallClaimedError);
  });
  it("maps calls_disabled refusals to CallsDisabledError", async () => {
    const api = new BrowserCallsApi(
      new BrowserTransport({
        getClientToken: async () => "pmfa_ct_test",
        maxNetworkRetries: 0,
        fetch: async () =>
          Response.json(
            {
              error: {
                code: "calls_disabled",
                message: "Calling is turned off for this number.",
              },
            },
            { status: 403 },
          ),
      }),
    );
    const input = {
      session: "support",
      to: "+15550100",
      video: false,
      idempotencyKey: "test",
    };
    await expect(api.place(input)).rejects.toBeInstanceOf(CallsDisabledError);
    await expect(api.accept("c1", {})).rejects.toBeInstanceOf(
      CallsDisabledError,
    );
    await expect(api.addParticipant("c1", "+15550101")).rejects.toMatchObject({
      code: "calls_disabled",
      status: 403,
    });
  });
  it("rejects malformed successful placement responses", async () => {
    const api = new BrowserCallsApi(
      new BrowserTransport({
        getClientToken: async () => "pmfa_ct_test",
        fetch: async () => new Response("{}"),
      }),
    );
    await expect(
      api.place({
        session: "support",
        to: "+15550100",
        video: false,
        idempotencyKey: "test",
      }),
    ).rejects.toMatchObject({ code: "malformed_response" });
  });
});
