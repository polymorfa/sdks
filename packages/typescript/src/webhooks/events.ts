import type { PhonePlatform, WhatsAppAccountType } from "../messaging/types.js";

export const KNOWN_WEBHOOK_EVENT_TYPES = [
  "blocklist.update",
  "business.quick_reply.update",
  "call.accepted",
  "call.ended",
  "call.missed",
  "call.participant_joined",
  "call.participant_left",
  "call.participant_state",
  "call.received",
  "call.rejected",
  "call.telemetry",
  "chat.archive",
  "chat.clear",
  "chat.delete",
  "chat.mute",
  "chat.read",
  "command.result",
  "contact.sync",
  "contact.update",
  "group.participant",
  "group.update",
  "history.sync",
  "labels.update",
  "message.ack",
  "message.delete",
  "message.echo",
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
  "session.status",
] as const;

export type KnownWebhookEventType = (typeof KNOWN_WEBHOOK_EVENT_TYPES)[number];

export interface IdentityReference {
  readonly id: string;
  readonly phoneNumber?: string;
  readonly bsuid?: string;
  readonly username?: string;
}

export interface ConversationReference extends IdentityReference {
  readonly sender?: IdentityReference;
}

export interface NativeFlowResponse {
  readonly name: string;
  readonly paramsJson: string;
  readonly version?: number;
}

export interface PollOption {
  readonly name: string;
  readonly hash: string;
}

export type LinkedDeviceMessageType =
  | "text"
  | "image"
  | "video"
  | "audio"
  | "document"
  | "location"
  | "contact"
  | "phone_number_shared"
  | "poll"
  | "sticker"
  | "reaction"
  | "revoke"
  | "edited"
  | "unknown";

export interface LinkedDeviceMessagePayload {
  readonly id: string;
  readonly whatsapp_id: string;
  readonly conversation: ConversationReference;
  readonly fromMe: boolean;
  readonly timestamp: number;
  readonly pushName: string;
  readonly isGroup: boolean;
  readonly type: LinkedDeviceMessageType;
  readonly text?: string;
  readonly caption?: string;
  readonly mimeType?: string;
  readonly ptt?: boolean;
  readonly filename?: string;
  readonly latitude?: number;
  readonly longitude?: number;
  readonly displayName?: string;
  readonly title?: string;
  readonly reaction?: string;
  readonly reactionTo?: string;
  readonly revokedId?: string;
  readonly media?: string;
  readonly mediaUrl?: string;
  readonly edited?: boolean;
  readonly pollOptions?: readonly PollOption[];
  readonly unavailable?: boolean;
  readonly unavailableReason?: string;
  readonly nativeFlowResponse?: NativeFlowResponse;
  readonly [key: string]: unknown;
}

export type MessagePayload = LinkedDeviceMessagePayload;

export interface CloudMessagePayload {
  readonly id: string;
  readonly whatsapp_id: string;
  readonly conversation: ConversationReference;
  readonly timestamp: string;
  readonly type: string;
  readonly senderName?: string;
  readonly nativeFlowResponse?: NativeFlowResponse;
  readonly interactive?: Readonly<Record<string, unknown>>;
  readonly [key: string]: unknown;
}

export type MessageReceivedPayload =
  LinkedDeviceMessagePayload | CloudMessagePayload;

export interface MessageSentPayload {
  readonly id: string;
  readonly whatsapp_id: string;
  readonly conversation: ConversationReference;
  readonly type: string;
  readonly timestamp: number;
}

export interface MessageAckPayload {
  readonly messages: readonly {
    readonly id: string;
    readonly whatsapp_id: string;
  }[];
  readonly conversation: ConversationReference;
  readonly from?: IdentityReference;
  readonly sender?: IdentityReference;
  readonly type: string;
  readonly timestamp: number;
}

export interface MessageDeletePayload {
  readonly from: IdentityReference;
  readonly sender: IdentityReference;
  readonly id: string;
  readonly whatsapp_id: string;
  readonly conversation: ConversationReference;
  readonly fromMe: boolean;
}

export interface PollVotePayload {
  readonly conversation: ConversationReference;
  readonly pollMessageId: string;
  readonly voter: IdentityReference;
  readonly selectedHashes: readonly string[];
  readonly timestamp: number;
}

export interface SessionStatusPayload {
  readonly status: string;
  readonly statusReason?: string;
}

export interface SessionConnectedPayload {
  readonly phoneNumber: string;
  readonly id?: string;
  readonly pushName: string;
  readonly phonePlatform: PhonePlatform;
  readonly accountType: WhatsAppAccountType;
  readonly businessName?: string;
}

