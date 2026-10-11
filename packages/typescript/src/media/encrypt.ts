import {
  PolymorfaConfigurationError,
  PolymorfaMediaIntegrityError,
} from "../errors.js";
import {
  DEFAULT_WHATSAPP_MEDIA_MAX_BYTES,
  deriveWhatsAppMediaKeys,
  readAll,
  toStream,
  type WhatsAppMediaKeys,
} from "./whatsapp.js";

/**
 * Media types the SDK can encrypt and upload. `ptt` is a voice note: it uses
 * audio keys and uploads to `/mms/ptt`.
 */
export type WhatsAppUploadMediaType =
  "image" | "video" | "audio" | "ptt" | "document" | "sticker";

export const WHATSAPP_UPLOAD_MEDIA_TYPES: readonly WhatsAppUploadMediaType[] =
  Object.freeze(["image", "video", "audio", "ptt", "document", "sticker"]);

/** Plaintext accepted by the encryption functions. */
export type WhatsAppMediaPlaintext =
  Uint8Array | ArrayBuffer | Blob | ReadableStream<Uint8Array>;

/**
 * Fields WhatsApp needs to describe an encrypted attachment. `mediaKey`
 * decrypts the file: keep it secret and never log it.
 */
export interface EncryptedWhatsAppMediaInfo {
  readonly mediaType: WhatsAppUploadMediaType;
  /** 32 random bytes. The only secret in this object. */
  readonly mediaKey: Uint8Array;
  /** SHA-256 of the plaintext. */
  readonly fileSha256: Uint8Array;
  /** SHA-256 of the uploaded bytes (`ciphertext || mac10`). */
  readonly fileEncSha256: Uint8Array;
  /** Plaintext length in bytes. */
  readonly fileLength: number;
  /** Length of `ciphertext || mac10` in bytes. */
  readonly encryptedLength: number;
  readonly mimetype?: string;
}

export interface EncryptedWhatsAppMedia extends EncryptedWhatsAppMediaInfo {
  /** `ciphertext || mac10`, the exact bytes to upload. */
  readonly ciphertext: Uint8Array;
}

/** Hashes and lengths an encryptor reports once its output is complete. */
export interface WhatsAppMediaEncryptionDigest {
  readonly fileSha256: Uint8Array;
  readonly fileEncSha256: Uint8Array;
  readonly fileLength: number;
  readonly encryptedLength: number;
}

/**
 * Encryption backend. The default (`webCryptoMediaEncryptor`) buffers the
 * whole file. Pass `nodeMediaEncryptor` from `@polymorfa/sdk/node` to stream.
 */
export interface WhatsAppMediaEncryptor {
  /** True when the backend encrypts without buffering the whole file. */
  readonly incremental: boolean;
  /**
   * Returns `ciphertext || mac10` as a stream. `digest` resolves after the
   * stream ends and rejects if the stream fails.
   */
  encrypt(
    plaintext: ReadableStream<Uint8Array>,
    keys: WhatsAppMediaKeys,
    options: { readonly maxBytes: number },
  ): {
    readonly body: ReadableStream<Uint8Array>;
    readonly digest: Promise<WhatsAppMediaEncryptionDigest>;
  };
}

export interface EncryptWhatsAppMediaOptions {
  readonly mediaType: WhatsAppUploadMediaType;
  /** Passed through to the result unchanged. */
  readonly mimetype?: string;
  /**
   * Use this key instead of a random one. Only for re-encrypting the same
   * plaintext deterministically (for example a second upload pass) or tests.
   */
  readonly mediaKey?: Uint8Array;
  /** Maximum plaintext size. Defaults to 256 MiB. */
  readonly maxBytes?: number;
  readonly encryptor?: WhatsAppMediaEncryptor;
}

export interface EncryptedWhatsAppMediaStream {
  /** `ciphertext || mac10`. Read it once. */
  readonly body: ReadableStream<Uint8Array>;
  /** Resolves after `body` has been read to the end. */
  readonly info: Promise<EncryptedWhatsAppMediaInfo>;
}

const BLOCK = 16;
const MAC_LENGTH = 10;

