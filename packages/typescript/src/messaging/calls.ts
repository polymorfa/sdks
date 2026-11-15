import { HttpTransport } from "../transport/http.js";
import type { ApiResponse, RequestOptions } from "../transport/types.js";
import type { RejectCallRequest, RejectCallResponse } from "./types.js";

export class CallsResource {
  constructor(private readonly transport: HttpTransport) {}

  reject(
    connection: string,
    callId: string,
    body: RejectCallRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<RejectCallResponse>> {
    return this.transport.request({
      method: "POST",
      path: `/messaging/${encodeURIComponent(connection)}/calls/${encodeURIComponent(callId)}/reject`,
      body,
      ...options,
    });
  }
}
