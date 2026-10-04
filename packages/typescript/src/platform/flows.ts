import {
  PolymorfaConfigurationError,
  PolymorfaValidationError,
} from "../errors.js";
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
  /** Number session UUID, when the API reports it. */
  readonly sessionId?: string;
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

/** How WhatsApp reaches a dynamic Flow's data endpoint on one Number. */
export type FlowEndpointMode = "forward" | "function" | "direct";
export interface FlowEndpoint {
  readonly id: string;
  readonly orgId: string;
  readonly projectId: string;
  readonly flowId: string;
  readonly sessionId: string;
  readonly mode: FlowEndpointMode;
  readonly url: string | null;
  readonly functionId: string | null;
  /** Pinned Function deployment; null follows the Function's active deployment. */
  readonly deploymentId: string | null;
  readonly enabled: boolean;
  readonly revision: number;
  /** The URL WhatsApp calls. It is attached to the Flow when the Flow is uploaded. */
  readonly endpointUri: string;
  readonly createdAt: number;
  readonly updatedAt: number;
}
export type ManagedFlowEncryptionKeyState =
  "pending" | "uncertain" | "active" | "retiring" | "retired" | "failed";
/** A Polymorfa-managed Flow encryption key. Private keys are never returned. */
export interface ManagedFlowEncryptionKey {
  readonly id: string;
  readonly state: ManagedFlowEncryptionKeyState;
  /** SHA-256 of the DER public key. */
  readonly fingerprint: string;
  /** PEM public key. */
  readonly publicKey: string;
  readonly errorCode: string | null;
  readonly createdAt: number;
  readonly activatedAt: number | null;
  readonly retireAfter: number | null;
}
export interface FlowEncryptionCustody {
  /** `managed`: Polymorfa holds the Number's active key. `customer`: it does not. */
  readonly custody: "managed" | "customer";
  readonly activeKeyId: string | null;
  readonly keys: readonly ManagedFlowEncryptionKey[];
}
export interface FlowEncryptionKeyRotation extends FlowEncryptionCustody {
  readonly key: ManagedFlowEncryptionKey;
}
export interface FlowEndpointState {
  readonly endpoint: FlowEndpoint | null;
  readonly encryption: FlowEncryptionCustody;
}
export interface FlowEndpointSetResult {
  readonly endpoint: FlowEndpoint;
  /** Returned once, when a forward endpoint is created, switched to or rotated. Store it securely. */
  readonly signingSecret?: string;
  readonly encryption: FlowEncryptionCustody;
}
interface FlowEndpointCommon {
  /** Number (session) name or id in the Flow's project. */
  readonly sessionId: string;
  readonly enabled?: boolean;
  /** Replace only when the stored revision matches. */
  readonly expectedRevision?: number;
}
/** Polymorfa decrypts and forwards the request JSON to your HTTPS URL, signed. */
export interface ForwardFlowEndpointRequest extends FlowEndpointCommon {
  readonly mode: "forward";
  readonly url: string;
  /** Issue a new signing secret; the response returns it once. */
  readonly rotateSigningSecret?: boolean;
}
/** Polymorfa decrypts and runs a deployed Function with the request JSON as its body. */
export interface FunctionFlowEndpointRequest extends FlowEndpointCommon {
  readonly mode: "function";
  readonly functionId: string;
  readonly deploymentId?: string | null;
}
/** WhatsApp calls your URL directly with your own key; Polymorfa never decrypts. */
export interface DirectFlowEndpointRequest extends FlowEndpointCommon {
  readonly mode: "direct";
  readonly url: string;
}
export type SetFlowEndpointRequest =
  | ForwardFlowEndpointRequest
  | FunctionFlowEndpointRequest
  | DirectFlowEndpointRequest;