function subtle(): SubtleCrypto {
  const value = globalThis.crypto?.subtle;
  if (value === undefined) {
    throw new PolymorfaConfigurationError(
      "WhatsApp media encryption requires WebCrypto (crypto.subtle).",
      "crypto",
    );
  }
  return value;
}

function arrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.slice().buffer;
}

/** Ciphertext length for a plaintext of `fileLength` bytes, including the MAC. */
export function whatsAppEncryptedLength(fileLength: number): number {
  return (Math.floor(fileLength / BLOCK) + 1) * BLOCK + MAC_LENGTH;
}

/** 32 random bytes from the platform CSPRNG. */
export function generateWhatsAppMediaKey(): Uint8Array {
  const key = new Uint8Array(32);
  globalThis.crypto.getRandomValues(key);
  return key;
}

function tooLarge(): PolymorfaMediaIntegrityError {
  return new PolymorfaMediaIntegrityError(
    "The media exceeds the permitted size.",
    "media_too_large",
  );
}

/**
 * Encrypts like WhatsApp Web's `encryptAndHmac` (Cellar whatsapp-1049257521
 * WAMediaCrypto.js:75-101): AES-256-CBC with PKCS#7 padding, then
 * HMAC-SHA256(macKey, iv || ciphertext) truncated to 10 bytes and appended.
 * `fileEncSha256` is SHA-256 of `ciphertext || mac10` (`ciphertextHash`).
 */
