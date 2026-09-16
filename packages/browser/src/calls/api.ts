import {
  CallsApiError,
  isParticipant,
  type AcceptCallOptions,
  type AcceptCallResult,
  type CallsApi,
  type CallsToken,
  type CallsTokenRequest,
  type Participant,
  type PlaceCallRequest,
} from "@polymorfa/calls/internal";
import { BrowserTransport } from "../transport.js";
import { CallsSignalingClient, claimedError } from "./signaling.js";

/**
 * Client-token call controls. The token determines the session and the
 * participant, so `session` and `participant` are never sent.
 */
export class BrowserCallsApi implements CallsApi {
  readonly #transport: BrowserTransport;
  readonly #signaling: CallsSignalingClient;

  constructor(transport: BrowserTransport) {
    this.#transport = transport;
    this.#signaling = new CallsSignalingClient(transport);
  }

  token(request: CallsTokenRequest = {}): Promise<CallsToken> {
    return this.#signaling.token(request);
  }

  socketUrl(path: string): string {
    const url = this.#signaling.socketUrl(path);
    if (!/^wss?:\/\//.test(url)) throw malformed("socket URL");
    return url;
  }

  async place(
    input: PlaceCallRequest,
    signal?: AbortSignal,
  ): Promise<{ readonly callId: string }> {
    const response = await this.#transport
      .request<{
        data?: { callId?: unknown };
      }>({
        method: "POST",
        path: "/messaging/voip/calls",
        body: {
          to: input.to,
          video: input.video,
          ...(input.exclusive === undefined
            ? {}
            : { exclusive: input.exclusive }),
        },
        idempotencyKey: input.idempotencyKey,
        ...(signal === undefined ? {} : { signal }),
      })
      .catch((cause: unknown) => {
        throw claimedError(cause);
      });
    const callId = response.data?.data?.callId;
    if (typeof callId !== "string" || !callId) throw malformed("call id");
    return { callId };
  }

  async accept(
    callId: string,
    options: AcceptCallOptions,
    signal?: AbortSignal,
  ): Promise<AcceptCallResult> {
    const response = await this.#transport
      .request<{ data?: unknown }>({
        method: "POST",
        path: `/messaging/voip/calls/${encodeURIComponent(callId)}/accept`,
        body: {
          exclusive: options.exclusive === true,
          ...(options.video === undefined ? {} : { video: options.video }),
        },
        ...(signal === undefined ? {} : { signal }),
      })
      .catch((cause: unknown) => {
        throw claimedError(cause);
      });
    const data = response.data?.data as Record<string, unknown> | undefined;
    if (
      typeof data?.["answered"] !== "boolean" ||
      typeof data["answeredBy"] !== "string" ||
      typeof data["exclusive"] !== "boolean"
    )
      throw malformed("accept result");
    return {
      answered: data["answered"],
      answeredBy: data["answeredBy"],
      exclusive: data["exclusive"],
    };
  }

  reject(callId: string, signal?: AbortSignal): Promise<void> {
    return this.#signaling.reject(callId, signal);
  }

  leave(
    callId: string,
    connectionId: string,
    signal?: AbortSignal,
  ): Promise<void> {
    return this.#signaling.leave(callId, connectionId, signal);
  }

  end(callId: string, signal?: AbortSignal): Promise<void> {
    return this.#signaling.end(callId, signal);
  }

  async addParticipant(
    callId: string,
    to: string,
    signal?: AbortSignal,
  ): Promise<Participant> {
    const response = await this.#transport
      .request<{ data?: unknown }>({
        method: "POST",
        path: `/messaging/voip/calls/${encodeURIComponent(callId)}/participants`,
        body: { to },
        ...(signal === undefined ? {} : { signal }),
      })
      .catch((cause: unknown) => {
        throw claimedError(cause);
      });
    const p = response.data?.data;
    if (!isParticipant(p)) throw malformed("participant");
    return p;
  }
}

function malformed(field: string): CallsApiError {
  return new CallsApiError(
    200,
    "malformed_response",
    `Calls response has an invalid ${field}.`,
  );
}
