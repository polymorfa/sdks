import { describe, expect, expectTypeOf, it } from "vitest";

import {
  AudiencesResource,
  BillingResource,
  CampaignsResource,
  ChatsResource,
  ClientTokensResource,
  ContactsResource,
  GroupsResource,
  CursorPage,
  MessagingClient,
  MediaResource,
  OptOutsResource,
  OperationsResource,
  PlatformClient,
  PolymorfaAuthenticationError,
  PolymorfaCancelledError,
  PolymorfaConfigurationError,
  PolymorfaError,
  PolymorfaRateLimitError,
  PolymorfaTimeoutError,
  TemplatesResource,
  constructWebhookEvent,
  isEvent,
  verifyWebhookSignature,
  type ApiResponse,
  type BillingBalance,
  type BillingTransaction,
  type BillingUsage,
  type CreateProjectRequest,
  type CreateSessionRequest,
  type Contact,
  type ContactUserInfo,
  type DisappearingTimerRequest,
  type EditMessageRequest,
  type Group,
  type GroupParticipant,
  type MintClientTokenRequest,
  type MessageReceivedEvent,
  type MessagingClientOptions,
  type Operation,
  type PairCodeRequest,
  type QRCodeData,
  type ListCampaignsParams,
  type PlatformPayload,
  type PlatformClientOptions,
  type RawRequest,
  type RequestOptions,
  type ResponseMetadata,
  type SendMessageRequest,
  type TemplateDefinition,
  type TierPricing,
  type UpdateBillingReminderSettingsRequest,
  type WebhookEvent,
} from "../src/index.js";

describe("public exports", () => {
  it("exposes every runtime dependency required by the CLI", () => {
    expect([
      MessagingClient,
      PlatformClient,
      AudiencesResource,
      BillingResource,
      CampaignsResource,
      ChatsResource,
      ClientTokensResource,
      ContactsResource,
      GroupsResource,
      MediaResource,
      OptOutsResource,
      OperationsResource,
      CursorPage,
      PolymorfaError,
      PolymorfaConfigurationError,
      PolymorfaAuthenticationError,
      PolymorfaRateLimitError,
      PolymorfaTimeoutError,
      PolymorfaCancelledError,
      TemplatesResource,
      constructWebhookEvent,
      verifyWebhookSignature,
      isEvent,
    ]).toHaveLength(23);
  });

  it("exposes every public CLI-facing type from one entrypoint", () => {
    expectTypeOf<ApiResponse<unknown>>().toHaveProperty("metadata");
    expectTypeOf<BillingBalance>().toHaveProperty("balanceCents");
    expectTypeOf<BillingUsage>().toHaveProperty("activeNumbers");
    expectTypeOf<BillingTransaction>().toHaveProperty("balanceAfterCents");
    expectTypeOf<TierPricing>().toHaveProperty("dailyRateCents");
    expectTypeOf<UpdateBillingReminderSettingsRequest>().toHaveProperty(
      "lowBalanceThresholdCents",
    );
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
    expectTypeOf<Contact>().toHaveProperty("lid");
    expectTypeOf<ContactUserInfo>().toHaveProperty("devices");
    expectTypeOf<EditMessageRequest>().toHaveProperty("text");
    expectTypeOf<Group>().toHaveProperty("participants");
    expectTypeOf<GroupParticipant>().toHaveProperty("isAdmin");
    expectTypeOf<DisappearingTimerRequest>().toHaveProperty("durationSeconds");
    expectTypeOf<MintClientTokenRequest>().toHaveProperty("ephemeralId");
    expectTypeOf<PairCodeRequest>().toHaveProperty("phone");
    expectTypeOf<QRCodeData>().toHaveProperty("qr");
    expectTypeOf<Operation>().toHaveProperty("status");
    expectTypeOf<CreateProjectRequest>().toHaveProperty("name");
    expectTypeOf<SendMessageRequest>().toHaveProperty("chatId");
    expectTypeOf<TemplateDefinition>().toHaveProperty("variables");
    expectTypeOf<WebhookEvent>().toHaveProperty("event");
    expectTypeOf<MessageReceivedEvent>().toHaveProperty("payload");
  });
});
