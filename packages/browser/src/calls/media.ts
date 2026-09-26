import {
  MediaStateCommands,
  parseMediaControlValue,
  type MediaStateReply,
  parseMediaControl,
  type MediaControlFrame,
  createConnectionId,
  isConnectionId,
  isParticipant,
  isSourceHandle,
  type Participant,
} from "@polymorfa/sdk/calls/internal";
import type {
  CallsSignaling,
  SdpAnswer,
  TrickleCandidate,
} from "./signaling.js";
import type { CallDevice, SelectedCallDevices } from "./controller.js";

/** Label and id of the control data channel, negotiated out of band. */
export const CALLS_DATA_CHANNEL = { label: "pmfa.calls", id: 0 } as const;
/** Receive-only video transceivers offered up front. */
export const DEFAULT_VIDEO_SLOTS = 3;
/** Upper bound on video transceivers per connection (camera included). */
export const MAX_VIDEO_SLOTS = 32;

/** One remote participant's video, delivered on its own transceiver. */
export interface RemoteVideo {
  /**
   * Stable key for rendering: `connection:<id>` for another media connection,
   * `participant:<id>` for a WhatsApp participant.
   */
  readonly key: string;
  /** Platform source handle. */
  readonly source: number;
  readonly mid: string;
  readonly connectionId?: string;
  /** Participant reference of that connection (`client:<id>` or `server:<name>`), when known. */
  readonly connectionParticipant?: string;
  readonly participant?: Participant;
  readonly stream: MediaStream;
}

/** Data-channel messages the platform sends. */
export type CallsDataChannelMessage =
  | MediaStateReply
  | { readonly type: "remote_media"; readonly audioMuted: boolean | null }
  | ({
      readonly type: "video_source";
      readonly source: number;
      readonly mid: string;
    } & (
      | {
          readonly connectionId: string;
          readonly connectionParticipant?: string;
          readonly participant?: undefined;
        }
      | {
          readonly participant: Participant;
          readonly connectionId?: undefined;
          readonly connectionParticipant?: undefined;
        }
    ))
  | {
      readonly type: "video_source_removed";
      readonly source: number;
      readonly mid: string;
    }
  | {
      readonly type: "video_slots_exhausted";
      readonly slots: number;
      readonly needed: number;
    }
  | { readonly type: "pong" };

/** Validate one data-channel message; malformed messages yield `undefined`. */
export function parseDataChannelMessage(
  data: unknown,
): CallsDataChannelMessage | undefined {
  if (typeof data !== "string" || data.length > 4096) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    return undefined;
  }
  if (parsed === null || typeof parsed !== "object") return undefined;
  const m = parsed as Record<string, unknown>;
  const mid = typeof m["mid"] === "string" && m["mid"].length > 0;
  switch (m["type"]) {
    case "media_state":
    case "media_error":
    case "remote_media":
      return parseMediaControlValue(parsed) as
        CallsDataChannelMessage | undefined;
    case "video_source": {
      if (!isSourceHandle(m["source"]) || !mid) return undefined;
      const connectionParticipant = m["connectionParticipant"];
      const byConnection =
        isConnectionId(m["connectionId"]) &&
        (connectionParticipant === undefined ||
          typeof connectionParticipant === "string") &&
        m["participant"] === undefined;
      const byParticipant =
        isParticipant(m["participant"]) &&
        m["connectionId"] === undefined &&
        connectionParticipant === undefined;
      return byConnection || byParticipant
        ? (parsed as CallsDataChannelMessage)
        : undefined;
    }
    case "video_source_removed":
      return isSourceHandle(m["source"]) && mid
        ? (parsed as CallsDataChannelMessage)
        : undefined;
    case "video_slots_exhausted":
      return Number.isInteger(m["slots"]) && Number.isInteger(m["needed"])
        ? (parsed as CallsDataChannelMessage)
        : undefined;
    case "pong":
      return parsed as CallsDataChannelMessage;
    default:
      return undefined;
  }
}

