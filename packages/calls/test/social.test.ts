import { describe, expect, it, vi } from "vitest";
import { Call } from "../src/call.js";
import { HttpCallsApi } from "../src/api.js";
import { parseMediaControl } from "../src/protocol.js";
import { fakeApi } from "./helpers.js";

describe("call interactions", () => {
  it("rejects malformed emoji, provider identities and ambiguous sender frames", () => {
    for (const frame of [
      { type: "reaction", participantId: "123@lid", emoji: "👍" },
      { type: "reaction", participantId: "123", emoji: "unbounded text" },
      { type: "reaction", self: true, participantId: "123", emoji: "👍" },
      { type: "hand_state", raised: "true", supported: true },
    ])
      expect(parseMediaControl(JSON.stringify(frame))).toBeUndefined();
    expect(
      parseMediaControl(
        JSON.stringify({ type: "reaction", participantId: "123", emoji: "" }),
      ),
    ).toMatchObject({ emoji: "" });
  });
  it("uses runtime support, has no optimistic echo, and retains confirmed hand state", async () => {
    const api = {
      ...fakeApi(),
      sendReaction: vi.fn(async () => undefined),
      setHandRaised: vi.fn(async () => undefined),
    };
    const call = new Call({
      id: "call",
      session: "support",
      direction: "inbound",
      peer: "123",
      video: false,
      api,
      media: {},
      mediaMode: "external",
      participant: "agent",
    });
    await call.answer();
    call.mediaConnected();
    await expect(call.sendReaction("👍")).rejects.toThrow("unavailable");
    call._remoteSocial({ type: "hand_state", raised: false, supported: true });
    const reactions = vi.fn();
    call.on("reaction", reactions);
    await call.sendReaction("👍");
    expect(reactions).not.toHaveBeenCalled();
    expect(api.sendReaction).toHaveBeenCalledWith(
      "call",
      call.connectionId,
      "👍",
      "agent",
    );
    await call.setHandRaised(true);
    expect(call.handRaised).toBe(false);
    call._remoteSocial({ type: "hand_state", raised: true, supported: true });
    expect(call.handRaised).toBe(true);
    call._remoteSocial({ type: "reaction", self: true, emoji: "👍" });
    expect(reactions).toHaveBeenCalledTimes(1);
    await call.end();
    call._remoteSocial({ type: "reaction", self: true, emoji: "👍" });
    expect(reactions).toHaveBeenCalledTimes(1);
  });
  it("strips participant overrides from client-token controls and never replays failed sends", async () => {
    const fetch = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(
      async () =>
        new Response(JSON.stringify({ success: true }), {
          status: 202,
          headers: { "content-type": "application/json" },
        }),
    );
    const api = new HttpCallsApi({ token: "pmfa_ct_token", fetch });
    await api.sendReaction("call", "connection-1", "", "forged");
    expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body))).toEqual({
      connectionId: "connection-1",
      emoji: "",
    });
    fetch.mockRejectedValueOnce(new Error("lost after write"));
    await expect(
      api.setHandRaised("call", "connection-1", true),
    ).rejects.toThrow();
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
