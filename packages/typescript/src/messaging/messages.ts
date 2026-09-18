import { HttpTransport } from "../transport/http.js";
import type { ApiResponse, RequestOptions } from "../transport/types.js";
import { isoTime, loadHistoryPage, type HistoryPage } from "./history.js";
import type {
  HistoryMessage,
  ListMessagesParams,
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

  /**
   * Lists stored messages in one conversation, newest first by default. Beta;
   * requires `messages:read` and hosted message storage on the Number.
   * `conversation` is a conversation ID or an E.164 phone number.
   */
  list(
    session: string,
    conversation: string,
    params: ListMessagesParams = {},
    options: RequestOptions = {},
  ): Promise<HistoryPage<HistoryMessage>> {
    return loadHistoryPage<HistoryMessage>(
      this.transport,
      `${historyChatPath(session, conversation)}/messages`,
      {
        limit: params.limit,
        order: params.order,
        since: isoTime(params.since),
        until: isoTime(params.until),
        direction: params.direction,
        types: params.types === undefined ? undefined : params.types.join(","),
      },
      options,
      params.cursor,
    );
  }

  /** Returns one stored message. Beta; requires `messages:read`. */
  get(
    session: string,
    conversation: string,
    messageId: string,
    options: RequestOptions = {},
  ): Promise<
    ApiResponse<{ readonly success: true; readonly data: HistoryMessage }>
  > {
    return this.transport.request({
      method: "GET",
      path: `${historyChatPath(session, conversation)}/messages/${encodeURIComponent(messageId)}`,
      ...options,
    });
  }

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
      path: `/messaging/${encodeURIComponent(session)}/messages/${action}`,
      body,
      ...options,
    });
  }
}

function historyChatPath(session: string, conversation: string): string {
  return `/messaging/${encodeURIComponent(session)}/chats/${encodeURIComponent(conversation)}`;
}
