/**
 * Polymorfa API calls used by direct media upload and direct history.
 *
 * Uses the 2026-10-14 direct media/history contract. Uploads carry encrypted
 * bytes and hashes; upload requests never carry a media key or plaintext.
 * Standard descriptor sending is a separate API and includes the media key.
 */
import {
  PolymorfaError,
  PolymorfaConfigurationError,
  PolymorfaServerError,
} from "../errors.js";
import {
  contractFields,
  contractInteger,
  contractString,
} from "../campaign-contract-validation.js";
import { existingOptions } from "../campaign-existing-validation.js";
import type { MessagingCredential } from "../credentials.js";
import type { HttpTransport } from "../transport/http.js";
import type { ApiResponse, RequestOptions } from "../transport/types.js";
import type { WhatsAppUploadMediaType } from "./encrypt.js";
import { isWhatsAppMediaUrl } from "./whatsapp.js";

/** First contract defining these additive operations. */
export const CUSTOMER_OWNED_API_VERSION = "2026-10-14";

/**
 * `POST /messaging/{session}/media/upload-grants` request.
 * @experimental Requires the 2026-10-14 API contract.
 */
export interface WhatsAppUploadGrantRequest {
  readonly mediaType: WhatsAppUploadMediaType;
  /** Base64url SHA-256 of `ciphertext || mac10`, unpadded. */
  readonly fileEncSha256: string;
  /** Local length for relay Content-Length; the grant body contains only type/hash/ptt. */
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
  readonly requestId: string;
  readonly status: "requested";
}

/**
 * Asks the session to delete a processed history blob from the WhatsApp CDN.
 * `POST /messaging/{session}/history/media/delete`.
 * @experimental Requires the 2026-10-14 API contract.
 */
export interface HistorySyncChunkDeleteRequest {
  readonly directPath: string;
  /** Standard base64 SHA-256 of the encrypted chunk, including `=` padding. */
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
  constructor(
    private readonly transport: HttpTransport,
    private readonly credentialType: MessagingCredential["type"] = "apiKey",
  ) {}

  assertServerCredential(): void {
    if (this.credentialType === "clientToken")
      throw new PolymorfaConfigurationError(
        "This operation requires an organization API key or project token.",
        "credential",
      );
  }

