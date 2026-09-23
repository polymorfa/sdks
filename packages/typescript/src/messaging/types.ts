/** Exact observed provider references; at least one provider is known. */
export type WhatsAppMessageIds =
  | { readonly linked_devices: string; readonly official_api?: string }
  | { readonly linked_devices?: string; readonly official_api: string };

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
  readonly sessionId: string;
  readonly name: string;
  readonly externalId?: string;
  readonly tenantId: string;
  readonly type: MessagingConnection;
  readonly testMode: boolean;
  readonly status: string;
  readonly statusReason?: string;
  readonly configuration?: import("./session-configuration.js").SessionConfigurationView;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface UpdateSessionRequest {
  readonly configuration: import("./session-configuration.js").SessionConfigurationPatch;
  readonly revision: number;
}

export interface SessionOperation extends Session {
  readonly operationId?: string;
}

export interface OperationAccepted {
  readonly success: true;
  readonly message: string;
  readonly operationId: string;
}

/** Where the account's primary WhatsApp client runs. `meta_cloud` means Meta hosts the number. */
export type PhonePlatform = "android" | "ios" | "meta_cloud" | "unknown";

/**
 * `whatsapp_app` and `business_app` connect as linked devices. `meta_cloud` is
 * Meta Cloud API. `meta_coexistence` is Cloud API with the WhatsApp Business
 * app still active on the phone.
 */
export type WhatsAppAccountType =
  "whatsapp_app" | "business_app" | "meta_cloud" | "meta_coexistence";

