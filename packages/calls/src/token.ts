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
  #pending: Promise<CallsToken> | undefined;

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
    if (request.refresh === true) this.#cached = undefined;
    if (this.#pending !== undefined) return this.#pending;
    const pending = this.#fetch(request).finally(() => {
      if (this.#pending === pending) this.#pending = undefined;
    });
    this.#pending = pending;
    return pending;
  }

  /** Drop the cached token so the next `get()` asks the provider. */
  invalidate(): void {
    this.#cached = undefined;
  }

  async #fetch(request: CallsTokenRequest): Promise<CallsToken> {
    const supplied = await this.#provider({
      refresh: request.refresh === true,
      ...(request.signal === undefined ? {} : { signal: request.signal }),
    });
    const token = normalizeToken(supplied);
    this.#cached = token;
    return token;
  }
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
