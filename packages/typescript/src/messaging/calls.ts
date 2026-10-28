import { HttpTransport } from "../transport/http.js";
import type { ApiResponse, RequestOptions } from "../transport/types.js";
import type {
  ListSessionCallsParams,
  ListSessionCallsResponse,
  RejectCallRequest,
  RejectCallResponse,
} from "./types.js";

export class CallsResource {
  constructor(private readonly transport: HttpTransport) {}

  /**
   * Lists one page of a number's calls, newest first, with the other party's
   * identity. Records are served from the number's data region. Client tokens
   * need the `read_calls` action.
   */
  list(
    session: string,
    params: ListSessionCallsParams = {},
    options: RequestOptions = {},
  ): Promise<ApiResponse<ListSessionCallsResponse>> {
    return this.transport.request({
      method: "GET",
      path: `/messaging/${encodeURIComponent(session)}/calls`,
      query: { ...params },
      ...options,
    });
  }

  reject(
    session: string,
    callId: string,
    body: RejectCallRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<RejectCallResponse>> {
    return this.transport.request({
      method: "POST",
      path: `/messaging/${encodeURIComponent(session)}/calls/${encodeURIComponent(callId)}/reject`,
      body,
      ...options,
    });
  }
}
