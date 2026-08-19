export const KNOWN_WEBHOOK_EVENT_TYPES = [
  "blocklist.update",
  "business.quick_reply.update",
  "call.accepted",
  "call.missed",
  "call.received",
  "call.rejected",
  "chat.archive",
  "chat.clear",
  "chat.delete",
  "chat.mute",
  "chat.read",
  "command.result",
  "contact.update",
  "group.participant",
  "group.update",
  "history.sync",
  "labels.update",
  "message.ack",
  "message.delete",
  "message.edited",
  "message.reaction",
  "message.received",
  "message.revoked",
  "message.sent",
  "message.update",
  "message.vote",
  "newsletter.update",
  "presence.update",
  "session.connected",
  "session.logged_out",
  "session.phone_offline",
  "session.qr",
  "session.status",
] as const;

export type KnownWebhookEventType = (typeof KNOWN_WEBHOOK_EVENT_TYPES)[number];

export interface JidReference {
  readonly id: string;
  readonly phoneNumber?: string;
  readonly lid?: string;
  readonly mode?: "pn" | "lid";
  readonly username?: string;
}

export interface LinkedDeviceMessagePayload {
  readonly id: string;
  readonly from: JidReference;
  readonly sender: JidReference;
  readonly fromMe: boolean;
  readonly timestamp: number;
  readonly pushName: string;
  readonly isGroup: boolean;
  readonly type: string;
  readonly text?: string;
  readonly caption?: string;
  readonly mimeType?: string;
  readonly filename?: string;
  readonly mediaUrl?: string;
  readonly [key: string]: unknown;
}

export interface CloudMessagePayload {
  readonly messageId: string;
  readonly from: string;
  readonly timestamp: string;
  readonly type: string;
  readonly senderName?: string;
  readonly [key: string]: unknown;
}

export type MessageReceivedPayload =
  LinkedDeviceMessagePayload | CloudMessagePayload;

export interface MessageSentPayload {
  readonly id: string;
  readonly from: JidReference;
  readonly type: string;
  readonly timestamp: number;
  readonly sender: JidReference;
}

export interface MessageAckPayload {
  readonly messageIds: readonly string[];
  readonly from: JidReference;
  readonly sender: JidReference;
  readonly type: string;
  readonly timestamp: number;
}

export interface SessionStatusPayload {
  readonly status: string;
  readonly statusReason?: string;
}

export interface SessionQrPayload {
  readonly code: string;
}

export interface SessionConnectedPayload {
  readonly phoneNumber: string;
  readonly lid?: string;
  readonly pushName: string;
  readonly platform: string;
  readonly businessName?: string;
}

export interface SessionLoggedOutPayload {
  readonly reason: string;
}

export interface WebhookPayloadMap {
  readonly "blocklist.update": Readonly<Record<string, unknown>>;
  readonly "business.quick_reply.update": Readonly<Record<string, unknown>>;
  readonly "call.accepted": Readonly<Record<string, unknown>>;
  readonly "call.missed": Readonly<Record<string, unknown>>;
  readonly "call.received": Readonly<Record<string, unknown>>;
  readonly "call.rejected": Readonly<Record<string, unknown>>;
  readonly "chat.archive": Readonly<Record<string, unknown>>;
  readonly "chat.clear": Readonly<Record<string, unknown>>;
  readonly "chat.delete": Readonly<Record<string, unknown>>;
  readonly "chat.mute": Readonly<Record<string, unknown>>;
  readonly "chat.read": Readonly<Record<string, unknown>>;
  readonly "command.result": Readonly<Record<string, unknown>>;
  readonly "contact.update": Readonly<Record<string, unknown>>;
  readonly "group.participant": Readonly<Record<string, unknown>>;
  readonly "group.update": Readonly<Record<string, unknown>>;
  readonly "history.sync": Readonly<Record<string, unknown>>;
  readonly "labels.update": Readonly<Record<string, unknown>>;
  readonly "message.ack": MessageAckPayload;
  readonly "message.delete": Readonly<Record<string, unknown>>;
  readonly "message.edited": Readonly<Record<string, unknown>>;
  readonly "message.reaction": Readonly<Record<string, unknown>>;
  readonly "message.received": MessageReceivedPayload;
  readonly "message.revoked": Readonly<Record<string, unknown>>;
  readonly "message.sent": MessageSentPayload;
  readonly "message.update": Readonly<Record<string, unknown>>;
  readonly "message.vote": Readonly<Record<string, unknown>>;
  readonly "newsletter.update": Readonly<Record<string, unknown>>;
  readonly "presence.update": Readonly<Record<string, unknown>>;
  readonly "session.connected": SessionConnectedPayload;
  readonly "session.logged_out": SessionLoggedOutPayload;
  readonly "session.phone_offline": Readonly<Record<string, unknown>>;
  readonly "session.qr": SessionQrPayload;
  readonly "session.status": SessionStatusPayload;
}

export interface WebhookEventOf<TEvent extends string, TPayload> {
  readonly id: string;
  readonly session: string;
  readonly timestamp: string;
  readonly event: TEvent;
  readonly payload: TPayload;
}

export type KnownWebhookEvent = {
  [TEvent in KnownWebhookEventType]: WebhookEventOf<
    TEvent,
    WebhookPayloadMap[TEvent]
  >;
}[KnownWebhookEventType];

export type MessageReceivedEvent = WebhookEventOf<
  "message.received",
  MessageReceivedPayload
>;
export type UnknownWebhookEvent = WebhookEventOf<string, unknown>;
export type WebhookEvent = KnownWebhookEvent | UnknownWebhookEvent;

export function isEvent<TEvent extends KnownWebhookEventType>(
  event: WebhookEvent,
  type: TEvent,
): event is WebhookEventOf<TEvent, WebhookPayloadMap[TEvent]> {
  return event.event === type;
}