async function encryptBuffered(
  plaintext: Uint8Array,
  keys: WhatsAppMediaKeys,
): Promise<{ data: Uint8Array; digest: WhatsAppMediaEncryptionDigest }> {
  const crypto = subtle();
  const cipherKey = await crypto.importKey(
    "raw",
    arrayBuffer(keys.cipherKey),
    "AES-CBC",
    false,
    ["encrypt"],
  );
  const ciphertext = new Uint8Array(
    await crypto.encrypt(
      { name: "AES-CBC", iv: arrayBuffer(keys.iv) },
      cipherKey,
      arrayBuffer(plaintext),
    ),
  );
  const macKey = await crypto.importKey(
    "raw",
    arrayBuffer(keys.macKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signed = new Uint8Array(BLOCK + ciphertext.length);
  signed.set(keys.iv, 0);
  signed.set(ciphertext, BLOCK);
  const mac = new Uint8Array(await crypto.sign("HMAC", macKey, signed));
  const data = new Uint8Array(ciphertext.length + MAC_LENGTH);
  data.set(ciphertext, 0);
  data.set(mac.subarray(0, MAC_LENGTH), ciphertext.length);
  const [fileSha256, fileEncSha256] = await Promise.all([
    crypto.digest("SHA-256", arrayBuffer(plaintext)),
    crypto.digest("SHA-256", arrayBuffer(data)),
  ]);
  return {
    data,
    digest: {
      fileSha256: new Uint8Array(fileSha256),
      fileEncSha256: new Uint8Array(fileEncSha256),
      fileLength: plaintext.length,
      encryptedLength: data.length,
    },
  };
}

async function readLimited(
  stream: ReadableStream<Uint8Array>,
  maxBytes: number,
): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > maxBytes) throw tooLarge();
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel(error).catch(() => undefined);
    throw error;
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

/** WebCrypto backend. It buffers the plaintext and the ciphertext. */
export const webCryptoMediaEncryptor: WhatsAppMediaEncryptor = Object.freeze({
  incremental: false,
  encrypt(
    plaintext: ReadableStream<Uint8Array>,
    keys: WhatsAppMediaKeys,
    options: { readonly maxBytes: number },
  ) {
    const result = readLimited(plaintext, options.maxBytes).then((bytes) =>
      encryptBuffered(bytes, keys),
    );
    // The digest is observed through `info`; avoid an unhandled rejection
    // when the caller only reads the body.
    result.catch(() => undefined);
    let sent = false;
    const body = new ReadableStream<Uint8Array>({
      async pull(controller) {
        if (sent) {
          controller.close();
          return;
        }
        sent = true;
        const { data } = await result;
        controller.enqueue(data);
      },
      async cancel(reason) {
        await plaintext.cancel(reason).catch(() => undefined);
      },
    });
    return { body, digest: result.then(({ digest }) => digest) };
  },
});

function resolveMaxBytes(value: number | undefined): number {
  const resolved = value ?? DEFAULT_WHATSAPP_MEDIA_MAX_BYTES;
  if (!Number.isSafeInteger(resolved) || resolved <= 0) {
    throw new PolymorfaConfigurationError(
      "maxBytes must be a positive integer.",
      "maxBytes",
    );
  }
  return resolved;
}

function resolveMediaType(value: unknown): WhatsAppUploadMediaType {
  if (
    typeof value !== "string" ||
    !WHATSAPP_UPLOAD_MEDIA_TYPES.includes(value as WhatsAppUploadMediaType)
  ) {
    throw new PolymorfaConfigurationError(
      `mediaType must be one of ${WHATSAPP_UPLOAD_MEDIA_TYPES.join(", ")}.`,
      "mediaType",
    );
  }
  return value as WhatsAppUploadMediaType;
}

function resolveMediaKey(value: Uint8Array | undefined): Uint8Array {
  if (value === undefined) return generateWhatsAppMediaKey();
  if (!(value instanceof Uint8Array) || value.length !== 32) {
    throw new PolymorfaConfigurationError(
      "mediaKey must be 32 bytes.",
      "mediaKey",
    );
  }
  return value.slice();
}

/** @internal Converts any accepted plaintext to a web stream. */
export function plaintextStream(
  input: WhatsAppMediaPlaintext,
): ReadableStream<Uint8Array> {
  if (typeof Blob !== "undefined" && input instanceof Blob) {
    return input.stream() as ReadableStream<Uint8Array>;
  }
  return toStream(input as Uint8Array | ArrayBuffer | ReadableStream<Uint8Array>);
}

/**
 * Encrypts media as a stream. With `nodeMediaEncryptor` neither the
 * plaintext nor the ciphertext is buffered; `info` resolves once `body` has
 * been read to the end.
 */
export function encryptWhatsAppMediaStream(
  input: WhatsAppMediaPlaintext,
  options: EncryptWhatsAppMediaOptions,
): EncryptedWhatsAppMediaStream {
  const mediaType = resolveMediaType(options.mediaType);
  const maxBytes = resolveMaxBytes(options.maxBytes);
  const mediaKey = resolveMediaKey(options.mediaKey);
  const encryptor = options.encryptor ?? webCryptoMediaEncryptor;
  const source = plaintextStream(input);
  let digest: Promise<WhatsAppMediaEncryptionDigest> | undefined;
  let inner: ReadableStream<Uint8Array> | undefined;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  const ready = deriveWhatsAppMediaKeys(mediaKey, mediaType).then((keys) => {
    const encrypted = encryptor.encrypt(source, keys, { maxBytes });
    digest = encrypted.digest;
    inner = encrypted.body;
    reader = inner.getReader();
  });
  const info = ready
    .then(() => digest!)
    .then(
      (value): EncryptedWhatsAppMediaInfo =>
        Object.freeze({
          mediaType,
          mediaKey,
          ...value,
          ...(options.mimetype === undefined
            ? {}
            : { mimetype: options.mimetype }),
        }),
    );
  info.catch(() => undefined);
  const body = new ReadableStream<Uint8Array>(
    {
      async pull(controller) {
        await ready;
        const { done, value } = await reader!.read();
        if (done) controller.close();
        else controller.enqueue(value);
      },
      async cancel(reason) {
        await ready.catch(() => undefined);
        if (reader !== undefined) await reader.cancel(reason);
        else await source.cancel(reason).catch(() => undefined);
      },
    },
    { highWaterMark: 0 },
  );
  return { body, info };
}

/**
 * Encrypts media for upload to WhatsApp and returns `ciphertext || mac10`
 * with the descriptor fields. This buffers the file; use
 * `encryptWhatsAppMediaStream` with `nodeMediaEncryptor` for large files.
 */
export async function encryptWhatsAppMedia(
  input: WhatsAppMediaPlaintext,
  options: EncryptWhatsAppMediaOptions,
): Promise<EncryptedWhatsAppMedia> {
  const { body, info } = encryptWhatsAppMediaStream(input, options);
  const ciphertext = await readAll(body);
  return Object.freeze({ ...(await info), ciphertext });
}
