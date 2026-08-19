import { HttpTransport } from "../transport/http.js";
import type { ApiResponse, RequestOptions } from "../transport/types.js";
import type {
  ReactRequest,
  SeenRequest,
  SendMessageRequest,
  SendMessageResponse,
  SendReactionResponse,
  StarMessageResponse,
  StarRequest,
  SuccessResponse,
  TypingRequest,
} from "./types.js";

export class MessagesResource {
  constructor(private readonly transport: HttpTransport) {}

  send(
    session: string,
    body: SendMessageRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<SendMessageResponse>> {
    return this.post(session, "send", body, options);
  }

  markSeen(
    session: string,
    body: SeenRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<SuccessResponse>> {
    return this.post(session, "seen", body, options);
  }

  setTyping(
    session: string,
    body: TypingRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<SuccessResponse>> {
    return this.post(session, "typing", body, options);
  }

  react(
    session: string,
    body: ReactRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<SendReactionResponse>> {
    return this.post(session, "react", body, options);
  }

  star(
    session: string,
    body: StarRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<StarMessageResponse>> {
    return this.post(session, "star", body, options);
  }

  private post<T>(
    session: string,
    action: "send" | "seen" | "typing" | "react" | "star",
    body: unknown,
    options: RequestOptions,
  ): Promise<ApiResponse<T>> {
    return this.transport.request({
      method: "POST",
      path: `/api/${encodeURIComponent(session)}/messages/${action}`,
      body,
      ...options,
    });
  }
}
