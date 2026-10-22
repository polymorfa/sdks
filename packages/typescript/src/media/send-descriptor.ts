import { PolymorfaConfigurationError } from "../errors.js";
import type { EncryptedWhatsAppMediaInfo } from "./encrypt.js";
import type { WhatsAppUploadLocation } from "./upload.js";
import { contractFields } from "../campaign-contract-validation.js";

/**
 * A pre-uploaded attachment for a message send. Binary fields are standard
 * base64. `mediaKey` decrypts the file: standard sessions send it to Polymorfa's send API
 * and never log it.
 * @experimental Requires the 2026-10-14 API contract.
 */
export interface WhatsAppMediaSendDescriptor {
  readonly directPath: string;
  readonly mediaKey: string;
  readonly fileSha256: string;
  readonly fileEncSha256: string;
  readonly fileLength: number;
  readonly mimeType: string;
  readonly url: string;
  readonly mediaKeyTimestamp?: number;
  readonly isAnimated?: boolean;
  /** JPEG thumbnail, base64. */
  readonly thumbnail?: string;
  readonly width?: number;
  readonly height?: number;
  /** Duration in whole seconds for audio, voice notes and video. */
  readonly seconds?: number;
  /** Voice-note waveform, base64 (64–192 bytes). */
  readonly waveform?: string;
}

export interface WhatsAppMediaSendMetadata {
  /** Overrides the mimetype recorded at encryption time. */
  readonly mimetype?: string;
  readonly thumbnail?: Uint8Array;
  readonly width?: number;
  readonly height?: number;
  readonly seconds?: number;
  readonly waveform?: Uint8Array;
  readonly mediaKeyTimestamp?: number;
  readonly isAnimated?: boolean;
}

/** @internal Hand-authored sticker descriptors use the same checks as builders. */
export function validateStickerContent(value: unknown): void {
  const media = contractFields(
    value,
    ["descriptor"],
    ["descriptor"],
    "sticker",
  );
  const d = contractFields(
    media.descriptor,
    [
      "directPath",
      "mediaKey",
      "fileSha256",
      "fileEncSha256",
      "fileLength",
      "mimeType",
      "url",
      "width",
      "height",
      "mediaKeyTimestamp",
      "isAnimated",
    ],
    [
      "directPath",
      "mediaKey",
      "fileSha256",
      "fileEncSha256",
      "fileLength",
      "mimeType",
      "url",
    ],
    "sticker.descriptor",
  );
  const bytes = (key: string): Uint8Array => {
    const value = d[key];
    if (typeof value !== "string" || !/^[A-Za-z0-9+/]{43}=$/.test(value))
      throw new PolymorfaConfigurationError(
        "Invalid sticker cryptographic field.",
        key,
      );
    return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
  };
  for (const key of ["width", "height", "mediaKeyTimestamp"])
    if (Object.hasOwn(d, key) && typeof d[key] !== "number")
      throw new PolymorfaConfigurationError("Invalid sticker metadata.", key);
  if (Object.hasOwn(d, "isAnimated") && typeof d.isAnimated !== "boolean")
    throw new PolymorfaConfigurationError(
      "Invalid sticker animation flag.",
      "isAnimated",
    );
  toWhatsAppMediaSendDescriptor(
    {
      mediaType: "sticker",
      mediaKey: bytes("mediaKey"),
      fileSha256: bytes("fileSha256"),
      fileEncSha256: bytes("fileEncSha256"),
      fileLength: d.fileLength as number,
      encryptedLength: 0,
      directPath: d.directPath as string,
      url: d.url as string,
      mimetype: d.mimeType as string,
    },
    {
      ...(Object.hasOwn(d, "width") ? { width: d.width as number } : {}),
      ...(Object.hasOwn(d, "height") ? { height: d.height as number } : {}),
      ...(Object.hasOwn(d, "mediaKeyTimestamp")
        ? { mediaKeyTimestamp: d.mediaKeyTimestamp as number }
        : {}),
      ...(Object.hasOwn(d, "isAnimated")
        ? { isAnimated: d.isAnimated as boolean }
        : {}),
    },
  );
}

function base64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function nonNegativeInteger(
  value: number | undefined,
  name: string,
): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new PolymorfaConfigurationError(
      `${name} must be a non-negative integer.`,
      name,
    );
  }
  return value;
}

/**
 * Builds the send descriptor from an upload result (or any encryption result
 * plus location) and optional display metadata.
 */
