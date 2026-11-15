function redactCredentialText(value: string): string {
  return value.replace(/pmfa_[A-Za-z0-9_-]+/g, "[REDACTED]");
}
function redactErrorDetails(value: unknown): unknown {
  if (typeof value === "string") return redactCredentialText(value);
  if (Array.isArray(value)) return value.map(redactErrorDetails);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [
        key,
        /^(authorization|apikey|projecttoken|clienttoken|credential|token|secret)$/i.test(
          key.replace(/[^a-z0-9]/gi, ""),
        )
          ? "[REDACTED]"
          : redactErrorDetails(child),
      ]),
    );
  return value;
}

import type { ResponseMetadata } from "./transport/types.js";

/**
 * Stable `error.code` values documented at https://docs.polymorfa.com/api/errors.
 * The API can add codes, so `PolymorfaErrorCode` also accepts any string;
 * existing values are never renamed or reused.
 */
export const POLYMORFA_ERROR_CODES = [
  "addon_required",
  "asset_not_ready",
  "bansafe_accounting_unavailable",
  "bansafe_cold_blocked",
  "bansafe_cold_held",
  "bansafe_daily_allowance_reached",
  "bansafe_send_outcome_unknown",
  "bansafe_suspended",
  "bansafe_team_suspended",
  "bansafe_throttled",
  "billing_credit_required",
  "call_claimed",
  "call_destination_blocked",
  "call_not_ringing",
  "call_opt_out_limit",
  "call_permission_granted",
  "call_permission_request_limited",
  "call_permission_required",
  "call_recipient_opted_out",
  "calls_disabled",
  "campaign_approval_required",
  "campaign_approval_stale",
  "campaign_throughput_capped",
  "campaign_variables_missing",
  "campaigns_not_entitled",
  "catalog_cache_full",
  "catalog_sync_cooldown",
  "cloud_template_authority_restricted",
  "command_dispatch_failed",
  "connection_limit",
  "connection_not_ready",
  "connection_restricted",
  "conversation_window_closed",
  "credential_verification_unavailable",
  "entitlement_required",
  "feature_unavailable",
  "gate_limit_reached",
  "hms_not_enabled",
  "hybrid_automation_unavailable",
  "hybrid_choice_required",
  "hybrid_group_linked_devices_unavailable",
  "hybrid_routing_paused",
  "hybrid_target_reference_unavailable",
  "hybrid_transition_ineligible",
  "hybrid_transport_unavailable",
  "idempotency_completed",
  "idempotency_conflict",
  "idempotency_in_progress",
  "idempotency_outcome_unknown",
  "idempotency_replay_unavailable",
  "internal_error",
  "invalid_credential",
  "invalid_parameter",
  "invalid_sip_trunk",
  "marketing_disabled_on_cloud_api",
  "media_fetch_failed",
  "media_too_large",
  "method_not_allowed",
  "missing_scope",
  "new_chat_limit_reached",
  "operation_not_supported",
  "order_cancellation_failed",
  "order_status_transition_invalid",
  "parent_bsuid_not_supported",
  "payg_required",
  "permission_denied",
  "premium_required",
  "provider_credential_invalid",
  "provider_unavailable",
  "rate_limit_exceeded",
  "recipient_not_on_whatsapp",
  "resource_gone",
  "resource_not_found",
  "result_unknown",
  "safe_mode_not_entitled",
  "send_outcome_unknown",
  "service_unavailable",
  "sip_trunk_in_use",
  "sip_trunk_limit",
  "sip_trunk_revision_conflict",
  "sip_unavailable",
  "state_conflict",
  "stream_connection_limit_reached",
  "stream_cursor_expired",
  "stream_cursor_invalid",
  "team_deletion_scheduled",
  "template_not_approved",
  "terms_acceptance_required",
  "terms_activation_blocked",
  "unsupported_for_connection",
  "upstream_failure",
  "voice_asset_in_use",
  "voice_asset_revision_conflict",
  "voice_not_enabled",
  "voice_unavailable",
  "warmup_plan_not_entitled",
  "whatsapp_account_restricted",
  "whatsapp_authorization_required",
  "whatsapp_group_creation_paused",
  "whatsapp_group_full",
  "whatsapp_group_has_no_participants",
  "whatsapp_group_limit_reached",
  "whatsapp_group_suspended",
  "whatsapp_groups_ineligible",
  "whatsapp_number_not_registered",
  "whatsapp_payment_method_required",
  "whatsapp_rate_limited",
  "zero_knowledge_connection",
] as const;

