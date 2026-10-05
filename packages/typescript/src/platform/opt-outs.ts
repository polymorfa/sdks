import { HttpTransport } from "../transport/http.js";
import type { ApiResponse, RequestOptions } from "../transport/types.js";
import {
  validateStopConfirmationPreference,
  type StopConfirmationSettings,
  type StopConfirmationSummary,
  type UpdateStopConfirmationSettingsRequest,
} from "./stop-confirmations.js";
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

  /** Read the team's optional STOP acknowledgement preference. Default: disabled. */
  getConfirmationSettings(
    options: RequestOptions = {},
  ): Promise<ApiResponse<DataEnvelope<StopConfirmationSettings>>> {
    return this.transport.request({
      method: "GET",
      path: "/platform/optouts/confirmation-settings",
      ...options,
    });
  }

  /** Beta access is required to enable. Never retries a preference mutation automatically. */
  updateConfirmationSettings(
    body: UpdateStopConfirmationSettingsRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<DataEnvelope<StopConfirmationSettings>>> {
    validateStopConfirmationPreference(body);
    return this.transport.request({
      method: "PUT",
      path: "/platform/optouts/confirmation-settings",
      body,
      ...options,
      maxNetworkRetries: 0,
    });
  }

  /** Read aggregate outcomes; unknown submissions must not be resent. */
  getConfirmationSummary(
    options: RequestOptions = {},
  ): Promise<ApiResponse<DataEnvelope<StopConfirmationSummary>>> {
    return this.transport.request({
      method: "GET",
      path: "/platform/optouts/confirmation-summary",
      ...options,
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
