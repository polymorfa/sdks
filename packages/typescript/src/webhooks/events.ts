export const KNOWN_WEBHOOK_EVENT_TYPES = [
  "blocklist.update",
  "business.quick_reply.update",
  "call.accepted",
  "call.missed",
  "call.participant_joined",
  "call.participant_left",
  "call.participant_state",
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
  readonly from: JidReference;
  readonly sender: JidReference;
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
  readonly messageId: string;
  readonly from: string;
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

export interface MessageDeletePayload {
  readonly from: JidReference;
  readonly sender: JidReference;
  readonly messageId: string;
  readonly fromMe: boolean;
}

export interface PollVotePayload {
  readonly pollMessageId: string;
  readonly voter: JidReference;
  readonly selectedHashes: readonly string[];
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
  readonly joined?: readonly JidReference[];
  readonly left?: readonly JidReference[];
  readonly promoted?: readonly JidReference[];
  readonly demoted?: readonly JidReference[];
}

export interface PresenceUpdatePayload {
  readonly observedAt: number;
  readonly from?: JidReference;
  readonly sender?: JidReference;
  readonly state?: string;
  readonly media?: string;
  readonly unavailable?: boolean;
  readonly lastSeen?: number;
}

export interface ContactUpdatePayload {
  readonly id: string;
  readonly phoneNumber?: string;
  readonly lid?: string;
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
  readonly from: JidReference;
  readonly archive?: boolean;
  readonly pinned?: boolean;
}

export interface ChatMutePayload {
  readonly from: JidReference;
  readonly muted: boolean;
  readonly muteEndTimestamp?: number;
}

export interface ChatReadPayload {
  readonly from: JidReference;
  readonly read: boolean;
}

export interface ChatClearPayload {
  readonly from: JidReference;
}

export interface ChatDeletePayload {
  readonly from: JidReference;
}

export interface CallReceivedPayload {
  readonly from: JidReference;
  readonly callId: string;
}

export interface CallMissedPayload extends CallReceivedPayload {
  readonly reason: string;
}

export type CallAcceptedPayload = CallReceivedPayload;
export type CallRejectedPayload = CallReceivedPayload;

export interface CallParticipant {
  readonly id: string;
  readonly handle: string;
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
  readonly lid?: string;
  readonly id?: string;
  readonly username?: string;
}

export interface BlocklistUpdatePayload {
  readonly action: string;
  readonly changes: readonly BlocklistChange[];
}

export interface LabelsUpdatePayload {
  readonly action: string;
  readonly labelId?: string;
  readonly from?: JidReference;
  readonly label?: string;
  readonly name?: string;
  readonly color?: number;
  readonly orderIndex?: number;
  readonly deleted?: boolean;
  readonly labeled?: boolean;
  readonly observedAt?: number;
  readonly messageId?: string;
  readonly starred?: boolean;
}

export interface HistorySyncPayload {
  readonly messageId: string;
  readonly originalMessageId?: string;
  readonly mode: "deliver";
  readonly syncType: string;
  readonly chunkOrder?: number;
  readonly progress?: number;
  readonly fileLength: number;
  readonly conversationCount: number;
  readonly messageCount: number;
  readonly pushNameCount: number;
  readonly statusMessageCount: number;
  readonly data: string;
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
  readonly "call.missed": CallMissedPayload;
  readonly "call.participant_joined": CallParticipantPayload;
  readonly "call.participant_left": CallParticipantLeftPayload;
  readonly "call.participant_state": CallParticipantPayload;
  readonly "call.received": CallReceivedPayload;
  readonly "call.rejected": CallRejectedPayload;
  readonly "chat.archive": ChatArchivePayload;
  readonly "chat.clear": ChatClearPayload;
  readonly "chat.delete": ChatDeletePayload;
  readonly "chat.mute": ChatMutePayload;
  readonly "chat.read": ChatReadPayload;
  readonly "command.result": CommandResultPayload;
  readonly "contact.update": ContactUpdatePayload;
  readonly "group.participant": GroupParticipantPayload;
  readonly "group.update": GroupUpdatePayload;
  readonly "history.sync": HistorySyncPayload;
  readonly "labels.update": LabelsUpdatePayload;
  readonly "message.ack": MessageAckPayload;
  readonly "message.delete": MessageDeletePayload;
  readonly "message.edited": MessagePayload;
  readonly "message.reaction": MessagePayload;
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
