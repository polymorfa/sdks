import { PolymorfaConfigurationError } from "../errors.js";
import type { MessagingCredential } from "../credentials.js";
import type { HttpTransport } from "../transport/http.js";
import type { ApiResponse, RequestOptions } from "../transport/types.js";

export interface EmbeddedSignupResult {
  readonly code: string;
  readonly wabaId: string;
  readonly phoneNumberId: string;
  readonly coexistence?: boolean;
  readonly historySync?: boolean;
}
export interface AdvanceCloudOnboardingRequest {
  readonly session: string;
  readonly projectId?: string;
  readonly result?: EmbeddedSignupResult;
  /** Trusted-server app credentials; never expose these in hosted QuickLink input. */
  readonly metaApp?: { readonly appId: string; readonly appSecret: string };
}
export interface CloudOnboardingResponse {
  readonly success: true;
  readonly data: { readonly stage: string };
}

/** Advances the same reserved session; OAuth success alone is not readiness. */
export class CloudOnboardingResource {
  constructor(
    private readonly transport: HttpTransport,
    private readonly credentialType: MessagingCredential["type"],
  ) {}
  advance(
    input: AdvanceCloudOnboardingRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<CloudOnboardingResponse>> {
    if (this.credentialType === "clientToken")
      throw new PolymorfaConfigurationError(
        "Cloud onboarding requires an organization API key or project token.",
        "credential",
      );
    return this.transport.request({
      method: "POST",
      path: "/messaging/cloud-api/embedded-signup",
      body: input,
      ...options,
    });
  }
}
