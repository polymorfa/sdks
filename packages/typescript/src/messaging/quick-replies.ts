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
    session: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<ListBusinessQuickRepliesResponse>> {
    return this.transport.request({
      method: "GET",
      path: quickRepliesPath(session),
      ...options,
    });
  }

  create(
    session: string,
    body: BusinessQuickReplyMutation,
    options: RequestOptions = {},
  ): Promise<ApiResponse<CreateBusinessQuickReplyResponse>> {
    return this.transport.request({
      method: "POST",
      path: quickRepliesPath(session),
      body,
      ...options,
    });
  }

  /** Replaces the complete quick reply identified by quickReplyId. */
  replace(
    session: string,
    quickReplyId: string,
    body: BusinessQuickReplyMutation,
    options: RequestOptions = {},
  ): Promise<ApiResponse<ReplaceBusinessQuickReplyResponse>> {
    return this.transport.request({
      method: "PUT",
      path: quickReplyPath(session, quickReplyId),
      body,
      ...options,
    });
  }

  delete(
    session: string,
    quickReplyId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<DeleteBusinessQuickReplyResponse>> {
    return this.transport.request({
      method: "DELETE",
      path: quickReplyPath(session, quickReplyId),
      ...options,
    });
  }
}

function quickRepliesPath(session: string): string {
  return `/api/${encodeURIComponent(session)}/business/quick-replies`;
}

function quickReplyPath(session: string, quickReplyId: string): string {
  return `${quickRepliesPath(session)}/${encodeURIComponent(quickReplyId)}`;
}
