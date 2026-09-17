import {
  downloadWhatsAppMedia,
  type WhatsAppMediaDownload,
  type WhatsAppMediaDownloadOptions,
  type WhatsAppMediaInput,
} from "../media/whatsapp.js";
import { HttpTransport } from "../transport/http.js";
import type { ApiResponse, RequestOptions } from "../transport/types.js";
import type {
  GetMessagingMediaInfoResponse,
  SuccessResponse,
} from "./types.js";

export interface MediaDownloadStream {
  /** Unbuffered body. Read it once or cancel it. */
  readonly body: ReadableStream<Uint8Array>;
  readonly contentType?: string;
  readonly contentLength?: number;
  readonly filename?: string;
  readonly requestId?: string;
  /** True when the API redirected to object storage and the SDK followed it. */
  readonly redirected: boolean;
}

export interface MediaDownloadBlob {
  readonly blob: Blob;
  readonly filename?: string;
  readonly requestId?: string;
}

/**
 * The API answered with a short-lived signed storage URL. The URL is a
 * bearer secret: do not log or store it, and hand it out only to a caller
 * already authorized for this media.
 */
export interface MediaDownloadRedirectUrl {
  readonly streamed: false;
  readonly url: string;
  /** Derived from the signed URL's query parameters when present. */
  readonly expiresAt?: Date;
  readonly requestId?: string;
}

/** The API streams this media itself; there is no direct URL. */
export interface MediaDownloadStreamedUrl {
  readonly streamed: true;
  readonly url: undefined;
  readonly requestId?: string;
}

export type MediaDownloadUrl =
  MediaDownloadRedirectUrl | MediaDownloadStreamedUrl;

export class MessagingMediaResource {
  constructor(private readonly transport: HttpTransport) {}

  /** Buffers the whole file. Prefer `downloadStream` for large media. */
  download(
    mediaId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<ArrayBuffer>> {
    return this.transport.requestBinary({
      method: "GET",
      path: mediaPath(mediaId),
      ...options,
    });
  }

  /**
   * Streams media without buffering. A storage redirect is followed without
   * sending the Polymorfa credential to the storage host. `timeoutMs` covers
   * the wait for response headers; `signal` also cancels the body.
   */
  async downloadStream(
    mediaId: string,
    options: RequestOptions = {},
  ): Promise<MediaDownloadStream> {
    const response = await this.transport.requestStream({
      method: "GET",
      path: mediaPath(mediaId),
      ...options,
    });
    return Object.freeze({
      body: response.body,
      ...(response.contentType === undefined
        ? {}
        : { contentType: response.contentType }),
      ...(response.contentLength === undefined
        ? {}
        : { contentLength: response.contentLength }),
      ...(response.filename === undefined
        ? {}
        : { filename: response.filename }),
      ...(response.metadata.requestId === undefined
        ? {}
        : { requestId: response.metadata.requestId }),
      redirected: response.redirected,
    });
  }

  /** Downloads media into a `Blob` typed with the response content type. */
  async downloadBlob(
    mediaId: string,
    options: RequestOptions = {},
  ): Promise<MediaDownloadBlob> {
    const download = await this.downloadStream(mediaId, options);
    const bytes = await new Response(download.body).arrayBuffer();
    return Object.freeze({
      blob: new Blob([bytes], {
        type: download.contentType ?? "application/octet-stream",
      }),
      ...(download.filename === undefined
        ? {}
        : { filename: download.filename }),
      ...(download.requestId === undefined
        ? {}
        : { requestId: download.requestId }),
    });
  }

  /**
   * Returns the signed storage URL the API redirects to, without following
   * it. When the API streams the media instead, returns `{ streamed: true }`
   * and discards the body. The signed URL is short-lived; never log or store
   * it.
   */
  async downloadUrl(
    mediaId: string,
    options: RequestOptions = {},
  ): Promise<MediaDownloadUrl> {
    const result = await this.transport.requestStreamOrRedirect({
      method: "GET",
      path: mediaPath(mediaId),
      ...options,
    });
    const requestId = result.metadata.requestId;
    if ("body" in result) {
      await result.body.cancel().catch(() => undefined);
      return Object.freeze({
        streamed: true,
        url: undefined,
        ...(requestId === undefined ? {} : { requestId }),
      });
    }
    const expiresAt = signedUrlExpiry(result.location);
    return Object.freeze({
      streamed: false,
      url: result.location,
      ...(expiresAt === undefined ? {} : { expiresAt }),
      ...(requestId === undefined ? {} : { requestId }),
    });
  }

  /**
   * Downloads an attachment directly from the WhatsApp CDN using the
   * encrypted descriptor in a message webhook (`media`), and decrypts it
   * locally. No Polymorfa API call is made.
   */
  downloadFromWhatsApp(
    eventOrMedia: WhatsAppMediaInput,
    options: WhatsAppMediaDownloadOptions = {},
  ): Promise<WhatsAppMediaDownload> {
    return downloadWhatsAppMedia(eventOrMedia, options);
  }

  retrieve(
    mediaId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<GetMessagingMediaInfoResponse>> {
    return this.transport.request({
      method: "GET",
      path: `${mediaPath(mediaId)}/info`,
      ...options,
    });
  }

  persist(
    mediaId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<SuccessResponse>> {
    return this.transport.request({
      method: "POST",
      path: `${mediaPath(mediaId)}/download-and-save`,
      ...options,
    });
  }
}

function mediaPath(mediaId: string): string {
  return `/messaging/media/${encodeURIComponent(mediaId)}`;
}

/** Reads SigV4 (`X-Amz-Date` + `X-Amz-Expires`) or epoch `Expires` parameters. */
export function signedUrlExpiry(value: string): Date | undefined {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return undefined;
  }
  const params = url.searchParams;
  const amzDate = params.get("X-Amz-Date");
  const amzExpires = params.get("X-Amz-Expires");
  if (amzDate !== null && amzExpires !== null && /^\d+$/.test(amzExpires)) {
    const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(
      amzDate,
    );
    if (match !== null) {
      const [, y, mo, d, h, mi, s] = match.map(Number) as number[];
      const start = Date.UTC(y!, mo! - 1, d!, h!, mi!, s!);
      return new Date(start + Number(amzExpires) * 1000);
    }
  }
  const expires = params.get("Expires");
  if (expires !== null && /^\d{9,11}$/.test(expires)) {
    return new Date(Number(expires) * 1000);
  }
  return undefined;
}
