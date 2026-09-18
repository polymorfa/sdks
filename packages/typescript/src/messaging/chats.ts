import { HttpTransport } from "../transport/http.js";
import type { ApiResponse, RequestOptions } from "../transport/types.js";
import type {
  DisappearingTimerRequest,
  EditMessageRequest,
  HistoryChat,
  ListChatsParams,
  SuccessResponse,
} from "./types.js";
import { isoTime, loadHistoryPage, type HistoryPage } from "./history.js";

export class ChatsResource {
  constructor(private readonly transport: HttpTransport) {}

  /**
   * Lists stored conversations for a Number with hosted message storage, most
   * recent activity first. Beta; requires `chats:read`. Iterate the returned
   * page with `for await` to read every page.
   */
  list(
    session: string,
    params: ListChatsParams = {},
    options: RequestOptions = {},
  ): Promise<HistoryPage<HistoryChat>> {
    return loadHistoryPage<HistoryChat>(
      this.transport,
      `/messaging/${encodeURIComponent(session)}/chats`,
      {
        limit: params.limit,
        kind: params.kind,
        activeSince: isoTime(params.activeSince),
        activeBefore: isoTime(params.activeBefore),
      },
      options,
      params.cursor,
    );
  }

  /** Returns one stored conversation. Beta; requires `chats:read`. */
  async get(
    session: string,
    conversation: string,
    options: RequestOptions = {},
  ): Promise<
    ApiResponse<{ readonly success: true; readonly data: HistoryChat }>
  > {
    return this.transport.request({
      method: "GET",
      path: chatPath(session, conversation),
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
      ...options,
    });
  }

  deleteMessage(
    session: string,
    chatId: string,
    messageId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<SuccessResponse>> {
    return this.transport.request({
      method: "DELETE",
      path: chatMessagePath(session, chatId, messageId),
      ...options,
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
