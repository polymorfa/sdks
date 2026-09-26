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