export type KnownPolymorfaErrorCode = (typeof POLYMORFA_ERROR_CODES)[number];
// `string & {}` keeps editor completion for known codes without rejecting new ones.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type PolymorfaErrorCode = KnownPolymorfaErrorCode | (string & {});

/** Values of the `Polymorfa-RateLimit-Reason` header on a 429. */
export type PolymorfaRateLimitReason =
  | "request_rate"
  | "whatsapp"
  | "whatsapp_new_chat_limit"
  | "bansafe_pacing"
  | "daily_allowance"
  | "call_rate"
  | "call_concurrency"
  | "credential_mint"
  | "call_permission_request"
  | "unspecified"
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  | (string & {});

export function isKnownPolymorfaErrorCode(
  code: unknown,
): code is KnownPolymorfaErrorCode {
  return (
    typeof code === "string" &&
    (POLYMORFA_ERROR_CODES as readonly string[]).includes(code)
  );
}

export interface PolymorfaErrorOptions {
  readonly param?: string;
  readonly code?: PolymorfaErrorCode;
  readonly status?: number;
  readonly requestId?: string;
  readonly requestLogUrl?: string;
  readonly docUrl?: string;
  readonly rateLimitReason?: PolymorfaRateLimitReason;
  readonly details?: unknown;
  readonly metadata?: ResponseMetadata;
  readonly cause?: unknown;
}

export class PolymorfaError extends Error {
  readonly param: string | undefined;
  readonly code: PolymorfaErrorCode | undefined;
  readonly status: number | undefined;
  /** `error.request_id` from the body, else the `X-Request-Id` header. */
  readonly requestId: string | undefined;
  /** Console page for this request, when the API returned one. */
  readonly requestLogUrl: string | undefined;
  /** Documentation for `code` (the body's `docs` link). */
  readonly docUrl: string | undefined;
  /** The `Polymorfa-RateLimit-Reason` header on a 429. */
  readonly rateLimitReason: PolymorfaRateLimitReason | undefined;
  readonly details: unknown;
  readonly metadata: ResponseMetadata | undefined;

  constructor(message: string, options: PolymorfaErrorOptions = {}) {
    super(
      redactCredentialText(message),
      options.cause === undefined ? undefined : { cause: options.cause },
    );
    this.name = new.target.name;
    this.code = options.code;
    this.param = options.param;
    this.status = options.status;
    this.requestId = options.requestId;
    this.requestLogUrl = options.requestLogUrl;
    this.docUrl = options.docUrl;
    this.rateLimitReason = options.rateLimitReason;
    this.details = redactErrorDetails(options.details);
    this.metadata = options.metadata;
  }
}

export class PolymorfaConfigurationError extends PolymorfaError {
  readonly field: string | undefined;

  constructor(message: string, field?: string) {
    super(message, { code: "configuration_error" });
    this.field = field;
  }
}

export class PolymorfaValidationError extends PolymorfaError {}
export class PolymorfaAuthenticationError extends PolymorfaError {}
export class PolymorfaAuthorizationError extends PolymorfaError {}
export class PolymorfaPaymentRequiredError extends PolymorfaError {}
export class PolymorfaNotFoundError extends PolymorfaError {}
export class PolymorfaConflictError extends PolymorfaError {}
export class PolymorfaRateLimitError extends PolymorfaError {}
export class PolymorfaServerError extends PolymorfaError {}
export class PolymorfaConnectionError extends PolymorfaError {}
export class PolymorfaTimeoutError extends PolymorfaError {}
export class PolymorfaCancelledError extends PolymorfaError {}

export type MediaIntegrityErrorCode =
  | "media_invalid_descriptor"
  | "media_too_short"
  | "media_too_large"
  | "media_invalid_ciphertext"
  | "media_enc_hash_mismatch"
  | "media_mac_mismatch"
  | "media_invalid_padding"
  | "media_hash_mismatch";

/** Raised when WhatsApp media fails validation, authentication, or size limits. */
export class PolymorfaMediaIntegrityError extends PolymorfaError {
  declare readonly code: MediaIntegrityErrorCode;

  constructor(message: string, code: MediaIntegrityErrorCode) {
    super(message, { code });
  }
}
