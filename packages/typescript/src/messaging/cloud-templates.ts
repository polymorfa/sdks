import { HttpTransport } from "../transport/http.js";
import type { ApiResponse, RequestOptions } from "../transport/types.js";
import type {
  SuccessEnvelope,
  SuccessResponse,
  TemplateCategory,
} from "./types.js";

export type CloudTemplateStatus =
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "PAUSED"
  | "DISABLED"
  | "DELETED"
  | "ARCHIVED"
  | "IN_APPEAL"
  | "LIMIT_EXCEEDED"
  | "PENDING_DELETION";

export interface CloudTemplate {
  readonly id: string;
  readonly tenantId: string;
  readonly session: string;
  readonly wabaId: string;
  readonly name: string;
  readonly language: string;
  readonly category: TemplateCategory;
  readonly status: CloudTemplateStatus;
  readonly components: readonly unknown[];
  readonly metaTemplateId?: string;
  readonly rejectionReason?: string;
  readonly qualityScore?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CreateCloudTemplateRequest {
  readonly name: string;
  readonly language: string;
  readonly category: TemplateCategory;
  readonly components: readonly unknown[];
}

export interface RetrieveCloudTemplateParams {
  /** Defaults to en_US at the API when omitted. */
  readonly language?: string;
}

export type CloudTemplateResponse = SuccessEnvelope<CloudTemplate>;
export type ListCloudTemplatesResponse = SuccessEnvelope<
  readonly CloudTemplate[]
>;

/** Meta templates for a Number created on an Official API connection, separate from project drafts. */
export class CloudTemplatesResource {
  constructor(private readonly transport: HttpTransport) {}

  /** Refresh the complete Meta catalog before returning the saved templates. */
  list(
    session: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<ListCloudTemplatesResponse>> {
    return this.transport.request({
      method: "GET",
      path: templatesPath(session),
      ...options,
    });
  }

  retrieve(
    session: string,
    name: string,
    params: RetrieveCloudTemplateParams = {},
    options: RequestOptions = {},
  ): Promise<ApiResponse<CloudTemplateResponse>> {
    return this.transport.request({
      method: "GET",
      path: templatePath(session, name),
      query: { language: params.language },
      ...options,
    });
  }

  /** Submit once. An Idempotency-Key does not make this provider write replayable. */
  create(
    session: string,
    body: CreateCloudTemplateRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<CloudTemplateResponse>> {
    return this.transport.request({
      method: "POST",
      path: templatesPath(session),
      body,
      ...options,
      maxNetworkRetries: 0,
    });
  }

  /** Delete every language of this name once; reconcile an uncertain outcome before retrying. */
  delete(
    session: string,
    name: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<SuccessResponse>> {
    return this.transport.request({
      method: "DELETE",
      path: templatePath(session, name),
      ...options,
      maxNetworkRetries: 0,
    });
  }
}

function templatesPath(session: string): string {
  return `/messaging/${encodeURIComponent(session)}/templates`;
}

function templatePath(session: string, name: string): string {
  return `${templatesPath(session)}/${encodeURIComponent(name)}`;
}
