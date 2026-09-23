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

export type QuickLinkPurpose = "initial" | "add_connection";
export type QuickLinkConnectionGoal = "single" | "hybrid";
export type QuickLinkConnectionKind = "linked_devices" | "official_api";
export type QuickLinkHybridPhase =
  "cloud_setup" | "linked_pairing" | "repair_linked" | "ready";

interface CreateQuickLinkBase {
  readonly connectionGoal?: QuickLinkConnectionGoal;
  readonly addConnection?: QuickLinkConnectionKind;
  readonly projectId?: string;
  readonly customerId?: string;
  readonly externalId?: string;
  readonly configuration?: QuickLinkConfiguration;
}

export type CreateQuickLinkRequest = CreateQuickLinkBase &
  (
    | { readonly purpose?: "initial"; readonly session?: string }
    | { readonly purpose: "add_connection"; readonly session: string }
  );

export interface QuickLink {
  readonly purpose: QuickLinkPurpose;
  readonly connectionGoal: QuickLinkConnectionGoal;
  readonly addConnection?: QuickLinkConnectionKind;
  readonly id: string;
  readonly url: string;
  readonly session: string;
  readonly expiresAt: string | null;
}

export type QuickLinkStatusValue =
  "pending" | "opened" | "linked" | "connected" | "failed" | "cancelled";

export interface QuickLinkStatus {
  readonly purpose: QuickLinkPurpose;
  readonly connectionGoal: QuickLinkConnectionGoal;
  readonly addConnection?: QuickLinkConnectionKind;
  readonly hybridPhase: QuickLinkHybridPhase | null;
  readonly onboarding?: {
    readonly stage: string;
    readonly connection: string | null;
    readonly coexistence: boolean | null;
    readonly contactsSync: string;
    readonly historySync: string;
    readonly historyProgress: number;
    readonly errorCode: string | null;
  } | null;
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

export interface HybridQuickLinkAvailabilityRequest {
  readonly projectId: string;
  readonly session: string;
}

export interface HybridQuickLinkAvailability {
  readonly allowed: boolean;
  readonly addConnection: QuickLinkConnectionKind | null;
  readonly connections: readonly {
    readonly kind: QuickLinkConnectionKind;
    readonly status: string;
    readonly enabled: boolean;
  }[];
  readonly resumeQuickLinkId: string | null;
}

export interface HybridQuickLinkAvailabilityResponse {
  readonly success: true;
  readonly data: HybridQuickLinkAvailability;
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

  availability(
    input: HybridQuickLinkAvailabilityRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<HybridQuickLinkAvailabilityResponse>> {
    this.assertServerCredential();
    return this.transport.request({
      method: "GET",
      path: "/messaging/quicklinks/availability",
      query: { projectId: input.projectId, session: input.session },
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
