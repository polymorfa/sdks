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
    session: string,
    params: ListLabelsParams = {},
    options: RequestOptions = {},
  ): Promise<ApiResponse<ListLabelsResponse>> {
    return this.read(labelsPath(session), params, options);
  }

  create(
    session: string,
    body: CreateLabelRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<CreateLabelResponse>> {
    return this.transport.request({
      method: "POST",
      path: labelsPath(session),
      body,
      ...options,
    });
  }

  update(
    session: string,
    labelId: string,
    body: UpdateLabelRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<SuccessResponse>> {
    return this.transport.request({
      method: "PUT",
      path: labelPath(session, labelId),
      body,
      ...options,
    });
  }

  delete(
    session: string,
    labelId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<SuccessResponse>> {
    return this.transport.request({
      method: "DELETE",
      path: labelPath(session, labelId),
      ...options,
    });
  }

  listForChat(
    session: string,
    chatId: string,
    params: ListLabelsParams = {},
    options: RequestOptions = {},
  ): Promise<ApiResponse<GetChatLabelsResponse>> {
    return this.read(chatLabelsPath(session, chatId), params, options);
  }

  /** Replaces the chat's complete label set. Pass an empty array to detach all labels. */
  replaceForChat(
    session: string,
    chatId: string,
    body: ReplaceChatLabelsRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<SuccessResponse>> {
    return this.transport.request({
      method: "PUT",
      path: chatLabelsPath(session, chatId),
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

function labelsPath(session: string): string {
  return `/messaging/${encodeURIComponent(session)}/labels`;
}

function labelPath(session: string, labelId: string): string {
  return `${labelsPath(session)}/${encodeURIComponent(labelId)}`;
}

function chatLabelsPath(session: string, chatId: string): string {
  return `${labelsPath(session)}/chats/${encodeURIComponent(chatId)}`;
}
