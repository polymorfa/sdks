import {
  PolymorfaCancelledError,
  PolymorfaConfigurationError,
  PolymorfaConnectionError,
  PolymorfaError,
  PolymorfaMediaIntegrityError,
} from "../errors.js";
import type { HttpTransport } from "../transport/http.js";
import type { RequestOptions } from "../transport/types.js";
import { DirectMediaApi, type WhatsAppUploadGrant } from "./direct-api.js";
import {
  encryptWhatsAppMedia,
  encryptWhatsAppMediaStream,
  generateWhatsAppMediaKey,
  plaintextStream,
  webCryptoMediaEncryptor,
  type EncryptedWhatsAppMediaInfo,
  type WhatsAppMediaEncryptor,
  type WhatsAppMediaPlaintext,
  type WhatsAppUploadMediaType,
} from "./encrypt.js";
import { timingSafeEqualBytes } from "./whatsapp.js";

/**
 * Plaintext to upload. Bytes, a `Blob` and an `{ open }` factory can be read
 * twice, which lets a streaming encryptor upload without buffering: the
 * first pass computes `fileEncSha256` (WhatsApp needs it in the upload URL),
 * the second streams the ciphertext. A bare `ReadableStream` can be read
 * once, so it is encrypted into memory first (bounded by `maxBytes`).
 */
export type WhatsAppMediaSource =
  | WhatsAppMediaPlaintext
  | {
      /** Returns a fresh stream of the same bytes on every call. */
      readonly open: () =>
        ReadableStream<Uint8Array> | Promise<ReadableStream<Uint8Array>>;
      /** Plaintext size in bytes, when known. */
      readonly size?: number;
    };

/** Encrypted bytes ready for a transport. */
export interface WhatsAppEncryptedUploadBody {
  readonly mediaType: WhatsAppUploadMediaType;
  readonly fileEncSha256: Uint8Array;
  /** Length of `ciphertext || mac10`. */
  readonly encryptedLength: number;
  /** Opens `ciphertext || mac10` from byte `offset` (default 0). */
  open(offset?: number): Promise<ReadableStream<Uint8Array>>;
  /** The whole `ciphertext || mac10` when it is already in memory. */
  readonly ciphertext?: Uint8Array;
}

/** Where WhatsApp stored the upload. */
export interface WhatsAppUploadLocation {
  readonly directPath: string;
  readonly url: string;
  /** Upload handle, when WhatsApp returns one. */
  readonly handle?: string;
}

/**
 * Moves encrypted bytes to WhatsApp's media hosts. The SDK ships `relay`
 * (through the session's own connection) and `direct` (from your network).
 */
export interface WhatsAppMediaUploadTransport {
  readonly name: string;
  upload(
    session: string,
    body: WhatsAppEncryptedUploadBody,
    options: { readonly signal?: AbortSignal },
  ): Promise<WhatsAppUploadLocation>;
}

export type WhatsAppMediaEgress = "relay" | "direct";

export interface UploadWhatsAppMediaOptions {
  readonly mediaType: WhatsAppUploadMediaType;
  readonly mimetype?: string;
  /**
   * `relay` (default) sends ciphertext to Polymorfa, which forwards it to
   * WhatsApp over the session's connection. `direct` uploads from this
   * process with a short-lived grant. Pass a transport to use your own.
   */
  readonly egress?: WhatsAppMediaEgress | WhatsAppMediaUploadTransport;
  /** Pass `nodeMediaEncryptor` from `@polymorfa/sdk/node` to stream. */
  readonly encryptor?: WhatsAppMediaEncryptor;
  /** Maximum plaintext size. Defaults to 256 MiB. */
  readonly maxBytes?: number;
  readonly signal?: AbortSignal;
  /** `fetch` used by the `direct` transport to reach WhatsApp. */
  readonly fetch?: typeof globalThis.fetch;
}

/**
 * Upload result: the location plus everything needed to send the media.
 * `mediaKey` is secret; never log it.
 */
export interface WhatsAppMediaUploadResult
  extends EncryptedWhatsAppMediaInfo, WhatsAppUploadLocation {
  readonly egress: string;
}

