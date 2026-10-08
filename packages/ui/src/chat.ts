/**
 * Rendering helpers shared by the React and Web Component chat surfaces, so
 * both group, date, and format messages the same way.
 */

export interface ChatLayoutMessage {
  readonly id: string;
  readonly createdAt: number;
  readonly direction: "inbound" | "outbound";
}

/** File-picker hints, not server permissions or upload validation. */
export const ATTACHMENT_KINDS = {
  image: { accept: "image/*", label: "composer.images", icon: "image" },
  video: { accept: "video/*", label: "composer.videos", icon: "video" },
  audio: { accept: "audio/*", label: "composer.audio", icon: "mic" },
  document: { accept: "", label: "composer.documents", icon: "file" },
} as const;
export type AttachmentKind = keyof typeof ATTACHMENT_KINDS;

export type InboxFilter = "all" | "unread" | "drafts" | "archived";
export type InboxRowAction =
  "pin" | "unpin" | "archive" | "unarchive" | "mark-read" | "mark-unread";

/** Presentation only. Hosts supply observations and save any organization changes. */
export function filterInboxRows<
  T extends {
    readonly id: string;
    readonly name?: string;
    readonly phoneNumber?: string;
    readonly subtitle?: string;
    readonly lastActivity: number;
    readonly unreadCount: number;
    readonly pinned?: boolean;
    readonly archived?: boolean;
    readonly markedUnread?: boolean;
    readonly lastMessage?: { readonly text: string };
  },
>(
  rows: readonly T[],
  filter: InboxFilter,
  query: string,
  drafts: Readonly<Record<string, string>> = {},
): readonly T[] {
  const normalized = query.trim().toLocaleLowerCase();
  return rows
    .filter(
      (row) =>
        (filter === "archived"
          ? row.archived === true
          : row.archived !== true) &&
        (filter !== "unread" ||
          row.unreadCount > 0 ||
          row.markedUnread === true) &&
        (filter !== "drafts" || Boolean(drafts[row.id]?.trim())) &&
        [
          row.name,
          row.phoneNumber,
          row.subtitle,
          row.lastMessage?.text,
          drafts[row.id],
        ].some(
          (value) =>
            normalized === "" ||
            value?.toLocaleLowerCase().includes(normalized),
        ),
    )
    .sort(
      (a, b) =>
        Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) ||
        b.lastActivity - a.lastActivity,
    );
}

export type ChatLayoutEntry<T extends ChatLayoutMessage> =
  | {
      readonly kind: "date";
      /** Stable across renders: `date:YYYY-M-D` in local time. */
      readonly key: string;
      readonly time: number;
    }
  | {
      readonly kind: "message";
      readonly key: string;
      readonly message: T;
      /** First message of a run from the same side on the same day. */
      readonly groupStart: boolean;
      /** Last message of that run. */
      readonly groupEnd: boolean;
    };

/** Oldest first; messages without a valid time sort as the newest. */
export function compareMessageTime(
  left: { readonly createdAt: number },
  right: { readonly createdAt: number },
): number {
  const a = sortableTime(left.createdAt);
  const b = sortableTime(right.createdAt);
  return a === b ? 0 : a < b ? -1 : 1;
}

function sortableTime(value: number): number {
  return Number.isNaN(new Date(value).getTime()) ? Infinity : value;
}

