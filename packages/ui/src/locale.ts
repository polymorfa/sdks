import type { Direction } from "./appearance.js";

export const ENGLISH_MESSAGES = {
  "common.cancel": "Cancel",
  "common.close": "Close",
  "common.retry": "Retry",
  "common.save": "Save",
  "quicklink.launch": "Connect",
  "quicklink.expired": "This connection link expired.",
  "quicklink.complete": "Connected",
  "chat.title": "Messages",
  "chat.empty": "No messages yet",
  "chat.loadMore": "Load earlier messages",
  "composer.placeholder": "Write a message",
  "composer.send": "Send",
  "composer.removeAttachment": "Remove attachment",
  "templates.title": "Template builder",
  "templates.preview": "Preview",
  "templates.submit": "Submit",
  "calls.incoming": "Incoming call",
  "calls.outgoing": "Calling",
  "calls.answer": "Answer",
  "calls.reject": "Reject",
  "calls.hangup": "Hang up",
  "calls.mute": "Mute",
  "calls.unmute": "Unmute",
  "calls.cameraOn": "Turn camera on",
  "calls.cameraOff": "Turn camera off",
  "calls.reconnecting": "Reconnecting",
  "calls.permissionDenied": "Camera or microphone permission was denied.",
} as const;

export type MessageKey = keyof typeof ENGLISH_MESSAGES;

export interface Locale {
  readonly code: string;
  readonly direction: Exclude<Direction, "auto">;
  readonly messages: Readonly<Record<MessageKey, string>>;
}

const RTL_LANGUAGES = new Set(["ar", "fa", "he", "ps", "ur"]);

export function createLocale(
  code: string,
  messages: Partial<Record<MessageKey, string>> = {},
  direction?: Exclude<Direction, "auto">,
): Locale {
  const language = code.toLowerCase().split(/[-_]/, 1)[0] ?? "en";
  return Object.freeze({
    code,
    direction: direction ?? (RTL_LANGUAGES.has(language) ? "rtl" : "ltr"),
    messages: Object.freeze({ ...ENGLISH_MESSAGES, ...messages }),
  });
}
