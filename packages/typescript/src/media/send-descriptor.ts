import { PolymorfaConfigurationError } from "../errors.js";
import type { EncryptedWhatsAppMediaInfo } from "./encrypt.js";
import type { WhatsAppUploadLocation } from "./upload.js";

/**
 * A pre-uploaded attachment for a message send. Binary fields are standard
 * base64. `mediaKey` decrypts the file: send it only to Polymorfa's send API
 * and never log it.
 * @experimental Pending backend alignment of the send request field.
 */
export interface WhatsAppMediaSendDescriptor {
  readonly directPath: string;
  readonly mediaKey: string;
  readonly fileSha256: string;
  readonly fileEncSha256: string;
  readonly fileLength: number;
  readonly mimetype: string;
  readonly url?: string;
  /** JPEG thumbnail, base64. */
  readonly thumbnail?: string;
  readonly width?: number;
  readonly height?: number;
  /** Duration in whole seconds for audio, voice notes and video. */
  readonly seconds?: number;
  /** Voice-note waveform, base64 (64 samples, one byte each). */
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
  if (typeof mimetype !== "string" || mimetype.length === 0) {
    throw new PolymorfaConfigurationError(
      "mimetype is required; pass it when encrypting or here.",
      "mimetype",
    );
  }
  if (typeof upload.directPath !== "string" || upload.directPath.length === 0) {
    throw new PolymorfaConfigurationError(
      "The upload result has no directPath.",
      "directPath",
    );
  }
  const width = nonNegativeInteger(metadata.width, "width");
  const height = nonNegativeInteger(metadata.height, "height");
  const seconds = nonNegativeInteger(metadata.seconds, "seconds");
  return Object.freeze({
    directPath: upload.directPath,
    mediaKey: base64(upload.mediaKey),
    fileSha256: base64(upload.fileSha256),
    fileEncSha256: base64(upload.fileEncSha256),
    fileLength: upload.fileLength,
    mimetype,
    ...(upload.url === undefined || upload.url.length === 0
      ? {}
      : { url: upload.url }),
    ...(metadata.thumbnail === undefined
      ? {}
      : { thumbnail: base64(metadata.thumbnail) }),
    ...(width === undefined ? {} : { width }),
    ...(height === undefined ? {} : { height }),
    ...(seconds === undefined ? {} : { seconds }),
    ...(metadata.waveform === undefined
      ? {}
      : { waveform: base64(metadata.waveform) }),
  });
}
