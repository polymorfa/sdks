import {
  CallClaimedError,
  CallsApiError,
  CallsDisabledError,
} from "./errors.js";
import type { CallReport } from "./diagnostics.js";
import { isParticipant, type Participant } from "./protocol.js";
import {
  CallsTokenSource,
  isClientToken,
  type CallsToken,
  type CallsTokenProvider,
  type CallsTokenRequest,
} from "./token.js";

export {
  CallClaimedError,
  CallsApiError,
  CallsDisabledError,
} from "./errors.js";

/** Minimal request seam so tests and other transports can stand in for fetch. */
export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export interface AcceptCallOptions {
  /**
   * Claim the call. Other participants then receive `call_claimed` for
   * accept and media, and their open connections close. Default `false`:
   * others keep ringing and can join.
   */
  readonly exclusive?: boolean;
  readonly video?: boolean;
  /** Participant name for organization API keys and project tokens. */
  readonly participant?: string;
}

export interface AcceptCallResult {
  /** True once the call is answered (by this or an earlier accept). */
  readonly answered: boolean;
  /** Participant reference that answered the call first. */
  readonly answeredBy: string;
  /** True when `answeredBy` claimed the call. */
  readonly exclusive: boolean;
}

export interface PlaceCallRequest {
  /** Source session. Sent for server credentials; client tokens are bound to one. */
  readonly session: string;
  readonly to: string;
  readonly participants?: readonly string[];
  readonly groupId?: string;
  readonly video: boolean;
  /** Claim the call for the placing participant. Default `false`. */
  readonly exclusive?: boolean;
  /** Participant name for organization API keys and project tokens. */
  readonly participant?: string;
  readonly idempotencyKey: string;
}

/**
 * The platform operations the client needs, as one swappable seam — tests fake
 * it and the browser package backs it with its client-token transport.
 */
export interface CallsApi {
  sendReaction?(
    callId: string,
    connectionId: string,
    emoji: import("./protocol.js").CallReactionEmoji,
    participant?: string,
    signal?: AbortSignal,
  ): Promise<void>;
  setHandRaised?(
    callId: string,
    connectionId: string,
    raised: boolean,
    participant?: string,
    signal?: AbortSignal,
  ): Promise<void>;
  /** Credential for socket authentication frames. */
  token(request?: CallsTokenRequest): Promise<CallsToken>;
  /** Absolute `ws(s)://` URL for a socket path on the API host. */
  socketUrl(path: string): string;
  /** Start an outbound call; resolves the platform call id. */
  place(
    input: PlaceCallRequest,
    signal?: AbortSignal,
  ): Promise<{ readonly callId: string }>;
  /**
   * Answer a ringing call, or join an answered one that nobody claimed.
   * Rejects with {@link CallClaimedError} when another participant claimed it.
   */
  accept(
    callId: string,
    options: AcceptCallOptions,
    signal?: AbortSignal,
  ): Promise<AcceptCallResult>;
  /**
   * Decline a ringing call. This ends the call for everyone. `participant`
   * applies to server credentials only.
   */
  reject(
    callId: string,
    signal?: AbortSignal,
    participant?: string,
  ): Promise<void>;
  /** Close one media connection. The call continues. */
  leave(
    callId: string,
    connectionId: string,
    signal?: AbortSignal,
    participant?: string,
  ): Promise<void>;
  /** End the call for every participant. */
  end(callId: string, signal?: AbortSignal): Promise<void>;
  /**
   * Send a diagnostics report for one connection. Optional: without it the
   * client sends none. `participant` is dropped for client tokens.
   */
  report?(
    callId: string,
    report: CallReport,
    signal?: AbortSignal,
  ): Promise<void>;
  ringParticipant?(
    callId: string,
    to: string,
    signal?: AbortSignal,
  ): Promise<void>;
  addParticipant(
    callId: string,
    to: string,
    signal?: AbortSignal,
  ): Promise<Participant>;
}

export interface HttpCallsApiOptions {
  /**
   * Credential: a server API key or project token string, or a provider that
   * returns a client token minted by your server.
   */
  readonly token?: string | CallsTokenProvider;
  /** Server credential string; same as passing it as `token`. */
  readonly apiKey?: string;
  /** Defaults to `https://api.polymorfa.com`. */
  readonly baseUrl?: string;
  readonly fetch?: FetchLike;
  /** Socket host; defaults to `ws(s)://` on the API host. */
  readonly socketBaseUrl?: string;
  readonly now?: () => number;
}

