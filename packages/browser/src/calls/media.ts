import type {
  CallsSignaling,
  SdpAnswer,
  TrickleCandidate,
} from "./signaling.js";
import type { CallDevice, SelectedCallDevices } from "./controller.js";

export interface CallMediaCallbacks {
  readonly onConnectionState: (state: RTCPeerConnectionState) => void;
  readonly onRemoteStream: (stream: MediaStream) => void;
}
export interface CallMediaSession {
  readonly localStream: MediaStream;
  readonly remoteStream: MediaStream;
  setMuted(muted: { readonly audio?: boolean; readonly video?: boolean }): void;
  audioEnabled(): boolean;
  videoEnabled(): boolean;
  /**
   * Swap the live capture device: acquires `deviceId` and replaces the
   * outgoing track in place (mute state carries over). Optional for fakes.
   */
  switchInput?(
    kind: "audio" | "video",
    deviceId: string,
    signal: AbortSignal,
  ): Promise<void>;
  close(): Promise<void>;
}
export interface CallMediaPreferences {
  readonly devices?: SelectedCallDevices;
}
export interface CallMediaFactory {
  open(
    callId: string,
    video: boolean,
    callbacks: CallMediaCallbacks,
    signal: AbortSignal,
    preferences?: CallMediaPreferences,
  ): Promise<CallMediaSession>;
  /** Enumerate capture/playback devices. Optional for fakes. */
  listDevices?(): Promise<readonly CallDevice[]>;
}
export interface WebRtcMediaFactoryOptions {
  readonly signaling: CallsSignaling;
  readonly mediaDevices?: MediaDevices;
  readonly createPeerConnection?: (
    configuration?: RTCConfiguration,
  ) => RTCPeerConnection;
  readonly pollIntervalMs?: number;
  readonly setInterval?: typeof globalThis.setInterval;
  readonly clearInterval?: typeof globalThis.clearInterval;
}

export class WebRtcMediaFactory implements CallMediaFactory {
  readonly #signaling: CallsSignaling;
  readonly #mediaDevices: MediaDevices;
  readonly #createPeer: (configuration?: RTCConfiguration) => RTCPeerConnection;
  readonly #pollIntervalMs: number;
  readonly #setInterval: typeof globalThis.setInterval;
  readonly #clearInterval: typeof globalThis.clearInterval;

  constructor(options: WebRtcMediaFactoryOptions) {
    this.#signaling = options.signaling;
    this.#mediaDevices = options.mediaDevices ?? navigator.mediaDevices;
    this.#createPeer =
      options.createPeerConnection ??
      ((configuration) => new RTCPeerConnection(configuration));
    this.#pollIntervalMs = options.pollIntervalMs ?? 1_000;
    this.#setInterval = options.setInterval ?? globalThis.setInterval;
    this.#clearInterval = options.clearInterval ?? globalThis.clearInterval;
  }

  async listDevices(): Promise<readonly CallDevice[]> {
    const devices = await this.#mediaDevices.enumerateDevices();
    return devices
      .filter((device) =>
        ["audioinput", "videoinput", "audiooutput"].includes(device.kind),
      )
      .map((device) => ({
        deviceId: device.deviceId,
        kind: device.kind as CallDevice["kind"],
        label: device.label,
      }));
  }

