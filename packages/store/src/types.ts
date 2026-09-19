/**
 * The webhook envelope. Every Polymorfa webhook, and every frame of the
 * planned client-token event stream, has this shape. The server SDK's
 * `WebhookEvent` union is assignable to it.
 */
export interface PolymorfaEvent {
  readonly id: string;
  readonly session: string;
  readonly externalId?: string;
  /** ISO 8601 time the event was produced. */
  readonly timestamp: string;
  /** Event type, for example `message.received`. */
  readonly event: string;
  readonly payload: unknown;
}

export interface IdentityReferenceView {
  readonly id: string;
  readonly phoneNumber?: string;
  readonly bsuid?: string;
  readonly username?: string;
}

export interface ConversationReferenceView extends IdentityReferenceView {
  readonly sender?: IdentityReferenceView;
}

export type DataStoreName =
  | "conversations"
  | "messages"
  | "contacts"
  | "presence"
  | "calls"
  | "labels"
  | "sessions"
  | "templates"
  | "events"
  | "custom";

export type StoreName = DataStoreName | "checkpoints";

export const DATA_STORE_NAMES: readonly DataStoreName[] = [
  "conversations",
  "messages",
  "contacts",
  "presence",
  "calls",
  "labels",
  "sessions",
  "templates",
  "events",
  "custom",
];

/** Fields every stored row carries. */
export interface StoredRow {
  readonly id: string;
  /** Time, in epoch milliseconds, of the newest event applied to the row. */
  readonly _t: number;
  /** Per-field event times used to ignore stale updates. */
  readonly fieldTimes?: Readonly<Record<string, number>>;
}

export type StoredMessageStatus =
  "pending" | "sent" | "delivered" | "read" | "played" | "failed";

export interface StoredAttachment {
  readonly id: string;
  readonly name: string;
  readonly size: number;
  readonly contentType: string;
  readonly url?: string;
  readonly previewUrl?: string;
}

export interface StoredMessage extends StoredRow {
  readonly session: string;
  readonly conversationId: string;
  /** Epoch milliseconds. */
  readonly createdAt: number;
  readonly fromMe: boolean;
  readonly senderId?: string;
  readonly pushName?: string;
  readonly type?: string;
  readonly text?: string;
  readonly caption?: string;
  readonly mimeType?: string;
  readonly filename?: string;
  readonly mediaUrl?: string;
  readonly attachments?: readonly StoredAttachment[];
  readonly clientId?: string;
  /** ID of the message this one replies to. */
  readonly replyTo?: string;
  readonly status: StoredMessageStatus;
  /** Last acknowledgement type as reported, when it was not recognised. */
  readonly ackType?: string;
  readonly edited?: boolean;
  readonly deleted?: boolean;
  readonly revoked?: boolean;
  /** Reaction text keyed by reacting identity. */
  readonly reactions?: Readonly<Record<string, string>>;
  /** Selected poll option hashes keyed by voter. */
  readonly votes?: Readonly<Record<string, readonly string[]>>;
  readonly labelIds?: readonly string[];
  readonly starred?: boolean;
  /** Only status or reaction events have been seen so far. */
  readonly stub?: boolean;
}

export interface ConversationSummaryMessage {
  readonly id: string;
  readonly text: string;
  readonly type?: string;
  readonly fromMe: boolean;
  readonly createdAt: number;
}

export interface StoredConversation extends StoredRow {
  readonly session?: string;
  readonly isGroup?: boolean;
  readonly name?: string;
  readonly description?: string;
  /** Epoch milliseconds of the newest message, or 0. */
  readonly lastActivity: number;
  readonly lastMessage?: ConversationSummaryMessage;
  readonly unreadCount: number;
  readonly markedUnread?: boolean;
  readonly readAt?: number;
  readonly archived?: boolean;
  readonly pinned?: boolean;
  readonly muted?: boolean;
  readonly muteEndTimestamp?: number;
  readonly labelIds?: readonly string[];
  /** Messages at or before this time were cleared and are not restored. */
  readonly clearedAt?: number;
  readonly deleted?: boolean;
}

export interface StoredContact extends StoredRow {
  readonly phoneNumber?: string;
  readonly bsuid?: string;
  readonly username?: string;
  readonly fullName?: string;
  readonly firstName?: string;
  readonly pushName?: string;
  readonly businessName?: string;
  readonly pictureId?: string;
  readonly pictureRemoved?: boolean;
  readonly blocked?: boolean;
}

export interface StoredPresence extends StoredRow {
  readonly state?: string;
  readonly media?: string;
  readonly unavailable?: boolean;
  readonly lastSeen?: number;
  /** Epoch milliseconds. */
  readonly observedAt: number;
}

export type StoredCallState =
  "ringing" | "active" | "rejected" | "missed" | "ended";

export interface StoredCallParticipant {
  readonly id: string;
  readonly state: string;
  readonly phoneNumber?: string;
  readonly username?: string;
  readonly reason?: string;
}

export interface StoredCall extends StoredRow {
  readonly session: string;
  readonly state: StoredCallState;
  readonly from?: IdentityReferenceView;
  readonly direction?: "inbound" | "outbound";
  readonly startedAt: number;
  readonly acceptedAt?: number;
  readonly endedAt?: number;
  readonly durationSeconds?: number;
  readonly reason?: string;
  readonly hadVideo?: boolean;
  readonly participants?: Readonly<Record<string, StoredCallParticipant>>;
  readonly telemetry?: Readonly<Record<string, unknown>>;
}

export interface StoredLabel extends StoredRow {
  readonly name?: string;
  readonly color?: number;
  readonly orderIndex?: number;
  readonly deleted?: boolean;
}

export interface StoredSession extends StoredRow {
  readonly status?: string;
  readonly statusReason?: string;
  readonly phoneNumber?: string;
  readonly pushName?: string;
  readonly phonePlatform?: string;
  readonly accountType?: string;
  readonly businessName?: string;
  readonly loggedOutReason?: string;
  readonly phoneOffline?: {
    readonly daysSinceLastSeen: number;
    readonly daysRemaining: number;
    readonly lastSeen: string;
    readonly action: string;
  };
}

export interface StoredTemplate extends StoredRow {
  readonly templateName?: string;
  readonly status?: string;
  readonly category?: string;
  readonly reason?: string;
  readonly qualityRating?: string;
}

/** A raw event as filed in `events` and `custom`. */
export interface StoredEvent extends StoredRow {
  readonly type: string;
  readonly session: string;
  readonly externalId?: string;
  readonly timestamp: string;
  readonly payload: unknown;
}

export interface StoreRowMap {
  readonly conversations: StoredConversation;
  readonly messages: StoredMessage;
  readonly contacts: StoredContact;
  readonly presence: StoredPresence;
  readonly calls: StoredCall;
  readonly labels: StoredLabel;
  readonly sessions: StoredSession;
  readonly templates: StoredTemplate;
  readonly events: StoredEvent;
  readonly custom: StoredEvent;
}

export interface Checkpoint {
  readonly id: string;
  readonly cursor: string;
  readonly updatedAt: number;
}

/** A change committed to one store. Keys are row IDs. */
export interface StoreChange {
  readonly store: DataStoreName;
  readonly keys: readonly string[];
  readonly deleted: readonly string[];
  /** Every row in the store was removed by `clear()`. */
  readonly cleared?: boolean;
  /** `remote` when another tab made the change. */
  readonly origin: "local" | "remote";
}

export type StoreChangeListener = (change: StoreChange) => void;
