import { HttpTransport } from "../transport/http.js";
import type { ApiResponse, RequestOptions } from "../transport/types.js";
import type {
  CreateTestingSessionRequest,
  DataEnvelope,
  ListPlatformSessionsParams,
  ManagedSession,
  PlatformSession,
  SessionBatchRemoveResult,
  SessionBatchRequest,
  SessionBatchStopResult,
  SessionProjectContext,
  SessionRemoveResult,
  SessionStopResult,
  SessionTierOverrideRequest,
} from "./types.js";

export class PlatformSessionsResource {
  constructor(private readonly transport: HttpTransport) {}

  list(
    params: ListPlatformSessionsParams = {},
    options: RequestOptions = {},
  ): Promise<ApiResponse<DataEnvelope<readonly PlatformSession[]>>> {
    return this.transport.request({
      method: "GET",
      path: "/v1/sessions",
      ...(params.projectId === undefined
        ? {}
        : { query: { projectId: params.projectId } }),
      ...options,
    });
  }

  stop(
    sessionId: string,
    body: SessionProjectContext = {},
    options: RequestOptions = {},
  ): Promise<ApiResponse<DataEnvelope<SessionStopResult>>> {
    return this.transport.request({
      method: "POST",
      path: `${sessionPath(sessionId)}/stop`,
      body,
      ...options,
    });
  }

  /** Requests asynchronous stops for the matching 1 through 100 sessions. */
  stopMany(
    body: SessionBatchRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<DataEnvelope<SessionBatchStopResult>>> {
    return this.transport.request({
      method: "POST",
      path: "/v1/sessions/stop",
      body,
      ...options,
    });
  }

  delete(
    sessionId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<DataEnvelope<SessionRemoveResult>>> {
    return this.transport.request({
      method: "DELETE",
      path: sessionPath(sessionId),
      ...options,
    });
  }

  /** Permanently removes the matching 1 through 100 sessions. */
  deleteMany(
    body: SessionBatchRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<DataEnvelope<SessionBatchRemoveResult>>> {
    return this.transport.request({
      method: "POST",
      path: "/v1/sessions/delete",
      body,
      ...options,
    });
  }

  setTierOverride(
    sessionId: string,
    body: SessionTierOverrideRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<DataEnvelope<ManagedSession>>> {
    return this.transport.request({
      method: "PATCH",
      path: sessionPath(sessionId),
      body,
      ...options,
    });
  }

  createTesting(
    body: CreateTestingSessionRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<DataEnvelope<string>>> {
    return this.transport.request({
      method: "POST",
      path: "/v1/sessions/testing",
      body,
      ...options,
    });
  }
}

function sessionPath(sessionId: string): string {
  return `/v1/sessions/${encodeURIComponent(sessionId)}`;
}
