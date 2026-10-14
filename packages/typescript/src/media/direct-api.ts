/**
 * Polymorfa API calls used by direct media upload and direct history.
 *
 * Uses the 2026-10-14 direct media/history contract. Uploads carry encrypted
 * bytes and hashes; upload requests never carry a media key or plaintext.
 * Standard descriptor sending is a separate API and includes the media key.
 */
import { PolymorfaError } from "../errors.js";
import type { HttpTransport } from "../transport/http.js";
import type { RequestOptions } from "../transport/types.js";
import type { WhatsAppUploadMediaType } from "./encrypt.js";
import { isWhatsAppMediaUrl } from "./whatsapp.js";

/**
 * `POST /messaging/{session}/media/upload-grants` request.
 * @experimental Requires the 2026-10-14 API contract.
 */
export interface WhatsAppUploadGrantRequest {
  readonly mediaType: WhatsAppUploadMediaType;
  /** Base64url SHA-256 of `ciphertext || mac10`, unpadded. */
  readonly fileEncSha256: string;
  /** Length of `ciphertext || mac10`. */
  readonly encryptedLength: number;
}

/**
 * A short-lived WhatsApp upload credential for one session. `auth` is a
 * bearer secret: never log or store it.
 * @experimental Requires the 2026-10-14 API contract.
 */
export interface WhatsAppUploadGrant {
  /** WhatsApp media upload hostnames in preference order. */
  readonly hosts: readonly string[];
  /** Exact server-issued URL; retains authorization and upload parameters. */
  readonly uploadUrl: string;
  /** The `media_conn` `auth` value. */
  readonly auth: string;
  /** ISO 8601 expiry. */
  readonly expiresAt?: string;
}

/**
 * `POST /messaging/{session}/media/uploads` response. The request body
 * is `ciphertext || mac10` (`application/octet-stream`) with query
 * parameters `type`, `fileEncSha256` (base64url) and optional `ptt`.
 * The encrypted length is carried in `Content-Length`.
 * @experimental Requires the 2026-10-14 API contract.
 */
export interface WhatsAppRelayUploadResponse {
  readonly directPath: string;
  readonly url: string;
  readonly handle?: string;
}

/**
 * Asks the phone to send a history chunk again (peer data operation
 * `HISTORY_SYNC_CHUNK_RETRY`). `POST /messaging/{session}/history/chunks/retry`.
 * @experimental Requires the 2026-10-14 API contract.
 */
export interface HistorySyncChunkRetryRequest {
  /** `HistorySync.HistorySyncType` name from the chunk notification. */
  readonly syncType:
    | "INITIAL_BOOTSTRAP"
    | "INITIAL_STATUS_V3"
    | "FULL"
    | "RECENT"
    | "PUSH_NAME"
    | "NON_BLOCKING_DATA"
    | "ON_DEMAND";
  readonly chunkOrder: number;
  /** The ID of the message that carried the chunk notification. */
  readonly chunkMessageId?: string;
  readonly regenerate?: boolean;
}

/** @experimental Requires the 2026-10-14 API contract. */
export interface HistorySyncChunkRetryResponse {
  /** Identifier of the peer data request, when the API returns one. */
  readonly requestId?: string;
}

/**
 * Asks the session to delete a processed history blob from the WhatsApp CDN.
 * `POST /messaging/{session}/history/media/delete`.
 * @experimental Requires the 2026-10-14 API contract.
 */
export interface HistorySyncChunkDeleteRequest {
  readonly directPath: string;
  /** Base64url SHA-256 of the encrypted chunk, unpadded. */
  readonly fileEncSha256: string;
  readonly encHandle?: string;
  readonly companionMetaNonce?: string;
}

/** @internal */
export const DIRECT_MEDIA_PATHS = Object.freeze({
  uploadGrants: (session: string) =>
    `/messaging/${encodeURIComponent(session)}/media/upload-grants`,
  relayUploads: (session: string) =>
    `/messaging/${encodeURIComponent(session)}/media/uploads`,
  historyChunkRetries: (session: string) =>
    `/messaging/${encodeURIComponent(session)}/history/chunks/retry`,
  historyChunkDeletions: (session: string) =>
    `/messaging/${encodeURIComponent(session)}/history/media/delete`,
});

