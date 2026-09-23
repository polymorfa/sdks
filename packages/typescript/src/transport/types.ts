import type { MessageRoutingMetadata } from "../messaging/types.js";
export type HttpMethod =
  "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";

export type QueryPrimitive = string | number | boolean;
export type QueryValue =
  QueryPrimitive | readonly QueryPrimitive[] | null | undefined;

export interface RequestOptions {
  readonly apiVersion?: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly idempotencyKey?: string;
  readonly maxNetworkRetries?: number;
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
}

export interface RawRequest extends RequestOptions {
  readonly method: HttpMethod;
  readonly path: string;
  readonly query?: Readonly<Record<string, QueryValue>>;
  readonly body?: unknown;
}

export interface ResponseMetadata extends MessageRoutingMetadata {
  readonly status: number;
  readonly requestId?: string;
  readonly apiVersion?: string;
  readonly attempts: number;
  readonly headers: Readonly<Record<string, string>>;
}

export interface ApiResponse<T> {
  readonly data: T;
  readonly metadata: ResponseMetadata;
}

export interface StreamResponse {
  /** The unbuffered response body. Read it once, or cancel it. */
  readonly body: ReadableStream<Uint8Array>;
  readonly contentType?: string;
  readonly contentLength?: number;
  /** Decoded from `Content-Disposition`, preferring RFC 6266 `filename*`. */
  readonly filename?: string;
  /** The Polymorfa API URL that was requested. Never a signed storage URL. */
  readonly url: string;
  /** True when the body came from the API's redirect target. */
  readonly redirected: boolean;
  /** Metadata of the Polymorfa API response. */
  readonly metadata: ResponseMetadata;
}

export interface StreamRedirect {
  /** Absolute redirect target. Treat it as a short-lived bearer secret. */
  readonly location: string;
  readonly metadata: ResponseMetadata;
}

export interface TransportOptions {
  readonly baseUrl: string;
  readonly authorization?: string;
  readonly apiVersion?: string;
  readonly timeoutMs: number;
  readonly maxNetworkRetries: number;
  readonly fetch?: typeof globalThis.fetch;
  readonly sleep?: (
    milliseconds: number,
    signal?: AbortSignal,
  ) => Promise<void>;
  readonly random?: () => number;
}
