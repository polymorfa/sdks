import type { SharedClientOptions } from "./credentials.js";
import { HttpTransport } from "./transport/http.js";
import type { ApiResponse, RequestOptions } from "./transport/types.js";

export type SystemClientOptions = SharedClientOptions;

export interface StatusResponse {
  readonly status: string;
  readonly uptime: string;
  readonly version: string;
  readonly env: string;
}

export interface VersionResponse {
  readonly version: string;
  readonly buildTime: string;
  readonly env: string;
  readonly apiVersion: string;
  readonly minSupportedVersion: string;
}

export interface HealthCheck {
  readonly status: string;
  readonly error?: string;
}

export interface HealthResponse {
  readonly status: string;
  readonly checks: Readonly<Record<string, HealthCheck>>;
}

export interface PingResponse {
  readonly status: string;
}

/** Credential-free API version, liveness, and readiness probes. */
export class SystemClient {
  readonly #transport: HttpTransport;

  constructor(options: SystemClientOptions = {}) {
    this.#transport = new HttpTransport({
      baseUrl: options.baseUrl ?? "https://api.polymorfa.com",
      timeoutMs: options.timeoutMs ?? 30_000,
      maxNetworkRetries: options.maxNetworkRetries ?? 2,
      ...(options.apiVersion === undefined
        ? {}
        : { apiVersion: options.apiVersion }),
      ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
    });
  }

  status(options: RequestOptions = {}): Promise<ApiResponse<StatusResponse>> {
    return this.#transport.request({
      method: "GET",
      path: "/messaging/info/status",
      ...options,
    });
  }

  version(options: RequestOptions = {}): Promise<ApiResponse<VersionResponse>> {
    return this.#transport.request({
      method: "GET",
      path: "/messaging/info/version",
      ...options,
    });
  }

  health(options: RequestOptions = {}): Promise<ApiResponse<HealthResponse>> {
    return this.#transport.request({
      method: "GET",
      path: "/health",
      ...options,
    });
  }

  ping(options: RequestOptions = {}): Promise<ApiResponse<PingResponse>> {
    return this.#transport.request({
      method: "GET",
      path: "/ping",
      ...options,
    });
  }
}
