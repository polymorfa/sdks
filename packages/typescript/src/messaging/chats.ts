import type { MessagingCredential } from "../credentials.js";
import type { CustomerServiceWindow } from "./cloud-types.js";
import { PolymorfaConfigurationError } from "../errors.js";
import { HttpTransport } from "../transport/http.js";
import { withIdempotencyKey } from "../transport/idempotency.js";
import type { ApiResponse, RequestOptions } from "../transport/types.js";
import type {
  HistoryChat,
  HistoryMessage,
  HistoryPage,
  ListHistoryChatsParams,
  ListHistoryMessagesParams,
} from "./history.js";
import type {
  DisappearingTimerRequest,
  EditMessageRequest,
  MessageTransport,
  SuccessResponse,
} from "./types.js";

export interface DeleteMessageOptions extends RequestOptions {
  readonly transport?: MessageTransport;
}

export class ChatsResource {
  constructor(
    private readonly transport: HttpTransport,
    private readonly credentialType: MessagingCredential["type"],
  ) {}

  /** Official API beta. Requires chats:read and team enrollment; no HMS requirement. */
  getServiceWindow(
    session: string,
    conversation: string,
    options: RequestOptions = {},
  ): Promise<
    ApiResponse<{
      readonly success: true;
      readonly data: CustomerServiceWindow;
    }>
  > {
    if (this.credentialType === "clientToken") {
      throw new PolymorfaConfigurationError(
        "Service windows require an organization API key or project token.",
      );
    }
    return this.transport.request({
      method: "GET",
      path: `${chatPath(session, conversation)}/service-window`,
      ...options,
    });
  }

  /** Lists one page of stored conversations. Requires `chats:read` and enrolled HMS history access. */
  list(
    session: string,
    params: ListHistoryChatsParams = {},
    options: RequestOptions = {},
  ): Promise<ApiResponse<HistoryPage<HistoryChat>>> {
    this.assertHistoryCredential();
    return this.transport.request({
      method: "GET",
      path: `/messaging/${encodeURIComponent(session)}/chats`,
      query: { ...params },
      ...options,
    });
  }

  /** Reads a stored conversation by public ID or E.164 phone number. */
  retrieve(
    session: string,
    conversation: string,
    options: RequestOptions = {},
  ): Promise<
    ApiResponse<{ readonly success: true; readonly data: HistoryChat }>
  > {
    this.assertHistoryCredential();
    return this.transport.request({
      method: "GET",
      path: chatPath(session, conversation),
      ...options,
    });
  }

  /** Lists stored messages, newest first unless `order: "asc"` is supplied. */
  listMessages(
    session: string,
    conversation: string,
    params: ListHistoryMessagesParams = {},
    options: RequestOptions = {},
  ): Promise<ApiResponse<HistoryPage<HistoryMessage>>> {
    this.assertHistoryCredential();
    return this.transport.request({
      method: "GET",
      path: `${chatPath(session, conversation)}/messages`,
      query: { ...params },
      ...options,
    });
  }

  /** Reads one stored message by its opaque Polymorfa ID. */
  retrieveMessage(
    session: string,
    conversation: string,
    messageId: string,
    options: RequestOptions = {},
  ): Promise<
    ApiResponse<{ readonly success: true; readonly data: HistoryMessage }>
  > {
    this.assertHistoryCredential();
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
      path: chatMessagePath(session, chatId, messageId),
      query: { transport: options.transport },
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

  private assertHistoryCredential(): void {
    if (this.credentialType === "clientToken") {
      throw new PolymorfaConfigurationError(
        "Hosted message history requires a server credential.",
        "credential",
      );
    }
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
