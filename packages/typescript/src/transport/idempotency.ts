import type { RequestOptions } from "./types.js";

/**
 * Give a non-idempotent messaging write a stable Idempotency-Key.
 *
 * A caller-supplied key wins. Otherwise one random key is generated per call,
 * so every automatic retry of that call reuses it and the API replays the
 * original result instead of performing the write again.
 */
export function withIdempotencyKey(options: RequestOptions): RequestOptions {
  if (options.idempotencyKey !== undefined) return options;
  return { ...options, idempotencyKey: globalThis.crypto.randomUUID() };
}

/**
 * Send a write whose contract declares no Idempotency-Key replay at most once.
 *
 * No key is generated, and automatic retries are off unless the caller sets
 * `maxNetworkRetries` for this request. The API would process a resent append
 * as a new append, so a retry after a lost response would report the rows the
 * first attempt added as duplicates. A caller key is still forwarded.
 */
export function withoutAutomaticRetry(options: RequestOptions): RequestOptions {
  if (options.maxNetworkRetries !== undefined) return options;
  return { ...options, maxNetworkRetries: 0 };
}