/** Validate an accept response body. @internal */
export function parseAcceptResult(data: unknown): AcceptCallResult {
  if (
    data !== null &&
    typeof data === "object" &&
    typeof (data as Record<string, unknown>)["answered"] === "boolean" &&
    typeof (data as Record<string, unknown>)["answeredBy"] === "string" &&
    typeof (data as Record<string, unknown>)["exclusive"] === "boolean"
  ) {
    const d = data as Record<string, unknown>;
    return {
      answered: d["answered"] as boolean,
      answeredBy: d["answeredBy"] as string,
      exclusive: d["exclusive"] as boolean,
    };
  }
  throw malformed("accept");
}

/** Validate an add-participant response body. @internal */
export function parseParticipant(data: unknown): Participant {
  if (isParticipant(data)) return data;
  throw malformed("participant");
}

/** Map an HTTP failure to the Calls error vocabulary. @internal */
export function callsHttpError(
  status: number,
  code: string | undefined,
  message: string,
): CallsApiError {
  if (status === 409 && code === "call_claimed")
    return new CallClaimedError(message);
  if (status === 403 && code === "calls_disabled")
    return new CallsDisabledError(message);
  return new CallsApiError(status, code ?? `http_${status}`, message);
}

function malformed(operation: string): CallsApiError {
  return new CallsApiError(
    200,
    "malformed_response",
    `${operation}: response body did not carry the expected fields`,
  );
}

/** Credential-bearing implementation over the platform's REST routes. */
export class HttpCallsApi implements CallsApi {
  readonly #tokens: CallsTokenSource;
  readonly #baseUrl: string;
  readonly #fetch: FetchLike;
  readonly #socketBaseUrl: string;

