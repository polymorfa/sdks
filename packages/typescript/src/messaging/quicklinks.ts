import type { SessionConfigurationOverrides } from "./session-configuration.js";
import { PolymorfaConfigurationError } from "../errors.js";
import type {
  QuickLinkHistorySync,
  QuickLinkMethod,
} from "../platform/quicklink-settings.js";
import { HttpTransport } from "../transport/http.js";
import type { ApiResponse, RequestOptions } from "../transport/types.js";
import type { MessagingCredential } from "../credentials.js";

export interface QuickLinkConfiguration extends SessionConfigurationOverrides {
  readonly testing?: {
    readonly country?: string;
    readonly configuration?: import("./testing-configuration.js").TestingConfiguration;
    readonly editable?: readonly import("./testing-configuration.js").TestingConfigurationField[];
  };
  readonly connectionPreference?: "cloud" | "linked" | "both";
  readonly connectionEnforcement?: "prefer" | "force";
  readonly methods?: readonly QuickLinkMethod[];
  readonly defaultMethod?: QuickLinkMethod | null;
  readonly prefillPhone?: string;
  readonly allowPhoneChange?: boolean;
  readonly historySync?: {
    readonly consent?: QuickLinkHistorySync;
    readonly mode?: "metadata_only" | "deliver";
    readonly requestFull?: boolean;
  };
}

export interface CreateQuickLinkRequest {
  readonly projectId?: string;
  readonly customerId?: string;
  readonly externalId?: string;
  readonly configuration?: QuickLinkConfiguration;
}

export interface QuickLink {
  readonly id: string;
  readonly url: string;
  readonly session: string;
  readonly expiresAt: string | null;
}

export type QuickLinkStatusValue =
  "pending" | "opened" | "linked" | "connected" | "failed" | "cancelled";

export interface QuickLinkStatus {
  readonly id: string;
  readonly status: QuickLinkStatusValue;
  readonly session: string;
  readonly expiresAt: string | null;
  readonly openedAt: string | null;
  readonly connectedAt: string | null;
  readonly phone: string | null;
  readonly errorCode: string | null;
}

export interface CreateQuickLinkResponse {
  readonly success: true;
  readonly data: QuickLink;
}

export interface GetQuickLinkResponse {
  readonly success: true;
  readonly data: QuickLinkStatus;
}

export interface CancelQuickLinkResponse {
  readonly success: true;
  readonly message: string;
}

/** Hosted QuickLink lifecycle. Client tokens are rejected before transport. */
export class QuickLinksResource {
  constructor(
    private readonly transport: HttpTransport,
    private readonly credentialType: MessagingCredential["type"],
  ) {}

  create(
    input: CreateQuickLinkRequest = {},
    options: RequestOptions = {},
  ): Promise<ApiResponse<CreateQuickLinkResponse>> {
    this.assertServerCredential();
    return this.transport.request({
      method: "POST",
      path: "/messaging/quicklinks",
      body: input,
      ...options,
    });
  }

  retrieve(
    id: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<GetQuickLinkResponse>> {
    this.assertServerCredential();
    return this.transport.request({
      method: "GET",
      path: quickLinkPath(id),
      ...options,
    });
  }

  cancel(
    id: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<CancelQuickLinkResponse>> {
    this.assertServerCredential();
    return this.transport.request({
      method: "DELETE",
      path: quickLinkPath(id),
      ...options,
    });
  }

  private assertServerCredential(): void {
    if (this.credentialType === "clientToken") {
      throw new PolymorfaConfigurationError(
        "QuickLink management requires an organization API key or project token.",
        "credential",
      );
    }
  }
}

function quickLinkPath(id: string): string {
  return `/messaging/quicklinks/${encodeURIComponent(id)}`;
}
