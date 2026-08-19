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
export interface CallsSignaling {
  offer(callId: string, sdp: string, signal?: AbortSignal): Promise<SdpAnswer>;
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
  constructor(transport: BrowserTransport, apiPrefix = "/api") {
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