const MiB = 1024 * 1024;

function isFactory(
  source: WhatsAppMediaSource,
): source is Extract<WhatsAppMediaSource, { open: unknown }> {
  return (
    typeof source === "object" &&
    source !== null &&
    !(source instanceof ReadableStream) &&
    !(source instanceof Uint8Array) &&
    !(source instanceof ArrayBuffer) &&
    !(typeof Blob !== "undefined" && source instanceof Blob) &&
    typeof (source as { open?: unknown }).open === "function"
  );
}

function bytesStream(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      if (bytes.length > 0) controller.enqueue(bytes);
      controller.close();
    },
  });
}

/** Drops the first `offset` bytes of a stream without buffering. */
function skip(
  stream: ReadableStream<Uint8Array>,
  offset: number,
): ReadableStream<Uint8Array> {
  if (offset <= 0) return stream;
  const reader = stream.getReader();
  let remaining = offset;
  return new ReadableStream<Uint8Array>(
    {
      async pull(controller) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            controller.close();
            return;
          }
          if (remaining >= value.length) {
            remaining -= value.length;
            continue;
          }
          controller.enqueue(remaining > 0 ? value.subarray(remaining) : value);
          remaining = 0;
          return;
        }
      },
      cancel: (reason) => reader.cancel(reason),
    },
    { highWaterMark: 0 },
  );
}

/**
 * Hands out consecutive byte ranges of one upload body. Parts read in order
 * share one encryption pass; a retried part reopens the body at its offset.
 */
class SequentialParts {
  #reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  #position = 0;
  #pending: Uint8Array | undefined;

  constructor(private readonly body: WhatsAppEncryptedUploadBody) {}

  async part(
    start: number,
    length: number,
  ): Promise<ReadableStream<Uint8Array> | Uint8Array> {
    if (this.body.ciphertext !== undefined) {
      return this.body.ciphertext.subarray(start, start + length);
    }
    if (this.#reader === undefined || this.#position !== start) {
      await this.#reader?.cancel().catch(() => undefined);
      this.#reader = (await this.body.open(start)).getReader();
      this.#position = start;
      this.#pending = undefined;
    }
    const reader = this.#reader;
    let remaining = length;
    return new ReadableStream<Uint8Array>(
      {
        pull: async (controller) => {
          if (remaining === 0) {
            controller.close();
            return;
          }
          let chunk = this.#pending;
          this.#pending = undefined;
          if (chunk === undefined) {
            const { done, value } = await reader.read();
            if (done) {
              controller.close();
              return;
            }
            chunk = value;
          }
          if (chunk.length > remaining) {
            this.#pending = chunk.subarray(remaining);
            chunk = chunk.subarray(0, remaining);
          }
          remaining -= chunk.length;
          this.#position += chunk.length;
          controller.enqueue(chunk);
        },
      },
      { highWaterMark: 0 },
    );
  }

  async close(): Promise<void> {
    await this.#reader?.cancel().catch(() => undefined);
    this.#reader = undefined;
  }
}

async function payloadFrom(
  body: WhatsAppEncryptedUploadBody,
  offset: number,
): Promise<ReadableStream<Uint8Array> | Uint8Array> {
  return body.ciphertext !== undefined
    ? body.ciphertext.subarray(offset)
    : body.open(offset);
}

/**
 * Fails the stream at its end when the re-encrypted bytes differ from the
 * first pass, which means the source changed between reads.
 */
function verifyPass(
  body: ReadableStream<Uint8Array>,
  info: Promise<EncryptedWhatsAppMediaInfo>,
  expected: Uint8Array,
): ReadableStream<Uint8Array> {
  const reader = body.getReader();
  return new ReadableStream<Uint8Array>(
    {
      async pull(controller) {
        const { done, value } = await reader.read();
        if (!done) {
          controller.enqueue(value);
          return;
        }
        const second = await info;
        if (!timingSafeEqualBytes(second.fileEncSha256, expected)) {
          controller.error(
            new PolymorfaMediaIntegrityError(
              "The media source changed between the hashing and upload passes.",
              "media_enc_hash_mismatch",
            ),
          );
          return;
        }
        controller.close();
      },
      cancel: (reason) => reader.cancel(reason),
    },
    { highWaterMark: 0 },
  );
}

