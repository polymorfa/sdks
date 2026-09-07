import { afterEach, describe, expect, it, vi } from "vitest";
import { createBrowserCalls } from "../src/calls/client.js";
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
  const fetch = vi.fn<typeof globalThis.fetch>(async (input) => {
    const path = new URL(String(input)).pathname;
    const data = path.endsWith("ws-ticket")
      ? {
          ticket: "pmfa_wst_test",
          expiresAt: Date.now() + 60_000,
          url: "/api/voip/ws?ticket=pmfa_wst_test",
        }
      : path === "/api/voip/calls"
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
      socket.open();
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
  it("hangs up a remote call when microphone acquisition fails", async () => {
    const f = fixture();
    const socket = await f.connect();
    f.media.open.mockRejectedValueOnce(
      new Error("Microphone permission denied"),
    );
    event(socket, "call.received", "CALL-IN", { from: "+15550100" });
    await f.calls.controller.answer();
    await vi.waitFor(() =>
      expect(
        f.fetch.mock.calls.some(
          ([url, init]) =>
            String(url).endsWith("/CALL-IN") && init?.method === "DELETE",
        ),
      ).toBe(true),
    );
    expect(f.calls.controller.getSnapshot()).toMatchObject({
      status: "error",
      error: { code: "answer_failed" },
    });
    expect(f.calls.controller.call?.endReason).toBe("connection_failed");
  });

  it.each(["reject", "hangup"] as const)(
    "surfaces a refused %s without ending the call and allows hangup retry",
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
        status: "error",
        error: { code: "call_control_failed" },
      });
      expect(f.calls.controller.call?.ended).toBe(false);
      const deletes = () =>
        f.fetch.mock.calls.filter(([, init]) => init?.method === "DELETE");
      expect(deletes()).toHaveLength(1);
      event(socket, "call.received", "CALL-SECOND", { from: "+15550101" });
      await flush();
      expect(f.calls.controller.getSnapshot().callId).toBe("CALL-IN");
      expect(deletes()).toHaveLength(2);
      expect(String(deletes()[1]![0])).toContain("/CALL-SECOND");
      await f.calls.controller.hangup();
      expect(deletes()).toHaveLength(3);
      expect(f.calls.controller.getSnapshot()).toMatchObject({
        status: "ended",
        endReason: "hangup",
      });
      expect(f.calls.controller.call?.ended).toBe(true);
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
  it("uses client tokens, claims browser mode, and answers through WebRTC without agent tickets", async () => {
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
    expect(
      f.fetch.mock.calls.map(([url]) => new URL(String(url)).pathname),
    ).toEqual(["/api/voip/mode", "/api/voip/ws-ticket"]);
    expect(
      f.fetch.mock.calls.map(([, init]) => JSON.parse(String(init?.body))),
    ).toEqual([{ mode: "browser" }, {}]);
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
      String(url).endsWith("/api/voip/calls"),
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
    await flush();
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
  it("refuses a server key before sending and never mints agent tickets", async () => {
    const fetch = vi.fn();
    const api = new BrowserCallsApi(
      new BrowserTransport({ getClientToken: async () => "pmfa_test", fetch }),
    );
    await expect(api.setMode("support", "browser")).rejects.toThrow("pmfa_ct_");
    await expect(api.mediaTicket()).rejects.toThrow(
      "cannot mint agent tickets",
    );
    expect(fetch).not.toHaveBeenCalled();
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
