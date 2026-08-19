import type {
  BrowserDiagnosticEvent,
  BrowserDiagnosticSink,
} from "./diagnostics.js";
import {
  BrowserCancelledError,
  BrowserConnectionError,
  BrowserError,
  BrowserHttpError,
  BrowserTimeoutError,
  BrowserValidationError,
} from "./errors.js";
import { ClientTokenManager, type ClientTokenProvider } from "./token.js";

export type BrowserHttpMethod =
  "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";

export interface BrowserRequest {
  readonly method: BrowserHttpMethod;
  readonly path: string;
  readonly query?: Readonly<
    Record<string, string | number | boolean | null | undefined>
  >;
  readonly body?: unknown;
  readonly headers?: Readonly<Record<string, string>>;
  readonly idempotencyKey?: string;
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
  readonly maxNetworkRetries?: number;
}

export interface BrowserResponseMetadata {
  readonly status: number;
  readonly requestId?: string;
  readonly attempts: number;
  readonly headers: Readonly<Record<string, string>>;
}

export interface BrowserResponse<T> {
  readonly data: T;
  readonly metadata: BrowserResponseMetadata;
}

export interface BrowserTransportOptions {
  readonly getClientToken: ClientTokenProvider;
  readonly baseUrl?: string;
  readonly timeoutMs?: number;
  readonly maxNetworkRetries?: number;
  readonly fetch?: typeof globalThis.fetch;
  readonly sleep?: (
    milliseconds: number,
    signal?: AbortSignal,
  ) => Promise<void>;
  readonly random?: () => number;
  readonly now?: () => number;
  readonly onDiagnostic?: BrowserDiagnosticSink;
}

const SAFE_METHODS = new Set<BrowserHttpMethod>(["GET", "HEAD", "OPTIONS"]);

export class BrowserTransport {
  readonly #baseUrl: string;
  readonly #tokens: ClientTokenManager;
  readonly #timeoutMs: number;
  readonly #maxNetworkRetries: number;
  readonly #fetch: typeof globalThis.fetch;
  readonly #sleep: (
    milliseconds: number,
    signal?: AbortSignal,
  ) => Promise<void>;
  readonly #random: () => number;
  readonly #now: () => number;
  readonly #onDiagnostic: BrowserDiagnosticSink | undefined;

  constructor(options: BrowserTransportOptions) {
    this.#baseUrl = (options.baseUrl ?? "https://api.polymorfa.com").replace(
      /\/+$/,
      "",
    );
    this.#tokens = new ClientTokenManager(options.getClientToken);
    this.#timeoutMs = positiveInteger(
      options.timeoutMs ?? 15_000,
      "timeoutMs",
      false,
    );
    this.#maxNetworkRetries = positiveInteger(
      options.maxNetworkRetries ?? 2,
      "maxNetworkRetries",
      true,
    );
    this.#fetch = options.fetch ?? globalThis.fetch;
    this.#sleep = options.sleep ?? defaultSleep;
    this.#random = options.random ?? Math.random;
    this.#now = options.now ?? Date.now;
    this.#onDiagnostic = options.onDiagnostic;
  }

  async request<T = unknown>(
    request: BrowserRequest,
  ): Promise<BrowserResponse<T>> {
    validatePath(request.path);
    const retries = positiveInteger(
      request.maxNetworkRetries ?? this.#maxNetworkRetries,
      "maxNetworkRetries",
      true,
    );
    const retryableMethod =
      SAFE_METHODS.has(request.method) || Boolean(request.idempotencyKey);
    let attempt = 0;
    while (true) {
      attempt += 1;
      const startedAt = this.#now();
      this.#emit({
        type: "request.started",
        timestamp: startedAt,
        method: request.method,
        path: request.path,
        attempt,
      });
      try {
        const response = await this.#perform(request);
        const data = await decodeBody(response);
        const metadata = responseMetadata(response, attempt);
        if (response.ok) {
          this.#emit({
            type: "request.completed",
            timestamp: this.#now(),
            method: request.method,
            path: request.path,
            attempt,
            status: response.status,
            durationMs: Math.max(this.#now() - startedAt, 0),
            ...(metadata.requestId === undefined
              ? {}
              : { requestId: metadata.requestId }),
          });
          return Object.freeze({ data: data as T, metadata });
        }
        if (
          retryableMethod &&
          attempt <= retries &&
          isRetryableStatus(response.status)
        ) {
          await this.#sleep(
            retryDelay(response, attempt, this.#random),
            request.signal,
          );
          continue;
        }
        throw httpError(response, data, metadata);
      } catch (cause) {
        const error = classifyFailure(cause, request.signal);
        if (
          (error instanceof BrowserConnectionError ||
            error instanceof BrowserTimeoutError) &&
          retryableMethod &&
          attempt <= retries
        ) {
          await this.#sleep(
            retryDelay(undefined, attempt, this.#random),
            request.signal,
          );
          continue;
        }
        this.#emit({
          type: "request.failed",
          timestamp: this.#now(),
          method: request.method,
          path: request.path,
          attempt,
          durationMs: Math.max(this.#now() - startedAt, 0),
          category: error.category,
          ...(error.status === undefined ? {} : { status: error.status }),
          ...(error.requestId === undefined
            ? {}
            : { requestId: error.requestId }),
        });
        throw error;
      }
    }
  }

  async #perform(request: BrowserRequest): Promise<Response> {
    throwIfAborted(request.signal);
    const token = await this.#tokens.get();
    throwIfAborted(request.signal);
    const headers = new Headers(request.headers);
    headers.set("accept", "application/json");
    headers.set("authorization", `Bearer ${token}`);
    headers.set("x-polymorfa-client", "browser/0.1.0-dev.0");
    if (request.idempotencyKey !== undefined)
      headers.set("idempotency-key", request.idempotencyKey);
    const body =
      request.body === undefined ? undefined : JSON.stringify(request.body);
    if (body !== undefined) headers.set("content-type", "application/json");

    const timeoutMs = positiveInteger(
      request.timeoutMs ?? this.#timeoutMs,
      "timeoutMs",
      false,
    );
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    const cancel = () => controller.abort(request.signal?.reason);
    request.signal?.addEventListener("abort", cancel, { once: true });
    try {
      return await this.#fetch(requestUrl(this.#baseUrl, request), {
        method: request.method,
        headers,
        ...(body === undefined ? {} : { body }),
        signal: controller.signal,
      });
    } catch (cause) {
      if (timedOut) throw new RequestTimeout(timeoutMs, cause);
      throw cause;
    } finally {
      clearTimeout(timer);
      request.signal?.removeEventListener("abort", cancel);
    }
  }

  #emit(event: BrowserDiagnosticEvent): void {
    this.#onDiagnostic?.(Object.freeze(event));
  }
}

