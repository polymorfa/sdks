// Polymorfa Calls UI — React components over `CallsController`.
//
// Shaped after the official WhatsApp desktop call windows in a monochrome
// Material-3 voice: black identity, tonal fills, hairline outlines, 8px
// radius; the verbs carry the only color (success green answers, danger red
// declines/hangs up). Cards follow the appearance theme; the call stage — and
// the incoming card once it carries a camera preview — is always dark, like an
// OS call screen. Widgets are fluid and never resize when a panel opens;
// device panels overlay them. Every affordance gates on the snapshot's
// `capabilities`, never on the line name.

import {
  capabilitiesFor,
  type CallDevice,
  type CallLine,
  type CallsController,
  type CallsSnapshot,
} from "@polymorfa/browser";
import { appearanceToCssVariables, type Locale } from "@polymorfa/ui";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type SVGProps,
} from "react";
import { createPortal } from "react-dom";
import { usePolymorfa } from "./context.js";
import { useController, useResolvedController } from "./hooks.js";

type ControllerProps = {
  readonly controller?: CallsController;
  readonly createController?: () => CallsController;
};

const ACTIVE_STATUSES = new Set<CallsSnapshot["status"]>([
  "ringing",
  "accepted",
  "connecting",
  "connected",
  "reconnecting",
]);

// ── Icons (Feather, MIT — inline so the package ships zero assets) ────

type IconProps = SVGProps<SVGSVGElement>;

function Icon({ children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

const PhoneIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.08 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
  </Icon>
);

/** The end-call handset: the phone glyph rotated to point down. */
const HangupIcon = ({ style, ...p }: IconProps) => (
  <PhoneIcon {...p} style={{ transform: "rotate(135deg)", ...style }} />
);

const MicIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
    <line x1="12" y1="19" x2="12" y2="23" />
    <line x1="8" y1="23" x2="16" y2="23" />
  </Icon>
);

const MicOffIcon = (p: IconProps) => (
  <Icon {...p}>
    <line x1="1" y1="1" x2="23" y2="23" />
    <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
    <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
    <line x1="12" y1="19" x2="12" y2="23" />
    <line x1="8" y1="23" x2="16" y2="23" />
  </Icon>
);

const VideoIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M23 7l-7 5 7 5V7z" />
    <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
  </Icon>
);

const VideoOffIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2m5.66 0H14a2 2 0 0 1 2 2v3.34l1 1L23 7v10" />
    <line x1="1" y1="1" x2="23" y2="23" />
  </Icon>
);

const EraseIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z" />
    <line x1="18" y1="9" x2="12" y2="15" />
    <line x1="12" y1="9" x2="18" y2="15" />
  </Icon>
);

const UserIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </Icon>
);

const ChevronDownIcon = (p: IconProps) => (
  <Icon {...p}>
    <polyline points="6 9 12 15 18 9" />
  </Icon>
);

const MoreIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="1" />
    <circle cx="19" cy="12" r="1" />
    <circle cx="5" cy="12" r="1" />
  </Icon>
);

const PopoutIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    <polyline points="15 3 21 3 21 9" />
    <line x1="10" y1="14" x2="21" y2="3" />
  </Icon>
);

// ── Root / theming ────────────────────────────────────────────────────

const STYLE_TAG_ID = "pmfa-calls-styles";

/**
 * Inject the calls stylesheet once per document. SSR-safe (no-op without a
 * `document`) and idempotent.
 */
export function injectCallsStyles(
  target: Document | undefined = globalThis.document,
): void {
  if (target === undefined) return;
  if (target.getElementById(STYLE_TAG_ID)) return;
  const tag = target.createElement("style");
  tag.id = STYLE_TAG_ID;
  tag.textContent = CALLS_STYLES;
  target.head.appendChild(tag);
}

function useCallsRoot(): {
  readonly className: string;
  readonly style: CSSProperties;
  readonly dir: "ltr" | "rtl";
  readonly locale: Locale;
} {
  const configuration = usePolymorfa();
  useEffect(() => injectCallsStyles(), []);
  const call = configuration.appearance.elements["call"];
  const theme = configuration.appearance.theme;
  const className = [
    "pmfa-calls",
    theme === "dark"
      ? "pmfa-calls-dark"
      : theme === "system"
        ? "pmfa-calls-auto"
        : "",
    call?.className ?? "",
  ]
    .filter(Boolean)
    .join(" ");
  const style = useMemo(
    () =>
      ({
        ...appearanceToCssVariables(configuration.appearance),
        ...call?.styles,
      }) as CSSProperties,
    [configuration.appearance, call],
  );
  return {
    className,
    style,
    dir: configuration.locale.direction,
    locale: configuration.locale,
  };
}

function t(
  locale: Locale,
  key: keyof Locale["messages"],
  values: Record<string, string> = {},
): string {
  return locale.messages[key].replace(
    /\{(\w+)\}/g,
    (_, name: string) => values[name] ?? "",
  );
}

// ── Building blocks ───────────────────────────────────────────────────

