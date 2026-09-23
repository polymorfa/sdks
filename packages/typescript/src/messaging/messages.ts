import { HttpTransport } from "../transport/http.js";
import { withIdempotencyKey } from "../transport/idempotency.js";
import type { ApiResponse, RequestOptions } from "../transport/types.js";
import type {
  ReactRequest,
  SeenRequest,
  SendMessageRequest,
  SendMessageResponse,
  SendReactionResponse,
  StarMessageResponse,
  StarRequest,
  SuccessEnvelope,
  TypingRequest,
} from "./types.js";

export class MessagesResource {
  constructor(private readonly transport: HttpTransport) {}

  send(
    session: string,
    body: SendMessageRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<SendMessageResponse>> {
    return this.post(session, "send", body, withIdempotencyKey(options));
  }

  markSeen(
    session: string,
    body: SeenRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<SuccessEnvelope<{ readonly status: string }>>> {
    return this.post(session, "seen", body, options);
  }

  setTyping(
    session: string,
    body: TypingRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<SuccessEnvelope<{ readonly status: string }>>> {
    return this.post(session, "typing", body, options);
  }

  react(
    session: string,
    body: ReactRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<SendReactionResponse>> {
    return this.post(session, "react", body, withIdempotencyKey(options));
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
      path: `/messaging/${encodeURIComponent(session)}/messages/${action}`,
      body,
      ...options,
    });
  }
}
