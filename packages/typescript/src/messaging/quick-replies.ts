import { HttpTransport } from "../transport/http.js";
import type { ApiResponse, RequestOptions } from "../transport/types.js";
import type {
  BusinessQuickReplyMutation,
  CreateBusinessQuickReplyResponse,
  DeleteBusinessQuickReplyResponse,
  ListBusinessQuickRepliesResponse,
  ReplaceBusinessQuickReplyResponse,
} from "./types.js";

export class QuickRepliesResource {
  constructor(private readonly transport: HttpTransport) {}

  list(
    connection: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<ListBusinessQuickRepliesResponse>> {
    return this.transport.request({
      method: "GET",
      path: quickRepliesPath(connection),
      ...options,
    });
  }

  create(
    connection: string,
    body: BusinessQuickReplyMutation,
    options: RequestOptions = {},
  ): Promise<ApiResponse<CreateBusinessQuickReplyResponse>> {
    return this.transport.request({
      method: "POST",
      path: quickRepliesPath(connection),
      body,
      ...options,
    });
  }

  /** Replaces the complete quick reply identified by quickReplyId. */
  replace(
    connection: string,
    quickReplyId: string,
    body: BusinessQuickReplyMutation,
    options: RequestOptions = {},
  ): Promise<ApiResponse<ReplaceBusinessQuickReplyResponse>> {
    return this.transport.request({
      method: "PUT",
      path: quickReplyPath(connection, quickReplyId),
      body,
      ...options,
    });
  }

  delete(
    connection: string,
    quickReplyId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<DeleteBusinessQuickReplyResponse>> {
    return this.transport.request({
      method: "DELETE",
      path: quickReplyPath(connection, quickReplyId),
      ...options,
    });
  }
}

function quickRepliesPath(connection: string): string {
  return `/messaging/${encodeURIComponent(connection)}/business/quick-replies`;
}

function quickReplyPath(connection: string, quickReplyId: string): string {
  return `${quickRepliesPath(connection)}/${encodeURIComponent(quickReplyId)}`;
}
