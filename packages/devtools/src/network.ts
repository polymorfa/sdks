import type { NetworkProfile } from "./model.js";

export interface SimulatedFetchOptions {
  readonly profile: () => NetworkProfile;
  readonly delayMs?: number;
  readonly fetch?: typeof globalThis.fetch;
}

/** Explicitly wraps fetch for development; no simulation is installed globally. */
export function createSimulatedFetch(
  options: SimulatedFetchOptions,
): typeof fetch {
  const fetchImplementation = options.fetch ?? globalThis.fetch;
  return async (input, init) => {
    const profile = options.profile();
    if (profile === "offline")
      throw new TypeError("Simulated offline network.");
    if (profile === "slow") {
      await abortableDelay(options.delayMs ?? 800, init?.signal);
    }
    return fetchImplementation(input, init);
  };
}

function abortableDelay(
  delayMs: number,
  signal: AbortSignal | null | undefined,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted === true) {
      reject(signal.reason);
      return;
    }
    const timeout = setTimeout(resolve, delayMs);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timeout);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}