  async open(
    callId: string,
    video: boolean,
    callbacks: CallMediaCallbacks,
    signal: AbortSignal,
    preferences: CallMediaPreferences = {},
  ): Promise<CallMediaSession> {
    throwIfAborted(signal);
    const local = await this.#mediaDevices.getUserMedia(
      constraintsFor(video, preferences.devices),
    );
    if (signal.aborted) {
      for (const track of local.getTracks()) track.stop();
      throw signal.reason;
    }
    const peer = this.#createPeer();
    const remote = new MediaStream();
    for (const track of local.getTracks()) peer.addTrack(track, local);
    peer.onicecandidate = (event) => {
      if (event.candidate === null) return;
      void this.#signaling
        .candidate(callId, candidateFrom(event.candidate.toJSON()), signal)
        .catch(() => undefined);
    };
    peer.ontrack = (event) => {
      remote.addTrack(event.track);
      callbacks.onRemoteStream(remote);
    };
    peer.onconnectionstatechange = () =>
      callbacks.onConnectionState(peer.connectionState);
    try {
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      const answer = await this.#signaling.offer(
        callId,
        peer.localDescription?.sdp ?? offer.sdp ?? "",
        signal,
      );
      applyIceServers(peer, answer);
      await peer.setRemoteDescription({ type: "answer", sdp: answer.sdp });
    } catch (cause) {
      closePeer(peer, local);
      throw cause;
    }
    let closed = false;
    const poll = this.#setInterval(
      () => void drainCandidates(this.#signaling, callId, peer, signal),
      this.#pollIntervalMs,
    );
    return {
      localStream: local,
      remoteStream: remote,
      setMuted: (muted) => {
        if (muted.audio !== undefined)
          setTracks(local.getAudioTracks(), !muted.audio);
        if (muted.video !== undefined)
          setTracks(local.getVideoTracks(), !muted.video);
      },
      audioEnabled: () => local.getAudioTracks().some(({ enabled }) => enabled),
      videoEnabled: () => local.getVideoTracks().some(({ enabled }) => enabled),
      switchInput: async (kind, deviceId, switchSignal) => {
        throwIfAborted(switchSignal);
        const stream = await this.#mediaDevices.getUserMedia(
          kind === "audio"
            ? { audio: { deviceId: { ideal: deviceId } } }
            : { video: { deviceId: { ideal: deviceId } } },
        );
        const track =
          kind === "audio"
            ? stream.getAudioTracks()[0]
            : stream.getVideoTracks()[0];
        if (track === undefined) return;
        const old = local.getTracks().find((t) => t.kind === kind);
        if (old !== undefined) track.enabled = old.enabled;
        const sender = peer.getSenders().find((s) => s.track?.kind === kind);
        if (sender !== undefined) await sender.replaceTrack(track);
        if (old !== undefined) {
          old.stop();
          local.removeTrack(old);
        }
        local.addTrack(track);
      },
      close: async () => {
        if (closed) return;
        closed = true;
        this.#clearInterval(poll);
        closePeer(peer, local);
        try {
          await this.#signaling.teardown(callId);
        } catch {
          // Local media teardown must complete even when remote teardown fails.
        }
      },
    };
  }
}

function constraintsFor(
  video: boolean,
  devices: SelectedCallDevices | undefined,
): MediaStreamConstraints {
  const audioInput = devices?.audioInput;
  const videoInput = devices?.videoInput;
  return {
    audio:
      audioInput === undefined ? true : { deviceId: { ideal: audioInput } },
    video: video
      ? videoInput === undefined
        ? true
        : { deviceId: { ideal: videoInput } }
      : false,
  };
}

function candidateFrom(candidate: RTCIceCandidateInit): TrickleCandidate {
  return {
    candidate: candidate.candidate ?? "",
    ...(candidate.sdpMid == null ? {} : { sdpMid: candidate.sdpMid }),
    ...(candidate.sdpMLineIndex == null
      ? {}
      : { sdpMLineIndex: candidate.sdpMLineIndex }),
  };
}
function applyIceServers(peer: RTCPeerConnection, answer: SdpAnswer): void {
  peer.setConfiguration({
    iceServers: answer.iceServers.map((server) => ({
      ...server,
      urls: typeof server.urls === "string" ? server.urls : [...server.urls],
    })),
  });
}
async function drainCandidates(
  signaling: CallsSignaling,
  callId: string,
  peer: RTCPeerConnection,
  signal: AbortSignal,
): Promise<void> {
  try {
    for (const candidate of await signaling.candidates(callId, signal)) {
      try {
        await peer.addIceCandidate(candidate);
      } catch {
        // Ignore stale candidates and continue draining.
      }
    }
  } catch {
    // Polling retries on the next interval.
  }
}
function setTracks(
  tracks: readonly MediaStreamTrack[],
  enabled: boolean,
): void {
  for (const track of tracks) track.enabled = enabled;
}
function closePeer(peer: RTCPeerConnection, stream: MediaStream): void {
  peer.onicecandidate = null;
  peer.ontrack = null;
  peer.onconnectionstatechange = null;
  for (const track of stream.getTracks()) track.stop();
  peer.close();
}
function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted)
    throw signal.reason ?? new DOMException("Aborted", "AbortError");
}
