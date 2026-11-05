/**
 * Direct history: download, verify, decrypt, inflate and decode WhatsApp
 * history sync chunks locally. Import from `@polymorfa/sdk/history`. Needs
 * the `@bufbuild/protobuf` peer dependency.
 *
 * The chunk is returned as the decoded `HistorySync` protobuf, unchanged.
 */
import { fromBinary } from "@bufbuild/protobuf";

import {
  PolymorfaCancelledError,
  PolymorfaConfigurationError,
  PolymorfaMediaIntegrityError,
} from "../errors.js";
import {
  downloadEncryptedBlob,
  type WhatsAppMediaCrypto,
} from "../media/whatsapp.js";
import { inflateHistory, checkHistoryCancellation } from "./inflate.js";
import { HistorySyncSchema, type HistorySync } from "./gen/whatsapp_pb.js";

export {
  HistorySyncSchema,
  HistorySync_HistorySyncType,
  HistorySync_HistorySyncTypeSchema,
  type HistorySync,
  type Conversation,
  type WebMessageInfo,
  type Pushname,
} from "./gen/whatsapp_pb.js";

/**
 * The encrypted chunk named by a history sync notification. Binary fields
 * accept bytes or base64 (standard or URL-safe). `mediaKey` decrypts the
 * chunk: never log it.
 */
export interface HistorySyncChunkDescriptor {
  readonly directPath: string;
  readonly mediaKey: Uint8Array | string;
  readonly fileSha256: Uint8Array | string;
  readonly fileEncSha256: Uint8Array | string;
  /** Plaintext (compressed) length, when known. */
  readonly fileLength?: number;
}

/**
 * A small initial chunk WhatsApp sent inside the notification. It is
 * compressed but not encrypted.
 */
export interface HistorySyncInlinePayload {
  readonly inlinePayload: Uint8Array | string;
}

export type HistorySyncChunkInput =
  HistorySyncChunkDescriptor | HistorySyncInlinePayload;

export interface DecodeHistorySyncOptions {
  /** Maximum inflated size. Defaults to 512 MiB. */
  readonly maxInflatedBytes?: number;
}

export interface DownloadHistoryChunkOptions extends DecodeHistorySyncOptions {
  readonly fetch?: typeof globalThis.fetch;
  readonly signal?: AbortSignal;
  /** Maximum compressed size. Defaults to 256 MiB. */
  readonly maxBytes?: number;
  /** Decryption backend; pass `nodeMediaCrypto` from `@polymorfa/sdk/node`. */
  readonly crypto?: WhatsAppMediaCrypto;
}

export const DEFAULT_HISTORY_SYNC_MAX_INFLATED_BYTES = 512 * 1024 * 1024;

function invalid(message: string): PolymorfaMediaIntegrityError {
  return new PolymorfaMediaIntegrityError(message, "media_invalid_descriptor");
}

function bytesField(
  value: Uint8Array | string | undefined,
  name: string,
  length?: number,
): Uint8Array {
  let bytes: Uint8Array;
  if (value instanceof Uint8Array) {
    bytes = value;
  } else if (typeof value === "string" && value.length > 0) {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(normalized)) {
      throw invalid(`${name} is not valid base64.`);
    }
    const padded = normalized.padEnd(
      normalized.length + ((4 - (normalized.length % 4)) % 4),
      "=",
    );
    let binary: string;
    try {
      binary = atob(padded);
    } catch {
      throw invalid(`${name} is not valid base64.`);
    }
    bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } else {
    throw invalid(`${name} is required.`);
  }
  if (length !== undefined && bytes.length !== length) {
    throw invalid(`${name} must be ${length} bytes.`);
  }
  return bytes;
}

function isInline(
  input: HistorySyncChunkInput,
): input is HistorySyncInlinePayload {
  return (
    typeof input === "object" &&
    input !== null &&
    "inlinePayload" in input &&
    input.inlinePayload !== undefined
  );
}

function resolveInflatedLimit(value: number | undefined): number {
  const limit = value ?? DEFAULT_HISTORY_SYNC_MAX_INFLATED_BYTES;
  if (!Number.isSafeInteger(limit) || limit <= 0) {
    throw new PolymorfaConfigurationError(
      "maxInflatedBytes must be a positive integer.",
      "maxInflatedBytes",
    );
  }
  return limit;
}