/**
 * Encrypts a source and returns an upload body. Re-readable sources with an
 * incremental encryptor are read twice and never buffered; everything else
 * is encrypted into memory once.
 * @internal
 */
export async function prepareWhatsAppUpload(
  source: WhatsAppMediaSource,
  options: Pick<
    UploadWhatsAppMediaOptions,
    "mediaType" | "mimetype" | "encryptor" | "maxBytes"
  >,
): Promise<{
  readonly info: EncryptedWhatsAppMediaInfo;
  readonly body: WhatsAppEncryptedUploadBody;
}> {
  const encryptor = options.encryptor ?? webCryptoMediaEncryptor;
  const reopenable =
    isFactory(source) ||
    (typeof Blob !== "undefined" && source instanceof Blob);
  const common = {
    mediaType: options.mediaType,
    ...(options.mimetype === undefined ? {} : { mimetype: options.mimetype }),
    ...(options.maxBytes === undefined ? {} : { maxBytes: options.maxBytes }),
    encryptor,
  };
  if (reopenable && encryptor.incremental) {
    const open = async (): Promise<ReadableStream<Uint8Array>> =>
      isFactory(source)
        ? await source.open()
        : plaintextStream(source as Blob);
    const mediaKey = generateWhatsAppMediaKey();
    const first = encryptWhatsAppMediaStream(await open(), {
      ...common,
      mediaKey,
    });
    const reader = first.body.getReader();
    while (!(await reader.read()).done) {
      // Hash-only pass: the ciphertext is discarded.
    }
    const info = await first.info;
    return {
      info,
      body: Object.freeze({
        mediaType: info.mediaType,
        fileEncSha256: info.fileEncSha256,
        encryptedLength: info.encryptedLength,
        async open(offset = 0) {
          const pass = encryptWhatsAppMediaStream(await open(), {
            ...common,
            mediaKey,
          });
          return skip(
            verifyPass(pass.body, pass.info, info.fileEncSha256),
            offset,
          );
        },
      }),
    };
  }
  const input = isFactory(source) ? await source.open() : source;
  const encrypted = await encryptWhatsAppMedia(input, common);
  const { ciphertext, ...info } = encrypted;
  return {
    info: Object.freeze(info),
    body: Object.freeze({
      mediaType: info.mediaType,
      fileEncSha256: info.fileEncSha256,
      encryptedLength: info.encryptedLength,
      open: async (offset = 0) => bytesStream(ciphertext.subarray(offset)),
      ciphertext,
    }),
  };
}

