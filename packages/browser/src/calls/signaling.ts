import { BrowserTransport } from "../transport.js";

export interface IceServer {
  readonly urls: string | readonly string[];
  readonly username?: string;
  readonly credential?: string;
}
export interface SdpAnswer {
  readonly sdp: string;
  readonly iceServers: readonly IceServer[];
}
export interface TrickleCandidate {
  readonly candidate: string;
  readonly sdpMid?: string;
  readonly sdpMLineIndex?: number;
}
/** A single-use ticket for the calls WebSocket (`POST /messaging/voip/ws-ticket`). */
export interface SocketTicket {
  readonly ticket: string;
  /** Unix epoch milliseconds. */
  readonly expiresAt: number;
  /** Root-relative or absolute URL of the socket, ticket included. */
  readonly url: string;
}
export interface CallsSignaling {
  offer(callId: string, sdp: string, signal?: AbortSignal): Promise<SdpAnswer>;
  /**
   * Re-offer on an established call (audio→video upgrade, ICE restart). The
   * pod answers on the same peer connection. Optional for fakes.
   */
  renegotiate?(
    callId: string,
    sdp: string,
    signal?: AbortSignal,
  ): Promise<SdpAnswer>;
  /** Mint a single-use ticket for the calls WebSocket. Optional for fakes. */
  socketTicket?(session?: string, signal?: AbortSignal): Promise<SocketTicket>;
  /** Absolute `ws(s)://` URL for a ticket. Optional for fakes. */
  socketUrl?(ticket: SocketTicket): string;
  candidate(
    callId: string,
    candidate: TrickleCandidate,
    signal?: AbortSignal,
  ): Promise<void>;
  candidates(
    callId: string,
    signal?: AbortSignal,
  ): Promise<readonly TrickleCandidate[]>;
  teardown(callId: string, signal?: AbortSignal): Promise<void>;
}

export class CallsSignalingClient implements CallsSignaling {
  readonly #transport: BrowserTransport;
  readonly #prefix: string;
  constructor(transport: BrowserTransport, apiPrefix = "/messaging") {
    this.#transport = transport;
    this.#prefix = apiPrefix.replace(/\/$/, "");
  }
  async offer(
    callId: string,
    sdp: string,
    signal?: AbortSignal,
  ): Promise<SdpAnswer> {
    const response = await this.#transport.request<{
      readonly data: SdpAnswer;
    }>({
      method: "POST",
      path: this.#path(callId, "/offer"),
      body: { sdp },
      ...(signal === undefined ? {} : { signal }),
      idempotencyKey: `voip-offer:${callId}`,
    });
    return response.data.data;
  }
  async renegotiate(
    callId: string,
    sdp: string,
    signal?: AbortSignal,
  ): Promise<SdpAnswer> {
    const response = await this.#transport.request<{
      readonly data: SdpAnswer;
    }>({
      method: "POST",
      path: this.#path(callId, "/renegotiate"),
      body: { sdp },
      ...(signal === undefined ? {} : { signal }),
    });
    return response.data.data;
  }
  /**
   * Mint a socket ticket. The `session` argument is accepted for interface
   * compatibility and deliberately not sent: this client authenticates with a
   * `pmfa_ct_` token, which the API binds to exactly one session and refuses
   * (403) when a request names another. The bound session is used instead.
   */
  async socketTicket(
    _session?: string,
    signal?: AbortSignal,
  ): Promise<SocketTicket> {
    const response = await this.#transport.request<{
      readonly data: SocketTicket;
    }>({
      method: "POST",
      path: `${this.#prefix}/voip/ws-ticket`,
      body: {},
      ...(signal === undefined ? {} : { signal }),
    });
    return response.data.data;
  }
  socketUrl(ticket: SocketTicket): string {
    const url = new URL(ticket.url, `${this.#transport.baseUrl}/`);
    url.protocol =
      url.protocol === "https:"
        ? "wss:"
        : url.protocol === "http:"
          ? "ws:"
          : url.protocol;
    return url.toString();
  }
  async candidate(
    callId: string,
    candidate: TrickleCandidate,
    signal?: AbortSignal,
  ): Promise<void> {
    await this.#transport.request({
      method: "POST",
      path: this.#path(callId, "/candidate"),
      body: candidate,
      ...(signal === undefined ? {} : { signal }),
    });
  }
  async candidates(
    callId: string,
    signal?: AbortSignal,
  ): Promise<readonly TrickleCandidate[]> {
    const response = await this.#transport.request<{
      readonly data: { readonly candidates: readonly TrickleCandidate[] };
    }>({
      method: "GET",
      path: this.#path(callId, "/candidates"),
      ...(signal === undefined ? {} : { signal }),
    });
    return response.data.data.candidates;
  }
  async teardown(callId: string, signal?: AbortSignal): Promise<void> {
    await this.#transport.request({
      method: "DELETE",
      path: this.#path(callId),
      ...(signal === undefined ? {} : { signal }),
      idempotencyKey: `voip-teardown:${callId}`,
    });
  }
  #path(callId: string, suffix = ""): string {
    return `${this.#prefix}/voip/calls/${encodeURIComponent(callId)}${suffix}`;
  }
}
