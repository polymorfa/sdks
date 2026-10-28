import { BrowserValidationError } from "../errors.js";
import type { BrowserTransport } from "../transport.js";
import type {
  BrowserActionOptions,
  BrowserActionResponse,
  BrowserSuccessEnvelope,
  BrowserSuccessResponse,
} from "./types.js";

/** API data the UI Kit does not model field by field. */
export type BrowserRecord = Readonly<Record<string, unknown>>;
type Envelope<T> = BrowserActionResponse<BrowserSuccessEnvelope<T>>;
type Done = BrowserActionResponse<BrowserSuccessResponse>;
type Query = Readonly<Record<string, string | number | undefined>>;

/** Disappearing-message timers WhatsApp offers: off, 24 hours, 7 days, 90 days. */
export type BrowserDisappearingSeconds = 0 | 86_400 | 604_800 | 7_776_000;

export type BrowserChatKind = "direct" | "group" | "channel" | "broadcast";

export interface BrowserListChatsParams {
  readonly limit?: number;
  readonly cursor?: string;
  readonly kind?: BrowserChatKind;
  readonly activeSince?: string;
  readonly activeBefore?: string;
}

export interface BrowserListMessagesParams {
  readonly limit?: number;
  readonly cursor?: string;
  readonly order?: "desc" | "asc";
  readonly since?: string;
  readonly until?: string;
  readonly direction?: "inbound" | "outbound";
  /** Message types, for example `["text", "image"]`. Up to 16. */
  readonly types?: readonly string[];
}

export interface BrowserPage<T> {
  readonly success: true;
  readonly data: readonly T[];
  readonly nextCursor?: string | null;
}

export type BrowserPrivacySetting =
  | "groupadd"
  | "last"
  | "status"
  | "profile"
  | "readreceipts"
  | "online"
  | "calladd"
  | "messages"
  | "defense"
  | "stickers";

export type BrowserPrivacyValue =
  | "all"
  | "contacts"
  | "contact_allowlist"
  | "contact_blacklist"
  | "match_last_seen"
  | "known"
  | "none"
  | "on_standard"
  | "off";

function segment(value: string, name: string): string {
  if (value.length === 0 || value.includes("/"))
    throw new BrowserValidationError(`${name} is required.`, `invalid_${name}`);
  return encodeURIComponent(value);
}

function query(params: Query): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(params))
    if (value !== undefined) out[key] = String(value);
  return out;
}

const DISAPPEARING = new Set([0, 86_400, 604_800, 7_776_000]);

/** Shared request helper for one session's resources. */
abstract class SessionResource {
  constructor(
    protected readonly transport: BrowserTransport,
    protected readonly session: string,
  ) {}
  protected call<T>(
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
    path: string,
    options: BrowserActionOptions,
    extra: { readonly body?: unknown; readonly query?: Query } = {},
  ): Promise<BrowserActionResponse<T>> {
    return this.transport.request({
      method,
      path: `/messaging/${encodeURIComponent(this.session)}${path}`,
      ...(extra.body === undefined ? {} : { body: extra.body }),
      ...(extra.query === undefined ? {} : { query: query(extra.query) }),
      ...options,
    });
  }
}

/**
 * Conversations and messages from hosted message storage
 * (`conversations_read`; the API answers `hms_not_enabled` where storage is
 * off), and chat changes (`conversations_manage`).
 */