/** Unpadded base64url, as WhatsApp uses in upload URLs. */
export function base64UrlUnpadded(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Relay egress: streams ciphertext to Polymorfa, which uploads it through the
 * session's connection. Polymorfa receives ciphertext only, never the key.
 */
export function createRelayUploadTransport(
  api: DirectMediaApi,
  requestOptions: RequestOptions = {},
): WhatsAppMediaUploadTransport {
  return Object.freeze({
    name: "relay",
    async upload(
      session: string,
      body: WhatsAppEncryptedUploadBody,
      options: { readonly signal?: AbortSignal },
    ) {
      return api.relayUpload(
        session,
        {
          mediaType: body.mediaType,
          fileEncSha256: base64UrlUnpadded(body.fileEncSha256),
          encryptedLength: body.encryptedLength,
          body: await payloadFrom(body, 0),
        },
        {
          ...requestOptions,
          ...(options.signal === undefined ? {} : { signal: options.signal }),
        },
      );
    },
  });
}

// Upload path per media type. Cellar whatsapp-1049257521
// WAWebMmsClientFormatHashUrl.js:6-24.
const UPLOAD_PATH: Readonly<Record<WhatsAppUploadMediaType, string>> = {
  image: "/mms/image",
  video: "/mms/video",
  audio: "/mms/audio",
  ptt: "/mms/ptt",
  document: "/mms/document",
  sticker: "/mms/sticker",
};

const WEB_ORIGIN = "https://web.whatsapp.com";

/** Documents above this size upload in parts (WAWebMmsClientUploadStreamer.js:21-24,247-249). */
const DOCUMENT_PART_SIZE = 50 * MiB;

export interface DirectUploadTransportOptions {
  readonly fetch?: typeof globalThis.fetch;
  /** Attempts per request, including the first. Defaults to 3. */
  readonly maxAttempts?: number;
  /**
   * Part size for chunked document uploads. Defaults to 50 MiB, matching
   * WhatsApp Web. Only documents larger than one part use chunked upload.
   */
  readonly documentPartSize?: number;
}

class UploadAttemptError extends Error {
  constructor(
    readonly status: number | undefined,
    readonly retryable: boolean,
    readonly unauthorized: boolean,
    readonly final: PolymorfaError,
  ) {
    super(final.message);
  }
}

// Retry rules: Cellar whatsapp-1049257521 WAWebMmsClientIsErrorRetryable.js:6-11
// (401, 408, network errors and 5xx except 507 retry). Status meanings:
// WAWebMmsClientMmsUpload.js:75-81.
function statusError(status: number): UploadAttemptError {
  const retryable =
    status === 401 || status === 408 || (status >= 500 && status !== 507);
  const code =
    status === 413
      ? "media_too_large"
      : status === 415
        ? "media_upload_hash_mismatch"
        : status === 507
          ? "media_upload_throttled"
          : status === 401
            ? "media_upload_unauthorized"
            : "media_upload_failed";
  return new UploadAttemptError(
    status,
    retryable,
    status === 401,
    new PolymorfaError(`The WhatsApp media host returned status ${status}.`, {
      status,
      code,
    }),
  );
}

function uploadUrl(
  host: string,
  body: WhatsAppEncryptedUploadBody,
  auth: string,
  query: Readonly<Record<string, string | undefined>>,
): string {
  // https://{host}{path}/{b64url(encHash)}?auth=..&token=.. with `token`
  // defaulting to the encrypted file hash. Cellar whatsapp-1049257521
  // WAWebMmsClientFormatUploadUrl.js:6-24, WAWebMmsClientFormatHashUrl.js:25-32,
  // WAWebUploadManagerMainThread.js:36.
  if (!/^[A-Za-z0-9.-]+$/.test(host)) {
    throw new PolymorfaError("The upload grant contains an invalid host.", {
      code: "invalid_response",
    });
  }
  const hash = base64UrlUnpadded(body.fileEncSha256);
  const params = new URLSearchParams({ auth, token: hash });
  for (const [name, value] of Object.entries(query)) {
    if (value !== undefined) params.set(name, value);
  }
  return `https://${host}${UPLOAD_PATH[body.mediaType]}/${hash}?${params.toString()}`;
}

function parseLocation(value: unknown): WhatsAppUploadLocation {
  const record =
    typeof value === "object" && value !== null
      ? (value as Record<string, unknown>)
      : {};
  const directPath = record["direct_path"];
  const url = record["url"];
  if (
    typeof directPath !== "string" ||
    directPath.length === 0 ||
    typeof url !== "string" ||
    url.length === 0
  ) {
    throw new PolymorfaError(
      "The WhatsApp media host returned no direct_path or url.",
      { code: "invalid_response" },
    );
  }
  const handle = record["handle"];
  return Object.freeze({
    directPath,
    url,
    ...(typeof handle === "string" && handle.length > 0 ? { handle } : {}),
  });
}

/**
 * Direct egress: fetches a short-lived upload grant from Polymorfa, then
 * POSTs `ciphertext || mac10` to WhatsApp from this process. A 401 refreshes
 * the grant; after a failed attempt the upload resumes from the offset
 * WhatsApp reports. The grant's `auth` is never logged or put in errors.
 */
export function createDirectUploadTransport(
  api: DirectMediaApi,
  options: DirectUploadTransportOptions = {},
  requestOptions: RequestOptions = {},
): WhatsAppMediaUploadTransport {
  const maxAttempts = options.maxAttempts ?? 3;
  if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 1) {
    throw new PolymorfaConfigurationError(
      "maxAttempts must be a positive integer.",
      "maxAttempts",
    );
  }
  const partSize = options.documentPartSize ?? DOCUMENT_PART_SIZE;
  if (!Number.isSafeInteger(partSize) || partSize <= 0) {
    throw new PolymorfaConfigurationError(
      "documentPartSize must be a positive integer.",
      "documentPartSize",
    );
  }

  return Object.freeze({
    name: "direct",
    async upload(
      session: string,
      body: WhatsAppEncryptedUploadBody,
      uploadOptions: { readonly signal?: AbortSignal },
    ) {
      const fetcher = options.fetch ?? globalThis.fetch;
      const signal = uploadOptions.signal;
      const requestGrant = () =>
        api.createUploadGrant(
          session,
          {
            mediaType: body.mediaType,
            fileEncSha256: base64UrlUnpadded(body.fileEncSha256),
            encryptedLength: body.encryptedLength,
          },
          {
            ...requestOptions,
            ...(signal === undefined ? {} : { signal }),
          },
        );
      let grant: WhatsAppUploadGrant = await requestGrant();

      const post = async (
        url: string,
        payload: ReadableStream<Uint8Array> | Uint8Array | undefined,
        length: number,
      ): Promise<unknown> => {
        const streaming = payload instanceof ReadableStream;
        let response: Response;
        try {
          response = await fetcher(url, {
            method: "POST",
            headers: {
              origin: WEB_ORIGIN,
              referer: `${WEB_ORIGIN}/`,
              ...(payload === undefined
                ? {}
                : { "content-length": String(length) }),
            },
            ...(payload === undefined
              ? {}
              : streaming
                ? { body: payload, duplex: "half" }
                : { body: payload.slice().buffer }),
            redirect: "error",
            credentials: "omit",
            referrerPolicy: "no-referrer",
            ...(signal === undefined ? {} : { signal }),
          } as RequestInit);
        } catch (error) {
          if (streaming) await payload.cancel().catch(() => undefined);
          if (signal?.aborted === true) {
            throw new PolymorfaCancelledError(
              "The upload was cancelled by the caller.",
              { code: "request_cancelled" },
            );
          }
          if (error instanceof PolymorfaError) throw error;
          // Never attach the cause: it may carry the URL with `auth`.
          throw new UploadAttemptError(
            undefined,
            true,
            false,
            new PolymorfaConnectionError(
              "The WhatsApp media host could not be reached.",
              { code: "connection_error" },
            ),
          );
        }
        if (!response.ok) {
          await response.body?.cancel().catch(() => undefined);
          throw statusError(response.status);
        }
        const text = await response.text();
        if (text.length === 0) return undefined;
        try {
          return JSON.parse(text) as unknown;
        } catch {
          throw new PolymorfaError(
            "The WhatsApp media host returned invalid JSON.",
            { code: "invalid_response" },
          );
        }
      };

      /** Runs `operation` with retries, host rotation and grant refresh. */
      const withRetries = async <T>(
        operation: (host: string, attempt: number) => Promise<T>,
      ): Promise<T> => {
        let lastError: UploadAttemptError | undefined;
        for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
          if (attempt > 0 && lastError?.unauthorized === true) {
            grant = await requestGrant();
          }
          const host = grant.hosts[attempt % grant.hosts.length]!;
          try {
            return await operation(host, attempt);
          } catch (error) {
            if (!(error instanceof UploadAttemptError)) throw error;
            lastError = error;
            if (!error.retryable) throw error.final;
          }
        }
        throw lastError!.final;
      };

      // Asks WhatsApp how much of an interrupted upload it holds.
      // Cellar whatsapp-1049257521 WAWebMmsClientMmsGetUploadProgress.js:16-47,
      // WAWebMmsClientMmsCheckIfUploadExists.js:21-38.
      const resumeOffset = async (
        host: string,
      ): Promise<WhatsAppUploadLocation | number> => {
        let progress: unknown;
        try {
          progress = await post(
            uploadUrl(host, body, grant.auth, { resume: "1" }),
            undefined,
            0,
          );
        } catch (error) {
          if (error instanceof UploadAttemptError && error.status === 404) {
            return 0;
          }
          throw error;
        }
        const record =
          typeof progress === "object" && progress !== null
            ? (progress as Record<string, unknown>)
            : {};
        if (record["resume"] === "complete") return parseLocation(record);
        const offset = Number.parseInt(String(record["resume"]), 10);
        return Number.isSafeInteger(offset) &&
          offset > 0 &&
          offset < body.encryptedLength
          ? offset
          : 0;
      };

      const total = body.encryptedLength;
      if (body.mediaType === "document" && total > partSize) {
        // Chunked upload: `stream=1` with byte ranges, then a finalize call
        // with `final_hash`. Cellar whatsapp-1049257521
        // WAWebMmsClientUploadStreamer.js:31-44, WAWebMmsClientMmsUploadStream.js:14-77.
        const parts = new SequentialParts(body);
        try {
          for (let start = 0; start < total; start += partSize) {
            const end = Math.min(start + partSize, total);
            await withRetries(async (host) => {
              await post(
                uploadUrl(host, body, grant.auth, {
                  stream: "1",
                  bytestart: String(start),
                  byteend: String(end),
                }),
                await parts.part(start, end - start),
                end - start,
              );
            });
          }
        } finally {
          await parts.close();
        }
        return withRetries(async (host) =>
          parseLocation(
            await post(
              uploadUrl(host, body, grant.auth, {
                stream: "1",
                final_hash: base64UrlUnpadded(body.fileEncSha256),
              }),
              undefined,
              0,
            ),
          ),
        );
      }

      return withRetries(async (host, attempt) => {
        let offset = 0;
        if (attempt > 0) {
          const resumed = await resumeOffset(host);
          if (typeof resumed !== "number") return resumed;
          offset = resumed;
        }
        // A resumed upload sends the remaining bytes with bytestart/byteend
        // (WAWebMmsClientUploadMethod.js:121-137).
        return parseLocation(
          await post(
            uploadUrl(
              host,
              body,
              grant.auth,
              offset > 0
                ? { bytestart: String(offset), byteend: String(total) }
                : {},
            ),
            await payloadFrom(body, offset),
            total - offset,
          ),
        );
      });
    },
  });
}

