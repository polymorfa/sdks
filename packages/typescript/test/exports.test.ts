import { describe, expect, expectTypeOf, it } from "vitest";

import {
  AudiencesResource,
  BillingResource,
  BusinessResource,
  CallsResource,
  CampaignsResource,
  ChatsResource,
  ChannelsResource,
  ClientTokensResource,
  ContactsResource,
  GroupsResource,
  LabelsResource,
  LidsResource,
  CursorPage,
  MessagingClient,
  MessagingMediaResource,
  MediaResource,
  OptOutsResource,
  OperationsResource,
  ObservationPoliciesResource,
  ProfileResource,
  PresenceResource,
  PrivacyResource,
  QuickRepliesResource,
  PlatformClient,
  PRIVACY_SETTING_VALUES,
  PRESENCE_CHAT_STATES,
  PRESENCE_OBSERVATION_STATUSES,
  PRESENCE_STATES,
  PRESENCE_UNKNOWN_REASONS,
  PolymorfaAuthenticationError,
  PolymorfaCancelledError,
  PolymorfaConfigurationError,
  PolymorfaError,
  PolymorfaRateLimitError,
  PolymorfaTimeoutError,
  TemplatesResource,
  UsersResource,
  constructWebhookEvent,
  isEvent,
  verifyWebhookSignature,
  type ApiResponse,
  type BillingBalance,
  type BillingTransaction,
  type BillingUsage,
  type Channel,
  type ChannelMessage,
  type CreateProjectRequest,
  type CreateChannelRequest,
  type CreateSessionRequest,
  type Contact,
  type ContactUserInfo,
  type DisappearingTimerRequest,
  type EditMessageRequest,
  type Group,
  type GroupParticipant,
  type Label,
  type ProjectObservationPolicy,
  type ProfileData,
  type ChatPresenceData,
  type PresenceData,
  type PrivacySettings,
  type BusinessQuickReply,
  type BusinessCatalogPage,
  type BusinessMerchantCompliance,
  type BusinessProductMutationRequest,
  type BusinessProfileUpdateRequest,
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
  type ResolveLidParams,
  type ResponseMetadata,
  type SendMessageRequest,
  type TemplateDefinition,
  type TierPricing,
  type UpdateBillingReminderSettingsRequest,
  type WebhookEvent,
  type UserSecurityCode,
} from "../src/index.js";

describe("public exports", () => {
  it("exposes every runtime dependency required by the CLI", () => {
    expect(ProfileResource).toBeTypeOf("function");
    expect(PrivacyResource).toBeTypeOf("function");
    expect(PresenceResource).toBeTypeOf("function");
    expect(PRIVACY_SETTING_VALUES.online).toContain("match_last_seen");
    expect(PRESENCE_STATES).toEqual(["available", "unavailable"]);
    expect(PRESENCE_OBSERVATION_STATUSES).toContain("stale");
    expect(PRESENCE_UNKNOWN_REASONS).toContain("suspended");
    expect(PRESENCE_CHAT_STATES).toEqual(["composing", "paused"]);
    expect([
      MessagingClient,
      MessagingMediaResource,
      PlatformClient,
      AudiencesResource,
      BillingResource,
      BusinessResource,
      CallsResource,
      CampaignsResource,
      ChatsResource,
      ChannelsResource,
      ClientTokensResource,
      ContactsResource,
      GroupsResource,
      LabelsResource,
      LidsResource,
      MediaResource,
      OptOutsResource,
      OperationsResource,
      ObservationPoliciesResource,
      ProfileResource,
      PrivacyResource,
      PresenceResource,
      QuickRepliesResource,
      CursorPage,
      PolymorfaError,
      PolymorfaConfigurationError,
      PolymorfaAuthenticationError,
      PolymorfaRateLimitError,
      PolymorfaTimeoutError,
      PolymorfaCancelledError,
      TemplatesResource,
      UsersResource,
      constructWebhookEvent,
      verifyWebhookSignature,
      isEvent,
    ]).toHaveLength(35);
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
    expectTypeOf<ResolveLidParams>().toMatchTypeOf<
      Readonly<Record<string, string | undefined>>
    >();
    expectTypeOf<RawRequest>().toHaveProperty("path");
    expectTypeOf<MessagingClientOptions>().toHaveProperty("credential");
    expectTypeOf<PlatformClientOptions>().toHaveProperty("apiKey");
    expectTypeOf<ListCampaignsParams>().toHaveProperty("projectId");
    expectTypeOf<PlatformPayload>().toMatchTypeOf<
      Readonly<Record<string, unknown>>
    >();
    expectTypeOf<CreateSessionRequest>().toHaveProperty("projectId");
    expectTypeOf<CreateChannelRequest>().toHaveProperty("picture");
    expectTypeOf<Channel>().toHaveProperty("lid");
    expectTypeOf<ChannelMessage>().toHaveProperty("serverId");
    expectTypeOf<Contact>().toHaveProperty("lid");
    expectTypeOf<ContactUserInfo>().toHaveProperty("devices");
    expectTypeOf<EditMessageRequest>().toHaveProperty("text");
    expectTypeOf<Group>().toHaveProperty("participants");
    expectTypeOf<GroupParticipant>().toHaveProperty("isAdmin");
    expectTypeOf<Label>().toHaveProperty("color");
    expectTypeOf<ProjectObservationPolicy>().toHaveProperty("labelMode");
    expectTypeOf<ProfileData>().toHaveProperty("status");
    expectTypeOf<PrivacySettings>().toHaveProperty("readReceipts");
    expectTypeOf<PresenceData>().toHaveProperty("authoritative");
    expectTypeOf<ChatPresenceData>().toHaveProperty("typingStatus");
    expectTypeOf<BusinessQuickReply>().toHaveProperty("shortcut");
    expectTypeOf<BusinessCatalogPage>().toHaveProperty("products");
    expectTypeOf<BusinessMerchantCompliance>().toHaveProperty("entityType");
    expectTypeOf<BusinessProductMutationRequest>().toHaveProperty("images");
    expectTypeOf<BusinessProfileUpdateRequest>().toHaveProperty("hours");
    expectTypeOf<DisappearingTimerRequest>().toHaveProperty("durationSeconds");
    expectTypeOf<MintClientTokenRequest>().toHaveProperty("ephemeralId");
    expectTypeOf<PairCodeRequest>().toHaveProperty("phone");
    expectTypeOf<QRCodeData>().toHaveProperty("qr");
    expectTypeOf<Operation>().toHaveProperty("status");
    expectTypeOf<CreateProjectRequest>().toHaveProperty("name");
    expectTypeOf<SendMessageRequest>().toHaveProperty("chatId");
    expectTypeOf<TemplateDefinition>().toHaveProperty("variables");
    expectTypeOf<WebhookEvent>().toHaveProperty("event");
    expectTypeOf<UserSecurityCode>().toHaveProperty("numericCode");
    expectTypeOf<MessageReceivedEvent>().toHaveProperty("payload");
  });
});
