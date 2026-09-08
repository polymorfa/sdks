import {
  assertServerRuntime,
  validateClientCredential,
  type SharedClientOptions,
} from "./credentials.js";
import { PolymorfaConfigurationError } from "./errors.js";
import { HttpTransport } from "./transport/http.js";
import type { ApiResponse, RequestOptions } from "./transport/types.js";

export interface BridgeClientOptions extends SharedClientOptions {
  readonly credential: {
    readonly type: "projectToken";
    readonly value: string;
  };
}

export type BridgeRegion = "BR" | "US" | "IN" | "Auto";
export type BridgeKind = "sandbox" | "production";
export type BridgeSignal = "customer" | "bartender";

export interface BridgeRoute {
  readonly wsUrl: string;
  readonly region: BridgeRegion;
  readonly kind: BridgeKind;
  readonly signal: BridgeSignal;
  readonly tokenKind: "project";
  readonly expiresAt: number;
}

export class BridgeRoutesResource {
  constructor(private readonly transport: HttpTransport) {}

  resolve(options: RequestOptions = {}): Promise<ApiResponse<BridgeRoute>> {
    return this.transport.request({
      method: "GET",
      path: "/v1/bridge/route",
      ...options,
    });
  }
}

/** Project-token client for regional Bridge route discovery only. */
export class BridgeClient {
  readonly routes: BridgeRoutesResource;

  constructor(options: BridgeClientOptions) {
    const credential = validateClientCredential(options.credential);
    if (credential.type !== "projectToken") {
      throw new PolymorfaConfigurationError(
        "BridgeClient requires a project token.",
        "credential",
      );
    }
    assertServerRuntime();
    const transport = new HttpTransport({
      baseUrl: options.baseUrl ?? "https://api.polymorfa.com",
      authorization: `Bearer ${credential.value}`,
      timeoutMs: options.timeoutMs ?? 30_000,
      maxNetworkRetries: options.maxNetworkRetries ?? 2,
      ...(options.apiVersion === undefined
        ? {}
        : { apiVersion: options.apiVersion }),
      ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
    });
    this.routes = new BridgeRoutesResource(transport);
  }
}
