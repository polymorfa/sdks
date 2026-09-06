import type { Participant } from "./protocol.js";

/** Minimal request seam so tests and other transports can stand in for fetch. */
export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export interface SocketTicket {
  readonly ticket: string;
  /** Unix epoch milliseconds. */
  readonly expiresAt: number;
  /** Root-relative or absolute URL of the lifecycle socket, ticket included. */
  readonly url: string;
}

export interface MediaTicket {
  readonly token: string;
  /** Unix epoch milliseconds. */
  readonly expiresAt: number;
  /** Absolute `ws(s)://` URL of the pod's media socket for this call. */
  readonly url: string;
}

export interface PlaceCallRequest {
  readonly session: string;
  readonly to: string;
  readonly video: boolean;
  readonly idempotencyKey: string;
}

/**
 * The server-key operations the client needs. Kept as an interface so the
 * platform calls are one swappable seam — tests fake it, and the browser kit
 * can back it with a client-token transport where the operation is permitted.
 */
export interface CallsApi {
  socketTicket(session: string, signal?: AbortSignal): Promise<SocketTicket>;
  mediaTicket(callId: string, signal?: AbortSignal): Promise<MediaTicket>;
  /** Start an outbound call on a linked-device session; resolves the platform call id. */
  place(
    input: PlaceCallRequest,
    signal?: AbortSignal,
  ): Promise<{ readonly callId: string }>;
  accept(
    callId: string,
    options: { readonly video: boolean },
    signal?: AbortSignal,
  ): Promise<void>;
  reject(callId: string, signal?: AbortSignal): Promise<void>;
  hangup(callId: string, signal?: AbortSignal): Promise<void>;
  addParticipant(
    callId: string,
    to: string,
    signal?: AbortSignal,
  ): Promise<Participant>;
}

export interface HttpCallsApiOptions {
  readonly apiKey: string;
  /** Defaults to `https://api.polymorfa.com`. */
  readonly baseUrl?: string;
  readonly fetch?: FetchLike;
  /** Seam for the socket URL scheme swap; defaults to `ws(s)://` on the API host. */
  readonly socketBaseUrl?: string;
}

export class CallsApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "CallsApiError";
  }
}

/**
 * Server-key implementation over the platform's REST routes.
 *
 * `socketTicket`, `mediaTicket` and `hangup` are the routes that exist today.
 * `place`, `accept`, `reject` and `addParticipant` are the routes the
 * programmatic leg adds on the platform side; they are written here against
 * their agreed paths so the client is complete, and they fail with a clear
 * 404 `CallsApiError` against a platform that does not carry them yet.
 */
export class HttpCallsApi implements CallsApi {
  readonly #apiKey: string;
  readonly #baseUrl: string;
  readonly #fetch: FetchLike;
  readonly #socketBaseUrl: string;

  constructor(options: HttpCallsApiOptions) {
    this.#apiKey = options.apiKey;
    this.#baseUrl = (options.baseUrl ?? "https://api.polymorfa.com").replace(
      /\/+$/,
      "",
    );
    this.#fetch =
      options.fetch ?? ((input, init) => globalThis.fetch(input, init));
    this.#socketBaseUrl = (options.socketBaseUrl ?? this.#baseUrl)
      .replace(/^http:/, "ws:")
      .replace(/^https:/, "wss:")
      .replace(/\/+$/, "");
  }

  async socketTicket(
    session: string,
    signal?: AbortSignal,
  ): Promise<SocketTicket> {
    const data = await this.#request<SocketTicket>(
      "POST",
      "/api/voip/ws-ticket",
      { session },
      signal,
    );
    return { ...data, url: this.#absoluteSocketUrl(data.url) };
  }

  async mediaTicket(
    callId: string,
    signal?: AbortSignal,
  ): Promise<MediaTicket> {
    const data = await this.#request<{
      token: string;
      expiresAt: number;
      url?: string;
    }>(
      "POST",
      `/api/voip/calls/${encodeURIComponent(callId)}/agent-token`,
      {},
      signal,
    );
    return {
      token: data.token,
      expiresAt: data.expiresAt,
      url: this.#absoluteSocketUrl(
        data.url ?? `/voip/sdk?callId=${encodeURIComponent(callId)}`,
      ),
    };
  }

  place(
    input: PlaceCallRequest,
    signal?: AbortSignal,
  ): Promise<{ readonly callId: string }> {
    return this.#request(
      "POST",
      "/api/voip/calls",
      { session: input.session, to: input.to, video: input.video },
      signal,
      { "idempotency-key": input.idempotencyKey },
    );
  }

  async accept(
    callId: string,
    options: { readonly video: boolean },
    signal?: AbortSignal,
  ): Promise<void> {
    await this.#request(
      "POST",
      `/api/voip/calls/${encodeURIComponent(callId)}/accept`,
      options,
      signal,
    );
  }

  async reject(callId: string, signal?: AbortSignal): Promise<void> {
    await this.#request(
      "POST",
      `/api/voip/calls/${encodeURIComponent(callId)}/reject`,
      {},
      signal,
    );
  }

  async hangup(callId: string, signal?: AbortSignal): Promise<void> {
    await this.#request(
      "DELETE",
      `/api/voip/calls/${encodeURIComponent(callId)}`,
      undefined,
      signal,
      {
        "idempotency-key": `voip-teardown:${callId}`,
      },
    );
  }

  addParticipant(
    callId: string,
    to: string,
    signal?: AbortSignal,
  ): Promise<Participant> {
    return this.#request(
      "POST",
      `/api/voip/calls/${encodeURIComponent(callId)}/participants`,
      { to },
      signal,
    );
  }

  #absoluteSocketUrl(url: string): string {
    if (/^wss?:\/\//.test(url)) return url;
    if (/^https?:\/\//.test(url)) return url.replace(/^http/, "ws");
    return `${this.#socketBaseUrl}${url.startsWith("/") ? "" : "/"}${url}`;
  }

  async #request<T>(
    method: string,
    path: string,
    body: unknown,
    signal: AbortSignal | undefined,
    headers: Record<string, string> = {},
  ): Promise<T> {
    const init: RequestInit = {
      method,
      headers: {
        authorization: `Bearer ${this.#apiKey}`,
        accept: "application/json",
        ...(body === undefined ? {} : { "content-type": "application/json" }),
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      ...(signal === undefined ? {} : { signal }),
    };
    const response = await this.#fetch(`${this.#baseUrl}${path}`, init);
    const text = await response.text();
    let parsed: unknown = undefined;
    if (text.length > 0) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = undefined;
      }
    }
    if (!response.ok) {
      const err = (
        parsed as { error?: { code?: string; message?: string } } | undefined
      )?.error;
      throw new CallsApiError(
        response.status,
        err?.code ?? `http_${response.status}`,
        err?.message ?? `${method} ${path} failed with ${response.status}`,
      );
    }
    const envelope = parsed as { data?: T } | undefined;
    return (envelope?.data ?? (parsed as T)) as T;
  }
}
