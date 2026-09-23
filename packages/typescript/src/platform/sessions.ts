import { HttpTransport } from "../transport/http.js";
import { PolymorfaValidationError } from "../errors.js";
import type {
  GetSessionResponse,
  UpdateSessionRequest,
  UpdateSessionResponse,
} from "../messaging/types.js";
import type { ApiResponse, RequestOptions } from "../transport/types.js";
import type {
  DataEnvelope,
  ListPlatformSessionsParams,
  NumberTierChange,
  NumberTierQuoteRequest,
  PlatformSession,
  SessionBatchRemoveResult,
  SessionBatchRequest,
  SessionBatchStopResult,
  SessionProjectContext,
  SessionRemoveResult,
  SessionStartResult,
  SessionStopResult,
  SessionTierOverrideRequest,
  SessionSafeMode,
  UpdateSessionSafeModeRequest,
} from "./types.js";

export class PlatformSessionsResource {
  constructor(private readonly transport: HttpTransport) {}

  list(
    params: ListPlatformSessionsParams = {},
    options: RequestOptions = {},
  ): Promise<ApiResponse<DataEnvelope<readonly PlatformSession[]>>> {
    return this.transport.request({
      method: "GET",
      path: "/platform/sessions",
      ...(params.projectId === undefined
        ? {}
        : { query: { projectId: params.projectId } }),
      ...options,
    });
  }

  retrieve(
    sessionId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<GetSessionResponse>> {
    return this.transport.request({
      method: "GET",
      path: sessionPath(sessionId),
      ...options,
    });
  }

  update(
    sessionId: string,
    body: UpdateSessionRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<UpdateSessionResponse>> {
    return this.transport.request({
      method: "PUT",
      path: sessionPath(sessionId),
      body,
      ...options,
    });
  }

  start(
    sessionId: string,
    body: SessionProjectContext = {},
    options: RequestOptions = {},
  ): Promise<ApiResponse<DataEnvelope<SessionStartResult>>> {
    return this.transport.request({
      method: "POST",
      path: `${sessionPath(sessionId)}/start`,
      body,
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
      path: "/platform/sessions/stop",
      body,
      ...options,
    });
  }

  /** Removes a testing Number. Production Numbers return HTTP 409. */
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

  /**
   * Removes matching testing Numbers. If any matched Number is production,
   * the API returns HTTP 409 before removing any Number in the batch.
   */
  deleteMany(
    body: SessionBatchRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<DataEnvelope<SessionBatchRemoveResult>>> {
    return this.transport.request({
      method: "POST",
      path: "/platform/sessions/delete",
      body,
      ...options,
    });
  }

  /** Review the returned charge and effective time before confirming this quote. */
  quoteTierChange(
    sessionId: string,
    body: NumberTierQuoteRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<DataEnvelope<NumberTierChange>>> {
    return this.transport.request({
      method: "POST",
      path: `${sessionPath(sessionId)}/tier-quotes`,
      body,
      ...options,
    });
  }

  retrieveTierChange(
    sessionId: string,
    quoteId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<DataEnvelope<NumberTierChange>>> {
    return this.transport.request({
      method: "GET",
      path: `${sessionPath(sessionId)}/tier-quotes/${encodeURIComponent(quoteId)}`,
      ...options,
    });
  }

  /** Confirms a reviewed quote. Poll retrieveTierChange until applied or rejected. */
  setTierOverride(
    sessionId: string,
    body: SessionTierOverrideRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<DataEnvelope<NumberTierChange>>> {
    if (typeof body?.quoteId !== "string" || !body.quoteId.trim()) {
      throw new PolymorfaValidationError(
        "Review a tier quote and supply its quoteId before confirming a number tier change.",
      );
    }
    return this.transport.request({
      method: "PATCH",
      path: sessionPath(sessionId),
      body,
      ...options,
    });
  }

  getSafeMode(
    sessionId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<DataEnvelope<SessionSafeMode>>> {
    return this.transport.request({
      method: "GET",
      path: `${sessionPath(sessionId)}/safe-mode`,
      ...options,
    });
  }

  updateSafeMode(
    sessionId: string,
    body: UpdateSessionSafeModeRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<DataEnvelope<SessionSafeMode>>> {
    return this.transport.request({
      method: "PUT",
      path: `${sessionPath(sessionId)}/safe-mode`,
      body,
      ...options,
    });
  }
}

function sessionPath(sessionId: string): string {
  return `/platform/sessions/${encodeURIComponent(sessionId)}`;
}