/** Local calendar day of a timestamp, or `undefined` for an invalid time. */
export function messageDayKey(time: number): string | undefined {
  const date = new Date(time);
  if (Number.isNaN(date.getTime())) return undefined;
  return `date:${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

/**
 * Sort messages oldest first, insert a date separator before each new day,
 * and mark runs of consecutive messages from the same side.
 */
export function layoutMessages<T extends ChatLayoutMessage>(
  messages: readonly T[],
): readonly ChatLayoutEntry<T>[] {
  const sorted = [...messages].sort(compareMessageTime);
  const days = sorted.map((message) => messageDayKey(message.createdAt));
  const entries: ChatLayoutEntry<T>[] = [];
  sorted.forEach((message, index) => {
    const day = days[index];
    const previous = sorted[index - 1];
    const next = sorted[index + 1];
    if (day !== undefined && day !== days[index - 1])
      entries.push({ kind: "date", key: day, time: message.createdAt });
    entries.push({
      kind: "message",
      key: message.id,
      message,
      groupStart:
        previous === undefined ||
        previous.direction !== message.direction ||
        days[index - 1] !== day,
      groupEnd:
        next === undefined ||
        next.direction !== message.direction ||
        days[index + 1] !== day,
    });
  });
  return entries;
}

/** "Today", "Yesterday", or the localized date. */
export function formatDayLabel(
  time: number,
  localeCode: string,
  labels: { readonly today: string; readonly yesterday: string },
  now: number = Date.now(),
): string {
  const day = messageDayKey(time);
  if (day === messageDayKey(now)) return labels.today;
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (day === messageDayKey(yesterday.getTime())) return labels.yesterday;
  const date = new Date(time);
  return new Intl.DateTimeFormat(localeCode, {
    weekday: "short",
    day: "numeric",
    month: "short",
    ...(date.getFullYear() === new Date(now).getFullYear()
      ? {}
      : { year: "numeric" }),
  }).format(date);
}

/** Localized time of day, or `undefined` for an invalid time. */
export function formatMessageTime(
  time: number,
  localeCode: string,
): string | undefined {
  const date = new Date(time);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toLocaleTimeString(localeCode, {
    hour: "numeric",
    minute: "2-digit",
  });
}

const SIZE_UNITS = ["byte", "kilobyte", "megabyte", "gigabyte"] as const;

/** Human-readable file size, such as `1.4 MB`, in the given locale. */
export function formatFileSize(bytes: number, localeCode: string): string {
  let value = Math.max(0, bytes);
  let unit = 0;
  while (value >= 1024 && unit < SIZE_UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return new Intl.NumberFormat(localeCode, {
    style: "unit",
    unit: SIZE_UNITS[unit],
    unitDisplay: unit === 0 ? "long" : "short",
    maximumFractionDigits: unit === 0 || value >= 10 ? 0 : 1,
  }).format(value);
}

export function isImageAttachment(attachment: {
  readonly contentType: string;
}): boolean {
  return attachment.contentType.toLowerCase().startsWith("image/");
}

export type AttachmentPresentation =
  "image" | "video" | "voice" | "audio" | "document";

/** How a received or sent attachment is drawn inside a bubble. */
export function attachmentPresentation(attachment: {
  readonly contentType: string;
  readonly voice?: boolean;
}): AttachmentPresentation {
  const type = attachment.contentType.toLowerCase();
  if (type.startsWith("image/")) return "image";
  if (type.startsWith("video/")) return "video";
  if (type.startsWith("audio/")) return attachment.voice ? "voice" : "audio";
  return "document";
}

/** `0:18`, `4:05` or `1:02:03`; `undefined` for a missing or invalid length. */
export function formatDuration(
  seconds: number | undefined,
): string | undefined {
  if (seconds === undefined || !Number.isFinite(seconds) || seconds < 0)
    return undefined;
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

/** Upper-case extension of a file name, at most five characters, such as `PDF`. */
export function fileExtension(name: string): string | undefined {
  const match = /\.([a-z0-9]{1,5})$/i.exec(name.trim());
  return match?.[1]?.toUpperCase();
}

/**
 * Resample observed levels to `count` bars between 0.1 and 1. Returns an
 * empty list when there are no usable levels, so no waveform is invented.
 */
export function waveformBars(
  levels: readonly number[] | undefined,
  count = 36,
): readonly number[] {
  const usable = (levels ?? []).filter((level) => Number.isFinite(level));
  if (usable.length === 0 || count <= 0) return [];
  const peak = Math.max(...usable.map((level) => Math.abs(level)), 0);
  if (peak === 0) return Array.from({ length: count }, () => 0.1);
  return Array.from({ length: count }, (_, index) => {
    const start = Math.floor((index * usable.length) / count);
    const end = Math.max(
      start + 1,
      Math.floor(((index + 1) * usable.length) / count),
    );
    const slice = usable.slice(start, end).map((level) => Math.abs(level));
    const value = Math.max(...slice) / peak;
    return Math.round(Math.max(0.1, Math.min(1, value)) * 100) / 100;
  });
}

const SAFE_ATTACHMENT_PROTOCOLS = new Set(["https:", "http:", "blob:"]);

/**
 * `url` when it is an absolute `https:`, `http:`, or `blob:` URL, otherwise
 * `undefined`. Use it before placing an attachment URL in `href` or `src`, so
 * `javascript:` and other schemes never reach the DOM.
 */
export function safeAttachmentUrl(
  url: string | undefined | null,
): string | undefined {
  if (typeof url !== "string" || url.trim() === "") return undefined;
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return undefined;
  }
  return SAFE_ATTACHMENT_PROTOCOLS.has(parsed.protocol)
    ? parsed.href
    : undefined;
}

/**
 * Outline icons (24×24, 2px stroke) used by the chat surfaces. Each value is
 * the `d` attribute of a single `<path>`.
 */
export const CHAT_ICONS = {
  more: "M12 5h.01M12 12h.01M12 19h.01",
  pin: "M16 3 21 8l-5 1-4 4-1 5-5-5 5-1 4-4ZM3 21l5-5",
  archive: "M3 3h18v5H3ZM5 8v13h14V8M10 12h4",
  down: "m7 5 5 5 5-5m-10 6 5 5 5-5",
  image: "M3 3h18v18H3ZM3 16l5-5 4 4 3-3 6 6M8 7h.01",
  close: "M18 6 6 18M6 6l12 12",
  send: "M12 19V5M5 12l7-7 7 7",
  attach:
    "m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48",
  reply: "M9 17 4 12l5-5M20 18v-2a4 4 0 0 0-4-4H4",
  retry: "M3 12a9 9 0 1 0 2.64-6.36L3 8M3 3v5h5",
  pending: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7v5l3 2",
  sent: "M20 6 9 17l-5-5",
  delivered: "M18 6 7 17l-4-4M22 6 11 17l-2-2",
  read: "M18 6 7 17l-4-4M22 6 11 17l-2-2",
  played: "M9 5v14l10-7-10-7Z",
  failed: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 8v4M12 16h.01",
  smiley:
    "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01",
  mic: "M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3ZM19 10v2a7 7 0 0 1-14 0v-2M12 19v3",
  trash:
    "M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6",
  search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM21 21l-4.35-4.35",
  sendArrow: "M5 12h14M13 6l6 6-6 6",
  file: "M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9ZM14 3v6h6",
  back: "M15 18l-6-6 6-6",
  info: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 16v-4M12 8h.01",
  phone:
    "M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92Z",
  video:
    "M23 7l-7 5 7 5V7ZM14 5H3a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2Z",
  link: "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71",
  plus: "M12 5v14M5 12h14",
  play: "M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z",
  pause: "M8 5h2.5v14H8ZM13.5 5H16v14h-2.5Z",
  chevron: "m6 9 6 6 6-6",
  headphones:
    "M3 18v-6a9 9 0 0 1 18 0v6M21 19a2 2 0 0 1-2 2h-1v-6h3ZM3 19a2 2 0 0 0 2 2h1v-6H3Z",
  inbox:
    "M22 12h-6l-2 3h-4l-2-3H2M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11Z",
} as const;

export type ChatIconName = keyof typeof CHAT_ICONS;

/** Transport errors take precedence; receipt state comes only from observed data. */
export function messagePresentationStatus(message: {
  readonly status: "pending" | "sent" | "failed";
  readonly receipt?: {
    readonly state?: "delivered" | "read" | "played";
    readonly deliveredAt?: number;
    readonly readAt?: number;
    readonly playedAt?: number;
  };
}): "pending" | "sent" | "failed" | "delivered" | "read" | "played" {
  if (message.status !== "sent") return message.status;
  const receipt = message.receipt;
  if (receipt?.state) return receipt.state;
  for (const [key, status] of [
    ["playedAt", "played"],
    ["readAt", "read"],
    ["deliveredAt", "delivered"],
  ] as const) {
    const time = receipt?.[key];
    if (time !== undefined && Number.isFinite(time)) return status;
  }
  return "sent";
}
