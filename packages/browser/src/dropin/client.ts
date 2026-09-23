import {
  ObservableController,
  type ControllerSnapshot,
} from "../controller.js";
import { BrowserConfigurationError, BrowserHttpError } from "../errors.js";
import { BrowserMessagingClient } from "../messaging/client.js";
import type { ClientToken } from "../token.js";
import {
  isPolymorfaGrant,
  type PolymorfaGrant,
  type PolymorfaPermission,
} from "./permissions.js";

export type PolymorfaClientStatus =
  | "idle"
  | "loading"
  | "ready"
  | "refreshing"
  | "retrying"
  | "unauthenticated"
  | "error";

export interface PolymorfaClientSnapshot extends ControllerSnapshot {
  readonly status: PolymorfaClientStatus;
  /** Present once a token has been minted. */
  readonly grant?: PolymorfaGrant;
  /** Epoch milliseconds when the current token expires. */
  readonly expiresAt?: number;
  /** Epoch milliseconds of the next scheduled fetch. */
  readonly nextFetchAt?: number;
  /** Failed attempts since the last success. */
  readonly failures: number;
  readonly error?: string;
}

export interface PolymorfaClientOptions {
  /**
   * Same-origin path of your handler's token route. Default
   * `/api/polymorfa/token`. The other drop-in routes live next to it.
   */
  readonly tokenEndpoint?: string;
  /** Polymorfa API origin for direct client-token calls. */
  readonly baseUrl?: string;
  /** Refresh this long before expiry. Default 60 s. */
  readonly refreshBeforeMs?: number;
  /** Longest wait between failed attempts. Default 30 s. */
  readonly maxBackoffMs?: number;
  readonly fetch?: typeof globalThis.fetch;
  readonly now?: () => number;
  readonly random?: () => number;
  readonly setTimeout?: (callback: () => void, ms: number) => unknown;
  readonly clearTimeout?: (handle: unknown) => void;
}

interface TokenState extends ClientToken {
  readonly grant: PolymorfaGrant;
}

/**
 * Fetches client tokens from your server, refreshes them before they expire,
 * and backs off after failures. It never chooses permissions: the token
 * route decides, and `can()` only reports what the route granted.
 */
export class PolymorfaClient extends ObservableController<PolymorfaClientSnapshot> {
  readonly tokenEndpoint: string;
  /** The handler path the other routes share, for example `/api/polymorfa`. */
  readonly handlerPath: string;
  readonly baseUrl: string | undefined;
  readonly #fetch: typeof globalThis.fetch;
  readonly #now: () => number;
  readonly #random: () => number;
  readonly #refreshBeforeMs: number;
  readonly #maxBackoffMs: number;
  readonly #setTimeout: (callback: () => void, ms: number) => unknown;
  readonly #clearTimeout: (handle: unknown) => void;
  #token: TokenState | undefined;
  #pending: Promise<TokenState> | undefined;
  #timer: unknown;
  #started = false;
  #messaging = new Map<string, BrowserMessagingClient>();

