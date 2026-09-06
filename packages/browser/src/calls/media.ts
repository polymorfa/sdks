import type {
  CallsSignaling,
  SdpAnswer,
  TrickleCandidate,
} from "./signaling.js";
import type { CallDevice, SelectedCallDevices } from "./controller.js";

export interface CallMediaCallbacks {
  readonly onConnectionState: (state: RTCPeerConnectionState) => void;
  readonly onRemoteStream: (stream: MediaStream) => void;
  /** ICE connection state (drives the resumption window). Optional. */
  readonly onIceConnectionState?: (state: RTCIceConnectionState) => void;
}

/**
 * A push channel for ICE candidates (the calls WebSocket). When `send`
 * returns true the candidate travelled over it and REST is skipped; remote
 * candidates arrive through `onCandidate` and REST polling pauses while
 * `connected` is true.
 */
export interface CandidateTransport {
  readonly connected: boolean;
  sendCandidate(callId: string, candidate: TrickleCandidate): boolean;
  onCandidate(
    listener: (callId: string, candidate: TrickleCandidate) => void,
  ): () => void;
}
export interface CallMediaSession {
  readonly localStream: MediaStream;
  readonly remoteStream: MediaStream;
  setMuted(muted: { readonly audio?: boolean; readonly video?: boolean }): void;
  audioEnabled(): boolean;
  videoEnabled(): boolean;
  /**
   * Add an outgoing camera track to an audio call and renegotiate on the
   * same connection. Optional for fakes and for signaling without
   * `renegotiate`.
   */
  enableVideo?(
    signal: AbortSignal,
    devices?: SelectedCallDevices,
  ): Promise<void>;
  /** Re-offer with fresh ICE credentials after a network change. Optional for fakes. */
  restartIce?(signal: AbortSignal): Promise<void>;
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
  /** Calls WebSocket for ICE; REST stays the fallback while it is down. */
  readonly candidateTransport?: CandidateTransport;
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
  readonly #candidateTransport: CandidateTransport | undefined;
  readonly #mediaDevices: MediaDevices;
  readonly #createPeer: (configuration?: RTCConfiguration) => RTCPeerConnection;
  readonly #pollIntervalMs: number;
  readonly #setInterval: typeof globalThis.setInterval;
  readonly #clearInterval: typeof globalThis.clearInterval;

