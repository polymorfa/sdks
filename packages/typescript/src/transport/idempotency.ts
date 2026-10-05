import type { RequestOptions } from "./types.js";

/**
 * Give a non-idempotent write a stable Idempotency-Key.
 *
 * A caller-supplied key wins. Otherwise one random key is generated per call,
 * so every automatic retry of that call reuses it. The endpoint determines the
 * retry response: completed messaging writes and campaign commands return
 * `idempotency_completed` without the original response body; audience create
 * and the audience and campaign recipient appends return the original result
 * with `Idempotent-Replayed: true`.
 */
export function withIdempotencyKey(options: RequestOptions): RequestOptions {
  if (options.idempotencyKey !== undefined) return options;
  return { ...options, idempotencyKey: globalThis.crypto.randomUUID() };
}

/**
 * Send a keyed write at most once unless the caller opts into retries.
 *
 * Automatic retries are off unless the caller sets `maxNetworkRetries` for
 * this request. Campaign reschedule uses this: a retry after a lost response
 * could act on a campaign whose state has since changed, so the SDK leaves
 * the decision to retry with the same key to the caller.
 */
export function withoutAutomaticRetry(options: RequestOptions): RequestOptions {
  if (options.maxNetworkRetries !== undefined) return options;
  return { ...options, maxNetworkRetries: 0 };
}
