/** Exact observed provider references; at least one provider is known. */
export type BrowserWhatsAppMessageIds =
  | { readonly linked_devices: string; readonly official_api?: string }
  | { readonly linked_devices?: string; readonly official_api: string };

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
  readonly type?: string;
  readonly text?: string;
}

export interface BrowserConversationIdentity {
  readonly id: string;
  readonly phoneNumber?: string;
  readonly bsuid?: string;
  readonly username?: string;
}
export type BrowserConversationReference =
  Partial<BrowserConversationIdentity> &
    (
      | { readonly id: string }
      | { readonly phoneNumber: string }
      | { readonly bsuid: string }
    );
export type BrowserMessageMedia<
  Kind extends "image" | "video" | "file" | "voice" = "image",
> = (
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
type UnionKeys<T> = T extends T ? keyof T : never;
type ExclusiveUnion<T, All = T> = T extends T
  ? T & { readonly [K in Exclude<UnionKeys<All>, keyof T>]?: never }
  : never;

export type BrowserMessageContent = ExclusiveUnion<
  | { readonly text: string }
  | { readonly image: BrowserMessageMedia }
  | { readonly video: BrowserMessageMedia }
  | { readonly voice: BrowserMessageMedia<"voice"> }
  | { readonly file: BrowserMessageMedia<"file"> }
  | {
      readonly poll: {
        readonly title: string;
        readonly options: readonly string[];
        readonly multiSelect?: boolean;
      };
    }
  | {
      readonly location: {
        readonly lat: number;
        readonly long: number;
        readonly address?: string;
      };
    }
  | { readonly contact: { readonly vcard: string } }
  | { readonly requestPhoneNumber: Readonly<Record<string, never>> }
  | { readonly template: Readonly<Record<string, unknown>> }
  | { readonly product: Readonly<Record<string, unknown>> }
  | { readonly productList: Readonly<Record<string, unknown>> }
  | { readonly order: Readonly<Record<string, unknown>> }
  | { readonly list: Readonly<Record<string, unknown>> }
  | { readonly buttons: Readonly<Record<string, unknown>> }
  | { readonly addressMessage: Readonly<Record<string, unknown>> }
  | { readonly flow: Readonly<Record<string, unknown>> }
>;

export interface BrowserSendMessageRequest {
  readonly conversation: BrowserConversationReference;
  readonly content: BrowserMessageContent;
  readonly isForwarded?: boolean;
  readonly mentions?: readonly string[];
  readonly quotedMessage?: BrowserQuotedMessage;
}

export interface BrowserMessageReceipt {
  readonly id: string;
  readonly whatsapp_ids: BrowserWhatsAppMessageIds;
  readonly conversation: BrowserConversationIdentity;
  readonly timestamp: string;
  readonly status: string;
}

export interface BrowserMessageResult extends BrowserMessageReceipt {
  readonly type: string;
  readonly content?: BrowserMessageContent;
  readonly mediaId?: string;
}

export interface BrowserSeenRequest {
  readonly conversation: BrowserConversationReference;
  readonly id: string;
}

export interface BrowserTypingRequest {
  readonly conversation: BrowserConversationReference;
  readonly state: "typing" | "recording" | "paused";
}

export interface BrowserReactionRequest {
  readonly conversation: BrowserConversationReference;
  readonly id: string;
  readonly reaction: string;
}

export interface BrowserStarRequest {
  readonly conversation: BrowserConversationReference;
  readonly id: string;
  readonly star: boolean;
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
  readonly bsuid?: string;
  readonly phoneNumber?: string;
  readonly name: string;
  readonly pushName: string;
  readonly businessName?: string;
  readonly profileUrl?: string;
  readonly id: string;
  readonly username?: string;
}

export interface BrowserContactCheckResult {
  readonly exists: boolean;
  readonly bsuid?: string;
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

export type BrowserRequestOptions = Pick<
  BrowserRequest,
  "signal" | "timeoutMs" | "maxNetworkRetries" | "idempotencyKey" | "headers"
>;
