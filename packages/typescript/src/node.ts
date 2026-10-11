/**
 * Node.js-only helpers. Import from `@polymorfa/sdk/node`; this module loads
 * `node:crypto` and `node:fs`, so keep it out of browser bundles.
 */
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { access, link, rename, stat, unlink } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";

import { assertServerRuntime } from "./credentials.js";
import {
  PolymorfaCancelledError,
  PolymorfaConflictError,
  PolymorfaMediaIntegrityError,
} from "./errors.js";
import type {
  WhatsAppMediaEncryptionDigest,
  WhatsAppMediaEncryptor,
} from "./media/encrypt.js";
import type { WhatsAppMediaSource } from "./media/upload.js";
import {
  downloadWhatsAppMedia,
  type ResolvedDecryptOptions,
  type WhatsAppMediaCrypto,
  type WhatsAppMediaDownload,
  type WhatsAppMediaDownloadOptions,
  type WhatsAppMediaInput,
  type WhatsAppMediaKeys,
} from "./media/whatsapp.js";
import type { MessagingMediaResource } from "./messaging/media.js";
import type { RequestOptions } from "./transport/types.js";

const MAC_LENGTH = 10;
const BLOCK = 16;

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && timingSafeEqual(a, b);
}

function integrity(
  message: string,
  code: PolymorfaMediaIntegrityError["code"],
): PolymorfaMediaIntegrityError {
  return new PolymorfaMediaIntegrityError(message, code);
}

/**
 * Incremental `node:crypto` backend. It holds back the trailing 10-byte MAC
 * and lets the decipher hold back the final block, so padding is only
 * removed after the MAC and encrypted hash are verified. With
 * `verify: "streaming"` earlier plaintext chunks are emitted before
 * verification completes.
 */
export const nodeMediaCrypto: WhatsAppMediaCrypto = Object.freeze({
  incremental: true,
  decrypt(
    ciphertext: ReadableStream<Uint8Array>,
    keys: WhatsAppMediaKeys,
    options: ResolvedDecryptOptions,
  ): ReadableStream<Uint8Array> {
    const reader = ciphertext.getReader();
    const decipher = createDecipheriv("aes-256-cbc", keys.cipherKey, keys.iv);
    const mac = createHmac("sha256", keys.macKey).update(keys.iv);
    const encHash = createHash("sha256");
    const plainHash = createHash("sha256");
    let tail: Uint8Array = new Uint8Array(0);
    let total = 0;
    const held: Uint8Array[] = [];
    const streaming = options.verify === "streaming";

    const emit = (
      controller: ReadableStreamDefaultController<Uint8Array>,
      chunk: Uint8Array,
    ) => {
      if (chunk.length === 0) return;
      plainHash.update(chunk);
      if (streaming) controller.enqueue(chunk);
      else held.push(chunk);
    };

    const finish = (
      controller: ReadableStreamDefaultController<Uint8Array>,
    ) => {
      if (total <= MAC_LENGTH) {
        throw integrity("The encrypted media is too short.", "media_too_short");
      }
      encHash.update(tail);
      if (
        options.fileEncSha256 !== undefined &&
        !sameBytes(encHash.digest(), options.fileEncSha256)
      ) {
        throw integrity(
          "The encrypted media hash does not match.",
          "media_enc_hash_mismatch",
        );
      }
      const expected = mac.digest().subarray(0, MAC_LENGTH);
      if (!sameBytes(expected, tail)) {
        throw integrity("The media MAC does not match.", "media_mac_mismatch");
      }
      const cipherLength = total - MAC_LENGTH;
      if (cipherLength === 0 || cipherLength % BLOCK !== 0) {
        throw integrity(
          "The ciphertext is not a whole number of blocks.",
          "media_invalid_ciphertext",
        );
      }
      let last: Uint8Array;
      try {
        last = decipher.final();
      } catch {
        throw integrity(
          "The media padding is invalid.",
          "media_invalid_padding",
        );
      }
      emit(controller, last);
      if (
        options.fileSha256 !== undefined &&
        !sameBytes(plainHash.digest(), options.fileSha256)
      ) {
        throw integrity(
          "The decrypted media hash does not match.",
          "media_hash_mismatch",
        );
      }
      for (const chunk of held.splice(0)) controller.enqueue(chunk);
      controller.close();
    };

    return new ReadableStream<Uint8Array>(
      {
        async pull(controller) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              finish(controller);
              return;
            }
            total += value.length;
            const combined = new Uint8Array(tail.length + value.length);
            combined.set(tail, 0);
            combined.set(value, tail.length);
            const releasable = Math.max(combined.length - MAC_LENGTH, 0);
            const release = combined.subarray(0, releasable);
            tail = combined.slice(releasable);
            if (release.length === 0) continue;
            mac.update(release);
            encHash.update(release);
            const out = decipher.update(release);
            emit(controller, out);
            if (streaming && out.length > 0) return;
          }
        },
        async cancel(reason) {
          held.length = 0;
          await reader.cancel(reason);
        },
      },
      { highWaterMark: 0 },
    );
  },
});

