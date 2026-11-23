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
import type { MediaDownloadStream } from "./media.js";
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
    connection: string,
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
        "Service windows require a team key or project token.",
      );
    }
    return this.transport.request({
      method: "GET",
      path: `${chatPath(connection, conversation)}/service-window`,
      ...options,
    });
  }

  /** Lists one page of stored conversations. Requires `chats:read` and enrolled HMS history access. */
  list(
    connection: string,
    params: ListHistoryChatsParams = {},
    options: RequestOptions = {},
  ): Promise<ApiResponse<HistoryPage<HistoryChat>>> {
    this.assertHistoryCredential();
    return this.transport.request({
      method: "GET",
      path: `/messaging/${encodeURIComponent(connection)}/chats`,
      query: { ...params },
      ...options,
    });
  }

  /** Reads a stored conversation by public ID or E.164 phone number. */
  retrieve(
    connection: string,
    conversation: string,
    options: RequestOptions = {},
  ): Promise<
    ApiResponse<{ readonly success: true; readonly data: HistoryChat }>
  > {
    this.assertHistoryCredential();
    return this.transport.request({
      method: "GET",
      path: chatPath(connection, conversation),
      ...options,
    });
  }

  /** Lists stored messages, newest first unless `order: "asc"` is supplied. */
  listMessages(
    connection: string,
    conversation: string,
    params: ListHistoryMessagesParams = {},
    options: RequestOptions = {},
  ): Promise<ApiResponse<HistoryPage<HistoryMessage>>> {
    this.assertHistoryCredential();
    return this.transport.request({
      method: "GET",
      path: `${chatPath(connection, conversation)}/messages`,
      query: { ...params },
      ...options,
    });
  }

  /** Reads one stored message by its opaque Polymorfa ID. */
  retrieveMessage(
    connection: string,
    conversation: string,
    messageId: string,
    options: RequestOptions = {},
  ): Promise<
    ApiResponse<{ readonly success: true; readonly data: HistoryMessage }>
  > {
    this.assertHistoryCredential();
    return this.transport.request({
      method: "GET",
      path: chatMessagePath(connection, conversation, messageId),
      ...options,
    });
  }

  /** Downloads a stored Official API message copy. Requires `messages:read`, `media:read`, and enrolled HMS history access. */
  downloadMessageMedia(
    connection: string,
    conversation: string,
    messageId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<ArrayBuffer>> {
    this.assertHistoryCredential();
    return this.transport.requestBinary({
      method: "GET",
      path: `${chatMessagePath(connection, conversation, messageId)}/media`,
      ...options,
    });
  }

  /** Streams a stored Official API message copy without buffering the file. */
  async downloadMessageMediaStream(
    connection: string,
    conversation: string,
    messageId: string,
    options: RequestOptions = {},
  ): Promise<MediaDownloadStream> {
    this.assertHistoryCredential();
    const response = await this.transport.requestStream({
      method: "GET",
      path: `${chatMessagePath(connection, conversation, messageId)}/media`,
      ...options,
    });
    return Object.freeze({
      body: response.body,
      ...(response.contentType === undefined
        ? {}
        : { contentType: response.contentType }),
      ...(response.contentLength === undefined
        ? {}
        : { contentLength: response.contentLength }),
      ...(response.filename === undefined
        ? {}
        : { filename: response.filename }),
      ...(response.metadata.requestId === undefined
        ? {}
        : { requestId: response.metadata.requestId }),
      redirected: response.redirected,
      metadata: response.metadata,
    });
  }

  editMessage(
    connection: string,
    chatId: string,
    messageId: string,
    body: EditMessageRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<SuccessResponse>> {
    return this.transport.request({
      method: "PUT",
      path: chatMessagePath(connection, chatId, messageId),
      body,
      ...withIdempotencyKey(options),
    });
  }

  deleteMessage(
    connection: string,
    chatId: string,
    messageId: string,
    options: DeleteMessageOptions = {},
  ): Promise<ApiResponse<SuccessResponse>> {
    return this.transport.request({
      method: "DELETE",
      path: chatMessagePath(connection, chatId, messageId),
      query: { transport: options.transport },
      ...withIdempotencyKey(options),
    });
  }

  archive(
    connection: string,
    chatId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<SuccessResponse>> {
    return this.updateArchiveState(connection, chatId, "archive", options);
  }

  unarchive(
    connection: string,
    chatId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<SuccessResponse>> {
    return this.updateArchiveState(connection, chatId, "unarchive", options);
  }

  setDisappearingTimer(
    connection: string,
    chatId: string,
    body: DisappearingTimerRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<SuccessResponse>> {
    return this.transport.request({
      method: "PUT",
      path: `${chatPath(connection, chatId)}/disappearing`,
      body,
      ...options,
    });
  }

  private updateArchiveState(
    connection: string,
    chatId: string,
    action: "archive" | "unarchive",
    options: RequestOptions,
  ): Promise<ApiResponse<SuccessResponse>> {
    return this.transport.request({
      method: "POST",
      path: `${chatPath(connection, chatId)}/${action}`,
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

function chatPath(connection: string, chatId: string): string {
  return `/messaging/${encodeURIComponent(connection)}/chats/${encodeURIComponent(chatId)}`;
}

function chatMessagePath(
  connection: string,
  chatId: string,
  messageId: string,
): string {
  return `${chatPath(connection, chatId)}/messages/${encodeURIComponent(messageId)}`;
}