  constructor(options: PolymorfaClientOptions = {}) {
    const now = options.now ?? Date.now;
    super({ status: "idle", failures: 0 }, now);
    const endpoint = options.tokenEndpoint ?? "/api/polymorfa/token";
    assertSameOriginPath(endpoint);
    this.tokenEndpoint = endpoint;
    this.handlerPath = endpoint.replace(/\/token\/?$/, "");
    this.baseUrl = options.baseUrl;
    const fetch = options.fetch ?? globalThis.fetch?.bind(globalThis);
    if (typeof fetch !== "function")
      throw new BrowserConfigurationError(
        "A fetch implementation is required.",
        "missing_fetch",
      );
    this.#fetch = fetch;
    this.#now = now;
    this.#random = options.random ?? Math.random;
    this.#refreshBeforeMs = options.refreshBeforeMs ?? 60_000;
    this.#maxBackoffMs = options.maxBackoffMs ?? 30_000;
    this.#setTimeout =
      options.setTimeout ??
      ((callback, ms) => globalThis.setTimeout(callback, ms));
    this.#clearTimeout =
      options.clearTimeout ??
      ((handle) =>
        globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>));
  }

  /** Fetch the first token. Safe to call more than once. */
  start(): void {
    if (this.#started) return;
    this.#started = true;
    void this.#fetchToken().catch(() => undefined);
  }

  /** Whether the current grant allows `permission`. False until minted. */
  can(permission: PolymorfaPermission): boolean {
    return this.getSnapshot().grant?.allow.includes(permission) === true;
  }

  /** Whether the grant covers a conversation. */
  canRead(conversationId: string): boolean {
    const grant = this.getSnapshot().grant;
    if (grant === undefined || !grant.allow.includes("read_messages"))
      return false;
    return (
      grant.conversations === "all" ||
      grant.conversations.includes(conversationId)
    );
  }

  /**
   * Token provider for `BrowserTransport` and the Calls client. Returns the
   * cached token while it is valid and waits for a fetch otherwise.
   */
  getClientToken = async (): Promise<ClientToken> => {
    const current = this.#token;
    if (current !== undefined && current.expiresAt - 5_000 > this.#now())
      return current;
    return this.#fetchToken();
  };

  /** Fetch a new token now, for example after the API answered `403`. */
  async refresh(): Promise<void> {
    await this.#fetchToken(true);
  }

  /** Absolute URL path for a handler route, for example `url("events")`. */
  url(route: string): string {
    return `${this.handlerPath}/${route.replace(/^\/+/, "")}`;
  }

  /**
   * GET or POST a JSON handler route. Checks the status and content type,
   * so an HTML proxy error becomes a clear error instead of a parse failure.
   */
  async request<T>(
    route: string,
    init: {
      readonly method?: "GET" | "POST";
      readonly body?: unknown;
      readonly signal?: AbortSignal;
    } = {},
  ): Promise<T> {
    const response = await this.#fetch(this.url(route), {
      method: init.method ?? "GET",
      credentials: "same-origin",
      headers: {
        accept: "application/json",
        ...(init.body === undefined
          ? {}
          : { "content-type": "application/json" }),
      },
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
      ...(init.signal === undefined ? {} : { signal: init.signal }),
    });
    return readJson<T>(response, route);
  }

  /** The fetch implementation this client uses, for same-origin helpers. */
  get fetch(): typeof globalThis.fetch {
    return this.#fetch;
  }

  /** A browser Messaging client for `session`, sharing this client's tokens. */
  messaging(session?: string): BrowserMessagingClient {
    const resolved = session ?? this.getSnapshot().grant?.session;
    if (resolved === undefined)
      throw new BrowserConfigurationError(
        "The grant names no session. Pass the conversation's session.",
        "missing_session",
      );
    let client = this.#messaging.get(resolved);
    if (client === undefined) {
      client = new BrowserMessagingClient({
        session: resolved,
        getClientToken: this.getClientToken,
        fetch: this.#fetch,
        ...(this.baseUrl === undefined ? {} : { baseUrl: this.baseUrl }),
      });
      this.#messaging.set(resolved, client);
    }
    return client;
  }

  protected override onDispose(): void {
    if (this.#timer !== undefined) this.#clearTimeout(this.#timer);
    this.#timer = undefined;
    this.#messaging.clear();
  }

  #fetchToken(force = false): Promise<TokenState> {
    if (this.#pending !== undefined && !force) return this.#pending;
    const promise = this.#load().finally(() => {
      if (this.#pending === promise) this.#pending = undefined;
    });
    this.#pending = promise;
    return promise;
  }

  async #load(): Promise<TokenState> {
    this.#started = true;
    if (this.#timer !== undefined) this.#clearTimeout(this.#timer);
    this.#timer = undefined;
    const previous = this.getSnapshot();
    this.#safeTransition({
      ...fields(previous),
      status: this.#token === undefined ? "loading" : "refreshing",
    });
    try {
      const response = await this.#fetch(this.tokenEndpoint, {
        method: "POST",
        credentials: "same-origin",
        headers: { accept: "application/json" },
      });
      const body = await readJson<unknown>(response, "token");
      const token = readToken(body, this.#now());
      this.#token = token;
      const refreshAt = this.#refreshAt(token.expiresAt);
      this.#safeTransition({
        status: "ready",
        grant: token.grant,
        expiresAt: token.expiresAt,
        nextFetchAt: refreshAt,
        failures: 0,
      });
      this.#schedule(refreshAt - this.#now());
      return token;
    } catch (cause) {
      const status = (cause as { status?: unknown }).status;
      const failures = this.getSnapshot().failures + 1;
      const message = cause instanceof Error ? cause.message : String(cause);
      const current = fields(this.getSnapshot());
      if (status === 401 || status === 403) {
        // Signed out or refused: retrying would not change the answer.
        this.#token = undefined;
        this.#safeTransition({
          status: "unauthenticated",
          failures,
          error: message,
        });
      } else {
        const delay = this.#backoff(failures);
        this.#safeTransition({
          ...current,
          status: "retrying",
          failures,
          nextFetchAt: this.#now() + delay,
          error: message,
        });
        this.#schedule(delay);
      }
      throw cause;
    }
  }

  #refreshAt(expiresAt: number): number {
    const now = this.#now();
    const lifetime = expiresAt - now;
    // Short-lived tokens refresh at 80 % of their lifetime.
    const lead = Math.min(this.#refreshBeforeMs, lifetime * 0.2);
    return Math.max(now + 1_000, expiresAt - lead);
  }

  /** Exponential backoff with equal jitter: 1 s, 2 s, 4 s … capped. */
  #backoff(failures: number): number {
    const ceiling = Math.min(
      this.#maxBackoffMs,
      1_000 * 2 ** Math.min(failures - 1, 16),
    );
    return Math.round(ceiling / 2 + (this.#random() * ceiling) / 2);
  }

  #schedule(delay: number): void {
    if (this.#timer !== undefined) this.#clearTimeout(this.#timer);
    this.#timer = this.#setTimeout(
      () => {
        this.#timer = undefined;
        void this.#fetchToken(true).catch(() => undefined);
      },
      Math.max(0, delay),
    );
  }

  #safeTransition(
    next: Omit<PolymorfaClientSnapshot, "revision" | "updatedAt">,
  ) {
    try {
      this.transition(next);
    } catch {
      // Disposed while a fetch was in flight.
    }
  }
}

