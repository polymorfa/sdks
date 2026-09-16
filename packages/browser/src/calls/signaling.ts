import {
  CallClaimedError,
  type AcceptCallOptions,
  type AcceptCallResult,
  type CallsToken,
  type CallsTokenRequest,
} from "@polymorfa/calls";
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
/** An SDP offer for one media connection of a call. */
export interface OfferRequest {
  readonly sdp: string;
  readonly connectionId: string;
}

export interface CallsSignaling {
  offer(
    callId: string,
    request: OfferRequest,
    signal?: AbortSignal,
  ): Promise<SdpAnswer>;
  /**
   * Re-offer on an established connection (camera upgrade, more receive
   * slots, ICE restart). Optional for fakes.
   */
  renegotiate?(
    callId: string,
    request: OfferRequest,
    signal?: AbortSignal,
  ): Promise<SdpAnswer>;
  candidate(
    callId: string,
    candidate: TrickleCandidate,
    connectionId: string,
    signal?: AbortSignal,
  ): Promise<void>;
  /** Poll the pod's queued candidates for the call. */
  candidates(
    callId: string,
    signal?: AbortSignal,
  ): Promise<readonly TrickleCandidate[]>;
  /** Answer or join. Optional for fakes. */
  accept?(
    callId: string,
    options: AcceptCallOptions,
    signal?: AbortSignal,
  ): Promise<AcceptCallResult>;
  /** Decline a ringing call; ends it for everyone. Optional for fakes. */
  reject?(callId: string, signal?: AbortSignal): Promise<void>;
  /** Close one media connection; the call continues. */
  leave(
    callId: string,
    connectionId: string,
    signal?: AbortSignal,
  ): Promise<void>;
  /** End the call for every participant. */
  end(callId: string, signal?: AbortSignal): Promise<void>;
  /** Credential for socket authentication frames. Optional for fakes. */
  token?(request?: CallsTokenRequest): Promise<CallsToken>;
  /** Absolute `ws(s)://` URL for a socket path. Optional for fakes. */
  socketUrl?(path: string): string;
}

/** Client-token signaling over the Messaging REST routes. */
export class CallsSignalingClient implements CallsSignaling {
  readonly #transport: BrowserTransport;
  readonly #prefix: string;
  constructor(transport: BrowserTransport, apiPrefix = "/messaging") {
    this.#transport = transport;
    this.#prefix = apiPrefix.replace(/\/$/, "");
  }
  async offer(
    callId: string,
    request: OfferRequest,
    signal?: AbortSignal,
  ): Promise<SdpAnswer> {
    const response = await this.#transport.request<{
      readonly data: SdpAnswer;
    }>({
      method: "POST",
      path: this.#path(callId, "/offer"),
      body: { sdp: request.sdp, connectionId: request.connectionId },
      ...(signal === undefined ? {} : { signal }),
      idempotencyKey: `voip-offer:${callId}:${request.connectionId}:${nonce()}`,
    });
    return response.data.data;
  }
  async renegotiate(
    callId: string,
    request: OfferRequest,
    signal?: AbortSignal,
  ): Promise<SdpAnswer> {
    const response = await this.#transport.request<{
      readonly data: SdpAnswer;
    }>({
      method: "POST",
      path: this.#path(callId, "/renegotiate"),
      body: { sdp: request.sdp, connectionId: request.connectionId },
      ...(signal === undefined ? {} : { signal }),
    });
    return response.data.data;
  }
  async candidate(
    callId: string,
    candidate: TrickleCandidate,
    connectionId: string,
    signal?: AbortSignal,
  ): Promise<void> {
    await this.#transport.request({
      method: "POST",
      path: this.#path(callId, "/candidate"),
      body: { ...candidate, connectionId },
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
  async accept(
    callId: string,
    options: AcceptCallOptions,
    signal?: AbortSignal,
  ): Promise<AcceptCallResult> {
    const response = await this.#transport
      .request<{ readonly data?: unknown }>({
        method: "POST",
        path: this.#path(callId, "/accept"),
        body: {
          exclusive: options.exclusive === true,
          ...(options.video === undefined ? {} : { video: options.video }),
        },
        ...(signal === undefined ? {} : { signal }),
      })
      .catch((cause: unknown) => {
        throw claimedError(cause);
      });
    const data = response.data?.data as Partial<AcceptCallResult> | undefined;
    return {
      answered: data?.answered === true,
      answeredBy: typeof data?.answeredBy === "string" ? data.answeredBy : "",
      exclusive: data?.exclusive === true,
    };
  }
  async reject(callId: string, signal?: AbortSignal): Promise<void> {
    await this.#transport.request({
      method: "POST",
      path: this.#path(callId, "/reject"),
      ...(signal === undefined ? {} : { signal }),
    });
  }
  async leave(
    callId: string,
    connectionId: string,
    signal?: AbortSignal,
  ): Promise<void> {
    await this.#transport.request({
      method: "POST",
      path: this.#path(callId, "/leave"),
      body: { connectionId },
      ...(signal === undefined ? {} : { signal }),
      idempotencyKey: `voip-leave:${callId}:${connectionId}`,
    });
  }
  async end(callId: string, signal?: AbortSignal): Promise<void> {
    await this.#transport.request({
      method: "DELETE",
      path: this.#path(callId),
      ...(signal === undefined ? {} : { signal }),
      idempotencyKey: `voip-end:${callId}`,
    });
  }
  token(request: CallsTokenRequest = {}): Promise<CallsToken> {
    return this.#transport.token(
      request.refresh === undefined ? {} : { refresh: request.refresh },
    );
  }
  socketUrl(path: string): string {
    const url = new URL(path, `${this.#transport.baseUrl}/`);
    url.protocol =
      url.protocol === "https:"
        ? "wss:"
        : url.protocol === "http:"
          ? "ws:"
          : url.protocol;
    return url.toString();
  }
  #path(callId: string, suffix = ""): string {
    return `${this.#prefix}/voip/calls/${encodeURIComponent(callId)}${suffix}`;
  }
}

/** Turn a `409 call_claimed` HTTP failure into {@link CallClaimedError}. */
export function claimedError(cause: unknown): unknown {
  return isCallClaimed(cause)
    ? new CallClaimedError(cause instanceof Error ? cause.message : undefined)
    : cause;
}

/** True for a `409` failure whose code (or response body code) is `call_claimed`. */
export function isCallClaimed(cause: unknown): boolean {
  if (cause instanceof CallClaimedError) return true;
  const failure = cause as {
    status?: unknown;
    code?: unknown;
    details?: unknown;
  } | null;
  if (failure?.status !== 409) return false;
  if (failure.code === "call_claimed") return true;
  const details = failure.details as Record<string, unknown> | undefined;
  const error = details?.["error"] as Record<string, unknown> | undefined;
  return (
    error?.["code"] === "call_claimed" || details?.["code"] === "call_claimed"
  );
}

function nonce(): string {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
