import { describe, expect, expectTypeOf, it } from "vitest";

import {
  AudiencesResource,
  CampaignsResource,
  ClientTokensResource,
  CursorPage,
  MessagingClient,
  MediaResource,
  OptOutsResource,
  PlatformClient,
  PolymorfaAuthenticationError,
  PolymorfaCancelledError,
  PolymorfaConfigurationError,
  PolymorfaError,
  PolymorfaRateLimitError,
  PolymorfaTimeoutError,
  constructWebhookEvent,
  isEvent,
  verifyWebhookSignature,
  type ApiResponse,
  type CreateProjectRequest,
  type CreateSessionRequest,
  type MintClientTokenRequest,
  type MessageReceivedEvent,
  type MessagingClientOptions,
  type ListCampaignsParams,
  type PlatformPayload,
  type PlatformClientOptions,
  type RawRequest,
  type RequestOptions,
  type ResponseMetadata,
  type SendMessageRequest,
  type WebhookEvent,
} from "../src/index.js";

describe("public exports", () => {
  it("exposes every runtime dependency required by the CLI", () => {
    expect([
      MessagingClient,
      PlatformClient,
      AudiencesResource,
      CampaignsResource,
      ClientTokensResource,
      MediaResource,
      OptOutsResource,
      CursorPage,
      PolymorfaError,
      PolymorfaConfigurationError,
      PolymorfaAuthenticationError,
      PolymorfaRateLimitError,
      PolymorfaTimeoutError,
      PolymorfaCancelledError,
      constructWebhookEvent,
      verifyWebhookSignature,
      isEvent,
    ]).toHaveLength(17);
  });

  it("exposes every public CLI-facing type from one entrypoint", () => {
    expectTypeOf<ApiResponse<unknown>>().toHaveProperty("metadata");
    expectTypeOf<ResponseMetadata>().toHaveProperty("requestId");
    expectTypeOf<RequestOptions>().toHaveProperty("signal");
    expectTypeOf<RawRequest>().toHaveProperty("path");
    expectTypeOf<MessagingClientOptions>().toHaveProperty("credential");
    expectTypeOf<PlatformClientOptions>().toHaveProperty("apiKey");
    expectTypeOf<ListCampaignsParams>().toHaveProperty("projectId");
    expectTypeOf<PlatformPayload>().toMatchTypeOf<
      Readonly<Record<string, unknown>>
    >();
    expectTypeOf<CreateSessionRequest>().toHaveProperty("projectId");
    expectTypeOf<MintClientTokenRequest>().toHaveProperty("ephemeralId");
    expectTypeOf<CreateProjectRequest>().toHaveProperty("name");
    expectTypeOf<SendMessageRequest>().toHaveProperty("chatId");
    expectTypeOf<WebhookEvent>().toHaveProperty("event");
    expectTypeOf<MessageReceivedEvent>().toHaveProperty("payload");
  });
});
