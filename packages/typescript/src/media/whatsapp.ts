import {
  PolymorfaCancelledError,
  PolymorfaConfigurationError,
  PolymorfaConnectionError,
  PolymorfaError,
  PolymorfaMediaIntegrityError,
} from "../errors.js";

/** WhatsApp media sub-message kinds that carry a downloadable attachment. */
export type WhatsAppMediaKind =
  "image" | "video" | "audio" | "document" | "sticker";

/**
 * Decoded attachment descriptor. `mediaKey` decrypts the file: treat the
 * whole descriptor, and any stored webhook payload that contains it, as a
 * secret. `url` is a signed CDN URL that expires.
 */
export interface WhatsAppMediaDescriptor {
  readonly mediaKind: WhatsAppMediaKind;
  readonly url?: string;
  readonly directPath?: string;
  readonly mediaKey: Uint8Array;
  readonly fileSha256?: Uint8Array;
  readonly fileEncSha256?: Uint8Array;
  readonly fileLength?: number;
  readonly mimetype?: string;
  readonly fileName?: string;
}

/** A message webhook payload, or any object with the same two fields. */
export interface WhatsAppMediaMessage {
  readonly type: string;
  readonly media?: string;
}

export type WhatsAppMediaInput = WhatsAppMediaMessage | WhatsAppMediaDescriptor;

export interface WhatsAppMediaKeys {
  readonly iv: Uint8Array;
  readonly cipherKey: Uint8Array;
  readonly macKey: Uint8Array;
}

/**
 * `before-release` (default) emits nothing until the MAC and both hashes
 * verify, which buffers the plaintext in memory. `streaming` emits plaintext
 * as it is decrypted and errors the stream at the end if verification fails;
 * consumers must then discard everything they received.
 */
export type WhatsAppMediaVerifyMode = "before-release" | "streaming";

export interface WhatsAppMediaDecryptOptions {
  readonly fileSha256?: Uint8Array;
  readonly fileEncSha256?: Uint8Array;
  /** Maximum plaintext size. Defaults to 256 MiB. */
  readonly maxBytes?: number;
  readonly fileLength?: number;
  readonly verify?: WhatsAppMediaVerifyMode;
  readonly signal?: AbortSignal;
}

/** Decryption backend. The default uses WebCrypto and always buffers. */
export interface WhatsAppMediaCrypto {
  /** True when the backend can verify and decrypt incrementally. */
  readonly incremental: boolean;
  decrypt(
    ciphertext: ReadableStream<Uint8Array>,
    keys: WhatsAppMediaKeys,
    options: ResolvedDecryptOptions,
  ): ReadableStream<Uint8Array>;
}

export interface ResolvedDecryptOptions {
  readonly fileSha256: Uint8Array | undefined;
  readonly fileEncSha256: Uint8Array | undefined;
  readonly verify: WhatsAppMediaVerifyMode;
}

export interface WhatsAppMediaDownloadOptions {
  readonly signal?: AbortSignal;
  readonly fetch?: typeof globalThis.fetch;
  readonly verify?: WhatsAppMediaVerifyMode;
  /** Maximum plaintext size. Defaults to 256 MiB. */
  readonly maxBytes?: number;
  /** Decryption backend. Pass `nodeMediaCrypto` from `@polymorfa/sdk/node` to stream. */
  readonly crypto?: WhatsAppMediaCrypto;
}

export interface WhatsAppMediaDownload {
  /** Decrypted, verified bytes (see `verify`). Read once. */
  readonly body: ReadableStream<Uint8Array>;
  readonly mediaKind: WhatsAppMediaKind;
  readonly mimetype: string;
  readonly fileName?: string;
  readonly fileLength?: number;
  arrayBuffer(): Promise<ArrayBuffer>;
  blob(): Promise<Blob>;
}

