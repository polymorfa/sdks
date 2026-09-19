const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function listTime(time: number, locale: string, now = Date.now()) {
  const date = new Date(time);
  const today = new Date(now);
  if (date.toDateString() === today.toDateString()) {
    return date.toLocaleTimeString(locale, {
      hour: "numeric",
      minute: "2-digit",
    });
  }
  if (now - time < 7 * DAY) {
    return now - time < 2 * DAY &&
      new Date(now - DAY).toDateString() === date.toDateString()
      ? "Yesterday"
      : date.toLocaleDateString(locale, { weekday: "short" });
  }
  return date.toLocaleDateString(locale, { month: "short", day: "numeric" });
}

export function clockTime(time: number, locale: string): string {
  return new Date(time).toLocaleTimeString(locale, {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function relative(time: number, now = Date.now()): string {
  const delta = now - time;
  if (delta < MINUTE) return "just now";
  if (delta < HOUR) return `${Math.floor(delta / MINUTE)}m ago`;
  if (delta < DAY) return `${Math.floor(delta / HOUR)}h ago`;
  return `${Math.floor(delta / DAY)}d ago`;
}

export function dateTime(time: number | string, locale: string): string {
  const value = typeof time === "string" ? Date.parse(time) : time;
  if (!Number.isFinite(value)) return "—";
  return new Date(value).toLocaleString(locale, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** "13h 22m" style remaining time. */
export function remaining(ms: number): string {
  if (ms <= 0) return "0m";
  const hours = Math.floor(ms / HOUR);
  const minutes = Math.floor((ms % HOUR) / MINUTE);
  return hours > 0 ? `${hours}h ${minutes}m` : `${Math.max(1, minutes)}m`;
}

export function duration(seconds: number): string {
  if (seconds <= 0) return "—";
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return minutes >= 60
    ? `${Math.floor(minutes / 60)}h ${minutes % 60}m`
    : minutes > 0
      ? `${minutes}m ${String(rest).padStart(2, "0")}s`
      : `${rest}s`;
}

export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return "—";
  const us = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(phone);
  if (us) return `+1 (${us[1]}) ${us[2]}-${us[3]}`;
  const uk = /^\+44(\d{4})(\d{6})$/.exec(phone);
  if (uk) return `+44 ${uk[1]} ${uk[2]}`;
  return phone.replace(/^(\+\d{1,3})(\d{3})(\d{3})(\d+)$/, "$1 $2 $3 $4");
}

export function number(value: number, locale: string): string {
  return value.toLocaleString(locale);
}

export function percent(part: number, whole: number): number {
  return whole <= 0 ? 0 : Math.round((part / whole) * 100);
}

const LABELS: Readonly<Record<string, string>> = {
  ios: "iOS",
  android: "Android",
  meta_cloud: "Cloud API",
  whatsapp_app: "WhatsApp app",
  business_app: "WhatsApp Business",
};

export function titleCase(value: string): string {
  const known = LABELS[value];
  if (known !== undefined) return known;
  return value
    .replace(/[_.-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
