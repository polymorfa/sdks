import type { HttpMethod } from "./types.js";

const SAFE_METHODS = new Set<HttpMethod>(["GET", "HEAD", "OPTIONS"]);
const RETRYABLE_STATUSES = new Set([408, 409, 429]);

export function canRetryRequest(method: HttpMethod, idempotencyKey: string | undefined): boolean {
  return SAFE_METHODS.has(method) || (idempotencyKey !== undefined && idempotencyKey.length > 0);
}

export function isRetryableStatus(status: number): boolean {
  return RETRYABLE_STATUSES.has(status) || status >= 500;
}

export function retryDelayMs(response: Response | undefined, attempt: number, random: () => number): number {
  const retryAfter = response?.headers.get("retry-after");
  if (retryAfter !== null && retryAfter !== undefined) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.min(seconds * 1_000, 60_000);
    }
    const date = Date.parse(retryAfter);
    if (Number.isFinite(date)) {
      return Math.min(Math.max(date - Date.now(), 0), 60_000);
    }
  }

  const ceiling = Math.min(500 * 2 ** Math.max(attempt - 1, 0), 5_000);
  return Math.floor(ceiling * (0.5 + random() * 0.5));
}

export async function defaultSleep(milliseconds: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted === true) {
    throw signal.reason;
  }
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, milliseconds);
    const abort = () => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    signal?.addEventListener("abort", abort, { once: true });
  });
}
