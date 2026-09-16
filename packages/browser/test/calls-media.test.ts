import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  WebRtcMediaFactory,
  type CallMediaCallbacks,
  type RemoteVideo,
  type CallsSignaling,
  type CandidateTransport,
  type TrickleCandidate,
} from "../src/index.js";

// The factory builds its own remote `MediaStream`; everything else is injected.
class FakeStream {
  #tracks: FakeTrack[];
  constructor(tracks: FakeTrack[] = []) {
    this.#tracks = tracks;
  }
  getTracks(): FakeTrack[] {
    return [...this.#tracks];
  }
  getAudioTracks(): FakeTrack[] {
    return this.#tracks.filter((t) => t.kind === "audio");
  }
  getVideoTracks(): FakeTrack[] {
    return this.#tracks.filter((t) => t.kind === "video");
  }
  addTrack(track: FakeTrack): void {
    if (!this.#tracks.includes(track)) this.#tracks.push(track);
  }
  removeTrack(track: FakeTrack): void {
    this.#tracks = this.#tracks.filter((t) => t !== track);
  }
}
class FakeTrack {
  enabled = true;
  readonly stop = vi.fn();
  constructor(readonly kind: "audio" | "video") {}
}

beforeEach(() => {
  (globalThis as { MediaStream?: unknown }).MediaStream = FakeStream;
});

type FakeSender = {
  track: FakeTrack | null;
  replaceTrack: (track: FakeTrack | null) => Promise<void>;
  setStreams: ReturnType<typeof vi.fn>;
};
type FakeTransceiver = {
  mid: string | null;
  direction: string;
  currentDirection: string | null;
  sender: FakeSender;
  receiver: { track: FakeTrack };
};

function peerConnection(overrides: Partial<Record<string, unknown>> = {}) {
  const transceivers: FakeTransceiver[] = [];
  const channels: {
    label: string;
    init: unknown;
    onmessage: ((event: { data: unknown }) => void) | null;
  }[] = [];
  const peer = {
    connectionState: "new",
    iceConnectionState: "new",
    transceivers,
    channels,
    addIceCandidate: vi.fn(async () => undefined),
    addTransceiver: vi.fn(
      (
        trackOrKind: FakeTrack | "audio" | "video",
        init: { direction: string },
      ) => {
        const kind =
          typeof trackOrKind === "string" ? trackOrKind : trackOrKind.kind;
        const sender: FakeSender = {
          track: typeof trackOrKind === "string" ? null : trackOrKind,
          replaceTrack: async (next) => {
            sender.track = next;
          },
          setStreams: vi.fn(),
        };
        const transceiver: FakeTransceiver = {
          mid: null,
          direction: init.direction,
          currentDirection: null,
          sender,
          receiver: { track: new FakeTrack(kind) },
        };
        transceivers.push(transceiver);
        return transceiver;
      },
    ),
    getTransceivers: () => [...transceivers],
    createDataChannel: vi.fn((label: string, init: unknown) => {
      const channel = { label, init, onmessage: null };
      channels.push(channel);
      return channel;
    }),
    getSenders: () => transceivers.map((t) => t.sender),
    createOffer: vi.fn(async () => ({ type: "offer", sdp: "v=0" })),
    // Mids are assigned when the offer is applied, as in a browser.
    setLocalDescription: vi.fn(async () => {
      transceivers.forEach((t, index) => {
        t.mid ??= String(index);
      });
    }),
    setRemoteDescription: vi.fn(async () => undefined),
    localDescription: { sdp: "v=0" },
    setConfiguration: vi.fn(),
    close: vi.fn(),
    ...overrides,
  };
  return peer as unknown as RTCPeerConnection & typeof peer;
}

/** Deliver one data-channel message from the platform. */
function control(peer: ReturnType<typeof peerConnection>, message: unknown) {
  peer.channels[0]?.onmessage?.({ data: JSON.stringify(message) });
}

function signaling(
  overrides: Partial<CallsSignaling> = {},
): CallsSignaling & Record<string, ReturnType<typeof vi.fn>> {
  return {
    offer: vi.fn(async () => ({ sdp: "v=0", iceServers: [] })),
    renegotiate: vi.fn(async () => ({ sdp: "v=0", iceServers: [] })),
    candidate: vi.fn(async () => undefined),
    candidates: vi.fn(async () => []),
    leave: vi.fn(async () => undefined),
    end: vi.fn(async () => undefined),
    ...overrides,
  } as never;
}

function transport(): CandidateTransport & {
  deliver: (callId: string, candidate: TrickleCandidate) => void;
  listeners: number;
} {
  const listeners = new Set<
    (callId: string, candidate: TrickleCandidate) => void
  >();
  return {
    connected: true,
    sendCandidate: () => true,
    onCandidate: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    deliver: (callId, candidate) => {
      for (const listener of [...listeners]) listener(callId, candidate);
    },
    get listeners() {
      return listeners.size;
    },
  };
}

const callbacks: CallMediaCallbacks = {
  onConnectionState: () => undefined,
  onRemoteStream: () => undefined,
};

const CANDIDATE: TrickleCandidate = {
  candidate: "candidate:1 1 udp",
  sdpMid: "0",
};

function factoryFor(options: {
  peer: RTCPeerConnection;
  signaling: CallsSignaling;
  candidateTransport?: CandidateTransport;
  stream?: FakeStream;
  getUserMedia?: ReturnType<typeof vi.fn>;
}) {
  const getUserMedia =
    options.getUserMedia ??
    vi.fn(
      async () => options.stream ?? new FakeStream([new FakeTrack("audio")]),
    );
  return new WebRtcMediaFactory({
    signaling: options.signaling,
    ...(options.candidateTransport === undefined
      ? {}
      : { candidateTransport: options.candidateTransport }),
    mediaDevices: { getUserMedia } as unknown as MediaDevices,
    createPeerConnection: () => options.peer,
    setInterval: (() => 0) as never,
    clearInterval: (() => undefined) as never,
  });
}

describe("WebRtcMediaFactory candidate handling", () => {
  it("holds pushed candidates until the answer is applied, then drains them", async () => {
    const peer = peerConnection();
    const t = transport();
    // The answer lands only once released, so the candidate necessarily
    // arrives while there is still no remote description.
    let releaseAnswer: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      releaseAnswer = resolve;
    });
    const s = signaling({
      offer: vi.fn(async () => {
        t.deliver("call-1", CANDIDATE);
        await gate;
        return { sdp: "v=0", iceServers: [] };
      }),
    } as never);
    const opening = factoryFor({
      peer,
      signaling: s,
      candidateTransport: t,
    }).open("call-1", false, callbacks, new AbortController().signal);

    // Let setup run up to the gated answer, so the candidate has certainly
    // been delivered while no remote description exists.
    for (let i = 0; i < 20; i += 1) await Promise.resolve();
    expect(s["offer"]).toHaveBeenCalled();
    expect(peer.setRemoteDescription).not.toHaveBeenCalled();
    expect(peer.addIceCandidate).not.toHaveBeenCalled();
    releaseAnswer();
    await opening;
    expect(peer.addIceCandidate).toHaveBeenCalledWith(CANDIDATE);

    t.deliver("call-1", CANDIDATE);
    expect(peer.addIceCandidate).toHaveBeenCalledTimes(2);
  });

  it("drops the transport subscription when setup fails", async () => {
    const t = transport();
    const peer = peerConnection();
    await expect(
      factoryFor({
        peer,
        signaling: signaling({
          offer: vi.fn(async () => {
            throw new Error("offer rejected");
          }),
        } as never),
        candidateTransport: t,
      }).open("call-1", false, callbacks, new AbortController().signal),
    ).rejects.toThrow("offer rejected");
    expect(t.listeners).toBe(0);
    expect(peer.close).toHaveBeenCalled();
  });
});

