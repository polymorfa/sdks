import type {
  MessagingConnection,
  WhatsAppMessageIds,
  PhonePlatform,
  WhatsAppAccountType,
} from "../messaging/types.js";

export const KNOWN_WEBHOOK_EVENT_TYPES = [
  "bansafe.action",
  "bansafe.claim",
  "bansafe.enforcement",
  "bansafe.health_changed",
  "bansafe.health_threshold",
  "bansafe.incident",
  "bansafe.risk_changed",
  "blocklist.update",
  "business.quick_reply.update",
  "call.accepted",
  "call.connection_joined",
  "call.connection_left",
  "call.ended",
  "call.missed",
  "call.participant_joined",
  "call.participant_left",
  "call.participant_state",
  "call.received",
  "call.rejected",
  "call.telemetry",
  "campaign.cap_reached",
  "campaign.cold_blocked",
  "campaign.completed",
  "campaign.failed",
  "campaign.paused",
  "campaign.recipient_failed",
  "campaign.recipient_sent",
  "campaign.recipient_skipped",
  "campaign.throttled",
  "chat.archive",
  "chat.clear",
  "chat.delete",
  "chat.mute",
  "chat.read",
  "command.result",
  "contact.opted_in",
  "contact.opted_out",
  "contact.sync",
  "contact.update",
  "customer.archived",
  "customer.archiving",
  "customer.created",
  "customer.enabled",
  "customer.number.attached",
  "customer.number.disconnected",
  "customer.number.transferred",
  "customer.pairing_link.connected",
  "customer.pairing_link.created",
  "customer.pairing_link.expired",
  "customer.pairing_link.failed",
  "customer.pairing_link.opened",
  "customer.pairing_link.revoked",
  "customer.restored",
  "customer.updated",
  "group.participant",
  "group.update",
  "history.sync",
  "labels.update",
  "message.ack",
  "message.delete",
  "message.echo",
  "message.edited",
  "message.failed",
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
  "session.restriction_updated",
  "session.status",
  "template.status",
  "usage.recorded",
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
  readonly whatsapp_ids: WhatsAppMessageIds;
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
  readonly whatsapp_ids: WhatsAppMessageIds;
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
  readonly whatsapp_ids: WhatsAppMessageIds;
  readonly conversation: ConversationReference;
  readonly type: string;
  readonly timestamp: number;
}