/**
 * Incremental `node:crypto` encryption backend. Plaintext is encrypted as it
 * arrives; only the final partial block is held back. The HMAC and both
 * SHA-256 digests are computed on the fly, matching WhatsApp Web's
 * `encryptAndHmac` (Cellar whatsapp-1049257521 WAMediaCrypto.js:75-101).
 */
export const nodeMediaEncryptor: WhatsAppMediaEncryptor = Object.freeze({
  incremental: true,
  encrypt(
    plaintext: ReadableStream<Uint8Array>,
    keys: WhatsAppMediaKeys,
    options: { readonly maxBytes: number },
  ) {
    const reader = plaintext.getReader();
    const cipher = createCipheriv("aes-256-cbc", keys.cipherKey, keys.iv);
    const mac = createHmac("sha256", keys.macKey).update(keys.iv);
    const encHash = createHash("sha256");
    const plainHash = createHash("sha256");
    let fileLength = 0;
    let encryptedLength = 0;
    let settle!: {
      resolve: (value: WhatsAppMediaEncryptionDigest) => void;
      reject: (reason: unknown) => void;
    };
    const digest = new Promise<WhatsAppMediaEncryptionDigest>(
      (resolve, reject) => {
        settle = { resolve, reject };
      },
    );
    digest.catch(() => undefined);
    const emit = (
      controller: ReadableStreamDefaultController<Uint8Array>,
      chunk: Uint8Array,
    ) => {
      if (chunk.length === 0) return;
      encHash.update(chunk);
      encryptedLength += chunk.length;
      controller.enqueue(chunk);
    };
    const body = new ReadableStream<Uint8Array>(
      {
        async pull(controller) {
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) {
                const last = new Uint8Array(cipher.final());
                mac.update(last);
                emit(controller, last);
                const tag = new Uint8Array(mac.digest().subarray(0, MAC_LENGTH));
                emit(controller, tag);
                settle.resolve(
                  Object.freeze({
                    fileSha256: new Uint8Array(plainHash.digest()),
                    fileEncSha256: new Uint8Array(encHash.digest()),
                    fileLength,
                    encryptedLength,
                  }),
                );
                controller.close();
                return;
              }
              fileLength += value.length;
              if (fileLength > options.maxBytes) {
                throw integrity(
                  "The media exceeds the permitted size.",
                  "media_too_large",
                );
              }
              plainHash.update(value);
              const out = new Uint8Array(cipher.update(value));
              if (out.length === 0) continue;
              mac.update(out);
              emit(controller, out);
              return;
            }
          } catch (error) {
            settle.reject(error);
            await reader.cancel(error).catch(() => undefined);
            throw error;
          }
        },
        async cancel(reason) {
          settle.reject(reason);
          await reader.cancel(reason);
        },
      },
      { highWaterMark: 0 },
    );
    return { body, digest };
  },
});

/**
 * Re-readable upload source for a file on disk. Each upload pass opens the
 * file again, so large files are never held in memory.
 */
export async function whatsAppMediaFileSource(
  path: string,
): Promise<WhatsAppMediaSource> {
  assertServerRuntime();
  const { size } = await stat(path);
  return Object.freeze({
    size,
    open: () =>
      Readable.toWeb(createReadStream(path)) as ReadableStream<Uint8Array>,
  });
}

export interface WriteToFileOptions {
  readonly signal?: AbortSignal;
  /**
   * Replace an existing file at `path` (default `true`). With `false` the
   * final link fails atomically with `PolymorfaConflictError` when the path
   * exists.
   */
  readonly overwrite?: boolean;
  /** Abort with `media_too_large` once more than this many bytes arrive. */
  readonly maxBytes?: number;
}

function fileOptions(options: {
  readonly signal?: AbortSignal;
  readonly overwrite?: boolean;
  readonly maxBytes?: number;
}): WriteToFileOptions {
  return {
    ...(options.signal === undefined ? {} : { signal: options.signal }),
    ...(options.overwrite === undefined
      ? {}
      : { overwrite: options.overwrite }),
    ...(options.maxBytes === undefined ? {} : { maxBytes: options.maxBytes }),
  };
}

/**
 * Writes a web stream to `path` through a sibling temporary file, then
 * moves it into place. The temporary file is removed on error or abort, and
 * an existing file at `path` is replaced only on success (and only when
 * `overwrite` is not `false`).
 */
