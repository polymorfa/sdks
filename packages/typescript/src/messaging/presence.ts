import { HttpTransport } from "../transport/http.js";
import type { ApiResponse, RequestOptions } from "../transport/types.js";
import type {
  GetChatPresenceResponse,
  GetPresenceResponse,
  SetPresenceRequest,
  SetPresenceResponse,
  SubscribePresenceResponse,
} from "./types.js";

export class PresenceResource {
  constructor(private readonly transport: HttpTransport) {}

  set(
    session: string,
    body: SetPresenceRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<SetPresenceResponse>> {
    return this.transport.request({
      method: "POST",
      path: presencePath(session),
      body,
      ...options,
    });
  }

  get(
    session: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<GetPresenceResponse>> {
    return this.transport.request({
      method: "GET",
      path: presencePath(session),
      ...options,
    });
  }

  getForChat(
    session: string,
    chatId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<GetChatPresenceResponse>> {
    return this.transport.request({
      method: "GET",
      path: chatPresencePath(session, chatId),
      ...options,
    });
  }

  subscribe(
    session: string,
    chatId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<SubscribePresenceResponse>> {
    return this.transport.request({
      method: "POST",
      path: `${chatPresencePath(session, chatId)}/subscribe`,
      ...options,
    });
  }
}

function presencePath(session: string): string {
  return `/messaging/${encodeURIComponent(session)}/presence`;
}

function chatPresencePath(session: string, chatId: string): string {
  return `${presencePath(session)}/${encodeURIComponent(chatId)}`;
}
