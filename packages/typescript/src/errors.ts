import type { ResponseMetadata } from "./transport/types.js";

/**
 * Stable `error.code` values documented at https://docs.polymorfa.com/api/errors.
 * The API can add codes, so `PolymorfaErrorCode` also accepts any string;
 * existing values are never renamed or reused.
 */
export const POLYMORFA_ERROR_CODES = [
  "invalid_parameter",
  "invalid_credential",
  "entitlement_required",
  "method_not_allowed",
  "permission_denied",
  "missing_scope",
  "resource_not_found",
  "media_fetch_failed",
  "resource_gone",
  "state_conflict",
  "rate_limit_exceeded",
  "internal_error",
  "operation_not_supported",
  "upstream_failure",
  "service_unavailable",
  "credential_verification_unavailable",
  "session_not_ready",
  "command_dispatch_failed",
  "result_unknown",
  "recipient_not_on_whatsapp",
  "conversation_window_closed",
  "template_not_approved",
  "media_too_large",
  "whatsapp_rate_limited",
  "new_chat_limit_reached",
  "whatsapp_account_restricted",
  "bansafe_suspended",
  "bansafe_org_suspended",
  "bansafe_cold_blocked",
  "bansafe_cold_held",
  "bansafe_throttled",
  "bansafe_daily_allowance_reached",
  "bansafe_accounting_unavailable",
  "bansafe_send_outcome_unknown",
  "campaigns_not_entitled",
  "idempotency_completed",
  "idempotency_conflict",
  "idempotency_in_progress",
  "idempotency_outcome_unknown",
  "feature_unavailable",
  "stream_connection_limit_reached",
  "stream_cursor_expired",
  "stream_cursor_invalid",
  "payg_required",
  "premium_required",
  "call_claimed",
  "call_not_ringing",
  "call_permission_required",
  "calls_disabled",
  "connection_limit",
  "invalid_sip_trunk",
  "sip_trunk_in_use",
  "sip_trunk_limit",
  "sip_trunk_revision_conflict",
  "sip_unavailable",
  "unsupported_for_connection",
  "voice_not_enabled",
  "gate_limit_reached",
  "provider_credential_invalid",
  "provider_unavailable",
  "asset_not_ready",
  "voice_asset_in_use",
  "voice_asset_revision_conflict",
  "voice_unavailable",
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
      message,
      options.cause === undefined ? undefined : { cause: options.cause },
    );
    this.name = new.target.name;
    this.code = options.code;
    this.status = options.status;
    this.requestId = options.requestId;
    this.requestLogUrl = options.requestLogUrl;
    this.docUrl = options.docUrl;
    this.rateLimitReason = options.rateLimitReason;
    this.details = options.details;
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