/**
 * Inflates and decodes a compressed `HistorySync` payload (an inline payload
 * or a decrypted chunk). WhatsApp Web does the same: inflate, then decode
 * `HistorySyncSpec` (WAWebHandleHistorySyncChunk.js:134-136).
 */
export async function decodeHistorySyncPayload(
  compressed: Uint8Array | string,
  options: DecodeHistorySyncOptions = {},
): Promise<HistorySync> {
  return decodeHistory(compressed, options);
}

async function decodeHistory(
  compressed: Uint8Array | string,
  options: DecodeHistorySyncOptions,
  signal?: AbortSignal,
): Promise<HistorySync> {
  const bytes = bytesField(compressed, "payload");
  const inflated = await inflateHistory(
    bytes,
    resolveInflatedLimit(options.maxInflatedBytes),
    signal,
  );
  checkHistoryCancellation(signal);
  try {
    return fromBinary(HistorySyncSchema, inflated);
  } catch {
    throw new PolymorfaMediaIntegrityError(
      "The history chunk is not a valid HistorySync message.",
      "media_invalid_ciphertext",
    );
  }
}

async function collect(
  stream: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    checkHistoryCancellation(signal);
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
  }
  const out = new Uint8Array(total);
  let offset = 0;
  let copies = 0;
  for (const chunk of chunks) {
    checkHistoryCancellation(signal);
    out.set(chunk, offset);
    offset += chunk.length;
    if (++copies % 32 === 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  }
  checkHistoryCancellation(signal);
  return out;
}

/**
 * Downloads a history chunk from the WhatsApp CDN by `directPath`, verifies
 * `fileEncSha256`, the MAC and `fileSha256`, decrypts it with the
 * `WhatsApp History Keys` HKDF label (Cellar whatsapp-1049950004
 * WAMediaHkdfInfo.js:14), inflates it and decodes `HistorySync`. An inline
 * payload skips the download and decryption. No Polymorfa credential is
 * used. Nothing is parsed before verification succeeds.
 */
export async function downloadHistoryChunk(
  input: HistorySyncChunkInput,
  options: DownloadHistoryChunkOptions = {},
): Promise<HistorySync> {
  if (options.signal?.aborted === true) {
    throw new PolymorfaCancelledError("The history download was cancelled.", {
      code: "request_cancelled",
      cause: options.signal.reason,
    });
  }
  if (isInline(input)) {
    const compressed = bytesField(input.inlinePayload, "inlinePayload");
    const limit = options.maxBytes ?? 256 * 1024 * 1024;
    if (!Number.isSafeInteger(limit) || limit <= 0) {
      throw new PolymorfaConfigurationError(
        "maxBytes must be a positive integer.",
        "maxBytes",
      );
    }
    if (compressed.length > limit) {
      throw new PolymorfaMediaIntegrityError(
        "The compressed history chunk exceeds the permitted size.",
        "media_too_large",
      );
    }
    return decodeHistory(compressed, options, options.signal);
  }
  if (typeof input !== "object" || input === null) {
    throw invalid("The history chunk descriptor must be an object.");
  }
  if (typeof input.directPath !== "string" || input.directPath.length === 0) {
    throw invalid("The history chunk descriptor has no directPath.");
  }
  const body = await downloadEncryptedBlob(
    {
      directPath: input.directPath,
      mediaKey: bytesField(input.mediaKey, "mediaKey", 32),
      fileSha256: bytesField(input.fileSha256, "fileSha256", 32),
      fileEncSha256: bytesField(input.fileEncSha256, "fileEncSha256", 32),
      ...(input.fileLength === undefined
        ? {}
        : { fileLength: input.fileLength }),
    },
    "history",
    {
      verify: "before-release",
      ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
      ...(options.signal === undefined ? {} : { signal: options.signal }),
      ...(options.maxBytes === undefined ? {} : { maxBytes: options.maxBytes }),
      ...(options.crypto === undefined ? {} : { crypto: options.crypto }),
    },
  );
  return decodeHistory(
    await collect(body, options.signal),
    options,
    options.signal,
  );
}