  constructor(options: HttpCallsApiOptions) {
    const credential = options.token ?? options.apiKey;
    if (credential === undefined)
      throw new CallsApiError(
        0,
        "missing_credential",
        "HttpCallsApi needs a `token`.",
      );
    this.#tokens = new CallsTokenSource(credential, {
      ...(options.now === undefined ? {} : { now: options.now }),
    });
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

  token(request: CallsTokenRequest = {}): Promise<CallsToken> {
    return this.#tokens.get(request);
  }

  socketUrl(path: string): string {
    return `${this.#socketBaseUrl}${path.startsWith("/") ? "" : "/"}${path}`;
  }

  async place(
    input: PlaceCallRequest,
    signal?: AbortSignal,
  ): Promise<{ readonly callId: string }> {
    const data = await this.#request(
      "POST",
      "/messaging/voip/calls",
      async (token) => ({
        ...(isClientToken(token) ? {} : { session: input.session }),
        ...(input.groupId !== undefined
          ? { groupId: input.groupId }
          : input.participants === undefined
            ? { to: input.to }
            : { participants: input.participants }),
        video: input.video,
        ...(input.exclusive === undefined
          ? {}
          : { exclusive: input.exclusive }),
        ...(input.participant === undefined || isClientToken(token)
          ? {}
          : { participant: input.participant }),
      }),
      signal,
      { "idempotency-key": input.idempotencyKey },
    );
    const callId = (data as { callId?: unknown } | undefined)?.callId;
    if (typeof callId !== "string" || callId.length === 0)
      throw malformed("place");
    return { callId };
  }

  async accept(
    callId: string,
    options: AcceptCallOptions,
    signal?: AbortSignal,
  ): Promise<AcceptCallResult> {
    const data = await this.#request(
      "POST",
      callPath(callId, "/accept"),
      async (token) => ({
        exclusive: options.exclusive === true,
        ...(options.video === undefined ? {} : { video: options.video }),
        ...(options.participant === undefined || isClientToken(token)
          ? {}
          : { participant: options.participant }),
      }),
      signal,
    );
    return parseAcceptResult(data);
  }

  async reject(
    callId: string,
    signal?: AbortSignal,
    participant?: string,
  ): Promise<void> {
    await this.#request(
      "POST",
      callPath(callId, "/reject"),
      participant === undefined
        ? undefined
        : async (token) => (isClientToken(token) ? {} : { participant }),
      signal,
    );
  }

  async leave(
    callId: string,
    connectionId: string,
    signal?: AbortSignal,
    participant?: string,
  ): Promise<void> {
    await this.#request(
      "POST",
      callPath(callId, "/leave"),
      async (token) => ({
        connectionId,
        ...(participant === undefined || isClientToken(token)
          ? {}
          : { participant }),
      }),
      signal,
    );
  }

  async report(
    callId: string,
    report: CallReport,
    signal?: AbortSignal,
  ): Promise<void> {
    await this.#request(
      "POST",
      callPath(callId, "/reports"),
      async (token) => {
        if (!isClientToken(token) || report.participant === undefined)
          return report;
        // A client token acts as its own participant and must not name one.
        const body: Record<string, unknown> = { ...report };
        delete body["participant"];
        return body;
      },
      signal,
    );
  }

  async end(callId: string, signal?: AbortSignal): Promise<void> {
    await this.#request("DELETE", callPath(callId), undefined, signal, {
      "idempotency-key": `voip-end:${callId}`,
    });
  }

  async sendReaction(
    callId: string,
    connectionId: string,
    emoji: import("./protocol.js").CallReactionEmoji,
    participant?: string,
    signal?: AbortSignal,
  ): Promise<void> {
    await this.#social(
      callId,
      "/reaction",
      { connectionId, emoji },
      participant,
      signal,
    );
  }
  async setHandRaised(
    callId: string,
    connectionId: string,
    raised: boolean,
    participant?: string,
    signal?: AbortSignal,
  ): Promise<void> {
    await this.#social(
      callId,
      "/hand",
      { connectionId, raised },
      participant,
      signal,
    );
  }
  async #social(
    callId: string,
    suffix: string,
    body: Record<string, unknown>,
    participant?: string,
    signal?: AbortSignal,
  ): Promise<void> {
    await this.#request(
      "POST",
      callPath(callId, suffix),
      async (token) => ({
        ...body,
        ...(participant === undefined || isClientToken(token)
          ? {}
          : { participant }),
      }),
      signal,
    );
  }

  async ringParticipant(
    callId: string,
    to: string,
    signal?: AbortSignal,
  ): Promise<void> {
    await this.#request(
      "POST",
      callPath(callId, "/participants/ring"),
      async () => ({ to }),
      signal,
    );
  }

  async addParticipant(
    callId: string,
    to: string,
    signal?: AbortSignal,
  ): Promise<Participant> {
    const data = await this.#request(
      "POST",
      callPath(callId, "/participants"),
      async () => ({ to }),
      signal,
    );
    return parseParticipant(data);
  }

  async #request(
    method: string,
    path: string,
    body: ((token: string) => Promise<unknown>) | undefined,
    signal: AbortSignal | undefined,
    headers: Record<string, string> = {},
  ): Promise<unknown> {
    const token = await this.#tokens.get(
      signal === undefined ? {} : { signal },
    );
    const payload = body === undefined ? undefined : await body(token.value);
    const init: RequestInit = {
      method,
      headers: {
        authorization: `Bearer ${token.value}`,
        accept: "application/json",
        ...(payload === undefined
          ? {}
          : { "content-type": "application/json" }),
        ...headers,
      },
      ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
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
      if (response.status === 401) this.#tokens.invalidate();
      const record = (parsed ?? {}) as Record<string, unknown>;
      const error = record["error"];
      const code =
        error !== null && typeof error === "object"
          ? (error as Record<string, unknown>)["code"]
          : record["code"];
      const message =
        error !== null && typeof error === "object"
          ? (error as Record<string, unknown>)["message"]
          : typeof error === "string"
            ? error
            : record["message"];
      throw callsHttpError(
        response.status,
        typeof code === "string" ? code : undefined,
        typeof message === "string"
          ? message
          : `${method} ${path} failed with ${response.status}`,
      );
    }
    const envelope = parsed as { data?: unknown } | undefined;
    return envelope !== null &&
      typeof envelope === "object" &&
      "data" in envelope
      ? envelope.data
      : parsed;
  }
}

function callPath(callId: string, suffix = ""): string {
  return `/messaging/voip/calls/${encodeURIComponent(callId)}${suffix}`;
}
