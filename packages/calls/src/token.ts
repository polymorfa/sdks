import { CallsError } from "./errors.js";

/** A credential value and, when known, its expiry in Unix epoch milliseconds. */
export interface CallsToken {
  readonly value: string;
  readonly expiresAt?: number;
}

export interface CallsTokenRequest {
  /** True when a cached token must not be reused (expiry or a 4401 close). */
  readonly refresh?: boolean;
  readonly signal?: AbortSignal;
}

/**
 * Supplies the credential for REST calls and socket authentication. Browser
 * applications return a client token minted by their own server with
 * `POST /platform/client-tokens`. Server applications may return an
 * organization API key or project token.
 */
export type CallsTokenProvider = (
  request: CallsTokenRequest,
) => Promise<string | CallsToken>;

export interface CallsTokenSourceOptions {
  readonly now?: () => number;
  /** Treat a token as expired this long before `expiresAt`. Default 30 000 ms. */
  readonly expirySkewMs?: number;
}

/** Client tokens are bound to one session and one participant by the platform. */
export function isClientToken(value: string): boolean {
  return value.startsWith("pmfa_ct_");
}

/**
 * Caches a provider's token until shortly before it expires. A static string
 * never expires from the client's point of view; the platform still closes
 * sockets with 4401 when it stops authorizing the session.
 */
export class CallsTokenSource {
  readonly #provider: CallsTokenProvider;
  readonly #now: () => number;
  readonly #skew: number;
  #cached: CallsToken | undefined;
  #pending: PendingFetch | undefined;
  // Only the latest provider call may replace the cached token.
  #fetchGeneration = 0;

  constructor(
    provider: string | CallsTokenProvider,
    options: CallsTokenSourceOptions = {},
  ) {
    if (typeof provider === "string") {
      if (provider.length === 0)
        throw new CallsError("invalid_token", "The token must not be empty.");
      const token: CallsToken = { value: provider };
      this.#provider = async () => token;
    } else if (typeof provider === "function") {
      this.#provider = provider;
    } else {
      throw new CallsError(
        "invalid_token",
        "Pass a token string or a token provider function.",
      );
    }
    this.#now = options.now ?? Date.now;
    this.#skew = options.expirySkewMs ?? 30_000;
  }

  /** Resolve the current token, calling the provider when none is usable. */
  get(request: CallsTokenRequest = {}): Promise<CallsToken> {
    const cached = this.#cached;
    if (
      request.refresh !== true &&
      cached !== undefined &&
      (cached.expiresAt === undefined ||
        cached.expiresAt - this.#skew > this.#now())
    )
      return Promise.resolve(cached);
    const refresh = request.refresh === true;
    if (refresh) this.#cached = undefined;
    // A refresh never takes the result of a provider call that was not asked
    // to refresh: that call may return the refused token.
    let pending = this.#pending;
    if (pending === undefined || (refresh && !pending.refresh)) {
      const generation = ++this.#fetchGeneration;
      const controller = new AbortController();
      const entry: PendingFetch = {
        promise: Promise.resolve() as unknown as Promise<CallsToken>,
        refresh,
        controller,
        waiters: 0,
        anchored: false,
      };
      entry.promise = this.#fetch(
        refresh,
        controller.signal,
        generation,
      ).finally(() => {
        if (this.#pending === entry) this.#pending = undefined;
      });
      // Every caller may have gone before it settles.
      entry.promise.catch(() => undefined);
      this.#pending = entry;
      pending = entry;
    }
    return this.#wait(pending, request.signal);
  }

  /**
   * Hand one caller the shared provider call. The call runs under its own
   * signal: a caller's cancellation rejects only that caller, and the call
   * itself is cancelled once every caller that could cancel has done so and
   * no caller without a signal is waiting.
   */
  #wait(
    entry: PendingFetch,
    signal: AbortSignal | undefined,
  ): Promise<CallsToken> {
    if (signal === undefined) {
      entry.anchored = true;
      return entry.promise;
    }
    if (signal.aborted) return Promise.reject(signal.reason);
    entry.waiters += 1;
    return new Promise<CallsToken>((resolve, reject) => {
      let done = false;
      const leave = () => {
        if (done) return false;
        done = true;
        entry.waiters -= 1;
        signal.removeEventListener("abort", onAbort);
        return true;
      };
      const onAbort = () => {
        if (!leave()) return;
        reject(signal.reason);
        if (entry.waiters === 0 && !entry.anchored) {
          if (this.#pending === entry) this.#pending = undefined;
          entry.controller.abort(signal.reason);
        }
      };
      signal.addEventListener("abort", onAbort, { once: true });
      entry.promise.then(
        (token) => {
          if (leave()) resolve(token);
        },
        (cause: unknown) => {
          if (leave()) reject(cause);
        },
      );
    });
  }

  /**
   * Drop the cached token so the next `get()` asks the provider. A provider
   * call already in flight may return the refused token: it neither answers
   * later requests nor replaces the cache.
   */
  invalidate(): void {
    this.#cached = undefined;
    this.#pending = undefined;
    this.#fetchGeneration += 1;
  }

  async #fetch(
    refresh: boolean,
    signal: AbortSignal,
    generation: number,
  ): Promise<CallsToken> {
    const supplied = await this.#provider({ refresh, signal });
    const token = normalizeToken(supplied);
    if (generation === this.#fetchGeneration) this.#cached = token;
    return token;
  }
}

interface PendingFetch {
  promise: Promise<CallsToken>;
  readonly refresh: boolean;
  readonly controller: AbortController;
  /** Callers with a signal still waiting. */
  waiters: number;
  /** A caller without a signal is waiting, so the call is never cancelled. */
  anchored: boolean;
}

export function normalizeToken(supplied: unknown): CallsToken {
  if (typeof supplied === "string" && supplied.length > 0)
    return { value: supplied };
  if (supplied !== null && typeof supplied === "object") {
    const t = supplied as { value?: unknown; expiresAt?: unknown };
    if (typeof t.value === "string" && t.value.length > 0) {
      if (t.expiresAt === undefined) return { value: t.value };
      if (typeof t.expiresAt === "number" && Number.isFinite(t.expiresAt))
        return { value: t.value, expiresAt: t.expiresAt };
    }
  }
  throw new CallsError(
    "invalid_token",
    "The token provider returned an invalid token.",
  );
}
