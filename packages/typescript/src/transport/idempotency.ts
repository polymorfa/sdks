import type { RequestOptions } from "./types.js";

/**
 * Give a non-idempotent messaging write a stable Idempotency-Key.
 *
 * A caller-supplied key wins. Otherwise one random key is generated per call,
 * so every automatic retry of that call reuses it. The endpoint determines the
 * retry response: completed messaging writes return idempotency_completed
 * without the original response body.
 */
export function withIdempotencyKey(options: RequestOptions): RequestOptions {
  if (options.idempotencyKey !== undefined) return options;
  return { ...options, idempotencyKey: globalThis.crypto.randomUUID() };
}