export interface SessionLoggedOutPayload {
  readonly reason: string;
}

export interface SessionPhoneOfflinePayload {
  readonly daysSinceLastSeen: number;
  readonly daysRemaining: number;
  readonly lastSeen: string;
  readonly action: string;
}

export interface GroupUpdatePayload {
  readonly id: string;
  readonly newSubject?: string;
  readonly newDescription?: string;
  readonly action?: string;
}

export interface GroupParticipantPayload {
  readonly id: string;
  readonly joined?: readonly IdentityReference[];
  readonly left?: readonly IdentityReference[];
  readonly promoted?: readonly IdentityReference[];
  readonly demoted?: readonly IdentityReference[];
}

export interface PresenceUpdatePayload {
  readonly observedAt: number;
  readonly from?: IdentityReference;
  readonly sender?: IdentityReference;
  readonly state?: string;
  readonly media?: string;
  readonly unavailable?: boolean;
  readonly lastSeen?: number;
}

export interface ContactUpdatePayload {
  readonly id: string;
  readonly phoneNumber?: string;
  readonly bsuid?: string;
  readonly fullName?: string;
  readonly firstName?: string;
  readonly pushName?: string;
  readonly oldPushName?: string;
  readonly businessName?: string;
  readonly oldBusinessName?: string;
  readonly pictureId?: string;
  readonly pictureRemoved?: boolean;
  readonly username?: string;
}

export interface ChatArchivePayload {
  readonly from: IdentityReference;
  readonly archive?: boolean;
  readonly pinned?: boolean;
}

export interface ChatMutePayload {
  readonly from: IdentityReference;
  readonly muted: boolean;
  readonly muteEndTimestamp?: number;
}

export interface ChatReadPayload {
  readonly from: IdentityReference;
  readonly read: boolean;
}

export interface ChatClearPayload {
  readonly from: IdentityReference;
}

export interface ChatDeletePayload {
  readonly from: IdentityReference;
}

export interface CallReceivedPayload {
  readonly from: IdentityReference;
  readonly callId: string;
}

export interface CallMissedPayload extends CallReceivedPayload {
  readonly reason: string;
}

export type CallAcceptedPayload = CallReceivedPayload;
export type CallRejectedPayload = CallReceivedPayload;

export interface CallEndedPayload {
  /** Null when the media host disappeared before reporting caller identity. */
  readonly from: IdentityReference | null;
  readonly callId: string;
  readonly durationSeconds: number;
  /** Includes pod_lost for calls ended after the media host disappears. */
  readonly reason: string;
  readonly direction: "inbound" | "outbound";
  readonly hadVideo: boolean;
}

export interface CallTelemetryPayload {
  readonly callId: string;
  readonly setupMs: number;
  readonly ringMs: number;
  readonly durationSeconds: number;
  readonly terminateReason: string;
  readonly codec: string;
  readonly jitterMs: number;
  readonly packetsLost: number;
  readonly rttMs: number;
  /** Cumulative received kilobits, despite the legacy field name. */
  readonly recvKbps: number;
  /** Cumulative sent kilobits, despite the legacy field name. */
  readonly sendKbps: number;
}

export interface CallParticipant {
  readonly id: string;
  readonly phoneNumber?: string;
  readonly bsuid?: string;
  readonly username?: string;
  readonly audioMuted: false;
  readonly video: false;
  readonly state: "invited" | "ringing" | "connected" | "left";
}

export interface CallParticipantPayload {
  readonly callId: string;
  readonly participant: CallParticipant;
}

export interface CallParticipantLeftPayload {
  readonly callId: string;
  readonly participantId: string;
  readonly reason?: string;
}

export interface NewsletterUpdatePayload {
  readonly id: string;
  readonly action: string;
  readonly muted?: boolean;
}

export interface BlocklistChange {
  readonly action: string;
  readonly phoneNumber?: string;
  readonly bsuid?: string;
  readonly id: string;
  readonly username?: string;
}

export interface BlocklistUpdatePayload {
  readonly action: string;
  readonly changes: readonly BlocklistChange[];
}

export interface LabelsUpdatePayload {
  /** label_edit, label_association_chat, label_association_message, or star. */
  readonly action: string;
  readonly labelId?: string;
  readonly from?: IdentityReference;
  readonly label?: string;
  readonly name?: string;
  readonly color?: number;
  readonly orderIndex?: number;
  readonly deleted?: boolean;
  readonly labeled?: boolean;
  readonly observedAt?: number;
  /** Polymorfa message ID; an association alone may not supply its routing key. */
  readonly messageId?: string;
  readonly starred?: boolean;
}