export const DEFAULT_WHATSAPP_MEDIA_MAX_BYTES = 256 * 1024 * 1024;
const MAX_DESCRIPTOR_BASE64_LENGTH = 1024 * 1024;
const MAX_URL_LENGTH = 8192;
const MAX_TEXT_LENGTH = 4096;
const MAC_LENGTH = 10;
const BLOCK = 16;
const FALLBACK_HOST = "mmg.whatsapp.net";
const WEB_ORIGIN = "https://web.whatsapp.com";

const HKDF_INFO: Readonly<Record<WhatsAppMediaKind, string>> = {
  image: "WhatsApp Image Keys",
  video: "WhatsApp Video Keys",
  audio: "WhatsApp Audio Keys",
  document: "WhatsApp Document Keys",
  // Stickers use image keys (whatsmeow download.go classToMediaType).
  sticker: "WhatsApp Image Keys",
};

const MMS_TYPE: Readonly<Record<WhatsAppMediaKind, string>> = {
  image: "image",
  video: "video",
  audio: "audio",
  document: "document",
  sticker: "image",
};

interface FieldMap {
  readonly url: number;
  readonly mimetype: number;
  readonly fileSha256: number;
  readonly fileLength: number;
  readonly mediaKey: number;
  readonly fileEncSha256: number;
  readonly directPath: number;
  readonly fileName?: number;
}

// Field numbers from whatsmeow proto/waE2E/WAWebProtobufsE2E.proto.
const FIELDS: Readonly<Record<WhatsAppMediaKind, FieldMap>> = {
  image: {
    url: 1,
    mimetype: 2,
    fileSha256: 4,
    fileLength: 5,
    mediaKey: 8,
    fileEncSha256: 9,
    directPath: 11,
  },
  video: {
    url: 1,
    mimetype: 2,
    fileSha256: 3,
    fileLength: 4,
    mediaKey: 6,
    fileEncSha256: 11,
    directPath: 13,
  },
  audio: {
    url: 1,
    mimetype: 2,
    fileSha256: 3,
    fileLength: 4,
    mediaKey: 7,
    fileEncSha256: 8,
    directPath: 9,
  },
  document: {
    url: 1,
    mimetype: 2,
    fileSha256: 4,
    fileLength: 5,
    mediaKey: 7,
    fileName: 8,
    fileEncSha256: 9,
    directPath: 10,
  },
  sticker: {
    url: 1,
    fileSha256: 2,
    fileEncSha256: 3,
    mediaKey: 4,
    mimetype: 5,
    directPath: 8,
    fileLength: 9,
  },
};

const DEFAULT_MIME: Readonly<Record<WhatsAppMediaKind, string>> = {
  image: "image/jpeg",
  video: "video/mp4",
  audio: "audio/ogg",
  document: "application/octet-stream",
  sticker: "image/webp",
};

function invalid(message: string): PolymorfaMediaIntegrityError {
  return new PolymorfaMediaIntegrityError(message, "media_invalid_descriptor");
}

function asKind(type: string): WhatsAppMediaKind {
  if (Object.hasOwn(FIELDS, type)) return type as WhatsAppMediaKind;
  throw invalid(`Message type ${JSON.stringify(type)} carries no media.`);
}

function decodeBase64(value: string): Uint8Array {
  if (value.length > MAX_DESCRIPTOR_BASE64_LENGTH) {
    throw invalid("The media descriptor exceeds the size limit.");
  }
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(normalized) || normalized.length === 0) {
    throw invalid("The media descriptor is not valid base64.");
  }
  let binary: string;
  try {
    binary = atob(normalized);
  } catch {
    throw invalid("The media descriptor is not valid base64.");
  }
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

class ProtoReader {
  #offset = 0;
  constructor(private readonly bytes: Uint8Array) {}

  get done(): boolean {
    return this.#offset >= this.bytes.length;
  }

