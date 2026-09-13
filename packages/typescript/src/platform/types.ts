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

export interface ListCampaignsParams {
  readonly projectId: string;
  readonly projectSlug?: string;
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

export type BillingReminderChannel = "email" | "inApp";

export interface UpdateBillingReminderSettingsRequest {
  readonly lowBalanceThresholdCents: number;
  readonly reminderChannels?: readonly BillingReminderChannel[];
}

export interface BillingReminderSettings {
  readonly lowBalanceThresholdCents: number;
  readonly reminderChannels: readonly BillingReminderChannel[];
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

export interface CreateProjectRequest {
  readonly name: string;
  readonly icon?: ProjectIcon;
  readonly defaultTier?: string;
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
  readonly tierOverride: SessionTier | null;
}

export interface CreateTestingSessionRequest {
  readonly projectId: string;
  readonly name?: string;
  readonly country?: "US" | "GB" | "BR" | "IN";
}
