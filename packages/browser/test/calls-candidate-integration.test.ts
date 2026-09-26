import { afterEach, expect, it, vi } from "vitest";
import { createInternalBrowserCalls } from "../src/calls/client.js";
import { FakeWebSocket } from "../../calls/test/helpers.js";

let calls: ReturnType<typeof createInternalBrowserCalls> | undefined;
afterEach(async () => {
  await calls?.dispose();
  calls = undefined;
  FakeWebSocket.instances = [];
  vi.unstubAllGlobals();
});

it("uses the authenticated lifecycle socket for browser candidates and REST during a drop", async () => {
  class Stream {
    getTracks() {
      return [];
    }
    getAudioTracks() {
      return [];
    }
    getVideoTracks() {
      return [];
    }
    addTrack() {}
  }
  vi.stubGlobal("MediaStream", Stream);
  const peer = {
    addTransceiver: () => ({ sender: { replaceTrack: async () => {} } }),
    getTransceivers: () => [],
    createDataChannel: () => ({ close() {} }),
    createOffer: async () => ({ type: "offer", sdp: "v=0" }),
    setLocalDescription: async () => {},
    setRemoteDescription: async () => {},
    setConfiguration() {},
    addIceCandidate: vi.fn(async () => {}),
    close() {},
    onicecandidate: undefined as ((event: unknown) => void) | undefined,
  };
  let tick: (() => void) | undefined;
  const fetch = vi.fn<typeof globalThis.fetch>(async (input) => {
    const path = new URL(String(input)).pathname;
    const data = path.endsWith("/offer")
      ? { sdp: "v=0", iceServers: [] }
      : path.endsWith("/accept")
        ? { answered: true, answeredBy: "client:self", exclusive: false }
        : path.endsWith("/candidates")
          ? { candidates: [] }
          : {};
    return new Response(JSON.stringify({ data }), {
      headers: { "content-type": "application/json" },
    });
  });
  calls = createInternalBrowserCalls({
    session: "support",
    getClientToken: async () => "pmfa_ct_test",
    baseUrl: "https://api.polymorfa.test",
    fetch,
    diagnostics: false,
    WebSocket: FakeWebSocket as unknown as typeof WebSocket,
    media: {
      createPeerConnection: () => peer as unknown as RTCPeerConnection,
      mediaDevices: {
        getUserMedia: async () => new Stream(),
      } as unknown as MediaDevices,
      setInterval: ((fn: () => void) => {
        tick = fn;
        return 1;
      }) as unknown as typeof setInterval,
      clearInterval: (() => {}) as typeof clearInterval,
    },
  });
  const connecting = calls.connect();
  await vi.waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));
  const socket = FakeWebSocket.instances[0]!;
  socket.authenticate();
  await connecting;
  socket.text({
    type: "event",
    event: "call.received",
    callId: "CALL-IN",
    payload: { callId: "CALL-IN", from: "+15550100" },
    timestamp: new Date().toISOString(),
  });
  await calls.controller.answer();
  const candidate = { candidate: "candidate:1", sdpMid: "0" };
  peer.onicecandidate?.({ candidate: { toJSON: () => candidate } });
  expect(socket.lastText).toMatchObject({
    type: "candidate",
    callId: "CALL-IN",
    candidate,
  });
  const connectionId = (socket.lastText as { connectionId: string })
    .connectionId;
  expect(connectionId).toBeTruthy();
  tick?.();
  expect(
    fetch.mock.calls.some(([url]) => String(url).endsWith("/candidates")),
  ).toBe(false);
  socket.text({
    type: "candidate",
    callId: "CALL-IN",
    connectionId,
    candidate,
  });
  expect(peer.addIceCandidate).toHaveBeenCalledWith(candidate);
  socket.text({
    type: "candidate",
    callId: "OTHER",
    connectionId,
    candidate: { candidate: "wrong" },
  });
  expect(peer.addIceCandidate).toHaveBeenCalledTimes(1);
  socket.drop();
  peer.onicecandidate?.({ candidate: { toJSON: () => candidate } });
  tick?.();
  await vi.waitFor(() => {
    expect(
      fetch.mock.calls.some(([url]) => String(url).endsWith("/candidate")),
    ).toBe(true);
    expect(
      fetch.mock.calls.some(([url]) => String(url).endsWith("/candidates")),
    ).toBe(true);
  });
});
