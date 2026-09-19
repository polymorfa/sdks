import {
  PolymorfaAuthenticationError,
  PolymorfaAuthorizationError,
  PolymorfaCancelledError,
  PolymorfaConflictError,
  PolymorfaPaymentRequiredError,
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
import { parseContentDispositionFilename } from "./content-disposition.js";
import {
  canRetryRequest,
  defaultSleep,
  isIdempotentReplay,
  isRetryableStatus,
  retryDelayMs,
} from "./retry.js";
import type {
  ApiResponse,
  RawRequest,
  ResponseMetadata,
  StreamRedirect,
  StreamResponse,
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

  /**
   * Returns a successful response body as an unbuffered stream.
   *
   * Retries apply only before a body is handed to the caller. `timeoutMs`
   * bounds the time until response headers arrive; the caller's `signal`
   * stays linked to the body until it is fully read or cancelled. A redirect
   * is followed manually, without Polymorfa credentials or caller headers.
   */
  async requestStream(request: RawRequest): Promise<StreamResponse> {
    const result = await this.#stream(request, false);
    if (!("body" in result)) {
      throw new PolymorfaError("Unexpected unresolved redirect.");
    }
    return result;
  }

  /**
   * Like `requestStream`, but returns a redirect target instead of following
   * it. The body of a redirect response is discarded.
   */
  async requestStreamOrRedirect(
    request: RawRequest,
  ): Promise<StreamResponse | StreamRedirect> {
    return this.#stream(request, true);
  }

  async #stream(
    request: RawRequest,
    returnRedirect: boolean,
  ): Promise<StreamResponse | StreamRedirect> {
    validatePath(request.path);
    const retries = assertNonNegativeInteger(
      request.maxNetworkRetries ?? this.#maxNetworkRetries,
      "maxNetworkRetries",
      true,
    );
    const eligible = canRetryRequest(request.method, request.idempotencyKey);
    const apiUrl = requestUrl(this.#baseUrl, request.path, request.query);
    let attempt = 0;

    while (true) {
      attempt += 1;
      let opened: OpenedResponse | undefined;
      try {
        opened = await this.#open(request, apiUrl, {
          headers: this.#headers(request, "application/octet-stream, */*"),
          redirect: "manual",
        });
        let response = opened.response;
        const metadata = responseMetadata(response, attempt);
        if (response.type === "opaqueredirect" || response.status === 0) {
          await opened.discard();
          throw new PolymorfaConfigurationError(
            "This runtime does not expose manual redirect responses.",
            "fetch",
          );
        }
        if (REDIRECT_STATUSES.has(response.status)) {
          let location: string;
          try {
            location = redirectLocation(response, apiUrl, metadata);
          } finally {
            // Cancel the redirect body whether or not its location is valid.
            await opened.discard();
          }
          if (returnRedirect) {
            return Object.freeze({ location, metadata });
          }
          opened = await this.#open(request, new URL(location), {
            headers: new Headers({
              accept: "application/octet-stream, */*",
              "user-agent": `polymorfa-node/${SDK_VERSION}`,
            }),
            redirect: "follow",
            credentials: "omit",
            referrerPolicy: "no-referrer",
          });
          response = opened.response;
          if (!response.ok) {
            await opened.discard();
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
            throw new PolymorfaError(
              `Media storage returned status ${response.status}.`,
              {
                status: response.status,
                code: "media_storage_error",
                ...(metadata.requestId === undefined
                  ? {}
                  : { requestId: metadata.requestId }),
                metadata,
              },
            );
          }
          return streamResult(opened, apiUrl, metadata, true);
        }
        if (response.ok) {
          return streamResult(opened, apiUrl, metadata, false);
        }
        const data = await opened.readError();
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
        opened?.release();
        if (error instanceof PolymorfaError) {
          throw error;
        }
        if (request.signal?.aborted === true) {
          throw cancelledError(error);
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
            { code: "request_timeout", cause: error },
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
          { code: "connection_error", cause: error },
        );
      }
    }
  }

  #headers(request: RawRequest, accept: string): Headers {
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
    return headers;
  }

  async #open(
    request: RawRequest,
    url: URL,
    init: Pick<
      RequestInit,
      "headers" | "redirect" | "credentials" | "referrerPolicy"
    >,
  ): Promise<OpenedResponse> {
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
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      clearTimeout(timer);
      request.signal?.removeEventListener("abort", cancel);
    };
    if (request.signal?.aborted === true) {
      cancel();
    } else {
      request.signal?.addEventListener("abort", cancel, { once: true });
    }
    const guard = async <T>(operation: () => Promise<T>): Promise<T> => {
      try {
        return await operation();
      } catch (error) {
        if (timedOut) throw new RequestTimeout(timeoutMs, error);
        throw error;
      }
    };
    let response: Response;
    try {
      response = await guard(() =>
        this.#fetch(url, {
          method: request.method,
          ...init,
          signal: controller.signal,
        }),
      );
    } catch (error) {
      release();
      throw error;
    }
    return {
      response,
      signal: request.signal,
      release,
      startBody: () => clearTimeout(timer),
      discard: async () => {
        try {
          await response.body?.cancel();
        } catch {
          // The body is discarded; a cancellation failure changes nothing.
        } finally {
          release();
        }
      },
      readError: async () => {
        try {
          return await guard(() => decodeResponseBody(response));
        } finally {
          release();
        }
      },
    };
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
          isRetryableStatus(response.status) &&
          !isIdempotentReplay(response)
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

