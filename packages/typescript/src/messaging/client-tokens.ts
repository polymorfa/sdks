import { HttpTransport } from "../transport/http.js";
import type { ApiResponse, RequestOptions } from "../transport/types.js";
import type {
  GetClientRulesResponse,
  MintClientTokenRequest,
  MintClientTokenResponse,
  SetClientRulesRequest,
  SuccessResponse,
} from "./types.js";

export class ClientTokensResource {
  constructor(private readonly transport: HttpTransport) {}

  mint(
    body: MintClientTokenRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<MintClientTokenResponse>> {
    return this.transport.request({
      method: "POST",
      path: "/api/client-tokens",
      body,
      ...options,
    });
  }

  retrieveRules(
    session: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<GetClientRulesResponse>> {
    return this.transport.request({
      method: "GET",
      path: rulesPath(session),
      ...options,
    });
  }

  updateRules(
    session: string,
    body: SetClientRulesRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<SuccessResponse>> {
    return this.transport.request({
      method: "PUT",
      path: rulesPath(session),
      body,
      ...options,
    });
  }

  deleteRules(
    session: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<SuccessResponse>> {
    return this.transport.request({
      method: "DELETE",
      path: rulesPath(session),
      ...options,
    });
  }
}

function rulesPath(session: string): string {
  return `/api/sessions/${encodeURIComponent(session)}/client-rules`;
}