function initialsOf(name: string | undefined): string | null {
  if (name === undefined) return null;
  const words = name.trim().split(/\s+/).filter(Boolean);
  const first = words[0];
  if (first === undefined || /^[+\d(]/.test(first)) return null;
  const last = words.length > 1 ? words[words.length - 1] : undefined;
  const initials = `${first[0] ?? ""}${last?.[0] ?? ""}`.toUpperCase();
  return initials.length > 0 ? initials : null;
}

/**
 * Deterministic per-caller avatar color: a stable hash of the peer id picks
 * one of 8 palette tones, so the same caller always renders the same color.
 * A resolved profile picture wins.
 */
function avatarColorClass(peer: string | undefined): string {
  if (peer === undefined) return "";
  let h = 5381;
  for (let i = 0; i < peer.length; i += 1)
    h = ((h * 33) ^ peer.charCodeAt(i)) >>> 0;
  return ` pmfa-calls-avatar-c${(h % 8) + 1}`;
}

function CallAvatar({
  displayName,
  avatarUrl,
  peer,
}: {
  readonly displayName: string | undefined;
  readonly avatarUrl: string | undefined;
  readonly peer: string | undefined;
}) {
  const initials = initialsOf(displayName);
  return (
    <div className="pmfa-calls-avatar-wrap">
      <div
        className={`pmfa-calls-avatar${avatarUrl === undefined ? avatarColorClass(peer) : ""}`}
      >
        {avatarUrl !== undefined ? (
          <img src={avatarUrl} alt="" />
        ) : initials !== null ? (
          initials
        ) : (
          <UserIcon style={{ width: 30, height: 30, opacity: 0.9 }} />
        )}
      </div>
    </div>
  );
}

/** Resolve a peer's picture: a URL, nothing, or a promise of either. */
export type AvatarResolver = (
  peer: string,
) => string | undefined | Promise<string | undefined>;

function usePeerAvatar(
  peer: string | undefined,
  resolveAvatar: AvatarResolver | undefined,
  explicit?: string,
): string | undefined {
  const [resolved, setResolved] = useState<Record<string, string | undefined>>(
    {},
  );
  useEffect(() => {
    if (peer === undefined || resolveAvatar === undefined || peer in resolved)
      return;
    let cancelled = false;
    void Promise.resolve()
      .then(() => resolveAvatar(peer))
      .catch(() => undefined)
      .then((url) => {
        if (!cancelled)
          setResolved((previous) => ({ ...previous, [peer]: url }));
      });
    return () => {
      cancelled = true;
    };
  }, [peer, resolveAvatar, resolved]);
  return explicit ?? (peer === undefined ? undefined : resolved[peer]);
}

/**
 * A muted, mirrored self-view for the pre-answer preview on video offers.
 * Null while the camera warms up or when access was denied — callers fall
 * back to the dark block.
 */
function useSelfPreview(
  enabled: boolean,
  videoInput: string | undefined,
): MediaStream | null {
  const [stream, setStream] = useState<MediaStream | null>(null);
  useEffect(() => {
    const devices = globalThis.navigator?.mediaDevices;
    if (
      !enabled ||
      devices === undefined ||
      typeof devices.getUserMedia !== "function"
    )
      return;
    let cancelled = false;
    let acquired: MediaStream | null = null;
    void devices
      .getUserMedia({
        video:
          videoInput === undefined ? true : { deviceId: { ideal: videoInput } },
        audio: false,
      })
      .then((s) => {
        acquired = s;
        if (cancelled) for (const track of s.getTracks()) track.stop();
        else setStream(s);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      if (acquired !== null)
        for (const track of acquired.getTracks()) track.stop();
      setStream(null);
    };
  }, [enabled, videoInput]);
  return stream;
}

function attach(
  element: HTMLMediaElement | null,
  stream: MediaStream | undefined | null,
): void {
  if (element !== null && stream != null && element.srcObject !== stream)
    element.srcObject = stream;
}

// ── Device panels ─────────────────────────────────────────────────────

const canSetSink =
  typeof HTMLMediaElement !== "undefined" &&
  "setSinkId" in HTMLMediaElement.prototype;

type DeviceFieldKind = "audioInput" | "videoInput" | "audioOutput";

const DEVICE_KIND: Record<DeviceFieldKind, CallDevice["kind"]> = {
  audioInput: "audioinput",
  videoInput: "videoinput",
  audioOutput: "audiooutput",
};

const DEVICE_LABEL: Record<
  DeviceFieldKind,
  "calls.microphone" | "calls.camera" | "calls.speaker"
> = {
  audioInput: "calls.microphone",
  videoInput: "calls.camera",
  audioOutput: "calls.speaker",
};

/**
 * One-panel-at-a-time open state plus the label unlock: device labels are
 * empty until the page holds a media permission, so opening a panel takes
 * (and immediately releases) a throwaway audio capture so real names show.
 */
function useDevicePanels(controller: CallsController, snapshot: CallsSnapshot) {
  const [open, setOpen] = useState<string | null>(null);
  const toggle = (panel: string) => {
    const next = open === panel ? null : panel;
    setOpen(next);
    if (next === null) return;
    void (async () => {
      const devices = globalThis.navigator?.mediaDevices;
      if (
        snapshot.devices.every((d) => d.label.length === 0) &&
        devices !== undefined &&
        typeof devices.getUserMedia === "function"
      ) {
        try {
          const s = await devices.getUserMedia({ audio: true });
          for (const track of s.getTracks()) track.stop();
        } catch {
          // Denied — enumerate anyway; generic labels render.
        }
      }
      await controller.refreshDevices().catch(() => undefined);
    })();
  };
  return { open, toggle };
}

/**
 * Device selects, scoped per panel: the mic dropdown carries microphone +
 * speaker, the camera dropdown carries the camera only (the official
 * split-button layout). Selections apply live mid-call.
 */
function DeviceFields({
  controller,
  snapshot,
  fields,
  locale,
}: {
  readonly controller: CallsController;
  readonly snapshot: CallsSnapshot;
  readonly fields: readonly DeviceFieldKind[];
  readonly locale: Locale;
}) {
  const select = (kind: DeviceFieldKind, deviceId: string) => {
    if (kind === "audioOutput")
      controller.setPreferredDevices({ audioOutput: deviceId });
    else if (deviceId.length > 0) void controller.switchDevice(kind, deviceId);
    else controller.setPreferredDevices({ [kind]: undefined });
  };
  return (
    <>
      {fields.map((kind) => {
        if (kind === "audioOutput" && !canSetSink) return null;
        const group = snapshot.devices.filter(
          (d) => d.kind === DEVICE_KIND[kind],
        );
        return (
          <label key={kind} className="pmfa-calls-field">
            {t(locale, DEVICE_LABEL[kind])}
            <select
              className="pmfa-calls-select"
              value={snapshot.selectedDevices[kind] ?? ""}
              onChange={(event) => select(kind, event.currentTarget.value)}
            >
              <option value="">Default</option>
              {group.map((d, i) => (
                <option
                  key={d.deviceId.length > 0 ? d.deviceId : i}
                  value={d.deviceId}
                >
                  {d.label.length > 0
                    ? d.label
                    : `${t(locale, DEVICE_LABEL[kind])} ${i + 1}`}
                </option>
              ))}
            </select>
          </label>
        );
      })}
    </>
  );
}

// ── IncomingCallCard ──────────────────────────────────────────────────

export interface IncomingCallCardProps extends ControllerProps {
  /** Human name to show instead of the raw number, if the app knows one. */
  readonly displayName?: string;
  readonly avatarUrl?: string;
  readonly resolveAvatar?: AvatarResolver;
  readonly className?: string;
}

/**
 * The incoming-call window: name, "WhatsApp audio/video call" subtitle, the
 * media middle (avatar for audio; a mirrored self-preview with camera/mic
 * toggles and a ⋯ device menu for video), then Decline / Accept. Answering a
 * video offer with the camera toggled off still acquires video muted, so the
 * in-call camera toggle can enable it later.
 */
export function IncomingCallCard({
  controller,
  createController,
  displayName,
  avatarUrl,
  resolveAvatar,
  className,
}: IncomingCallCardProps) {
  const resolved = useResolvedController(controller, createController);
  const snapshot = useController(resolved);
  const root = useCallsRoot();
  const { locale } = root;
  const incoming = snapshot.status === "incoming";
  const offersVideo = incoming && snapshot.video && snapshot.capabilities.video;
  const [cameraOn, setCameraOn] = useState(true);
  const [preMuted, setPreMuted] = useState(false);
  const preview = useSelfPreview(
    offersVideo && cameraOn,
    snapshot.selectedDevices.videoInput,
  );
  const previewRef = useRef<HTMLVideoElement | null>(null);
  const peerAvatar = usePeerAvatar(snapshot.peer, resolveAvatar, avatarUrl);
  const { open, toggle } = useDevicePanels(resolved, snapshot);

  useEffect(() => attach(previewRef.current, preview), [preview]);

  if (!incoming) return null;
  const peer = snapshot.peer ?? "";
  const name = displayName ?? peer;

  const accept = () =>
    void resolved.answer({ video: offersVideo }).then(() => {
      if (preMuted || (offersVideo && !cameraOn))
        resolved.setMuted({
          ...(preMuted ? { audio: true } : {}),
          ...(offersVideo && !cameraOn ? { video: true } : {}),
        });
    });

  const micToggle = (
    <button
      type="button"
      className={`pmfa-calls-btn pmfa-calls-mini${preMuted ? " pmfa-calls-on" : ""}`}
      onClick={() => setPreMuted((v) => !v)}
      aria-label={t(
        locale,
        preMuted ? "calls.answerUnmuted" : "calls.answerMuted",
      )}
      aria-pressed={preMuted}
    >
      {preMuted ? <MicOffIcon /> : <MicIcon />}
    </button>
  );

  return (
    <div
      className={root.className}
      style={root.style}
      dir={root.dir}
      data-pmfa="call"
    >
      <div
        className={`pmfa-calls-card pmfa-calls-incoming${className === undefined ? "" : ` ${className}`}`}
        role="alertdialog"
        aria-label={t(locale, "calls.incomingFrom", { peer: name })}
      >
        <div className="pmfa-calls-name">{name}</div>
        <div className="pmfa-calls-subtitle">
          {t(locale, offersVideo ? "calls.videoCall" : "calls.audioCall")}
        </div>

        {offersVideo ? (
          <div className="pmfa-calls-media">
            {cameraOn && preview !== null ? (
              <video
                ref={previewRef}
                className="pmfa-calls-preview"
                autoPlay
                playsInline
                muted
              />
            ) : null}
            <div className="pmfa-calls-more">
              <button
                type="button"
                className={`pmfa-calls-btn pmfa-calls-mini${open === "more" ? " pmfa-calls-on" : ""}`}
                onClick={() => toggle("more")}
                aria-label={t(locale, "calls.deviceSettings")}
                aria-expanded={open === "more"}
              >
                <MoreIcon />
              </button>
            </div>
            <div className="pmfa-calls-media-ctrls">
              <button
                type="button"
                className={`pmfa-calls-btn pmfa-calls-mini${cameraOn ? "" : " pmfa-calls-on"}`}
                onClick={() => setCameraOn((v) => !v)}
                aria-label={t(
                  locale,
                  cameraOn
                    ? "calls.answerWithoutCamera"
                    : "calls.answerWithCamera",
                )}
                aria-pressed={!cameraOn}
              >
                {cameraOn ? <VideoIcon /> : <VideoOffIcon />}
              </button>
              {micToggle}
            </div>
          </div>
        ) : (
          <div className="pmfa-calls-media pmfa-calls-media-audio">
            <CallAvatar
              displayName={displayName}
              avatarUrl={peerAvatar}
              peer={peer}
            />
          </div>
        )}

        {open === "more" && (
          <div
            className="pmfa-calls-pop pmfa-calls-pop-float"
            role="group"
            aria-label={t(locale, "calls.deviceSettings")}
          >
            <DeviceFields
              controller={resolved}
              snapshot={snapshot}
              fields={["audioInput", "videoInput", "audioOutput"]}
              locale={locale}
            />
          </div>
        )}

        <div className="pmfa-calls-actions">
          <div className="pmfa-calls-action">
            <button
              type="button"
              className="pmfa-calls-btn pmfa-calls-btn-decline"
              onClick={() => void resolved.reject()}
              aria-label={t(locale, "calls.reject")}
            >
              <HangupIcon />
            </button>
            {t(locale, "calls.reject")}
          </div>
          <div className="pmfa-calls-action">
            <button
              type="button"
              className="pmfa-calls-btn pmfa-calls-btn-answer"
              onClick={accept}
              aria-label={t(locale, "calls.answer")}
            >
              {offersVideo && cameraOn ? <VideoIcon /> : <PhoneIcon />}
            </button>
            {t(locale, "calls.answer")}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Duration ──────────────────────────────────────────────────────────

/** Seconds since the call connected, ticking once a second (0 before that). */
export function useCallDuration(
  snapshot: Pick<CallsSnapshot, "status" | "connectedAt">,
): number {
  const connectedAt =
    snapshot.status === "connected" ? snapshot.connectedAt : undefined;
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (connectedAt === undefined) {
      setSeconds(0);
      return;
    }
    const tick = () =>
      setSeconds(Math.max(0, Math.floor((Date.now() - connectedAt) / 1000)));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [connectedAt]);
  return seconds;
}

/** Format seconds as `m:ss` (or `h:mm:ss` past an hour). */
export function formatDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/**
 * Name with the line under it: "Ringing +number…" while an outgoing call
 * rings, the peer number until an incoming call connects, then alternating
 * number ⇄ duration on the 5-second cadence (crossfaded via keyed remount).
 */
function CallIdentity({
  name,
  peer,
  live,
  ringingLine,
  flashPeer,
  seconds,
}: {
  readonly name: string;
  readonly peer: string | null;
  readonly live: boolean;
  readonly ringingLine: string | null;
  readonly flashPeer: boolean;
  readonly seconds: number;
}) {
  const line = live
    ? peer !== null && flashPeer
      ? peer
      : formatDuration(seconds)
    : (ringingLine ?? peer);
  const lineKey = live && !(peer !== null && flashPeer) ? "duration" : "peer";
  return (
    <div>
      <div className="pmfa-calls-name">{name}</div>
      {line !== null && (
        <div key={lineKey} className="pmfa-calls-peer pmfa-calls-flash">
          {line}
        </div>
      )}
    </div>
  );
}

// ── CallStage ─────────────────────────────────────────────────────────

export interface CallStageProps extends ControllerProps {
  readonly displayName?: string;
  readonly avatarUrl?: string;
  readonly resolveAvatar?: AvatarResolver;
  readonly className?: string;
  /** Replace the media region (remote/local streams) without forking state. */
  readonly renderMedia?: (streams: {
    readonly local?: MediaStream;
    readonly remote?: MediaStream;
  }) => ReactNode;
}

/**
 * The in-call stage: remote video full-bleed when the far side sends video,
 * the centered avatar hero otherwise, the local preview as a
 * picture-in-picture tile, and the identity (name + flashing number/duration
 * line). Always dark by design.
 */
export function CallStage({
  controller,
  createController,
  displayName,
  avatarUrl,
  resolveAvatar,
  className,
  renderMedia,
}: CallStageProps) {
  const resolved = useResolvedController(controller, createController);
  const snapshot = useController(resolved);
  const root = useCallsRoot();
  const { locale } = root;
  const remoteRef = useRef<HTMLVideoElement | null>(null);
  const localRef = useRef<HTMLVideoElement | null>(null);
  const [remoteHasVideo, setRemoteHasVideo] = useState(false);
  const seconds = useCallDuration(snapshot);
  const peerAvatar = usePeerAvatar(snapshot.peer, resolveAvatar, avatarUrl);
  const live = snapshot.status === "connected";
  const localStream = resolved.localStream;
  const remoteStream = resolved.remoteStream;

  const [flashPeer, setFlashPeer] = useState(false);
  useEffect(() => {
    if (!live) {
      setFlashPeer(false);
      return;
    }
    const timer = setInterval(() => setFlashPeer((v) => !v), 5000);
    return () => clearInterval(timer);
  }, [live]);

  useEffect(() => {
    attach(remoteRef.current, remoteStream);
    if (remoteStream === undefined) return;
    const update = () =>
      setRemoteHasVideo(remoteStream.getVideoTracks().length > 0);
    update();
    remoteStream.addEventListener("addtrack", update);
    remoteStream.addEventListener("removetrack", update);
    return () => {
      remoteStream.removeEventListener("addtrack", update);
      remoteStream.removeEventListener("removetrack", update);
    };
  }, [remoteStream, snapshot.revision]);

  useEffect(
    () => attach(localRef.current, localStream),
    [localStream, snapshot.revision],
  );

  const sink = snapshot.selectedDevices.audioOutput;
  useEffect(() => {
    const element = remoteRef.current as
      (HTMLVideoElement & { setSinkId?: (id: string) => Promise<void> }) | null;
    if (element?.setSinkId !== undefined && sink !== undefined)
      void element.setSinkId(sink).catch(() => undefined);
  }, [sink, snapshot.revision]);

  if (!ACTIVE_STATUSES.has(snapshot.status)) return null;
  const peer = snapshot.peer ?? "";
  const showLocalVideo = snapshot.video && !snapshot.videoMuted;
  const preAccept = showLocalVideo && !live;
  const ringingLine =
    snapshot.status === "reconnecting"
      ? `${t(locale, "calls.reconnecting")}…`
      : !live && snapshot.direction === "outgoing"
        ? `${t(locale, "calls.ringing")} ${peer}…`
        : null;
  const identity = (
    <CallIdentity
      name={displayName ?? peer}
      peer={displayName === undefined ? null : peer}
      live={live}
      ringingLine={ringingLine}
      flashPeer={flashPeer}
      seconds={seconds}
    />
  );

  return (
    <div
      className={root.className}
      style={root.style}
      dir={root.dir}
      data-pmfa="call"
    >
      <div
        className={`pmfa-calls-stage${className === undefined ? "" : ` ${className}`}`}
      >
        {renderMedia !== undefined ? (
          renderMedia({
            ...(localStream === undefined ? {} : { local: localStream }),
            ...(remoteStream === undefined ? {} : { remote: remoteStream }),
          })
        ) : (
          <>
            <video
              ref={remoteRef}
              className="pmfa-calls-video-remote"
              autoPlay
              playsInline
              style={remoteHasVideo ? undefined : { visibility: "hidden" }}
            />
            {!remoteHasVideo ? (
              preAccept ? (
                <div className="pmfa-calls-hero-preview">
                  {identity}
                  <div className="pmfa-calls-inset">
                    <video
                      ref={localRef}
                      className="pmfa-calls-preview"
                      autoPlay
                      playsInline
                      muted
                    />
                  </div>
                </div>
              ) : (
                <div className="pmfa-calls-audio-hero">
                  <CallAvatar
                    displayName={displayName}
                    avatarUrl={peerAvatar}
                    peer={peer}
                  />
                  {identity}
                </div>
              )
            ) : (
              <div className="pmfa-calls-stage-id">{identity}</div>
            )}
            {showLocalVideo && !preAccept && (
              <div className="pmfa-calls-pip">
                <video ref={localRef} autoPlay playsInline muted />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── CallControls ──────────────────────────────────────────────────────

export interface CallControlsProps extends ControllerProps {
  readonly className?: string;
  /** Force-hide the camera control even when the line could carry video. */
  readonly disableVideo?: boolean;
}

/**
 * The in-call dock, after the official window: the camera split group
 * ([toggle|⌄] — the dropdown picks the camera) and the mic split group
 * ([toggle|⌄] — the dropdown picks microphone + speaker) on the left, the
 * red hang-up pill on the right. The camera group renders whenever the line
 * can carry video (unless `disableVideo`) and is disabled until the call
 * connects. Video is per direction: the camera controls only the outgoing
 * stream.
 */
export function CallControls({
  controller,
  createController,
  className,
  disableVideo,
}: CallControlsProps) {
  const resolved = useResolvedController(controller, createController);
  const snapshot = useController(resolved);
  const root = useCallsRoot();
  const { locale } = root;
  const { open, toggle } = useDevicePanels(resolved, snapshot);
  if (!ACTIVE_STATUSES.has(snapshot.status)) return null;

  const live = snapshot.status === "connected";
  const showCamera = snapshot.capabilities.video && disableVideo !== true;
  const cameraOff = !snapshot.video || snapshot.videoMuted;
  const onCamera = () => {
    // On a video call the button mutes/unmutes the outgoing track; on an
    // audio call it upgrades to video (camera + re-offer on the same
    // connection) through the controller.
    if (snapshot.video) resolved.setMuted({ video: !snapshot.videoMuted });
    // A denied camera, a failed re-offer, or a call that ended mid-upgrade all
    // reject here. The upgrade rolls itself back, so the audio call carries on
    // and the button stays live for another try; swallowing the rejection just
    // keeps a declined camera from surfacing as an unhandled error.
    else void resolved.enableVideo().catch(() => undefined);
  };

  return (
    <div
      className={root.className}
      style={root.style}
      dir={root.dir}
      data-pmfa="call"
    >
      <div className="pmfa-calls-dock-col">
        {open === "mic" && (
          <div
            className="pmfa-calls-pop"
            role="group"
            aria-label={t(locale, "calls.microphoneSettings")}
          >
            <DeviceFields
              controller={resolved}
              snapshot={snapshot}
              fields={["audioInput", "audioOutput"]}
              locale={locale}
            />
          </div>
        )}
        {open === "cam" && (
          <div
            className="pmfa-calls-pop"
            role="group"
            aria-label={t(locale, "calls.cameraSettings")}
          >
            <DeviceFields
              controller={resolved}
              snapshot={snapshot}
              fields={["videoInput"]}
              locale={locale}
            />
          </div>
        )}
        <div
          className={`pmfa-calls-dock${className === undefined ? "" : ` ${className}`}`}
        >
          {showCamera && (
            <div
              className={`pmfa-calls-group${live ? "" : " pmfa-calls-disabled"}`}
            >
              <button
                type="button"
                className={`pmfa-calls-btn pmfa-calls-btn-ctrl${cameraOff ? " pmfa-calls-on" : ""}`}
                onClick={onCamera}
                disabled={!live}
                aria-label={t(
                  locale,
                  cameraOff ? "calls.cameraOn" : "calls.cameraOff",
                )}
                aria-pressed={cameraOff}
              >
                {cameraOff ? <VideoOffIcon /> : <VideoIcon />}
              </button>
              <button
                type="button"
                className={`pmfa-calls-btn pmfa-calls-btn-acc${open === "cam" ? " pmfa-calls-open" : ""}`}
                onClick={() => toggle("cam")}
                disabled={!live}
                aria-label={t(locale, "calls.cameraSettings")}
                aria-expanded={open === "cam"}
              >
                <ChevronDownIcon />
              </button>
            </div>
          )}
          {snapshot.capabilities.mute && (
            <div className="pmfa-calls-group">
              <button
                type="button"
                className={`pmfa-calls-btn pmfa-calls-btn-ctrl${snapshot.audioMuted ? " pmfa-calls-on" : ""}`}
                onClick={() =>
                  resolved.setMuted({ audio: !snapshot.audioMuted })
                }
                aria-label={t(
                  locale,
                  snapshot.audioMuted ? "calls.unmute" : "calls.mute",
                )}
                aria-pressed={snapshot.audioMuted}
              >
                {snapshot.audioMuted ? <MicOffIcon /> : <MicIcon />}
              </button>
              <button
                type="button"
                className={`pmfa-calls-btn pmfa-calls-btn-acc${open === "mic" ? " pmfa-calls-open" : ""}`}
                onClick={() => toggle("mic")}
                aria-label={t(locale, "calls.microphoneSettings")}
                aria-expanded={open === "mic"}
              >
                <ChevronDownIcon />
              </button>
            </div>
          )}
          <button
            type="button"
            className="pmfa-calls-btn pmfa-calls-btn-hangup"
            onClick={() => void resolved.hangup()}
            aria-label={t(locale, "calls.hangup")}
          >
            <HangupIcon />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── DialPad ───────────────────────────────────────────────────────────

const KEYS = [
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "+",
  "0",
  "#",
] as const;

export interface DialPadProps extends ControllerProps {
  /** Prefill the number field. */
  readonly defaultValue?: string;
  /** Calling line the call is placed over. Defaults to `linkedDevice`. */
  readonly line?: CallLine;
  /** Called after `place()` resolves. */
  readonly onPlaced?: (to: string) => void;
  readonly className?: string;
}

/**
 * A dial pad card: E.164 entry plus place-call buttons — audio always, and a
 * video-call button when the line can carry video (linked device; the
 * Business Calling API line is audio-only, so the button never renders there).
 */
export function DialPad({
  controller,
  createController,
  defaultValue = "",
  line = "linkedDevice",
  onPlaced,
  className,
}: DialPadProps) {
  const resolved = useResolvedController(controller, createController);
  const snapshot = useController(resolved);
  const root = useCallsRoot();
  const { locale } = root;
  const [value, setValue] = useState(defaultValue);
  const busy =
    snapshot.status === "incoming" || ACTIVE_STATUSES.has(snapshot.status);
  const canVideo = capabilitiesFor(line).video;
  const dial = (video: boolean) => {
    const to = value.trim();
    if (to.length === 0) return;
    void resolved.place(to, { video, line }).then(() => onPlaced?.(to));
  };

  return (
    <div
      className={root.className}
      style={root.style}
      dir={root.dir}
      data-pmfa="call"
    >
      <div
        className={`pmfa-calls-card pmfa-calls-dialpad${className === undefined ? "" : ` ${className}`}`}
      >
        <input
          className="pmfa-calls-input"
          type="tel"
          inputMode="tel"
          placeholder="+1 555 000 0000"
          value={value}
          onChange={(event) => setValue(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") dial(false);
          }}
          aria-label={t(locale, "calls.dialPlaceholder")}
        />
        <div className="pmfa-calls-keys">
          {KEYS.map((digit) => (
            <button
              key={digit}
              type="button"
              className="pmfa-calls-key"
              onClick={() => setValue((v) => v + digit)}
              aria-label={digit}
            >
              <span className="pmfa-calls-key-digit">{digit}</span>
            </button>
          ))}
        </div>
        <div className="pmfa-calls-dial-actions">
          <button
            type="button"
            className="pmfa-calls-btn pmfa-calls-btn-answer"
            onClick={() => dial(false)}
            disabled={busy || value.trim().length === 0}
            aria-label={t(locale, "calls.placeAudioCall")}
          >
            <PhoneIcon />
          </button>
          {canVideo && (
            <button
              type="button"
              className="pmfa-calls-btn pmfa-calls-btn-answer"
              onClick={() => dial(true)}
              disabled={busy || value.trim().length === 0}
              aria-label={t(locale, "calls.placeVideoCall")}
            >
              <VideoIcon />
            </button>
          )}
          <button
            type="button"
            className="pmfa-calls-key pmfa-calls-key-erase"
            onClick={() => setValue((v) => v.slice(0, -1))}
            disabled={value.length === 0}
            aria-label={t(locale, "calls.deleteDigit")}
          >
            <EraseIcon />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Pop-out call window ───────────────────────────────────────────────

export interface CallPopoutHandle {
  /** True while the separate call window is open. */
  readonly popped: boolean;
  /** Open the call window (no-op if already open or the popup was blocked). */
  readonly open: () => void;
  /** Close the call window (popping the call back inline). */
  readonly close: () => void;
  /** Portal target inside the call window; null while not popped. */
  readonly container: HTMLElement | null;
}

/**
 * Owns a separate, freely resizable call window (like the desktop client's)
 * and hands back a container to portal the stage + controls into. Media
 * streams keep playing across same-origin windows, so portal'd `<video>`
 * elements just work.
 */
export function useCallPopout(): CallPopoutHandle {
  const windowRef = useRef<Window | null>(null);
  const [container, setContainer] = useState<HTMLElement | null>(null);

  const close = useCallback(() => {
    windowRef.current?.close();
    windowRef.current = null;
    setContainer(null);
  }, []);

  const open = useCallback(() => {
    if (typeof window === "undefined" || windowRef.current !== null) return;
    const popup = window.open(
      "",
      "pmfa-call",
      "popup=yes,width=420,height=600",
    );
    if (popup === null) return; // popup blocked — the call stays inline
    const doc = popup.document;
    doc.title = "Call";
    const style = doc.createElement("style");
    style.textContent = `html,body{margin:0;height:100%;background:oklch(0.15 0 0);}${CALLS_STYLES}`;
    doc.head.appendChild(style);
    const root = doc.createElement("div");
    root.style.height = "100%";
    doc.body.appendChild(root);
    windowRef.current = popup;
    setContainer(root);
  }, []);

  useEffect(() => {
    if (container === null) return;
    const timer = setInterval(() => {
      if (windowRef.current?.closed === true) {
        windowRef.current = null;
        setContainer(null);
      }
    }, 500);
    return () => clearInterval(timer);
  }, [container]);

  useEffect(() => () => windowRef.current?.close(), []);

  return { popped: container !== null, open, close, container };
}

// ── CallSurface (one-drop composite) ──────────────────────────────────

export interface CallSurfaceProps extends ControllerProps {
  /** Resolve a display name for a number (contact lookup). */
  readonly resolveName?: (peer: string) => string | undefined;
  /** Resolve an avatar URL for a number (sync or async). */
  readonly resolveAvatar?: AvatarResolver;
  /** Force-hide the camera control even when the line could carry video. */
  readonly disableVideo?: boolean;
  /** Offer the ↗ pop-out window button. Defaults to true. */
  readonly popout?: boolean;
  /** Replace the stage's media region without forking state. */
  readonly renderMedia?: CallStageProps["renderMedia"];
}

/**
 * The whole call experience in one component: a fixed overlay that shows the
 * incoming-call card while ringing and the stage + control dock during a
 * call. The ↗ button pops the call into its own resizable browser window;
 * closing that window (or the call ending) pops it back inline.
 */
export function CallSurface({
  controller,
  createController,
  resolveName,
  resolveAvatar,
  disableVideo,
  popout: allowPopout = true,
  renderMedia,
}: CallSurfaceProps) {
  const resolved = useResolvedController(controller, createController);
  const snapshot = useController(resolved);
  const root = useCallsRoot();
  const { locale } = root;
  const popout = useCallPopout();
  const peer = snapshot.peer;
  const displayName = peer === undefined ? undefined : resolveName?.(peer);
  const active = ACTIVE_STATUSES.has(snapshot.status);
  const incoming = snapshot.status === "incoming";

  const { popped, close } = popout;
  useEffect(() => {
    if (!active && popped) close();
  }, [active, popped, close]);

  if (!incoming && !active) return null;

  const overlay: CSSProperties = {
    position: "fixed",
    right: 20,
    bottom: 20,
    zIndex: 2147483000,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 12,
    width: 340,
    maxWidth: "calc(100vw - 40px)",
  };
  const stageProps = {
    controller: resolved,
    ...(displayName === undefined ? {} : { displayName }),
    ...(resolveAvatar === undefined ? {} : { resolveAvatar }),
    ...(renderMedia === undefined ? {} : { renderMedia }),
  };
  const callUi = (
    <>
      <CallStage {...stageProps} />
      <CallControls
        controller={resolved}
        {...(disableVideo === undefined ? {} : { disableVideo })}
      />
    </>
  );

  return (
    <div style={overlay} data-pmfa="call-surface">
      <IncomingCallCard
        controller={resolved}
        {...(displayName === undefined ? {} : { displayName })}
        {...(resolveAvatar === undefined ? {} : { resolveAvatar })}
      />
      {active &&
        (popout.popped && popout.container !== null ? (
          <>
            {createPortal(
              <div
                className={`${root.className} pmfa-calls-popout`}
                style={root.style}
                dir={root.dir}
              >
                {callUi}
              </div>,
              popout.container,
            )}
            <div className={root.className} style={root.style} dir={root.dir}>
              <div className="pmfa-calls-popbar">
                {t(locale, "calls.popOut")}
                <button
                  type="button"
                  className="pmfa-calls-btn pmfa-calls-mini"
                  onClick={popout.close}
                  aria-label={t(locale, "calls.popIn")}
                >
                  <PopoutIcon style={{ transform: "scaleX(-1)" }} />
                </button>
              </div>
            </div>
          </>
        ) : (
          <div style={{ position: "relative", width: "100%" }}>
            {callUi}
            {allowPopout && (
              <div className={root.className} style={root.style} dir={root.dir}>
                <div className="pmfa-calls-more">
                  <button
                    type="button"
                    className="pmfa-calls-btn pmfa-calls-mini"
                    onClick={popout.open}
                    aria-label={t(locale, "calls.popOut")}
                  >
                    <PopoutIcon />
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
    </div>
  );
}

// ── Stylesheet ────────────────────────────────────────────────────────

/**
 * One injected `<style>` tag, scoped under `.pmfa-calls` so nothing leaks into
 * the host app. Colors derive from the shared `--pmfa-*` appearance variables
 * with the monochrome Material-3 palette as fallbacks; the verbs use
 * `--pmfa-color-success` / `--pmfa-color-danger`. All motion is disabled under
 * `prefers-reduced-motion: reduce`.
 */
export const CALLS_STYLES = `
.pmfa-calls {
  --pmfa-calls-accent: var(--pmfa-color-foreground, oklch(0.15 0 0));
  --pmfa-calls-accent-soft: oklch(0.96 0 0);
  --pmfa-calls-answer: var(--pmfa-color-success, oklch(0.76 0.19 150));
  --pmfa-calls-answer-strong: oklch(0.68 0.18 150);
  --pmfa-calls-danger: var(--pmfa-color-danger, oklch(0.5 0.19 28));
  --pmfa-calls-danger-strong: oklch(0.44 0.18 28);
  --pmfa-calls-card: var(--pmfa-color-background, oklch(1 0 0));
  --pmfa-calls-fg: var(--pmfa-color-foreground, oklch(0.17 0 0));
  --pmfa-calls-muted: var(--pmfa-color-muted, oklch(0.49 0.008 250));
  --pmfa-calls-border: var(--pmfa-color-border, oklch(0.91 0 0));
  --pmfa-calls-stage: oklch(0.15 0 0);
  --pmfa-calls-stage-fg: oklch(0.985 0 0);
  --pmfa-calls-stage-muted: oklch(0.75 0 0);
  --pmfa-calls-stage-line: oklch(1 0 0 / 0.12);
  --pmfa-calls-avatar-1: oklch(0.55 0.09 200);
  --pmfa-calls-avatar-2: oklch(0.55 0.12 255);
  --pmfa-calls-avatar-3: oklch(0.55 0.14 292);
  --pmfa-calls-avatar-4: oklch(0.58 0.14 10);
  --pmfa-calls-avatar-5: oklch(0.6 0.11 70);
  --pmfa-calls-avatar-6: oklch(0.55 0.11 150);
  --pmfa-calls-avatar-7: oklch(0.5 0.13 275);
  --pmfa-calls-avatar-8: oklch(0.55 0.14 330);
  --pmfa-calls-radius: var(--pmfa-radius-medium, 0.5rem);
  --pmfa-calls-font: var(--pmfa-font-family, "Roboto", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif);
  font-family: var(--pmfa-calls-font);
  color: var(--pmfa-calls-fg);
  font-size: 14px;
  line-height: 1.45;
  -webkit-font-smoothing: antialiased;
}
.pmfa-calls *, .pmfa-calls *::before, .pmfa-calls *::after { box-sizing: border-box; }
.pmfa-calls :focus-visible { outline: 2px solid var(--pmfa-calls-accent); outline-offset: 2px; }
.pmfa-calls.pmfa-calls-dark {
  --pmfa-calls-accent: oklch(0.92 0 0);
  --pmfa-calls-accent-soft: oklch(1 0 0 / 0.08);
  --pmfa-calls-card: oklch(0.21 0 0);
  --pmfa-calls-fg: oklch(0.985 0 0);
  --pmfa-calls-muted: oklch(0.74 0 0);
  --pmfa-calls-border: oklch(1 0 0 / 0.12);
}
@media (prefers-color-scheme: dark) {
  .pmfa-calls.pmfa-calls-auto {
    --pmfa-calls-accent: oklch(0.92 0 0);
    --pmfa-calls-accent-soft: oklch(1 0 0 / 0.08);
    --pmfa-calls-card: oklch(0.21 0 0);
    --pmfa-calls-fg: oklch(0.985 0 0);
    --pmfa-calls-muted: oklch(0.74 0 0);
    --pmfa-calls-border: oklch(1 0 0 / 0.12);
  }
}
.pmfa-calls-card { background: var(--pmfa-calls-card); border: 1px solid var(--pmfa-calls-border); border-radius: var(--pmfa-calls-radius); }
.pmfa-calls-incoming { position: relative; width: 100%; padding: 22px 16px 18px; display: flex; flex-direction: column; text-align: center; background: var(--pmfa-calls-stage); color: var(--pmfa-calls-stage-fg); border-color: var(--pmfa-calls-stage-line); animation: pmfa-calls-rise 0.28s cubic-bezier(0.16, 1, 0.3, 1); }
.pmfa-calls-incoming .pmfa-calls-name { font-size: 19px; font-weight: 600; }
.pmfa-calls-subtitle { margin-top: 3px; font-size: 13px; color: var(--pmfa-calls-stage-muted); }
.pmfa-calls-media { position: relative; width: 100%; margin-top: 16px; border-radius: var(--pmfa-calls-radius); overflow: hidden; aspect-ratio: 16 / 10; background: oklch(0.08 0 0); }
.pmfa-calls-preview { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; transform: scaleX(-1); }
.pmfa-calls-media-audio { overflow: visible; background: transparent; display: flex; align-items: center; justify-content: center; }
.pmfa-calls-media-audio .pmfa-calls-avatar-wrap { margin-bottom: 0; }
.pmfa-calls-mini { width: 36px; height: 36px; background: oklch(1 0 0 / 0.14); color: oklch(0.985 0 0); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); }
.pmfa-calls-mini:hover { background: oklch(1 0 0 / 0.22); }
.pmfa-calls-mini svg { width: 16px; height: 16px; }
.pmfa-calls-mini.pmfa-calls-on { background: oklch(0.985 0 0); color: oklch(0.2 0 0); }
.pmfa-calls-more { position: absolute; top: 10px; right: 10px; z-index: 2; }
.pmfa-calls-media-ctrls { position: absolute; bottom: 10px; left: 0; right: 0; display: flex; justify-content: center; gap: 10px; z-index: 2; }
.pmfa-calls-pop-float { position: absolute; left: 50%; transform: translateX(-50%); top: 96px; z-index: 4; }
.pmfa-calls-avatar-wrap { position: relative; width: 72px; height: 72px; margin-bottom: 14px; }
.pmfa-calls-avatar { position: relative; z-index: 1; width: 72px; height: 72px; border-radius: 50%; display: flex; align-items: center; justify-content: center; overflow: hidden; color: oklch(0.985 0 0); font-size: 24px; font-weight: 500; letter-spacing: 0.01em; background: oklch(0.22 0 0); }
.pmfa-calls-audio-hero .pmfa-calls-avatar { border: 1.5px solid var(--pmfa-calls-stage-line); }
.pmfa-calls-avatar-c1 { background: var(--pmfa-calls-avatar-1); }
.pmfa-calls-avatar-c2 { background: var(--pmfa-calls-avatar-2); }
.pmfa-calls-avatar-c3 { background: var(--pmfa-calls-avatar-3); }
.pmfa-calls-avatar-c4 { background: var(--pmfa-calls-avatar-4); }
.pmfa-calls-avatar-c5 { background: var(--pmfa-calls-avatar-5); }
.pmfa-calls-avatar-c6 { background: var(--pmfa-calls-avatar-6); }
.pmfa-calls-avatar-c7 { background: var(--pmfa-calls-avatar-7); }
.pmfa-calls-avatar-c8 { background: var(--pmfa-calls-avatar-8); }
.pmfa-calls-avatar img { width: 100%; height: 100%; object-fit: cover; }
.pmfa-calls-name { font-size: 16px; font-weight: 500; letter-spacing: 0.01em; text-wrap: balance; }
.pmfa-calls-peer { font-size: 12.5px; font-variant-numeric: tabular-nums; color: var(--pmfa-calls-muted); letter-spacing: 0.01em; }
.pmfa-calls-flash { animation: pmfa-calls-swap 0.35s ease; }
@keyframes pmfa-calls-swap { from { opacity: 0; transform: translateY(2px); } to { opacity: 1; transform: none; } }
.pmfa-calls-btn { appearance: none; border: none; margin: 0; padding: 0; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; border-radius: 50%; color: oklch(0.985 0 0); transition: background-color 0.14s ease; }
.pmfa-calls-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.pmfa-calls-btn svg { width: 22px; height: 22px; }
.pmfa-calls-actions { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; margin-top: 22px; width: 100%; }
.pmfa-calls-action { flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; align-items: center; gap: 8px; font-size: 11.5px; color: var(--pmfa-calls-stage-muted); }
.pmfa-calls-btn-answer { width: 56px; height: 56px; background: var(--pmfa-calls-answer); animation: pmfa-calls-beckon 2s ease-in-out infinite; }
.pmfa-calls-btn-answer:hover { background: var(--pmfa-calls-answer-strong); }
.pmfa-calls-btn-decline { width: 56px; height: 56px; background: var(--pmfa-calls-danger); }
.pmfa-calls-btn-decline:hover { background: var(--pmfa-calls-danger-strong); }
@keyframes pmfa-calls-beckon { 0%, 100% { box-shadow: 0 0 0 0 oklch(0.76 0.19 150 / 0.4); } 50% { box-shadow: 0 0 0 10px oklch(0.76 0.19 150 / 0); } }
@keyframes pmfa-calls-fade { from { opacity: 0; } to { opacity: 1; } }
.pmfa-calls-pop { width: 236px; padding: 12px; display: flex; flex-direction: column; gap: 10px; text-align: left; background: var(--pmfa-calls-card); color: var(--pmfa-calls-fg); border: 1px solid var(--pmfa-calls-border); border-radius: calc(var(--pmfa-calls-radius) + 4px); animation: pmfa-calls-fade 0.16s ease; }
.pmfa-calls-field { display: flex; flex-direction: column; gap: 4px; font-size: 10.5px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.07em; color: var(--pmfa-calls-muted); }
.pmfa-calls-select { width: 100%; padding: 7px 8px; font: inherit; font-family: var(--pmfa-calls-font); font-size: 12.5px; font-weight: 400; text-transform: none; letter-spacing: normal; color: var(--pmfa-calls-fg); background: transparent; border: 1px solid var(--pmfa-calls-border); border-radius: var(--pmfa-calls-radius); }
.pmfa-calls-select:focus { outline: none; border-color: var(--pmfa-calls-accent); }
.pmfa-calls-select option { color: initial; background: initial; }
.pmfa-calls-stage { position: relative; width: 100%; aspect-ratio: 4 / 3; border-radius: var(--pmfa-calls-radius); overflow: hidden; background: radial-gradient(130% 90% at 50% 0%, oklch(1 0 0 / 0.06) 0%, transparent 62%), var(--pmfa-calls-stage); color: var(--pmfa-calls-stage-fg); }
.pmfa-calls-video-remote { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; background: var(--pmfa-calls-stage); }
.pmfa-calls-audio-hero { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; text-align: center; }
.pmfa-calls-audio-hero .pmfa-calls-name { font-size: 19px; }
.pmfa-calls-audio-hero .pmfa-calls-peer { color: var(--pmfa-calls-stage-muted); }
.pmfa-calls-hero-preview { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 18px; padding: 0 24px; text-align: center; }
.pmfa-calls-hero-preview .pmfa-calls-peer { color: var(--pmfa-calls-stage-muted); }
.pmfa-calls-inset { position: relative; width: 82%; aspect-ratio: 16 / 10; border-radius: var(--pmfa-calls-radius); overflow: hidden; background: oklch(0.08 0 0); }
.pmfa-calls-pip { position: absolute; right: 14px; bottom: 14px; width: 96px; aspect-ratio: 3 / 4; border-radius: var(--pmfa-calls-radius); overflow: hidden; border: 1.5px solid var(--pmfa-calls-stage-line); background: oklch(0.24 0 0); }
.pmfa-calls-pip video { width: 100%; height: 100%; object-fit: cover; transform: scaleX(-1); }
.pmfa-calls-stage-id { position: absolute; top: 0; left: 0; right: 0; padding: 16px 18px 30px; background: linear-gradient(oklch(0.1 0 0 / 0.6), transparent); color: var(--pmfa-calls-stage-fg); }
.pmfa-calls-stage-id .pmfa-calls-peer { color: var(--pmfa-calls-stage-muted); }
.pmfa-calls-dock-col { position: relative; display: inline-flex; flex-direction: column; align-items: center; }
.pmfa-calls-dock-col > .pmfa-calls-pop { position: absolute; bottom: calc(100% + 10px); left: 50%; transform: translateX(-50%); z-index: 5; }
.pmfa-calls-dock { display: inline-flex; align-items: center; gap: 12px; padding: 10px 14px; border-radius: 999px; border: 1px solid var(--pmfa-calls-stage-line); background: oklch(0.17 0 0 / 0.72); backdrop-filter: blur(18px) saturate(1.4); -webkit-backdrop-filter: blur(18px) saturate(1.4); animation: pmfa-calls-rise 0.32s cubic-bezier(0.16, 1, 0.3, 1); }
.pmfa-calls-btn-ctrl { width: 46px; height: 46px; background: oklch(1 0 0 / 0.1); color: oklch(0.985 0 0); }
.pmfa-calls-btn-ctrl:hover { background: oklch(1 0 0 / 0.18); }
.pmfa-calls-group { display: inline-flex; align-items: stretch; border-radius: 999px; background: oklch(1 0 0 / 0.1); overflow: hidden; }
.pmfa-calls-group.pmfa-calls-disabled { opacity: 0.45; }
.pmfa-calls-group .pmfa-calls-btn-ctrl { background: transparent; border-radius: 0; }
.pmfa-calls-group .pmfa-calls-btn-ctrl:hover { background: oklch(1 0 0 / 0.12); }
.pmfa-calls-group .pmfa-calls-btn-ctrl.pmfa-calls-on { background: oklch(0.985 0 0); }
.pmfa-calls-btn-acc { width: 30px; height: 46px; border-radius: 0; background: transparent; color: oklch(0.985 0 0 / 0.8); border-left: 1px solid oklch(1 0 0 / 0.12); }
.pmfa-calls-btn-acc:hover { background: oklch(1 0 0 / 0.12); transform: none; }
.pmfa-calls-btn-acc svg { width: 14px; height: 14px; transition: transform 0.18s ease; }
.pmfa-calls-btn-acc.pmfa-calls-open svg { transform: rotate(180deg); }
.pmfa-calls-btn-ctrl.pmfa-calls-on { background: oklch(0.985 0 0); color: oklch(0.2 0 0); }
.pmfa-calls-btn-hangup { width: 64px; height: 46px; border-radius: 999px; background: var(--pmfa-calls-danger); }
.pmfa-calls-btn-hangup:hover { background: var(--pmfa-calls-danger-strong); }
.pmfa-calls-dialpad { width: 100%; padding: 20px; display: flex; flex-direction: column; gap: 16px; }
.pmfa-calls-input { width: 100%; border: none; background: transparent; color: var(--pmfa-calls-fg); font-variant-numeric: tabular-nums; font-size: 22px; text-align: center; letter-spacing: 0.03em; padding: 6px 2px 10px; border-bottom: 1px solid var(--pmfa-calls-border); }
.pmfa-calls-input:focus { outline: none; border-bottom-color: var(--pmfa-calls-accent); }
.pmfa-calls-input::placeholder { color: var(--pmfa-calls-muted); opacity: 0.6; }
.pmfa-calls-keys { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; justify-items: center; }
.pmfa-calls-key { appearance: none; border: none; margin: 0; width: 62px; height: 48px; border-radius: var(--pmfa-calls-radius); background: transparent; color: var(--pmfa-calls-fg); font-family: var(--pmfa-calls-font); display: flex; align-items: center; justify-content: center; cursor: pointer; transition: background-color 0.12s ease; }
.pmfa-calls-key:hover { background: var(--pmfa-calls-accent-soft); }
.pmfa-calls-key-digit { font-size: 21px; font-weight: 500; font-variant-numeric: tabular-nums; line-height: 1.1; }
.pmfa-calls-dial-actions { display: flex; align-items: center; justify-content: center; gap: 18px; }
.pmfa-calls-dialpad .pmfa-calls-btn-answer { animation: none; }
.pmfa-calls-key-erase { color: var(--pmfa-calls-muted); }
.pmfa-calls-key-erase:hover { color: var(--pmfa-calls-fg); background: var(--pmfa-calls-accent-soft); }
.pmfa-calls-key-erase svg { width: 20px; height: 20px; }
.pmfa-calls-popout { display: flex; flex-direction: column; align-items: center; gap: 12px; height: 100%; padding: 12px; background: var(--pmfa-calls-stage); }
.pmfa-calls-popout .pmfa-calls-stage { flex: 1; min-height: 0; aspect-ratio: auto; }
.pmfa-calls-popbar { display: flex; align-items: center; justify-content: space-between; gap: 10px; width: 100%; padding: 8px 8px 8px 14px; border-radius: var(--pmfa-calls-radius); border: 1px solid var(--pmfa-calls-stage-line); background: var(--pmfa-calls-stage); color: var(--pmfa-calls-stage-fg); font-size: 13px; }
@keyframes pmfa-calls-rise { from { opacity: 0; transform: translateY(8px) scale(0.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
@media (prefers-reduced-motion: reduce) {
  .pmfa-calls *, .pmfa-calls *::before, .pmfa-calls *::after { animation: none !important; transition: none !important; }
}
`;
