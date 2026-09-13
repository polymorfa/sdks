import type { BrowserRequest, BrowserResponse } from "../transport.js";

export interface BrowserActionOptions {
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
  readonly maxNetworkRetries?: number;
  readonly idempotencyKey?: string;
  readonly headers?: Readonly<Record<string, string>>;
}

export interface BrowserSuccessEnvelope<T> {
  readonly success: true;
  readonly data: T;
}

export type BrowserActionResponse<T> = BrowserResponse<T>;

export type BrowserMessageKind =
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

export interface BrowserQuotedMessage {
  readonly id: string;
  readonly chatId?: string;
  readonly sender?: string;
}

export interface BrowserSendMessageRequest {
  readonly chatId: string;
  readonly type?: BrowserMessageKind;
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
  readonly quotedMessage?: BrowserQuotedMessage;
  readonly template?: Readonly<Record<string, unknown>>;
  readonly product?: Readonly<Record<string, unknown>>;
  readonly productList?: Readonly<Record<string, unknown>>;
  readonly order?: Readonly<Record<string, unknown>>;
  readonly list?: Readonly<Record<string, unknown>>;
  readonly buttons?: Readonly<Record<string, unknown>>;
  readonly addressMessage?: Readonly<Record<string, unknown>>;
  readonly flow?: Readonly<Record<string, unknown>>;
}

export interface BrowserMessageResult {
  readonly id: string;
  readonly timestamp: string;
  readonly status: string;
  readonly mediaId?: string;
  readonly senderLid: string;
  readonly senderPhoneNumber?: string;
  readonly fromLid: string;
  readonly fromPhoneNumber?: string;
}

export interface BrowserSeenRequest {
  readonly chatId: string;
  readonly messageId: string;
}

export interface BrowserTypingRequest {
  readonly chatId: string;
  readonly state: "typing" | "recording" | "paused";
}

export interface BrowserReactionRequest {
  readonly chatId: string;
  readonly messageId: string;
  readonly reaction: string;
}

export interface BrowserStarRequest {
  readonly chatId: string;
  readonly messageId: string;
  readonly star: boolean;
  readonly fromMe?: boolean;
  readonly sender?: string;
}

export interface BrowserSuccessResponse {
  readonly success: boolean;
  readonly message?: string;
}

export interface BrowserPresenceData {
  readonly desired?: "available" | "unavailable";
  readonly desiredAt?: string;
  readonly lastSent?: "available" | "unavailable";
  readonly lastSentAt?: string;
  readonly authoritative: false;
}

export interface BrowserChatState {
  readonly sender: string;
  readonly state: "composing" | "paused";
  readonly media?: string;
  readonly observedAt: string;
  readonly stale: boolean;
}

export interface BrowserChatPresenceData {
  readonly policy: "off" | "events" | "cache";
  readonly status: "unknown" | "fresh" | "stale";
  readonly unknownReason?: "disabled" | "not_observed" | "suspended";
  readonly available?: boolean;
  readonly lastSeen?: string;
  readonly observedAt?: string;
  readonly subscriptionExpiresAt?: string;
  readonly stale: boolean;
  readonly typingPolicy: "off" | "events" | "cache";
  readonly typingStatus: "unknown" | "fresh" | "stale";
  readonly typingUnknownReason?: "disabled" | "not_observed" | "suspended";
  readonly chatState?: BrowserChatState;
}

export interface BrowserPresenceSubscriptionData {
  readonly status: "SUBSCRIBED";
  readonly expiresAt: string;
}

export interface BrowserAsyncAcceptedData {
  readonly requestId: string;
}

export interface BrowserContact {
  /** @deprecated Use id and phoneNumber where available. */
  readonly lid: string;
  readonly phoneNumber?: string;
  readonly name: string;
  readonly pushName: string;
  readonly businessName?: string;
  readonly profileUrl?: string;
  readonly id?: string;
  readonly username?: string;
}

export interface BrowserContactCheckResult {
  readonly exists: boolean;
  /** @deprecated Use id and phoneNumber where available. */
  readonly lid?: string;
  readonly phoneNumber?: string;
  readonly id?: string;
  readonly username?: string;
}

export interface BrowserProfilePicture {
  readonly url: string;
}

export interface BrowserPairingCodeRequest {
  readonly phone: string;
}

export interface BrowserPairingCode {
  readonly code: string;
}

export interface BrowserQrCode {
  readonly qr?: string;
  readonly event?: string;
}

export interface BrowserOperationAccepted {
  readonly success: true;
  readonly message: string;
  readonly operationId: string;
}

export interface BrowserSessionStatus {
  readonly sessionId?: string;
  readonly name: string;
  readonly tenantId: string;
  readonly connection: "linked_device" | "cloud_api";
  readonly testMode: boolean;
  readonly status: string;
  readonly statusReason?: string;
  readonly runnerId?: string;
  readonly proxy?: string;
  readonly config: Readonly<Record<string, unknown>>;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface BrowserWidgetHandoff {
  readonly handoffUrl: string;
  readonly metaQrSvg: string;
  readonly expiresAt: string;
}

export type BrowserRequestOptions = Pick<
  BrowserRequest,
  "signal" | "timeoutMs" | "maxNetworkRetries" | "idempotencyKey" | "headers"
>;
