export interface DataEnvelope<T> {
  readonly data: T;
}

export type PlatformPayload = Readonly<Record<string, unknown>>;

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

export interface SessionStopResult {
  readonly stopping: true;
  readonly sessionId: string;
}

export interface SessionRemoveResult {
  readonly removed: true;
  readonly sessionId: string;
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