describe("WebRtcMediaFactory track negotiation", () => {
  it("does not open a camera to switch on a call that sends none", async () => {
    const audio = new FakeTrack("audio");
    const local = new FakeStream([audio]);
    const camera = new FakeTrack("video");
    const getUserMedia = vi
      .fn()
      .mockResolvedValueOnce(local)
      .mockResolvedValueOnce(new FakeStream([camera]));
    const peer = peerConnection();
    const session = await factoryFor({
      peer,
      signaling: signaling(),
      getUserMedia,
    }).open("call-1", false, callbacks, new AbortController().signal);

    await session.switchInput?.("video", "cam-1", new AbortController().signal);
    // Keeping one would satisfy enableVideo's guard and strand the upgrade.
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(local.getVideoTracks()).toHaveLength(0);
    void camera;
  });

  it("rolls the local offer back when renegotiation fails", async () => {
    const audio = new FakeTrack("audio");
    const local = new FakeStream([audio]);
    const getUserMedia = vi.fn().mockResolvedValue(local);
    const peer = peerConnection();
    const s = signaling({
      renegotiate: vi.fn(async () => {
        throw new Error("re-offer rejected");
      }),
    } as never);
    const session = await factoryFor({
      peer,
      signaling: s,
      getUserMedia,
    }).open("call-1", false, callbacks, new AbortController().signal);

    await expect(
      session.restartIce?.(new AbortController().signal),
    ).rejects.toThrow("re-offer rejected");
    // Left in have-local-offer, every later upgrade or restart would fail on
    // the stale offer rather than on its own merits.
    expect(peer.setLocalDescription).toHaveBeenCalledWith({
      type: "rollback",
    });
  });

  it("serializes same-kind switches so the last request wins", async () => {
    const audio = new FakeTrack("audio");
    const local = new FakeStream([audio]);
    const second = new FakeTrack("audio");
    const first = new FakeTrack("audio");
    let releaseFirst: (stream: FakeStream) => void = () => undefined;
    const getUserMedia = vi
      .fn()
      .mockResolvedValueOnce(local)
      // The older acquisition resolves last, which is the ordering that used
      // to leave the older device as the live track.
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            releaseFirst = resolve as (s: FakeStream) => void;
          }),
      )
      .mockResolvedValueOnce(new FakeStream([second]));
    const peer = peerConnection();
    const session = await factoryFor({
      peer,
      signaling: signaling(),
      getUserMedia,
    }).open("call-1", false, callbacks, new AbortController().signal);

    const a = session.switchInput?.(
      "audio",
      "mic-2",
      new AbortController().signal,
    );
    const b = session.switchInput?.(
      "audio",
      "mic-3",
      new AbortController().signal,
    );
    // The chain defers each swap by a microtask; let the first one start.
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
    // The second switch must not have started while the first is in flight:
    // one call for open, one for the first switch, none yet for the second.
    expect(getUserMedia).toHaveBeenCalledTimes(2);
    releaseFirst(new FakeStream([first]));
    await a;
    await b;
    expect(getUserMedia).toHaveBeenCalledTimes(3);
    expect(local.getAudioTracks()).toEqual([second]);
    expect(first.stop).toHaveBeenCalled();
  });

  it("releases the acquired stream when the track swap fails", async () => {
    const audio = new FakeTrack("audio");
    const local = new FakeStream([audio]);
    const replacement = new FakeTrack("audio");
    const getUserMedia = vi
      .fn()
      .mockResolvedValueOnce(local)
      .mockResolvedValueOnce(new FakeStream([replacement]));
    const peer = peerConnection();
    const session = await factoryFor({
      peer,
      signaling: signaling(),
      getUserMedia,
    }).open("call-1", false, callbacks, new AbortController().signal);
    const sender = peer.getSenders()[0] as unknown as {
      replaceTrack: (track: unknown) => Promise<void>;
    };
    sender.replaceTrack = async () => {
      throw new Error("swap rejected");
    };

    await expect(
      session.switchInput?.("audio", "mic-2", new AbortController().signal),
    ).rejects.toThrow("swap rejected");
    expect(replacement.stop).toHaveBeenCalled();
    // The original capture is untouched, so the call keeps its microphone.
    expect(audio.stop).not.toHaveBeenCalled();
    expect(local.getAudioTracks()).toEqual([audio]);
  });

  it("acquires the camera the caller selected, not the one captured at open", async () => {
    const audio = new FakeTrack("audio");
    const camera = new FakeTrack("video");
    const getUserMedia = vi
      .fn()
      .mockResolvedValueOnce(new FakeStream([audio]))
      .mockResolvedValueOnce(new FakeStream([camera]));
    const peer = peerConnection();
    const session = await factoryFor({
      peer,
      signaling: signaling(),
      getUserMedia,
    }).open("call-1", false, callbacks, new AbortController().signal, {
      devices: { videoInput: "cam-at-open" },
    });

    await session.enableVideo?.(new AbortController().signal, {
      videoInput: "cam-chosen-later",
    });
    expect(getUserMedia).toHaveBeenLastCalledWith({
      audio: false,
      video: { deviceId: { ideal: "cam-chosen-later" } },
    });
  });

  it("adds one camera track when two upgrades overlap", async () => {
    const audio = new FakeTrack("audio");
    const local = new FakeStream([audio]);
    const first = new FakeTrack("video");
    const second = new FakeTrack("video");
    let release: (stream: FakeStream) => void = () => undefined;
    const getUserMedia = vi
      .fn()
      .mockResolvedValueOnce(local)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            release = resolve as (s: FakeStream) => void;
          }),
      )
      .mockResolvedValueOnce(new FakeStream([second]));
    const peer = peerConnection();
    const session = await factoryFor({
      peer,
      signaling: signaling(),
      getUserMedia,
    }).open("call-1", false, callbacks, new AbortController().signal);

    const a = session.enableVideo?.(new AbortController().signal);
    const b = session.enableVideo?.(new AbortController().signal);
    // The queue defers each turn by a microtask, so let the first one reach
    // its acquisition before releasing it.
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
    release(new FakeStream([first]));
    await a;
    await b;
    // Both calls cleared the "already have video" guard before either had
    // acquired, which left two tracks and two senders on one connection.
    expect(local.getVideoTracks()).toEqual([first]);
    expect(
      peer.getSenders().filter((s) => s.track?.kind === "video"),
    ).toHaveLength(1);
    expect(peer.transceivers[1]?.sender.track).toBe(first);
    // The queued call re-checks the guard and returns without acquiring, so
    // the second camera is never opened at all.
    expect(getUserMedia).toHaveBeenCalledTimes(2);
    void second;
  });

  it("omits the re-offer operations when signaling cannot renegotiate", async () => {
    const audio = new FakeTrack("audio");
    const basic = signaling();
    delete (basic as { renegotiate?: unknown }).renegotiate;
    const session = await factoryFor({
      peer: peerConnection(),
      signaling: basic,
      getUserMedia: vi.fn().mockResolvedValue(new FakeStream([audio])),
    }).open("call-1", false, callbacks, new AbortController().signal);

    // Present but rejecting, these satisfied the controller's optional-method
    // guards and failed into handlers that swallow the reason.
    expect(session.enableVideo).toBeUndefined();
    expect(session.restartIce).toBeUndefined();
  });

  it("rolls the camera back when the upgrade re-offer fails", async () => {
    const audio = new FakeTrack("audio");
    const local = new FakeStream([audio]);
    const camera = new FakeTrack("video");
    const getUserMedia = vi
      .fn()
      .mockResolvedValueOnce(local)
      .mockResolvedValueOnce(new FakeStream([camera]));
    const peer = peerConnection();
    const s = signaling({
      renegotiate: vi.fn(async () => {
        throw new Error("re-offer rejected");
      }),
    } as never);
    const session = await factoryFor({
      peer,
      signaling: s,
      getUserMedia,
    }).open("call-1", false, callbacks, new AbortController().signal);

    await expect(
      session.enableVideo?.(new AbortController().signal),
    ).rejects.toThrow("re-offer rejected");
    expect(camera.stop).toHaveBeenCalled();
    expect(local.getVideoTracks()).toHaveLength(0);
    // The camera transceiver stays, without a track.
    expect(peer.transceivers[1]?.sender.track).toBeNull();
    // The audio call survives and the upgrade can be tried again.
    expect(local.getAudioTracks()).toHaveLength(1);
  });
});

