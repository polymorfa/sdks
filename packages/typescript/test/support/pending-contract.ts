/**
 * Public contract the SDK types ahead of the pinned OpenAPI snapshots.
 *
 * Voice Automation audio library and provider credentials follow contract
 * revision `voice-audio-v1` (polymorfa/polymorfa branch
 * `t3code/voice-audio-library`, based on dev 91444480e). Its OpenAPI files
 * were not published when the SDK side was written, so the snapshots in
 * `contracts/` do not contain these codes or events yet. Parity tests add
 * them explicitly, and a guard test fails once a re-synced snapshot contains
 * one, so the entry is removed and checked against the real schema.
 */
export const PENDING_CONTRACT_REVISION = "voice-audio-v1";

export const PENDING_ERROR_CODES = [
  "voice_not_enabled",
  "gate_limit_reached",
  "provider_credential_invalid",
  "provider_unavailable",
  "asset_not_ready",
  "voice_asset_in_use",
  "voice_asset_revision_conflict",
  "voice_unavailable",
] as const;

export const PENDING_WEBHOOK_EVENTS = [
  "voice.asset_failed",
  "voice.asset_ready",
] as const;

export type PendingWebhookEvent = (typeof PENDING_WEBHOOK_EVENTS)[number];
