import { describe, expect, it } from "vitest";
import { Call } from "../src/call.js";
import { createInternalCallsClient } from "../src/client.js";
import { CallClaimedError, CallsError } from "../src/errors.js";
import { fakeApi, FakeWebSocket, flush, timers } from "./helpers.js";

function inbound(
  api = fakeApi(),
  options: { self?: string; mediaMode?: "socket" | "external" } = {},
) {
  return new Call({
    id: "CALL-IN",
    session: "support",
    direction: "inbound",
    peer: "+15550100",
    video: false,
    api,
    media: {},
    mediaMode: options.mediaMode ?? "external",
    self: () => options.self,
  });
}

describe("externally managed call media", () => {
  it("answers without a media socket and connects only when WebRTC is ready", async () => {
    const api = fakeApi();
    const call = inbound(api);
    await call.answer();
    expect(api.accept).toHaveBeenCalledWith("CALL-IN", {
      exclusive: false,
      video: false,
    });
    expect(api.token).not.toHaveBeenCalled();
    expect(call.state).toBe("connecting");
    call.mediaConnected();
    expect(call.state).toBe("connected");
    call._remoteEnded("remote_hangup");
    call.mediaConnected();
    expect(call.state).toBe("ended");
  });

  it("waits for remote acceptance even when WebRTC connects first", async () => {
    const api = fakeApi();
    const call = new Call({
      id: "CALL-OUT",
      session: "support",
      direction: "outbound",
      peer: "+15550100",
      video: false,
      api,
      media: {},
      mediaMode: "external",
    });
    call.mediaConnected();
    expect(call.state).toBe("ringing");
    await call._remoteAccepted();
    expect(call.state).toBe("connected");
  });

  it("ends a placement that returns after disconnect", async () => {
    const api = fakeApi();
    let finish!: (value: { callId: string }) => void;
    api.place.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const client = createInternalCallsClient({
      session: "support",
      api,
      mediaMode: "external",
      WebSocket: FakeWebSocket as unknown as typeof WebSocket,
    });
    const placing = client.place("+15550100");
    const rejected = expect(placing).rejects.toThrow("cancelled");
    await flush();
    await client.disconnect();
    finish({ callId: "LATE" });
    await rejected;
    expect(api.end).toHaveBeenCalledWith("LATE");
    expect(client.calls).toEqual([]);
  });

  it("leaves one connection over REST without ending the call", async () => {
    const api = fakeApi();
    const call = inbound(api);
    await call.answer();
    call.mediaConnected();
    await call.leave();
    expect(api.leave).toHaveBeenCalledWith(
      "CALL-IN",
      call.connectionId,
      undefined,
      undefined,
    );
    expect(api.end).not.toHaveBeenCalled();
    expect(call.endReason).toBe("left");
  });

  it("uses a supplied connection id and refuses an invalid one", () => {
    const api = fakeApi();
    const call = new Call({
      id: "C",
      session: "s",
      direction: "inbound",
      peer: "",
      video: false,
      api,
      media: {},
      connectionId: "tab-connection-1",
    });
    expect(call.connectionId).toBe("tab-connection-1");
    expect(
      () =>
        new Call({
          id: "C",
          session: "s",
          direction: "inbound",
          peer: "",
          video: false,
          api,
          media: {},
          connectionId: "bad",
        }),
    ).toThrow(CallsError);
  });
});