function uploadRequest(
  mediaType: WhatsAppUploadMediaType,
  fileEncSha256: string,
) {
  const type =
    mediaType === "document"
      ? "file"
      : mediaType === "audio" || mediaType === "ptt"
        ? "voice"
        : mediaType;
  return {
    type,
    fileEncSha256,
    ...(type === "voice" ? { ptt: mediaType === "ptt" } : {}),
  };
}

function unwrap(body: unknown): Record<string, unknown> {
  if (typeof body !== "object" || body === null) return {};
  const record = body as Record<string, unknown>;
  const data = record["data"];
  return typeof data === "object" && data !== null
    ? (data as Record<string, unknown>)
    : record;
}

function invalidResponse(what: string): PolymorfaError {
  return new PolymorfaError(`The API returned an invalid ${what}.`, {
    code: "invalid_response",
  });
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/**
 * The SDK's only client for the direct media and direct history endpoints.
 * @internal
 */
export class DirectMediaApi {
  constructor(private readonly transport: HttpTransport) {}

  async createUploadGrant(
    session: string,
    request: WhatsAppUploadGrantRequest,
    options: RequestOptions = {},
  ): Promise<WhatsAppUploadGrant> {
    const response = await this.transport.request<unknown>({
      method: "POST",
      path: DIRECT_MEDIA_PATHS.uploadGrants(session),
      body: uploadRequest(request.mediaType, request.fileEncSha256),
      ...options,
    });
    const data = unwrap(response.data);
    const rawUrl = data["uploadUrl"];
    const host = data["host"];
    const expiry = data["expiresAt"];
    let url: URL;
    try {
      url = new URL(typeof rawUrl === "string" ? rawUrl : "");
    } catch {
      throw invalidResponse("upload grant");
    }
    const auth = url.searchParams.get("auth");
    if (
      !isWhatsAppMediaUrl(url.href) ||
      typeof host !== "string" ||
      url.hostname !== host ||
      !auth ||
      typeof expiry !== "number" ||
      !Number.isSafeInteger(expiry) ||
      expiry <= 0 ||
      expiry > 8_640_000_000_000
    ) {
      throw invalidResponse("upload grant");
    }
    return Object.freeze({
      hosts: Object.freeze([host]),
      auth,
      uploadUrl: url.href,
      expiresAt: new Date(expiry * 1000).toISOString(),
    });
  }

  async relayUpload(
    session: string,
    request: WhatsAppUploadGrantRequest & {
      readonly body: ReadableStream<Uint8Array> | Uint8Array;
    },
    options: RequestOptions = {},
  ): Promise<WhatsAppRelayUploadResponse> {
    const { body } = request;
    const grant = uploadRequest(request.mediaType, request.fileEncSha256);
    const query = {
      ...grant,
      ...(grant.ptt === undefined ? {} : { ptt: String(grant.ptt) }),
    };
    const response = await this.transport.request<unknown>({
      ...options,
      method: "POST",
      path: DIRECT_MEDIA_PATHS.relayUploads(session),
      query,
      headers: {
        ...options.headers,
        "content-type": "application/octet-stream",
        "content-length": String(request.encryptedLength),
      },
      body,
    });
    const data = unwrap(response.data);
    if (!nonEmptyString(data["directPath"]) || !nonEmptyString(data["url"])) {
      throw invalidResponse("relay upload result");
    }
    return Object.freeze({
      directPath: data["directPath"],
      url: data["url"],
      ...(nonEmptyString(data["handle"]) ? { handle: data["handle"] } : {}),
    });
  }

  async requestHistoryChunkRetry(
    session: string,
    request: HistorySyncChunkRetryRequest,
    options: RequestOptions = {},
  ): Promise<HistorySyncChunkRetryResponse> {
    const response = await this.transport.request<unknown>({
      method: "POST",
      path: DIRECT_MEDIA_PATHS.historyChunkRetries(session),
      body: request,
      ...options,
    });
    const data = unwrap(response.data);
    return Object.freeze(
      nonEmptyString(data["requestId"]) ? { requestId: data["requestId"] } : {},
    );
  }

  async deleteHistoryChunk(
    session: string,
    request: HistorySyncChunkDeleteRequest,
    options: RequestOptions = {},
  ): Promise<void> {
    await this.transport.request<unknown>({
      method: "POST",
      path: DIRECT_MEDIA_PATHS.historyChunkDeletions(session),
      body: request,
      ...options,
    });
  }
}
