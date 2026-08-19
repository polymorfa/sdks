export type MessagingConnection = "linked_device" | "cloud_api";
export type BartenderMode = "magic" | "passthrough" | "passthrough_plus";

export interface CloudApiCredentials {
  readonly phoneNumberId: string;
  readonly wabaId: string;
  readonly businessAccountId?: string;
  readonly appId: string;
  readonly appSecret: string;
  readonly systemUserToken: string;
  readonly webhookVerifyToken: string;
}

export interface HistorySyncPolicy {
  readonly mode?: "metadata_only" | "deliver";
  readonly requestFull?: boolean;
}

export interface Session {
  readonly sessionId?: string;
  readonly name: string;
  readonly tenantId: string;
  readonly connection: MessagingConnection;
  readonly testMode: boolean;
  readonly status: string;
  readonly statusReason?: string;
  readonly runnerId?: string;
  readonly proxy?: string;
  readonly config: Readonly<Record<string, unknown>>;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CreateSessionRequest {
  readonly projectId: string;
  readonly sessionId?: string;
  readonly name?: string;
  readonly start?: boolean;
  readonly connection?: MessagingConnection;
  readonly testMode?: boolean;
  readonly bartenderMode?: BartenderMode;
  readonly cloudApi?: CloudApiCredentials;
  readonly config?: Readonly<Record<string, unknown>>;
  readonly historySync?: HistorySyncPolicy;
}

export interface UpdateSessionRequest {
  readonly config?: Readonly<Record<string, unknown>>;
  readonly historySync?: HistorySyncPolicy;
}

export interface SessionOperation extends Session {
  readonly operationId?: string;
}

export interface OperationAccepted {
  readonly success: true;
  readonly message: string;
  readonly operationId: string;
}

export interface WhatsAppAccount {
  readonly lid: string;
  readonly phoneNumber?: string;
  readonly pushName: string;
  readonly businessName?: string;
  readonly platform?: string;
  readonly profilePicUrl?: string;
}

export interface SuccessEnvelope<T> {
  readonly success: true;
  readonly data: T;
}

export interface SuccessResponse {
  readonly success: boolean;
  readonly message?: string;
}

export interface Contact {
  readonly lid: string;
  readonly phoneNumber?: string;
  readonly name: string;
  readonly pushName: string;
  readonly businessName?: string;
  readonly profileUrl?: string;
  readonly id?: string;
  readonly username?: string;
}

export interface CheckContactResult {
  readonly exists: boolean;
  readonly lid?: string;
  readonly phoneNumber?: string;
  readonly id?: string;
  readonly username?: string;
}

export interface ContactBlocklist {
  readonly hash: string;
  readonly jids: readonly string[];
}

export interface BusinessProfileCategory {
  readonly id: string;
  readonly name: string;
}

export interface BusinessProfileHours {
  readonly dayOfWeek: string;
  readonly mode: string;
  readonly openTime: string;
  readonly closeTime: string;
}

export interface BusinessProfile {
  readonly jid: string;
  readonly address: string;
  readonly email: string;
  readonly description: string;
  readonly websites: readonly string[];
  readonly coverPhotoId: string;
  readonly categories: readonly BusinessProfileCategory[];
  readonly options: Readonly<Record<string, string>>;
  readonly hoursTimeZone: string;
  readonly hours: readonly BusinessProfileHours[];
}

export interface ContactUserInfo {
  readonly jid: string;
  readonly lid: string;
  readonly status: string;
  readonly pictureId: string;
  readonly verifiedName: string;
  readonly devices: readonly string[];
  readonly id?: string;
  readonly phoneNumber?: string;
  readonly username?: string;
}

export interface ContactProfilePicture {
  readonly url: string;
}

export interface ProfileData {
  readonly name: string;
  readonly status: string;
  readonly profilePicUrl?: string;
}

export interface SetProfileNameRequest {
  readonly name: string;
}

export interface SetProfileStatusRequest {
  readonly status: string;
}

/** JSON picture source accepted by the public API contract. */
export interface SetProfilePictureRequest {
  readonly url?: string;
  readonly base64?: string;
}

export type GetProfileResponse = SuccessEnvelope<ProfileData>;
export type SetProfileNameResponse = SuccessResponse;
export type SetProfileStatusResponse = SuccessResponse;
export type SetProfilePictureResponse = SuccessResponse;
export type DeleteProfilePictureResponse = SuccessResponse;

export const PRIVACY_SETTING_VALUES = {
  groupadd: ["all", "contacts", "contact_blacklist", "none"],
  last: ["all", "contacts", "contact_blacklist", "none"],
  status: ["all", "contacts", "contact_blacklist", "none"],
  profile: ["all", "contacts", "contact_blacklist", "none"],
  readreceipts: ["all", "none"],
  online: ["all", "match_last_seen"],
  calladd: ["all", "known"],
  messages: ["all", "contacts"],
  defense: ["on_standard", "off"],
  stickers: ["contacts", "contact_allowlist", "none"],
} as const;

export type StandardPrivacyAudience =
  (typeof PRIVACY_SETTING_VALUES)["groupadd"][number];

export interface PrivacySettings {
  readonly groupAdd: StandardPrivacyAudience;
  readonly lastSeen: StandardPrivacyAudience;
  readonly status: StandardPrivacyAudience;
  readonly profile: StandardPrivacyAudience;
  readonly readReceipts: "all" | "none";
  readonly online: "all" | "match_last_seen";
  readonly callAdd: "all" | "known";
  readonly messages: "all" | "contacts";
  readonly defense: "on_standard" | "off";
  readonly stickers: "contacts" | "contact_allowlist" | "none";
}

export type PrivacySettingValueMap = {
  readonly [
    Setting in keyof typeof PRIVACY_SETTING_VALUES
  ]: (typeof PRIVACY_SETTING_VALUES)[Setting][number];
};

export type PrivacySettingName = keyof PrivacySettingValueMap;
export type PrivacySettingMutation = {
  [Setting in PrivacySettingName]: {
    readonly setting: Setting;
    readonly value: PrivacySettingValueMap[Setting];
  };
}[PrivacySettingName];
export type PrivacySettingValue = PrivacySettingMutation["value"];
export type DefaultDisappearingTimerRequest = DisappearingTimerRequest;
export type GetPrivacySettingsResponse = SuccessEnvelope<PrivacySettings>;
export type SetPrivacySettingResponse = SuccessEnvelope<PrivacySettings>;
export type SetDefaultDisappearingTimerResponse = SuccessResponse;

export type ListContactsResponse = SuccessEnvelope<readonly Contact[]>;
export type CheckContactsResponse = SuccessEnvelope<
  readonly CheckContactResult[]
>;
export type GetContactResponse = SuccessEnvelope<Contact>;
export type GetContactPictureResponse = SuccessEnvelope<ContactProfilePicture>;
export type GetBlocklistResponse = SuccessEnvelope<ContactBlocklist>;
export type GetUserInfoResponse = SuccessEnvelope<ContactUserInfo>;
export type GetUserDevicesResponse = SuccessEnvelope<readonly string[]>;
export type GetBusinessProfileResponse = SuccessEnvelope<BusinessProfile>;

export interface MessagingMediaInfo {
  readonly id: string;
  readonly session: string;
  readonly messageId: string;
  readonly mimeType: string;
  readonly fileLength: number;
  readonly persisted: boolean;
  readonly s3Url?: string | null;
}

export type GetMessagingMediaInfoResponse = SuccessEnvelope<MessagingMediaInfo>;

export type ObservationMode = "off" | "events" | "cache";
export type LabelObservationMode = ObservationMode | "project";
export type SessionObservationMode = ObservationMode | "inherit";
export type SessionLabelObservationMode = LabelObservationMode | "inherit";

export const PRESENCE_STATES = ["available", "unavailable"] as const;
export const PRESENCE_OBSERVATION_STATUSES = [
  "unknown",
  "fresh",
  "stale",
] as const;
export const PRESENCE_UNKNOWN_REASONS = [
  "disabled",
  "not_observed",
  "suspended",
] as const;
export const PRESENCE_CHAT_STATES = ["composing", "paused"] as const;

export type PresenceState = (typeof PRESENCE_STATES)[number];
export type PresenceObservationStatus =
  (typeof PRESENCE_OBSERVATION_STATUSES)[number];
export type PresenceUnknownReason = (typeof PRESENCE_UNKNOWN_REASONS)[number];
export type PresenceChatStateValue = (typeof PRESENCE_CHAT_STATES)[number];

export interface SetPresenceRequest {
  readonly presence: PresenceState;
}

/**
 * The runner's remembered intent and last successful send, not authoritative
 * remote account state.
 */
export interface PresenceData {
  readonly desired?: PresenceState;
  readonly desiredAt?: string;
  readonly lastSent?: PresenceState;
  readonly lastSentAt?: string;
  readonly authoritative: false;
}

export interface PresenceChatState {
  readonly sender: string;
  readonly state: PresenceChatStateValue;
  readonly media?: string;
  readonly observedAt: string;
  readonly stale: boolean;
}

/** Policy-governed retained observation state; this is not a live query. */
export interface ChatPresenceData {
  readonly policy: ObservationMode;
  readonly status: PresenceObservationStatus;
  readonly unknownReason?: PresenceUnknownReason;
  readonly available?: boolean;
  readonly lastSeen?: string;
  readonly observedAt?: string;
  readonly subscriptionExpiresAt?: string;
  readonly stale: boolean;
  readonly typingPolicy: ObservationMode;
  readonly typingStatus: PresenceObservationStatus;
  readonly typingUnknownReason?: PresenceUnknownReason;
  readonly chatState?: PresenceChatState;
}

export interface PresenceSubscriptionData {
  readonly status: "SUBSCRIBED";
  readonly expiresAt: string;
}

export interface PresenceSetResult {
  readonly status: "OK";
}

export interface AsyncAcceptedData {
  readonly requestId: string;
}

export type GetPresenceResponse = SuccessEnvelope<PresenceData>;
export type GetChatPresenceResponse = SuccessEnvelope<ChatPresenceData>;
/**
 * The pinned OpenAPI declares SuccessResponse; the pinned live RPC handler
 * returns a data envelope. Both are represented until the source converges.
 */
export type SetPresenceResponse =
  | SuccessResponse
  | SuccessEnvelope<PresenceSetResult>
  | SuccessEnvelope<AsyncAcceptedData>;
export type SubscribePresenceResponse =
  | SuccessEnvelope<PresenceSubscriptionData>
  | SuccessEnvelope<AsyncAcceptedData>;

/** Public channel/newsletter metadata. Fields are optional in the pinned contract. */
export interface Channel {
  readonly lid?: string;
  readonly name?: string;
  readonly description?: string;
  readonly profileUrl?: string;
  readonly followers?: number;
  readonly muted?: boolean;
  readonly preview?: boolean;
}

export interface CreateChannelRequest {
  readonly name: string;
  readonly description?: string;
  /** Public contract field; the pinned runner does not presently apply it. */
  readonly picture?: string;
}

export interface ChannelMessage {
  readonly serverId: number;
  readonly id: string;
  readonly type: string;
  readonly timestamp: string;
  readonly views: number;
  readonly reactionCounts: Readonly<Record<string, number>>;
  readonly text?: string;
}

export interface ChannelMessagesParams {
  /** Number of messages to return. The API accepts 1 through 100 and defaults to 50. */
  readonly count?: number;
  /** Positive message server ID used as the exclusive older-history cursor. */
  readonly before?: number;
}

export interface ChannelMessageUpdatesParams {
  /** Number of updates to return. The API accepts 1 through 100 and defaults to 50. */
  readonly count?: number;
  /** Non-negative Unix timestamp in seconds. Zero is treated as unset by the runner. */
  readonly since?: number;
  /** Positive message server ID used as the update cursor. */
  readonly after?: number;
}

export interface ChannelReactionRequest {
  /** Reaction text, limited to 32 characters by the public contract. Empty removes a reaction. */
  readonly reaction: string;
}

export interface ChannelLiveUpdates {
  readonly durationSeconds: number;
}

export interface DeletedChannel {
  readonly status: "DELETED";
}

export type ChannelActionStatus =
  "FOLLOWED" | "UNFOLLOWED" | "MUTED" | "UNMUTED" | "VIEWED" | "UPDATED";

export interface ChannelActionResult<
  Status extends ChannelActionStatus = ChannelActionStatus,
> {
  readonly status: Status;
}

export type ListChannelsResponse = SuccessEnvelope<readonly Channel[]>;
export type CreateChannelResponse =
  SuccessEnvelope<Channel> | SuccessEnvelope<AsyncAcceptedData>;
export type GetChannelResponse = SuccessEnvelope<Channel>;
export type DeleteChannelResponse =
  SuccessEnvelope<DeletedChannel> | SuccessEnvelope<AsyncAcceptedData>;
export type ListChannelMessagesResponse = SuccessEnvelope<
  readonly ChannelMessage[]
>;
export type ListChannelMessageUpdatesResponse = ListChannelMessagesResponse;
export type ChannelLiveUpdatesResponse =
  SuccessEnvelope<ChannelLiveUpdates> | SuccessEnvelope<AsyncAcceptedData>;
export type ChannelActionResponse<Status extends ChannelActionStatus> =
  | SuccessResponse
  | SuccessEnvelope<ChannelActionResult<Status>>
  | SuccessEnvelope<AsyncAcceptedData>;
export type MarkChannelMessageViewedResponse = ChannelActionResponse<"VIEWED">;
export type ReactToChannelMessageResponse = ChannelActionResponse<"UPDATED">;
export type FollowChannelResponse = ChannelActionResponse<"FOLLOWED">;
export type UnfollowChannelResponse = ChannelActionResponse<"UNFOLLOWED">;
export type MuteChannelResponse = ChannelActionResponse<"MUTED">;
export type UnmuteChannelResponse = ChannelActionResponse<"UNMUTED">;

export interface Label {
  readonly id: string;
  readonly name: string;
  readonly color: number;
  readonly orderIndex?: number;
  readonly chatCount?: number;
  readonly observedAt?: string;
}

export type LabelObservationStatus =
  "disabled" | "unknown" | "partial" | "fresh";

export type LabelUnknownReason =
  "observation_disabled" | "not_retained" | "not_observed" | "expired";

export interface LabelCollection {
  readonly policy: LabelObservationMode;
  readonly status: LabelObservationStatus;
  readonly unknownReason?: LabelUnknownReason;
  readonly observedAt?: string;
  readonly expiresAt?: string;
  readonly labels: readonly Label[];
}

export type LabelReadData = readonly Label[] | LabelCollection;

export interface ListLabelsParams {
  readonly includeObservation?: boolean;
}

export interface CreateLabelRequest {
  readonly name: string;
  readonly color?: number;
}

export type UpdateLabelRequest =
  | { readonly name: string; readonly color?: number }
  | { readonly name?: string; readonly color: number };

export interface ReplaceChatLabelsRequest {
  readonly labels: readonly string[];
}

export type ListLabelsResponse = SuccessEnvelope<LabelReadData>;
export type GetChatLabelsResponse = SuccessEnvelope<LabelReadData>;
export type CreateLabelResponse = SuccessEnvelope<Label>;

export interface ProjectObservationPolicy {
  readonly projectId: string;
  readonly presenceMode: ObservationMode;
  readonly typingMode: ObservationMode;
  readonly labelMode: LabelObservationMode;
  readonly quickReplyMode?: ObservationMode;
}

export interface SessionObservationPolicyValues {
  readonly presenceMode: ObservationMode;
  readonly typingMode: ObservationMode;
  readonly labelMode: LabelObservationMode;
  readonly quickReplyMode?: ObservationMode;
}

export interface SessionObservationPolicyOverrides {
  readonly presenceMode: SessionObservationMode;
  readonly typingMode: SessionObservationMode;
  readonly labelMode: SessionLabelObservationMode;
  readonly quickReplyMode?: SessionObservationMode;
}

export interface SessionObservationPolicy {
  readonly sessionName: string;
  readonly projectId: string;
  readonly project: SessionObservationPolicyValues;
  readonly override: SessionObservationPolicyOverrides;
  readonly effective: SessionObservationPolicyValues;
}

export interface UpdateProjectObservationPolicyRequest {
  readonly presenceMode: ObservationMode;
  readonly typingMode: ObservationMode;
  readonly labelMode?: LabelObservationMode;
}

export interface UpdateSessionObservationPolicyRequest {
  readonly presenceMode: SessionObservationMode;
  readonly typingMode: SessionObservationMode;
  readonly labelMode?: SessionLabelObservationMode;
}

export type GetProjectObservationPolicyResponse =
  SuccessEnvelope<ProjectObservationPolicy>;
export type UpdateProjectObservationPolicyResponse =
  SuccessEnvelope<ProjectObservationPolicy>;
export type GetSessionObservationPolicyResponse =
  SuccessEnvelope<SessionObservationPolicy>;
export type UpdateSessionObservationPolicyResponse =
  SuccessEnvelope<SessionObservationPolicy>;

export interface BusinessQuickReplyMutation {
  readonly shortcut: string;
  readonly message: string;
  readonly keywords?: readonly string[];
  readonly count?: number;
}

export interface BusinessQuickReply extends BusinessQuickReplyMutation {
  readonly id: string;
}

export interface BusinessQuickReplyObserved extends BusinessQuickReply {
  readonly associatedLabelIds: readonly string[];
  readonly observedAt: string;
}

export type QuickReplyObservationStatus =
  "disabled" | "unknown" | "partial" | "fresh";

export type QuickReplyUnknownReason =
  "observation_disabled" | "not_retained" | "not_observed";

export interface BusinessQuickReplyCollection {
  readonly policy: ObservationMode;
  readonly status: QuickReplyObservationStatus;
  readonly unknownReason?: QuickReplyUnknownReason;
  readonly observedAt?: string;
  readonly quickReplies: readonly BusinessQuickReplyObserved[];
}

export interface DeletedBusinessQuickReply {
  readonly id: string;
  readonly status: "DELETED";
}

export type CreateBusinessQuickReplyResponse =
  SuccessEnvelope<BusinessQuickReply>;
export type SetBusinessQuickReplyResponse = SuccessEnvelope<BusinessQuickReply>;
export type ReplaceBusinessQuickReplyResponse = SetBusinessQuickReplyResponse;
export type DeleteBusinessQuickReplyResponse =
  SuccessEnvelope<DeletedBusinessQuickReply>;
export type ListBusinessQuickRepliesResponse =
  SuccessEnvelope<BusinessQuickReplyCollection>;

export interface GroupParticipant {
  readonly lid: string;
  readonly phoneNumber?: string;
  readonly isAdmin: boolean;
  readonly isSuperAdmin: boolean;
  readonly id?: string;
  readonly username?: string;
}

export interface Group {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly ownerLid: string;
  readonly createdAt: number;
  readonly participants: readonly GroupParticipant[];
  readonly ownerId?: string;
}

export interface GroupInviteInfo {
  readonly id: string;
  readonly subject: string;
  readonly creatorLid: string;
  readonly createdAt: number;
  readonly size: number;
  readonly participants: readonly GroupParticipant[];
  readonly creatorId?: string;
}

export interface GroupInviteCode {
  readonly code: string;
}

export interface CreateGroupRequest {
  readonly name: string;
  readonly participants: readonly string[];
}

export interface SetGroupFieldRequest {
  readonly value: string;
}

export interface GroupParticipantsRequest {
  readonly participants: readonly string[];
}

export interface SetGroupPictureRequest {
  readonly url?: string;
  readonly base64?: string;
}

export interface JoinGroupRequest {
  readonly code: string;
}

export interface GroupAdminOnlySettingRequest {
  readonly adminsOnly: boolean;
}

export type GroupMemberAddMode = "admin_add" | "all_member_add";

export interface GroupMemberAddModeRequest {
  readonly mode: GroupMemberAddMode;
}

export interface GroupJoinApprovalRequest {
  readonly required: boolean;
}

export type ListGroupsResponse = SuccessEnvelope<readonly Group[]>;
export type CreateGroupResponse = SuccessEnvelope<Group>;
export type GetGroupResponse = SuccessEnvelope<Group>;
export type GetGroupJoinInfoResponse = SuccessEnvelope<GroupInviteInfo>;
export type GetGroupInviteCodeResponse = SuccessEnvelope<GroupInviteCode>;
export type RevokeGroupInviteCodeResponse = SuccessEnvelope<GroupInviteCode>;
export type GetGroupParticipantsResponse = SuccessEnvelope<
  readonly GroupParticipant[]
>;

export interface EditMessageRequest {
  readonly text: string;
}

export type DisappearingTimerDuration = 0 | 86400 | 604800 | 7776000;

export interface DisappearingTimerRequest {
  readonly durationSeconds: DisappearingTimerDuration;
}

export interface QRCodeData {
  readonly qr?: string;
  readonly event?: string;
}

export interface PairCodeRequest {
  readonly phone: string;
}

export interface PairCodeData {
  readonly code: string;
}

export type GetQRCodeResponse = SuccessEnvelope<QRCodeData>;
export type RequestPairCodeResponse = SuccessEnvelope<PairCodeData>;

export type OperationStatus =
  | "pending"
  | "running"
  | "action_required"
  | "succeeded"
  | "failed"
  | "cancelled";

export interface Operation {
  readonly id: string;
  readonly kind: string;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly projectId: string | null;
  readonly status: OperationStatus;
  readonly progressCode: string | null;
  readonly failureCode: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly completedAt: string | null;
}

export type GetOperationResponse = SuccessEnvelope<Operation>;

export interface MintClientTokenRequest {
  readonly session: string;
  readonly ephemeralId: string;
  readonly ttlSeconds?: number;
}

export interface ClientTokenValue {
  readonly token: string;
  readonly expiresAt: string;
}

export type MintClientTokenResponse = SuccessEnvelope<ClientTokenValue>;

export interface ClientRuleRateLimits {
  readonly perMinute?: number;
  readonly perDay?: number;
}

export interface ClientRules {
  readonly actions: readonly string[];
  readonly recipientMode: string;
  readonly verifiedJids?: readonly string[];
  readonly rateLimits?: ClientRuleRateLimits;
}

export type GetClientRulesResponse = SuccessEnvelope<ClientRules>;

export interface SetClientRulesRequest {
  readonly recipientMode: string;
  readonly allowedActions?: string;
  readonly rateLimit?: number;
  readonly maxDaily?: number;
  readonly allowedOrigins?: string;
  readonly enabled: boolean;
}

export type ListSessionsResponse = SuccessEnvelope<readonly Session[]>;
export type CreateSessionResponse = SuccessEnvelope<SessionOperation>;
export type GetSessionResponse = SuccessEnvelope<Session>;
export type UpdateSessionResponse = SuccessEnvelope<Session>;
export type GetSessionAccountResponse = SuccessEnvelope<WhatsAppAccount>;

export type MessageKind =
  | "text"
  | "image"
  | "file"
  | "voice"
  | "video"
  | "poll"
  | "location"
  | "contact"
  | "request_phone_number"
  | "product"
  | "product_list"
  | "order"
  | "list"
  | "buttons"
  | "address_message"
  | "flow";

export interface QuotedMessage {
  readonly messageId: string;
  readonly participant: string;
  readonly type?: string;
  readonly text?: string;
}

export interface MessageTemplateSend {
  readonly name: string;
  readonly language: string;
  readonly components?: readonly unknown[];
}

export type ProductMessageMedia =
  | {
      readonly url: string;
      readonly base64?: never;
      readonly mimeType?: string;
    }
  | {
      readonly url?: never;
      readonly base64: string;
      readonly mimeType?: string;
    };

export interface ProductMessageContent {
  readonly businessOwnerJid: string;
  readonly id: string;
  readonly title: string;
  readonly description?: string;
  readonly currencyCode: string;
  readonly priceAmount1000: number;
  readonly salePriceAmount1000?: number;
  readonly retailerId?: string;
  readonly url?: string;
  readonly imageCount?: number;
  readonly image?: ProductMessageMedia;
  readonly body?: string;
  readonly footer?: string;
}

export interface ProductListMessageSection {
  readonly title?: string;
  readonly productIds: readonly string[];
}

export interface ProductListMessageContent {
  readonly businessOwnerJid: string;
  readonly title: string;
  readonly description?: string;
  readonly buttonText: string;
  readonly footer?: string;
  readonly sections: readonly ProductListMessageSection[];
}

export type OrderMessageStatus = "inquiry" | "accepted" | "declined";

export interface OrderMessageContent {
  readonly id: string;
  readonly thumbnailBase64?: string;
  readonly itemCount: number;
  readonly status: OrderMessageStatus;
  readonly message?: string;
  readonly title?: string;
  readonly sellerJid: string;
  readonly token?: string;
  readonly totalAmount1000: number;
  readonly totalCurrencyCode: string;
  readonly catalogType?: string;
}

export interface ListMessageRow {
  readonly id: string;
  readonly title: string;
  readonly description?: string;
}

export interface ListMessageSection {
  readonly title?: string;
  readonly rows: readonly ListMessageRow[];
}

export interface ListMessageContent {
  readonly title: string;
  readonly description?: string;
  readonly buttonText: string;
  readonly footer?: string;
  readonly sections: readonly ListMessageSection[];
}

export type MessageButton =
  | {
      readonly type: "url";
      readonly text: string;
      readonly url: string;
    }
  | {
      readonly type: "call";
      readonly text: string;
      readonly phoneNumber: string;
    }
  | {
      readonly type: "reply";
      readonly text: string;
      readonly id: string;
    }
  | {
      readonly type: "copy";
      readonly text: string;
      readonly copyCode: string;
    }
  | {
      readonly type: "catalog";
      readonly text: string;
      readonly businessPhoneNumber: string;
      readonly catalogProductId?: string;
    };

export interface ButtonsMessageContent {
  readonly title?: string;
  readonly body: string;
  readonly footer?: string;
  readonly buttons: readonly MessageButton[];
}

export interface AddressMessageContent {
  readonly body: string;
  readonly buttonText?: string;
  readonly footer?: string;
  readonly country?: string;
}

export interface FlowNavigateMessageContent {
  readonly body: string;
  readonly buttonText: string;
  readonly footer?: string;
  readonly id: string;
  readonly token: string;
  readonly action: "navigate";
  readonly screen: string;
  readonly dataJson?: string;
}

export interface FlowDataExchangeMessageContent {
  readonly body: string;
  readonly buttonText: string;
  readonly footer?: string;
  readonly id: string;
  readonly token: string;
  readonly action: "data_exchange";
  readonly screen?: never;
  readonly dataJson?: never;
}

export type FlowMessageContent =
  FlowNavigateMessageContent | FlowDataExchangeMessageContent;

export interface MessageSendContext {
  readonly chatId: string;
  readonly isForwarded?: boolean;
  readonly mentions?: readonly string[];
  readonly quotedMessage?: QuotedMessage;
}

export interface SendTextMessageRequest extends MessageSendContext {
  readonly type: "text";
  readonly text?: string;
}

export type MediaMessageKind = "image" | "file" | "voice" | "video";

export interface SendMediaMessageRequest extends MessageSendContext {
  readonly type: MediaMessageKind;
  readonly url?: string;
  readonly base64?: string;
  readonly mimeType?: string;
  readonly filename?: string;
  readonly caption?: string;
  readonly ptt?: boolean;
}

export interface SendPollMessageRequest extends MessageSendContext {
  readonly type: "poll";
  readonly pollTitle?: string;
  readonly pollOptions?: readonly string[];
  readonly pollMultiSelect?: boolean;
}

export interface SendLocationMessageRequest extends MessageSendContext {
  readonly type: "location";
  readonly latitude?: number;
  readonly longitude?: number;
  readonly address?: string;
}

export interface SendContactMessageRequest extends MessageSendContext {
  readonly type: "contact";
  readonly vcard?: string;
}

export interface SendPhoneNumberRequest extends MessageSendContext {
  readonly type: "request_phone_number";
}

export interface SendProductMessageRequest extends MessageSendContext {
  readonly type: "product";
  readonly product: ProductMessageContent;
}

export interface SendProductListMessageRequest extends MessageSendContext {
  readonly type: "product_list";
  readonly productList: ProductListMessageContent;
}

export interface SendOrderMessageRequest extends MessageSendContext {
  readonly type: "order";
  readonly order: OrderMessageContent;
}

export interface SendListMessageRequest extends MessageSendContext {
  readonly type: "list";
  readonly list: ListMessageContent;
}

export interface SendButtonsMessageRequest extends MessageSendContext {
  readonly type: "buttons";
  readonly buttons: ButtonsMessageContent;
}

export interface SendAddressMessageRequest extends MessageSendContext {
  readonly type: "address_message";
  readonly addressMessage: AddressMessageContent;
}

export interface SendFlowMessageRequest extends MessageSendContext {
  readonly type: "flow";
  readonly flow: FlowMessageContent;
}

export interface SendTemplateMessageRequest extends MessageSendContext {
  readonly type: MessageKind;
  readonly template: MessageTemplateSend;
}

export type SendMessageRequest =
  | SendTextMessageRequest
  | SendMediaMessageRequest
  | SendPollMessageRequest
  | SendLocationMessageRequest
  | SendContactMessageRequest
  | SendPhoneNumberRequest
  | SendProductMessageRequest
  | SendProductListMessageRequest
  | SendOrderMessageRequest
  | SendListMessageRequest
  | SendButtonsMessageRequest
  | SendAddressMessageRequest
  | SendFlowMessageRequest
  | SendTemplateMessageRequest;

export interface MessageResponse {
  readonly id: string;
  readonly timestamp: string;
  readonly status: string;
  readonly mediaId?: string;
  readonly senderLid: string;
  readonly senderPhoneNumber?: string;
  readonly fromLid: string;
  readonly fromPhoneNumber?: string;
}

export type SendMessageResponse = SuccessEnvelope<MessageResponse>;
export type SendReactionResponse = SuccessEnvelope<MessageResponse>;
export type StarMessageResponse = SuccessEnvelope<MessageResponse>;

export interface SeenRequest {
  readonly chatId: string;
  readonly messageId: string;
}

export interface TypingRequest {
  readonly chatId: string;
  readonly state: "typing" | "recording" | "paused";
}

export interface ReactRequest {
  readonly chatId: string;
  readonly messageId: string;
  readonly reaction: string;
}

export interface StarRequest {
  readonly chatId: string;
  readonly messageId: string;
  readonly star: boolean;
  readonly fromMe?: boolean;
  readonly sender?: string;
}

export interface WebhookRetryConfig {
  readonly attempts: number;
  readonly delaySeconds: number;
  readonly policy: "linear" | "exponential" | "constant" | string;
}

export interface WebhookHeader {
  readonly name: string;
  readonly value: string;
}

export interface Webhook {
  readonly id: string;
  readonly tenantId: string;
  readonly session?: string;
  readonly url: string;
  readonly events: readonly string[];
  readonly retries: WebhookRetryConfig;
  readonly headers: readonly WebhookHeader[];
  readonly enabled: boolean;
  readonly format?: "native" | "meta";
  readonly createdAt: string;
}

export interface CreateWebhookRequest {
  readonly session?: string;
  readonly url: string;
  readonly events?: readonly string[];
  readonly hmacKey?: string;
  readonly retries?: WebhookRetryConfig;
  readonly headers?: readonly WebhookHeader[];
  readonly format?: "native" | "meta";
}

export interface UpdateWebhookRequest {
  readonly url?: string;
  readonly events?: readonly string[];
  readonly hmacKey?: string;
  readonly retries?: WebhookRetryConfig;
  readonly headers?: readonly WebhookHeader[];
  readonly enabled?: boolean;
  readonly format?: "native" | "meta";
}

export type ListWebhooksResponse = SuccessEnvelope<readonly Webhook[]>;
export type CreateWebhookResponse = SuccessEnvelope<Webhook>;
export type GetWebhookResponse = SuccessEnvelope<Webhook>;
export type UpdateWebhookResponse = SuccessEnvelope<Webhook>;

export type TemplateSurface = "cloud" | "whatsmeow" | "sandbox";
export type TemplateCategory = "MARKETING" | "UTILITY" | "AUTHENTICATION";
export type TemplateKind =
  "standard" | "carousel" | "authentication" | "limited_time_offer";
export type TemplateVariableType = "text" | "number" | "currency" | "date_time";

export interface TemplateVariable {
  readonly name: string;
  readonly type: TemplateVariableType;
  readonly example: string;
}

export type TemplateHeader =
  | { readonly format: "none" }
  | { readonly format: "text"; readonly text: string }
  | {
      readonly format: "image" | "video" | "document";
      readonly example?: string;
      readonly filename?: string;
    }
  | {
      readonly format: "location";
      readonly example?: {
        readonly latitude: number;
        readonly longitude: number;
        readonly name?: string;
        readonly address?: string;
      };
    };

export type TemplateButton =
  | { readonly type: "quick_reply"; readonly text: string }
  | {
      readonly type: "url";
      readonly text: string;
      readonly url: string;
    }
  | {
      readonly type: "phone";
      readonly text: string;
      readonly phone: string;
    }
  | {
      readonly type: "copy_code";
      readonly text?: string;
      readonly example?: string;
    };

export interface TemplateCarouselCard {
  readonly header: Extract<
    TemplateHeader,
    { readonly format: "image" | "video" | "document" }
  >;
  readonly body: string;
  readonly buttons?: readonly TemplateButton[];
}

export interface TemplateDefinition {
  readonly version: 1;
  readonly kind: TemplateKind;
  readonly category: TemplateCategory;
  readonly language: string;
  readonly header?: TemplateHeader;
  readonly body: string;
  readonly footer?: string;
  readonly buttons?: readonly TemplateButton[];
  readonly carousel?: { readonly cards: readonly TemplateCarouselCard[] };
  readonly authentication?: {
    readonly otpType: "copy_code" | "one_tap";
    readonly codeExample?: string;
    readonly addSecurityRecommendation?: boolean;
    readonly codeExpirationMinutes?: number;
  };
  readonly limitedTimeOffer?: {
    readonly text: string;
    readonly hasExpiration: boolean;
  };
  readonly variables: readonly TemplateVariable[];
}

export interface ProjectTemplate {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  readonly language: string;
  readonly status: string;
  readonly kind: string;
  readonly definition?: TemplateDefinition | null;
  readonly sampleValues?: Readonly<Record<string, string>> | null;
  readonly cloudLinks: readonly unknown[];
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface CreateProjectTemplateRequest {
  readonly name: string;
  readonly definition: TemplateDefinition;
  readonly sampleValues?: Readonly<Record<string, string>>;
}

export interface UpdateProjectTemplateRequest {
  readonly name?: string;
  readonly status?: string;
  readonly definition?: TemplateDefinition;
  readonly sampleValues?: Readonly<Record<string, string>>;
}

export interface PreviewProjectTemplateRequest {
  readonly values?: Readonly<Record<string, string>>;
  readonly surface?: TemplateSurface;
}

export interface SubmitProjectTemplateRequest {
  readonly session: string;
}

export type ListProjectTemplatesResponse = SuccessEnvelope<
  readonly ProjectTemplate[]
>;
export type ProjectTemplateResponse = SuccessEnvelope<ProjectTemplate>;
export type ProjectTemplateOperationResponse = SuccessEnvelope<
  Readonly<Record<string, unknown>>
>;
