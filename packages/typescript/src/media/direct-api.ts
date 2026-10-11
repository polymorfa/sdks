/**
 * Polymorfa API calls used by direct media upload and direct history.
 *
 * PENDING BACKEND ALIGNMENT. The paths, request bodies and response shapes in
 * this module are the SDK's proposal while the API endpoints are built. Every
 * wire detail lives here so it can be aligned with the published contract in
 * one place. Nothing in this module sends a media key or plaintext.
 */
import { PolymorfaError } from "../errors.js";
import type { HttpTransport } from "../transport/http.js";
import type { RequestOptions } from "../transport/types.js";
import type { WhatsAppUploadMediaType } from "./encrypt.js";

/**
 * `POST /messaging/{session}/media/upload-grants` request.
 * @experimental Pending backend alignment.
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
 * @experimental Pending backend alignment.
 */
export interface WhatsAppUploadGrant {
  /** WhatsApp media upload hostnames in preference order. */
  readonly hosts: readonly string[];
  /** The `media_conn` `auth` value. */
  readonly auth: string;
  /** ISO 8601 expiry. */
  readonly expiresAt?: string;
}

/**
 * `POST /messaging/{session}/media/relay-uploads` response. The request body
 * is `ciphertext || mac10` (`application/octet-stream`) with query
 * parameters `mediaType`, `fileEncSha256` (base64url) and `encryptedLength`.
 * @experimental Pending backend alignment.
 */
export interface WhatsAppRelayUploadResponse {
  readonly directPath: string;
  readonly url: string;
  readonly handle?: string;
}

/**
 * Asks the phone to send a history chunk again (peer data operation
 * `HISTORY_SYNC_CHUNK_RETRY`). `POST /messaging/{session}/history/chunk-retries`.
 * @experimental Pending backend alignment.
 */
export interface HistorySyncChunkRetryRequest {
  /** `HistorySync.HistorySyncType` name or number from the chunk notification. */
  readonly syncType: string | number;
  readonly chunkOrder: number;
  /** The ID of the message that carried the chunk notification. */
  readonly chunkNotificationId: string;
  readonly regenerateChunk?: boolean;
}

/** @experimental Pending backend alignment. */
export interface HistorySyncChunkRetryResponse {
  /** Identifier of the peer data request, when the API returns one. */
  readonly requestId?: string;
}

/**
 * Asks the session to delete a processed history blob from the WhatsApp CDN.
 * `POST /messaging/{session}/history/chunk-deletions`.
 * @experimental Pending backend alignment.
 */
export interface HistorySyncChunkDeleteRequest {
  readonly directPath: string;
  /** Base64url SHA-256 of the encrypted chunk, unpadded. */
  readonly fileEncSha256: string;
}

/** @internal */
export const DIRECT_MEDIA_PATHS = Object.freeze({
  uploadGrants: (session: string) =>
    `/messaging/${encodeURIComponent(session)}/media/upload-grants`,
  relayUploads: (session: string) =>
    `/messaging/${encodeURIComponent(session)}/media/relay-uploads`,
  historyChunkRetries: (session: string) =>
    `/messaging/${encodeURIComponent(session)}/history/chunk-retries`,
  historyChunkDeletions: (session: string) =>
    `/messaging/${encodeURIComponent(session)}/history/chunk-deletions`,
});

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
      body: request,
      ...options,
    });
    const data = unwrap(response.data);
    const hosts = data["hosts"];
    if (
      !Array.isArray(hosts) ||
      hosts.length === 0 ||
      !hosts.every(nonEmptyString) ||
      !nonEmptyString(data["auth"])
    ) {
      throw invalidResponse("upload grant");
    }
    return Object.freeze({
      hosts: Object.freeze([...hosts]),
      auth: data["auth"],
      ...(nonEmptyString(data["expiresAt"])
        ? { expiresAt: data["expiresAt"] }
        : {}),
    });
  }

  async relayUpload(
    session: string,
    request: WhatsAppUploadGrantRequest & {
      readonly body: ReadableStream<Uint8Array> | Uint8Array;
    },
    options: RequestOptions = {},
  ): Promise<WhatsAppRelayUploadResponse> {
    const { body, ...query } = request;
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
