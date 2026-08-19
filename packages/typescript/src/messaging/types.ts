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
  readonly id: string;
  readonly chatId?: string;
  readonly sender?: string;
}

export interface MessageTemplateSend {
  readonly name: string;
  readonly language: string;
  readonly components?: readonly unknown[];
}

export interface SendMessageRequest {
  readonly chatId: string;
  readonly type?: MessageKind;
  readonly text?: string;
  readonly url?: string;
  readonly base64?: string;
  readonly mimeType?: string;
  readonly filename?: string;
  readonly caption?: string;
  readonly ptt?: boolean;
  readonly pollTitle?: string;
  readonly pollOptions?: readonly string[];
  readonly pollMultiSelect?: boolean;
  readonly latitude?: number;
  readonly longitude?: number;
  readonly address?: string;
  readonly vcard?: string;
  readonly isForwarded?: boolean;
  readonly mentions?: readonly string[];
  readonly quotedMessage?: QuotedMessage;
  readonly template?: MessageTemplateSend;
  readonly product?: Readonly<Record<string, unknown>>;
  readonly productList?: Readonly<Record<string, unknown>>;
  readonly order?: Readonly<Record<string, unknown>>;
  readonly list?: Readonly<Record<string, unknown>>;
  readonly buttons?: Readonly<Record<string, unknown>>;
  readonly addressMessage?: Readonly<Record<string, unknown>>;
  readonly flow?: Readonly<Record<string, unknown>>;
}

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