export interface CallMediaCallbacks {
  readonly onScreenSharing?: (sharing: boolean) => void;
  readonly onRemoteMute?: (muted: boolean | null) => void;
  readonly onMediaControlError?: (cause: unknown) => void;
  readonly onControl?: (
    frame: Extract<
      MediaControlFrame,
      {
        type:
          | "reaction"
          | "hand_state"
          | "participant_joined"
          | "participant_state"
          | "participant_left";
      }
    >,
  ) => void;
  readonly onConnectionState: (state: RTCPeerConnectionState) => void;
  /** The merged call audio (and nothing else) arrived or changed. */
  readonly onRemoteStream: (stream: MediaStream) => void;
  /** ICE connection state (drives the resumption window). Optional. */
  readonly onIceConnectionState?: (state: RTCIceConnectionState) => void;
  /** Remote participant videos changed. Optional. */
  readonly onRemoteVideos?: (videos: readonly RemoteVideo[]) => void;
}

/**
 * A push channel for ICE candidates (the calls WebSocket). When `send`
 * returns true the candidate travelled over it and REST is skipped; remote
 * candidates arrive through `onCandidate` and REST polling pauses while
 * `connected` is true.
 */
export interface CandidateTransport {
  readonly connected: boolean;
  sendCandidate(
    callId: string,
    candidate: TrickleCandidate,
    connectionId: string,
  ): boolean;
  onCandidate(
    listener: (
      callId: string,
      candidate: TrickleCandidate,
      connectionId?: string,
    ) => void,
  ): () => void;
}
export interface CallMediaSession {
  /** This connection's id; reused for reconnects and sent with `leave`. */
  readonly connectionId?: string;
  readonly localStream: MediaStream;
  /** Merged call audio. */
  readonly remoteStream: MediaStream;
  /** One entry per remote video source. Optional for fakes. */
  readonly remoteVideos?: readonly RemoteVideo[];
  setMuted(muted: { readonly audio?: boolean; readonly video?: boolean }): void;
  /** Display capture replaces this connection's camera; never captures system audio. */
  startScreenShare?(signal: AbortSignal): Promise<void>;
  stopScreenShare?(): Promise<void>;
  readonly screenSharing?: boolean;
  audioEnabled(): boolean;
  videoEnabled(): boolean;
  /**
   * Start sending the camera on an audio call and renegotiate on the same
   * connection. Optional for fakes and for signaling without `renegotiate`.
   */
  enableVideo?(
    signal: AbortSignal,
    devices?: SelectedCallDevices,
  ): Promise<void>;
  /** The connection's WebRTC statistics, for diagnostics. Optional for fakes. */
  getStats?(): Promise<RTCStatsReport>;
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
  /**
   * Stop local media. With `leave` (the default) the connection is also left
   * on the platform; the call continues for everyone else.
   */
  close(options?: { readonly leave?: boolean }): Promise<void>;
}
export interface CallMediaPreferences {
  readonly devices?: SelectedCallDevices;
  /** Connection id to use; generated when omitted. */
  readonly connectionId?: string;
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
  /** Receive-only video transceivers offered up front. Default 3. */
  readonly videoSlots?: number;
  /**
   * Most video transceivers one connection may hold, camera included,
   * when the platform asks for more. Default 32.
   */
  readonly maxVideoSlots?: number;
  readonly setInterval?: typeof globalThis.setInterval;
  readonly clearInterval?: typeof globalThis.clearInterval;
}

export class WebRtcMediaFactory implements CallMediaFactory {
  readonly #signaling: CallsSignaling;
  readonly #candidateTransport: CandidateTransport | undefined;
  readonly #mediaDevices: MediaDevices;
  readonly #createPeer: (configuration?: RTCConfiguration) => RTCPeerConnection;
  readonly #pollIntervalMs: number;
  readonly #videoSlots: number;
  readonly #maxVideoSlots: number;
  readonly #setInterval: typeof globalThis.setInterval;
  readonly #clearInterval: typeof globalThis.clearInterval;