export async function writeStreamToFile(
  body: ReadableStream<Uint8Array>,
  path: string,
  options: WriteToFileOptions = {},
): Promise<{ readonly path: string; readonly bytes: number }> {
  assertServerRuntime();
  const temporary = join(
    dirname(path),
    `.${basename(path)}.${randomUUID()}.partial`,
  );
  let bytes = 0;
  const limit = options.maxBytes ?? Number.POSITIVE_INFINITY;
  const counter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      bytes += chunk.length;
      if (bytes > limit) {
        callback(
          new PolymorfaMediaIntegrityError(
            `The media exceeds the ${limit} byte limit.`,
            "media_too_large",
          ),
        );
        return;
      }
      callback(null, chunk);
    },
  });
  const input = Readable.fromWeb(body as NodeReadableStream<Uint8Array>);
  const output = createWriteStream(temporary, { flags: "wx", mode: 0o600 });
  const outputClosed = new Promise<void>((resolve) => {
    output.once("close", resolve);
  });
  try {
    await pipeline(
      input,
      counter,
      output,
      ...(options.signal === undefined ? [] : [{ signal: options.signal }]),
    );
    if (options.overwrite === false) {
      try {
        await link(temporary, path);
      } catch (error) {
        if ((error as { code?: unknown }).code === "EEXIST") {
          throw new PolymorfaConflictError(`${path} already exists.`, {
            code: "file_exists",
          });
        }
        throw error;
      }
      await unlink(temporary);
    } else {
      await rename(temporary, path);
    }
    return { path, bytes };
  } catch (error) {
    // An abort can reject pipeline before the file descriptor finishes opening.
    // Wait for close so a late open cannot recreate the partial file after unlink.
    output.destroy();
    await outputClosed;
    await unlink(temporary).catch(() => undefined);
    await body.cancel().catch(() => undefined);
    if (options.signal?.aborted === true) {
      throw new PolymorfaCancelledError(
        "The request was cancelled by the caller.",
        { code: "request_cancelled", cause: error },
      );
    }
    throw error;
  }
}

/** Downloads Messaging media through the Polymorfa API into a file. */
export async function downloadMediaToFile(
  media: Pick<MessagingMediaResource, "downloadStream">,
  mediaId: string,
  path: string,
  options: RequestOptions & {
    readonly overwrite?: boolean;
    readonly maxBytes?: number;
  } = {},
): Promise<{
  readonly path: string;
  readonly bytes: number;
  readonly contentType?: string;
  readonly filename?: string;
  readonly requestId?: string;
}> {
  const { overwrite, maxBytes, ...request } = options;
  if (overwrite === false && (await exists(path))) {
    throw new PolymorfaConflictError(`${path} already exists.`, {
      code: "file_exists",
    });
  }
  const download = await media.downloadStream(mediaId, request);
  if (
    maxBytes !== undefined &&
    download.contentLength !== undefined &&
    download.contentLength > maxBytes
  ) {
    await download.body.cancel().catch(() => undefined);
    throw new PolymorfaMediaIntegrityError(
      `The media is ${download.contentLength} bytes and exceeds the ${maxBytes} byte limit.`,
      "media_too_large",
    );
  }
  const written = await writeStreamToFile(
    download.body,
    path,
    fileOptions(options),
  );
  return {
    ...written,
    ...(download.contentType === undefined
      ? {}
      : { contentType: download.contentType }),
    ...(download.filename === undefined ? {} : { filename: download.filename }),
    ...(download.requestId === undefined
      ? {}
      : { requestId: download.requestId }),
  };
}

/**
 * Downloads and decrypts WhatsApp media straight from the CDN into a file.
 * Decryption streams (`verify: "streaming"` with `nodeMediaCrypto`) and the
 * file is renamed into place only after the MAC and hashes verify.
 */
export async function downloadWhatsAppMediaToFile(
  input: WhatsAppMediaInput,
  path: string,
  options: WhatsAppMediaDownloadOptions & {
    readonly overwrite?: boolean;
  } = {},
): Promise<
  Omit<WhatsAppMediaDownload, "body" | "arrayBuffer" | "blob"> & {
    readonly path: string;
    readonly bytes: number;
  }
> {
  const { overwrite, ...downloadOptions } = options;
  const download = await downloadWhatsAppMedia(input, {
    crypto: nodeMediaCrypto,
    verify: "streaming",
    ...downloadOptions,
  });
  const written = await writeStreamToFile(
    download.body,
    path,
    fileOptions({
      ...(options.signal === undefined ? {} : { signal: options.signal }),
      ...(overwrite === undefined ? {} : { overwrite }),
    }),
  );
  return {
    ...written,
    mediaKind: download.mediaKind,
    mimetype: download.mimetype,
    ...(download.fileName === undefined ? {} : { fileName: download.fileName }),
    ...(download.fileLength === undefined
      ? {}
      : { fileLength: download.fileLength }),
  };
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