export interface MessageAckPayload {
  readonly messages: readonly {
    readonly id: string;
    readonly whatsapp_ids: WhatsAppMessageIds;
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
  readonly whatsapp_ids: WhatsAppMessageIds;
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

export type SessionRestrictionType = "reachout_timelock";

export interface SessionRestrictionUpdatedPayload {
  readonly type: SessionRestrictionType;
  readonly active: boolean;
  readonly enforcementType: string | null;
  readonly expiresAt: string | null;
  readonly observedAt: string;
}

/** A revisioned usage observation. A later revision of the same id replaces it. */
export interface UsageRecordedPayload {
  readonly id: string;
  readonly meter:
    | "call.duration"
    | "call.cloud_pulses"
    | "campaign.call"
    | "tts.characters"
    | "tts.seconds"
    | "stt.seconds"
    | "agent.seconds"
    | "agent.tokens"
    | "agent.provider_cost"
    | "channels.peak"
    | "storage.byte_days";
  readonly quantity: number;
  readonly unit:
    | "second"
    | "pulse"
    | "call"
    | "character"
    | "token"
    | "provider_unit"
    | "channel"
    | "byte_day";
  readonly dimensions: Readonly<Record<string, string | number | boolean>>;
  readonly keySource: "none" | "managed" | "customer";
  readonly sourceKind:
    "call" | "attempt" | "flow_run" | "conversation" | "asset" | "team";
  readonly sourceId: string;
  readonly projectId: string | null;
  readonly session: string | null;
  readonly occurredAt: string;
  readonly recordedAt: string;
  readonly revision: number;
  readonly pricingState: "unpriced" | "priced" | "waived" | "settled";
  readonly rateCard: { readonly id: string; readonly version: number } | null;
  readonly pricedCredits: number | null;
}

export interface SessionConnectedPayload {
  readonly phoneNumber: string;
  readonly id?: string;
  readonly pushName: string;
  readonly phonePlatform: PhonePlatform;
  readonly accountType: WhatsAppAccountType;
  readonly businessName?: string;
}

/**
 * Why a session was logged out: `banned` (WhatsApp banned the account),
 * `device_removed` (the linked device was removed from the phone or another
 * device) or `unknown`.
 */
export type SessionLoggedOutReason = "banned" | "device_removed" | "unknown";

export interface SessionLoggedOutPayload {
  readonly reason: "banned" | "device_removed" | "unknown";
  /** WhatsApp's logout code, or 0 when none was given. */
  readonly code: number;
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

/**
 * Payload for `contact.opted_out` and `contact.opted_in`. Emitted when a
 * contact replies to a campaign number with one of the organization's
 * configured keywords and the suppression list changed. The reply itself is
 * never included.
 */
export interface ContactOptPayload {
  /** Contact phone number in E.164 format. */
  readonly phone: string;
  /** How the change was made. Keyword replies are always `stop-keyword`. */
  readonly source: "stop-keyword";
  /** The matched keyword, normalized to upper case. */
  readonly keyword: string;
  /** Session name of the number that received the reply. */
  readonly session: string;
  /** Project that owns the receiving number, when known. */
  readonly projectId?: string;
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

/** What a call supports, as reported by the session that carries it. */
export interface WebhookCallCapabilities {
  readonly video: boolean;
  /** Other parties can be invited, turning the call into a group call. */
  readonly invite: boolean;
}

export interface CallReceivedPayload {
  readonly from: IdentityReference;
  readonly callId: string;
  readonly hasVideo: boolean;
  /** How the session is connected to WhatsApp. */
  readonly sessionConnection?: MessagingConnection;
  readonly capabilities?: WebhookCallCapabilities;
}

export interface CallMissedPayload {
  readonly from: IdentityReference;
  readonly callId: string;
  readonly reason: string;
}

export interface CallAcceptedPayload {
  readonly from: IdentityReference;
  readonly callId: string;
  /** Participant reference that answered first, when known. */
  readonly answeredBy?: string;
  /** The answer claimed the call: other participants stopped ringing. */
  readonly exclusive?: boolean;
  readonly sessionConnection?: MessagingConnection;
  readonly capabilities?: WebhookCallCapabilities;
}

export interface CallRejectedPayload {
  readonly from: IdentityReference;
  readonly callId: string;
}

export interface CallEndedPayload {
  /** Null when the media host disappeared before reporting caller identity. */
  readonly from: IdentityReference | null;
  readonly callId: string;
  readonly durationSeconds: number;
  /** Includes pod_lost for calls ended after the media host disappears. */
  readonly reason: string;
  readonly direction: "inbound" | "outbound";
  readonly hadVideo: boolean;
  readonly sessionConnection?: MessagingConnection;
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

/** One media connection to a call: a browser, app, server, or SIP trunk. */
export interface CallConnection {
  readonly id: string;
  /** `client:<id>` for a client token, `server:<id>` for a server credential. */
  readonly participant: string;
  readonly transport: "webrtc" | "socket" | "sip";
}

export interface CallConnectionJoinedPayload {
  readonly callId: string;
  readonly connection: CallConnection;
}

/**
 * Why a connection left. A SIP trunk that never joined reports a `sip_*`
 * reason, `claimed`, or `call_ended`, with no joined event before it.
 */
export type CallConnectionLeftReason =
  | "left"
  | "replaced"
  | "claimed"
  | "call_ended"
  | "sip_busy"
  | "sip_declined"
  | "sip_no_answer"
  | "sip_unavailable"
  | "sip_auth_failed";

export interface CallConnectionLeftPayload {
  readonly callId: string;
  readonly connectionId: string;
  readonly participant: string;
  readonly reason: CallConnectionLeftReason;
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
  readonly whatsapp_ids: WhatsAppMessageIds;
  readonly original_whatsapp_ids?: WhatsAppMessageIds;
  readonly messages: readonly {
    readonly id: string;
    readonly whatsapp_ids: WhatsAppMessageIds;
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

/** Principal that caused a Customer lifecycle change. */
export type CustomerEventActorKind =
  "better_auth" | "org_key" | "project_token" | "cli_grant" | "system";

/** Fields shared by every Customer lifecycle webhook payload. */
export interface CustomerEventPayload {
  readonly eventId: string;
  readonly occurredAt: string;
  readonly organizationId: string;
  readonly projectId: string;
  readonly customerId: string;
  readonly actorKind: CustomerEventActorKind;
}

export type CustomerCreatedPayload = CustomerEventPayload;
export type CustomerArchivedPayload = CustomerEventPayload;
export type CustomerRestoredPayload = CustomerEventPayload;

export interface CustomerUpdatedPayload extends CustomerEventPayload {
  readonly fields: readonly ("name" | "phone" | "externalCustomerId")[];
}

export interface CustomerEnabledPayload extends CustomerEventPayload {
  readonly migratedNumberCount: number;
}

export interface CustomerArchivingPayload extends CustomerEventPayload {
  readonly blockingNumberCount: number;
  readonly revokedPairingLinkCount: number;
}

export interface CustomerPairingLinkPayload extends CustomerEventPayload {
  readonly pairingLinkId: string;
}

export type CustomerPairingLinkCreatedPayload = CustomerPairingLinkPayload;
export type CustomerPairingLinkOpenedPayload = CustomerPairingLinkPayload;
export type CustomerPairingLinkExpiredPayload = CustomerPairingLinkPayload;

export interface CustomerPairingLinkConnectedPayload extends CustomerPairingLinkPayload {
  readonly sessionId: string;
}

export interface CustomerPairingLinkFailedPayload extends CustomerPairingLinkPayload {
  readonly errorCode: string;
}

export interface CustomerPairingLinkRevokedPayload extends CustomerPairingLinkPayload {
  readonly reason?:
    | "customer_archived"
    | "phone_mismatch_limit"
    | "exchange_failure_limit"
    | "terminal_failure";
}

export interface CustomerNumberAttachedPayload extends CustomerEventPayload {
  readonly sessionId: string;
  readonly pairingLinkId?: string;
}

export interface CustomerNumberTransferredPayload extends CustomerEventPayload {
  readonly sessionId: string;
  readonly sourceCustomerId: string;
}

export interface CustomerNumberDisconnectedPayload extends CustomerEventPayload {
  readonly sessionId: string;
  readonly reason: string;
}

export type BanSafeIncidentEventKind =
  | "cap_warning"
  | "cap_reached"
  | "timelock"
  | "temporary_ban"
  | "permanent_ban"
  | "connect_blocked"
  | "customer_report";

export type BanSafeEventRung =
  "none" | "notify" | "throttle" | "block_cold" | "suspend";

export type BanSafeRiskLevel = "low" | "elevated" | "high" | "critical";
export type BanSafeHealthBandName =
  "good" | "fair" | "poor" | "failing" | "unknown";

export interface BanSafeForecast {
  /** Probability (0-1) of a temporary or permanent ban within 7 days. */
  readonly days7: number;
  readonly days14: number;
  readonly days30: number;
}

/** The factor group a risk factor belongs to. */
export type BanSafeRiskFactorGroup =
  | "volume"
  | "cold_outreach"
  | "restrictions"
  | "engagement"
  | "send_errors"
  | "pattern"
  | "traffic_mix"
  | "number_age"
  | "connection"
  | "ban_history"
  | "account"
  | "workspace"
  | "climate"
  | "conversation"
  | "solicitation"
  | "reputation";

export interface BanSafeRiskFactor {
  /** Feature key, or `group:<groupId>`. */
  readonly key: string;
  readonly group: BanSafeRiskFactorGroup;
  readonly label: string;
  readonly direction: "raises" | "lowers";
  readonly strength: "strong" | "moderate" | "slight";
  /** Share, as a whole percentage, of the raising or lowering total. */
  readonly impact: number;
  readonly sentence: string;
  readonly hint: string | null;
}

export interface BanSafeModelRef {
  readonly version: string;
  readonly reliability: "prior" | "early" | "calibrated";
}

export interface BanSafeRiskChangedPayload {
  /** The customer's own number in E.164 format. */
  readonly phoneNumber: string;
  readonly level: BanSafeRiskLevel;
  /** Null for the first evaluation of the number. */
  readonly previousLevel: BanSafeRiskLevel | null;
  /** Risk score from 0 (lowest) to 100 (highest). */
  readonly score: number;
  readonly forecast: BanSafeForecast;
  /** Up to five contributing factors, ordered by impact. */
  readonly factors: readonly BanSafeRiskFactor[];
  readonly model: BanSafeModelRef;
  readonly evaluatedAt: string;
}

export interface BanSafeHealthPenalties {
  readonly conduct: number;
  readonly restriction: number;
  readonly connection: number;
}

export interface BanSafeHealthFinding {
  readonly key: string;
  readonly title: string;
  readonly severity: "info" | "warning" | "critical";
  /** `not_measured` means the signal could not be measured for this number. */
  readonly status: "open" | "acknowledged" | "not_measured";
  /** Health points this finding costs. */
  readonly points: number;
}

export interface BanSafeHealthChangedPayload {
  readonly phoneNumber: string;
  /** Health from 0 (worst) to 100 (best), or null when not measured. */
  readonly health: number | null;
  readonly band: BanSafeHealthBandName;
  readonly previousBand: BanSafeHealthBandName | null;
  readonly state:
    "measured" | "partial" | "measuring" | "restricted" | "banned";
  readonly penalties: BanSafeHealthPenalties;
  readonly findings: readonly BanSafeHealthFinding[];
  readonly measuredChecks: number;
  readonly totalChecks: number;
  /** Messages allowed today under the warm-up plan; null or absent without one. */
  readonly allowance?: number | null;
  readonly evaluatedAt: string;
}

export interface BanSafeHealthThresholdPayload {
  readonly sessionId: string;
  readonly projectId: string;
  /** Health from 0 to 100. */
  readonly health: number;
  readonly threshold: number;
  readonly healthSource: "rules_v1" | "ml_model";
  readonly estimatorVersion: string;
  readonly modelVersion: string | null;
  readonly evaluatedAt: string;
  readonly policyVersion: number;
  readonly episodeId: string;
  readonly actionId: string;
}

export interface BanSafeEnforcementPayload {
  readonly phoneNumber: string;
  readonly kind: BanSafeIncidentEventKind;
  readonly source: "runtime" | "customer";
  readonly code?: number;
  readonly subCode?: number;
  readonly reason?: string;
  readonly enforcementType?: string;
  readonly startedAt: string;
  readonly endsAt?: string;
}

/** A finding that must be resolved before a BanSafe action can lift. */
export interface BanSafeRequiredFinding {
  readonly findingKey: string;
  readonly title: string;
  readonly severity: "info" | "warning" | "critical";
}

export interface BanSafeActionPayload {
  readonly phoneNumber: string;
  readonly action: "applied" | "changed" | "lifted" | "daily_allowance_reached";
  readonly scope: "number" | "organization";
  readonly rung: BanSafeEventRung;
  readonly previousRung: BanSafeEventRung | null;
  readonly reason:
    | "health"
    | "finding"
    | "org_pattern"
    | "repeat"
    | "restriction"
    | "operator"
    | "health_model_cutover"
    | "warmup";
  readonly health: number | null;
  readonly healthBand: "good" | "fair" | "poor" | "failing" | "unknown";
  readonly requires: readonly BanSafeRequiredFinding[];
  readonly throughputPerMinute: number | null;
  readonly eligibleLiftAt: string | null;
  readonly liftRequires: string;
  readonly appealUrl: string;
  readonly startedAt: string;
  readonly docs: string;
}

export interface BanSafeIncidentPayload {
  readonly id: string;
  readonly phoneNumber: string;
  readonly kind: BanSafeIncidentEventKind;
  readonly source: "runtime" | "customer";
  readonly startedAt: string;
  readonly endsAt: string | null;
  /** Probability from 0 to 1 that the incident was a real enforcement. */
  readonly belief: number;
  readonly resolution:
    "open" | "corroborated" | "contradicted" | "phone_switch" | "final";
  readonly claimId: string | null;
  readonly closedAt: string | null;
}

export interface BanSafeClaimPayload {
  readonly id: string;
  readonly incidentId: string;
  readonly phoneNumber: string;
  readonly status:
    "filed" | "under_review" | "approved" | "denied" | "paid" | "reversed";
  readonly verdict:
    | "other_device"
    | "customer_conduct"
    | "shared_network"
    | "ours"
    | "inconclusive";
  readonly windowStart: string;
  readonly windowEnd: string;
  /** Decimal cent amounts with up to six fractional digits. */
  readonly measuredCents: number;
  readonly capCents: number;
  readonly amountCents: number;
  readonly summary: string;
  readonly reason: string;
  readonly decidedAt: string | null;
  readonly paidAt: string | null;
}

export type MessageFailedReason =
  | "invalid_recipient"
  | "session_not_connected"
  | "ack_timeout"
  | "send_failed"
  | "blocked_by_safety";

export interface MessageFailedPayload {
  readonly to: IdentityReference;
  readonly type: string;
  readonly error: MessageFailedReason;
  readonly code?: string;
  /** Seconds to wait before retrying, when the failure is retryable. */
  readonly retryAfter?: number;
  readonly timestamp: number;
}

export interface TemplateStatusPayload {
  readonly templateName: string;
  readonly templateId: string;
  readonly status: string;
  readonly category: string;
  readonly reason: string;
  readonly qualityRating: string;
}

export interface CampaignPausedPayload {
  readonly campaignId: string;
  readonly sentCount: number;
  readonly remainingCount: number;
  readonly pausedAt: number;
}

export interface CampaignCompletedPayload {
  readonly campaignId: string;
  readonly sentCount: number;
  readonly deliveredCount: number;
  readonly readCount: number;
  readonly failedCount: number;
  readonly skippedCount: number;
  readonly responseCount: number;
  readonly completedAt: number;
  readonly durationMs: number;
}

export interface CampaignFailedPayload {
  readonly campaignId: string;
  readonly reason: string;
  readonly failedAt: number;
}

export interface CampaignRecipientSentPayload {
  readonly campaignId: string;
  readonly recipientId: string;
  readonly phone: string;
  readonly sessionKey: string;
  readonly externalMessageId: string;
  readonly variantKey: string;
  readonly attempt: number;
}

export interface CampaignRecipientFailedPayload {
  readonly campaignId: string;
  readonly recipientId: string;
  readonly phone: string;
  readonly attempts: number;
  readonly error: string;
  readonly failedAt: number;
}

export interface CampaignRecipientSkippedPayload {
  readonly campaignId: string;
  readonly recipientId: string;
  readonly phone: string;
  readonly reason: string;
  readonly skippedAt: number;
}

export interface CampaignThrottledPayload {
  readonly campaignId: string;
  readonly sessionKey: string;
  readonly reason: string;
  readonly deferredCount: number;
  readonly at: number;
}

export interface CampaignCapReachedPayload {
  readonly campaignId: string;
  readonly sessionKey: string;
  readonly phone: string;
  readonly capType: string;
  readonly capLimit: number;
  readonly windowResetsAt: number;
  readonly at: number;
}

export interface CampaignColdBlockedPayload {
  readonly campaignId: string;
  readonly recipientId: string;
  readonly phone: string;
  readonly surface: string;
  readonly reason: string;
  readonly at: number;
}

export interface WebhookPayloadMap {
  readonly "bansafe.action": BanSafeActionPayload;
  readonly "bansafe.claim": BanSafeClaimPayload;
  readonly "bansafe.enforcement": BanSafeEnforcementPayload;
  readonly "bansafe.health_changed": BanSafeHealthChangedPayload;
  readonly "bansafe.health_threshold": BanSafeHealthThresholdPayload;
  readonly "bansafe.incident": BanSafeIncidentPayload;
  readonly "bansafe.risk_changed": BanSafeRiskChangedPayload;
  readonly "blocklist.update": BlocklistUpdatePayload;
  readonly "business.quick_reply.update": BusinessQuickReplyUpdatePayload;
  readonly "call.accepted": CallAcceptedPayload;
  readonly "call.connection_joined": CallConnectionJoinedPayload;
  readonly "call.connection_left": CallConnectionLeftPayload;
  readonly "call.ended": CallEndedPayload;
  readonly "call.missed": CallMissedPayload;
  readonly "call.participant_joined": CallParticipantPayload;
  readonly "call.participant_left": CallParticipantLeftPayload;
  readonly "call.participant_state": CallParticipantPayload;
  readonly "call.received": CallReceivedPayload;
  readonly "call.rejected": CallRejectedPayload;
  readonly "call.telemetry": CallTelemetryPayload;
  readonly "campaign.cap_reached": CampaignCapReachedPayload;
  readonly "campaign.cold_blocked": CampaignColdBlockedPayload;
  readonly "campaign.completed": CampaignCompletedPayload;
  readonly "campaign.failed": CampaignFailedPayload;
  readonly "campaign.paused": CampaignPausedPayload;
  readonly "campaign.recipient_failed": CampaignRecipientFailedPayload;
  readonly "campaign.recipient_sent": CampaignRecipientSentPayload;
  readonly "campaign.recipient_skipped": CampaignRecipientSkippedPayload;
  readonly "campaign.throttled": CampaignThrottledPayload;
  readonly "chat.archive": ChatArchivePayload;
  readonly "chat.clear": ChatClearPayload;
  readonly "chat.delete": ChatDeletePayload;
  readonly "chat.mute": ChatMutePayload;
  readonly "chat.read": ChatReadPayload;
  readonly "command.result": CommandResultPayload;
  readonly "contact.opted_in": ContactOptPayload;
  readonly "contact.opted_out": ContactOptPayload;
  readonly "contact.sync": ContactsSyncPayload;
  readonly "contact.update": ContactUpdatePayload;
  readonly "customer.archived": CustomerArchivedPayload;
  readonly "customer.archiving": CustomerArchivingPayload;
  readonly "customer.created": CustomerCreatedPayload;
  readonly "customer.enabled": CustomerEnabledPayload;
  readonly "customer.number.attached": CustomerNumberAttachedPayload;
  readonly "customer.number.disconnected": CustomerNumberDisconnectedPayload;
  readonly "customer.number.transferred": CustomerNumberTransferredPayload;
  readonly "customer.pairing_link.connected": CustomerPairingLinkConnectedPayload;
  readonly "customer.pairing_link.created": CustomerPairingLinkCreatedPayload;
  readonly "customer.pairing_link.expired": CustomerPairingLinkExpiredPayload;
  readonly "customer.pairing_link.failed": CustomerPairingLinkFailedPayload;
  readonly "customer.pairing_link.opened": CustomerPairingLinkOpenedPayload;
  readonly "customer.pairing_link.revoked": CustomerPairingLinkRevokedPayload;
  readonly "customer.restored": CustomerRestoredPayload;
  readonly "customer.updated": CustomerUpdatedPayload;
  readonly "group.participant": GroupParticipantPayload;
  readonly "group.update": GroupUpdatePayload;
  readonly "history.sync": HistorySyncPayload;
  readonly "labels.update": LabelsUpdatePayload;
  readonly "message.ack": MessageAckPayload;
  readonly "message.delete": MessageDeletePayload;
  readonly "message.echo": MessageEchoPayload;
  readonly "message.edited": MessagePayload;
  readonly "message.failed": MessageFailedPayload;
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
  readonly "session.restriction_updated": SessionRestrictionUpdatedPayload;
  readonly "session.status": SessionStatusPayload;
  readonly "template.status": TemplateStatusPayload;
  readonly "usage.recorded": UsageRecordedPayload;
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
