"use client";

import type {
  ConversationMessage,
  MessageAttachment,
} from "@polymorfa/browser";
import { formatFileSize, safeAttachmentUrl } from "@polymorfa/ui";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import type { DeskMessage, DeskMessageKind } from "../../lib/desk/types.js";
import { clockTime, formatPhone } from "../format.js";
import { Icon } from "../icons.js";
import { Avatar, cx } from "../kit.js";

const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

export function kindOf(
  message: ConversationMessage | DeskMessage,
): DeskMessageKind {
  if ("kind" in message) return message.kind;
  const type = message.attachments?.[0]?.contentType ?? "";
  if (type.startsWith("image/")) return "image";
  if (type.startsWith("video/")) return "video";
  if (type.startsWith("audio/")) return "audio";
  return type === "" ? "text" : "document";
}

export interface MessageViewProps {
  readonly message: ConversationMessage | DeskMessage;
  readonly locale: string;
  readonly authorName?: string | undefined;
  readonly onReact?: ((emoji: string) => void) | undefined;
  readonly onOpenImage?: ((url: string, name: string) => void) | undefined;
  readonly onMessageContact?: ((phone: string) => void) | undefined;
  readonly highlight?: string | undefined;
}

/** Bubble contents for every message kind, rendered through `renderMessage`. */
export function MessageView({
  message,
  locale,
  authorName,
  onReact,
  onOpenImage,
  onMessageContact,
  highlight,
}: MessageViewProps) {
  const desk = "kind" in message ? message : undefined;
  const kind = kindOf(message);
  if (kind === "system") {
    return (
      <div className="m-system" role="note">
        <Icon
          name={message.text.includes("Assistant") ? "bot" : "transfer"}
          size={14}
        />
        {message.text}
        <time dateTime={new Date(message.createdAt).toISOString()}>
          {clockTime(message.createdAt, locale)}
        </time>
      </div>
    );
  }
  const outbound = message.direction === "outbound";
  const attachment = message.attachments?.[0];
  return (
    <div
      className={cx(
        "m",
        `m-${kind}`,
        desk?.note && "m-note",
        desk?.bot && "m-from-bot",
      )}
    >
      {desk?.bot && (
        <span className="m-label m-label-bot">
          <Icon name="bot" size={12} /> Automation
        </span>
      )}
      {desk?.note && (
        <span className="m-label m-label-note">
          <Icon name="lock" size={12} /> Private note
          {authorName ? ` · ${authorName}` : ""}
        </span>
      )}
      {!desk?.note && !desk?.bot && outbound && authorName && (
        <span className="m-label">{authorName}</span>
      )}
      {desk?.template && (
        <span className="m-label m-label-template">
          <Icon name="templates" size={12} /> Template · {desk.template.name}
        </span>
      )}

      {attachment && kind === "image" && (
        <ImageAttachment attachment={attachment} onOpen={onOpenImage} />
      )}
      {attachment && kind === "sticker" && (
        <img
          className="m-sticker-img"
          src={safeAttachmentUrl(attachment.url) ?? ""}
          alt="Sticker"
          width={140}
          height={140}
        />
      )}
      {attachment && kind === "video" && (
        <VideoAttachment attachment={attachment} />
      )}
      {attachment && kind === "audio" && (
        <AudioAttachment
          attachment={attachment}
          seed={message.id}
          outbound={outbound}
          transcript={desk?.transcript}
        />
      )}
      {attachment && kind === "document" && (
        <DocumentAttachment attachment={attachment} locale={locale} />
      )}
      {message.attachments && message.attachments.length > 1 && (
        <div className="m-more-files">
          {message.attachments.slice(1).map((extra) => (
            <DocumentAttachment
              key={extra.id}
              attachment={extra}
              locale={locale}
            />
          ))}
        </div>
      )}
      {desk?.location && (
        <a
          className="m-location"
          href={`https://www.google.com/maps/search/?api=1&query=${desk.location.lat},${desk.location.long}`}
          target="_blank"
          rel="noreferrer"
        >
          <span className="m-map" aria-hidden="true">
            <span className="m-map-pin">
              <Icon name="mapPin" size={22} />
            </span>
          </span>
          <span className="m-location-text">
            <strong>{desk.location.name ?? "Shared location"}</strong>
            <span>
              {desk.location.address ??
                `${desk.location.lat.toFixed(4)}, ${desk.location.long.toFixed(4)}`}
            </span>
          </span>
        </a>
      )}
      {desk?.contactCard && (
        <div className="m-contact">
          <div className="m-contact-row">
            <Avatar name={desk.contactCard.name} size={40} />
            <div>
              <strong>{desk.contactCard.name}</strong>
              <span>{formatPhone(desk.contactCard.phone)}</span>
            </div>
          </div>
          {onMessageContact && desk.contactCard.phone && (
            <button
              type="button"
              className="m-contact-action"
              onClick={() => onMessageContact(desk.contactCard!.phone)}
            >
              Message
            </button>
          )}
        </div>
      )}
      {desk?.selection && (
        <span className="m-selection">
          <Icon name="check" size={14} /> {desk.selection.title}
        </span>
      )}

      {message.text !== "" && (
        <p className="m-text">
          <Highlighted text={message.text} term={highlight} />
          {!desk?.interactive && (
            <span
              className={cx("m-time-spacer", outbound && "is-outbound")}
              aria-hidden="true"
            />
          )}
        </p>
      )}

      <span className="m-meta">
        <time dateTime={new Date(message.createdAt).toISOString()}>
          {clockTime(message.createdAt, locale)}
        </time>
        {outbound && !desk?.note && message.status === "sent" && (
          <Ticks state={desk?.delivery ?? "sent"} />
        )}
      </span>

      {desk?.interactive && (
        <div className="m-interactive">
          {desk.interactive.type === "buttons" ? (
            desk.interactive.buttons.map((button) => (
              <span key={button} className="m-button">
                <Icon name="rotate" size={14} /> {button}
              </span>
            ))
          ) : (
            <details className="m-list">
              <summary className="m-button">
                <Icon name="list" size={14} /> {desk.interactive.buttonText}
              </summary>
              <ul>
                {desk.interactive.rows.map((row) => (
                  <li key={row}>{row}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      {desk?.reactions && desk.reactions.length > 0 && (
        <span className="m-reactions" aria-label="Reactions">
          {[...new Set(desk.reactions.map((reaction) => reaction.emoji))].map(
            (emoji) => (
              <span key={emoji}>{emoji}</span>
            ),
          )}
          {desk.reactions.length > 1 && (
            <span className="m-reaction-count">{desk.reactions.length}</span>
          )}
        </span>
      )}
      {onReact && !desk?.note && message.status === "sent" && (
        <ReactionPicker
          current={desk?.reactions?.find((reaction) => reaction.fromMe)?.emoji}
          onReact={onReact}
        />
      )}
    </div>
  );
}

function Highlighted({
  text,
  term,
}: {
  readonly text: string;
  readonly term?: string | undefined;
}) {
  if (!term) return <>{text}</>;
  const lower = text.toLowerCase();
  const needle = term.toLowerCase();
  const parts: ReactNode[] = [];
  let from = 0;
  let index = lower.indexOf(needle);
  while (index !== -1) {
    parts.push(text.slice(from, index));
    parts.push(
      <mark key={index}>{text.slice(index, index + term.length)}</mark>,
    );
    from = index + term.length;
    index = lower.indexOf(needle, from);
  }
  parts.push(text.slice(from));
  return <>{parts}</>;
}

function Ticks({ state }: { readonly state: "sent" | "delivered" | "read" }) {
  const label =
    state === "read" ? "Read" : state === "delivered" ? "Delivered" : "Sent";
  return (
    <span className={cx("ticks", `is-${state}`)} title={label}>
      <Icon name={state === "sent" ? "check" : "checks"} size={16} />
      <span className="sr-only">{label}</span>
    </span>
  );
}

function ReactionPicker({
  current,
  onReact,
}: {
  readonly current?: string | undefined;
  readonly onReact: (emoji: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  return (
    <div className="m-react" ref={ref}>
      <button
        type="button"
        className="m-react-btn"
        aria-label="React"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Icon name="smile" size={16} />
      </button>
      {open && (
        <div className="m-react-pop" role="group" aria-label="Reactions">
          {QUICK_REACTIONS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              aria-pressed={current === emoji}
              onClick={() => {
                setOpen(false);
                onReact(current === emoji ? "" : emoji);
              }}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ImageAttachment({
  attachment,
  onOpen,
}: {
  readonly attachment: MessageAttachment;
  readonly onOpen?: ((url: string, name: string) => void) | undefined;
}) {
  const src = safeAttachmentUrl(attachment.previewUrl ?? attachment.url);
  const full = safeAttachmentUrl(attachment.url) ?? src;
  if (src === undefined) return null;
  return (
    <button
      type="button"
      className="m-image"
      onClick={() => full && onOpen?.(full, attachment.name)}
      aria-label={`Open image ${attachment.name}`}
    >
      <img src={src} alt="" loading="lazy" />
    </button>
  );
}

function VideoAttachment({
  attachment,
}: {
  readonly attachment: MessageAttachment;
}) {
  const url = safeAttachmentUrl(attachment.url);
  const poster = safeAttachmentUrl(attachment.previewUrl);
  const [playing, setPlaying] = useState(false);
  // Demo videos are posters only; real uploads play inline.
  const playable = url !== undefined && !url.endsWith(".svg");
  if (playable && (playing || poster === undefined)) {
    return (
      <video
        className="m-video"
        src={url}
        controls
        autoPlay={playing}
        poster={poster}
      >
        <track kind="captions" />
      </video>
    );
  }
  return (
    <button
      type="button"
      className="m-video-poster"
      onClick={() => playable && setPlaying(true)}
      aria-label={playable ? `Play ${attachment.name}` : attachment.name}
    >
      {poster && <img src={poster} alt="" loading="lazy" />}
      <span className="m-play" aria-hidden="true">
        <Icon name="play" size={22} />
      </span>
      <span className="m-video-length">0:14</span>
    </button>
  );
}

function AudioAttachment({
  attachment,
  seed,
  outbound,
  transcript,
}: {
  readonly attachment: MessageAttachment;
  readonly seed: string;
  readonly outbound: boolean;
  readonly transcript?: string | undefined;
}) {
  const url = safeAttachmentUrl(attachment.url);
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [length, setLength] = useState(0);
  const [showTranscript, setShowTranscript] = useState(false);
  const bars = useMemo(() => waveform(seed), [seed]);

  const toggle = () => {
    const element = audio.current;
    if (!element) return;
    if (element.paused) void element.play();
    else element.pause();
  };

  return (
    <div className="m-audio">
      <div className="m-audio-row">
        <button
          type="button"
          className="m-audio-play"
          onClick={toggle}
          aria-label={playing ? "Pause voice message" : "Play voice message"}
        >
          <Icon name={playing ? "pause" : "play"} size={18} />
        </button>
        <div
          className="m-wave"
          role="slider"
          tabIndex={0}
          aria-label="Playback position"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress * 100)}
          onClick={(event) => {
            const element = audio.current;
            if (!element || !Number.isFinite(element.duration)) return;
            const box = event.currentTarget.getBoundingClientRect();
            element.currentTime =
              ((event.clientX - box.left) / box.width) * element.duration;
          }}
          onKeyDown={(event) => {
            const element = audio.current;
            if (!element) return;
            if (event.key === "ArrowRight") element.currentTime += 1;
            if (event.key === "ArrowLeft") element.currentTime -= 1;
          }}
        >
          {bars.map((height, index) => (
            <span
              key={index}
              style={{ height: `${height}%` }}
              className={
                index / bars.length <= progress ? "is-played" : undefined
              }
            />
          ))}
        </div>
        <span className="m-audio-avatar" aria-hidden="true">
          <Icon name="mic" size={14} />
        </span>
      </div>
      <div className="m-audio-foot">
        <span>{formatSeconds(playing ? progress * length : length)}</span>
        {!outbound && (
          <button
            type="button"
            className="m-transcript-toggle"
            aria-expanded={showTranscript}
            onClick={() => setShowTranscript((value) => !value)}
          >
            {showTranscript ? "Hide transcript" : "Transcript"}
          </button>
        )}
      </div>
      {showTranscript && (
        <p className="m-transcript">
          {transcript ??
            "No transcript yet. Connect a speech-to-text service to fill this in."}
        </p>
      )}
      {url && (
        <audio
          ref={audio}
          src={url}
          preload="metadata"
          onLoadedMetadata={(event) =>
            setLength(
              Number.isFinite(event.currentTarget.duration)
                ? event.currentTarget.duration
                : 0,
            )
          }
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => {
            setPlaying(false);
            setProgress(0);
          }}
          onTimeUpdate={(event) => {
            const element = event.currentTarget;
            if (Number.isFinite(element.duration) && element.duration > 0) {
              setProgress(element.currentTime / element.duration);
            }
          }}
        />
      )}
    </div>
  );
}

function DocumentAttachment({
  attachment,
  locale,
}: {
  readonly attachment: MessageAttachment;
  readonly locale: string;
}) {
  const url = safeAttachmentUrl(attachment.url);
  const extension = attachment.name.split(".").pop()?.toUpperCase() ?? "FILE";
  const body = (
    <>
      <span className="m-doc-icon" data-ext={extension.slice(0, 4)}>
        <Icon name="file" size={22} />
      </span>
      <span className="m-doc-body">
        <strong>{attachment.name}</strong>
        <span>
          {extension} · {formatFileSize(attachment.size, locale)}
        </span>
      </span>
      {url && (
        <span className="m-doc-download" aria-hidden="true">
          <Icon name="download" size={18} />
        </span>
      )}
    </>
  );
  return url ? (
    <a className="m-doc" href={url} download={attachment.name}>
      {body}
      <span className="sr-only">Download {attachment.name}</span>
    </a>
  ) : (
    <div className="m-doc">{body}</div>
  );
}

function waveform(seed: string): number[] {
  let hash = 2166136261;
  for (const char of seed)
    hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return Array.from({ length: 36 }, (_, index) => {
    hash = Math.imul(hash ^ index, 16777619);
    const noise = ((hash >>> 0) % 1000) / 1000;
    const envelope = Math.sin((index / 35) * Math.PI) * 0.6 + 0.4;
    return Math.round(18 + noise * 82 * envelope);
  });
}

function formatSeconds(value: number): string {
  const seconds = Math.max(0, Math.round(value));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