interface OpenedResponse {
  readonly response: Response;
  readonly signal: AbortSignal | undefined;
  release(): void;
  startBody(): void;
  discard(): Promise<void>;
  readError(): Promise<unknown>;
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

function cancelledError(cause: unknown): PolymorfaCancelledError {
  return new PolymorfaCancelledError(
    "The request was cancelled by the caller.",
    { code: "request_cancelled", cause },
  );
}

function isLoopbackHost(hostname: string): boolean {
  return (
    hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]"
  );
}

function redirectLocation(
  response: Response,
  apiUrl: URL,
  metadata: ResponseMetadata,
): string {
  const header = response.headers.get("location");
  let target: URL | undefined;
  try {
    target = header === null ? undefined : new URL(header, apiUrl);
  } catch {
    target = undefined;
  }
  if (
    target === undefined ||
    target.username !== "" ||
    target.password !== "" ||
    !(
      target.protocol === "https:" ||
      (target.protocol === "http:" && isLoopbackHost(target.hostname))
    )
  ) {
    throw new PolymorfaError(
      "The API returned a redirect without a valid HTTPS location.",
      {
        status: response.status,
        code: "invalid_redirect",
        ...(metadata.requestId === undefined
          ? {}
          : { requestId: metadata.requestId }),
        metadata,
      },
    );
  }
  return target.toString();
}

function streamResult(
  opened: OpenedResponse,
  apiUrl: URL,
  metadata: ResponseMetadata,
  redirected: boolean,
): StreamResponse {
  const { response } = opened;
  opened.startBody();
  const contentType = response.headers.get("content-type") ?? undefined;
  const lengthHeader = response.headers.get("content-length")?.trim();
  const contentLength =
    lengthHeader !== undefined && /^[0-9]{1,15}$/.test(lengthHeader)
      ? Number(lengthHeader)
      : undefined;
  const filename = parseContentDispositionFilename(
    response.headers.get("content-disposition"),
  );
  return Object.freeze({
    body: guardedBody(response.body, opened),
    ...(contentType === undefined ? {} : { contentType }),
    ...(contentLength === undefined ? {} : { contentLength }),
    ...(filename === undefined ? {} : { filename }),
    url: apiUrl.toString(),
    redirected,
    metadata,
  });
}

function guardedBody(
  body: ReadableStream<Uint8Array> | null,
  opened: OpenedResponse,
): ReadableStream<Uint8Array> {
  if (body === null) {
    opened.release();
    return new ReadableStream<Uint8Array>({
      start(controller) {
        controller.close();
      },
    });
  }
  const reader = body.getReader();
  return new ReadableStream<Uint8Array>(
    {
      async pull(controller) {
        try {
          const { done, value } = await reader.read();
          if (done) {
            opened.release();
            controller.close();
            return;
          }
          controller.enqueue(value);
        } catch (error) {
          const aborted = opened.signal?.aborted === true;
          opened.release();
          controller.error(
            aborted
              ? cancelledError(error)
              : new PolymorfaConnectionError(
                  "The media response body could not be read.",
                  { code: "connection_error", cause: error },
                ),
          );
        }
      },
      async cancel(reason) {
        opened.release();
        await reader.cancel(reason);
      },
    },
    { highWaterMark: 0 },
  );
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
  "polymorfa-ratelimit-reason",
] as const;

function apiError(
  response: Response,
  body: unknown,
  metadata: ResponseMetadata,
): PolymorfaError {
  const fields = errorFields(body);
  const requestId = fields.requestId ?? metadata.requestId;
  const rateLimitReason =
    response.headers.get("polymorfa-ratelimit-reason") ?? undefined;
  const options: PolymorfaErrorOptions = {
    status: response.status,
    ...(requestId === undefined ? {} : { requestId }),
    ...(fields.requestLogUrl === undefined
      ? {}
      : { requestLogUrl: fields.requestLogUrl }),
    ...(fields.docUrl === undefined ? {} : { docUrl: fields.docUrl }),
    ...(rateLimitReason === undefined ? {} : { rateLimitReason }),
    details: body,
    metadata,
    ...(fields.code === undefined ? {} : { code: fields.code }),
  };
  const message = errorMessage(body, response.status);
  if (
    response.status === 400 ||
    response.status === 413 ||
    response.status === 422
  )
    return new PolymorfaValidationError(message, options);
  if (response.status === 401)
    return new PolymorfaAuthenticationError(message, options);
  if (response.status === 403)
    return new PolymorfaAuthorizationError(message, options);
  if (response.status === 402)
    return new PolymorfaPaymentRequiredError(message, options);
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

interface ErrorFields {
  readonly code?: string;
  readonly requestId?: string;
  readonly requestLogUrl?: string;
  readonly docUrl?: string;
}

/**
 * Reads the documented error object, `{ error: { code, request_id,
 * request_log_url }, docs }`, and the older `{ error, code }` shape.
 */
function errorFields(body: unknown): ErrorFields {
  if (typeof body !== "object" || body === null) return {};
  const record = body as Record<string, unknown>;
  const error =
    typeof record.error === "object" && record.error !== null
      ? (record.error as Record<string, unknown>)
      : undefined;
  const text = (value: unknown) =>
    typeof value === "string" && value.length > 0 ? value : undefined;
  const code = text(error ? error.code : record.code);
  const requestId = text(error?.request_id);
  const requestLogUrl = text(error?.request_log_url);
  const docUrl = text(record.docs);
  return {
    ...(code === undefined ? {} : { code }),
    ...(requestId === undefined ? {} : { requestId }),
    ...(requestLogUrl === undefined ? {} : { requestLogUrl }),
    ...(docUrl === undefined ? {} : { docUrl }),
  };
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
