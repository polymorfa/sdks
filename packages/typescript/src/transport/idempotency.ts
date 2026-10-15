import type { RequestOptions } from "./types.js";
import { PolymorfaConfigurationError } from "../errors.js";

/**
 * Give a non-idempotent messaging write a stable Idempotency-Key.
 *
 * The explicit key option wins, then one case-insensitive header value.
 * Otherwise one random key is generated per call,
 * so every automatic retry of that call reuses it. The endpoint determines the
 * retry response: completed messaging writes return idempotency_completed
 * without the original response body.
 */
export function withIdempotencyKey(options: RequestOptions): RequestOptions {
  let key = options.idempotencyKey;
  let headerKeyPresent = false;
  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(options.headers ?? {})) {
    if (name.toLowerCase() !== "idempotency-key") {
      headers[name] = value;
    } else if (options.idempotencyKey === undefined) {
      if (headerKeyPresent && key !== value) {
        throw new PolymorfaConfigurationError(
          "Supply one unambiguous idempotency key.",
          "idempotencyKey",
        );
      }
      key = value;
      headerKeyPresent = true;
    }
  }
  if (key !== undefined || headerKeyPresent) {
    if (
      typeof key !== "string" ||
      key.trim().length === 0 ||
      new TextEncoder().encode(key).length > 255 ||
      Array.from(key).some((character) => {
        const code = character.charCodeAt(0);
        return (code < 32 && code !== 9) || code === 127;
      })
    ) {
      throw new PolymorfaConfigurationError(
        "The idempotency key must contain 1 to 255 bytes and valid header characters.",
        "idempotencyKey",
      );
    }
  }
  return {
    ...options,
    ...(options.headers === undefined ? {} : { headers }),
    idempotencyKey: key ?? globalThis.crypto.randomUUID(),
  };
}

/**
 * Send a write whose contract declares no Idempotency-Key replay at most once.
 *
 * No key is generated, and automatic retries are off unless the caller sets
 * `maxNetworkRetries` for this request. Like any unsafe method, the append is
 * then retried only if the caller also supplies `idempotencyKey`. The API would
 * process a resent append as a new append, so a retry after a lost response
 * would report the rows the first attempt added as duplicates.
 */
export function withoutAutomaticRetry(options: RequestOptions): RequestOptions {
  if (options.maxNetworkRetries !== undefined) return options;
  return { ...options, maxNetworkRetries: 0 };
}
