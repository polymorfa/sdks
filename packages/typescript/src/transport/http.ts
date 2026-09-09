import {
  PolymorfaAuthenticationError,
  PolymorfaAuthorizationError,
  PolymorfaCancelledError,
  PolymorfaConflictError,
  PolymorfaConfigurationError,
  PolymorfaConnectionError,
  PolymorfaError,
  PolymorfaNotFoundError,
  PolymorfaRateLimitError,
  PolymorfaServerError,
  PolymorfaTimeoutError,
  PolymorfaValidationError,
  type PolymorfaErrorOptions,
} from "../errors.js";
import { SDK_VERSION } from "../version.js";
import { decodeResponseBody, encodeRequestBody } from "./body.js";
import {
  canRetryRequest,
  defaultSleep,
  isRetryableStatus,
  retryDelayMs,
} from "./retry.js";
import type {
  ApiResponse,
  RawRequest,
  ResponseMetadata,
  TransportOptions,
} from "./types.js";

export class HttpTransport {
  readonly #baseUrl: string;
  readonly #authorization: string | undefined;
  readonly #apiVersion: string | undefined;
  readonly #timeoutMs: number;
  readonly #maxNetworkRetries: number;
  readonly #fetch: typeof globalThis.fetch;
  readonly #sleep: (
    milliseconds: number,
    signal?: AbortSignal,
  ) => Promise<void>;
  readonly #random: () => number;

  constructor(options: TransportOptions) {
    this.#baseUrl = validateBaseUrl(options.baseUrl, options.authorization);
    this.#authorization = options.authorization;
    this.#apiVersion = options.apiVersion;
    this.#timeoutMs = assertNonNegativeInteger(
      options.timeoutMs,
      "timeoutMs",
      false,
    );
    this.#maxNetworkRetries = assertNonNegativeInteger(
      options.maxNetworkRetries,
      "maxNetworkRetries",
      true,
    );
    this.#fetch = options.fetch ?? globalThis.fetch;
    this.#sleep = options.sleep ?? defaultSleep;
    this.#random = options.random ?? Math.random;
  }

  async request<T>(request: RawRequest): Promise<ApiResponse<T>> {
    return this.#request(request, decodeResponseBody, "application/json");
  }

  async requestBinary(request: RawRequest): Promise<ApiResponse<ArrayBuffer>> {
    return this.#request(
      request,
      async (response) =>
        response.ok ? response.arrayBuffer() : decodeResponseBody(response),
      "application/octet-stream, */*",
    );
  }

  async #request<T>(
    request: RawRequest,
    decode: (response: Response) => Promise<unknown>,
    accept: string,
  ): Promise<ApiResponse<T>> {
    validatePath(request.path);
    const retries = assertNonNegativeInteger(
      request.maxNetworkRetries ?? this.#maxNetworkRetries,
      "maxNetworkRetries",
      true,
    );
    const eligible = canRetryRequest(request.method, request.idempotencyKey);
    let attempt = 0;

    while (true) {
      attempt += 1;
      let response: Response | undefined;
      try {
        const performed = await this.#perform(request, decode, accept);
        response = performed.response;
        const data = performed.data;
        const metadata = responseMetadata(response, attempt);
        if (response.ok) {
          return Object.freeze({ data: data as T, metadata });
        }
        if (
          eligible &&
          attempt <= retries &&
          isRetryableStatus(response.status)
        ) {
          await this.#sleep(
            retryDelayMs(response, attempt, this.#random),
            request.signal,
          );
          continue;
        }
        throw apiError(response, data, metadata);
      } catch (error) {
        if (error instanceof PolymorfaError) {
          throw error;
        }
        if (request.signal?.aborted === true) {
          throw new PolymorfaCancelledError(
            "The request was cancelled by the caller.",
            {
              code: "request_cancelled",
              cause: error,
            },
          );
        }
        if (error instanceof RequestTimeout) {
          if (eligible && attempt <= retries) {
            await this.#sleep(
              retryDelayMs(undefined, attempt, this.#random),
              request.signal,
            );
            continue;
          }
          throw new PolymorfaTimeoutError(
            `The request exceeded its ${error.timeoutMs}ms timeout.`,
            {
              code: "request_timeout",
              cause: error,
            },
          );
        }
        if (eligible && attempt <= retries) {
          await this.#sleep(
            retryDelayMs(undefined, attempt, this.#random),
            request.signal,
          );
          continue;
        }
        throw new PolymorfaConnectionError(
          "The request could not reach the Polymorfa API.",
          {
            code: "connection_error",
            cause: error,
          },
        );
      }
    }
  }

  async #perform(
    request: RawRequest,
    decode: (response: Response) => Promise<unknown>,
    accept: string,
  ): Promise<{ readonly response: Response; readonly data: unknown }> {
    const url = requestUrl(this.#baseUrl, request.path, request.query);
    const headers = new Headers(request.headers);
    if (!headers.has("accept")) headers.set("accept", accept);
    if (this.#authorization !== undefined) {
      headers.set("authorization", this.#authorization);
    }
    headers.set("user-agent", `polymorfa-node/${SDK_VERSION}`);
    const apiVersion = request.apiVersion ?? this.#apiVersion;
    if (apiVersion !== undefined) {
      headers.set("polymorfa-version", apiVersion);
    }
    if (request.idempotencyKey !== undefined) {
      headers.set("idempotency-key", request.idempotencyKey);
    }
    const encoded = encodeRequestBody(request.body);
    if (encoded.contentType !== undefined && !headers.has("content-type")) {
      headers.set("content-type", encoded.contentType);
    }

    const timeoutMs = assertNonNegativeInteger(
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
    if (request.signal?.aborted === true) {
      cancel();
    } else {
      request.signal?.addEventListener("abort", cancel, { once: true });
    }

    try {
      const response = await this.#fetch(url, {
        method: request.method,
        headers,
        redirect: this.#authorization === undefined ? "follow" : "error",
        ...(encoded.body === undefined ? {} : { body: encoded.body }),
        signal: controller.signal,
      });
      return { response, data: await decode(response) };
    } catch (error) {
      if (timedOut) {
        throw new RequestTimeout(timeoutMs, error);
      }
      throw error;
    } finally {
      clearTimeout(timer);
      request.signal?.removeEventListener("abort", cancel);
    }
  }
}

