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
    connection: string,
    body: SetPresenceRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<SetPresenceResponse>> {
    return this.transport.request({
      method: "POST",
      path: presencePath(connection),
      body,
      ...options,
    });
  }

  get(
    connection: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<GetPresenceResponse>> {
    return this.transport.request({
      method: "GET",
      path: presencePath(connection),
      ...options,
    });
  }

  getForChat(
    connection: string,
    chatId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<GetChatPresenceResponse>> {
    return this.transport.request({
      method: "GET",
      path: chatPresencePath(connection, chatId),
      ...options,
    });
  }

  subscribe(
    connection: string,
    chatId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<SubscribePresenceResponse>> {
    return this.transport.request({
      method: "POST",
      path: `${chatPresencePath(connection, chatId)}/subscribe`,
      ...options,
    });
  }
}

function presencePath(connection: string): string {
  return `/messaging/${encodeURIComponent(connection)}/presence`;
}

function chatPresencePath(connection: string, chatId: string): string {
  return `${presencePath(connection)}/${encodeURIComponent(chatId)}`;
}
