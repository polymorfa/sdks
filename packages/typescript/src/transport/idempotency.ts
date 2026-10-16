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
 * Send an unsafe write at most once unless the caller selects retries.
 *
 * No key is generated. Automatic retries require both an explicit
 * maxNetworkRetries value and a caller-supplied idempotency key. The endpoint's
 * contract determines whether a repeated request replays the original result.
 */
export function withoutAutomaticRetry(options: RequestOptions): RequestOptions {
  if (options.maxNetworkRetries !== undefined) return options;
  return { ...options, maxNetworkRetries: 0 };
}