export interface WhatsAppAccount {
  readonly id?: string;
  readonly bsuid?: string;
  readonly username?: string;
  readonly phoneNumber?: string;
  readonly pushName: string;
  readonly businessName?: string;
  readonly phonePlatform?: PhonePlatform;
  readonly accountType?: WhatsAppAccountType;
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

/** Project-scoped campaign summary returned by the Messaging API. */
export interface Campaign {
  readonly id: string;
  readonly name: string;
  /** The pinned contract deliberately leaves campaign states forward-compatible. */
  readonly status: string;
  readonly templateId: string | null;
  readonly recipientListId: string | null;
  readonly recipientCount: number;
  readonly sentCount: number;
  readonly deliveredCount: number;
  readonly readCount: number;
  readonly failedCount: number;
  readonly skippedCount: number;
  /** Epoch milliseconds, or null when the lifecycle timestamp is absent. */
  readonly scheduledAt: number | null;
  readonly launchedAt: number | null;
  readonly completedAt: number | null;
  readonly createdAt: number;
  readonly updatedAt: number;
  /** Additional live repository fields omitted from the pinned OpenAPI schema. */
  readonly composerBlueprint?: unknown;
  readonly messages?: unknown;
  readonly audienceRef?: unknown;
  readonly senderConfig?: unknown;
  readonly complianceConfig?: unknown;
  readonly variants?: unknown;
  readonly variantStrategy?: unknown;
}

export interface CampaignAnalytics {
  readonly campaignId: string;
  readonly recipientCount: number;
  readonly sentCount: number;
  readonly deliveredCount: number;
  readonly readCount: number;
  readonly failedCount: number;
  readonly skippedCount: number;
  readonly respondedCount: number;
  readonly responseRate: number;
}

export interface CreateCampaignRequest {
  readonly name: string;
  readonly templateId?: string;
  readonly recipientListId?: string;
  readonly senderConfig?: Readonly<Record<string, unknown>>;
  /** Epoch milliseconds. */
  readonly scheduledAt?: number;
  /**
   * Up to 1,000 recipients to queue with the draft. Invalid entries reject the
   * whole request; use `campaigns.addRecipients` for partial acceptance.
   */
  readonly recipients?: readonly CampaignRecipientInput[];
}

export type CampaignRecipientStatus =
  "queued" | "sending" | "sent" | "delivered" | "read" | "failed" | "skipped";

export type InvalidRecipientReason =
  "missing_phone" | "invalid_phone" | "invalid_variables" | "invalid_entry";

/** One rejected entry, reported without aborting an append. */
export interface InvalidRecipientRow {
  /** 1-based position in the request, or the spreadsheet row for a file import. */
  readonly row: number;
  readonly reason: InvalidRecipientReason;
}

export type CampaignRecipientVariables = Readonly<
  Record<string, string | number | boolean>
>;

export interface CampaignRecipientInput {
  /** International format. Separators are ignored and a leading `00` reads as `+`. */
  readonly phone: string;
  /** At most 50 template variables, stored as strings of at most 1,024 characters. */
  readonly variables?: CampaignRecipientVariables;
}

/** One queued or settled recipient of a campaign. */
export interface CampaignRecipient {
  readonly id: string;
  readonly phone: string;
  readonly variables: Readonly<Record<string, unknown>>;
  readonly variantKey: string | null;
  readonly status: CampaignRecipientStatus;
  readonly attempts: number;
  /** `opted_out` means the phone is on the organization's opt-out list. */
  readonly lastError: string | null;
  readonly externalMessageId: string | null;
  /** Epoch milliseconds, or null while the transition has not happened. */
  readonly queuedAt: number;
  readonly sentAt: number | null;
  readonly deliveredAt: number | null;
  readonly readAt: number | null;
  readonly failedAt: number | null;
  readonly respondedAt: number | null;
}

export interface CampaignRecipientPage {
  readonly nextCursor: string | null;
  readonly hasMore: boolean;
}

export interface ListCampaignRecipientsParams {
  readonly status?: CampaignRecipientStatus;
  readonly cursor?: string;
  /** 1 to 100; the API defaults to 25. */
  readonly limit?: number;
}

export interface AddCampaignRecipientsRequest {
  readonly recipients: readonly CampaignRecipientInput[];
}

export interface AddCampaignRecipientsResult {
  readonly campaignId: string;
  readonly added: number;
  /** Recipients on the campaign after the append. */
  readonly recipientCount: number;
  /** Valid entries skipped as repeated in the request or already on the campaign. */
  readonly duplicateCount: number;
  readonly invalidCount: number;
  /** At most 20 rejected entries. */
  readonly invalidRows: readonly InvalidRecipientRow[];
}

/**
 * Stop answers with a null `operationId` when the campaign had no active
 * delivery run: it was cancelled immediately and no remaining recipient is sent.
 */
export interface CampaignStopOperation extends Campaign {
  readonly operationId: string | null;
}

export interface LaunchCampaignRequest {
  /** Epoch milliseconds. */
  readonly scheduledAt?: number;
}

export interface RequeueCampaignRequest {
  readonly includeSkippedError?: boolean;
}

export interface CampaignOperation extends Campaign {
  /** Durable lifecycle operation that can be read through `operations.retrieve`. */
  readonly operationId: string;
}

export interface CampaignRequeueResult {
  readonly requeued: number;
}

export type ListCampaignsResponse = SuccessEnvelope<readonly Campaign[]>;
export type GetCampaignResponse = SuccessEnvelope<Campaign>;
export type CreateCampaignResponse = SuccessEnvelope<Campaign>;
export type CampaignAnalyticsResponse = SuccessEnvelope<CampaignAnalytics>;
export type CampaignOperationResponse = SuccessEnvelope<CampaignOperation>;
export type CampaignRequeueResponse = SuccessEnvelope<CampaignRequeueResult>;
export type CampaignStopResponse = SuccessEnvelope<CampaignStopOperation>;
export type AddCampaignRecipientsResponse =
  SuccessEnvelope<AddCampaignRecipientsResult>;

export interface ListCampaignRecipientsResponse {
  readonly success: true;
  readonly data: readonly CampaignRecipient[];
  readonly page: CampaignRecipientPage;
}

export interface RejectCallRequest {
  /** JID of the incoming caller. */
  readonly from: string;
}

export interface RejectCallResult {
  readonly status: "REJECTED";
}

/**
 * OpenAPI declares SuccessResponse, while the live RPC returns a data envelope
 * and also supports Prefer: respond-async for a request ID.
 */
export type RejectCallResponse =
  | SuccessResponse
  | SuccessEnvelope<RejectCallResult>
  | SuccessEnvelope<AsyncAcceptedData>;

export type ResolveIdentityParams =
  | {
      /** Phone number containing digits with an optional leading plus sign. */
      readonly phoneNumber: string;
      readonly id?: never;
      readonly username?: never;
      readonly usernameKey?: never;
    }
  | {
      /** Opaque Polymorfa user ID. */
      readonly id: string;
      readonly phoneNumber?: never;
      readonly username?: never;
      readonly usernameKey?: never;
    }
  | {
      /** WhatsApp username containing 3 through 35 characters. */
      readonly username: string;
      /** Optional four-digit key requested by WhatsApp for this username. */
      readonly usernameKey?: string;
      readonly phoneNumber?: never;
      readonly id?: never;
    };

export interface ResolveIdentityResult {
  readonly id?: string;
  readonly bsuid?: string;
  readonly phoneNumber?: string;
  readonly username?: string;
  readonly keyRequired?: boolean;
}

export type ResolveIdentityResponse = SuccessEnvelope<ResolveIdentityResult>;

export interface UserSecurityCode {
  /** Opaque Polymorfa user ID. */
  readonly id: string;
  readonly phoneNumber?: string;
  readonly username?: string;
  /** The 60-digit identity verification code. */
  readonly numericCode: string;
  /** Base64-encoded display QR; the private verification payload is excluded. */
  readonly qrCode: string;
}

export type GetUserSecurityCodeResponse = SuccessEnvelope<UserSecurityCode>;

export interface Contact {
  readonly bsuid?: string;
  readonly phoneNumber?: string;
  readonly name: string;
  readonly pushName: string;
  readonly businessName?: string;
  readonly profileUrl?: string;
  readonly id: string;
  readonly username?: string;
}

export interface CheckContactResult {
  readonly exists: boolean;
  readonly bsuid?: string;
  readonly phoneNumber?: string;
  readonly id?: string;
  readonly username?: string;
}

export interface ContactBlocklist {
  readonly hash: string;
  readonly contacts: readonly ConversationIdentity[];
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

export interface BusinessProfile extends ConversationIdentity {
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

export type BusinessProfileDay =
  | {
      readonly dayOfWeek: "sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat";
      readonly mode: "specific_hours";
      /** Minutes after midnight, from 0 through 1439. */
      readonly openTime: number;
      /** Minutes after midnight, from 0 through 1439 and distinct from openTime. */
      readonly closeTime: number;
    }
  | {
      readonly dayOfWeek: "sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat";
      readonly mode: "open_24h" | "appointment_only";
      readonly openTime?: never;
      readonly closeTime?: never;
    };

export interface BusinessProfileHoursUpdate {
  readonly timeZone: string;
  readonly days: readonly BusinessProfileDay[];
}

export interface BusinessProfileUpdateRequest {
  readonly address?: string;
  readonly email?: string;
  readonly description?: string;
  readonly websites?: readonly string[];
  readonly hours?: BusinessProfileHoursUpdate;
}

export type BusinessCoverPhotoRequest =
  | { readonly url: string; readonly base64?: never }
  | { readonly url?: never; readonly base64: string };

export interface BusinessProfileStatus {
  readonly status: string;
}

export interface BusinessCoverPhotoResult {
  readonly coverPhotoId: string;
}

export interface BusinessActionSuccess {
  readonly success: true;
}

export interface BusinessCatalogParams {
  /** Polymorfa business user ID. */
  readonly id: string;
  /** Opaque cursor returned as `next` by the preceding page. */
  readonly after?: string;
  /** Product limit from 1 through 100. */
  readonly limit?: number;
  /** Requested image width from 1 through 1024. */
  readonly width?: number;
  /** Requested image height from 1 through 1024. */
  readonly height?: number;
}

export interface BusinessProductParams {
  /** Polymorfa business user ID. */
  readonly id: string;
}

export interface BusinessCollectionsParams {
  /** Polymorfa business user ID. */
  readonly id: string;
  /** Opaque cursor returned as `next` by the preceding page. */
  readonly after?: string;
  /** Collection limit from 1 through 20. */
  readonly collectionLimit?: number;
  /** Product limit per collection from 1 through 100. */
  readonly itemLimit?: number;
  /** Requested image width from 1 through 1024. */
  readonly width?: number;
  /** Requested image height from 1 through 1024. */
  readonly height?: number;
}

export interface BusinessCollectionParams {
  /** Polymorfa business user ID. */
  readonly id: string;
  /** Opaque product cursor returned by the upstream collection page. */
  readonly after?: string;
  /** Product limit from 1 through 100. */
  readonly limit?: number;
  /** Requested image width from 1 through 1024. */
  readonly width?: number;
  /** Requested image height from 1 through 1024. */
  readonly height?: number;
}

export type BusinessProductImageSource =
  | {
      /** HTTPS source fetched through the API's bounded, SSRF-safe downloader. */
      readonly url: string;
      readonly base64?: never;
      readonly mediaUrl?: never;
    }
  | {
      /** Base64 image data representing at most 16 MiB after decoding. */
      readonly url?: never;
      readonly base64: string;
      readonly mediaUrl?: never;
    }
  | {
      readonly url?: never;
      readonly base64?: never;
      /** Existing HTTPS WhatsApp or Meta media URL reused without downloading. */
      readonly mediaUrl: string;
    };

export interface BusinessProductImporterAddress {
  readonly street1?: string;
  readonly street2?: string;
  readonly city?: string;
  readonly region?: string;
  readonly postalCode?: string;
  readonly countryCode?: string;
}

export interface BusinessProductCompliance {
  readonly countryCodeOrigin?: string;
  readonly importerName?: string;
  readonly importerAddress?: BusinessProductImporterAddress;
}

export interface BusinessProductMutationRequest {
  readonly name: string;
  readonly description?: string;
  readonly currency?: string;
  /** Integer amount in thousandths, represented as a decimal string. */
  readonly price?: string;
  /** Integer amount in thousandths, represented as a decimal string. */
  readonly salePrice?: string;
  readonly url?: string;
  readonly retailerId?: string;
  /** Omitted is interpreted as false by the pinned runner during replacement. */
  readonly hidden?: boolean;
  readonly images: readonly BusinessProductImageSource[];
  /** Existing HTTPS WhatsApp or Meta media URLs. */
  readonly videoUrls?: readonly string[];
  readonly complianceCategory?: string;
  readonly compliance?: BusinessProductCompliance;
  readonly width?: number;
  readonly height?: number;
}

export interface BusinessAddress {
  readonly street1?: string;
  readonly street2?: string;
  readonly city?: string;
  readonly region?: string;
  readonly postalCode?: string;
  readonly countryCode?: string;
}

export interface BusinessComplianceInfo {
  readonly countryCodeOrigin?: string;
  readonly importerName?: string;
  readonly importerAddress?: BusinessAddress;
}

export interface BusinessProductImage {
  readonly id: string;
  readonly originalUrl?: string;
  readonly requestUrl?: string;
}

export interface BusinessProductVideo {
  readonly id: string;
  readonly originalUrl?: string;
  readonly thumbnailUrl?: string;
}

export interface BusinessProductMedia {
  readonly images: readonly BusinessProductImage[];
  readonly videos: readonly BusinessProductVideo[];
}

export interface BusinessSalePrice {
  readonly price: string;
  readonly startDate?: string;
  readonly endDate?: string;
}

export interface BusinessProductStatus {
  readonly status?: string;
  readonly canAppeal: boolean;
}

export interface BusinessDimensions {
  readonly width?: number;
  readonly height?: number;
}

export interface BusinessVariantThumbnail {
  readonly id?: string;
  readonly originalUrl?: string;
  readonly requestUrl?: string;
  readonly originalDimensions: BusinessDimensions;
}

export interface BusinessVariantProperty {
  readonly name: string;
  readonly value: string;
}

export interface BusinessVariantAvailabilityItem {
  readonly productId?: string;
  readonly available: boolean;
  readonly options: readonly BusinessVariantProperty[];
}

export interface BusinessVariantAvailability {
  readonly listings: readonly BusinessVariantAvailabilityItem[];
}

export interface BusinessVariantListing {
  readonly description?: string;
  readonly lowestPrice?: string;
  readonly multiPrice?: string;
}

export interface BusinessVariantOption {
  readonly value: string;
  readonly thumbnail?: BusinessVariantThumbnail;
}

export interface BusinessVariantType {
  readonly name: string;
  readonly options: readonly BusinessVariantOption[];
}

export interface BusinessProductVariant {
  readonly availability: BusinessVariantAvailability;
  readonly listingDetails: BusinessVariantListing;
  readonly types: readonly BusinessVariantType[];
  readonly properties: readonly BusinessVariantProperty[];
}

export interface BusinessProduct {
  readonly id: string;
  readonly retailerId?: string;
  readonly belongsTo?: string;
  readonly name: string;
  readonly description?: string;
  readonly price: string;
  readonly currency: string;
  readonly url?: string;
  readonly shimmedUrl?: string;
  readonly hidden: boolean;
  readonly sanctioned: boolean;
  readonly maxAvailable?: number;
  readonly availability?: string;
  readonly complianceCategory?: string;
  readonly compliance?: BusinessComplianceInfo;
  readonly media: BusinessProductMedia;
  readonly salePrice?: BusinessSalePrice;
  readonly status: BusinessProductStatus;
  readonly variant?: BusinessProductVariant;
}

export interface BusinessCatalogPage {
  readonly next?: string;
  readonly previous?: string;
  readonly products: readonly BusinessProduct[];
}

export interface BusinessProductDeleteResult {
  readonly deletedCount: number;
}

export interface BusinessCartSettingRequest {
  readonly enabled: boolean;
}

export interface BusinessProductVisibilityRequest {
  readonly hidden: boolean;
}

export interface BusinessCatalogAppealRequest {
  readonly reason: string;
}

export interface BusinessCollectionStatus {
  readonly status?: string;
  readonly canAppeal: boolean;
  readonly commerceUrl?: string;
  readonly rejectReason?: string;
}

export interface BusinessCollection {
  readonly id: string;
  readonly name: string;
  readonly products: readonly BusinessProduct[];
  readonly status: BusinessCollectionStatus;
}

export interface BusinessCollectionPage {
  readonly next?: string;
  readonly collections: readonly BusinessCollection[];
}

export interface BusinessCollectionCreateRequest {
  readonly name: string;
  readonly productIds: readonly string[];
}

export interface BusinessCollectionUpdateRequest {
  readonly name?: string;
  readonly addProductIds?: readonly string[];
  readonly removeProductIds?: readonly string[];
}

export interface BusinessCollectionMutationResult {
  readonly id: string;
  readonly reviewStatus: string;
}

export interface BusinessCollectionMove {
  readonly collectionId: string;
  readonly fromIndex: number;
  readonly toIndex: number;
}

export interface BusinessCollectionReorderRequest {
  readonly moves: readonly BusinessCollectionMove[];
}

export interface BusinessOrderLookupRequest {
  readonly token: string;
}

export interface BusinessOrderPrice {
  readonly subtotal: string;
  readonly total: string;
  readonly currency: string;
  readonly priceStatus?: string;
}

export interface BusinessOrderProduct {
  readonly id: string;
  readonly imageId?: string;
  readonly imageUrl?: string;
  readonly price: string;
  readonly currency: string;
  readonly name: string;
  readonly quantity: number;
  readonly variantProperties?: string;
}

export interface BusinessOrder {
  readonly id: string;
  readonly createdAt: number;
  readonly catalogId?: string;
  readonly price: BusinessOrderPrice;
  readonly products: readonly BusinessOrderProduct[];
}

export type BusinessMerchantEntityType =
  | "SOLE_PROPRIETORSHIP"
  | "PARTNERSHIP"
  | "PRIVATE_COMPANY"
  | "PUBLIC_COMPANY"
  | "LIMITED_LIABILITY_PARTNERSHIP"
  | "OTHER";

export interface BusinessMerchantContact {
  readonly email: string;
  readonly landlineNumber: string;
  readonly mobileNumber: string;
}

export interface BusinessMerchantOfficer extends BusinessMerchantContact {
  readonly name: string;
}

export interface BusinessMerchantCompliance {
  readonly entityName: string;
  readonly entityType: BusinessMerchantEntityType;
  readonly isRegistered: boolean;
  readonly entityTypeCustom: string;
  readonly customerCare: BusinessMerchantContact;
  readonly grievanceOfficer: BusinessMerchantOfficer;
}

export interface BusinessAdStatus {
  readonly hasActiveCTWAAd: boolean;
  readonly hasCreatedAd: boolean;
}

export interface BusinessFacebookPage extends BusinessAdStatus {
  readonly id: string;
  readonly displayName: string;
  readonly profileSync?: "disable" | "import";
  readonly profilePictureUrl: string;
  readonly showOnProfile: boolean;
  readonly whatsAppAsPageButton: boolean;
}

export interface BusinessFacebookBusiness {
  readonly id: string;
  readonly displayName: string;
  readonly catalogId?: string;
  readonly catalogState?: "disable" | "import";
}

export interface BusinessInstagramProfessional {
  readonly handle: string;
  readonly displayName: string;
  readonly profilePictureUrl: string;
  readonly showOnProfile: boolean;
}

export interface BusinessWhatsAppAdIdentity extends BusinessAdStatus {
  readonly id: string;
}

export interface BusinessLinkedAccounts {
  readonly facebookPage?: BusinessFacebookPage;
  readonly facebookBusiness?: BusinessFacebookBusiness;
  readonly instagramProfessional?: BusinessInstagramProfessional;
  readonly whatsAppAdIdentity?: BusinessWhatsAppAdIdentity;
}

export type BusinessFeature =
  | "meta_verified"
  | "marketing_messages"
  | "genai"
  | "genai_image"
  | "meta_one"
  | "bb_pro";

export interface BusinessFeatureEligibility {
  readonly feature: BusinessFeature;
  readonly status: string;
  readonly expiration?: number;
  readonly additionalParams?: string;
  readonly showPrivacyInterstitialToNewUsers?: boolean;
  readonly v1Enabled?: boolean;
}

export interface BusinessEligibility {
  readonly features: readonly BusinessFeatureEligibility[];
}

/** Non-GET RPC operations can return this accepted envelope when requested asynchronously. */
export type BusinessCommandResponse<T> =
  SuccessEnvelope<T> | SuccessEnvelope<AsyncAcceptedData>;

export type GetOwnBusinessProfileResponse = SuccessEnvelope<BusinessProfile>;
export type UpdateBusinessProfileResponse =
  BusinessCommandResponse<BusinessProfileStatus>;
export type SetBusinessCoverPhotoResponse =
  BusinessCommandResponse<BusinessCoverPhotoResult>;
export type DeleteBusinessCoverPhotoResponse =
  BusinessCommandResponse<BusinessProfileStatus>;
export type GetBusinessCatalogResponse = SuccessEnvelope<BusinessCatalogPage>;
export type CreateBusinessCatalogResponse =
  BusinessCommandResponse<BusinessActionSuccess>;
export type SetBusinessCartEnabledResponse =
  BusinessCommandResponse<BusinessActionSuccess>;
export type GetBusinessProductResponse = SuccessEnvelope<BusinessProduct>;
export type CreateBusinessProductResponse =
  BusinessCommandResponse<BusinessProduct>;
export type UpdateBusinessProductResponse =
  BusinessCommandResponse<BusinessProduct>;
export type DeleteBusinessProductResponse =
  BusinessCommandResponse<BusinessProductDeleteResult>;
export type SetBusinessProductVisibilityResponse =
  BusinessCommandResponse<BusinessActionSuccess>;
export type AppealBusinessProductResponse =
  BusinessCommandResponse<BusinessActionSuccess>;
export type GetBusinessCollectionsResponse =
  SuccessEnvelope<BusinessCollectionPage>;
export type GetBusinessCollectionResponse = SuccessEnvelope<BusinessCollection>;
export type CreateBusinessCollectionResponse =
  BusinessCommandResponse<BusinessCollectionMutationResult>;
export type UpdateBusinessCollectionResponse =
  BusinessCommandResponse<BusinessCollectionMutationResult>;
export type DeleteBusinessCollectionResponse =
  BusinessCommandResponse<BusinessActionSuccess>;
export type ReorderBusinessCollectionsResponse =
  BusinessCommandResponse<BusinessActionSuccess>;
export type AppealBusinessCollectionResponse =
  BusinessCommandResponse<BusinessActionSuccess>;
export type GetBusinessOrderResponse = BusinessCommandResponse<BusinessOrder>;
export type GetBusinessMerchantComplianceResponse =
  SuccessEnvelope<BusinessMerchantCompliance>;
export type SetBusinessMerchantComplianceResponse =
  BusinessCommandResponse<BusinessMerchantCompliance>;
export type GetBusinessLinkedAccountsResponse =
  SuccessEnvelope<BusinessLinkedAccounts>;
export type GetBusinessEligibilityResponse =
  SuccessEnvelope<BusinessEligibility>;

export interface ContactUserInfo {
  readonly bsuid?: string;
  readonly status: string;
  readonly pictureId: string;
  readonly verifiedName: string;
  readonly devices: readonly (ConversationIdentity & {
    readonly device: number;
  })[];
  readonly id: string;
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
  readonly phonePlatform?: PhonePlatform;
  readonly accountType?: WhatsAppAccountType;
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
  readonly id?: string;
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
  /** Ordering position for before/after pagination, not a message ID. */
  readonly position: number;
  readonly id: string;
  readonly whatsapp_ids: WhatsAppMessageIds;
  /** @deprecated Temporary singular reference for older consumers; use `whatsapp_ids`. */
  readonly whatsapp_id?: string;
  readonly conversation: ConversationIdentity;
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
  readonly bsuid?: string;
  readonly phoneNumber?: string;
  readonly isAdmin: boolean;
  readonly isSuperAdmin: boolean;
  readonly id: string;
  readonly username?: string;
}

export interface Group {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly createdAt: number;
  readonly participants: readonly GroupParticipant[];
  readonly ownerId: string;
}

export interface GroupInviteInfo {
  readonly id: string;
  readonly subject: string;
  readonly createdAt: number;
  readonly size: number;
  readonly participants: readonly GroupParticipant[];
  readonly creatorId: string;
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

/** Hybrid Link requires server-authorized availability on the Number. */
export type MessageTransport = "auto" | "linked_devices" | "official_api";
export type MessageRoutingReason =
  | "explicit_transport"
  | "template"
  | "target_reference"
  | "only_eligible_transport"
  | "session_rule"
  | "project_rule"
  | "team_rule"
  | "default_linked_devices";
export interface MessageRoutingMetadata {
  readonly transport?: Exclude<MessageTransport, "auto">;
  readonly routingReason?: MessageRoutingReason;
  readonly operationId?: string;
}

export interface EditMessageRequest {
  readonly transport?: MessageTransport;
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

/** Actions a Customer-scoped client token can carry in `allow`. */
export type CustomerClientTokenAction =
  | "send_message"
  | "send_reaction"
  | "send_typing"
  | "send_seen"
  | "read_presence"
  | "subscribe_presence"
  | "read_contact";

interface MintClientTokenBase {
  readonly ephemeralId: string;
  readonly ttlSeconds?: number;
}

/** A token limited to one session. */
export interface MintSessionClientTokenRequest extends MintClientTokenBase {
  readonly session: string;
  readonly customer?: never;
  readonly allow?: never;
}

/**
 * A token covering the numbers one Customer owns when it is minted (beta).
 * Each request also requires that the Customer still owns the number and
 * passes that session's client rules. Requires `customers:read`.
 */
export interface MintCustomerClientTokenRequest extends MintClientTokenBase {
  /** Polymorfa Customer ID. Never pass your own external ID. */
  readonly customer: string;
  /** Narrows the token's actions further; omit to use session rules alone. */
  readonly allow?: readonly CustomerClientTokenAction[];
  readonly session?: never;
}

export type MintClientTokenRequest =
  MintSessionClientTokenRequest | MintCustomerClientTokenRequest;

export interface ClientTokenValue {
  readonly token: string;
  readonly expiresAt: string;
}

export type MintClientTokenResponse = SuccessEnvelope<ClientTokenValue>;

/** Who a client token may message: chats the peer started, anyone, or nobody. */
export type ClientRecipientMode = "conversation" | "any" | "none";

/**
 * Client-token actions (comma-separated in `allowedActions`). The `voip_*`
 * actions gate the Calls routes for client tokens: `voip_place` places calls
 * and adds participants, `voip_answer` accepts or declines, and `voip_signal`
 * covers ICE candidates, renegotiation, ending a call, and the lifecycle socket.
 */
export type ClientAction =
  | "mcp"
  | "send_message"
  | "send_reaction"
  | "send_typing"
  | "send_seen"
  | "read_presence"
  | "subscribe_presence"
  | "read_contact"
  | "widget_start"
  | "widget_pair"
  | "widget_status"
  | "widget_embedded_signup"
  | "widget_handoff"
  | "voip_place"
  | "voip_answer"
  | "voip_signal";

/** Rules as returned by `GET /platform/sessions/{session}/client-rules`. */
export interface ClientRules {
  /**
   * Who client tokens may send to. Rules saved before `verified` was retired
   * may still return `verified`; it cannot be set.
   */
  readonly recipientMode: ClientRecipientMode | "verified";
  /** Comma-separated {@link ClientAction} list. */
  readonly allowedActions: string;
  /** Requests per minute per ephemeral id (0 = unlimited). */
  readonly rateLimit: number;
  /** Sends per day per ephemeral id (0 = unlimited). */
  readonly maxDaily: number;
  /** Comma-separated browser origins allowed to use the token. */
  readonly allowedOrigins: string;
  /**
   * Seconds a sender stays replyable in `conversation` mode after their latest
   * inbound message (300 to 604800).
   */
  readonly conversationTtlSeconds: number;
  /** Calls: max distinct in-flight calls per token (0 = unlimited). */
  readonly maxConcurrency: number;
  /** Polymorfa Calls: call setups per minute per ephemeral id (0 = platform default of 10). */
  readonly maxSetupsPerMinute: number;
  /** Calls: comma-separated E.164 destination allowlist (empty = any). */
  readonly allowedNumber: string;
  readonly enabled: boolean;
}

export type GetClientRulesResponse = SuccessEnvelope<ClientRules>;

export interface SetClientRulesRequest {
  readonly recipientMode: ClientRecipientMode;
  /** Comma-separated {@link ClientAction} list. */
  readonly allowedActions?: string;
  /** Requests per minute per ephemeral id; 0 or more (0 = unlimited). */
  readonly rateLimit?: number;
  /** Sends per day per ephemeral id; 0 or more (0 = unlimited). */
  readonly maxDaily?: number;
  readonly allowedOrigins?: string;
  readonly enabled: boolean;
  /**
   * Seconds a sender stays replyable in `conversation` mode after their latest
   * inbound message: 300 (5 minutes) to 604800 (7 days). The API default is
   * 86400 (24 hours).
   */
  readonly conversationTtlSeconds?: number;
  /** Calls: max distinct in-flight calls per token (0 = unlimited). */
  readonly maxConcurrency?: number;
  /** Polymorfa Calls: call setups per minute per ephemeral id (0 = platform default). */
  readonly maxSetupsPerMinute?: number;
  /** Calls: comma-separated E.164 destination allowlist (empty = any). */
  readonly allowedNumber?: string;
}

/**
 * Who acts in a call when a server credential calls a Calls route. Matches
 * `[A-Za-z0-9._:@-]{1,128}`; the API uses `default` when omitted. Client
 * tokens act as their own participant and cannot set this field.
 */
export type VoipParticipantReference = string;

/** Body for `POST /messaging/voip/calls`. */
export interface VoipPlaceCallRequest {
  /** Phone number in E.164 form or a WhatsApp user ID. */
  readonly to: string;
  /** Session that places the call. Required with a server credential. */
  readonly session?: string;
  readonly video?: boolean;
  /** Claim the call for the placing participant. */
  readonly exclusive?: boolean;
  readonly participant?: VoipParticipantReference;
}

export interface VoipPlaceCallResult {
  readonly callId: string;
  readonly session: string;
  readonly video: boolean;
}

export type VoipPlaceCallResponse = SuccessEnvelope<VoipPlaceCallResult>;

/** Body for `POST /messaging/voip/calls/{callId}/accept`. */
export interface VoipAcceptCallRequest {
  /**
   * Claim the call. Other participants then receive `409 call_claimed` and
   * their connections close. Without a claim, later accepts join the call.
   */
  readonly exclusive?: boolean;
  readonly video?: boolean;
  readonly participant?: VoipParticipantReference;
}

export interface VoipAcceptCallResult {
  /** `true` once the call is answered, including when this accept joined it. */
  readonly answered: boolean;
  /** Participant reference that answered the call. */
  readonly answeredBy: string;
  /** Whether a participant holds an exclusive claim on the call. */
  readonly exclusive: boolean;
}

export type VoipAcceptCallResponse = SuccessEnvelope<VoipAcceptCallResult>;

/** Body for `POST /messaging/voip/calls/{callId}/leave`. */
export interface VoipLeaveCallRequest {
  /** Media connection to close. Matches `[A-Za-z0-9_-]{8,64}`. */
  readonly connectionId: string;
  /** Server credentials only: the participant that owns the connection. */
  readonly participant?: VoipParticipantReference;
}

/** SDK that sent a call report. */
export interface VoipCallReportClient {
  /** Package name. Matches `[a-z0-9@/._-]{1,32}`. */
  readonly sdk: string;
  /** `MAJOR.MINOR.PATCH` with an optional `-` or `+` suffix, at most 32 characters. */
  readonly version: string;
  readonly platform: "browser" | "node" | "other";
}

/**
 * Figures an app measured for one connection. Omit what you did not
 * measure; send at least one.
 */
export interface VoipCallQuality {
  /** Round-trip time in milliseconds, 0–60000. */
  readonly rttMs?: number;
  /** Receive jitter in milliseconds, 0–60000. */
  readonly jitterMs?: number;
  /** Packets lost since the connection started. */
  readonly packetsLost?: number;
  /** Packets received since the connection started. */
  readonly packetsReceived?: number;
  /** Negotiated audio codec, for example `audio/opus`. */
  readonly audioCodec?: string;
  readonly videoCodec?: string;
  /** Local ICE candidate type in use; `relay` means a TURN relay. */
  readonly candidateType?: "host" | "srflx" | "prflx" | "relay";
  /** Times this connection reconnected so far, 0–1000. */
  readonly reconnects?: number;
}

export type VoipCallErrorCode =
  | "media_permission_denied"
  | "device_not_found"
  | "device_in_use"
  | "ice_failed"
  | "negotiation_failed"
  | "media_timeout"
  | "reconnect_exhausted"
  | "token_refresh_failed"
  | "unsupported_browser"
  | "other";

interface VoipCallReportBase {
  /** The connection the report is about. Matches `[A-Za-z0-9_-]{8,64}`. */
  readonly connectionId: string;
  /** Server credentials only: the participant that owns the connection. */
  readonly participant?: VoipParticipantReference;
  readonly client?: VoipCallReportClient;
}

export interface VoipCallQualityReport extends VoipCallReportBase {
  readonly kind: "quality";
  readonly quality: VoipCallQuality;
}

export interface VoipCallErrorReport extends VoipCallReportBase {
  readonly kind: "error";
  readonly error: { readonly code: VoipCallErrorCode };
}

/** Body for `POST /messaging/voip/calls/{callId}/reports`. */
export type VoipCallReportRequest = VoipCallQualityReport | VoipCallErrorReport;

/** Body for `POST /messaging/voip/calls/{callId}/reject`. */
export interface VoipRejectCallRequest {
  /** Server credentials only: the participant declining the call. */
  readonly participant?: VoipParticipantReference;
}

/** Body for `POST /messaging/voip/calls/{callId}/participants`. */
export interface VoipAddParticipantRequest {
  /** Phone number in E.164 form or a WhatsApp user ID. */
  readonly to: string;
}

export type VoipParticipantState = "invited" | "ringing" | "connected" | "left";

export interface VoipParticipant {
  readonly id: string;
  readonly phoneNumber?: string;
  readonly bsuid?: string;
  readonly username?: string;
  readonly audioMuted: boolean;
  readonly video: boolean;
  readonly state: VoipParticipantState;
}

export type VoipAddParticipantResponse = SuccessEnvelope<VoipParticipant>;

/** Call settings for one session (`/platform/sessions/{session}/call-settings`). */
export interface SessionCallSettings {
  /**
   * Whether the session can place, answer and receive calls. While `false`,
   * those actions fail with `calls_disabled`, incoming calls are declined and
   * SIP trunks cannot call through the session. Calls in progress continue.
   */
  readonly callsEnabled: boolean;
  /**
   * Conference mode, `true` by default. When `true`, every participant you
   * connect to a call (browser, app and server connections, and SIP trunk
   * callers) hears the WhatsApp party and each other. When `false`, each
   * hears only the WhatsApp party. The WhatsApp party always hears all of
   * your participants, and nobody hears their own audio, including from
   * their other connections.
   */
  readonly conferenceMode: boolean;
  /**
   * Where incoming WhatsApp calls ring. `clients` rings your connected
   * participants; `sip_trunk` also sends each call to `sipTrunkId`.
   */
  readonly inboundRoute: CallInboundRoute;
  /** The SIP trunk that receives incoming calls, or `null` when `inboundRoute` is `clients`. */
  readonly sipTrunkId: string | null;
  /** Whether an answer from the SIP trunk claims the call. `true` by default. */
  readonly sipClaim: boolean;
  /**
   * On a Cloud API session, whether Polymorfa Calls answers incoming calls.
   * `false` by default: your Graph API integration answers them. Sessions on a
   * linked device ignore it.
   */
  readonly hostCloudApiCalls: boolean;
  /**
   * Increases on every change; `0` while the session uses the defaults. Send
   * it as `expectedRevision` so an update cannot overwrite another change.
   */
  readonly revision: number;
  /** ISO 8601 timestamp of the last change, or `null` while the session uses the defaults. */
  readonly updatedAt: string | null;
}

export type CallInboundRoute = "clients" | "sip_trunk";

/**
 * Changes the settings you send; omitted settings keep their values. Send at
 * least one setting.
 */
export interface UpdateSessionCallSettingsRequest {
  /** `false` turns calling off for the session; `true` turns it back on. */
  readonly callsEnabled?: boolean;
  /**
   * `true` lets the participants you connect hear each other as well as the
   * WhatsApp party; `false` lets each hear only the WhatsApp party.
   */
  readonly conferenceMode?: boolean;
  /** Where incoming WhatsApp calls ring. `clients` clears the trunk. */
  readonly inboundRoute?: CallInboundRoute;
  /**
   * A trunk of the session's project with direction `outbound` or `both`.
   * Required when switching to `sip_trunk`; omit it to keep the stored trunk.
   */
  readonly sipTrunkId?: string | null;
  readonly sipClaim?: boolean;
  /** `true` has Polymorfa Calls answer a Cloud API session's incoming calls. */
  readonly hostCloudApiCalls?: boolean;
  /**
   * Apply the update only if the settings still have this `revision`;
   * otherwise it fails with `PolymorfaConflictError` (`state_conflict`).
   */
  readonly expectedRevision?: number;
}

export type SessionCallSettingsResponse = SuccessEnvelope<SessionCallSettings>;

/** A person's call permission on a Cloud API number. */
export type CallPermissionStatus =
  "none" | "temporary" | "permanent" | "revoked";

/**
 * How the last change was learned: the person's reply (`user_action`),
 * WhatsApp acting on its own (`automatic`), asking WhatsApp (`sync`), or a
 * call WhatsApp refused for lack of permission (`call_refused`).
 */
export type CallPermissionSource =
  "user_action" | "automatic" | "sync" | "call_refused";

/** One of WhatsApp's limits on an action, for example one request per day. */
export interface CallPermissionLimit {
  /** ISO 8601 duration of the window, for example `PT24H` or `P7D`. */
  readonly period: string;
  readonly maxAllowed: number;
  readonly used: number;
  /** When the window resets, when WhatsApp reports it. */
  readonly resetsAt: string | null;
}

export interface CallPermissionAction {
  /** Whether WhatsApp allows the action now. */
  readonly allowed: boolean;
  readonly limits: readonly CallPermissionLimit[];
}

/** A person's call permission, without the conversation it belongs to. */
export interface CallPermissionState {
  /**
   * `none`: no permission. `temporary`: granted until `expiresAt`.
   * `permanent`: granted without expiry. `revoked`: the person declined or
   * withdrew permission, or WhatsApp withdrew it after unanswered calls.
   */
  readonly status: CallPermissionStatus;
  /** When a temporary permission ends; `null` otherwise. */
  readonly expiresAt: string | null;
  /** `null` when nothing is recorded. */
  readonly source: CallPermissionSource | null;
  readonly updatedAt: string | null;
  /** When WhatsApp was last asked, or `null`. */
  readonly checkedAt: string | null;
  /**
   * `true` when WhatsApp was asked during this request. `false` returns the
   * stored state because WhatsApp could not be reached.
   */
  readonly fresh: boolean;
  /** WhatsApp's limits, present when `fresh` is `true`. */
  readonly actions: {
    /** Whether this number can send the person a call permission request now. */
    readonly requestPermission: CallPermissionAction | null;
    /** Whether this number can call the person now. */
    readonly startCall: CallPermissionAction | null;
  } | null;
}

/** `GET /messaging/{session}/call-permissions/{to}`. */
export interface CallPermission extends CallPermissionState {
  readonly conversation: ConversationIdentity;
}

export type CallPermissionResponse = SuccessEnvelope<CallPermission>;

/** Body for `POST /messaging/voip/calls/check`. */
export interface VoipCheckCallRequest {
  /** The session (number) that would place the call. */
  readonly session: string;
  /** User ID or phone number in E.164 format. */
  readonly to: string;
}

/** The first reason a call placed now would be refused. */
export type VoipCallRefusal =
  | "calls_disabled"
  | "call_recipient_opted_out"
  | "call_destination_blocked"
  | "call_permission_required"
  | "call_limit_reached";

export interface VoipCallCheck {
  /** Whether a call placed now would pass every check Polymorfa and WhatsApp report. */
  readonly allowed: boolean;
  readonly refusal: VoipCallRefusal | null;
  /** The person's call permission on a Cloud API number; `null` on linked-device numbers. */
  readonly permission: CallPermissionState | null;
}

export type VoipCheckCallResponse = SuccessEnvelope<VoipCallCheck>;

export type ListSessionsResponse = SuccessEnvelope<readonly Session[]>;
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
  | "flow"
  | "call_permission_request";

export interface QuotedMessage {
  readonly id: string;
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
  readonly businessOwnerId: string;
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
  readonly businessOwnerId: string;
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
  readonly sellerId: string;
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

export interface ConversationIdentity {
  readonly id: string;
  readonly phoneNumber?: string;
  readonly bsuid?: string;
  readonly username?: string;
}

export type ConversationReference = Partial<ConversationIdentity> &
  (
    | { readonly id: string }
    | { readonly phoneNumber: string }
    | { readonly bsuid: string }
  );

export interface MessageSendContext {
  readonly transport?: MessageTransport;
  readonly conversation: ConversationReference;
  readonly isForwarded?: boolean;
  readonly mentions?: readonly string[];
  readonly quotedMessage?: QuotedMessage;
}

export interface SendTextMessageRequest extends MessageSendContext {
  readonly content: { readonly text: string };
}

export type MediaMessageKind = "image" | "file" | "voice" | "video";

export type MessageMediaContent<Kind extends MediaMessageKind = "image"> = (
  | { readonly url: string; readonly base64?: never }
  | { readonly url?: never; readonly base64: string }
) & {
  readonly mimeType?: string;
  readonly caption?: string;
} & (Kind extends "file"
    ? { readonly filename?: string; readonly ptt?: never }
    : Kind extends "voice"
      ? { readonly ptt?: boolean; readonly filename?: never }
      : { readonly filename?: never; readonly ptt?: never });
export type SendMediaMessageRequest = MessageSendContext & {
  readonly content:
    | { readonly image: MessageMediaContent }
    | { readonly video: MessageMediaContent }
    | { readonly file: MessageMediaContent<"file"> }
    | { readonly voice: MessageMediaContent<"voice"> };
};

export interface SendPollMessageRequest extends MessageSendContext {
  readonly content: {
    readonly poll: {
      readonly title: string;
      readonly options: readonly string[];
      readonly multiSelect?: boolean;
    };
  };
}

export interface SendLocationMessageRequest extends MessageSendContext {
  readonly content: {
    readonly location: {
      readonly lat: number;
      readonly long: number;
      readonly address?: string;
    };
  };
}

export interface SendContactMessageRequest extends MessageSendContext {
  readonly content: { readonly contact: { readonly vcard: string } };
}

export interface SendPhoneNumberRequest extends MessageSendContext {
  readonly content: {
    readonly requestPhoneNumber: Readonly<Record<string, never>>;
  };
}

export interface SendProductMessageRequest extends MessageSendContext {
  readonly content: { readonly product: ProductMessageContent };
}

export interface SendProductListMessageRequest extends MessageSendContext {
  readonly content: { readonly productList: ProductListMessageContent };
}

export interface SendOrderMessageRequest extends MessageSendContext {
  readonly content: { readonly order: OrderMessageContent };
}

export interface SendListMessageRequest extends MessageSendContext {
  readonly content: { readonly list: ListMessageContent };
}

export interface SendButtonsMessageRequest extends MessageSendContext {
  readonly content: { readonly buttons: ButtonsMessageContent };
}

export interface SendAddressMessageRequest extends MessageSendContext {
  readonly content: { readonly addressMessage: AddressMessageContent };
}

export interface SendFlowMessageRequest extends MessageSendContext {
  readonly content: { readonly flow: FlowMessageContent };
}

/**
 * Asks the person for permission to call them. Cloud API numbers only;
 * WhatsApp limits how often you can ask.
 */
export interface CallPermissionRequestMessageContent {
  /** Why you want to call, shown above WhatsApp's allow and decline buttons. 1 to 1,024 characters. */
  readonly body: string;
}

export interface SendCallPermissionRequestMessageRequest extends MessageSendContext {
  readonly content: {
    readonly callPermissionRequest: CallPermissionRequestMessageContent;
  };
}

export interface SendTemplateMessageRequest extends MessageSendContext {
  readonly content: { readonly template: MessageTemplateSend };
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
  | SendCallPermissionRequestMessageRequest
  | SendTemplateMessageRequest;

export interface MessageOperation {
  readonly operationId: string;
  /** Pending and unknown remain fenced; rejected proves no provider attempt. */
  readonly status: "pending" | "unknown" | "completed" | "rejected";
  readonly transport?: Exclude<MessageTransport, "auto">;
  /** Present for a terminal rejection before the provider effect. */
  readonly rejectionCode?: "hybrid_authority_unavailable";
  readonly receipt?: {
    readonly whatsapp_ids: WhatsAppMessageIds;
    readonly timestamp: string;
  };
}
export type MessageOperationResponse = SuccessEnvelope<MessageOperation>;

export interface MessageReceipt extends MessageRoutingMetadata {
  readonly id: string;
  readonly whatsapp_ids: WhatsAppMessageIds;
  /** @deprecated Temporary singular reference for older consumers; use `whatsapp_ids`. */
  readonly whatsapp_id?: string;
  readonly conversation: ConversationIdentity;
  readonly timestamp: string;
  readonly status: string;
}

export interface MessageResponse extends MessageReceipt {
  readonly type: string;
  readonly content?: SendMessageRequest["content"];
  readonly mediaId?: string;
}

export type SendMessageResponse = SuccessEnvelope<MessageResponse>;
export type SendReactionResponse = SuccessEnvelope<MessageReceipt>;
export type StarMessageResponse = SuccessEnvelope<{ readonly status: "OK" }>;

export interface SeenRequest {
  readonly conversation: ConversationReference;
  readonly id: string;
}

export interface TypingRequest {
  readonly conversation: ConversationReference;
  readonly state: "typing" | "recording" | "paused";
}

export interface ReactRequest {
  readonly transport?: MessageTransport;
  readonly conversation: ConversationReference;
  readonly id: string;
  readonly reaction: string;
}

export interface StarRequest {
  readonly conversation: ConversationReference;
  readonly id: string;
  readonly star: boolean;
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