  constructor(options: WebRtcMediaFactoryOptions) {
    this.#signaling = options.signaling;
    this.#candidateTransport = options.candidateTransport;
    this.#mediaDevices = options.mediaDevices ?? navigator.mediaDevices;
    this.#createPeer =
      options.createPeerConnection ??
      ((configuration) => new RTCPeerConnection(configuration));
    this.#pollIntervalMs = options.pollIntervalMs ?? 1_000;
    this.#setInterval =
      options.setInterval ?? globalThis.setInterval.bind(globalThis);
    this.#clearInterval =
      options.clearInterval ?? globalThis.clearInterval.bind(globalThis);
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
    const transport = this.#candidateTransport;
    peer.onicecandidate = (event) => {
      if (event.candidate === null) return;
      const candidate = candidateFrom(event.candidate.toJSON());
      if (transport?.sendCandidate(callId, candidate) === true) return;
      void this.#signaling
        .candidate(callId, candidate, signal)
        .catch(() => undefined);
    };
    // The transport is subscribed before the answer arrives so no pushed
    // candidate is missed, but `addIceCandidate` rejects until the remote
    // description exists — and REST polling stands down while the socket is
    // up, so a rejected candidate would never be retried. Hold them instead.
    let remoteDescribed = false;
    const pendingCandidates: TrickleCandidate[] = [];
    const unsubscribeCandidates = transport?.onCandidate((id, candidate) => {
      if (id !== callId) return;
      if (!remoteDescribed) {
        pendingCandidates.push(candidate);
        return;
      }
      void peer.addIceCandidate(candidate).catch(() => undefined);
    });
    peer.ontrack = (event) => {
      remote.addTrack(event.track);
      callbacks.onRemoteStream(remote);
    };
    peer.onconnectionstatechange = () =>
      callbacks.onConnectionState(peer.connectionState);
    peer.oniceconnectionstatechange = () =>
      callbacks.onIceConnectionState?.(peer.iceConnectionState);
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
      remoteDescribed = true;
      for (const candidate of pendingCandidates.splice(0))
        void peer.addIceCandidate(candidate).catch(() => undefined);
    } catch (cause) {
      unsubscribeCandidates?.();
      closePeer(peer, local);
      throw cause;
    }
    let closed = false;
    let negotiating: Promise<void> = Promise.resolve();
    const renegotiate = (
      options: RTCOfferOptions,
      renegotiateSignal: AbortSignal,
    ): Promise<void> => {
      const run = async () => {
        const renegotiateWith = this.#signaling.renegotiate;
        if (renegotiateWith === undefined)
          throw new Error("Signaling does not support renegotiation.");
        throwIfAborted(renegotiateSignal);
        const offer = await peer.createOffer(options);
        await peer.setLocalDescription(offer);
        try {
          const answer = await renegotiateWith.call(
            this.#signaling,
            callId,
            peer.localDescription?.sdp ?? offer.sdp ?? "",
            renegotiateSignal,
          );
          if (closed) return;
          await peer.setRemoteDescription({ type: "answer", sdp: answer.sdp });
        } catch (cause) {
          // Without this the peer is stranded in `have-local-offer`, and every
          // later upgrade or ICE restart fails on the leftover offer rather
          // than on its own merits.
          if (!closed)
            await peer
              .setLocalDescription({ type: "rollback" })
              .catch(() => undefined);
          throw cause;
        }
      };
      negotiating = negotiating.catch(() => undefined).then(run);
      return negotiating;
    };
    const switching = new Map<"audio" | "video", Promise<void>>();
    const swap = async (
      kind: "audio" | "video",
      deviceId: string,
      switchSignal: AbortSignal,
    ): Promise<void> => {
      throwIfAborted(switchSignal);
      const stream = await this.#mediaDevices.getUserMedia(
        kind === "audio"
          ? { audio: { deviceId: { ideal: deviceId } } }
          : { video: { deviceId: { ideal: deviceId } } },
      );
      // The call may have ended while the device was being acquired.
      if (closed || switchSignal.aborted) {
        stopTracks(stream);
        return;
      }
      const track =
        kind === "audio"
          ? stream.getAudioTracks()[0]
          : stream.getVideoTracks()[0];
      if (track === undefined) return;
      const old = local.getTracks().find((t) => t.kind === kind);
      const sender = peer.getSenders().find((s) => s.track?.kind === kind);
      if (sender === undefined && old === undefined) {
        // Nothing of this kind is negotiated — an audio-only call being
        // asked to switch camera. Keeping the track would satisfy
        // `enableVideo`'s "already have video" guard and permanently block
        // the upgrade that would actually negotiate it.
        stopTracks(stream);
        return;
      }
      if (old !== undefined) track.enabled = old.enabled;
      if (sender !== undefined) {
        try {
          await sender.replaceTrack(track);
        } catch (cause) {
          stopTracks(stream);
          throw cause;
        }
        // `close()` can land during the replacement; adopting the track now
        // would add it to a stream `closePeer` has already emptied.
        if (closed || switchSignal.aborted) {
          stopTracks(stream);
          return;
        }
      }
      if (old !== undefined) {
        old.stop();
        local.removeTrack(old);
      }
      local.addTrack(track);
    };

    let upgrading: Promise<void> = Promise.resolve();
    const upgrade = async (
      enableSignal: AbortSignal,
      devices: SelectedCallDevices | undefined,
    ): Promise<void> => {
      throwIfAborted(enableSignal);
      if (local.getVideoTracks().length > 0) return;
      // `preferences` was captured when the call opened. A camera chosen
      // since then lives on the controller, so it is passed in here — an
      // audio-only call has no video sender for `switchInput` to swap.
      const stream = await this.#mediaDevices.getUserMedia(
        constraintsFor(true, devices ?? preferences.devices, {
          audio: false,
        }),
      );
      if (closed || enableSignal.aborted) {
        stopTracks(stream);
        return;
      }
      const track = stream.getVideoTracks()[0];
      if (track === undefined) return;
      local.addTrack(track);
      const sender = peer.addTrack(track, local);
      try {
        await renegotiate({}, enableSignal);
      } catch (cause) {
        // Leaving the track behind would trip the guard above and make the
        // upgrade unretryable, so undo it before surfacing the failure.
        try {
          peer.removeTrack(sender);
        } catch {
          // The connection may already be closed; the track still goes.
        }
        local.removeTrack(track);
        track.stop();
        throw cause;
      }
    };

    const poll = this.#setInterval(() => {
      // The socket delivers remote candidates while it is up.
      if (transport?.connected === true) return;
      void drainCandidates(this.#signaling, callId, peer, signal);
    }, this.#pollIntervalMs);
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
      // Same-kind switches run one at a time. Concurrently, an older
      // acquisition could finish after a newer one and replace the live track
      // with the device the user moved away from, leaving the capture behind
      // the preference that names it. Serialized, the last request wins.
      switchInput: (kind, deviceId, switchSignal) => {
        const run = (switching.get(kind) ?? Promise.resolve()).then(() =>
          swap(kind, deviceId, switchSignal),
        );
        switching.set(
          kind,
          run.catch(() => undefined),
        );
        return run;
      },
      // Serialized like switchInput: the "already have video" guard sits
      // before the getUserMedia await, so two overlapping calls both passed it
      // and left the connection with two camera tracks and two senders. Queued,
      // the second re-checks the guard after the first has added its track.
      // Both need a re-offer, so signaling that cannot renegotiate does not
      // get them at all. Present but failing, they left the controller's
      // optional-method guards satisfied and the operations rejecting into
      // handlers that swallow the reason — a dead camera button.
      ...(this.#signaling.renegotiate === undefined
        ? {}
        : {
            enableVideo: (
              enableSignal: AbortSignal,
              devices?: SelectedCallDevices,
            ) => {
              const run = upgrading.then(() => upgrade(enableSignal, devices));
              upgrading = run.catch(() => undefined);
              return run;
            },
            restartIce: (restartSignal: AbortSignal) =>
              renegotiate({ iceRestart: true }, restartSignal),
          }),
      close: async () => {
        if (closed) return;
        closed = true;
        this.#clearInterval(poll);
        unsubscribeCandidates?.();
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
  options: { readonly audio?: boolean } = {},
): MediaStreamConstraints {
  const audioInput = devices?.audioInput;
  const videoInput = devices?.videoInput;
  return {
    audio:
      options.audio === false
        ? false
        : audioInput === undefined
          ? true
          : { deviceId: { ideal: audioInput } },
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
function stopTracks(stream: MediaStream): void {
  for (const track of stream.getTracks()) track.stop();
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
  peer.oniceconnectionstatechange = null;
  for (const track of stream.getTracks()) track.stop();
  peer.close();
}
function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted)
    throw signal.reason ?? new DOMException("Aborted", "AbortError");
}
