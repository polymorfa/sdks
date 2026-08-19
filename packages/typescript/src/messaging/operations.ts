import { HttpTransport } from "../transport/http.js";
import type { ApiResponse, RequestOptions } from "../transport/types.js";
import type { GetOperationResponse } from "./types.js";

export class OperationsResource {
  constructor(private readonly transport: HttpTransport) {}

  retrieve(
    operationId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<GetOperationResponse>> {
    return this.transport.request({
      method: "GET",
      path: `/api/operations/${encodeURIComponent(operationId)}`,
      ...options,
    });
  }
}
