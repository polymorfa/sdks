import { HttpTransport } from "../transport/http.js";
import {
  campaignContractBody,
  campaignContractOptions,
  validateStopConfirmation,
} from "../campaign-contract-validation.js";
import type {
  StopConfirmationSettings,
  StopConfirmationSummary,
  UpdateStopConfirmationSettingsInput,
} from "../campaign-contracts.js";
import type { ApiResponse, RequestOptions } from "../transport/types.js";
import type {
  DataEnvelope,
  OptOutSettings,
  PlatformPayload,
  UpdateOptOutSettingsRequest,
} from "./types.js";

type OptOutResponse = Promise<ApiResponse<DataEnvelope<PlatformPayload>>>;

const SETTINGS_PATH = "/platform/optouts/settings";

export class OptOutsResource {
  constructor(private readonly transport: HttpTransport) {}

  getConfirmationSettings(
    options: RequestOptions = {},
  ): Promise<ApiResponse<DataEnvelope<StopConfirmationSettings>>> {
    return this.transport.request({
      ...campaignContractOptions(options),
      method: "GET",
      path: "/platform/optouts/confirmation-settings",
    });
  }

  updateConfirmationSettings(
    body: UpdateStopConfirmationSettingsInput,
    options: RequestOptions = {},
  ): Promise<ApiResponse<DataEnvelope<StopConfirmationSettings>>> {
    validateStopConfirmation(body);
    return this.transport.request({
      ...campaignContractOptions(options, true),
      method: "PUT",
      path: "/platform/optouts/confirmation-settings",
      body: campaignContractBody(body),
    });
  }

  getConfirmationSummary(
    options: RequestOptions = {},
  ): Promise<ApiResponse<DataEnvelope<StopConfirmationSummary>>> {
    return this.transport.request({
      ...campaignContractOptions(options),
      method: "GET",
      path: "/platform/optouts/confirmation-summary",
    });
  }

  list(options: RequestOptions = {}): OptOutResponse {
    return this.transport.request({
      method: "GET",
      path: "/platform/optouts",
      ...options,
    });
  }

  create(body?: PlatformPayload, options: RequestOptions = {}): OptOutResponse {
    return this.write("/platform/optouts", body, options);
  }

  createBatch(
    body?: PlatformPayload,
    options: RequestOptions = {},
  ): OptOutResponse {
    return this.write("/platform/optouts/batch", body, options);
  }

  /** Read the organization's STOP/START keyword capture settings. */
  getSettings(
    options: RequestOptions = {},
  ): Promise<ApiResponse<DataEnvelope<OptOutSettings>>> {
    return this.transport.request({
      method: "GET",
      path: SETTINGS_PATH,
      ...options,
    });
  }

  /** Replace the keyword capture settings. Every field is required. */
  updateSettings(
    body: UpdateOptOutSettingsRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<DataEnvelope<OptOutSettings>>> {
    return this.transport.request({
      method: "PUT",
      path: SETTINGS_PATH,
      body,
      ...options,
    });
  }

  delete(phone: string, options: RequestOptions = {}): OptOutResponse {
    return this.transport.request({
      method: "DELETE",
      path: `/platform/optouts/${encodeURIComponent(phone)}`,
      ...options,
    });
  }

  private write(
    path: string,
    body: PlatformPayload | undefined,
    options: RequestOptions,
  ): OptOutResponse {
    return this.transport.request({
      method: "POST",
      path,
      ...(body === undefined ? {} : { body }),
      ...options,
    });
  }
}
