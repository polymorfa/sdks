import { HttpTransport } from "../transport/http.js";
import { withIdempotencyKey } from "../transport/idempotency.js";
import type { ApiResponse, RequestOptions } from "../transport/types.js";
import type {
  DisappearingTimerRequest,
  EditMessageRequest,
  MessageTransport,
  SuccessResponse,
  ConversationIdentity,
} from "./types.js";

export interface DeleteMessageOptions extends RequestOptions {
  readonly transport?: MessageTransport;
}

/** Opaque cursors are valid only with the same path and filters. */
export interface StoredChatsParams {
  readonly limit?: number;
  readonly cursor?: string;
  readonly kind?: "direct" | "group" | "channel" | "broadcast";
  readonly activeSince?: string;
  readonly activeBefore?: string;
}

export interface StoredChatMessagesParams {
  readonly limit?: number;
  readonly cursor?: string;
  readonly order?: "desc" | "asc";
  readonly since?: string;
  readonly until?: string;
  readonly direction?: "inbound" | "outbound";
  /** Comma-separated message types, for example `text,image`. */
  readonly types?: string;
}

export interface StoredMessageSummary {
  readonly id: string;
  readonly whatsapp_id: string;
  readonly direction: "inbound" | "outbound";
  readonly type: string;
  readonly timestamp: string;
}

export interface StoredChat {
  readonly conversation: ConversationIdentity;
  readonly kind: "direct" | "group" | "channel" | "broadcast";
  readonly lastActivityAt: string;
  readonly lastMessage: StoredMessageSummary;
}

export interface StoredMedia {
  readonly id: string;
  readonly mimeType: string;
  readonly fileLength: number;
  readonly url: string;
}

export interface StoredMessage {
  /** Opaque Polymorfa resource ID; keep it as a string. */
  readonly id: string;
  readonly whatsapp_id: string;
  readonly conversation: ConversationIdentity & {
    readonly sender?: ConversationIdentity;
  };
  readonly direction: "inbound" | "outbound";
  readonly fromMe: boolean;
  readonly type: string;
  readonly timestamp: string;
  readonly pushName?: string;
  readonly text?: string;
  readonly caption?: string;
  readonly mimeType?: string;
  readonly filename?: string;
  readonly ptt?: boolean;
  readonly latitude?: number;
  readonly longitude?: number;
  readonly displayName?: string;
  readonly title?: string;
  readonly reaction?: string;
  readonly reactionTo?: string;
  readonly edited?: boolean;
  readonly unavailable?: boolean;
  readonly unavailableReason?: string;
  readonly pollOptions?: readonly {
    readonly name: string;
    readonly hash: string;
  }[];
  readonly media?: readonly StoredMedia[];
}

export interface StoredHistoryPage<T> {
  readonly success: true;
  readonly data: readonly T[];
  readonly hasMore: boolean;
  readonly nextCursor: string | null;
  readonly previousCursor: string | null;
}

export type ListStoredChatsResponse = StoredHistoryPage<StoredChat>;
export type ListStoredChatMessagesResponse = StoredHistoryPage<StoredMessage>;
export interface GetStoredChatResponse {
  readonly success: true;
  readonly data: StoredChat;
}
export interface GetStoredChatMessageResponse {
  readonly success: true;
  readonly data: StoredMessage;
}

export class ChatsResource {
  constructor(private readonly transport: HttpTransport) {}

  /** Lists retained conversations for an HMS-enabled Linked Device Number. */
  list(
    session: string,
    params: StoredChatsParams = {},
    options: RequestOptions = {},
  ): Promise<ApiResponse<ListStoredChatsResponse>> {
    return this.transport.request({
      method: "GET",
      path: `/messaging/${encodeURIComponent(session)}/chats`,
      query: { ...params },
      ...options,
    });
  }

  /** Reads one retained conversation. */
  retrieve(
    session: string,
    conversation: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<GetStoredChatResponse>> {
    return this.transport.request({
      method: "GET",
      path: chatPath(session, conversation),
      ...options,
    });
  }

  /** Lists retained messages, newest first unless `order` is `asc`. */
  listMessages(
    session: string,
    conversation: string,
    params: StoredChatMessagesParams = {},
    options: RequestOptions = {},
  ): Promise<ApiResponse<ListStoredChatMessagesResponse>> {
    return this.transport.request({
      method: "GET",
      path: `${chatPath(session, conversation)}/messages`,
      query: { ...params },
      ...options,
    });
  }

  /** Reads one retained message by its opaque Polymorfa resource ID. */
  retrieveMessage(
    session: string,
    conversation: string,
    messageId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<GetStoredChatMessageResponse>> {
    return this.transport.request({
      method: "GET",
      path: chatMessagePath(session, conversation, messageId),
      ...options,
    });
  }

  editMessage(
    session: string,
    chatId: string,
    messageId: string,
    body: EditMessageRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<SuccessResponse>> {
    return this.transport.request({
      method: "PUT",
      path: chatMessagePath(session, chatId, messageId),
      body,
      ...withIdempotencyKey(options),
    });
  }

  deleteMessage(
    session: string,
    chatId: string,
    messageId: string,
    options: DeleteMessageOptions = {},
  ): Promise<ApiResponse<SuccessResponse>> {
    return this.transport.request({
      method: "DELETE",
      query: { transport: options.transport },
      path: chatMessagePath(session, chatId, messageId),
      ...withIdempotencyKey(options),
    });
  }

  archive(
    session: string,
    chatId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<SuccessResponse>> {
    return this.updateArchiveState(session, chatId, "archive", options);
  }

  unarchive(
    session: string,
    chatId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<SuccessResponse>> {
    return this.updateArchiveState(session, chatId, "unarchive", options);
  }

  setDisappearingTimer(
    session: string,
    chatId: string,
    body: DisappearingTimerRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<SuccessResponse>> {
    return this.transport.request({
      method: "PUT",
      path: `${chatPath(session, chatId)}/disappearing`,
      body,
      ...options,
    });
  }

  private updateArchiveState(
    session: string,
    chatId: string,
    action: "archive" | "unarchive",
    options: RequestOptions,
  ): Promise<ApiResponse<SuccessResponse>> {
    return this.transport.request({
      method: "POST",
      path: `${chatPath(session, chatId)}/${action}`,
      ...options,
    });
  }
}

function chatPath(session: string, chatId: string): string {
  return `/messaging/${encodeURIComponent(session)}/chats/${encodeURIComponent(chatId)}`;
}

function chatMessagePath(
  session: string,
  chatId: string,
  messageId: string,
): string {
  return `${chatPath(session, chatId)}/messages/${encodeURIComponent(messageId)}`;
}