/**
 * Encrypts locally and uploads to WhatsApp. The returned object has
 * everything needed to send the media with `toWhatsAppMediaSendDescriptor`.
 */
export class WhatsAppMediaResource {
  readonly #api: DirectMediaApi;

  constructor(transport: HttpTransport) {
    this.#api = new DirectMediaApi(transport);
  }

  async upload(
    session: string,
    source: WhatsAppMediaSource,
    options: UploadWhatsAppMediaOptions,
  ): Promise<WhatsAppMediaUploadResult> {
    if (typeof session !== "string" || session.length === 0) {
      throw new PolymorfaConfigurationError(
        "session must be a non-empty string.",
        "session",
      );
    }
    const egress = options.egress ?? "relay";
    const transport =
      egress === "relay"
        ? createRelayUploadTransport(this.#api)
        : egress === "direct"
          ? createDirectUploadTransport(this.#api, {
              ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
            })
          : egress;
    if (
      typeof transport !== "object" ||
      transport === null ||
      typeof transport.upload !== "function"
    ) {
      throw new PolymorfaConfigurationError(
        "egress must be relay, direct or an upload transport.",
        "egress",
      );
    }
    const { info, body } = await prepareWhatsAppUpload(source, options);
    const location = await transport.upload(session, body, {
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    });
    return Object.freeze({ ...info, ...location, egress: transport.name });
  }

  /** Creates a transport you can reuse or wrap. */
  transport(
    egress: WhatsAppMediaEgress,
    options: DirectUploadTransportOptions = {},
  ): WhatsAppMediaUploadTransport {
    return egress === "relay"
      ? createRelayUploadTransport(this.#api)
      : createDirectUploadTransport(this.#api, options);
  }
}
