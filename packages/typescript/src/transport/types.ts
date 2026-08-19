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

export interface ResponseMetadata {
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

export interface TransportOptions {
  readonly baseUrl: string;
  readonly authorization: string;
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
