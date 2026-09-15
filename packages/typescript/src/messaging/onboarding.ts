import { PolymorfaConfigurationError } from "../errors.js";
import type { MessagingCredential } from "../credentials.js";
import { HttpTransport } from "../transport/http.js";
import type { ApiResponse, RequestOptions } from "../transport/types.js";
import type { TestingHistoryMessage } from "./testing-configuration.js";

export interface EmbeddedSignupRequest {
  quicklinkId: string;
  projectId?: string;
  result?: {
    code: string;
    wabaId: string;
    phoneNumberId: string;
    coexistence?: boolean;
    historySync?: boolean;
  };
}
export interface EmbeddedSignupResponse {
  success: true;
  data: { stage: string };
}

/** Trusted-server continuation of an issued QuickLink; never direct session creation. */
export class CloudOnboardingResource {
  constructor(
    private readonly transport: HttpTransport,
    private readonly credentialType: MessagingCredential["type"],
  ) {}
  advance(
    input: EmbeddedSignupRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<EmbeddedSignupResponse>> {
    assertServerCredential(this.credentialType);
    return this.transport.request({
      method: "POST",
      path: "/messaging/cloud-api/embedded-signup",
      body: input,
      ...options,
    });
  }
}

export class TestingResource {
  constructor(
    private readonly transport: HttpTransport,
    private readonly credentialType: MessagingCredential["type"],
  ) {}
  createHistoryFixture(
    projectId: string,
    input: { messages: readonly TestingHistoryMessage[] },
    options: RequestOptions = {},
  ): Promise<ApiResponse<{ fixtureId: string }>> {
    assertServerCredential(this.credentialType);
    return this.transport.request({
      method: "POST",
      path: `/messaging/testing/${encodeURIComponent(projectId)}/history-fixtures`,
      body: input,
      ...options,
    });
  }
}
function assertServerCredential(type: MessagingCredential["type"]): void {
  if (type === "clientToken")
    throw new PolymorfaConfigurationError(
      "Onboarding management requires an organization API key or project token.",
      "credential",
    );
}
