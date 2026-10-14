/**
 * S3-compatible media store (AWS S3, Cloudflare R2, MinIO). Import from
 * `@polymorfa/sdk/s3` on Node.js; it needs the `@aws-sdk/client-s3` peer
 * dependency. Media keys never leave this process and are never written to
 * object metadata.
 */
import { createReadStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { finished } from "node:stream/promises";

import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  type S3Client,
} from "@aws-sdk/client-s3";

import { assertServerRuntime } from "./credentials.js";
import {
  PolymorfaConfigurationError,
  PolymorfaMediaIntegrityError,
} from "./errors.js";
import type { WhatsAppUploadMediaType } from "./media/encrypt.js";
import type {
  UploadWhatsAppMediaOptions,
  WhatsAppMediaResource,
  WhatsAppMediaSource,
  WhatsAppMediaUploadResult,
} from "./media/upload.js";
import {
  decodeWhatsAppMedia,
  type WhatsAppMediaDescriptor,
  type WhatsAppMediaDownloadOptions,
  type WhatsAppMediaInput,
} from "./media/whatsapp.js";
import { downloadWhatsAppMediaToFile, nodeMediaEncryptor } from "./node.js";

export interface S3MediaStoreOptions {
  /** Your S3 client, configured for AWS, R2 or MinIO. */
  readonly client: S3Client;
  readonly bucket: string;
  /** Prepended to every key, for example `whatsapp/`. */
  readonly prefix?: string;
}

export interface S3UploadToWhatsAppOptions extends Pick<
  UploadWhatsAppMediaOptions,
  "egress" | "maxBytes" | "signal" | "fetch"
> {
  /** Anything with the Messaging client's `whatsappMedia` resource. */
  readonly messaging: { readonly whatsappMedia: WhatsAppMediaResource };
  readonly session: string;
  /** Object key, relative to `prefix`. */
  readonly key: string;
  readonly mediaType: WhatsAppUploadMediaType;
  /** Defaults to the object's `Content-Type`. */
  readonly mimetype?: string;
}

export interface S3ArchiveOptions extends Pick<
  WhatsAppMediaDownloadOptions,
  "fetch" | "signal" | "maxBytes"
> {
  /** Object key, relative to `prefix`. */
  readonly key: string;
  /** Extra object metadata (ASCII). Keys are lowercased by S3. */
  readonly metadata?: Readonly<Record<string, string>>;
  /** Directory for the private verified spool; removed on success, cancellation or failure. */
  readonly scratchDirectory?: string;
}

export interface S3ArchiveResult {
  readonly bucket: string;
  readonly key: string;
  readonly bytes: number;
  readonly mimetype: string;
  readonly etag?: string;
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

function isDescriptor(
  input: WhatsAppMediaInput,
): input is WhatsAppMediaDescriptor {
  return typeof input === "object" && input !== null && "mediaKey" in input;
}

/**
 * Moves media between a bucket and WhatsApp without holding whole files in
 * memory when the size is known.
 */
export class S3MediaStore {
  readonly #client: S3Client;
  readonly #bucket: string;
  readonly #prefix: string;

  constructor(options: S3MediaStoreOptions) {
    assertServerRuntime();
    if (typeof options.bucket !== "string" || options.bucket.length === 0) {
      throw new PolymorfaConfigurationError(
        "bucket must be a non-empty string.",
        "bucket",
      );
    }
    this.#client = options.client;
    this.#bucket = options.bucket;
    this.#prefix = options.prefix ?? "";
  }

  #key(key: string): string {
    if (typeof key !== "string" || key.length === 0) {
      throw new PolymorfaConfigurationError(
        "key must be a non-empty string.",
        "key",
      );
    }
    return `${this.#prefix}${key}`;
  }

