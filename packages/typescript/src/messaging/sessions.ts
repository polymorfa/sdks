import { HttpTransport } from "../transport/http.js";
import type { ApiResponse, RequestOptions } from "../transport/types.js";
import type {
  CreateSessionRequest,
  CreateSessionResponse,
  GetSessionAccountResponse,
  GetSessionResponse,
  GetQRCodeResponse,
  OperationAccepted,
  PairCodeRequest,
  RequestPairCodeResponse,
  UpdateSessionRequest,
  UpdateSessionResponse,
} from "./types.js";

import type {
  DataEnvelope,
  PlatformSession,
  SessionStartResult,
  SessionStopResult,
  SessionRemoveResult,
} from "../platform/types.js";

export class SessionsResource {
  constructor(private readonly transport: HttpTransport) {}

  list(
    options: RequestOptions = {},
  ): Promise<ApiResponse<DataEnvelope<readonly PlatformSession[]>>> {
    return this.transport.request({
      method: "GET",
      path: "/platform/sessions",
      ...options,
    });
  }

  create(
    body: CreateSessionRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<CreateSessionResponse>> {
    return this.transport.request({
      method: "POST",
      path: `/platform/projects/${encodeURIComponent(body.projectId)}/sessions`,
      body: (({ projectId: _projectId, ...request }) => request)(body),
      ...options,
    });
  }

  retrieve(
    session: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<GetSessionResponse>> {
    return this.transport.request({
      method: "GET",
      path: sessionPath(session),
      ...options,
    });
  }

  update(
    session: string,
    body: UpdateSessionRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<UpdateSessionResponse>> {
    return this.transport.request({
      method: "PUT",
      path: sessionPath(session),
      body,
      ...options,
    });
  }

  delete(
    session: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<DataEnvelope<SessionRemoveResult>>> {
    return this.transport.request({
      method: "DELETE",
      path: sessionPath(session),
      ...options,
    });
  }

  start(
    session: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<DataEnvelope<SessionStartResult>>> {
    return this.transport.request({
      method: "POST",
      path: `${sessionPath(session)}/start`,
      ...options,
    });
  }

  stop(
    session: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<DataEnvelope<SessionStopResult>>> {
    return this.transport.request({
      method: "POST",
      path: `${sessionPath(session)}/stop`,
      ...options,
    });
  }

  restart(
    session: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<OperationAccepted>> {
    return this.action(session, "restart", options);
  }

  logout(
    session: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<OperationAccepted>> {
    return this.action(session, "logout", options);
  }

  account(
    session: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<GetSessionAccountResponse>> {
    return this.transport.request({
      method: "GET",
      path: `${sessionPath(session)}/me`,
      ...options,
    });
  }

  /** Direct pairing is entitlement-gated. Use QuickLink for the standard flow. */
  qr(
    session: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<GetQRCodeResponse>> {
    return this.transport.request({
      method: "GET",
      path: `/messaging/${encodeURIComponent(session)}/pair/qr`,
      query: { format: "json" },
      ...options,
    });
  }

  /** Direct pairing is entitlement-gated. Use QuickLink for the standard flow. */
  requestPairingCode(
    session: string,
    body: PairCodeRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<RequestPairCodeResponse>> {
    return this.transport.request({
      method: "POST",
      path: `/messaging/${encodeURIComponent(session)}/pair/code`,
      body,
      ...options,
    });
  }

  private action(
    session: string,
    action: "restart" | "logout",
    options: RequestOptions,
  ): Promise<ApiResponse<OperationAccepted>> {
    return this.transport.request({
      method: "POST",
      path: `${sessionPath(session)}/${action}`,
      ...options,
    });
  }
}

function sessionPath(session: string): string {
  return `/platform/sessions/${encodeURIComponent(session)}`;
}
