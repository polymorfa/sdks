import { PolymorfaConfigurationError } from "../errors.js";
import type { MessagingCredential } from "../credentials.js";
import { HttpTransport } from "../transport/http.js";
import type { ApiResponse, RequestOptions } from "../transport/types.js";
import type {
  TestEventFixtureInfo,
  TestingHistoryMessage,
  TriggerTestEventRequest,
  TriggerTestEventResponse,
} from "./testing-configuration.js";

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

  /**
   * Fire a named, signed test event for a Test number. Generated events reach
   * webhooks and event history with `source: "test"`. With `fromSession`, a
   * `message.received` request sends a simulated message from another Test
   * number instead. Real numbers are refused with a 400 error.
   */
  triggerEvent(
    projectId: string,
    input: TriggerTestEventRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<TriggerTestEventResponse>> {
    assertServerCredential(this.credentialType);
    return this.transport.request({
      method: "POST",
      path: `/messaging/testing/${encodeURIComponent(projectId)}/events`,
      body: input,
      ...options,
    });
  }

  /** List test-event fixtures and the overrides each accepts. */
  listEventFixtures(
    projectId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<{ fixtures: TestEventFixtureInfo[] }>> {
    assertServerCredential(this.credentialType);
    return this.transport.request({
      method: "GET",
      path: `/messaging/testing/${encodeURIComponent(projectId)}/events/fixtures`,
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
