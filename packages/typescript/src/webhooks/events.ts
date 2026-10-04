import type {
  CallPermissionSource,
  CallPermissionStatus,
  MessagingConnection,
  WhatsAppMessageIds,
  PhonePlatform,
  WhatsAppAccountType,
} from "../messaging/types.js";
import type {
  UsageKeySource,
  UsageMeter,
  UsagePricingState,
  UsageSourceKind,
  UsageUnit,
} from "../platform/usage.js";
import type {
  VoiceAudioFailureReason,
  VoiceAudioFormat,
  VoiceAudioSource,
} from "../platform/voice.js";

export const KNOWN_WEBHOOK_EVENT_TYPES = [
  "bansafe.action",
  "bansafe.claim",
  "bansafe.health_threshold",
  "bansafe.incident",
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
  "call.permission_changed",
  "call.received",
  "call.rejected",
  "call.telemetry",
  "campaign.cap_reached",
  "campaign.cold_blocked",
  "campaign.completed",
  "campaign.failed",
  "campaign.launched",
  "campaign.paused",
  "campaign.recipient_delivered",
  "campaign.recipient_failed",
  "campaign.recipient_read",
  "campaign.recipient_replied",
  "campaign.recipient_sent",
  "campaign.recipient_skipped",
  "campaign.rescheduled",
  "campaign.resumed",
  "campaign.stopped",
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
  "order.payment_updated",
  "presence.update",
  "session.connected",
  "session.logged_out",
  "session.phone_offline",
  "session.restriction_updated",
  "session.status",
  "template.status",
  "usage.recorded",
  "voice.asset_failed",
  "voice.asset_ready",
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

/**
 * The reply button or list row a contact chose. `id` is the ID you assigned
 * when sending; the visible label is not included.
 */
export interface ReplyChoice {
  readonly kind: "button" | "list";
  readonly id: string;
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
  | "native_flow_response"
  | "button_reply"
  | "list_reply"
  | "poll"
  | "sticker"
  | "reaction"
  | "revoke"
  | "edited"
  | "unknown";

export interface LinkedDeviceMessagePayload {
  readonly id: string;
  readonly whatsapp_ids: WhatsAppMessageIds;
  /** @deprecated Temporary singular reference for older consumers; use `whatsapp_ids`. */
  readonly whatsapp_id?: string;
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
  readonly replyChoice?: ReplyChoice;
  readonly parentMessageId?: string;
  readonly [key: string]: unknown;
}

export type MessagePayload = LinkedDeviceMessagePayload;

export interface CloudMessagePayload {
  readonly id: string;
  readonly whatsapp_ids: WhatsAppMessageIds;
  /** @deprecated Temporary singular reference for older consumers; use `whatsapp_ids`. */
  readonly whatsapp_id?: string;
  readonly conversation: ConversationReference;
  readonly timestamp: string;
  readonly type: string;
  readonly senderName?: string;
  readonly nativeFlowResponse?: NativeFlowResponse;
  readonly replyChoice?: ReplyChoice;
  readonly parentMessageId?: string;
  readonly interactive?: Readonly<Record<string, unknown>>;
  /** Provider referral source only; it does not establish a conversion or payment. */
  readonly referral?: Readonly<{
    source_type?: string;
    source_id?: string;
    source_url?: string;
    ctwa_clid?: string;
  }>;
  readonly [key: string]: unknown;
}

export type MessageReceivedPayload =
  LinkedDeviceMessagePayload | CloudMessagePayload;

export interface MessageSentPayload {
  readonly id: string;
  readonly whatsapp_ids: WhatsAppMessageIds;
  /** @deprecated Temporary singular reference for older consumers; use `whatsapp_ids`. */
  readonly whatsapp_id?: string;
  readonly conversation: ConversationReference;
  readonly type: string;
  readonly timestamp: number;
}

/** Meta classification copied from a status notification; contains no price. */
export interface MetaPricingReport {
  readonly billable?: boolean;
  readonly pricing_model?: string;
  readonly category?: string;
  readonly type?: string;
}

export interface MessageAckPayload {
  readonly messages: readonly {
    readonly id: string;
    readonly whatsapp_ids: WhatsAppMessageIds;
    /** @deprecated Temporary singular reference for older consumers; use `whatsapp_ids`. */
    readonly whatsapp_id?: string;
  }[];
  readonly conversation: ConversationReference;
  readonly from?: IdentityReference;
  readonly sender?: IdentityReference;
  readonly type: string;
  readonly timestamp: number;
  readonly pricing?: MetaPricingReport;
}

export interface MessageDeletePayload {
  readonly from: IdentityReference;
  readonly sender: IdentityReference;
  readonly id: string;
  readonly whatsapp_ids: WhatsAppMessageIds;
  /** @deprecated Temporary singular reference for older consumers; use `whatsapp_ids`. */
  readonly whatsapp_id?: string;
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

export interface RuntimeSessionStatusPayload {
  readonly status: string;
  readonly statusReason?: string;
  readonly banCode?: number;
  readonly banReason?: string;
  /** Unix seconds. */
  readonly banExpiresAt?: number;
  readonly detail?: string;
}

/** A Meta account notification, not a runtime connection-state transition. */
export interface CloudAccountStatusPayload {
  readonly source: "meta";
  readonly kind:
    "account_alerts" | "account_update" | "phone_number_name_update";
  readonly wabaId?: string;
  readonly value: Readonly<Record<string, unknown>>;
}

export type SessionStatusPayload =
  RuntimeSessionStatusPayload | CloudAccountStatusPayload;

export type SessionRestrictionType = "reachout_timelock";

export interface SessionRestrictionUpdatedPayload {
  readonly type: SessionRestrictionType;
  readonly active: boolean;
  readonly enforcementType: string | null;
  readonly expiresAt: string | null;
  readonly observedAt: string;
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
  readonly reason: SessionLoggedOutReason;
  /** WhatsApp's logout code (401, 403 or 406), or 0 when none was given. */
  readonly code: number;
}

export interface SessionPhoneOfflinePayload {
  readonly daysSinceLastSeen: number;
  readonly daysRemaining: number;
  readonly lastSeen: string;
  readonly action: string;
}

/** A WhatsApp error reported for an Official group operation (beta). */
export interface OfficialGroupError {
  readonly code: number;
  readonly title?: string;
}

export interface GroupUpdatePayload {
  readonly id: string;
  readonly newSubject?: string;
  readonly newDescription?: string;
  /**
   * What changed, for example `joined`. Official groups (beta): `created`,
   * `create_failed`, `deleted`, `delete_failed`, `settings_updated`,
   * `suspended` or `suspension_cleared`.
   */
  readonly action?: string;
  /** Official groups (beta): the request ID returned when the group was created, or of a change. */
  readonly requestId?: string;
  /** Official groups (beta), action `created`: the invite link. */
  readonly inviteLink?: string;
  /** Official groups (beta), action `created`. */
  readonly joinApprovalRequired?: boolean;
  /** Official groups (beta), action `settings_updated`. */
  readonly pictureChanged?: boolean;
  /** Official groups (beta), action `settings_updated`: changes WhatsApp did not apply. */
  readonly failedChanges?: readonly ("subject" | "description" | "picture")[];
  /** Official groups (beta): why WhatsApp refused the operation. */
  readonly errors?: readonly OfficialGroupError[];
}

export interface GroupParticipantPayload {
  readonly id: string;
  readonly joined?: readonly IdentityReference[];
  readonly left?: readonly IdentityReference[];
  readonly promoted?: readonly IdentityReference[];
  readonly demoted?: readonly IdentityReference[];
  /** Official groups (beta): how the change happened, for example `invite_link`. */
  readonly reason?: string;
  /** Official groups (beta): who removed the participants. */
  readonly initiatedBy?: "business" | "participant";
  readonly requestId?: string;
  /** Official groups (beta): participants WhatsApp could not remove. */
  readonly failedParticipants?: readonly {
    readonly participant: IdentityReference;
    readonly errors?: readonly OfficialGroupError[];
  }[];
  readonly errors?: readonly OfficialGroupError[];
  /** Official groups requiring approval (beta): a join request was created or revoked. */
  readonly joinRequest?: {
    readonly joinRequestId: string;
    readonly user: IdentityReference;
    readonly state: "created" | "revoked";
  };
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
  /** Authoritative raised-hand state for a connected participant. */
  readonly handRaised?: boolean;
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
  /** @deprecated Temporary singular reference for older consumers; use `whatsapp_ids`. */
  readonly whatsapp_id?: string;
  readonly original_whatsapp_ids?: WhatsAppMessageIds;
  /** @deprecated Temporary singular reference for older consumers; use `original_whatsapp_ids`. */
  readonly original_whatsapp_id?: string;
  readonly messages: readonly {
    readonly id: string;
    readonly whatsapp_ids: WhatsAppMessageIds;
    /** @deprecated Temporary singular reference for older consumers; use `whatsapp_ids`. */
    readonly whatsapp_id?: string;
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

/**
 * A person's call permission on a Cloud API number changed. No event is sent
 * when a temporary permission reaches `expiresAt`; use `expiresAt` to schedule
 * your own follow-up.
 */
export interface CallPermissionChangedPayload {
  readonly conversation: IdentityReference;
  readonly status: CallPermissionStatus;
  readonly previousStatus: CallPermissionStatus;
  /** When a temporary permission ends; null otherwise. */
  readonly expiresAt: string | null;
  readonly source: CallPermissionSource;
  readonly changedAt: string;
}

interface OrderPaymentUpdateBase {
  readonly reportedBy: "whatsapp";
  /** WhatsApp's notification or message ID. */
  readonly providerEventId: string;
  /** Your order reference ID from the order details message. */
  readonly referenceId: string;
  readonly conversation: {
    readonly id?: string;
    readonly phoneNumber?: string;
  };
}

/**
 * WhatsApp reported a payment update for a Brazil order (payment orders beta).
 * Polymorfa relays the report; it does not process, hold or confirm funds.
 * Confirm settlement with your payment provider by `referenceId`.
 */
export type OrderPaymentUpdatedPayload =
  | (OrderPaymentUpdateBase & {
      readonly kind: "payment_status";
      /** Payment status as WhatsApp reported it, for example `captured`. */
      readonly status: string;
      /** Reported amount; `value / offset` is the amount in currency units. */
      readonly amount?: { readonly value: number; readonly offset: number };
      readonly currency?: string;
      readonly transaction?: {
        readonly id?: string;
        readonly providerTransactionId?: string;
        readonly provider?: string;
        readonly status?: string;
        readonly method?: string;
        readonly errorCode?: string;
      };
    })
  | (OrderPaymentUpdateBase & {
      /** The buyer confirmed a one-click payment method. */
      readonly kind: "payment_method_selected";
      readonly messageId: string;
      readonly paymentMethod: string;
      readonly lastFourDigits?: string;
      readonly credentialId?: string;
      /** Unix time in seconds reported by WhatsApp. */
      readonly paymentTimestamp?: number;
    });

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

export interface RuntimeTemplateStatusPayload {
  readonly templateName: string;
  readonly templateId: string;
  readonly status: string;
  readonly category: string;
  readonly reason: string;
  readonly qualityRating: string;
}

export interface CloudTemplateStatusPayload {
  readonly kind:
    "message_template_status_update" | "message_template_quality_update";
  readonly event?: string;
  readonly templateId?: string;
  readonly templateName?: string;
  readonly language?: string;
  readonly reason?: string;
  readonly previousQualityScore?: string;
  readonly newQualityScore?: string;
  readonly wabaId?: string;
}

export type TemplateStatusPayload =
  RuntimeTemplateStatusPayload | CloudTemplateStatusPayload;

export interface CampaignLaunchedPayload {
  readonly campaignId: string;
  readonly name: string;
  readonly recipientCount: number;
  readonly scheduled: boolean;
  /** Unix milliseconds. */
  readonly launchedAt: number;
}

export interface CampaignPausedPayload {
  readonly campaignId: string;
  readonly sentCount: number;
  readonly remainingCount: number;
  readonly pausedAt: number;
}

export interface CampaignRescheduledPayload {
  readonly campaignId: string;
  /** Replaced start time in Unix milliseconds, or null. */
  readonly previousScheduledAt: number | null;
  /** New start time in Unix milliseconds; equals rescheduledAt when starting now. */
  readonly scheduledAt: number;
  /** Unix milliseconds when the new start was accepted. */
  readonly rescheduledAt: number;
}

export interface CampaignResumedPayload {
  readonly campaignId: string;
  readonly sentCount: number;
  readonly remainingCount: number;
  /** Unix milliseconds. */
  readonly resumedAt: number;
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

export interface CampaignStoppedPayload {
  readonly campaignId: string;
  readonly sentCount: number;
  readonly abandonedCount: number;
  /** Unix milliseconds. */
  readonly stoppedAt: number;
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

/**
 * Fields shared by `campaign.recipient_delivered`, `campaign.recipient_read`,
 * and `campaign.recipient_replied`. Each event fires once per recipient, for
 * the first transition only. Replies carry timing metadata, never message text.
 */
export interface CampaignRecipientEngagementPayload {
  readonly campaignId: string;
  readonly recipientId: string;
  /** Recipient phone number in E.164. */
  readonly phone: string;
  /** Session key of the sending number. */
  readonly sessionKey: string;
  /** WhatsApp message ID of the campaign send. */
  readonly externalMessageId: string;
}

export interface CampaignRecipientDeliveredPayload extends CampaignRecipientEngagementPayload {
  /** Unix seconds of the first delivery receipt. */
  readonly deliveredAt: number;
}

export interface CampaignRecipientReadPayload extends CampaignRecipientEngagementPayload {
  /** Unix seconds of the first read receipt. */
  readonly readAt: number;
}

export interface CampaignRecipientRepliedPayload extends Omit<
  CampaignRecipientEngagementPayload,
  "externalMessageId"
> {
  /** WhatsApp message ID of the campaign send, or `null` when unavailable. */
  readonly externalMessageId: string | null;
  /** Unix seconds of the first attributed reply. */
  readonly repliedAt: number;
  /** Milliseconds from the send to the first reply. */
  readonly responseMs: number;
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

/** Fields shared by the Voice Automation (beta) audio asset webhooks. */
export interface VoiceAssetEventPayload {
  readonly eventId: string;
  readonly occurredAt: string;
  readonly organizationId: string;
  readonly projectId: string;
  readonly assetId: string;
  readonly name: string;
  readonly source: VoiceAudioSource;
}

/** An audio asset finished transcoding and can be used in calls. */
export interface VoiceAssetReadyPayload extends VoiceAssetEventPayload {
  readonly durationMs: number;
  /** Hex SHA-256 of the canonical 16 kHz mono PCM. */
  readonly contentSha256: string;
  readonly originalFormat: VoiceAudioFormat;
}

/** An audio asset could not be processed. */
export interface VoiceAssetFailedPayload extends VoiceAssetEventPayload {
  readonly failureReason: VoiceAudioFailureReason;
}

/**
 * Payload for `usage.recorded`: one usage record, emitted when it is created
 * and again, with a higher `revision`, when a later observation corrects it.
 * Usage is measured, not charged: `pricingState` is `unpriced`.
 */
export interface UsageRecordedPayload {
  readonly id: string;
  readonly meter: UsageMeter;
  readonly quantity: number;
  readonly unit: UsageUnit;
  readonly dimensions: Readonly<Record<string, string | number | boolean>>;
  readonly keySource: UsageKeySource;
  readonly sourceKind: UsageSourceKind;
  /** The call id for call meters. */
  readonly sourceId: string;
  readonly projectId: string | null;
  readonly session: string | null;
  readonly occurredAt: string;
  readonly recordedAt: string;
  readonly revision: number;
  readonly pricingState: UsagePricingState;
  readonly rateCard: { readonly id: string; readonly version: number } | null;
  readonly pricedCredits: number | null;
}

export interface WebhookPayloadMap {
  readonly "bansafe.action": BanSafeActionPayload;
  readonly "bansafe.claim": BanSafeClaimPayload;
  readonly "bansafe.health_threshold": BanSafeHealthThresholdPayload;
  readonly "bansafe.incident": BanSafeIncidentPayload;
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
  readonly "call.permission_changed": CallPermissionChangedPayload;
  readonly "order.payment_updated": OrderPaymentUpdatedPayload;
  readonly "call.received": CallReceivedPayload;
  readonly "call.rejected": CallRejectedPayload;
  readonly "call.telemetry": CallTelemetryPayload;
  readonly "campaign.cap_reached": CampaignCapReachedPayload;
  readonly "campaign.cold_blocked": CampaignColdBlockedPayload;
  readonly "campaign.completed": CampaignCompletedPayload;
  readonly "campaign.failed": CampaignFailedPayload;
  readonly "campaign.launched": CampaignLaunchedPayload;
  readonly "campaign.paused": CampaignPausedPayload;
  readonly "campaign.recipient_delivered": CampaignRecipientDeliveredPayload;
  readonly "campaign.recipient_failed": CampaignRecipientFailedPayload;
  readonly "campaign.recipient_read": CampaignRecipientReadPayload;
  readonly "campaign.recipient_replied": CampaignRecipientRepliedPayload;
  readonly "campaign.recipient_sent": CampaignRecipientSentPayload;
  readonly "campaign.recipient_skipped": CampaignRecipientSkippedPayload;
  readonly "campaign.rescheduled": CampaignRescheduledPayload;
  readonly "campaign.resumed": CampaignResumedPayload;
  readonly "campaign.stopped": CampaignStoppedPayload;
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
  readonly "voice.asset_failed": VoiceAssetFailedPayload;
  readonly "voice.asset_ready": VoiceAssetReadyPayload;
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
