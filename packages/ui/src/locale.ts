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
  "calls.audioCall": "WhatsApp audio call",
  "calls.videoCall": "WhatsApp video call",
  "calls.ringing": "Ringing",
  "calls.connecting": "Connecting",
  "calls.connected": "Connected",
  "calls.ended": "Call ended",
  "calls.failed": "Call failed",
  "calls.answerWithCamera": "Answer with camera",
  "calls.answerWithoutCamera": "Answer without camera",
  "calls.answerMuted": "Answer muted",
  "calls.answerUnmuted": "Answer unmuted",
  "calls.deviceSettings": "Audio and video settings",
  "calls.microphone": "Microphone",
  "calls.speaker": "Speaker",
  "calls.camera": "Camera",
  "calls.microphoneSettings": "Microphone and speaker settings",
  "calls.cameraSettings": "Camera settings",
  "calls.popOut": "Open in a separate window",
  "calls.popIn": "Return to the page",
  "calls.placeAudioCall": "Place audio call",
  "calls.placeVideoCall": "Place video call",
  "calls.dialPlaceholder": "Phone number",
  "calls.dismiss": "Dismiss",
  "calls.incomingFrom": "Incoming call from {peer}",
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