  varint(): number {
    let result = 0;
    let multiplier = 1;
    for (let index = 0; index < 10; index += 1) {
      if (this.#offset >= this.bytes.length) {
        throw invalid("The media descriptor is truncated.");
      }
      const byte = this.bytes[this.#offset++]!;
      result += (byte & 0x7f) * multiplier;
      if ((byte & 0x80) === 0) {
        return result;
      }
      multiplier *= 128;
    }
    throw invalid("The media descriptor contains an invalid varint.");
  }

  bytesField(): Uint8Array {
    const length = this.varint();
    if (length > this.bytes.length - this.#offset) {
      throw invalid("The media descriptor is truncated.");
    }
    const value = this.bytes.subarray(this.#offset, this.#offset + length);
    this.#offset += length;
    return value;
  }

  skip(wireType: number): void {
    if (wireType === 0) this.varint();
    else if (wireType === 2) this.bytesField();
    else if (wireType === 1 || wireType === 5) {
      const size = wireType === 1 ? 8 : 4;
      if (size > this.bytes.length - this.#offset) {
        throw invalid("The media descriptor is truncated.");
      }
      this.#offset += size;
    } else {
      throw invalid("The media descriptor uses an unsupported wire type.");
    }
  }
}

function text(bytes: Uint8Array, limit: number): string {
  if (bytes.length > limit)
    throw invalid("A media descriptor field is too long.");
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw invalid("A media descriptor field is not valid UTF-8.");
  }
}

function hash(bytes: Uint8Array, name: string): Uint8Array {
  if (bytes.length !== 32) {
    throw invalid(`${name} must be 32 bytes.`);
  }
  return bytes.slice();
}

/**
 * Decodes the base64 `media` field of a message webhook. The input is treated
 * as untrusted: only varint and length-delimited fields are interpreted, and
 * lengths, hash sizes and string sizes are bounded.
 */
export function decodeWhatsAppMedia(
  base64: string,
  messageType: string,
): WhatsAppMediaDescriptor {
  if (typeof base64 !== "string") throw invalid("media must be a string.");
  const mediaKind = asKind(messageType);
  const fields = FIELDS[mediaKind];
  const reader = new ProtoReader(decodeBase64(base64));
  const out: {
    url?: string;
    directPath?: string;
    mediaKey?: Uint8Array;
    fileSha256?: Uint8Array;
    fileEncSha256?: Uint8Array;
    fileLength?: number;
    mimetype?: string;
    fileName?: string;
  } = {};
  while (!reader.done) {
    const tag = reader.varint();
    const field = Math.floor(tag / 8);
    const wireType = tag % 8;
    if (field === 0) throw invalid("The media descriptor has field number 0.");
    if (field === fields.fileLength && wireType === 0) {
      const value = reader.varint();
      if (!Number.isSafeInteger(value)) {
        throw invalid("fileLength is out of range.");
      }
      out.fileLength = value;
      continue;
    }
    if (wireType !== 2) {
      reader.skip(wireType);
      continue;
    }
    const value = reader.bytesField();
    switch (field) {
      case fields.url:
        out.url = text(value, MAX_URL_LENGTH);
        break;
      case fields.directPath:
        out.directPath = text(value, MAX_URL_LENGTH);
        break;
      case fields.mimetype:
        out.mimetype = text(value, 255);
        break;
      case fields.fileName:
        out.fileName = text(value, MAX_TEXT_LENGTH);
        break;
      case fields.mediaKey:
        if (value.length !== 32) throw invalid("mediaKey must be 32 bytes.");
        out.mediaKey = value.slice();
        break;
      case fields.fileSha256:
        out.fileSha256 = hash(value, "fileSha256");
        break;
      case fields.fileEncSha256:
        out.fileEncSha256 = hash(value, "fileEncSha256");
        break;
      default:
        break;
    }
  }
  if (out.mediaKey === undefined) {
    throw invalid("The media descriptor has no mediaKey.");
  }
  return Object.freeze({ mediaKind, ...out, mediaKey: out.mediaKey });
}

function subtle(): SubtleCrypto {
  const value = globalThis.crypto?.subtle;
  if (value === undefined) {
    throw new PolymorfaConfigurationError(
      "WhatsApp media decryption requires WebCrypto (crypto.subtle).",
      "crypto",
    );
  }
  return value;
}

function buffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.slice().buffer;
}

