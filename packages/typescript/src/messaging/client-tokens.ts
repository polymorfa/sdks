import type { MessagingCredential } from "../credentials.js";
import { PolymorfaConfigurationError } from "../errors.js";
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
  constructor(
    private readonly transport: HttpTransport,
    private readonly credentialType: MessagingCredential["type"],
  ) {}

  mint(
    body: MintClientTokenRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<MintClientTokenResponse>> {
    this.assertServerCredential();
    return this.transport.request({
      method: "POST",
      path: "/platform/client-tokens",
      body,
      ...options,
    });
  }

  retrieveRules(
    session: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<GetClientRulesResponse>> {
    this.assertServerCredential();
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
    this.assertServerCredential();
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
    this.assertServerCredential();
    return this.transport.request({
      method: "DELETE",
      path: rulesPath(session),
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

function rulesPath(session: string): string {
  return `/platform/sessions/${encodeURIComponent(session)}/client-rules`;
}
