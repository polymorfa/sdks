import { PolymorfaValidationError } from "../errors.js";
import { HttpTransport } from "../transport/http.js";
import type { ApiResponse, RequestOptions } from "../transport/types.js";
import type { DataEnvelope } from "./types.js";

export interface FlowSummary {
  readonly id: string;
  readonly name: string;
  readonly status: "draft" | "ready" | "archived";
  readonly version: string;
  readonly screenCount: number;
  readonly metaLinks: readonly Readonly<Record<string, unknown>>[];
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface FlowDraft extends FlowSummary {
  readonly definition: Readonly<Record<string, unknown>>;
}

/** Reads project-owned Flow drafts; this does not publish a Flow to Meta. */
export class FlowsResource {
  constructor(
    private readonly transport: HttpTransport,
    private readonly projectId: string,
  ) {}

  list(
    options: RequestOptions = {},
  ): Promise<ApiResponse<DataEnvelope<readonly FlowSummary[]>>> {
    return this.transport.request({
      method: "GET",
      path: "/platform/flows",
      query: { projectId: this.projectId },
      ...options,
    });
  }

  retrieve(
    flowId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<DataEnvelope<FlowDraft | null>>> {
    if (
      typeof flowId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        flowId,
      )
    ) {
      throw new PolymorfaValidationError("flowId must be a valid UUID.");
    }
    return this.transport.request({
      method: "GET",
      path: `/platform/flows/${encodeURIComponent(flowId)}`,
      query: { projectId: this.projectId },
      ...options,
    });
  }
}
