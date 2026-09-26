/** Observed service-window state; unknown is never proof that a send is permitted. */
export interface CustomerServiceWindow {
  readonly state: "open" | "closed" | "unknown";
  readonly reason:
    | "not_tracked"
    | "tracking_started"
    | "notifications_interrupted"
    | "identity_unlinked"
    | null;
  readonly openedAt: string | null;
  readonly expiresAt: string | null;
  readonly checkedAt: string;
}

export interface MetaPricingParams {
  /** Inclusive ISO 8601 time. Defaults to 30 days before until. */
  readonly since?: string;
  /** Exclusive ISO 8601 time. Defaults to now; maximum period is 93 days. */
  readonly until?: string;
}

/** Counts from Meta status notifications, without prices or invoice amounts. */
export interface MetaPricingGroup {
  readonly category: string;
  readonly pricingModel: string;
  readonly pricingType: string | null;
  readonly billable: boolean | null;
  readonly messages: number;
}

export interface MetaPricingSummary {
  readonly source: "meta";
  readonly since: string;
  readonly until: string;
  readonly messages: number;
  readonly groups: readonly MetaPricingGroup[];
}

export type CloudCredentialFailureCode =
  | "app_credentials_rejected"
  | "token_expired"
  | "token_invalid"
  | "token_app_mismatch"
  | "permission_missing"
  | "phone_not_registered"
  | "webhook_not_subscribed"
  | "credentials_unreadable"
  | "meta_unavailable"
  | "meta_response_invalid";

export interface CloudCredentialHealth {
  readonly status: "pending" | "healthy" | "action_required" | "unknown";
  readonly checkedAt: string | null;
  readonly nextCheckAt: string | null;
  readonly token: {
    readonly status: "valid" | "expired" | "invalid" | "unknown";
    readonly expiresAt: string | null;
  };
  readonly missingPermissions: readonly (
    "whatsapp_business_messaging" | "whatsapp_business_management"
  )[];
  readonly phoneRegistration: "registered" | "not_registered" | "unknown";
  readonly webhookSubscription: "subscribed" | "not_subscribed" | "unknown";
  readonly failureCode: CloudCredentialFailureCode | null;
}

export interface CloudReauthorization {
  readonly quicklinkId: string;
  /** Share only with the person who manages this Number's Meta assets. */
  readonly url: string;
  readonly session: string;
}
