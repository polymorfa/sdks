import { requestPhone } from "../campaign-contract-response.js";
import { existingOptions } from "../campaign-existing-validation.js";
import {
  PolymorfaConfigurationError,
  PolymorfaValidationError,
} from "../errors.js";
import type { MessagingCredential } from "../credentials.js";
import { HttpTransport } from "../transport/http.js";
import type { ApiResponse, RequestOptions } from "../transport/types.js";
import type {
  SendTestingPhoneMessageRequest,
  SendTestingPhoneMessageResponse,
  TestEventFixtureInfo,
  TestingHistoryMessage,
  TestingPhone,
  UnlinkTestingPhoneDeviceResponse,
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

/** Trusted-server continuation of an issued QuickLink; never direct connection creation. */
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
      path: `/messaging/projects/${encodeURIComponent(projectId)}/test-history-fixtures`,
      body: input,
      ...options,
    });
  }

  /**
   * Fire a named, signed test event for a Test connection. Generated events reach
   * webhooks and event history with `source: "test"`. With `fromConnection`, a
   * `message.received` request sends a simulated message from another Test
   * connection instead. Real connections are refused with a 400 error. Pass
   * `options.idempotencyKey` to make retries safe: repeating the request with
   * the same key and body reuses the same event ID, and the SDK then retries
   * network and 5xx failures.
   */
  triggerEvent(
    connection: string,
    input: TriggerTestEventRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<TriggerTestEventResponse>> {
    assertServerCredential(this.credentialType);
    return this.transport.request({
      method: "POST",
      path: `/messaging/${encodeURIComponent(connection)}/test-events`,
      body: input,
      ...options,
    });
  }

  /** List test-event fixtures and the overrides each accepts. */
  listEventFixtures(
    options: RequestOptions = {},
  ): Promise<ApiResponse<{ fixtures: TestEventFixtureInfo[] }>> {
    assertServerCredential(this.credentialType);
    return this.transport.request({
      method: "GET",
      path: `/messaging/test-events/fixtures`,
      ...options,
    });
  }

  /**
   * Read a Test connection's simulated phone: whether it is online and which
   * companions are linked to it. Real connections are refused with a 400 error.
   */
  getPhone(
    connection: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<TestingPhone>> {
    assertServerCredential(this.credentialType);
    return requestPhone(
      this.transport,
      {
        method: "GET",
        path: phonePath(connection),
        ...existingOptions(options),
      },
      "phone",
      200,
    );
  }

  /**
   * Send a text message from a Test Connection's phone to another connected Test
   * Connection in the same project. The message travels the simulated WhatsApp
   * network, so its companions receive the sent copy and the recipient gets a
   * normal inbound message. Counts toward the Testing rate limit.
   */
  sendPhoneMessage(
    connection: string,
    input: SendTestingPhoneMessageRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<SendTestingPhoneMessageResponse>> {
    assertServerCredential(this.credentialType);
    return requestPhone(
      this.transport,
      {
        method: "POST",
        path: `${phonePath(connection)}/messages`,
        body: input,
        ...existingOptions(options),
      },
      "send",
      202,
    );
  }

  /**
   * Unlink a companion from a Test Connection's phone, as a person would from
   * Linked devices. The companion is logged out. The phone itself (device 0)
   * cannot be unlinked.
   */
  unlinkPhoneDevice(
    connection: string,
    deviceId: number,
    options: RequestOptions = {},
  ): Promise<ApiResponse<UnlinkTestingPhoneDeviceResponse>> {
    assertServerCredential(this.credentialType);
    if (!Number.isInteger(deviceId) || deviceId < 1 || deviceId > 99)
      throw new PolymorfaValidationError(
        "deviceId must be a companion device ID from 1 to 99.",
      );
    return requestPhone(
      this.transport,
      {
        method: "POST",
        path: `${phonePath(connection)}/devices/${deviceId}/unlink`,
        ...existingOptions(options),
      },
      "unlink",
      200,
    );
  }
}
function phonePath(connection: string): string {
  return `/messaging/${encodeURIComponent(connection)}/phone`;
}
function assertServerCredential(type: MessagingCredential["type"]): void {
  if (type === "clientToken")
    throw new PolymorfaConfigurationError(
      "Onboarding management requires a team key or project token.",
      "credential",
    );
}
