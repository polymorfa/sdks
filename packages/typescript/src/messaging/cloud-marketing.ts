import type { MessagingCredential } from "../credentials.js";
import { PolymorfaConfigurationError } from "../errors.js";
import { HttpTransport } from "../transport/http.js";
import type { ApiResponse, RequestOptions } from "../transport/types.js";

/** Meta WABA observations. Neither string is an eligibility or terms grant. */
export interface CloudMarketingStatus {
  readonly id: string;
  readonly marketing_messages_lite_api_status?: string;
  readonly marketing_messages_onboarding_status?: string;
}

export interface GetCloudMarketingStatusParams {
  /** Meta Graph version, for example v26.0. */
  readonly version: string;
}

export class CloudMarketingResource {
  constructor(
    private readonly transport: HttpTransport,
    private readonly credentialType: MessagingCredential["type"],
  ) {}

  /** Read raw WABA status fields through a project-owned Official API Number. */
  status(
    wabaId: string,
    params: GetCloudMarketingStatusParams,
    options: RequestOptions = {},
  ): Promise<ApiResponse<CloudMarketingStatus>> {
    if (this.credentialType === "clientToken") {
      throw new PolymorfaConfigurationError(
        "Official API marketing status requires an organization API key or project token.",
        "credential",
      );
    }
    if (!wabaId.trim() || !params.version.trim()) {
      throw new PolymorfaConfigurationError("Provide a WABA ID and Graph version.");
    }
    return this.transport.request({
      method: "GET",
      path: `/graph/whatsapp/${encodeURIComponent(params.version)}/${encodeURIComponent(wabaId)}/marketing_messages/status`,
      ...options,
    });
  }
}