class RequestTimeout extends Error {
  constructor(
    readonly timeoutMs: number,
    cause: unknown,
  ) {
    super("Request timed out.", { cause });
  }
}

function validatePath(path: string): void {
  if (
    !path.startsWith("/") ||
    path.startsWith("//") ||
    path.includes("\\") ||
    URL.canParse(path)
  ) {
    throw new BrowserValidationError(
      "Browser request paths must be relative and begin with one slash.",
      "invalid_path",
    );
  }
}

function requestUrl(baseUrl: string, request: BrowserRequest): URL {
  const url = new URL(request.path, `${baseUrl}/`);
  for (const [key, value] of Object.entries(request.query ?? {})) {
    if (value !== undefined && value !== null)
      url.searchParams.append(key, String(value));
  }
  return url;
}

async function decodeBody(response: Response): Promise<unknown> {
  if (response.status === 204) return undefined;
  const text = await response.text();
  if (text.length === 0) return undefined;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("json")) return text;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function responseMetadata(
  response: Response,
  attempts: number,
): BrowserResponseMetadata {
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headers[key] = value;
  });
  const requestId =
    response.headers.get("x-request-id") ??
    response.headers.get("request-id") ??
    undefined;
  return Object.freeze({
    status: response.status,
    attempts,
    headers: Object.freeze(headers),
    ...(requestId === undefined ? {} : { requestId }),
  });
}

function httpError(
  response: Response,
  details: unknown,
  metadata: BrowserResponseMetadata,
): BrowserHttpError {
  const category =
    response.status === 401
      ? "authentication"
      : response.status === 403
        ? "authorization"
        : response.status === 404
          ? "not_found"
          : response.status === 409
            ? "conflict"
            : response.status === 429
              ? "rate_limit"
              : response.status >= 500
                ? "server"
                : "http";
  return new BrowserHttpError(errorMessage(details, response.status), {
    category,
    status: response.status,
    details,
    metadata,
    ...(metadata.requestId === undefined
      ? {}
      : { requestId: metadata.requestId }),
  });
}

function errorMessage(details: unknown, status: number): string {
  if (typeof details === "object" && details !== null) {
    const record = details as Record<string, unknown>;
    if (typeof record.message === "string") return record.message;
    if (typeof record.error === "string") return record.error;
  }
  return `Polymorfa browser request failed with status ${status}.`;
}

function classifyFailure(
  cause: unknown,
  signal: AbortSignal | undefined,
): BrowserError {
  if (cause instanceof BrowserError) return cause;
  if (signal?.aborted === true) {
    return new BrowserCancelledError("The browser request was cancelled.", {
      category: "cancelled",
      cause,
    });
  }
  if (cause instanceof RequestTimeout) {
    return new BrowserTimeoutError(
      `The browser request exceeded its ${cause.timeoutMs}ms timeout.`,
      {
        category: "timeout",
        cause,
      },
    );
  }
  return new BrowserConnectionError(
    "The browser request could not reach the Polymorfa API.",
    {
      category: "connection",
      cause,
    },
  );
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 409 || status === 429 || status >= 500;
}

function retryDelay(
  response: Response | undefined,
  attempt: number,
  random: () => number,
): number {
  const retryAfter = response?.headers.get("retry-after");
  if (retryAfter !== undefined && retryAfter !== null) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0)
      return Math.min(seconds * 1_000, 30_000);
  }
  const ceiling = Math.min(250 * 2 ** Math.max(attempt - 1, 0), 3_000);
  return Math.floor(ceiling * (0.5 + random() * 0.5));
}

async function defaultSleep(
  milliseconds: number,
  signal?: AbortSignal,
): Promise<void> {
  if (signal?.aborted === true) throw signal.reason;
  await new Promise<void>((resolve, reject) => {
    const finish = () => {
      signal?.removeEventListener("abort", abort);
      resolve();
    };
    const timer = setTimeout(finish, milliseconds);
    const abort = () => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    signal?.addEventListener("abort", abort, { once: true });
  });
}

function positiveInteger(
  value: number,
  field: string,
  allowZero: boolean,
): number {
  if (!Number.isInteger(value) || value < 0 || (!allowZero && value === 0)) {
    throw new BrowserValidationError(
      `${field} must be ${allowZero ? "a non-negative" : "a positive"} integer.`,
    );
  }
  return value;
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted === true) throw signal.reason;
}
