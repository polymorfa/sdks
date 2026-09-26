import type { MessagingCredential } from "../credentials.js";
import { PolymorfaConfigurationError } from "../errors.js";
import { HttpTransport } from "../transport/http.js";
import { withIdempotencyKey } from "../transport/idempotency.js";
import type { ApiResponse, RequestOptions } from "../transport/types.js";
import type {
  ReactRequest,
  MessageOperationResponse,
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
  constructor(
    private readonly transport: HttpTransport,
    private readonly credentialType: MessagingCredential["type"],
  ) {}

  /** Read the issuing principal's durable attempt. This method never resends. */
  operationStatus(
    session: string,
    operationId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<MessageOperationResponse>> {
    if (this.credentialType === "clientToken")
      throw new PolymorfaConfigurationError(
        "Message operation status requires a server credential.",
        "credential",
      );
    return this.transport.request({
      method: "GET",
      path: `/messaging/${encodeURIComponent(session)}/operations/${encodeURIComponent(operationId)}`,
      ...options,
    });
  }

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

  /** Official Numbers require an inbound id and state typing; marks it read for an indicator lasting at most 25 seconds. */
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