function fields(
  snapshot: PolymorfaClientSnapshot,
): Omit<PolymorfaClientSnapshot, "revision" | "updatedAt"> {
  const { revision: _revision, updatedAt: _updatedAt, ...rest } = snapshot;
  void _revision;
  void _updatedAt;
  return rest;
}

function readToken(value: unknown, now: number): TokenState {
  const token = value as Partial<ClientToken & { grant: unknown }> | null;
  if (
    token === null ||
    typeof token !== "object" ||
    typeof token.value !== "string" ||
    !token.value.startsWith("pmfa_ct_") ||
    token.value.length <= "pmfa_ct_".length ||
    token.audience !== "browser" ||
    typeof token.expiresAt !== "number" ||
    !Number.isFinite(token.expiresAt)
  )
    throw new BrowserConfigurationError(
      "The token route returned an invalid client token.",
      "invalid_token_response",
    );
  if (token.expiresAt <= now)
    throw new BrowserConfigurationError(
      "The token route returned an expired client token.",
      "expired_client_token",
    );
  if (!isPolymorfaGrant(token.grant))
    throw new BrowserConfigurationError(
      "The token route returned no grant. Serve it with createPolymorfaHandler.",
      "invalid_token_response",
    );
  return Object.freeze({
    value: token.value,
    audience: "browser",
    expiresAt: token.expiresAt,
    scopes: Object.freeze([...token.grant.allow]),
    grant: Object.freeze({
      ...token.grant,
      allow: Object.freeze([...token.grant.allow]),
      conversations:
        token.grant.conversations === "all"
          ? "all"
          : Object.freeze([...token.grant.conversations]),
    }),
  });
}

/** Reads a JSON handler response, rejecting HTML and non-2xx answers. */
export async function readJson<T>(
  response: Response,
  route: string,
): Promise<T> {
  const type = response.headers.get("content-type") ?? "";
  const isJson = /^application\/([a-z0-9.+-]*\+)?json\b/i.test(type);
  let body: unknown;
  if (isJson) {
    try {
      body = await response.json();
    } catch {
      body = undefined;
    }
  }
  if (!response.ok) {
    const error = (body as { error?: { code?: unknown; message?: unknown } })
      ?.error;
    throw new BrowserHttpError(
      typeof error?.message === "string"
        ? error.message
        : `The ${route} route answered ${response.status}.`,
      {
        category:
          response.status === 401
            ? "authentication"
            : response.status === 403
              ? "authorization"
              : response.status === 404
                ? "not_found"
                : response.status >= 500
                  ? "server"
                  : "http",
        status: response.status,
        code: typeof error?.code === "string" ? error.code : "route_failed",
      },
    );
  }
  if (!isJson)
    throw new BrowserConfigurationError(
      `The ${route} route returned ${type || "no content type"} instead of JSON. Check that the handler is mounted at this path.`,
      "invalid_route_response",
    );
  return body as T;
}

function assertSameOriginPath(path: string): void {
  if (
    !path.startsWith("/") ||
    path.startsWith("//") ||
    path.includes("\\") ||
    URL.canParse(path)
  )
    throw new BrowserConfigurationError(
      "tokenEndpoint must be a same-origin path such as /api/polymorfa/token.",
      "invalid_token_route",
    );
}

/** Creates a client and starts fetching its first token. */
export function createPolymorfaClient(
  options: PolymorfaClientOptions = {},
): PolymorfaClient {
  const client = new PolymorfaClient(options);
  client.start();
  return client;
}