  /**
   * Streams an object, encrypts it and uploads it to WhatsApp. The object
   * is read twice (hash pass, then upload pass); both reads are pinned to
   * the same ETag so a concurrent overwrite fails the upload instead of
   * sending mismatched bytes.
   */
  async uploadToWhatsApp(
    options: S3UploadToWhatsAppOptions,
  ): Promise<WhatsAppMediaUploadResult> {
    const key = this.#key(options.key);
    const head = await this.#client.send(
      new HeadObjectCommand({ Bucket: this.#bucket, Key: key }),
      options.signal === undefined ? {} : { abortSignal: options.signal },
    );
    const etag = head.ETag;
    if (etag === undefined || etag.length === 0) {
      throw new PolymorfaConfigurationError(
        "The object must expose an ETag for stable reads.",
        "key",
      );
    }
    const source: WhatsAppMediaSource = {
      ...(head.ContentLength === undefined ? {} : { size: head.ContentLength }),
      open: async () => {
        const object = await this.#client.send(
          new GetObjectCommand({
            Bucket: this.#bucket,
            Key: key,
            IfMatch: etag,
          }),
          options.signal === undefined ? {} : { abortSignal: options.signal },
        );
        if (object.Body === undefined) {
          throw new PolymorfaConfigurationError(
            "The object has no body.",
            "key",
          );
        }
        return object.Body.transformToWebStream() as ReadableStream<Uint8Array>;
      },
    };
    const mimetype = options.mimetype ?? head.ContentType;
    return options.messaging.whatsappMedia.upload(options.session, source, {
      mediaType: options.mediaType,
      encryptor: nodeMediaEncryptor,
      ...(mimetype === undefined ? {} : { mimetype }),
      ...(options.egress === undefined ? {} : { egress: options.egress }),
      ...(options.maxBytes === undefined ? {} : { maxBytes: options.maxBytes }),
      ...(options.signal === undefined ? {} : { signal: options.signal }),
      ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
    });
  }

  /**
   * Downloads WhatsApp media (for example from an inbound message webhook,
   * before the CDN copy expires), verifies and decrypts it, and writes the
   * plaintext to the bucket. Verification completes in a private local spool
   * before an object PUT starts, keeping memory bounded and preventing an
   * integrity failure from replacing a valid object. The spool is removed
   * after success, cancellation or failure.
   */
  async archive(
    input: WhatsAppMediaInput,
    options: S3ArchiveOptions,
  ): Promise<S3ArchiveResult> {
    const key = this.#key(options.key);
    const descriptor = isDescriptor(input)
      ? input
      : typeof input === "object" &&
          input !== null &&
          typeof input.media === "string"
        ? decodeWhatsAppMedia(input.media, input.type)
        : input;
    const directory = await mkdtemp(
      join(options.scratchDirectory ?? tmpdir(), "polymorfa-media-"),
    );
    let body: ReturnType<typeof createReadStream> | undefined;
    try {
      const download = await downloadWhatsAppMediaToFile(
        descriptor,
        join(directory, "verified"),
        {
          ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
          ...(options.signal === undefined ? {} : { signal: options.signal }),
          ...(options.maxBytes === undefined
            ? {}
            : { maxBytes: options.maxBytes }),
        },
      );
      if (
        isDescriptor(descriptor) &&
        descriptor.fileLength !== undefined &&
        descriptor.fileLength !== download.bytes
      ) {
        throw new PolymorfaMediaIntegrityError(
          "The media length does not match the descriptor.",
          "media_invalid_descriptor",
        );
      }
      const metadata: Record<string, string> = {
        ...options.metadata,
        "wa-media-kind": download.mediaKind,
        ...(isDescriptor(descriptor) && descriptor.fileSha256 !== undefined
          ? { "wa-file-sha256": hex(descriptor.fileSha256) }
          : {}),
        ...(download.fileName === undefined
          ? {}
          : { "wa-file-name": encodeURIComponent(download.fileName) }),
      };
      body = createReadStream(download.path);
      const result = await this.#client.send(
        new PutObjectCommand({
          Bucket: this.#bucket,
          Key: key,
          Body: body,
          ContentLength: download.bytes,
          ContentType: download.mimetype,
          Metadata: metadata,
        }),
        options.signal === undefined ? {} : { abortSignal: options.signal },
      );
      return Object.freeze({
        bucket: this.#bucket,
        key,
        bytes: download.bytes,
        mimetype: download.mimetype,
        ...(result.ETag === undefined ? {} : { etag: result.ETag }),
      });
    } finally {
      if (body !== undefined) {
        body.destroy();
        await finished(body, { cleanup: true }).catch(() => undefined);
      }
      await rm(directory, { recursive: true, force: true });
    }
  }
}