  async createUploadGrant(
    session: string,
    request: WhatsAppUploadGrantRequest,
    options: RequestOptions = {},
  ): Promise<WhatsAppUploadGrant> {
    this.assertServerCredential();
    options = existingOptions(options);
    contractString(session, "session");
    const response = await this.transport.request<unknown>({
      method: "POST",
      path: DIRECT_MEDIA_PATHS.uploadGrants(session),
      body: uploadRequest(request.mediaType, request.fileEncSha256),
      ...options,
      apiVersion: options.apiVersion ?? CUSTOMER_OWNED_API_VERSION,
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
    options = existingOptions(options);
    const { body } = request;
    const grant = uploadRequest(request.mediaType, request.fileEncSha256);
    const query = {
      ...grant,
      ...(grant.ptt === undefined ? {} : { ptt: String(grant.ptt) }),
    };
    const response = await this.transport.request<unknown>({
      ...options,
      apiVersion: options.apiVersion ?? CUSTOMER_OWNED_API_VERSION,
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
    this.assertServerCredential();
    contractString(session, "session");
    const value = contractFields(
      request,
      ["syncType", "chunkOrder", "chunkMessageId", "regenerate"],
      ["syncType", "chunkOrder"],
      "body",
    );
    if (
      ![
        "INITIAL_BOOTSTRAP",
        "INITIAL_STATUS_V3",
        "FULL",
        "RECENT",
        "PUSH_NAME",
        "NON_BLOCKING_DATA",
        "ON_DEMAND",
      ].includes(value.syncType as string)
    )
      throw new PolymorfaConfigurationError(
        "Invalid history sync type.",
        "syncType",
      );
    contractInteger(value.chunkOrder, "chunkOrder", 0, 0xffffffff);
    if (
      Object.hasOwn(value, "chunkMessageId") &&
      (typeof value.chunkMessageId !== "string" ||
        !/^[A-Za-z0-9._:-]{1,128}$/.test(value.chunkMessageId))
    )
      throw new PolymorfaConfigurationError(
        "Invalid history chunk message ID.",
        "chunkMessageId",
      );
    if (
      Object.hasOwn(value, "regenerate") &&
      typeof value.regenerate !== "boolean"
    )
      throw new PolymorfaConfigurationError(
        "Invalid regenerate flag.",
        "regenerate",
      );
    options = existingOptions(options);
    const response = await this.transport.request<unknown>({
      method: "POST",
      path: DIRECT_MEDIA_PATHS.historyChunkRetries(session),
      body: { ...request },
      ...options,
      apiVersion: options.apiVersion ?? CUSTOMER_OWNED_API_VERSION,
    });
    const data = historyData(response);
    if (!nonEmptyString(data.requestId) || data.status !== "requested")
      throw historyError(response);
    return Object.freeze({ requestId: data.requestId, status: "requested" });
  }

  async deleteHistoryChunk(
    session: string,
    request: HistorySyncChunkDeleteRequest,
    options: RequestOptions = {},
  ): Promise<void> {
    this.assertServerCredential();
    contractString(session, "session");
    const value = contractFields(
      request,
      ["directPath", "fileEncSha256", "encHandle", "companionMetaNonce"],
      ["directPath", "fileEncSha256"],
      "body",
    );
    if (
      typeof value.directPath !== "string" ||
      value.directPath.length > 1024 ||
      !/^\/[A-Za-z0-9._~%/=&?+-]+$/.test(value.directPath) ||
      typeof value.fileEncSha256 !== "string" ||
      !/^[A-Za-z0-9+/]{43}=$/.test(value.fileEncSha256) ||
      atob(value.fileEncSha256).length !== 32
    )
      throw new PolymorfaConfigurationError(
        "Invalid history deletion descriptor.",
        "history",
      );
    for (const key of ["encHandle", "companionMetaNonce"])
      if (
        Object.hasOwn(value, key) &&
        (typeof value[key] !== "string" ||
          !/^[A-Za-z0-9._~%/=+-]{1,512}$/.test(value[key]))
      )
        throw new PolymorfaConfigurationError(
          "Invalid history deletion token.",
          "history",
        );
    options = existingOptions(options);
    const response = await this.transport.request<unknown>({
      method: "POST",
      path: DIRECT_MEDIA_PATHS.historyChunkDeletions(session),
      body: { ...request },
      ...options,
      apiVersion: options.apiVersion ?? CUSTOMER_OWNED_API_VERSION,
    });
    if (historyData(response).status !== "deleted")
      throw historyError(response);
  }
}

function historyError(response: ApiResponse<unknown>): PolymorfaServerError {
  return new PolymorfaServerError(
    "The API returned an invalid history result.",
    {
      code: "invalid_response",
      status: response.metadata.status,
      ...(response.metadata.requestId === undefined
        ? {}
        : { requestId: response.metadata.requestId }),
      metadata: response.metadata,
    },
  );
}
function historyData(response: ApiResponse<unknown>): Record<string, unknown> {
  const body = response.data;
  if (
    response.metadata.status !== 200 ||
    response.metadata.headers["content-type"]
      ?.split(";", 1)[0]
      ?.trim()
      .toLowerCase() !== "application/json" ||
    typeof body !== "object" ||
    body === null ||
    Array.isArray(body) ||
    !("success" in body) ||
    body.success !== true ||
    !("data" in body) ||
    typeof body.data !== "object" ||
    body.data === null ||
    Array.isArray(body.data)
  )
    throw historyError(response);
  return body.data as Record<string, unknown>;
}
