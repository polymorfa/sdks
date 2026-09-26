import { PolymorfaConfigurationError } from "../errors.js";
import { HttpTransport } from "../transport/http.js";
import type {
  ApiResponse,
  RawRequest,
  RequestOptions,
} from "../transport/types.js";
import { type DataEnvelope, unwrapResponse } from "./response.js";

export type FlowCategory =
  | "SIGN_UP"
  | "SIGN_IN"
  | "APPOINTMENT_BOOKING"
  | "LEAD_GENERATION"
  | "CONTACT_US"
  | "CUSTOMER_SUPPORT"
  | "SURVEY"
  | "OTHER";
export type FlowDraftStatus = "draft" | "ready" | "archived";
export interface FlowValidationPointer {
  readonly path?: string;
  readonly lineStart?: number;
  readonly lineEnd?: number;
  readonly columnStart?: number;
  readonly columnEnd?: number;
}
export interface FlowValidationIssue extends Omit<
  FlowValidationPointer,
  "path"
> {
  readonly error?: string;
  readonly errorType?: string;
  readonly message?: string;
  readonly pointers?: readonly FlowValidationPointer[];
}
export interface FlowNumberLink {
  readonly session: string;
  readonly wabaId: string;
  readonly metaFlowId: string;
  readonly status: string;
  readonly categories: readonly string[];
  readonly validationErrors: readonly FlowValidationIssue[];
  readonly uploadState:
    "stale" | "creating" | "uploading" | "valid" | "invalid" | "failed";
  readonly previewUrl?: string;
  readonly previewExpiresAt?: number;
  readonly lastSyncedAt: number;
  readonly definitionDigest?: string;
  readonly simulated?: boolean;
}
export interface FlowSummary {
  readonly id: string;
  readonly name: string;
  readonly status: FlowDraftStatus;
  readonly version: string;
  readonly screenCount: number;
  readonly metaLinks: readonly FlowNumberLink[];
  readonly createdAt: number;
  readonly updatedAt: number;
}
export interface FlowDraft extends FlowSummary {
  readonly definition: Readonly<Record<string, unknown>>;
}
export interface CreateFlowRequest {
  readonly draftId?: string;
  readonly name: string;
  readonly definition: Readonly<Record<string, unknown>>;
}
export interface UpdateFlowRequest {
  readonly expectedUpdatedAt: number;
  readonly name?: string;
  readonly status?: FlowDraftStatus;
  readonly definition?: Readonly<Record<string, unknown>>;
}
export interface FlowProviderRequest {
  readonly sessionId: string;
  readonly categories?: readonly FlowCategory[];
  /** Reuse for the exact same operation; an uncertain operation is reconciled by sync. */
  readonly requestId?: string;
}
export interface FlowProviderOperation {
  readonly id: string;
  readonly requestId: string | null;
  readonly flowId: string;
  readonly flowName: string;
  readonly sessionId: string;
  readonly session: string;
  readonly action: "create" | "upload" | "publish" | "deprecate" | "delete";
  readonly state:
    "pending" | "succeeded" | "rejected" | "uncertain" | "superseded";
  readonly resolution: "response" | "reconciled" | "superseded" | null;
  readonly wabaId: string | null;
  readonly metaFlowId: string | null;
  readonly definitionDigest: string | null;
  readonly providerStatus: string | null;
  readonly errorCode: string | null;
  readonly providerCode: number | null;
  readonly providerSubcode: number | null;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly completedAt: number | null;
}
export interface FlowProviderResult {
  readonly operation: FlowProviderOperation | null;
  readonly flow: FlowDraft;
}

/** Project Flow drafts and their Number-bound provider lifecycle. */
export class FlowsResource {
  constructor(
    private readonly transport: HttpTransport,
    private readonly projectId: string,
  ) {}

  list(
    options: RequestOptions = {},
  ): Promise<ApiResponse<readonly FlowSummary[]>> {
    return this.request("GET", "", undefined, options);
  }
  create(
    body: CreateFlowRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<FlowDraft>> {
    return this.request("POST", "", body, options);
  }
  retrieve(
    flowId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<FlowDraft | null>> {
    return this.request("GET", flowPath(flowId), undefined, options);
  }
  update(
    flowId: string,
    body: UpdateFlowRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<FlowDraft>> {
    return this.request("PATCH", flowPath(flowId), body, options);
  }
  delete(
    flowId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<{ readonly ok: true }>> {
    return this.request("DELETE", flowPath(flowId), undefined, options);
  }
  upload(
    flowId: string,
    body: FlowProviderRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<FlowProviderResult>> {
    return this.request("POST", `${flowPath(flowId)}/upload`, body, options);
  }
  publish(
    flowId: string,
    body: FlowProviderRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<FlowProviderResult>> {
    return this.request("POST", `${flowPath(flowId)}/publish`, body, options);
  }
  deprecate(
    flowId: string,
    body: FlowProviderRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<FlowProviderResult>> {
    return this.request("POST", `${flowPath(flowId)}/deprecate`, body, options);
  }
  discard(
    flowId: string,
    body: FlowProviderRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<FlowProviderResult>> {
    return this.request("POST", `${flowPath(flowId)}/discard`, body, options);
  }
  /** Reconcile with a provider read. This does not repeat an uncertain mutation. */
  sync(
    flowId: string,
    body: FlowProviderRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<FlowProviderResult>> {
    return this.request("POST", `${flowPath(flowId)}/sync`, body, options);
  }
  receipts(
    flowId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<readonly FlowProviderOperation[]>> {
    return this.request(
      "GET",
      `${flowPath(flowId)}/receipts`,
      undefined,
      options,
    );
  }
  private request<T>(
    method: RawRequest["method"],
    path: string,
    input: object | undefined,
    options: RequestOptions,
  ): Promise<ApiResponse<T>> {
    if (
      input &&
      (Object.hasOwn(input, "projectId") || Object.hasOwn(input, "flowId"))
    )
      throw new PolymorfaConfigurationError(
        "Flow input cannot override its project or path identity.",
        "input",
      );
    const value = { ...input, projectId: this.projectId };
    return this.transport
      .request<DataEnvelope<T>>({
        ...options,
        method,
        path: `/platform/flows${path}`,
        ...(method === "GET" || method === "DELETE"
          ? { query: value }
          : { body: value }),
        ...(method === "GET" ? {} : { maxNetworkRetries: 0 }),
      })
      .then(unwrapResponse);
  }
}
function flowPath(id: string): string {
  if (!id.trim())
    throw new PolymorfaConfigurationError("Flow ID is required.", "flowId");
  return `/${encodeURIComponent(id)}`;
}