describe("answer, join and claims", () => {
  it("passes exclusive through and records the claim result", async () => {
    const api = fakeApi();
    api.accept.mockResolvedValueOnce({
      answered: true,
      answeredBy: "client:self",
      exclusive: true,
    });
    const call = inbound(api, { self: "client:self" });
    const claims: unknown[] = [];
    call.on("claim", (c) => claims.push(c));
    await call.answer({ exclusive: true, video: true });
    expect(api.accept).toHaveBeenCalledWith("CALL-IN", {
      exclusive: true,
      video: true,
    });
    expect(call.claim).toEqual({
      answered: true,
      answeredBy: "client:self",
      exclusive: true,
      claimedByOther: false,
      canJoin: false,
    });
    expect(claims).toHaveLength(1);
    // Our own call.accepted echo does not mark the call claimed by someone else.
    await call._remoteAccepted({ answeredBy: "client:self", exclusive: true });
    expect(call.claimedByOther).toBe(false);
  });

  it("stops ringing, without declining, when another participant claims the call", async () => {
    const api = fakeApi();
    const call = inbound(api, { self: "client:self" });
    const claims: { claimedByOther: boolean }[] = [];
    call.on("claim", (c) => claims.push(c));
    await call._remoteAccepted({ answeredBy: "client:other", exclusive: true });
    expect(call.state).toBe("incoming");
    expect(call.claimedByOther).toBe(true);
    expect(call.canJoin).toBe(false);
    expect(claims.at(-1)?.claimedByOther).toBe(true);
    await expect(call.answer()).rejects.toBeInstanceOf(CallClaimedError);
    await expect(call.join()).rejects.toBeInstanceOf(CallClaimedError);
    // Declining would end the claimer's call; it is refused locally.
    await expect(call.reject()).rejects.toMatchObject({
      code: "call_not_ringing",
    });
    expect(api.accept).not.toHaveBeenCalled();
    expect(api.reject).not.toHaveBeenCalled();
    expect(api.end).not.toHaveBeenCalled();
  });

  it("offers join when the call is answered without a claim", async () => {
    const api = fakeApi();
    api.accept.mockResolvedValueOnce({
      answered: true,
      answeredBy: "client:first",
      exclusive: false,
    });
    const call = inbound(api, { self: "client:self" });
    await expect(call.join()).rejects.toMatchObject({
      code: "call_not_answered",
    });
    await call._remoteAccepted({ answeredBy: "client:first" });
    expect(call.canJoin).toBe(true);
    expect(call.claimedByOther).toBe(false);
    await call.join();
    // join never claims.
    expect(api.accept).toHaveBeenCalledWith("CALL-IN", {
      exclusive: false,
      video: false,
    });
    expect(call.state).toBe("connecting");
    expect(call.claim.answeredBy).toBe("client:first");
  });

  it("keeps a call visible as claimed when accept returns 409 call_claimed", async () => {
    const api = fakeApi();
    api.accept.mockRejectedValueOnce(new CallClaimedError());
    const call = inbound(api);
    await expect(call.answer()).rejects.toBeInstanceOf(CallClaimedError);
    expect(call.state).toBe("incoming");
    expect(call.claimedByOther).toBe(true);
    expect(call.ended).toBe(false);
  });

  it("does not treat a call.accepted that races our own accept as a claim by others", async () => {
    const api = fakeApi();
    let release!: () => void;
    api.accept.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () =>
            resolve({
              answered: true,
              answeredBy: "client:unknown-self",
              exclusive: true,
            });
        }),
    );
    const call = inbound(api);
    const answering = call.answer({ exclusive: true });
    await flush();
    await call._remoteAccepted({
      answeredBy: "client:unknown-self",
      exclusive: true,
    });
    release();
    await answering;
    expect(call.claimedByOther).toBe(false);
  });

  it.each([
    [1000, "media connection closed", "remote_hangup"],
    [4400, "unauthorized", "connection_failed"],
  ] as const)(
    "does not reattach after a %s close",
    async (code, reason, endReason) => {
      FakeWebSocket.instances = [];
      const api = fakeApi();
      const t = timers();
      const call = new Call({
        id: "CALL-IN",
        session: "support",
        direction: "inbound",
        peer: "+15550100",
        video: false,
        api,
        media: {
          WebSocket: FakeWebSocket as unknown as typeof WebSocket,
          setTimeout: t.setTimeout,
          clearTimeout: t.clearTimeout,
          setInterval: t.setInterval,
          clearInterval: t.clearInterval,
        },
      });
      const answering = call.answer();
      await flush();
      FakeWebSocket.instances[0]!.open();
      FakeWebSocket.instances[0]!.text({
        type: "ready",
        sampleRate: 16_000,
        video: false,
      });
      await answering;
      FakeWebSocket.instances[0]!.drop(code, reason);
      expect(call.endReason).toBe(endReason);
      t.fireTimeouts();
      await flush();
      expect(FakeWebSocket.instances).toHaveLength(1);
    },
  );

  it("reattaches socket media with the same connection id after a drop", async () => {
    FakeWebSocket.instances = [];
    const api = fakeApi();
    const t = timers();
    const call = new Call({
      id: "CALL-IN",
      session: "support",
      direction: "inbound",
      peer: "+15550100",
      video: false,
      api,
      media: {
        WebSocket: FakeWebSocket as unknown as typeof WebSocket,
        setTimeout: t.setTimeout,
        clearTimeout: t.clearTimeout,
        setInterval: t.setInterval,
        clearInterval: t.clearInterval,
      },
    });
    const answering = call.answer();
    await flush();
    FakeWebSocket.instances[0]!.open();
    FakeWebSocket.instances[0]!.text({
      type: "ready",
      sampleRate: 16_000,
      video: false,
    });
    await answering;
    FakeWebSocket.instances[0]!.text({
      type: "video_source",
      source: 5,
      connectionId: "peer-conn-1",
    });
    expect([...call.video.sources.keys()]).toEqual([5]);
    const states: string[] = [];
    call.on("state", (s) => states.push(s));
    FakeWebSocket.instances[0]!.drop(4401, "unauthorized");
    expect(call.state).toBe("reconnecting");
    expect(call.video.sources.size).toBe(0);
    t.fireTimeouts();
    await flush();
    const second = FakeWebSocket.instances[1]!;
    expect(api.token).toHaveBeenLastCalledWith({ refresh: true });
    second.open();
    expect(second.texts[0]).toMatchObject({
      type: "auth",
      connectionId: call.connectionId,
    });
    second.text({ type: "ready", sampleRate: 16_000, video: false });
    await flush();
    expect(call.state).toBe("connected");
    expect(states).toEqual(["reconnecting", "connected"]);
    await call.end();
  });
});
