import { HttpTransport } from "../transport/http.js";
import type { ApiResponse, RequestOptions } from "../transport/types.js";
import type { DataEnvelope, ManagementOperation } from "./types.js";

export class PlatformOperationsResource {
  constructor(private readonly transport: HttpTransport) {}

  retrieve(
    operationId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<DataEnvelope<ManagementOperation>>> {
    return this.transport.request({
      method: "GET",
      path: `/v1/operations/${encodeURIComponent(operationId)}`,
      ...options,
    });
  }
}
