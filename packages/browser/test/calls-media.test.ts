import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  WebRtcMediaFactory,
  type CallMediaCallbacks,
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

function peerConnection(overrides: Partial<Record<string, unknown>> = {}) {
  const senders: {
    track: FakeTrack | null;
    replaceTrack?: (track: FakeTrack) => Promise<void>;
  }[] = [];
  const peer = {
    connectionState: "new",
    iceConnectionState: "new",
    senders,
    addIceCandidate: vi.fn(async () => undefined),
    addTrack: vi.fn((track: FakeTrack) => {
      const sender = {
        track,
        replaceTrack: async (next: FakeTrack) => {
          sender.track = next;
        },
      };
      senders.push(sender);
      return sender;
    }),
    removeTrack: vi.fn((sender: { track: FakeTrack | null }) => {
      const index = senders.indexOf(sender);
      if (index >= 0) senders.splice(index, 1);
    }),
    getSenders: () => [...senders],
    createOffer: vi.fn(async () => ({ type: "offer", sdp: "v=0" })),
    setLocalDescription: vi.fn(async () => undefined),
    setRemoteDescription: vi.fn(async () => undefined),
    localDescription: { sdp: "v=0" },
    setConfiguration: vi.fn(),
    close: vi.fn(),
    ...overrides,
  };
  return peer as unknown as RTCPeerConnection & typeof peer;
}

function signaling(
  overrides: Partial<CallsSignaling> = {},
): CallsSignaling & Record<string, ReturnType<typeof vi.fn>> {
  return {
    offer: vi.fn(async () => ({ sdp: "v=0", iceServers: [] })),
    renegotiate: vi.fn(async () => ({ sdp: "v=0", iceServers: [] })),
    candidate: vi.fn(async () => undefined),
    candidates: vi.fn(async () => []),
    teardown: vi.fn(async () => undefined),
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
  it("does not keep a camera track that no sender carries", async () => {
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
    // Retaining it would satisfy enableVideo's guard and strand the upgrade.
    expect(camera.stop).toHaveBeenCalled();
    expect(local.getVideoTracks()).toHaveLength(0);
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
    expect(peer.removeTrack).toHaveBeenCalled();
    // The audio call survives and the upgrade can be tried again.
    expect(local.getAudioTracks()).toHaveLength(1);
  });
});
