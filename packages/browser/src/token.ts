import { BrowserConfigurationError, BrowserHttpError } from "./errors.js";

export interface ClientToken {
  readonly value: string;
  readonly audience: "browser";
  readonly expiresAt: number;
  readonly scopes?: readonly string[];
}

export type ClientTokenProvider = () => Promise<string | ClientToken>;

export interface ClientTokenProviderOptions {
  readonly path?: string;
  readonly fetch?: typeof globalThis.fetch;
}

export function createClientTokenProvider(
  options: ClientTokenProviderOptions = {},
): ClientTokenProvider {
  const path = options.path ?? "/api/polymorfa/token";
  if (
    !path.startsWith("/") ||
    path.startsWith("//") ||
    path.includes("\\") ||
    URL.canParse(path)
  ) {
    throw new BrowserConfigurationError(
      "Client token route must be a same-origin relative path.",
      "invalid_token_route",
    );
  }
  const fetch = options.fetch ?? globalThis.fetch;
  if (typeof fetch !== "function") {
    throw new BrowserConfigurationError(
      "A fetch implementation is required for the client token route.",
      "missing_fetch",
    );
  }

  return async (): Promise<ClientToken> => {
    const response = await fetch(path, {
      method: "POST",
      credentials: "same-origin",
      headers: { accept: "application/json" },
    });
    if (!response.ok) {
      throw new BrowserHttpError(
        `Client token route failed with status ${response.status}.`,
        {
          category: response.status >= 500 ? "server" : "http",
          status: response.status,
          code: "client_token_route_failed",
        },
      );
    }

    let value: unknown;
    try {
      value = await response.json();
    } catch {
      throw new BrowserConfigurationError(
        "Client token route returned an invalid response.",
        "invalid_token_response",
      );
    }
    if (!isClientToken(value)) {
      throw new BrowserConfigurationError(
        "Client token route returned invalid browser claims.",
        "invalid_token_response",
      );
    }
    return Object.freeze({
      value: value.value,
      audience: "browser",
      expiresAt: value.expiresAt,
      ...(value.scopes === undefined
        ? {}
        : { scopes: Object.freeze([...value.scopes]) }),
    });
  };
}

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

function isClientToken(value: unknown): value is ClientToken {
  if (typeof value !== "object" || value === null) return false;
  const token = value as Partial<ClientToken>;
  return (
    typeof token.value === "string" &&
    token.value.startsWith("pmfa_ct_") &&
    token.value.length > "pmfa_ct_".length &&
    token.audience === "browser" &&
    typeof token.expiresAt === "number" &&
    Number.isFinite(token.expiresAt) &&
    (token.scopes === undefined ||
      (Array.isArray(token.scopes) &&
        token.scopes.every((scope) => typeof scope === "string")))
  );
}
