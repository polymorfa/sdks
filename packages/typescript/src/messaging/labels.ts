import { HttpTransport } from "../transport/http.js";
import type { ApiResponse, RequestOptions } from "../transport/types.js";
import type {
  CreateLabelRequest,
  CreateLabelResponse,
  GetChatLabelsResponse,
  ListLabelsParams,
  ListLabelsResponse,
  ReplaceChatLabelsRequest,
  SuccessResponse,
  UpdateLabelRequest,
} from "./types.js";

export class LabelsResource {
  constructor(private readonly transport: HttpTransport) {}

  list(
    connection: string,
    params: ListLabelsParams = {},
    options: RequestOptions = {},
  ): Promise<ApiResponse<ListLabelsResponse>> {
    return this.read(labelsPath(connection), params, options);
  }

  create(
    connection: string,
    body: CreateLabelRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<CreateLabelResponse>> {
    return this.transport.request({
      method: "POST",
      path: labelsPath(connection),
      body,
      ...options,
    });
  }

  update(
    connection: string,
    labelId: string,
    body: UpdateLabelRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<SuccessResponse>> {
    return this.transport.request({
      method: "PUT",
      path: labelPath(connection, labelId),
      body,
      ...options,
    });
  }

  delete(
    connection: string,
    labelId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<SuccessResponse>> {
    return this.transport.request({
      method: "DELETE",
      path: labelPath(connection, labelId),
      ...options,
    });
  }

  listForChat(
    connection: string,
    chatId: string,
    params: ListLabelsParams = {},
    options: RequestOptions = {},
  ): Promise<ApiResponse<GetChatLabelsResponse>> {
    return this.read(chatLabelsPath(connection, chatId), params, options);
  }

  /** Replaces the chat's complete label set. Pass an empty array to detach all labels. */
  replaceForChat(
    connection: string,
    chatId: string,
    body: ReplaceChatLabelsRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<SuccessResponse>> {
    return this.transport.request({
      method: "PUT",
      path: chatLabelsPath(connection, chatId),
      body,
      ...options,
    });
  }

  private read(
    path: string,
    params: ListLabelsParams,
    options: RequestOptions,
  ): Promise<ApiResponse<ListLabelsResponse>> {
    return this.transport.request({
      method: "GET",
      path,
      ...(params.includeObservation === undefined
        ? {}
        : { query: { includeObservation: params.includeObservation } }),
      ...options,
    });
  }
}

function labelsPath(connection: string): string {
  return `/messaging/${encodeURIComponent(connection)}/labels`;
}

function labelPath(connection: string, labelId: string): string {
  return `${labelsPath(connection)}/${encodeURIComponent(labelId)}`;
}

function chatLabelsPath(connection: string, chatId: string): string {
  return `${labelsPath(connection)}/chats/${encodeURIComponent(chatId)}`;
}
