import { HttpTransport } from "../transport/http.js";
import type { ApiResponse, RequestOptions } from "../transport/types.js";
import type {
  ListConnectionCallsParams,
  ListConnectionCallsResponse,
  RejectCallRequest,
  RejectCallResponse,
} from "./types.js";

export class CallsResource {
  constructor(private readonly transport: HttpTransport) {}

  /**
   * Lists one page of a Connection's calls, newest first, with the other party's
   * identity. Records are served from the Connection's data region. Client tokens
   * need the `read_calls` action.
   */
  list(
    connection: string,
    params: ListConnectionCallsParams = {},
    options: RequestOptions = {},
  ): Promise<ApiResponse<ListConnectionCallsResponse>> {
    return this.transport.request({
      method: "GET",
      path: `/messaging/${encodeURIComponent(connection)}/calls`,
      query: { ...params },
      ...options,
    });
  }

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