function validateBaseUrl(
  value: string,
  authorization: string | undefined,
): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new PolymorfaConfigurationError(
      "baseUrl must be an absolute HTTP or HTTPS URL.",
      "baseUrl",
    );
  }
  if (url.username !== "" || url.password !== "") {
    throw new PolymorfaConfigurationError(
      "baseUrl must not contain credentials.",
      "baseUrl",
    );
  }
  const isLoopbackHttp =
    url.protocol === "http:" &&
    (url.hostname === "localhost" ||
      url.hostname === "127.0.0.1" ||
      url.hostname === "[::1]");
  if (
    authorization !== undefined &&
    url.protocol !== "https:" &&
    !isLoopbackHttp
  ) {
    throw new PolymorfaConfigurationError(
      "Credentialed clients require HTTPS, except for loopback development servers.",
      "baseUrl",
    );
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new PolymorfaConfigurationError(
      "baseUrl must use HTTP or HTTPS.",
      "baseUrl",
    );
  }
  return value.replace(/\/+$/, "");
}

class RequestTimeout extends Error {
  constructor(
    readonly timeoutMs: number,
    cause: unknown,
  ) {
    super("Request timed out.", { cause });
  }
}

function requestUrl(
  baseUrl: string,
  path: string,
  query: RawRequest["query"],
): URL {
  const url = new URL(path, `${baseUrl}/`);
  for (const [name, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === null) continue;
    const values = Array.isArray(value) ? value : [value];
    for (const item of values) {
      url.searchParams.append(name, String(item));
    }
  }
  return url;
}

function validatePath(path: string): void {
  if (
    !path.startsWith("/") ||
    path.startsWith("//") ||
    path.includes("\\") ||
    URL.canParse(path)
  ) {
    throw new PolymorfaValidationError(
      "Raw request paths must be relative and begin with a single slash.",
      {
        code: "invalid_request_path",
      },
    );
  }
}

function responseMetadata(
  response: Response,
  attempts: number,
): ResponseMetadata {
  const headerRecord: Record<string, string> = {};
  for (const key of SAFE_RESPONSE_HEADERS) {
    const value = response.headers.get(key);
    if (value !== null) headerRecord[key] = value;
  }
  const requestId =
    response.headers.get("x-request-id") ??
    response.headers.get("request-id") ??
    undefined;
  const apiVersion = response.headers.get("polymorfa-version") ?? undefined;
  return Object.freeze({
    status: response.status,
    ...(requestId === undefined ? {} : { requestId }),
    ...(apiVersion === undefined ? {} : { apiVersion }),
    attempts,
    headers: Object.freeze(headerRecord),
  });
}

const SAFE_RESPONSE_HEADERS = [
  "content-type",
  "x-request-id",
  "polymorfa-version",
  "retry-after",
  "x-ratelimit-limit",
  "x-ratelimit-remaining",
] as const;

function apiError(
  response: Response,
  body: unknown,
  metadata: ResponseMetadata,
): PolymorfaError {
  const options: PolymorfaErrorOptions = {
    status: response.status,
    ...(metadata.requestId === undefined
      ? {}
      : { requestId: metadata.requestId }),
    details: body,
    metadata,
    ...errorCode(body),
  };
  const message = errorMessage(body, response.status);
  if (response.status === 400 || response.status === 422)
    return new PolymorfaValidationError(message, options);
  if (response.status === 401)
    return new PolymorfaAuthenticationError(message, options);
  if (response.status === 403)
    return new PolymorfaAuthorizationError(message, options);
  if (response.status === 404)
    return new PolymorfaNotFoundError(message, options);
  if (response.status === 409)
    return new PolymorfaConflictError(message, options);
  if (response.status === 429)
    return new PolymorfaRateLimitError(message, options);
  if (response.status >= 500) return new PolymorfaServerError(message, options);
  return new PolymorfaError(message, options);
}

function errorMessage(body: unknown, status: number): string {
  if (typeof body === "object" && body !== null) {
    const record = body as Record<string, unknown>;
    if (typeof record.error === "object" && record.error !== null) {
      const message = (record.error as Record<string, unknown>).message;
      if (typeof message === "string") return message;
    }
    if (typeof record.error === "string") return record.error;
    if (typeof record.message === "string") return record.message;
  }
  if (typeof body === "string" && body.length > 0) return body;
  return `Polymorfa API request failed with status ${status}.`;
}

function errorCode(body: unknown): Pick<PolymorfaErrorOptions, "code"> {
  if (typeof body === "object" && body !== null) {
    const record = body as Record<string, unknown>;
    if (typeof record.error === "object" && record.error !== null) {
      const code = (record.error as Record<string, unknown>).code;
      if (typeof code === "string") return { code };
    }
    const code = record.code;
    if (typeof code === "string") return { code };
  }
  return {};
}

function assertNonNegativeInteger(
  value: number,
  field: string,
  allowZero: boolean,
): number {
  if (!Number.isInteger(value) || value < 0 || (!allowZero && value === 0)) {
    throw new PolymorfaValidationError(
      `${field} must be ${allowZero ? "a non-negative" : "a positive"} integer.`,
      {
        code: "invalid_request_option",
      },
    );
  }
  return value;
}