export function toWhatsAppMediaSendDescriptor(
  upload: EncryptedWhatsAppMediaInfo & WhatsAppUploadLocation,
  metadata: WhatsAppMediaSendMetadata = {},
): WhatsAppMediaSendDescriptor {
  const mimetype = metadata.mimetype ?? upload.mimetype;
  if (
    typeof mimetype !== "string" ||
    mimetype.length === 0 ||
    mimetype.length > 255 ||
    !/^[ -~]+$/.test(mimetype)
  ) {
    throw new PolymorfaConfigurationError(
      "mimetype is required; pass it when encrypting or here.",
      "mimetype",
    );
  }
  if (
    typeof upload.directPath !== "string" ||
    upload.directPath.length > 2048 ||
    !/^\/(?!\/)[!-~]+$/.test(upload.directPath)
  ) {
    throw new PolymorfaConfigurationError(
      "The upload result has no directPath.",
      "directPath",
    );
  }
  if (
    typeof upload.url !== "string" ||
    upload.url.length > 2048 ||
    !/^https:\/\/[!-~]+$/.test(upload.url)
  ) {
    throw new PolymorfaConfigurationError(
      "The upload result has no HTTPS media URL.",
      "url",
    );
  }
  if (
    !Number.isSafeInteger(upload.fileLength) ||
    upload.fileLength < 1 ||
    upload.fileLength > 2 ** 31
  ) {
    throw new PolymorfaConfigurationError(
      "fileLength must be between 1 and 2147483648 bytes.",
      "fileLength",
    );
  }
  for (const [name, bytes] of [
    ["mediaKey", upload.mediaKey],
    ["fileSha256", upload.fileSha256],
    ["fileEncSha256", upload.fileEncSha256],
  ] as const) {
    if (!(bytes instanceof Uint8Array) || bytes.length !== 32)
      throw new PolymorfaConfigurationError(`${name} must be 32 bytes.`, name);
  }
  const width = nonNegativeInteger(metadata.width, "width");
  const height = nonNegativeInteger(metadata.height, "height");
  const seconds = nonNegativeInteger(metadata.seconds, "seconds");
  if (
    (width === undefined) !== (height === undefined) ||
    (width !== undefined && (width < 1 || width > 65_536)) ||
    (height !== undefined && (height < 1 || height > 65_536))
  ) {
    throw new PolymorfaConfigurationError(
      "Send width and height together, between 1 and 65536 pixels.",
      "width",
    );
  }
  if (seconds !== undefined && seconds > 86_400)
    throw new PolymorfaConfigurationError(
      "seconds must not exceed 86400.",
      "seconds",
    );
  if (metadata.thumbnail !== undefined && metadata.thumbnail.length > 16 * 1024)
    throw new PolymorfaConfigurationError(
      "thumbnail must not exceed 16384 bytes.",
      "thumbnail",
    );
  if (
    metadata.waveform !== undefined &&
    (metadata.waveform.length < 64 || metadata.waveform.length > 192)
  )
    throw new PolymorfaConfigurationError(
      "waveform must contain 64 to 192 bytes.",
      "waveform",
    );
  const mediaKeyTimestamp = nonNegativeInteger(
    metadata.mediaKeyTimestamp,
    "mediaKeyTimestamp",
  );
  if (
    mediaKeyTimestamp !== undefined &&
    (mediaKeyTimestamp < 1 || mediaKeyTimestamp > 2 ** 40)
  )
    throw new PolymorfaConfigurationError(
      "mediaKeyTimestamp is outside the permitted range.",
      "mediaKeyTimestamp",
    );
  if (
    upload.mediaType === "sticker" &&
    (mimetype !== "image/webp" ||
      metadata.thumbnail !== undefined ||
      seconds !== undefined ||
      metadata.waveform !== undefined)
  )
    throw new PolymorfaConfigurationError(
      "Sticker descriptors require image/webp without thumbnail, seconds or waveform.",
      "mediaType",
    );
  if (upload.mediaType !== "sticker" && metadata.isAnimated !== undefined)
    throw new PolymorfaConfigurationError(
      "isAnimated is only valid for stickers.",
      "isAnimated",
    );
  return Object.freeze({
    directPath: upload.directPath,
    mediaKey: base64(upload.mediaKey),
    fileSha256: base64(upload.fileSha256),
    fileEncSha256: base64(upload.fileEncSha256),
    fileLength: upload.fileLength,
    mimeType: mimetype,
    url: upload.url,
    ...(metadata.thumbnail === undefined
      ? {}
      : { thumbnail: base64(metadata.thumbnail) }),
    ...(width === undefined ? {} : { width }),
    ...(height === undefined ? {} : { height }),
    ...(seconds === undefined ? {} : { seconds }),
    ...(metadata.waveform === undefined
      ? {}
      : { waveform: base64(metadata.waveform) }),
    ...(mediaKeyTimestamp === undefined ? {} : { mediaKeyTimestamp }),
    ...(metadata.isAnimated === undefined
      ? {}
      : { isAnimated: metadata.isAnimated }),
  });
}
