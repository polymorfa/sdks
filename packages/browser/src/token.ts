import { BrowserConfigurationError } from "./errors.js";

export interface ClientToken {
  readonly value: string;
  readonly audience: "browser";
  readonly expiresAt: number;
  readonly scopes?: readonly string[];
}

export type ClientTokenProvider = () => Promise<string | ClientToken>;

export interface ClientTokenManagerOptions {
  readonly now?: () => number;
  readonly expirySkewMs?: number;
}

export class ClientTokenManager {
  readonly #provider: ClientTokenProvider;
  readonly #now: () => number;
  readonly #expirySkewMs: number;
  #cached: ClientToken | undefined;
  #pending: Promise<string> | undefined;

  constructor(
    provider: ClientTokenProvider,
    options: ClientTokenManagerOptions = {},
  ) {
    if (typeof provider !== "function")
      throw new BrowserConfigurationError("getClientToken must be a function.");
    this.#provider = provider;
    this.#now = options.now ?? Date.now;
    this.#expirySkewMs = options.expirySkewMs ?? 30_000;
    if (!Number.isFinite(this.#expirySkewMs) || this.#expirySkewMs < 0) {
      throw new BrowserConfigurationError(
        "expirySkewMs must be a non-negative number.",
      );
    }
  }

  get(): Promise<string> {
    if (
      this.#cached !== undefined &&
      this.#cached.expiresAt - this.#expirySkewMs > this.#now()
    ) {
      return Promise.resolve(this.#cached.value);
    }
    if (this.#pending !== undefined) return this.#pending;
    this.#pending = this.#refresh().finally(() => {
      this.#pending = undefined;
    });
    return this.#pending;
  }

  invalidate(): void {
    this.#cached = undefined;
  }

  async #refresh(): Promise<string> {
    const supplied = await this.#provider();
    if (typeof supplied === "string") {
      validatePrefix(supplied);
      return supplied;
    }
    validatePrefix(supplied.value);
    if (supplied.audience !== "browser") {
      throw new BrowserConfigurationError(
        "Client token audience must be browser.",
        "invalid_token_audience",
      );
    }
    if (
      !Number.isFinite(supplied.expiresAt) ||
      supplied.expiresAt <= this.#now()
    ) {
      throw new BrowserConfigurationError(
        "Client token is expired or has an invalid expiry.",
        "expired_client_token",
      );
    }
    this.#cached = Object.freeze({
      ...supplied,
      ...(supplied.scopes === undefined
        ? {}
        : { scopes: Object.freeze([...supplied.scopes]) }),
    });
    return supplied.value;
  }
}

function validatePrefix(value: string): void {
  if (!value.startsWith("pmfa_ct_") || value.length <= "pmfa_ct_".length) {
    throw new BrowserConfigurationError(
      "Browser client token must use the pmfa_ct_ prefix.",
      "invalid_client_token",
    );
  }
}
