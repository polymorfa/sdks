import { describe, expect, expectTypeOf, it } from "vitest";

import {
  ApiKeysResource,
  AuditLogsResource,
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
  MembersResource,
  OptOutsResource,
  OperationsResource,
  ObservationPoliciesResource,
  ProfileResource,
  PresenceResource,
  PrivacyResource,
  QuickRepliesResource,
  PlatformClient,
  PlatformOperationsResource,
  ProjectTokensResource,
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
  SecurityIncidentsResource,
  SessionBansResource,
  TemplatesResource,
  UsersResource,
  WidgetSettingsResource,
  constructWebhookEvent,
  isEvent,
  verifyWebhookSignature,
  type ApiKey,
  type ApiResponse,
  type AuditLog,
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
  type ManagementOperation,
  type OrganizationMember,
  type PlatformPayload,
  type PlatformClientOptions,
  type ProjectToken,
  type RawRequest,
  type RequestOptions,
  type ResolveLidParams,
  type ResponseMetadata,
  type SecurityIncident,
  type SessionBan,
  type SessionBatchRequest,
  type SendMessageRequest,
  type TemplateDefinition,
  type TierPricing,
  type UpdateBillingReminderSettingsRequest,
  type WebhookEvent,
  type UserSecurityCode,
  type WidgetSettings,
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
      ApiKeysResource,
      AuditLogsResource,
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
      MembersResource,
      OptOutsResource,
      OperationsResource,
      ObservationPoliciesResource,
      ProfileResource,
      PrivacyResource,
      PresenceResource,
      QuickRepliesResource,
      PlatformOperationsResource,
      ProjectTokensResource,
      CursorPage,
      PolymorfaError,
      PolymorfaConfigurationError,
      PolymorfaAuthenticationError,
      PolymorfaRateLimitError,
      PolymorfaTimeoutError,
      PolymorfaCancelledError,
      SecurityIncidentsResource,
      SessionBansResource,
      TemplatesResource,
      UsersResource,
      WidgetSettingsResource,
      constructWebhookEvent,
      verifyWebhookSignature,
      isEvent,
    ]).toHaveLength(43);
  });

  it("exposes every public CLI-facing type from one entrypoint", () => {
    expectTypeOf<ApiResponse<unknown>>().toHaveProperty("metadata");
    expectTypeOf<ApiKey>().toHaveProperty("last4");
    expectTypeOf<AuditLog>().toHaveProperty("actorEmail");
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
    expectTypeOf<ManagementOperation>().toHaveProperty("status");
    expectTypeOf<OrganizationMember>().toHaveProperty("role");
    expectTypeOf<PlatformPayload>().toMatchTypeOf<
      Readonly<Record<string, unknown>>
    >();
    expectTypeOf<ProjectToken>().toHaveProperty("revokedAt");
    expectTypeOf<SecurityIncident>().toHaveProperty("resolution");
    expectTypeOf<SessionBan>().toHaveProperty("status");
    expectTypeOf<SessionBatchRequest>().toHaveProperty("sessionIds");
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
    expectTypeOf<WidgetSettings>().toHaveProperty("allowedOrigins");
    expectTypeOf<MessageReceivedEvent>().toHaveProperty("payload");
  });
});
