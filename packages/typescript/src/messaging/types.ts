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
