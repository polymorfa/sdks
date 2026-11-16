import { campaignContractBody } from "../campaign-contract-validation.js";
import { configurationIntent } from "../connection-delivery-validation.js";
import { existingOptions } from "../campaign-existing-validation.js";
import { HttpTransport } from "../transport/http.js";
import { PolymorfaValidationError } from "../errors.js";
import type {
  GetConnectionResponse,
  UpdateConnectionRequest,
  UpdateConnectionResponse,
} from "../messaging/types.js";
import type { ApiResponse, RequestOptions } from "../transport/types.js";
import type {
  DataEnvelope,
  ListPlatformConnectionsParams,
  ConnectionTierChange,
  ConnectionTierQuoteRequest,
  PlatformConnection,
  ConnectionBatchRemoveResult,
  ConnectionBatchRequest,
  ConnectionBatchStopResult,
  ConnectionCapabilities,
  ConnectionProjectContext,
  ConnectionRemoveResult,
  ConnectionStartResult,
  ConnectionStopResult,
  ConnectionTierOverrideRequest,
  ConnectionSafeMode,
  UpdateConnectionSafeModeRequest,
} from "./types.js";

export class PlatformConnectionsResource {
  constructor(private readonly transport: HttpTransport) {}

  list(
    params: ListPlatformConnectionsParams = {},
    options: RequestOptions = {},
  ): Promise<ApiResponse<DataEnvelope<readonly PlatformConnection[]>>> {
    return this.transport.request({
      method: "GET",
      path: "/platform/connections",
      ...(params.projectId === undefined
        ? {}
        : { query: { projectId: params.projectId } }),
      ...existingOptions(options),
    });
  }

  retrieve(
    connectionId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<GetConnectionResponse>> {
    return this.transport.request({
      method: "GET",
      path: connectionPath(connectionId),
      ...existingOptions(options),
    });
  }

  update(
    connectionId: string,
    body: UpdateConnectionRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<UpdateConnectionResponse>> {
    options = existingOptions(options, configurationIntent(body));
    return this.transport.request({
      method: "PUT",
      path: connectionPath(connectionId),
      body: campaignContractBody(body),
      ...existingOptions(options),
    });
  }

  start(
    connectionId: string,
    body: ConnectionProjectContext = {},
    options: RequestOptions = {},
  ): Promise<ApiResponse<DataEnvelope<ConnectionStartResult>>> {
    return this.transport.request({
      method: "POST",
      path: `${connectionPath(connectionId)}/start`,
      body,
      ...existingOptions(options),
    });
  }

  stop(
    connectionId: string,
    body: ConnectionProjectContext = {},
    options: RequestOptions = {},
  ): Promise<ApiResponse<DataEnvelope<ConnectionStopResult>>> {
    return this.transport.request({
      method: "POST",
      path: `${connectionPath(connectionId)}/stop`,
      body,
      ...existingOptions(options),
    });
  }

  /** Requests asynchronous stops for the matching 1 through 100 connections. */
  stopMany(
    body: ConnectionBatchRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<DataEnvelope<ConnectionBatchStopResult>>> {
    return this.transport.request({
      method: "POST",
      path: "/platform/connections/stop",
      body,
      ...existingOptions(options),
    });
  }

  /** Removes a testing Connection. Production Connections return HTTP 409. */
  delete(
    connectionId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<DataEnvelope<ConnectionRemoveResult>>> {
    return this.transport.request({
      method: "DELETE",
      path: connectionPath(connectionId),
      ...existingOptions(options),
    });
  }

  /**
   * Removes matching testing Connections. If any matched Connection is production,
   * the API returns HTTP 409 before removing any Connection in the batch.
   */
  deleteMany(
    body: ConnectionBatchRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<DataEnvelope<ConnectionBatchRemoveResult>>> {
    return this.transport.request({
      method: "POST",
      path: "/platform/connections/delete",
      body,
      ...existingOptions(options),
    });
  }

  /**
   * Review the returned charge and effective time before confirming this quote.
   *
   * A Hybrid Link Connection leaving Pro needs `hybridResolution` (keep one
   * connection or split the Connection); without it the API returns
   * `hybrid_choice_required`. An upgrade to Pro can merge a same-number
   * pair with `hybridMerge`; `connectionId` keeps its ID. The quote echoes the
   * plan in `quote.hybridTransition`.
   */
  quoteTierChange(
    connectionId: string,
    body: ConnectionTierQuoteRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<DataEnvelope<ConnectionTierChange>>> {
    if (
      body?.hybridResolution !== undefined &&
      body?.hybridMerge !== undefined
    ) {
      throw new PolymorfaValidationError(
        "Send hybridResolution or hybridMerge in a tier quote, not both.",
      );
    }
    return this.transport.request({
      method: "POST",
      path: `${connectionPath(connectionId)}/tier-quotes`,
      body,
      ...existingOptions(options),
    });
  }

  retrieveTierChange(
    connectionId: string,
    quoteId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<DataEnvelope<ConnectionTierChange>>> {
    return this.transport.request({
      method: "GET",
      path: `${connectionPath(connectionId)}/tier-quotes/${encodeURIComponent(quoteId)}`,
      ...existingOptions(options),
    });
  }

  /** Confirms a reviewed quote. Poll retrieveTierChange until applied or rejected. */
  setTierOverride(
    connectionId: string,
    body: ConnectionTierOverrideRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<DataEnvelope<ConnectionTierChange>>> {
    if (typeof body?.quoteId !== "string" || !body.quoteId.trim()) {
      throw new PolymorfaValidationError(
        "Review a tier quote and supply its quoteId before confirming a connection tier change.",
      );
    }
    return this.transport.request({
      method: "PATCH",
      path: connectionPath(connectionId),
      body,
      ...existingOptions(options),
    });
  }

  /**
   * WhatsApp features and limits WhatsApp has enabled for the number, as of
   * its last configuration sync. Beta: returns 403 until the team enrolls.
   */
  getCapabilities(
    connectionId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<DataEnvelope<ConnectionCapabilities>>> {
    return this.transport.request({
      method: "GET",
      path: `${connectionPath(connectionId)}/capabilities`,
      ...existingOptions(options),
    });
  }

  getSafeMode(
    connectionId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<DataEnvelope<ConnectionSafeMode>>> {
    return this.transport.request({
      method: "GET",
      path: `${connectionPath(connectionId)}/safe-mode`,
      ...existingOptions(options),
    });
  }

  updateSafeMode(
    connectionId: string,
    body: UpdateConnectionSafeModeRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<DataEnvelope<ConnectionSafeMode>>> {
    return this.transport.request({
      method: "PUT",
      path: `${connectionPath(connectionId)}/safe-mode`,
      body,
      ...existingOptions(options),
    });
  }
}

function connectionPath(connectionId: string): string {
  return `/platform/connections/${encodeURIComponent(connectionId)}`;
}
