import { describe, expect, it } from "vitest";
import { Call } from "../src/call.js";
import { CallsClient } from "../src/client.js";
import { fakeApi, FakeWebSocket, flush } from "./helpers.js";

describe("externally managed call media", () => {
  it("answers without an agent ticket and connects only when WebRTC is ready", async () => {
    const api = fakeApi();
    const call = new Call({
      id: "CALL-IN",
      session: "support",
      direction: "inbound",
      peer: "+15550100",
      video: false,
      api,
      media: {},
      mediaMode: "external",
    });
    await call.answer();
    expect(api.accept).toHaveBeenCalledOnce();
    expect(api.mediaTicket).not.toHaveBeenCalled();
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
    expect(api.mediaTicket).not.toHaveBeenCalled();
  });

  it("tears down a placement that returns after disconnect", async () => {
    const api = fakeApi();
    let finish!: (value: { callId: string }) => void;
    api.place.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const client = new CallsClient({
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
    expect(api.hangup).toHaveBeenCalledWith("LATE");
    expect(client.calls).toEqual([]);
  });
});
