import { HttpTransport } from "../transport/http.js";
import type { ApiResponse, RequestOptions } from "../transport/types.js";
import type {
  CreateSessionRequest,
  CreateSessionResponse,
  GetSessionAccountResponse,
  GetSessionResponse,
  ListSessionsResponse,
  OperationAccepted,
  UpdateSessionRequest,
  UpdateSessionResponse,
} from "./types.js";

export class SessionsResource {
  constructor(private readonly transport: HttpTransport) {}

  list(options: RequestOptions = {}): Promise<ApiResponse<ListSessionsResponse>> {
    return this.transport.request({ method: "GET", path: "/api/sessions", ...options });
  }

  create(body: CreateSessionRequest, options: RequestOptions = {}): Promise<ApiResponse<CreateSessionResponse>> {
    return this.transport.request({ method: "POST", path: "/api/sessions", body, ...options });
  }

  retrieve(session: string, options: RequestOptions = {}): Promise<ApiResponse<GetSessionResponse>> {
    return this.transport.request({ method: "GET", path: sessionPath(session), ...options });
  }

  update(
    session: string,
    body: UpdateSessionRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<UpdateSessionResponse>> {
    return this.transport.request({ method: "PUT", path: sessionPath(session), body, ...options });
  }

  delete(session: string, options: RequestOptions = {}): Promise<ApiResponse<OperationAccepted>> {
    return this.transport.request({ method: "DELETE", path: sessionPath(session), ...options });
  }

  start(session: string, options: RequestOptions = {}): Promise<ApiResponse<OperationAccepted>> {
    return this.action(session, "start", options);
  }

  stop(session: string, options: RequestOptions = {}): Promise<ApiResponse<OperationAccepted>> {
    return this.action(session, "stop", options);
  }

  restart(session: string, options: RequestOptions = {}): Promise<ApiResponse<OperationAccepted>> {
    return this.action(session, "restart", options);
  }

  logout(session: string, options: RequestOptions = {}): Promise<ApiResponse<OperationAccepted>> {
    return this.action(session, "logout", options);
  }

  account(session: string, options: RequestOptions = {}): Promise<ApiResponse<GetSessionAccountResponse>> {
    return this.transport.request({ method: "GET", path: `${sessionPath(session)}/me`, ...options });
  }

  private action(
    session: string,
    action: "start" | "stop" | "restart" | "logout",
    options: RequestOptions,
  ): Promise<ApiResponse<OperationAccepted>> {
    return this.transport.request({ method: "POST", path: `${sessionPath(session)}/${action}`, ...options });
  }
}

function sessionPath(session: string): string {
  return `/api/sessions/${encodeURIComponent(session)}`;
}
