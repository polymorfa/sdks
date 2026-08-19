import { HttpTransport } from "../transport/http.js";
import type { ApiResponse, RequestOptions } from "../transport/types.js";
import type {
  DisappearingTimerRequest,
  EditMessageRequest,
  SuccessResponse,
} from "./types.js";

export class ChatsResource {
  constructor(private readonly transport: HttpTransport) {}

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
  return `/api/${encodeURIComponent(session)}/chats/${encodeURIComponent(chatId)}`;
}

function chatMessagePath(
  session: string,
  chatId: string,
  messageId: string,
): string {
  return `${chatPath(session, chatId)}/messages/${encodeURIComponent(messageId)}`;
}
