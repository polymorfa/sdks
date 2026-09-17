/**
 * Rendering helpers shared by the React and Web Component chat surfaces, so
 * both group, date, and format messages the same way.
 */

export interface ChatLayoutMessage {
  readonly id: string;
  readonly createdAt: number;
  readonly direction: "inbound" | "outbound";
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
  close: "M18 6 6 18M6 6l12 12",
  send: "M12 19V5M5 12l7-7 7 7",
  attach:
    "m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48",
  reply: "M9 17 4 12l5-5M20 18v-2a4 4 0 0 0-4-4H4",
  retry: "M3 12a9 9 0 1 0 2.64-6.36L3 8M3 3v5h5",
  pending: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7v5l3 2",
  sent: "M20 6 9 17l-5-5",
  failed: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 8v4M12 16h.01",
  file: "M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9ZM14 3v6h6",
} as const;

export type ChatIconName = keyof typeof CHAT_ICONS;