export type HistorySyncPayload =
  LinkedHistorySyncPayload | CloudHistorySyncPayload;

export interface CloudHistorySyncPayload {
  readonly kind: "history";
  readonly value: Readonly<Record<string, unknown>>;
}

export interface LinkedHistorySyncPayload {
  readonly whatsapp_id: string;
  readonly original_whatsapp_id?: string;
  readonly messages: readonly {
    readonly id: string;
    readonly whatsapp_id: string;
    readonly conversation: IdentityReference;
    readonly fromMe?: boolean;
  }[];
  readonly mode: "deliver";
  readonly syncType: string;
  readonly chunkOrder?: number;
  readonly progress?: number;
  readonly fileLength: number;
  readonly conversationCount: number;
  readonly messageCount: number;
  readonly pushNameCount: number;
  readonly statusMessageCount: number;
  readonly whatsapp: {
    readonly encoding: "gzip-base64-protobuf";
    readonly data: string;
  };
}

/** Meta Cloud API contact synchronization batch. */
export interface ContactsSyncPayload {
  readonly kind: "contacts";
  readonly value: Readonly<Record<string, unknown>>;
}

/** A message sent from the WhatsApp Business app on a Meta Cloud API number. */
export interface MessageEchoPayload {
  readonly source: "whatsapp_business_app";
  readonly value: Readonly<Record<string, unknown>>;
}

export interface CommandResultPayload {
  readonly requestId: string;
  readonly command: string;
  readonly success: boolean;
  readonly data?: Readonly<Record<string, unknown>>;
  readonly error?: string;
}

export interface BusinessQuickReplyUpdatePayload {
  readonly id: string;
  readonly shortcut: string;
  readonly message: string;
  readonly keywords: readonly string[];
  readonly count: number;
  readonly deleted: boolean;
  readonly associatedLabelIds: readonly string[];
  readonly observedAt: number;
  readonly fromFullSync: boolean;
}

export interface WebhookPayloadMap {
  readonly "blocklist.update": BlocklistUpdatePayload;
  readonly "business.quick_reply.update": BusinessQuickReplyUpdatePayload;
  readonly "call.accepted": CallAcceptedPayload;
  readonly "call.ended": CallEndedPayload;
  readonly "call.missed": CallMissedPayload;
  readonly "call.participant_joined": CallParticipantPayload;
  readonly "call.participant_left": CallParticipantLeftPayload;
  readonly "call.participant_state": CallParticipantPayload;
  readonly "call.received": CallReceivedPayload;
  readonly "call.rejected": CallRejectedPayload;
  readonly "call.telemetry": CallTelemetryPayload;
  readonly "chat.archive": ChatArchivePayload;
  readonly "chat.clear": ChatClearPayload;
  readonly "chat.delete": ChatDeletePayload;
  readonly "chat.mute": ChatMutePayload;
  readonly "chat.read": ChatReadPayload;
  readonly "command.result": CommandResultPayload;
  readonly "contact.sync": ContactsSyncPayload;
  readonly "contact.update": ContactUpdatePayload;
  readonly "group.participant": GroupParticipantPayload;
  readonly "group.update": GroupUpdatePayload;
  readonly "history.sync": HistorySyncPayload;
  readonly "labels.update": LabelsUpdatePayload;
  readonly "message.ack": MessageAckPayload;
  readonly "message.delete": MessageDeletePayload;
  readonly "message.echo": MessageEchoPayload;
  readonly "message.edited": MessagePayload;
  readonly "message.reaction": MessageReceivedPayload;
  readonly "message.received": MessageReceivedPayload;
  readonly "message.revoked": MessagePayload;
  readonly "message.sent": MessageSentPayload;
  readonly "message.update": MessagePayload;
  readonly "message.vote": PollVotePayload;
  readonly "newsletter.update": NewsletterUpdatePayload;
  readonly "presence.update": PresenceUpdatePayload;
  readonly "session.connected": SessionConnectedPayload;
  readonly "session.logged_out": SessionLoggedOutPayload;
  readonly "session.phone_offline": SessionPhoneOfflinePayload;
  readonly "session.status": SessionStatusPayload;
}

export interface WebhookEventOf<TEvent extends string, TPayload> {
  readonly id: string;
  readonly session: string;
  /** Integrator reference from the QuickLink that created the session, when supplied. */
  readonly externalId?: string;
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