/** HKDF-SHA256(mediaKey, info, 112): iv [0,16), cipherKey [16,48), macKey [48,80). */
export async function deriveWhatsAppMediaKeys(
  mediaKey: Uint8Array,
  mediaKind: WhatsAppMediaKind,
): Promise<WhatsAppMediaKeys> {
  if (!(mediaKey instanceof Uint8Array) || mediaKey.length !== 32) {
    throw invalid("mediaKey must be 32 bytes.");
  }
  const info = HKDF_INFO[asKind(mediaKind)];
  const material = await subtle().importKey(
    "raw",
    buffer(mediaKey),
    "HKDF",
    false,
    ["deriveBits"],
  );
  const expanded = new Uint8Array(
    await subtle().deriveBits(
      {
        name: "HKDF",
        hash: "SHA-256",
        salt: new ArrayBuffer(0),
        info: new TextEncoder().encode(info),
      },
      material,
      112 * 8,
    ),
  );
  return Object.freeze({
    iv: expanded.slice(0, 16),
    cipherKey: expanded.slice(16, 48),
    macKey: expanded.slice(48, 80),
  });
}

/** Constant-time comparison of equal-length byte arrays. */
export function timingSafeEqualBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) {
    difference |= a[index]! ^ b[index]!;
  }
  return difference === 0;
}

async function readAll(
  stream: ReadableStream<Uint8Array>,
): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = stream.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

/**
 * Verifies and decrypts a complete encrypted file (`ciphertext || mac10`)
 * with WebCrypto, in whatsmeow's order: length, encrypted-file SHA-256, MAC,
 * AES-256-CBC with PKCS#7, plaintext SHA-256.
 */
