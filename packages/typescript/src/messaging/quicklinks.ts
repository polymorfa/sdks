import { PolymorfaConfigurationError } from "../errors.js";
import type {
  QuickLinkHistorySync,
  QuickLinkMethod,
  QuickLinkTheme,
} from "../platform/quicklink-settings.js";
import { HttpTransport } from "../transport/http.js";
import type { ApiResponse, RequestOptions } from "../transport/types.js";
import type { MessagingCredential } from "../credentials.js";

export interface CreateQuickLinkRequest {
  readonly projectId?: string;
  readonly customerId?: string;
  readonly methods?: readonly QuickLinkMethod[];
  readonly businessName?: string;
  readonly historySync?: QuickLinkHistorySync;
  readonly callbackUrl?: string;
  readonly theme?: QuickLinkTheme;
  readonly accent?: string;
  readonly prefillPhone?: string;
  readonly expiresInSeconds?: number;
}

export interface QuickLink {
  readonly id: string;
  readonly url: string;
  readonly session: string;
  readonly expiresAt: string;
}

export type QuickLinkStatusValue =
  "pending" | "opened" | "linked" | "connected" | "failed" | "cancelled";

export interface QuickLinkStatus {
  readonly id: string;
  readonly status: QuickLinkStatusValue;
  readonly session: string;
  readonly expiresAt: string;
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
      path: "/api/quicklinks",
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
  return `/api/quicklinks/${encodeURIComponent(id)}`;
}
