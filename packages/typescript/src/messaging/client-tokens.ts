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
    assertMintTarget(body);
    return this.transport.request({
      method: "POST",
      path: "/platform/client-tokens",
      body,
      ...options,
    });
  }

  retrieveRules(
    connection: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<GetClientRulesResponse>> {
    this.assertServerCredential();
    return this.transport.request({
      method: "GET",
      path: rulesPath(connection),
      ...options,
    });
  }

  updateRules(
    connection: string,
    body: SetClientRulesRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<SuccessResponse>> {
    this.assertServerCredential();
    return this.transport.request({
      method: "PUT",
      path: rulesPath(connection),
      body,
      ...options,
    });
  }

  deleteRules(
    connection: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<SuccessResponse>> {
    this.assertServerCredential();
    return this.transport.request({
      method: "DELETE",
      path: rulesPath(connection),
      ...options,
    });
  }
  private assertServerCredential(): void {
    if (this.credentialType === "clientToken") {
      throw new PolymorfaConfigurationError(
        "Platform connection administration requires a server API key.",
        "credential",
      );
    }
  }
}

function assertMintTarget(body: MintClientTokenRequest): void {
  const hasConnection =
    typeof body.connection === "string" && body.connection.length > 0;
  const hasCustomer =
    typeof body.customer === "string" && body.customer.length > 0;
  if (hasConnection === hasCustomer) {
    throw new PolymorfaConfigurationError(
      "Provide exactly one of connection or customer to mint a client token.",
      hasConnection ? "customer" : "connection",
    );
  }
}

function rulesPath(connection: string): string {
  return `/platform/connections/${encodeURIComponent(connection)}/client-rules`;
}
