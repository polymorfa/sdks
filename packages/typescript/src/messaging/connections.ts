import { campaignContractBody } from "../campaign-contract-validation.js";
import { configurationIntent } from "../connection-delivery-validation.js";
import { existingOptions } from "../campaign-existing-validation.js";
import type { MessagingCredential } from "../credentials.js";
import type {
  CloudCredentialHealth,
  CloudReauthorization,
  MetaPricingParams,
  MetaPricingSummary,
} from "./cloud-types.js";
import { PolymorfaConfigurationError } from "../errors.js";
import { HttpTransport } from "../transport/http.js";
import type { ApiResponse, RequestOptions } from "../transport/types.js";
import type {
  GetConnectionAccountResponse,
  GetConnectionResponse,
  GetQRCodeResponse,
  OperationAccepted,
  PairCodeRequest,
  RequestPairCodeResponse,
  SuccessEnvelope,
  UpdateConnectionRequest,
  UpdateConnectionResponse,
} from "./types.js";

import type {
  DataEnvelope,
  PlatformConnection,
  ConnectionStartResult,
  ConnectionStopResult,
  ConnectionRemoveResult,
} from "../platform/types.js";

export class ConnectionsResource {
  constructor(
    private readonly transport: HttpTransport,
    private readonly credentialType: MessagingCredential["type"],
  ) {}

  /** Official API beta. Requires connections:read; counts carry no price or charge. */
  getMetaPricing(
    connection: string,
    params: MetaPricingParams = {},
    options: RequestOptions = {},
  ): Promise<ApiResponse<SuccessEnvelope<MetaPricingSummary>>> {
    this.assertServerCredential();
    return this.transport.request({
      method: "GET",
      path: `/messaging/${encodeURIComponent(connection)}/meta-pricing`,
      query: { ...params },
      ...existingOptions(options),
    });
  }

  /** Latest redacted provider checks; a healthy token does not grant beta access. */
  getCloudCredentialHealth(
    connection: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<SuccessEnvelope<CloudCredentialHealth>>> {
    this.assertServerCredential();
    return this.transport.request({
      method: "GET",
      path: `/messaging/${encodeURIComponent(connection)}/cloud-credentials`,
      ...existingOptions(options),
    });
  }

  /** Create one reauthorization link for a stopped standalone Official API Number. Never stops it. */
  reauthorizeCloudCredentials(
    connection: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<SuccessEnvelope<CloudReauthorization>>> {
    this.assertServerCredential();
    return this.transport.request({
      method: "POST",
      path: `/messaging/${encodeURIComponent(connection)}/cloud-credentials/reauthorize`,
      ...existingOptions(options),
      maxNetworkRetries: 0,
    });
  }

  list(
    options: RequestOptions = {},
  ): Promise<ApiResponse<DataEnvelope<readonly PlatformConnection[]>>> {
    this.assertServerCredential();
    return this.transport.request({
      method: "GET",
      path: "/platform/connections",
      ...existingOptions(options),
    });
  }

  retrieve(
    connection: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<GetConnectionResponse>> {
    this.assertServerCredential();
    return this.transport.request({
      method: "GET",
      path: connectionPath(connection),
      ...existingOptions(options),
    });
  }

  update(
    connection: string,
    body: UpdateConnectionRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<UpdateConnectionResponse>> {
    options = existingOptions(options, configurationIntent(body));
    this.assertServerCredential();
    return this.transport.request({
      method: "PUT",
      path: connectionPath(connection),
      body: campaignContractBody(body),
      ...existingOptions(options),
    });
  }

  delete(
    connection: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<DataEnvelope<ConnectionRemoveResult>>> {
    this.assertServerCredential();
    return this.transport.request({
      method: "DELETE",
      path: connectionPath(connection),
      ...existingOptions(options),
    });
  }

  start(
    connection: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<DataEnvelope<ConnectionStartResult>>> {
    this.assertServerCredential();
    return this.transport.request({
      method: "POST",
      path: `${connectionPath(connection)}/start`,
      ...existingOptions(options),
    });
  }

  stop(
    connection: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<DataEnvelope<ConnectionStopResult>>> {
    this.assertServerCredential();
    return this.transport.request({
      method: "POST",
      path: `${connectionPath(connection)}/stop`,
      ...existingOptions(options),
    });
  }

  restart(
    connection: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<OperationAccepted>> {
    return this.action(connection, "restart", options);
  }

  logout(
    connection: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<OperationAccepted>> {
    return this.action(connection, "logout", options);
  }

  account(
    connection: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<GetConnectionAccountResponse>> {
    this.assertServerCredential();
    return this.transport.request({
      method: "GET",
      path: `${connectionPath(connection)}/me`,
      ...existingOptions(options),
    });
  }

  /** Direct pairing is entitlement-gated. Use QuickLink for the standard flow. */
  qr(
    connection: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<GetQRCodeResponse>> {
    return this.transport.request({
      method: "GET",
      path: `/messaging/${encodeURIComponent(connection)}/pair/qr`,
      query: { format: "json" },
      ...existingOptions(options),
    });
  }

  /** Direct pairing is entitlement-gated. Use QuickLink for the standard flow. */
  requestPairingCode(
    connection: string,
    body: PairCodeRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<RequestPairCodeResponse>> {
    return this.transport.request({
      method: "POST",
      path: `/messaging/${encodeURIComponent(connection)}/pair/code`,
      body,
      ...existingOptions(options),
    });
  }

  private action(
    connection: string,
    action: "restart" | "logout",
    options: RequestOptions,
  ): Promise<ApiResponse<OperationAccepted>> {
    this.assertServerCredential();
    return this.transport.request({
      method: "POST",
      path: `${connectionPath(connection)}/${action}`,
      ...existingOptions(options),
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

function connectionPath(connection: string): string {
  return `/platform/connections/${encodeURIComponent(connection)}`;
}
