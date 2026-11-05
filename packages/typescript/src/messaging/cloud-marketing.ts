import type { MessagingCredential } from "../credentials.js";
import {
  PolymorfaConfigurationError,
  PolymorfaValidationError,
} from "../errors.js";
import { HttpTransport } from "../transport/http.js";
import type { ApiResponse, RequestOptions } from "../transport/types.js";

/** Meta WABA observations. Neither string is an eligibility or terms grant. */
export interface CloudMarketingStatus {
  readonly id: string;
  readonly marketing_messages_onboarding_status?: string;
  readonly owner_business_info?: {
    readonly marketing_messages_onboarding_status?: {
      readonly status?: string;
      readonly time?: string;
    };
  };
  readonly disable_marketing_messages_on_cloud_api?: boolean;
}

export interface GetCloudMarketingStatusParams {
  /** Meta Graph version, for example v26.0. */
  readonly version: string;
}

export interface MarketingMessagesStatus {
  readonly wabaId: string;
  readonly onboarding: {
    readonly status: "onboarded" | "eligible" | "unknown";
    readonly metaStatus: string | null;
  };
  readonly terms: {
    readonly status: "signed" | "requested" | "not_started" | "unknown";
    readonly metaStatus: string | null;
    readonly date: string | null;
  };
  readonly cloudApiMarketingDisabled: boolean | null;
  readonly nextAction: "none" | "accept_terms" | "review_in_whatsapp_manager";
  readonly guideUrl: string;
  readonly observedAt: string;
}

export class CloudMarketingResource {
  constructor(
    private readonly transport: HttpTransport,
    private readonly credentialType: MessagingCredential["type"],
  ) {}

  /** Beta, sessions:read. Terms acceptance happens in WhatsApp Manager.
   * feature_unavailable means the team has no access; unknown never means eligible.
   */
  getStatus(
    session: string,
    options: RequestOptions = {},
  ): Promise<
    ApiResponse<{
      readonly success: true;
      readonly data: MarketingMessagesStatus;
    }>
  > {
    if (this.credentialType === "clientToken")
      throw new PolymorfaConfigurationError(
        "Marketing Messages status requires an organization API key or project token.",
        "credential",
      );
    if (!session.trim() || session.length > 128)
      throw new PolymorfaValidationError(
        "Provide a Number ID of 1 to 128 characters.",
      );
    return this.transport.request({
      method: "GET",
      path: `/messaging/${encodeURIComponent(session)}/marketing-messages/status`,
      ...options,
    });
  }

  /** Read raw WABA status fields through a project-owned Official API Number. */
  status(
    wabaId: string,
    params: GetCloudMarketingStatusParams,
    options: RequestOptions = {},
  ): Promise<ApiResponse<CloudMarketingStatus>> {
    if (this.credentialType === "clientToken") {
      throw new PolymorfaConfigurationError(
        "Official API marketing status requires an team key or project token.",
        "credential",
      );
    }
    if (!wabaId.trim() || !params.version.trim()) {
      throw new PolymorfaConfigurationError(
        "Provide a WABA ID and Graph version.",
      );
    }
    return this.transport.request({
      method: "GET",
      path: `/graph/whatsapp/${encodeURIComponent(params.version)}/${encodeURIComponent(wabaId)}/marketing_messages/status`,
      ...options,
    });
  }
}
