import type { MessagingCredential } from "../credentials.js";
import { PolymorfaConfigurationError } from "../errors.js";
import { HttpTransport } from "../transport/http.js";
import type { ApiResponse, RequestOptions } from "../transport/types.js";
import type {
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
  constructor(
    private readonly transport: HttpTransport,
    private readonly credentialType: MessagingCredential["type"],
  ) {}

  list(
    options: RequestOptions = {},
  ): Promise<ApiResponse<DataEnvelope<readonly PlatformSession[]>>> {
    this.assertServerCredential();
    return this.transport.request({
      method: "GET",
      path: "/platform/sessions",
      ...options,
    });
  }

  retrieve(
    session: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<GetSessionResponse>> {
    this.assertServerCredential();
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
    this.assertServerCredential();
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
    this.assertServerCredential();
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
    this.assertServerCredential();
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
    this.assertServerCredential();
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
    this.assertServerCredential();
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
    this.assertServerCredential();
    return this.transport.request({
      method: "POST",
      path: `${sessionPath(session)}/${action}`,
      ...options,
    });
  }
  private assertServerCredential(): void {
    if (this.credentialType === "clientToken") {
      throw new PolymorfaConfigurationError(
        "Platform session administration requires a server API key.",
        "credential",
      );
    }
  }
}

function sessionPath(session: string): string {
  return `/platform/sessions/${encodeURIComponent(session)}`;
}
