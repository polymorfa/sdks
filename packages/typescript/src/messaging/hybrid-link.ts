import { PolymorfaConfigurationError } from "../errors.js";
import type { MessagingCredential } from "../credentials.js";
import { HttpTransport } from "../transport/http.js";
import type { ApiResponse, RequestOptions } from "../transport/types.js";
import type { MessageTransport, SuccessEnvelope } from "./types.js";

export type HybridConnectionKind = Exclude<MessageTransport, "auto">;
export type HybridRoutingPolicyScope =
  | { readonly scope: "team" }
  | { readonly scope: "project"; readonly projectId: string }
  | {
      readonly scope: "session";
      readonly projectId: string;
      readonly session: string;
    };
export interface HybridRoutingPolicy {
  readonly scope: "team" | "project" | "session";
  readonly revision: string;
  readonly prefer: HybridConnectionKind | null;
  readonly allowedTransports: readonly HybridConnectionKind[];
}
export interface SetHybridRoutingPolicyRequest {
  readonly expectedRevision: string;
  readonly prefer: HybridConnectionKind | null;
  readonly allowedTransports: readonly HybridConnectionKind[];
}
export interface HybridLinkState {
  readonly revision: string;
  readonly paused: boolean;
  readonly connections: readonly {
    readonly kind: HybridConnectionKind;
    readonly status: string;
    readonly enabled: boolean;
  }[];
}
export interface SetHybridLinkPausedRequest {
  readonly expectedRevision: string;
  readonly paused: boolean;
}

/** Private-preview authority is enforced by the API, including policy ancestry. */
export class HybridLinkResource {
  constructor(
    private readonly transport: HttpTransport,
    private readonly credentialType: MessagingCredential["type"],
  ) {}
  getPolicy(
    scope: HybridRoutingPolicyScope,
    options: RequestOptions = {},
  ): Promise<ApiResponse<SuccessEnvelope<HybridRoutingPolicy>>> {
    this.assertServerCredential();
    return this.transport.request({
      method: "GET",
      path: "/messaging/routing/hybrid",
      query: { ...scope },
      ...options,
    });
  }
  setPolicy(
    scope: HybridRoutingPolicyScope,
    body: SetHybridRoutingPolicyRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<SuccessEnvelope<HybridRoutingPolicy>>> {
    this.assertServerCredential();
    return this.transport.request({
      method: "PUT",
      path: "/messaging/routing/hybrid",
      query: { ...scope },
      body,
      ...options,
    });
  }
  state(
    session: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<SuccessEnvelope<HybridLinkState>>> {
    this.assertServerCredential();
    return this.transport.request({
      method: "GET",
      path: this.path(session),
      ...options,
    });
  }
  setPaused(
    session: string,
    body: SetHybridLinkPausedRequest,
    options: RequestOptions = {},
  ): Promise<
    ApiResponse<SuccessEnvelope<Pick<HybridLinkState, "revision" | "paused">>>
  > {
    this.assertServerCredential();
    return this.transport.request({
      method: "PUT",
      path: this.path(session),
      body,
      ...options,
    });
  }
  private path(session: string): string {
    return `/messaging/${encodeURIComponent(session)}/hybrid-link`;
  }
  private assertServerCredential(): void {
    if (this.credentialType === "clientToken")
      throw new PolymorfaConfigurationError(
        "Hybrid Link controls require a server credential.",
        "credential",
      );
  }
}