export class BrowserChatsResource extends SessionResource {
  list(params: BrowserListChatsParams = {}, options: BrowserActionOptions = {}): Promise<BrowserActionResponse<BrowserPage<BrowserRecord>>> {
    return this.call("GET", "/chats", options, { query: { ...params } });
  }
  retrieve(conversation: string, options: BrowserActionOptions = {}): Promise<Envelope<BrowserRecord>> {
    return this.call("GET", `/chats/${segment(conversation, "conversation")}`, options);
  }
  messages(conversation: string, params: BrowserListMessagesParams = {}, options: BrowserActionOptions = {}): Promise<BrowserActionResponse<BrowserPage<BrowserRecord>>> {
    const { types, ...rest } = params;
    return this.call("GET", `/chats/${segment(conversation, "conversation")}/messages`, options, {
      query: { ...rest, ...(types === undefined ? {} : { types: types.join(",") }) },
    });
  }
  message(conversation: string, messageId: string, options: BrowserActionOptions = {}): Promise<Envelope<BrowserRecord>> {
    return this.call("GET", `/chats/${segment(conversation, "conversation")}/messages/${segment(messageId, "message")}`, options);
  }
  /** How to fetch a stored message's media. */
  media(conversation: string, messageId: string, options: BrowserActionOptions = {}): Promise<Envelope<BrowserRecord>> {
    return this.call("GET", `/chats/${segment(conversation, "conversation")}/messages/${segment(messageId, "message")}/media`, options);
  }
  archive(conversation: string, options: BrowserActionOptions = {}): Promise<Done> {
    return this.call("POST", `/chats/${segment(conversation, "conversation")}/archive`, options);
  }
  unarchive(conversation: string, options: BrowserActionOptions = {}): Promise<Done> {
    return this.call("POST", `/chats/${segment(conversation, "conversation")}/unarchive`, options);
  }
  /** Disappearing messages for a chat or group. `0` turns them off. */
  setDisappearing(conversation: string, durationSeconds: BrowserDisappearingSeconds, options: BrowserActionOptions = {}): Promise<Done> {
    if (!DISAPPEARING.has(durationSeconds))
      throw new BrowserValidationError("Use 0, 86400, 604800 or 7776000 seconds.", "invalid_duration");
    return this.call("PUT", `/chats/${segment(conversation, "conversation")}/disappearing`, options, { body: { durationSeconds } });
  }
  editMessage(conversation: string, messageId: string, text: string, options: BrowserActionOptions = {}): Promise<Done> {
    if (text.length === 0) throw new BrowserValidationError("text is required.", "missing_text");
    return this.call("PUT", `/chats/${segment(conversation, "conversation")}/messages/${segment(messageId, "message")}`, options, { body: { text } });
  }
  /** Deletes a message for everyone. */
  deleteMessage(conversation: string, messageId: string, options: BrowserActionOptions = {}): Promise<Done> {
    return this.call("DELETE", `/chats/${segment(conversation, "conversation")}/messages/${segment(messageId, "message")}`, options);
  }
}

/** Labels (`labels_read`, `labels_manage`). Colors are 0 to 19. */
export class BrowserLabelsResource extends SessionResource {
  list(options: BrowserActionOptions = {}): Promise<Envelope<BrowserRecord>> {
    return this.call("GET", "/labels", options);
  }
  forChat(conversation: string, options: BrowserActionOptions = {}): Promise<Envelope<BrowserRecord>> {
    return this.call("GET", `/labels/chats/${segment(conversation, "conversation")}`, options);
  }
  create(input: { readonly name: string; readonly color?: number }, options: BrowserActionOptions = {}): Promise<Envelope<BrowserRecord>> {
    if (input.name.trim() === "") throw new BrowserValidationError("A label name is required.", "missing_name");
    return this.call("POST", "/labels", options, { body: input });
  }
  update(labelId: string, input: { readonly name?: string; readonly color?: number }, options: BrowserActionOptions = {}): Promise<Envelope<BrowserRecord>> {
    if (input.name === undefined && input.color === undefined)
      throw new BrowserValidationError("Provide name, color or both.", "empty_update");
    return this.call("PUT", `/labels/${segment(labelId, "label")}`, options, { body: input });
  }
  delete(labelId: string, options: BrowserActionOptions = {}): Promise<Done> {
    return this.call("DELETE", `/labels/${segment(labelId, "label")}`, options);
  }
  /** Replaces a chat's labels (up to 20). */
  setForChat(conversation: string, labels: readonly string[], options: BrowserActionOptions = {}): Promise<Done> {
    if (labels.length > 20) throw new BrowserValidationError("A chat takes up to 20 labels.", "too_many_labels");
    return this.call("PUT", `/labels/chats/${segment(conversation, "conversation")}`, options, { body: { labels } });
  }
}

