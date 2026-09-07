import {
  CallsApiError,
  type AnswerMode,
  type CallsApi,
  type MediaTicket,
  type Participant,
  type PlaceCallRequest,
  type SocketTicket,
} from "@polymorfa/calls";
import { BrowserTransport } from "../transport.js";
import { CallsSignalingClient } from "./signaling.js";

/** Client-token call controls for WebRTC. The token determines the session. */
export class BrowserCallsApi implements CallsApi {
  readonly #transport: BrowserTransport;
  readonly #signaling: CallsSignalingClient;

  constructor(transport: BrowserTransport) {
    this.#transport = transport;
    this.#signaling = new CallsSignalingClient(transport);
  }

  async socketTicket(
    _session: string,
    signal?: AbortSignal,
  ): Promise<SocketTicket> {
    const response = await this.#transport.request<{ data?: SocketTicket }>({
      method: "POST",
      path: "/api/voip/ws-ticket",
      body: {},
      ...(signal === undefined ? {} : { signal }),
    });
    const ticket = response.data?.data;
    if (
      !ticket ||
      typeof ticket.ticket !== "string" ||
      !ticket.ticket ||
      typeof ticket.url !== "string" ||
      !ticket.url ||
      !Number.isFinite(ticket.expiresAt)
    )
      throw malformed("socket ticket");
    const url = this.#signaling.socketUrl(ticket);
    if (!/^wss?:\/\//.test(url)) throw malformed("socket URL");
    return { ...ticket, url };
  }

  async setMode(
    _session: string,
    mode: AnswerMode,
    signal?: AbortSignal,
  ): Promise<void> {
    if (mode !== "browser")
      throw new Error("Browser calls require browser answer mode for WebRTC.");
    await this.#transport.request({
      method: "POST",
      path: "/api/voip/mode",
      body: { mode },
      ...(signal === undefined ? {} : { signal }),
    });
  }

  mediaTicket(): Promise<MediaTicket> {
    return Promise.reject(
      new Error(
        "Browser calls use WebRTC; client tokens cannot mint agent tickets.",
      ),
    );
  }

  async place(
    input: PlaceCallRequest,
    signal?: AbortSignal,
  ): Promise<{ readonly callId: string }> {
    const response = await this.#transport.request<{
      data?: { callId?: unknown };
    }>({
      method: "POST",
      path: "/api/voip/calls",
      body: { to: input.to, video: input.video },
      idempotencyKey: input.idempotencyKey,
      ...(signal === undefined ? {} : { signal }),
    });
    const callId = response.data?.data?.callId;
    if (typeof callId !== "string" || !callId) throw malformed("call id");
    return { callId };
  }

  /** Browser mode already answered remotely; the controller now attaches WebRTC. */
  async accept(
    _callId: string,
    _options: { readonly video: boolean },
    signal?: AbortSignal,
  ): Promise<void> {
    signal?.throwIfAborted();
  }

  /** Browser-mode calls are already answered, so declining ends the call. */
  reject(callId: string, signal?: AbortSignal): Promise<void> {
    return this.hangup(callId, signal);
  }

  hangup(callId: string, signal?: AbortSignal): Promise<void> {
    return this.#signaling.teardown(callId, signal);
  }

  async addParticipant(
    callId: string,
    to: string,
    signal?: AbortSignal,
  ): Promise<Participant> {
    const response = await this.#transport.request<{ data?: Participant }>({
      method: "POST",
      path: `/api/voip/calls/${encodeURIComponent(callId)}/participants`,
      body: { to },
      ...(signal === undefined ? {} : { signal }),
    });
    const p = response.data?.data;
    if (
      !p ||
      typeof p.id !== "string" ||
      !p.id ||
      typeof p.handle !== "string" ||
      typeof p.audioMuted !== "boolean" ||
      typeof p.video !== "boolean" ||
      !["invited", "ringing", "connected", "left"].includes(p.state)
    )
      throw malformed("participant");
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