  constructor(options: WebRtcMediaFactoryOptions) {
    this.#signaling = options.signaling;
    this.#candidateTransport = options.candidateTransport;
    this.#mediaDevices = options.mediaDevices ?? navigator.mediaDevices;
    this.#createPeer =
      options.createPeerConnection ??
      ((configuration) => {
        if (typeof RTCPeerConnection === "undefined")
          throw unsupported("This browser does not support WebRTC calls.");
        return new RTCPeerConnection(configuration);
      });
    this.#pollIntervalMs = options.pollIntervalMs ?? 1_000;
    this.#maxVideoSlots = Math.max(
      1,
      Math.min(
        MAX_VIDEO_SLOTS,
        Math.floor(options.maxVideoSlots ?? MAX_VIDEO_SLOTS),
      ),
    );
    this.#videoSlots = Math.max(
      0,
      Math.min(
        this.#maxVideoSlots - 1,
        Math.floor(options.videoSlots ?? DEFAULT_VIDEO_SLOTS),
      ),
    );
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
    const connectionId = preferences.connectionId ?? createConnectionId();
    if (!isConnectionId(connectionId))
      throw new Error(
        "connectionId must be 8–64 characters of A–Z, a–z, 0–9, _ or -.",
      );
    if (typeof this.#mediaDevices?.getUserMedia !== "function")
      throw unsupported("This browser cannot capture a microphone or camera.");
    const local = await this.#mediaDevices.getUserMedia(
      constraintsFor(video, preferences.devices),
    );
    if (signal.aborted) {
      for (const track of local.getTracks()) track.stop();
      throw signal.reason;
    }
    callbacks.onRemoteMute?.(null);
    const peer = this.#createPeer();
    const remote = new MediaStream();
    // Transceiver order is part of the contract: audio, then the camera
    // (sendrecv, also a receive slot), then receive-only video slots.
    const control = peer.createDataChannel(CALLS_DATA_CHANNEL.label, {
      negotiated: true,
      id: CALLS_DATA_CHANNEL.id,
    });
    const mediaControls = new MediaStateCommands((frame) => {
      if (control.readyState !== "open") return false;
      control.send(JSON.stringify(frame));
      return true;
    });
    let screen:
      | {
          track: MediaStreamTrack;
          camera?: MediaStreamTrack;
          cameraEnabled: boolean;
          onEnded: () => void;
        }
      | undefined;
    let screenPending = false;
    const syncState = () =>
      mediaControls.set({
        audioMuted: !local.getAudioTracks().some(({ enabled }) => enabled),
        videoEnabled: local.getVideoTracks().some(({ enabled }) => enabled),
        screenSharing: screen !== undefined,
      });
    const failedControl = (cause: unknown) => {
      // Capture is local; a rejected or uncertain publish must not look live.
      setTracks(local.getVideoTracks(), false);
      callbacks.onMediaControlError?.(cause);
    };
    control.onopen = () => {
      void syncState().catch(failedControl);
    };
    peer.addTransceiver(local.getAudioTracks()[0] ?? "audio", {
      direction: "sendrecv",
      streams: [local],
    });
    const camera = peer.addTransceiver(local.getVideoTracks()[0] ?? "video", {
      direction: "sendrecv",
      streams: [local],
    });
    for (let i = 0; i < this.#videoSlots; i += 1)
      peer.addTransceiver("video", { direction: "recvonly" });

    const transport = this.#candidateTransport;
    const sendCandidate = (candidate: TrickleCandidate) => {
      if (transport?.sendCandidate(callId, candidate, connectionId) === true)
        return;
      void this.#signaling
        .candidate(callId, candidate, connectionId, signal)
        .catch(() => undefined);
    };
    // Gathering starts at setLocalDescription, but the platform has no media
    // session to take candidates until it answers the offer: one sent earlier
    // is refused as not ready and lost. Hold them until the answer.
    let answered = false;
    const localCandidates: TrickleCandidate[] = [];
    peer.onicecandidate = (event) => {
      if (event.candidate === null) return;
      const candidate = candidateFrom(event.candidate.toJSON());
      if (answered) sendCandidate(candidate);
      else localCandidates.push(candidate);
    };
    // Pushed candidates can arrive before the answer; addIceCandidate rejects
    // until the remote description exists, so hold them.
    let remoteDescribed = false;
    const pendingCandidates: TrickleCandidate[] = [];
    const unsubscribeCandidates = transport?.onCandidate(
      (id, candidate, forConnection) => {
        if (id !== callId) return;
        if (forConnection !== undefined && forConnection !== connectionId)
          return;
        if (!remoteDescribed) {
          pendingCandidates.push(candidate);
          return;
        }
        void peer.addIceCandidate(candidate).catch(() => undefined);
      },
    );
    peer.ontrack = (event) => {
      // Video tracks are exposed per source once the platform maps them.
      if (event.track.kind !== "audio") return;
      remote.addTrack(event.track);
      callbacks.onRemoteStream(remote);
    };
    peer.onconnectionstatechange = () =>
      callbacks.onConnectionState(peer.connectionState);
    peer.oniceconnectionstatechange = () =>
      callbacks.onIceConnectionState?.(peer.iceConnectionState);

    let closed = false;
    const videos = new Map<number, RemoteVideo>();
    const publishVideos = () => {
      if (!closed) callbacks.onRemoteVideos?.([...videos.values()]);
    };
    const videoTransceivers = () =>
      peer
        .getTransceivers()
        .filter(
          (t) =>
            t.receiver.track?.kind === "video" &&
            t.currentDirection !== "stopped",
        );
    const keyFor = (source: number, base: string) =>
      [...videos.values()].some((v) => v.key === base && v.source !== source)
        ? `${base}:${source}`
        : base;

    // Video receive slots the remote side has agreed to. Transceivers added
    // for a re-offer that failed are not counted until one succeeds.
    let negotiatedSlots = 0;
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
        const offered = videoTransceivers().length;
        const offer = await peer.createOffer(options);
        await peer.setLocalDescription(offer);
        try {
          const answer = await renegotiateWith.call(
            this.#signaling,
            callId,
            {
              sdp: peer.localDescription?.sdp ?? offer.sdp ?? "",
              connectionId,
            },
            renegotiateSignal,
          );
          if (closed) return;
          await peer.setRemoteDescription({ type: "answer", sdp: answer.sdp });
          negotiatedSlots = offered;
        } catch (cause) {
          // Without this the peer is stranded in `have-local-offer`.
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

    // The platform found more video sources than receive slots. Offer more,
    // up to the bound, so every participant can be seen. Only a successful
    // re-offer counts: after a failed one, the next report offers the
    // already-added slots again. One slot re-offer runs at a time; a report
    // that arrives meanwhile is handled when it settles.
    let slotsWanted = 0;
    let growing = false;
    const growSlots = (needed: number) => {
      if (this.#signaling.renegotiate === undefined || closed) return;
      slotsWanted = Math.max(
        slotsWanted,
        Math.min(this.#maxVideoSlots, Math.floor(needed)),
      );
      if (growing || slotsWanted <= negotiatedSlots) return;
      const add = slotsWanted - videoTransceivers().length;
      for (let i = 0; i < add; i += 1)
        peer.addTransceiver("video", { direction: "recvonly" });
      growing = true;
      void renegotiate({}, signal).then(
        () => {
          growing = false;
          // A larger report arrived while this re-offer ran.
          if (slotsWanted > negotiatedSlots) growSlots(slotsWanted);
        },
        () => {
          // Transient failure: wait for the platform to report again.
          growing = false;
          slotsWanted = negotiatedSlots;
        },
      );
    };

    control.onmessage = (event: MessageEvent) => {
      const social = parseMediaControl(event.data);
      if (
        !closed &&
        social !== undefined &&
        (social.type === "reaction" ||
          social.type === "hand_state" ||
          social.type === "participant_joined" ||
          social.type === "participant_state" ||
          social.type === "participant_left")
      ) {
        callbacks.onControl?.(social);
        return;
      }
      const message = parseDataChannelMessage(event.data);
      if (message === undefined || closed) return;
      switch (message.type) {
        case "media_state":
        case "media_error":
          mediaControls.receive(message);
          return;
        case "remote_media":
          callbacks.onRemoteMute?.(message.audioMuted);
          return;
        case "video_source": {
          const transceiver = peer
            .getTransceivers()
            .find((t) => t.mid === message.mid);
          const track = transceiver?.receiver.track;
          if (track === undefined || track.kind !== "video") return;
          for (const [handle, existing] of videos)
            if (existing.mid === message.mid && handle !== message.source)
              videos.delete(handle);
          const base =
            message.connectionId !== undefined
              ? `connection:${message.connectionId}`
              : `participant:${message.participant.id}`;
          videos.set(message.source, {
            key: keyFor(message.source, base),
            source: message.source,
            mid: message.mid,
            ...(message.connectionId !== undefined
              ? {
                  connectionId: message.connectionId,
                  ...(message.connectionParticipant === undefined
                    ? {}
                    : {
                        connectionParticipant: message.connectionParticipant,
                      }),
                }
              : { participant: message.participant }),
            stream: new MediaStream([track]),
          });
          publishVideos();
          return;
        }
        case "video_source_removed": {
          const existing = videos.get(message.source);
          if (existing === undefined || existing.mid !== message.mid) return;
          videos.delete(message.source);
          publishVideos();
          return;
        }
        case "video_slots_exhausted":
          growSlots(message.needed);
          return;
        default:
          return;
      }
    };

    try {
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      const answer = await this.#signaling.offer(
        callId,
        { sdp: peer.localDescription?.sdp ?? offer.sdp ?? "", connectionId },
        signal,
      );
      answered = true;
      for (const candidate of localCandidates.splice(0))
        sendCandidate(candidate);
      applyIceServers(peer, answer);
      await peer.setRemoteDescription({ type: "answer", sdp: answer.sdp });
      negotiatedSlots = videoTransceivers().length;
      remoteDescribed = true;
      for (const candidate of pendingCandidates.splice(0))
        void peer.addIceCandidate(candidate).catch(() => undefined);
    } catch (cause) {
      unsubscribeCandidates?.();
      closePeer(peer, local, control);
      throw cause;
    }
    const switching = new Map<"audio" | "video", Promise<void>>();
    const swap = async (
      kind: "audio" | "video",
      deviceId: string,
      switchSignal: AbortSignal,
    ): Promise<void> => {
      throwIfAborted(switchSignal);
      const old =
        kind === "video" && screen !== undefined
          ? screen.camera
          : local.getTracks().find((t) => t.kind === kind);
      if (old === undefined) {
        // Nothing of this kind is being sent — an audio-only call asked to
        // switch camera. enableVideo() starts the camera instead.
        return;
      }
      const stream = await this.#mediaDevices.getUserMedia(
        kind === "audio"
          ? { audio: { deviceId: { ideal: deviceId } } }
          : { video: { deviceId: { ideal: deviceId } } },
      );
      if (closed || switchSignal.aborted) {
        stopTracks(stream);
        return;
      }
      const track =
        kind === "audio"
          ? stream.getAudioTracks()[0]
          : stream.getVideoTracks()[0];
      if (track === undefined) {
        stopTracks(stream);
        return;
      }
      track.enabled = old.enabled;
      if (kind === "video" && screen !== undefined) {
        screen.camera = track;
        old.stop();
        return;
      }
      const sender = peer.getSenders().find((s) => s.track === old);
      if (sender !== undefined) {
        try {
          await sender.replaceTrack(track);
        } catch (cause) {
          stopTracks(stream);
          throw cause;
        }
        if (closed || switchSignal.aborted) {
          stopTracks(stream);
          return;
        }
      }
      old.stop();
      local.removeTrack(old);
      local.addTrack(track);
    };

    let upgrading: Promise<void> = Promise.resolve();
    const upgrade = async (
      enableSignal: AbortSignal,
      devices: SelectedCallDevices | undefined,
    ): Promise<void> => {
      throwIfAborted(enableSignal);
      if (local.getVideoTracks().length > 0) return;
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
      if (track === undefined) {
        stopTracks(stream);
        return;
      }
      local.addTrack(track);
      // The camera transceiver already exists; attach the track to it and
      // re-offer so the platform learns the new stream.
      try {
        await camera.sender.replaceTrack(track);
        camera.sender.setStreams?.(local);
        await renegotiate({}, enableSignal);
        await mediaControls.set({ videoEnabled: true });
      } catch (cause) {
        await camera.sender.replaceTrack(null).catch(() => undefined);
        local.removeTrack(track);
        track.stop();
        throw cause;
      }
    };

    const stopScreen = async (): Promise<void> => {
      const previous = screen;
      if (previous === undefined) return;
      // Stop display capture before any awaited signaling or track operation.
      previous.track.removeEventListener("ended", previous.onEnded);
      previous.track.stop();
      local.removeTrack(previous.track);
      const restore =
        previous.camera?.readyState === "ended" ? undefined : previous.camera;
      if (restore !== undefined) {
        restore.enabled = previous.cameraEnabled;
        local.addTrack(restore);
      }
      screen = undefined;
      try {
        await camera.sender.replaceTrack(restore ?? null);
        camera.sender.setStreams?.(local);
        if (!closed)
          await mediaControls.set({
            screenSharing: false,
            videoEnabled: restore?.enabled === true,
          });
      } catch (cause) {
        if (restore !== undefined) restore.enabled = false;
        throw cause;
      } finally {
        callbacks.onScreenSharing?.(false);
      }
    };
    const queueVideo = (operation: () => Promise<void>): Promise<void> => {
      const run = upgrading.then(operation);
      upgrading = run.catch(() => undefined);
      return run;
    };
    const startScreen = (shareSignal: AbortSignal): Promise<void> => {
      throwIfAborted(shareSignal);
      if (closed || screen !== undefined || screenPending)
        return Promise.resolve();
      // Invoke capture in the caller's click handler, before any promise queue.
      const capture = this.#mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });
      void capture.catch(() => undefined);
      screenPending = true;
      return queueVideo(async () => {
        const stream = await capture;
        if (closed || shareSignal.aborted) {
          stopTracks(stream);
          return;
        }
        const track = stream.getVideoTracks()[0];
        for (const extra of stream.getTracks())
          if (extra !== track) extra.stop();
        if (track === undefined)
          throw new Error("No display video track was selected.");
        const old = local.getVideoTracks()[0];
        const cameraEnabled = old?.enabled === true;
        const onEnded = () => {
          void queueVideo(stopScreen).catch(failedControl);
        };
        let confirmed = false;
        try {
          await camera.sender.replaceTrack(track);
          if (closed || shareSignal.aborted)
            throw new Error("Screen sharing was canceled.");
          if (old !== undefined) {
            old.enabled = false;
            local.removeTrack(old);
          }
          local.addTrack(track);
          camera.sender.setStreams?.(local);
          await renegotiate({}, shareSignal);
          await mediaControls.set({ videoEnabled: true, screenSharing: true });
          confirmed = true;
          if (closed || shareSignal.aborted || track.readyState === "ended")
            throw new Error("Screen sharing ended before it was confirmed.");
          screen = {
            track,
            ...(old === undefined ? {} : { camera: old }),
            cameraEnabled,
            onEnded,
          };
          track.addEventListener("ended", onEnded, { once: true });
          callbacks.onScreenSharing?.(true);
        } catch (cause) {
          track.stop();
          local.removeTrack(track);
          if (closed) old?.stop();
          if (old !== undefined && !closed) {
            old.enabled = cameraEnabled;
            local.addTrack(old);
          }
          await camera.sender
            .replaceTrack(closed ? null : (old ?? null))
            .catch(() => undefined);
          if (confirmed && !closed) {
            await mediaControls
              .set({ screenSharing: false, videoEnabled: cameraEnabled })
              .catch(failedControl);
          }
          throw cause;
        }
      }).finally(() => {
        screenPending = false;
      });
    };

    const poll = this.#setInterval(() => {
      // The socket delivers remote candidates while it is up.
      if (transport?.connected === true) return;
      void drainCandidates(this.#signaling, callId, peer, signal);
    }, this.#pollIntervalMs);
    return {
      connectionId,
      localStream: local,
      remoteStream: remote,
      get remoteVideos() {
        return [...videos.values()];
      },
      get screenSharing() {
        return screen !== undefined;
      },
      setMuted: (muted) => {
        if (muted.audio !== undefined)
          setTracks(local.getAudioTracks(), !muted.audio);
        if (muted.video !== undefined && screen === undefined)
          setTracks(local.getVideoTracks(), !muted.video);
        if (control.readyState === "open")
          void syncState().catch(failedControl);
      },
      getStats: () => peer.getStats(),
      audioEnabled: () => local.getAudioTracks().some(({ enabled }) => enabled),
      videoEnabled: () => local.getVideoTracks().some(({ enabled }) => enabled),
      // Same-kind switches run one at a time so the last request wins.
      switchInput: (kind, deviceId, switchSignal) => {
        if (kind === "video")
          return queueVideo(() => swap(kind, deviceId, switchSignal));
        const run = (switching.get(kind) ?? Promise.resolve()).then(() =>
          swap(kind, deviceId, switchSignal),
        );
        switching.set(
          kind,
          run.catch(() => undefined),
        );
        return run;
      },
      // Both need a re-offer, so signaling that cannot renegotiate does not
      // get them at all.
      ...(this.#signaling.renegotiate === undefined
        ? {}
        : {
            ...(typeof this.#mediaDevices.getDisplayMedia === "function"
              ? {
                  startScreenShare: startScreen,
                  stopScreenShare: () => queueVideo(stopScreen),
                }
              : {}),
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
      close: async (options = {}) => {
        if (closed) return;
        closed = true;
        mediaControls.close();
        if (screen !== undefined) {
          screen.track.removeEventListener("ended", screen.onEnded);
          local.removeTrack(screen.track);
          screen.track.stop();
          if (screen.camera !== undefined) {
            local.addTrack(screen.camera);
            screen.camera.stop();
          }
          screen = undefined;
          callbacks.onScreenSharing?.(false);
        }
        this.#clearInterval(poll);
        unsubscribeCandidates?.();
        videos.clear();
        closePeer(peer, local, control);
        if (options.leave === false) return;
        try {
          await this.#signaling.leave(callId, connectionId);
        } catch {
          // Local media teardown must complete even when leave fails.
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
/** A missing browser capability; reported as `unsupported_browser`. */
function unsupported(message: string): Error {
  const error = new Error(message);
  error.name = "NotSupportedError";
  return error;
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
function closePeer(
  peer: RTCPeerConnection,
  stream: MediaStream,
  control: RTCDataChannel,
): void {
  peer.onicecandidate = null;
  peer.ontrack = null;
  peer.onconnectionstatechange = null;
  peer.oniceconnectionstatechange = null;
  control.onmessage = null;
  for (const track of stream.getTracks()) track.stop();
  peer.close();
}
function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted)
    throw signal.reason ?? new DOMException("Aborted", "AbortError");
}