export interface FlowNumberRequest {
  /** Number (session) name or id in the Flow's project. */
  readonly sessionId: string;
}
export interface ListFlowEndpointReceiptsRequest {
  readonly sessionId?: string;
  /** 1 to 100; defaults to 50. */
  readonly limit?: number;
}
/** Metadata-only record of one data exchange. No form data, Flow token or response is stored. */
export interface FlowEndpointReceipt {
  readonly id: string;
  readonly flowId: string;
  readonly endpointId: string;
  readonly sessionId: string;
  readonly mode: "forward" | "function";
  readonly action:
    "ping" | "INIT" | "data_exchange" | "BACK" | "error_notification" | null;
  readonly outcome:
    "running" | "succeeded" | "rejected" | "failed" | "timeout" | "unavailable";
  /** Status returned to WhatsApp, such as 200, 421, 427, 503 or 504. */
  readonly httpStatus: number | null;
  readonly errorCode: string | null;
  readonly keyId: string | null;
  readonly functionInvocationId: string | null;
  readonly durationMs: number | null;
  readonly createdAt: number;
  readonly completedAt: number | null;
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
    if (
      typeof flowId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        flowId,
      )
    ) {
      throw new PolymorfaValidationError("flowId must be a valid UUID.");
    }
    return this.request("GET", flowPath(flowId), undefined, options);
  }
  update(
    flowId: string,
    body: UpdateFlowRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<FlowDraft>> {
    if (
      typeof body?.expectedUpdatedAt !== "number" ||
      !Number.isFinite(body.expectedUpdatedAt)
    ) {
      throw new PolymorfaValidationError(
        "expectedUpdatedAt must be a finite number.",
      );
    }
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
  /** The Flow's data endpoint on one Number and the Number's encryption custody. */
  endpoint(
    flowId: string,
    params: FlowNumberRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<FlowEndpointState>> {
    return this.request("GET", `${flowPath(flowId)}/endpoint`, numberInput(params), options);
  }
  /**
   * Create or replace the Flow's data endpoint on one Number. Sent once:
   * `signingSecret` is returned only in this response.
   */
  setEndpoint(
    flowId: string,
    body: SetFlowEndpointRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<FlowEndpointSetResult>> {
    validateEndpointRequest(body);
    return this.request("PUT", `${flowPath(flowId)}/endpoint`, body, options);
  }
  deleteEndpoint(
    flowId: string,
    params: FlowNumberRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<{ readonly ok: true }>> {
    return this.request("DELETE", `${flowPath(flowId)}/endpoint`, numberInput(params), options);
  }
  endpointReceipts(
    flowId: string,
    params: ListFlowEndpointReceiptsRequest = {},
    options: RequestOptions = {},
  ): Promise<ApiResponse<readonly FlowEndpointReceipt[]>> {
    if (
      params.limit !== undefined &&
      (!Number.isInteger(params.limit) || params.limit < 1 || params.limit > 100)
    ) {
      throw new PolymorfaValidationError("limit must be an integer from 1 to 100.");
    }
    return this.request("GET", `${flowPath(flowId)}/endpoint/receipts`, params, options);
  }
  /** The Number's Flow encryption custody and recent managed keys. */
  encryptionKey(
    params: FlowNumberRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<FlowEncryptionCustody>> {
    return this.request("GET", "", numberInput(params), options, "/platform/flow-encryption-keys");
  }
  /**
   * Generate and register a new managed key for the Number. Sent once; the
   * previous managed key keeps decrypting for 24 hours.
   */
  rotateEncryptionKey(
    body: FlowNumberRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<FlowEncryptionKeyRotation>> {
    return this.request("POST", "", numberInput(body), options, "/platform/flow-encryption-keys/rotate");
  }
  private request<T>(
    method: RawRequest["method"],
    path: string,
    input: object | undefined,
    options: RequestOptions,
    base = "/platform/flows",
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
        path: `${base}${path}`,
        ...(method === "GET" || method === "DELETE"
          ? { query: value }
          : { body: value }),
        ...(method === "GET" ? {} : { maxNetworkRetries: 0 }),
      })
      .then(unwrapResponse);
  }
}
function flowPath(id: string): string {
  if (typeof id !== "string" || !id.trim())
    throw new PolymorfaConfigurationError("Flow ID is required.", "flowId");
  return `/${encodeURIComponent(id)}`;
}

function numberInput(params: FlowNumberRequest): FlowNumberRequest {
  if (typeof params?.sessionId !== "string" || !params.sessionId.trim())
    throw new PolymorfaValidationError("sessionId is required.");
  return { sessionId: params.sessionId };
}
function validateEndpointRequest(body: SetFlowEndpointRequest): void {
  if (typeof body?.sessionId !== "string" || !body.sessionId.trim())
    throw new PolymorfaValidationError("sessionId is required.");
  if (body.mode === "forward" || body.mode === "direct") {
    if (typeof body.url !== "string" || !body.url.startsWith("https://"))
      throw new PolymorfaValidationError("url must be an HTTPS URL.");
  } else if (body.mode === "function") {
    if (typeof body.functionId !== "string" || !body.functionId)
      throw new PolymorfaValidationError("functionId is required.");
  } else {
    throw new PolymorfaValidationError("mode must be forward, function or direct.");
  }
  if (
    body.expectedRevision !== undefined &&
    (!Number.isInteger(body.expectedRevision) || body.expectedRevision < 1)
  )
    throw new PolymorfaValidationError("expectedRevision must be a positive integer.");
}
