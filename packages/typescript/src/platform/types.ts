import type {
  CampaignRecipient,
  CampaignRecipientInput,
  CampaignRecipientStatus,
  InvalidRecipientRow,
} from "../messaging/types.js";

export interface DataEnvelope<T> {
  readonly data: T;
}

export type PlatformPayload = Readonly<Record<string, unknown>>;

export type CustomerStatus = "active" | "archiving" | "archived";

export interface Customer {
  readonly id: string;
  readonly orgId: string;
  readonly projectId: string;
  readonly name: string | null;
  readonly externalCustomerId: string | null;
  readonly status: CustomerStatus;
  readonly isDefault: boolean;
  readonly archivedAt: number | null;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface CustomerSummary extends Customer {
  readonly numberCount: number;
  readonly connectedNumberCount: number;
  readonly activePairingLinkState: string | null;
  readonly lastActivityAt: number | null;
  readonly needsAttention: boolean;
}

export interface CustomersStatus {
  readonly enabled: boolean;
  readonly enabledAt: number | null;
  readonly enabledBy: string | null;
  readonly defaultCustomer: Customer | null;
}

export interface CustomersEnablement extends CustomersStatus {
  readonly migratedNumberCount: number;
}

export interface CustomerProjectRequest {
  readonly projectId?: string;
}

export interface CreateCustomerRequest {
  readonly projectId?: string;
  readonly name?: string | null;
  readonly externalCustomerId?: string | null;
}

export interface UpdateCustomerRequest {
  readonly projectId?: string;
  readonly name?: string | null;
  readonly externalCustomerId?: string | null;
}

export interface ListCustomersParams {
  readonly projectId: string;
  readonly cursor?: string;
  readonly limit?: number;
  readonly search?: string;
  readonly status?: CustomerStatus | "all";
  readonly isDefault?: boolean;
  readonly hasNumbers?: boolean;
  readonly needsAttention?: boolean;
}

export interface CustomerListPage {
  readonly nextCursor: string | null;
  readonly hasMore: boolean;
}

export interface CustomerListEnvelope {
  readonly data: readonly CustomerSummary[];
  readonly page: CustomerListPage;
}

export interface CustomerNumber {
  readonly id: string;
  readonly customerId: string;
  readonly sessionId: string;
  readonly name: string | null;
  readonly phoneMasked: string | null;
  readonly status: string;
  readonly backend: string | null;
  readonly createdAt: number;
}

export interface CustomerEventMetadata {
  readonly fields?: readonly ("name" | "phone" | "externalCustomerId")[];
}

export interface CustomerEvent {
  readonly id: string;
  readonly action: string;
  readonly fromStatus: string | null;
  readonly toStatus: string | null;
  readonly sessionId: string | null;
  readonly pairingLinkId: string | null;
  readonly metadata: CustomerEventMetadata;
  readonly occurredAt: number;
}

export type CustomerPairingMethod = "qr" | "phone";
export type CustomerPairingLocale = "en" | "pt-BR";
export type CustomerPairingTheme = "light" | "dark" | "system";
export type CustomerPairingLinkStatus =
  | "active"
  | "opened"
  | "connecting"
  | "connected"
  | "failed"
  | "expired"
  | "revoked";

export interface CustomerPairingLink {
  readonly id: string;
  readonly orgId: string;
  readonly projectId: string;
  readonly customerId: string;
  readonly expectedPhoneMasked: string | null;
  readonly methods: readonly CustomerPairingMethod[];
  readonly locale: CustomerPairingLocale | null;
  readonly theme: CustomerPairingTheme | null;
  readonly expiresAt: number;
  readonly status: CustomerPairingLinkStatus;
  readonly attemptCount: number;
  readonly maxAttempts: number;
  readonly pendingSessionId: string | null;
  readonly createdBy: string | null;
  readonly reservedAt: number | null;
  readonly openedAt: number | null;
  readonly connectingAt: number | null;
  readonly connectedAt: number | null;
  readonly failedAt: number | null;
  readonly expiredAt: number | null;
  readonly revokedAt: number | null;
  readonly lastErrorCode: string | null;
  readonly failedExchangeCount: number;
  readonly phoneMismatchCount: number;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface CreatedCustomerPairingLink extends CustomerPairingLink {
  /** Returned once. An idempotent replay returns null. */
  readonly url: string | null;
}

export interface CreateCustomerPairingLinkRequest {
  readonly projectId?: string;
  readonly expectedPhone?: string | null;
  readonly methods?: readonly CustomerPairingMethod[];
  readonly expiresInSeconds?: number;
}

export interface ListCustomerEventsParams {
  readonly projectId: string;
  readonly limit?: number;
}

export interface TransferCustomerNumberRequest {
  readonly projectId: string;
  readonly sourceCustomerId: string;
  readonly confirm: true;
}

/** Create a campaign through the organization client's Platform resource. */
export interface CreatePlatformCampaignRequest {
  /** Owning project; organization API keys are not bound to one project. */
  readonly projectId: string;
  /** Trimmed by the API; 1 to 200 characters and must not be blank. */
  readonly name: string;
  readonly templateId?: string;
  readonly recipientListId?: string;
  readonly senderConfig?: Readonly<Record<string, unknown>>;
  /** Scheduled start time in Unix milliseconds. */
  readonly scheduledAt?: number;
  /** At most 1,000 recipients. */
  readonly recipients?: readonly CampaignRecipientInput[];
  /** Ignored when inline recipients are supplied. */
  readonly recipientCount?: number;
  // The API deliberately leaves these JSON values opaque.
  readonly composerBlueprint?: unknown;
  readonly messagesArray?: unknown;
  readonly audienceRef?: unknown;
  readonly complianceConfig?: unknown;
  readonly variants?: unknown;
  readonly variantStrategy?: unknown;
}

export interface ListCampaignsParams {
  readonly projectId: string;
  readonly projectSlug?: string;
}

/**
 * Query parameters shared by the single-campaign Platform operations.
 *
 * A team API key is not bound to one project, so it must name the project that
 * owns the campaign. This resource is exposed only on organization clients.
 */
export interface PlatformCampaignParams {
  readonly projectId: string;
}

/**
 * Body accepted by `campaigns.update`.
 *
 * The contract declares this body as an open object, so any field passes
 * through. `recipientListId` is named because its behaviour is specified:
 * pointing a campaign at another audience, or detaching it with null, is
 * accepted only while the campaign is an unlaunched draft whose audience has
 * not been copied into recipients. After that the API refuses the change.
 */
export interface UpdatePlatformCampaignRequest {
  readonly recipientListId?: string | null;
  readonly [field: string]: unknown;
}

export interface ListPlatformCampaignRecipientsParams {
  /** Owning project for this organization-client request. */
  readonly projectId: string;
  readonly status?: CampaignRecipientStatus;
  readonly cursor?: string;
  /** 1 to 100; the API defaults to 25. */
  readonly limit?: number;
}

export type PlatformCampaignRecipientsEnvelope =
  CursorEnvelope<CampaignRecipient>;

export interface AddPlatformCampaignRecipientsRequest {
  readonly projectId: string;
  readonly recipients: readonly CampaignRecipientInput[];
}

export interface AddPlatformCampaignRecipientsResult {
  readonly campaignId: string;
  readonly added: number;
  readonly recipientCount: number;
  readonly duplicateCount: number;
  readonly invalidCount: number;
  readonly invalidRows: readonly InvalidRecipientRow[];
}

export type AudienceSource = "csv" | "manual" | "api";

/** Column names in an uploaded spreadsheet, mapped onto recipient fields. */
export interface AudienceImportMapping {
  readonly phone: string;
  readonly variables?: Readonly<Record<string, string>>;
}

interface CreateAudienceBase {
  readonly name: string;
  readonly source?: AudienceSource;
}

/** Inline members, or an empty audience when `members` is omitted. */
export interface CreateAudienceFromMembers extends CreateAudienceBase {
  /** Up to 1,000 members. */
  readonly members?: readonly CampaignRecipientInput[];
  readonly fileId?: never;
  readonly mapping?: never;
}

/** A spreadsheet already uploaded through `audiences.createUpload`. */
export interface CreateAudienceFromFile extends CreateAudienceBase {
  readonly members?: never;
  /** Storage ID returned by `audiences.createUpload`. */
  readonly fileId: string;
  /** The API refuses a file import without a mapping. */
  readonly mapping: AudienceImportMapping;
}

/**
 * Send inline `members` or `fileId` with `mapping`, never both. Omitting both
 * creates an empty audience.
 */
export type CreateAudienceRequest =
  CreateAudienceFromMembers | CreateAudienceFromFile;

export interface Audience {
  readonly id: string;
  readonly name: string;
  readonly source: AudienceSource;
  readonly recipientCount: number;
  readonly fileId: string | null;
  readonly columns: readonly string[] | null;
  readonly sampleRow: Readonly<Record<string, string>> | null;
  readonly mapping: Readonly<Record<string, unknown>> | null;
  readonly createdAt: number;
  readonly updatedAt: number;
}

/** An audience plus the counts of the import that created it. */
export interface AudienceImportResult extends Audience {
  readonly duplicateCount: number;
  readonly invalidCount: number;
  /** At most 20 rejected entries. */
  readonly invalidRows: readonly InvalidRecipientRow[];
}

export interface AudienceMember {
  readonly id: string;
  readonly phone: string;
  readonly variables: Readonly<Record<string, string>>;
  readonly createdAt: number;
}

export interface ListAudienceMembersParams {
  readonly cursor?: string;
  /** 1 to 100; the API defaults to 25. */
  readonly limit?: number;
}

export type AudienceMembersEnvelope = CursorEnvelope<AudienceMember>;

export interface AddAudienceMembersRequest {
  readonly members: readonly CampaignRecipientInput[];
}

export interface AddAudienceMembersResult {
  readonly listId: string;
  readonly added: number;
  readonly recipientCount: number;
  readonly duplicateCount: number;
  readonly invalidCount: number;
  readonly invalidRows: readonly InvalidRecipientRow[];
}

export interface DeleteAudienceMemberResult {
  readonly removed: true;
  readonly listId: string;
  readonly phone: string;
  readonly recipientCount: number;
}

/**
 * Organization keyword capture. When enabled, a reply matching an opt-out
 * keyword suppresses the contact and emits `contact.opted_out`.
 */
export interface OptOutSettings {
  readonly enabled: boolean;
  /** At least one keyword, at most 50, each at most 32 characters. */
  readonly optOutKeywords: readonly string[];
  readonly optInKeywords: readonly string[];
  readonly updatedAt: number | null;
}

export interface UpdateOptOutSettingsRequest {
  readonly enabled: boolean;
  readonly optOutKeywords: readonly string[];
  readonly optInKeywords: readonly string[];
}

export interface Organization {
  readonly id: string;
  readonly externalId: string;
  readonly name: string;
  readonly slug: string | null;
  readonly email: string;
  readonly timezone: string | null;
  readonly creditBalanceCents: number;
  readonly lowBalanceThresholdCents: number;
  readonly billingEmail: string | null;
  readonly status: string | null;
  readonly plan: string | null;
  readonly planStatus: string | null;
  readonly isActive: boolean;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export type BillingCurrency = "USD" | "BRL" | "INR";

export interface BillingBalance {
  readonly balanceCents: number;
  readonly preferredCurrency: BillingCurrency;
}

export interface BillingUsage {
  readonly activeNumbers: number;
  readonly totalChargedCents: number;
}

export interface BillingTransaction {
  readonly id: string;
  readonly amountCents: number;
  readonly balanceAfterCents: number;
  readonly type: string;
  readonly description: string;
  readonly sessionId: string | null;
  readonly projectId: string | null;
  readonly tier: string | null;
  readonly currency: string | null;
  readonly paymentStatus: "paid" | "refunded";
  readonly createdAt: number;
}

export interface TierPricing {
  readonly id: string;
  readonly tier: string;
  readonly dailyRateCents: number;
  readonly label: string;
  readonly description: string;
  readonly features: readonly string[];
}

/** Metadata for an organization server API key. Raw key material is never returned. */
export interface ApiKey {
  readonly _id: string;
  readonly _creationTime: number;
  readonly id: string;
  readonly keyId: string;
  readonly start: string;
  readonly last4: string;
  readonly orgId: string;
  readonly label: string;
  readonly scopes: number;
  readonly source: string;
  readonly expiresAt: number;
  readonly lastUsed?: number;
  readonly isActive: boolean;
}

export interface ApiKeyDeactivation {
  readonly ok: true;
  readonly keyId: string;
}

export type OrganizationMemberRole = "owner" | "admin" | "member";

export interface OrganizationMember {
  readonly _id: string;
  readonly _creationTime: number;
  readonly orgId: string;
  readonly userId: string;
  readonly email: string;
  readonly name: string | null;
  readonly role: OrganizationMemberRole;
  readonly status: string;
  readonly invitedAt: number | null;
  readonly joinedAt: number | null;
}

export interface ListAuditLogsParams {
  readonly action?: string;
  readonly resource?: string;
  /** The live API bounds this value to 1 through 500 and defaults it to 100. */
  readonly limit?: number;
}

export interface AuditLog {
  readonly id: string;
  readonly actorEmail: string;
  readonly actorUserId: string | null;
  readonly actorRole: string | null;
  readonly action: string;
  readonly resource: string;
  readonly projectId: string | null;
  readonly projectName: string | null;
  readonly ip: string | null;
  readonly userAgent: string | null;
  readonly duration: number | null;
  readonly source: string | null;
  readonly description: string | null;
  readonly result: string;
  readonly metadata: unknown;
  readonly createdAt: number;
}

export type SessionBanStatus = "active" | "lifted";

export interface SessionBan {
  readonly id: string;
  readonly sessionName: string;
  readonly banCode: number | null;
  readonly banReason: string | null;
  readonly banExpiresAt: number | null;
  readonly occurredAt: number;
  readonly status: SessionBanStatus;
}

export interface SecurityIncident {
  readonly id: string;
  readonly keyId: string;
  readonly tokenType: string;
  readonly source: string;
  readonly url: string | null;
  readonly ref: string | null;
  readonly resolution: string;
  readonly detectedAt: number;
  readonly acknowledgedAt: number | null;
  readonly acknowledgedBy: string | null;
  readonly createdAt: number;
}

export interface SecurityIncidentAcknowledgement {
  readonly acknowledged: true;
}

/** Project-token metadata. The bearer token itself is never returned. */
export interface ProjectToken {
  readonly id: string;
  readonly start: string;
  readonly last4: string;
  readonly label: string | null;
  readonly scopes: number;
  readonly expiresAt: number | null;
  readonly createdAt: number;
  readonly lastUsedAt: number | null;
  readonly revokedAt: number | null;
}

export interface ProjectIcon {
  readonly type: string;
  readonly value: string;
  readonly color?: string;
  readonly storageId?: string;
}

export interface Project {
  readonly id: string;
  readonly orgId: string;
  readonly name: string;
  readonly slug: string;
  readonly icon: ProjectIcon | Readonly<Record<string, unknown>>;
  readonly defaultTier: string;
  readonly isActive: boolean;
  readonly stage: "development" | "production";
}

/** A project as returned by creation; new projects always start in development. */
export interface CreatedProject extends Project {
  readonly stage: "development";
}

export interface ProjectWithStats {
  readonly _id: string;
  readonly _creationTime: number;
  readonly orgId: string;
  readonly name: string;
  readonly slug: string;
  readonly icon: ProjectIcon | Readonly<Record<string, unknown>>;
  readonly defaultTier: string;
  readonly isActive: boolean;
  readonly stage: "development" | "production";
  readonly activeSessions: number;
  readonly totalSessions: number;
  readonly totalMessages: number;
  readonly lastActivity: number | null;
  readonly iconUrl: string | null;
}

export type ProjectDefaultTier = "free" | "standard" | "pro";

/** Icon accepted by `projects.create`. */
export interface ProjectIconInput {
  readonly type: "emoji" | "icon" | "image";
  readonly value: string;
  readonly color?: string;
  readonly storageId?: string;
}

export interface CreateProjectRequest {
  readonly name: string;
  readonly icon?: ProjectIconInput;
  readonly defaultTier?: ProjectDefaultTier;
}

/** The project returned by `projects.create`, always in development. */
export interface CreatedProject {
  readonly id: string;
  readonly orgId: string;
  readonly name: string;
  readonly slug: string;
  readonly icon: ProjectIcon;
  readonly defaultTier: ProjectDefaultTier;
  readonly isActive: boolean;
  readonly stage: "development";
}

export interface ProductionBusiness {
  readonly name: string;
  readonly website: string;
  readonly supportEmail: string;
}

export interface ProductionEnrollmentRequest {
  readonly business: ProductionBusiness;
}

export interface ProductionEnrollmentResult {
  readonly id: string;
  readonly orgId: string;
  readonly name: string;
  readonly slug: string;
  readonly stage: "development";
  readonly operationId: string;
  readonly enrollmentStatus:
    "requested" | "approval_required" | "provisioning" | "ready";
  /** The team's billing mode after the request; enrollment upgrades it. */
  readonly billingMode: "payg";
}

export interface ProductionEnrollmentCommandResult {
  readonly operationId: string;
  readonly action: "approve" | "cancel";
  readonly accepted: true;
}

export type SessionTier = "free" | "standard" | "pro" | "scale";

export interface PlatformSession {
  readonly _id: string;
  readonly _creationTime: number;
  readonly projectId: string;
  readonly sessionId: string;
  readonly name: string;
  readonly phone: string | null;
  readonly platform: string | null;
  readonly isBusiness: boolean;
  readonly testMode: boolean;
  readonly tierOverride: SessionTier | null;
  readonly status: string;
  readonly messageCount: number;
  readonly lastActiveAt: number | null;
  /** Charged rolling-window expiry in epoch milliseconds; null if never charged. */
  readonly paidUntil: number | null;
}

export interface ManagedSession {
  readonly id: string;
  readonly sessionId: string;
  readonly status: string;
  readonly tierOverride: SessionTier | null;
}

export interface ListPlatformSessionsParams {
  readonly projectId?: string;
}

export interface SessionProjectContext {
  readonly projectId?: string;
}

export interface SessionStartResult {
  readonly starting: true;
  readonly sessionId: string;
}

export interface SessionStopResult {
  readonly stopping: true;
  readonly sessionId: string;
}

export interface SessionRemoveResult {
  readonly removed: true;
  readonly sessionId: string;
}

/** A source-bounded batch of 1 through 100 session UUIDs or stable slugs. */
export interface SessionBatchRequest {
  readonly projectId?: string;
  readonly sessionIds: readonly string[];
}

/** Number of matching sessions for which an asynchronous stop was requested. */
export interface SessionBatchStopResult {
  readonly stopping: number;
}

/** Number of matching sessions permanently removed from management storage. */
export interface SessionBatchRemoveResult {
  readonly removed: number;
}

export interface SessionTierOverrideRequest {
  readonly projectId?: string;
  readonly quoteId: string;
}

/** The two connections of a Hybrid Link Number. */
export type HybridTransport = "linked_devices" | "official_api";

/** Keep one connection of a Hybrid Link Number and retire the other. */
export interface HybridKeepResolution {
  readonly action: "keep";
  readonly transport: HybridTransport;
}

/**
 * Split a Hybrid Link Number into two Standard Numbers. The Number being
 * quoted keeps `existingNumberTransport`; the other connection moves to a new
 * Number named `newNumberName` without pairing or signing up again.
 */
export interface HybridSplitResolution {
  readonly action: "split";
  readonly existingNumberTransport: HybridTransport;
  /** 1-64 characters: a letter or digit, then letters, digits, `.`, `_` or `-`. */
  readonly newNumberName: string;
}

/** Required when a Hybrid Link Number moves to a tier without Hybrid Link. */
export type HybridResolution = HybridKeepResolution | HybridSplitResolution;

/**
 * Merges another same-number Number into the quoted Number as a Hybrid Link
 * Number. The quoted Number keeps its ID; `absorbNumberId` is removed after its
 * connection moves.
 */
export interface HybridMerge {
  readonly absorbNumberId: string;
}

interface NumberTierQuoteBase {
  readonly projectId?: string;
  readonly tierOverride: "free" | "standard" | "pro" | null;
}

/**
 * A tier quote. Send `hybridResolution` when a Hybrid Link Number leaves Pro
 * (otherwise the API returns `hybrid_resolution_required`), or `hybridMerge`
 * to merge a same-number pair on an upgrade to Pro. Never both.
 */
export type NumberTierQuoteRequest =
  | (NumberTierQuoteBase & {
      readonly hybridResolution?: undefined;
      readonly hybridMerge?: undefined;
    })
  | (NumberTierQuoteBase & {
      readonly hybridResolution: HybridResolution;
      readonly hybridMerge?: undefined;
    })
  | (NumberTierQuoteBase & {
      readonly hybridResolution?: undefined;
      readonly hybridMerge: HybridMerge;
    });

/** Progress of the connection change, reported separately from the tier change. */
export type NumberHybridTransitionStatus =
  "scheduled" | "running" | "completed" | "failed" | "cancelled";

interface NumberHybridTransitionBase {
  /** The Number that keeps its ID. */
  readonly survivingNumberId: string;
  /** Present once the change has been confirmed. */
  readonly status?: NumberHybridTransitionStatus;
  readonly failureReason?: string | null;
  /**
   * True after an Official API connection that shares the number with the
   * WhatsApp Business app is dropped. Disconnect it in the WhatsApp Business
   * app under Settings > Account > Business Platform.
   */
  readonly metaDisconnectRequired?: boolean;
  readonly effectiveAtMs?: number | null;
}

export interface NumberHybridKeepTransition extends NumberHybridTransitionBase {
  readonly action: "keep";
  readonly keepTransport: HybridTransport;
}

export interface NumberHybridSplitTransition extends NumberHybridTransitionBase {
  readonly action: "split";
  readonly existingNumberTransport: HybridTransport;
  readonly newNumberName: string;
  /** The Number created by a completed split. */
  readonly newNumberId?: string;
}

export interface NumberHybridMergeTransition extends NumberHybridTransitionBase {
  readonly action: "merge";
  readonly absorbNumberId: string;
}

/** The Hybrid Link plan echoed by a tier quote, with its progress once confirmed. */
export type NumberHybridTransition =
  | NumberHybridKeepTransition
  | NumberHybridSplitTransition
  | NumberHybridMergeTransition;

export type HybridMergeIneligibleReason =
  | "deletion_in_progress"
  | "not_coexistence"
  | "different_customer"
  | "connection_disabled"
  | "not_connected";

export interface HybridMergeCandidateNumber {
  readonly id: string;
  readonly name: string;
  readonly transport: HybridTransport;
  readonly status: string;
}

/** Two Numbers in one project that are the same WhatsApp Business number. */
export interface HybridMergeCandidate {
  /** One Linked Devices Number and one Official API Number. */
  readonly numbers: readonly [
    HybridMergeCandidateNumber,
    HybridMergeCandidateNumber,
  ];
  readonly eligible: boolean;
  readonly ineligibleReason?: HybridMergeIneligibleReason;
}

export interface NumberTierChange {
  readonly id: string;
  readonly status: "quoted" | "queued" | "applied" | "rejected";
  readonly failureReason: string | null;
  readonly expiresAtMs: number;
  readonly quote: {
    readonly tier: string;
    readonly tierOverride: string | null;
    /** Credits, with up to six decimal places; this is not a cash amount. */
    readonly amountCents: number;
    readonly priceVersion: string;
    readonly action: "upgrade" | "downgrade" | "configure";
    readonly effectiveAtMs: number;
    readonly replacesWindowId: string | null;
    /** Present when the change resolves or merges a Hybrid Link Number. */
    readonly hybridTransition?: NumberHybridTransition;
  };
}

export interface CursorPageMetadata {
  readonly nextCursor: string | null;
  readonly hasMore: boolean;
}

export interface CursorEnvelope<T> {
  readonly data: readonly T[];
  readonly page: CursorPageMetadata;
}

export type BanSafeHealthBand =
  "good" | "fair" | "poor" | "failing" | "unknown";
export type BanSafeHealthState =
  "healthy" | "limited" | "restricted" | "banned";
export type BanSafeHealthSource = "rules_v1" | "ml_model" | "unavailable";
export type BanSafeHealthReliability =
  "rules_based" | "validated" | "unavailable";
export type BanSafeHealthUnavailableReason =
  "no_active_model" | "invalid_active_model" | "insufficient_fresh_features";
export type BanSafeEnforcementRung =
  "none" | "notify" | "throttle" | "block_cold" | "suspend";
export type BanSafeAppealState = "none" | "requested" | "granted" | "denied";

export interface BanSafeHealthProbabilities {
  readonly healthy: number;
  readonly limited: number;
  readonly restricted: number;
  readonly banned: number;
}

export type BanSafeHealthExplanationGroup =
  "direct_condition" | "delivery" | "connection" | "conduct" | "cadence";

export interface BanSafeHealthExplanationFactor {
  readonly group: BanSafeHealthExplanationGroup;
  readonly key: string;
  readonly penalty: number;
  readonly observedValue: number;
  readonly sampleSize: number;
}

export interface BanSafeHealthExplanation {
  readonly penalties: {
    readonly conduct: number;
    readonly delivery: number;
    readonly connection: number;
    readonly restriction: number;
    readonly total: number;
  };
  readonly factors: readonly BanSafeHealthExplanationFactor[];
  readonly measuredGroups: readonly BanSafeHealthExplanationGroup[];
  readonly missingGroups: readonly BanSafeHealthExplanationGroup[];
}

export interface BanSafeObservedAccountState {
  readonly state: BanSafeHealthState;
  readonly observedAt: string;
  readonly source: "account_check" | "restriction_event";
}

export interface BanSafeHealthProjection {
  readonly health: number | null;
  readonly band: BanSafeHealthBand;
  readonly healthSource: BanSafeHealthSource;
  readonly healthEstimatorVersion: string | null;
  readonly healthModelVersion: string | null;
  readonly healthEvaluatedAt: string | null;
  readonly healthFeatureCoverage: number | null;
  readonly healthReliability: BanSafeHealthReliability;
  readonly healthUnavailableReason: BanSafeHealthUnavailableReason | null;
  readonly healthProbabilities: BanSafeHealthProbabilities | null;
  readonly mostLikelyHealthState: BanSafeHealthState | null;
  readonly healthExplanation: BanSafeHealthExplanation | null;
  readonly observedAccountState: BanSafeObservedAccountState | null;
}

export interface BanSafeNumberEnforcement {
  readonly rung: BanSafeEnforcementRung;
  readonly previousRung: BanSafeEnforcementRung;
  readonly organizationFloor: BanSafeEnforcementRung;
  readonly reason: string;
  readonly source: "automatic" | "operator";
  readonly throughputPerMinute: number | null;
  readonly blocksUnsolicited: boolean;
  readonly suspended: boolean;
  readonly startedAt: string;
  readonly eligibleLiftAt: string | null;
  readonly exitProgress: number;
  readonly blockingFindings: readonly string[];
  readonly operatorHold: boolean;
  readonly appealState: BanSafeAppealState;
  readonly state: "applied" | "applying";
}

export interface BanSafeNumber extends BanSafeHealthProjection {
  readonly sessionId: string;
  readonly session: string;
  readonly phoneNumber: string;
  readonly projectId: string;
  readonly enforcement: BanSafeNumberEnforcement | null;
}

export interface WarmupCurvePoint {
  readonly day: number;
  readonly allowance: number;
}

export interface BanSafeNumberWarmup {
  readonly enabled: boolean;
  readonly tenureSource: "history" | "link" | "plan" | null;
  readonly tenureDay: number;
  readonly allowance: number | null;
  readonly sentToday: number | null;
  readonly resetsAt: string | null;
  readonly curve: readonly WarmupCurvePoint[];
}

export interface BanSafeNumberDetail extends BanSafeNumber {
  readonly warmup: BanSafeNumberWarmup;
  readonly findings: readonly BanSafeFinding[];
  readonly liftRequires: string | null;
  readonly appealState: BanSafeAppealState;
}

export interface BanSafeHealthPoint extends Omit<
  BanSafeHealthProjection,
  "band" | "healthEvaluatedAt"
> {
  readonly band: BanSafeHealthBand | null;
  readonly healthEvaluatedAt: string;
}

export interface BanSafeHealthHistory {
  readonly sessionId: string;
  readonly session: string;
  readonly points: readonly BanSafeHealthPoint[];
}

export type BanSafeFindingStatus =
  "open" | "acknowledged" | "resolved" | "not_measured";
export type BanSafeFindingSeverity = "info" | "warning" | "critical";

export interface BanSafeFinding {
  readonly id: string | null;
  readonly key: string;
  readonly title: string;
  readonly summary: string;
  readonly fix: string;
  readonly status: BanSafeFindingStatus;
  readonly severity: BanSafeFindingSeverity | null;
  readonly occurrences: number;
  readonly reopenedCount: number;
  readonly evidence: Readonly<Record<string, number>>;
  readonly sessionId: string;
  readonly session: string;
  readonly phoneNumber: string;
  readonly firstSeenAt: string | null;
  readonly lastSeenAt: string | null;
  readonly acknowledgedAt: string | null;
  readonly acknowledgedBy: string | null;
  readonly acknowledgementNote: string | null;
  readonly snoozedUntil: string | null;
  readonly resolvedAt: string | null;
  readonly resolveReason:
    "clean" | "key_retired" | "number_removed" | "stale" | null;
}

export interface BanSafeEnforcementSummary extends BanSafeHealthProjection {
  readonly sessionId: string;
  readonly session: string;
  readonly phoneNumber: string;
  readonly projectId: string;
  readonly rung: BanSafeEnforcementRung;
  readonly previousRung: BanSafeEnforcementRung;
  readonly organizationFloor: BanSafeEnforcementRung;
  readonly reason: string;
  readonly source: "automatic" | "operator";
  readonly throughputPerMinute: number | null;
  readonly blocksUnsolicited: boolean;
  readonly suspended: boolean;
  /** Present when the API also returns the nested enforcement projection. */
  readonly enforcement?: BanSafeNumberEnforcement | null;
  readonly blockingFindings: readonly string[];
  readonly startedAt: string;
  readonly eligibleLiftAt: string | null;
  readonly liftRequires: string;
  readonly operatorHold: boolean;
  readonly appealState: BanSafeAppealState;
  readonly state: "applied" | "applying";
}

export type BanSafeIncidentKind =
  | "cap_warning"
  | "cap_reached"
  | "timelock"
  | "temporary_ban"
  | "permanent_ban"
  | "connect_blocked"
  | "customer_report";

export interface BanSafeIncident {
  readonly id: string;
  readonly sessionId: string;
  readonly session: string;
  readonly phoneNumber: string;
  readonly projectId: string;
  readonly kind: BanSafeIncidentKind;
  readonly source: "runtime" | "customer";
  readonly resolution: string;
  readonly ambiguous: boolean;
  readonly startedAt: string;
  readonly endsAt: string | null;
  readonly closedAt: string | null;
  readonly closedBy: string | null;
  readonly claimId: string | null;
  readonly note: string | null;
  readonly reportedBy: string | null;
  readonly createdAt: string;
}

export interface ReportBanSafeIncidentRequest {
  readonly session: string;
  readonly occurredAt?: string;
  readonly note?: string;
}

export interface BanSafeIncidentReceipt {
  readonly incidentId: string;
  readonly created: boolean;
  readonly sessionId: string;
  readonly session: string;
  readonly occurredAt: string;
}

export type BanSafeClaimStatus =
  "filed" | "under_review" | "approved" | "denied" | "paid" | "reversed";
export type BanSafeClaimVerdict =
  | "other_device"
  | "customer_conduct"
  | "shared_network"
  | "ours"
  | "inconclusive";

export interface BanSafeClaimEvidence {
  readonly attributionRuleVersion: number | null;
  readonly windowDays: number;
  readonly deviceEvidence: boolean;
  readonly otherDevices: number;
  readonly restrictedInWindow: boolean;
  readonly criticalFindingDays: number;
  readonly sharedConnection: boolean;
  readonly measuredHours: number;
}

export interface BanSafeClaim {
  readonly id: string;
  readonly incidentId: string;
  readonly sessionId: string;
  readonly session: string;
  readonly phoneNumber: string;
  readonly projectId: string;
  readonly status: BanSafeClaimStatus;
  readonly verdict: BanSafeClaimVerdict;
  readonly windowStart: string;
  readonly windowEnd: string;
  /** Credit quantity consumed inside the window; up to six decimal places. */
  readonly measuredCents: number;
  /** Maximum credit quantity this claim can return; up to six decimal places. */
  readonly capCents: number;
  /** Credit quantity this claim returns; up to six decimal places. */
  readonly amountCents: number;
  readonly evidence: BanSafeClaimEvidence;
  readonly summary: string;
  readonly reason: string;
  readonly decidedAt: string | null;
  readonly paidAt: string | null;
  readonly createdAt: string;
}

export interface ListBanSafeHealthParams {
  readonly projectId?: string;
  readonly cursor?: string;
  readonly limit?: number;
}

export interface ListBanSafeHealthHistoryParams {
  readonly since?: string;
  readonly limit?: number;
}

export interface ListBanSafeFindingsParams extends ListBanSafeHealthParams {
  readonly session?: string;
  readonly status?: Exclude<BanSafeFindingStatus, "not_measured">;
  readonly severity?: BanSafeFindingSeverity;
}

export interface ListBanSafeEnforcementParams extends ListBanSafeHealthParams {
  readonly rung?: BanSafeEnforcementRung;
}

export interface ListBanSafeIncidentsParams extends ListBanSafeHealthParams {
  readonly session?: string;
}

export interface ListBanSafeClaimsParams extends ListBanSafeHealthParams {
  readonly session?: string;
  readonly status?: BanSafeClaimStatus;
}

export type BanSafeSignalKind =
  "number" | "boolean" | "enum" | "histogram" | "code_counts";
export type BanSafeSignalUnit =
  "count" | "milliseconds" | "unix_milliseconds" | "ratio" | "none";

export interface BanSafeSignalDefinition {
  readonly key: string;
  readonly label: string;
  readonly group: string;
  readonly kind: BanSafeSignalKind;
  readonly unit: BanSafeSignalUnit;
  readonly description: string;
}

export interface BanSafeSignal extends BanSafeSignalDefinition {
  readonly measured: boolean;
  readonly value: number | boolean | string | readonly number[] | null;
  readonly sampleSize: number | null;
  readonly codes:
    readonly { readonly code: number; readonly count: number }[] | null;
}

export type BanSafeCollectionState =
  "fresh" | "stale" | "not_collected" | "unsupported";

export interface BanSafeCollectionStatus {
  readonly state: BanSafeCollectionState;
  readonly latestFlushedAt: string | null;
  readonly latestReceivedAt: string | null;
  readonly freshUntil: string | null;
  readonly recordVersion: number | null;
  readonly collectorVersion: number | null;
  readonly partial: boolean | null;
  readonly droppedRecords: number | null;
}

export interface BanSafeTelemetrySnapshot {
  readonly bucketStart: string;
  readonly flushedAt: string;
  readonly receivedAt: string;
  readonly partial: boolean;
  readonly recordVersion: number | null;
  readonly signals: readonly BanSafeSignal[];
}

export interface BanSafeCollectionSession {
  readonly sessionId: string;
  readonly session: string;
  readonly projectId: string;
  readonly collection: BanSafeCollectionStatus;
}

export interface BanSafeTelemetryDetail extends BanSafeCollectionSession {
  readonly snapshot: BanSafeTelemetrySnapshot | null;
}

export interface ListBanSafeTelemetryHistoryParams {
  readonly since?: string;
  readonly until?: string;
  readonly cursor?: string;
  readonly limit?: number;
}

export type ListBanSafeCollectionParams = ListBanSafeHealthParams;

export type BanSafeHealthActionMode = "apply" | "clear";
export type BanSafeHealthActionKind =
  "stop" | "slow_down" | "log_out" | "email" | "webhook";
export type BanSafeHealthActionStatus =
  "pending" | "running" | "succeeded" | "failed" | "cancelled";
export type BanSafeHealthActionOutcome =
  | "applied"
  | "cleared"
  | "notification_queued"
  | "superseded"
  | "expired"
  | "not_applied"
  | "delivery_failed";

export interface BanSafeHealthAction {
  readonly id: string;
  readonly sessionId: string;
  readonly session: string;
  readonly projectId: string;
  readonly mode: BanSafeHealthActionMode;
  readonly action: BanSafeHealthActionKind;
  readonly status: BanSafeHealthActionStatus;
  readonly health: number;
  readonly threshold: number;
  readonly healthSource: Exclude<BanSafeHealthSource, "unavailable">;
  readonly estimatorVersion: string;
  readonly modelVersion: string | null;
  readonly slowDownMps: number | null;
  readonly evaluatedAt: string;
  readonly createdAt: string;
  readonly completedAt: string | null;
  readonly outcome: BanSafeHealthActionOutcome | null;
}

export interface ListBanSafeHealthActionsParams extends ListBanSafeHealthParams {
  readonly session?: string;
  readonly status?: BanSafeHealthActionStatus;
}

export type BanSafeHealthEnvelope = CursorEnvelope<BanSafeNumber>;
export type BanSafeFindingsEnvelope = CursorEnvelope<BanSafeFinding>;
export type BanSafeEnforcementEnvelope =
  CursorEnvelope<BanSafeEnforcementSummary>;
export type BanSafeIncidentsEnvelope = CursorEnvelope<BanSafeIncident>;
export type BanSafeClaimsEnvelope = CursorEnvelope<BanSafeClaim>;
export type BanSafeTelemetryHistoryEnvelope =
  CursorEnvelope<BanSafeTelemetrySnapshot>;
export type BanSafeCollectionEnvelope =
  CursorEnvelope<BanSafeCollectionSession>;
export type BanSafeHealthActionsEnvelope = CursorEnvelope<BanSafeHealthAction>;

export type SafeModePresence = "dark" | "online_while_sending" | "online_hours";
export type SafeModeTyping = "off" | "before_text" | "before_all";
export type SafeModeReads = "off" | "replied_chats" | "all_inbound";
export type SafeModePacing = "off" | "jittered" | "conversation";

export interface SafeModeSettings {
  readonly presence: SafeModePresence;
  readonly typing: SafeModeTyping;
  readonly reads: SafeModeReads;
  readonly pacing: SafeModePacing;
  readonly onlineStart: number;
  readonly onlineEnd: number;
}

export interface UpdateProjectSafeModeRequest {
  readonly presence?: SafeModePresence;
  readonly typing?: SafeModeTyping;
  readonly reads?: SafeModeReads;
  readonly pacing?: SafeModePacing;
  readonly onlineStart?: number;
  readonly onlineEnd?: number;
}

export interface ProjectSafeMode {
  readonly projectId: string;
  readonly ceiling: SafeModeSettings;
  readonly entitled: boolean;
  readonly entitlementReason: string | null;
}

export interface SafeModeOverride {
  readonly presence: SafeModePresence | "inherit";
  readonly typing: SafeModeTyping | "inherit";
  readonly reads: SafeModeReads | "inherit";
  readonly pacing: SafeModePacing | "inherit";
}

export interface SafeModeApplied {
  readonly observedAt: string;
  readonly presence: string | null;
  readonly typing: string | null;
  readonly reads: string | null;
  readonly pacing: string | null;
}

export interface SessionSafeMode {
  readonly session: string;
  readonly projectId: string;
  readonly project: SafeModeSettings;
  readonly override: SafeModeOverride;
  readonly effective: SafeModeSettings;
  readonly applied: SafeModeApplied | null;
  readonly mismatch: boolean;
  readonly entitled: boolean;
  readonly entitlementReason: string | null;
}

export interface UpdateSessionSafeModeRequest {
  readonly presence?: SafeModePresence | "inherit";
  readonly typing?: SafeModeTyping | "inherit";
  readonly reads?: SafeModeReads | "inherit";
  readonly pacing?: SafeModePacing | "inherit";
}

export interface WarmupPlanSettings {
  readonly enabled: boolean;
  readonly warmupDays: number;
  readonly dailyStart: number;
}

export interface ProjectWarmupPlan {
  readonly projectId: string;
  readonly plan: WarmupPlanSettings;
  readonly ceiling: number;
  readonly curve: readonly WarmupCurvePoint[];
  readonly entitled: boolean;
  readonly entitlementReason: string | null;
}

export interface UpdateProjectWarmupPlanRequest {
  readonly enabled?: boolean;
  readonly warmupDays?: number;
  readonly dailyStart?: number;
}

export interface ProjectInsuranceEvidence {
  readonly projectId: string;
  readonly enabled: boolean;
  readonly banInsuranceIncluded: boolean;
}

export interface UpdateProjectInsuranceEvidenceRequest {
  readonly enabled: boolean;
}

export type ProjectHealthSessionAction =
  "none" | "stop" | "slow_down" | "log_out";

export interface ProjectHealthPolicyIntegrations {
  readonly emailConfigured: boolean;
  readonly webhookConfigured: boolean;
}

export interface ProjectHealthPolicy {
  readonly projectId: string;
  readonly version: number;
  readonly enabled: boolean;
  readonly threshold: number;
  readonly sessionAction: ProjectHealthSessionAction;
  readonly slowDownMps: number | null;
  readonly emailNotification: boolean;
  readonly webhookNotification: boolean;
  readonly integrations: ProjectHealthPolicyIntegrations;
}

export interface UpdateProjectHealthPolicyRequest {
  readonly version: number;
  readonly enabled: boolean;
  readonly threshold: number;
  readonly sessionAction: ProjectHealthSessionAction;
  readonly slowDownMps: number | null;
  readonly emailNotification: boolean;
  readonly webhookNotification: boolean;
}