/** The account's own profile and privacy (`profile_read`, `profile_manage`). */
export class BrowserProfileResource extends SessionResource {
  retrieve(options: BrowserActionOptions = {}): Promise<Envelope<BrowserRecord>> {
    return this.call("GET", "/profile", options);
  }
  setName(name: string, options: BrowserActionOptions = {}): Promise<Done> {
    if (name.trim() === "") throw new BrowserValidationError("A name is required.", "missing_name");
    return this.call("PUT", "/profile/name", options, { body: { name } });
  }
  setStatus(status: string, options: BrowserActionOptions = {}): Promise<Done> {
    return this.call("PUT", "/profile/status", options, { body: { status } });
  }
  /** Base64 image bytes; client tokens cannot pass a URL. */
  setPicture(base64: string, options: BrowserActionOptions = {}): Promise<Done> {
    if (base64.length === 0) throw new BrowserValidationError("base64 is required.", "missing_picture");
    return this.call("PUT", "/profile/picture", options, { body: { base64 } });
  }
  removePicture(options: BrowserActionOptions = {}): Promise<Done> {
    return this.call("DELETE", "/profile/picture", options);
  }
  privacy(options: BrowserActionOptions = {}): Promise<Envelope<BrowserRecord>> {
    return this.call("GET", "/privacy", options);
  }
  setPrivacy(setting: BrowserPrivacySetting, value: BrowserPrivacyValue, options: BrowserActionOptions = {}): Promise<Done> {
    return this.call("PUT", `/privacy/${segment(setting, "setting")}`, options, { body: { value } });
  }
  /** The disappearing-message timer for new chats. */
  setDefaultDisappearing(durationSeconds: BrowserDisappearingSeconds, options: BrowserActionOptions = {}): Promise<Done> {
    if (!DISAPPEARING.has(durationSeconds))
      throw new BrowserValidationError("Use 0, 86400, 604800 or 7776000 seconds.", "invalid_duration");
    return this.call("PUT", "/privacy/disappearing/default", options, { body: { durationSeconds } });
  }
  businessProfile(options: BrowserActionOptions = {}): Promise<Envelope<BrowserRecord>> {
    return this.call("GET", "/business/profile", options);
  }
  quickReplies(options: BrowserActionOptions = {}): Promise<Envelope<BrowserRecord>> {
    return this.call("GET", "/business/quick-replies", options);
  }
}

/** Channels (`channels_read`, `channels_manage`). */
export class BrowserChannelsResource extends SessionResource {
  list(options: BrowserActionOptions = {}): Promise<Envelope<BrowserRecord>> {
    return this.call("GET", "/channels", options);
  }
  retrieve(channelId: string, options: BrowserActionOptions = {}): Promise<Envelope<BrowserRecord>> {
    return this.call("GET", `/channels/${segment(channelId, "channel")}`, options);
  }
  messages(channelId: string, params: Query = {}, options: BrowserActionOptions = {}): Promise<Envelope<BrowserRecord>> {
    return this.call("GET", `/channels/${segment(channelId, "channel")}/messages`, options, { query: params });
  }
  follow(channelId: string, options: BrowserActionOptions = {}): Promise<Done> {
    return this.call("POST", `/channels/${segment(channelId, "channel")}/follow`, options);
  }
  unfollow(channelId: string, options: BrowserActionOptions = {}): Promise<Done> {
    return this.call("POST", `/channels/${segment(channelId, "channel")}/unfollow`, options);
  }
  mute(channelId: string, options: BrowserActionOptions = {}): Promise<Done> {
    return this.call("POST", `/channels/${segment(channelId, "channel")}/mute`, options);
  }
  unmute(channelId: string, options: BrowserActionOptions = {}): Promise<Done> {
    return this.call("POST", `/channels/${segment(channelId, "channel")}/unmute`, options);
  }
}

/** Catalog reads (`business_read`). */
export class BrowserCatalogResource extends SessionResource {
  catalog(options: BrowserActionOptions = {}): Promise<Envelope<BrowserRecord>> {
    return this.call("GET", "/business/catalog", options);
  }
  collections(options: BrowserActionOptions = {}): Promise<Envelope<BrowserRecord>> {
    return this.call("GET", "/business/collections", options);
  }
  collection(collectionId: string, options: BrowserActionOptions = {}): Promise<Envelope<BrowserRecord>> {
    return this.call("GET", `/business/collections/${segment(collectionId, "collection")}`, options);
  }
  product(productId: string, options: BrowserActionOptions = {}): Promise<Envelope<BrowserRecord>> {
    return this.call("GET", `/business/products/${segment(productId, "product")}`, options);
  }
}