async function decryptBuffered(
  data: Uint8Array,
  keys: WhatsAppMediaKeys,
  options: ResolvedDecryptOptions,
): Promise<Uint8Array> {
  const crypto = subtle();
  if (data.length <= MAC_LENGTH) {
    throw new PolymorfaMediaIntegrityError(
      "The encrypted media is too short.",
      "media_too_short",
    );
  }
  const ciphertext = data.subarray(0, data.length - MAC_LENGTH);
  const mac = data.subarray(data.length - MAC_LENGTH);
  if (options.fileEncSha256 !== undefined) {
    const digest = new Uint8Array(await crypto.digest("SHA-256", buffer(data)));
    if (!timingSafeEqualBytes(digest, options.fileEncSha256)) {
      throw new PolymorfaMediaIntegrityError(
        "The encrypted media hash does not match.",
        "media_enc_hash_mismatch",
      );
    }
  }
  const macKey = await crypto.importKey(
    "raw",
    buffer(keys.macKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signed = new Uint8Array(ciphertext.length + BLOCK);
  signed.set(keys.iv, 0);
  signed.set(ciphertext, BLOCK);
  const expected = new Uint8Array(
    await crypto.sign("HMAC", macKey, signed),
  ).subarray(0, MAC_LENGTH);
  if (!timingSafeEqualBytes(expected, mac)) {
    throw new PolymorfaMediaIntegrityError(
      "The media MAC does not match.",
      "media_mac_mismatch",
    );
  }
  if (ciphertext.length === 0 || ciphertext.length % BLOCK !== 0) {
    throw new PolymorfaMediaIntegrityError(
      "The ciphertext is not a whole number of blocks.",
      "media_invalid_ciphertext",
    );
  }
  const cipherKey = await crypto.importKey(
    "raw",
    buffer(keys.cipherKey),
    "AES-CBC",
    false,
    ["decrypt"],
  );
  let plaintext: Uint8Array;
  try {
    plaintext = new Uint8Array(
      await crypto.decrypt(
        { name: "AES-CBC", iv: buffer(keys.iv) },
        cipherKey,
        buffer(ciphertext),
      ),
    );
  } catch (error) {
    throw new PolymorfaMediaIntegrityError(
      `The media padding is invalid (${String(error)}).`,
      "media_invalid_padding",
    );
  }
  if (options.fileSha256 !== undefined) {
    const digest = new Uint8Array(
      await crypto.digest("SHA-256", buffer(plaintext)),
    );
    if (!timingSafeEqualBytes(digest, options.fileSha256)) {
      throw new PolymorfaMediaIntegrityError(
        "The decrypted media hash does not match.",
        "media_hash_mismatch",
      );
    }
  }
  return plaintext;
}

/** WebCrypto backend. It buffers the whole file and verifies before release. */
export const webCryptoMediaCrypto: WhatsAppMediaCrypto = Object.freeze({
  incremental: false,
  decrypt(
    ciphertext: ReadableStream<Uint8Array>,
    keys: WhatsAppMediaKeys,
    options: ResolvedDecryptOptions,
  ): ReadableStream<Uint8Array> {
    let result: Promise<Uint8Array> | undefined;
    return new ReadableStream<Uint8Array>({
      async pull(controller) {
        if (result !== undefined) {
          controller.close();
          return;
        }
        result = readAll(ciphertext).then((data) =>
          decryptBuffered(data, keys, options),
        );
        const plaintext = await result;
        if (plaintext.length > 0) controller.enqueue(plaintext);
      },
      async cancel(reason) {
        await ciphertext.cancel(reason).catch(() => undefined);
      },
    });
  },
});

function resolveLimit(maxBytes: number | undefined): number {
  const value = maxBytes ?? DEFAULT_WHATSAPP_MEDIA_MAX_BYTES;
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new PolymorfaConfigurationError(
      "maxBytes must be a positive integer.",
      "maxBytes",
    );
  }
  return value;
}

function encryptedLimit(maxBytes: number, fileLength?: number): number {
  const plain =
    fileLength === undefined ? maxBytes : Math.min(maxBytes, fileLength);
  if (fileLength !== undefined && fileLength > maxBytes) {
    throw tooLarge();
  }
  return (Math.floor(plain / BLOCK) + 1) * BLOCK + MAC_LENGTH;
}

function tooLarge(): PolymorfaMediaIntegrityError {
  return new PolymorfaMediaIntegrityError(
    "The media exceeds the permitted size.",
    "media_too_large",
  );
}

function cancelled(cause: unknown): PolymorfaCancelledError {
  return new PolymorfaCancelledError(
    "The request was cancelled by the caller.",
    { code: "request_cancelled", cause },
  );
}

/** Enforces a byte limit and maps abort and read failures. */
function limitStream(
  source: ReadableStream<Uint8Array>,
  limit: number,
  signal: AbortSignal | undefined,
): ReadableStream<Uint8Array> {
  const reader = source.getReader();
  let total = 0;
  return new ReadableStream<Uint8Array>(
    {
      async pull(controller) {
        try {
          if (signal?.aborted === true) throw signal.reason;
          const { done, value } = await reader.read();
          if (done) {
            controller.close();
            return;
          }
          total += value.length;
          if (total > limit) {
            await reader.cancel().catch(() => undefined);
            controller.error(tooLarge());
            return;
          }
          controller.enqueue(value);
        } catch (error) {
          controller.error(
            error instanceof PolymorfaError
              ? error
              : signal?.aborted === true
                ? cancelled(error)
                : new PolymorfaConnectionError(
                    "The media body could not be read.",
                    { code: "connection_error", cause: error },
                  ),
          );
        }
      },
      async cancel(reason) {
        await reader.cancel(reason);
      },
    },
    { highWaterMark: 0 },
  );
}

function toStream(
  input: Uint8Array | ArrayBuffer | ReadableStream<Uint8Array>,
): ReadableStream<Uint8Array> {
  if (input instanceof ReadableStream) return input;
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

function resolveVerify(
  verify: WhatsAppMediaVerifyMode | undefined,
  crypto: WhatsAppMediaCrypto,
): WhatsAppMediaVerifyMode {
  const mode = verify ?? "before-release";
  if (mode !== "before-release" && mode !== "streaming") {
    throw new PolymorfaConfigurationError(
      "verify must be before-release or streaming.",
      "verify",
    );
  }
  if (mode === "streaming" && !crypto.incremental) {
    throw new PolymorfaConfigurationError(
      "Streaming verification needs an incremental backend such as nodeMediaCrypto.",
      "verify",
    );
  }
  return mode;
}

/**
 * Verifies and decrypts media you fetched yourself. Accepts the complete
 * encrypted file (`ciphertext || mac10`) as bytes or a stream.
 */
export function decryptWhatsAppMedia(
  input: Uint8Array | ArrayBuffer | ReadableStream<Uint8Array>,
  keys: WhatsAppMediaKeys,
  options: WhatsAppMediaDecryptOptions & {
    readonly crypto?: WhatsAppMediaCrypto;
  } = {},
): ReadableStream<Uint8Array> {
  const crypto = options.crypto ?? webCryptoMediaCrypto;
  const limit = encryptedLimit(
    resolveLimit(options.maxBytes),
    options.fileLength,
  );
  return crypto.decrypt(
    limitStream(toStream(input), limit, options.signal),
    keys,
    {
      fileSha256: options.fileSha256,
      fileEncSha256: options.fileEncSha256,
      verify: resolveVerify(options.verify, crypto),
    },
  );
}

function isDescriptor(
  input: WhatsAppMediaInput,
): input is WhatsAppMediaDescriptor {
  return (
    typeof input === "object" &&
    input !== null &&
    "mediaKey" in input &&
    "mediaKind" in input
  );
}

function descriptorFrom(input: WhatsAppMediaInput): WhatsAppMediaDescriptor {
  if (isDescriptor(input)) return input;
  if (
    typeof input !== "object" ||
    input === null ||
    typeof input.media !== "string"
  ) {
    throw invalid(
      "The message has no encrypted media descriptor. Persisted media is available through mediaUrl or the Media API instead.",
    );
  }
  return decodeWhatsAppMedia(input.media, input.type);
}

/** True for HTTPS URLs on a WhatsApp media host (`*.whatsapp.net`, default port). */
export function isWhatsAppMediaUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  const host = url.hostname.toLowerCase();
  return (
    url.protocol === "https:" &&
    url.port === "" &&
    url.username === "" &&
    url.password === "" &&
    (host === "whatsapp.net" || host.endsWith(".whatsapp.net"))
  );
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_");
}

function candidateUrls(descriptor: WhatsAppMediaDescriptor): string[] {
  const urls: string[] = [];
  if (descriptor.url !== undefined && descriptor.url.length > 0) {
    if (!isWhatsAppMediaUrl(descriptor.url)) {
      throw invalid("The media URL is not an HTTPS WhatsApp media host.");
    }
    urls.push(descriptor.url);
  }
  const path = descriptor.directPath;
  if (path !== undefined && path.length > 0) {
    if (!path.startsWith("/") || path.startsWith("//")) {
      throw invalid("directPath must start with a single slash.");
    }
    // Same shape as whatsmeow DownloadMediaWithPath.
    const separator = path.includes("?") ? "&" : "?";
    const hashParam =
      descriptor.fileEncSha256 === undefined
        ? ""
        : base64Url(descriptor.fileEncSha256);
    const fallback = `https://${FALLBACK_HOST}${path}${separator}hash=${encodeURIComponent(hashParam)}&mms-type=${MMS_TYPE[descriptor.mediaKind]}&__wa-mms=`;
    if (!isWhatsAppMediaUrl(fallback)) {
      throw invalid("directPath does not form a valid media URL.");
    }
    if (!urls.includes(fallback)) urls.push(fallback);
  }
  if (urls.length === 0) {
    throw invalid("The media descriptor has neither url nor directPath.");
  }
  return urls;
}

async function fetchCdn(
  url: string,
  fetcher: typeof globalThis.fetch,
  signal: AbortSignal | undefined,
): Promise<Response> {
  let current = url;
  for (let hop = 0; hop <= 3; hop += 1) {
    const response = await fetcher(current, {
      method: "GET",
      headers: { origin: WEB_ORIGIN, referer: `${WEB_ORIGIN}/` },
      redirect: "manual",
      credentials: "omit",
      referrerPolicy: "no-referrer",
      ...(signal === undefined ? {} : { signal }),
    });
    if (![301, 302, 303, 307, 308].includes(response.status)) {
      return response;
    }
    const location = response.headers.get("location");
    await response.body?.cancel().catch(() => undefined);
    const next =
      location === null ? undefined : new URL(location, current).toString();
    if (next === undefined || !isWhatsAppMediaUrl(next)) {
      throw invalid("The media host redirected outside WhatsApp media hosts.");
    }
    current = next;
  }
  throw new PolymorfaConnectionError("Too many media redirects.", {
    code: "connection_error",
  });
}

/**
 * Downloads an attachment straight from the WhatsApp CDN and decrypts it
 * locally. No Polymorfa credential is involved or sent. The CDN URL in the
 * descriptor expires; the `directPath` fallback also stops working once
 * WhatsApp removes the object.
 */
export async function downloadWhatsAppMedia(
  input: WhatsAppMediaInput,
  options: WhatsAppMediaDownloadOptions = {},
): Promise<WhatsAppMediaDownload> {
  const descriptor = descriptorFrom(input);
  const crypto = options.crypto ?? webCryptoMediaCrypto;
  const verify = resolveVerify(options.verify, crypto);
  const maxBytes = resolveLimit(options.maxBytes);
  const limit = encryptedLimit(maxBytes, descriptor.fileLength);
  if (descriptor.fileSha256 === undefined) {
    // whatsmeow treats a missing plaintext hash as a verification failure.
    throw invalid("The media descriptor has no fileSha256.");
  }
  const urls = candidateUrls(descriptor);
  const fetcher = options.fetch ?? globalThis.fetch;
  const keys = await deriveWhatsAppMediaKeys(
    descriptor.mediaKey,
    descriptor.mediaKind,
  );

  let failure: unknown;
  let response: Response | undefined;
  for (const url of urls) {
    try {
      const candidate = await fetchCdn(url, fetcher, options.signal);
      if (candidate.ok) {
        response = candidate;
        break;
      }
      await candidate.body?.cancel().catch(() => undefined);
      failure = new PolymorfaError(
        `The WhatsApp media host returned status ${candidate.status}.`,
        { status: candidate.status, code: "media_download_failed" },
      );
    } catch (error) {
      if (options.signal?.aborted === true) throw cancelled(error);
      if (error instanceof PolymorfaError) throw error;
      failure = new PolymorfaConnectionError(
        "The WhatsApp media host could not be reached.",
        { code: "connection_error", cause: error },
      );
    }
  }
  if (response === undefined) {
    throw failure instanceof Error
      ? failure
      : new PolymorfaConnectionError("Media download failed.");
  }
  const lengthHeader = response.headers.get("content-length");
  if (lengthHeader !== null && Number(lengthHeader) > limit) {
    await response.body?.cancel().catch(() => undefined);
    throw tooLarge();
  }
  const source =
    response.body ??
    new ReadableStream<Uint8Array>({
      start(controller) {
        controller.close();
      },
    });
  const body = crypto.decrypt(
    limitStream(source, limit, options.signal),
    keys,
    {
      fileSha256: descriptor.fileSha256,
      fileEncSha256: descriptor.fileEncSha256,
      verify,
    },
  );
  const mimetype = descriptor.mimetype ?? DEFAULT_MIME[descriptor.mediaKind];
  return Object.freeze({
    body,
    mediaKind: descriptor.mediaKind,
    mimetype,
    ...(descriptor.fileName === undefined
      ? {}
      : { fileName: descriptor.fileName }),
    ...(descriptor.fileLength === undefined
      ? {}
      : { fileLength: descriptor.fileLength }),
    arrayBuffer: async () => buffer(await readAll(body)),
    blob: async () =>
      new Blob([buffer(await readAll(body))], { type: mimetype }),
  });
}
