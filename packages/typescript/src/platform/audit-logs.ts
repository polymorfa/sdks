import { HttpTransport } from "../transport/http.js";
import type { ApiResponse, RequestOptions } from "../transport/types.js";
import type { AuditLog, DataEnvelope, ListAuditLogsParams } from "./types.js";

export class AuditLogsResource {
  constructor(private readonly transport: HttpTransport) {}

  list(
    params: ListAuditLogsParams = {},
    options: RequestOptions = {},
  ): Promise<ApiResponse<DataEnvelope<readonly AuditLog[]>>> {
    return this.transport.request({
      method: "GET",
      path: "/platform/audit",
      query: {
        ...(params.action === undefined ? {} : { action: params.action }),
        ...(params.resource === undefined ? {} : { resource: params.resource }),
        ...(params.limit === undefined ? {} : { limit: params.limit }),
      },
      ...options,
    });
  }
}