describe("WebRtcMediaFactory transceivers and video sources", () => {
  async function opened(
    options: {
      video?: boolean;
      signaling?: CallsSignaling;
      videoSlots?: number;
      maxVideoSlots?: number;
      onRemoteVideos?: (videos: readonly RemoteVideo[]) => void;
      connectionId?: string;
    } = {},
  ) {
    const peer = peerConnection();
    const audio = new FakeTrack("audio");
    const camera = new FakeTrack("video");
    const local = new FakeStream(
      options.video === true ? [audio, camera] : [audio],
    );
    const s = options.signaling ?? signaling();
    const factory = new WebRtcMediaFactory({
      signaling: s,
      mediaDevices: {
        getUserMedia: vi.fn(async () => local),
      } as unknown as MediaDevices,
      createPeerConnection: () => peer,
      setInterval: (() => 0) as never,
      clearInterval: (() => undefined) as never,
      ...(options.videoSlots === undefined
        ? {}
        : { videoSlots: options.videoSlots }),
      ...(options.maxVideoSlots === undefined
        ? {}
        : { maxVideoSlots: options.maxVideoSlots }),
    });
    const session = await factory.open(
      "call-1",
      options.video === true,
      {
        ...callbacks,
        ...(options.onRemoteVideos === undefined
          ? {}
          : { onRemoteVideos: options.onRemoteVideos }),
      },
      new AbortController().signal,
      options.connectionId === undefined
        ? {}
        : { connectionId: options.connectionId },
    );
    return { peer, session, signaling: s, audio, camera };
  }

  it("offers audio, a negotiated control channel, the camera and three receive slots", async () => {
    const {
      peer,
      session,
      signaling: s,
      camera,
    } = await opened({
      video: true,
      connectionId: "tab-conn-0001",
    });
    expect(peer.createDataChannel).toHaveBeenCalledWith("pmfa.calls", {
      negotiated: true,
      id: 0,
    });
    expect(
      peer.transceivers.map((t) => [t.receiver.track.kind, t.direction]),
    ).toEqual([
      ["audio", "sendrecv"],
      ["video", "sendrecv"],
      ["video", "recvonly"],
      ["video", "recvonly"],
      ["video", "recvonly"],
    ]);
    expect(peer.transceivers[1]?.sender.track).toBe(camera);
    expect(session.connectionId).toBe("tab-conn-0001");
    expect(s["offer"]).toHaveBeenCalledWith(
      "call-1",
      { sdp: "v=0", connectionId: "tab-conn-0001" },
      expect.any(AbortSignal),
    );
  });

  it("keeps a camera transceiver on audio calls and honours the slot option", async () => {
    const { peer, session } = await opened({ videoSlots: 1 });
    expect(peer.transceivers.map((t) => t.direction)).toEqual([
      "sendrecv",
      "sendrecv",
      "recvonly",
    ]);
    expect(peer.transceivers[1]?.sender.track).toBeNull();
    // A generated connection id follows the contract.
    expect(session.connectionId).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
  });

  it("sends candidates with the connection id over REST", async () => {
    const { peer, signaling: s, session } = await opened();
    peer.onicecandidate?.({
      candidate: { toJSON: () => ({ candidate: "candidate:7", sdpMid: "0" }) },
    } as unknown as RTCPeerConnectionIceEvent);
    expect(s["candidate"]).toHaveBeenCalledWith(
      "call-1",
      { candidate: "candidate:7", sdpMid: "0" },
      session.connectionId,
      expect.any(AbortSignal),
    );
  });

  it("maps video_source and video_source_removed to per-participant streams", async () => {
    const seen: (readonly RemoteVideo[])[] = [];
    const { peer, session } = await opened({
      onRemoteVideos: (videos) => seen.push(videos),
    });
    const participant = {
      id: "123",
      phoneNumber: "+15550100",
      audioMuted: false,
      video: true,
      state: "connected",
    };
    control(peer, {
      type: "video_source",
      source: 4,
      mid: "1",
      participant,
    });
    control(peer, {
      type: "video_source",
      source: 9,
      mid: "2",
      connectionId: "peer-conn-1",
      connectionParticipant: "client:tab-2",
    });
    // Unknown mids and malformed frames are ignored.
    control(peer, {
      type: "video_source",
      source: 5,
      mid: "77",
      connectionId: "peer-conn-2",
    });
    control(peer, { type: "video_source", source: 6, mid: "3" });
    expect(seen).toHaveLength(2);
    const videos = session.remoteVideos ?? [];
    expect(videos.map((v) => [v.key, v.source, v.mid])).toEqual([
      ["participant:123", 4, "1"],
      ["connection:peer-conn-1", 9, "2"],
    ]);
    expect(videos[0]?.participant).toEqual(participant);
    expect(videos[1]?.connectionId).toBe("peer-conn-1");
    expect(videos[1]?.connectionParticipant).toBe("client:tab-2");
    // A connection source cannot also name a WhatsApp participant.
    control(peer, {
      type: "video_source",
      source: 12,
      mid: "3",
      participant,
      connectionParticipant: "client:x",
    });
    expect(session.remoteVideos).toHaveLength(2);
    // Each source has its own stream carrying its transceiver's track.
    expect((videos[1]?.stream as unknown as FakeStream).getTracks()).toEqual([
      peer.transceivers[2]?.receiver.track,
    ]);

    // A removal for the wrong mid is ignored; the right one removes the tile.
    control(peer, { type: "video_source_removed", source: 9, mid: "1" });
    expect(session.remoteVideos).toHaveLength(2);
    control(peer, { type: "video_source_removed", source: 9, mid: "2" });
    expect(session.remoteVideos?.map((v) => v.source)).toEqual([4]);

    // A new source on a reused slot replaces the old one.
    control(peer, {
      type: "video_source",
      source: 11,
      mid: "1",
      connectionId: "peer-conn-3",
    });
    expect(session.remoteVideos?.map((v) => v.key)).toEqual([
      "connection:peer-conn-3",
    ]);
  });

  it("adds receive slots and renegotiates when the platform runs out", async () => {
    const { peer, signaling: s } = await opened({ maxVideoSlots: 6 });
    const videoSlots = () =>
      peer.transceivers.filter((t) => t.receiver.track.kind === "video").length;
    expect(videoSlots()).toBe(4);
    control(peer, { type: "video_slots_exhausted", slots: 4, needed: 5 });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(videoSlots()).toBe(5);
    expect(peer.transceivers.at(-1)?.direction).toBe("recvonly");
    expect(s["renegotiate"]).toHaveBeenCalledTimes(1);
    expect(s["renegotiate"]).toHaveBeenCalledWith(
      "call-1",
      expect.objectContaining({ connectionId: expect.any(String) }),
      expect.any(AbortSignal),
    );
    // Bounded: asking for more than the ceiling adds up to the ceiling only.
    control(peer, { type: "video_slots_exhausted", slots: 5, needed: 40 });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(videoSlots()).toBe(6);
    expect(s["renegotiate"]).toHaveBeenCalledTimes(2);
    // Reports at or below the offered count do nothing.
    control(peer, { type: "video_slots_exhausted", slots: 6, needed: 40 });
    control(peer, { type: "video_slots_exhausted", slots: 5, needed: 5 });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(videoSlots()).toBe(6);
    expect(s["renegotiate"]).toHaveBeenCalledTimes(2);
  });

  it("does not add slots when signaling cannot renegotiate", async () => {
    const basic = signaling();
    delete (basic as { renegotiate?: unknown }).renegotiate;
    const { peer } = await opened({ signaling: basic });
    control(peer, { type: "video_slots_exhausted", slots: 4, needed: 6 });
    expect(peer.transceivers).toHaveLength(5);
  });

  it("leaves the connection on close unless told not to", async () => {
    const first = await opened();
    await first.session.close();
    expect(first.signaling["leave"]).toHaveBeenCalledWith(
      "call-1",
      first.session.connectionId,
    );
    expect(first.signaling["end"]).not.toHaveBeenCalled();
    expect(first.peer.close).toHaveBeenCalled();

    const second = await opened();
    await second.session.close({ leave: false });
    expect(second.signaling["leave"]).not.toHaveBeenCalled();
    expect(second.signaling["end"]).not.toHaveBeenCalled();
  });
});
