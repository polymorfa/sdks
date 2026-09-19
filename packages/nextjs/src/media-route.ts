/** Structural subset of `MessagingClient["media"]` used by the route. */
export interface MediaDownloadRouteResource {
  downloadStream(
    mediaId: string,
    options?: { readonly signal?: AbortSignal },
  ): Promise<{
    readonly body: ReadableStream<Uint8Array>;
    readonly contentType?: string;
    readonly contentLength?: number;
    readonly filename?: string;
  }>;
  downloadUrl(
    mediaId: string,
    options?: { readonly signal?: AbortSignal },
  ): Promise<
    | { readonly streamed: false; readonly url: string }
    | { readonly streamed: true; readonly url: undefined }
  >;
  downloadFromWhatsApp?(
    input: { readonly type: string; readonly media?: string },
    options?: { readonly signal?: AbortSignal },
  ): Promise<{
    readonly body: ReadableStream<Uint8Array>;
    readonly mimetype: string;
    readonly fileName?: string;
    readonly fileLength?: number;
  }>;
}

/** What the caller may download, decided by `authorize`. */
export type MediaDownloadGrant =
  | {
      /** Polymorfa media ID, for `redirect` and `proxy` modes. */
      readonly mediaId: string;
      /** Overrides the upstream filename in `Content-Disposition`. */
      readonly filename?: string;
    }
  | {
      /**
       * Stored message webhook fields, for `whatsapp` mode. `media` contains
       * a decryption key: load it from your own storage, never from the
       * request.
       */
      readonly message: { readonly type: string; readonly media: string };
      readonly filename?: string;
    };

export interface MediaDownloadRouteOptions {
  /**
   * Required. Authenticate the request and return what it may download, or
   * `null` to deny. Resolve the media from your own records rather than
   * trusting an ID supplied by the browser. Throwing also denies.
   */
  readonly authorize: (
    request: Request,
  ) => Promise<MediaDownloadGrant | null> | MediaDownloadGrant | null;
  /** A server-side `MessagingClient`. */
  readonly client: { readonly media: MediaDownloadRouteResource };
  /**
   * `redirect` answers 302 to a short-lived signed storage URL (and proxies
   * when the API streams instead). `proxy` streams bytes through this route.
   * `whatsapp` downloads and decrypts from the WhatsApp CDN server-side.
   */
  readonly mode: "redirect" | "proxy" | "whatsapp";
}

/** Types rendered inline. Everything else is served as an attachment. */
export const INLINE_MEDIA_TYPES: ReadonlySet<string> = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/avif",
  "audio/mpeg",
  "audio/ogg",
  "audio/aac",
  "audio/mp4",
  "audio/wav",
  "audio/webm",
  "video/mp4",
  "video/webm",
  "video/ogg",
  "video/3gpp",
  "video/quicktime",
]);

const baseHeaders = {
  "Cache-Control": "private, no-store",
  Vary: "Cookie, Authorization",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};

/** Creates a Next.js App Router-compatible GET route without importing Next.js. */
export function createMediaDownloadRoute(
  options: MediaDownloadRouteOptions,
): (request: Request) => Promise<Response> {
  if (typeof options.authorize !== "function") {
    throw new TypeError("authorize must be a function.");
  }
  if (
    typeof options.client?.media?.downloadStream !== "function" ||
    typeof options.client.media.downloadUrl !== "function"
  ) {
    throw new TypeError("client must be a Polymorfa MessagingClient.");
  }
  if (!["redirect", "proxy", "whatsapp"].includes(options.mode)) {
    throw new TypeError("mode must be redirect, proxy, or whatsapp.");
  }
  if (
    options.mode === "whatsapp" &&
    typeof options.client.media.downloadFromWhatsApp !== "function"
  ) {
    throw new TypeError("client.media.downloadFromWhatsApp is required.");
  }
  const media = options.client.media;

  return async (request: Request): Promise<Response> => {
    if (request.method !== "GET") {
      return jsonError(405, "method_not_allowed", "Use GET.", {
        Allow: "GET",
      });
    }
    let grant: MediaDownloadGrant | null;
    try {
      grant = await options.authorize(request);
    } catch {
      grant = null;
    }
    if (!isGrant(grant, options.mode)) {
      return jsonError(403, "forbidden", "You cannot download this media.");
    }
    const signal = request.signal;
    try {
      if (options.mode === "whatsapp" && "message" in grant) {
        const download = await media.downloadFromWhatsApp!(grant.message, {
          signal,
        });
        return proxied(
          download.body,
          download.mimetype,
          grant.filename ?? download.fileName,
          undefined,
        );
      }
      if (!("mediaId" in grant)) {
        return jsonError(403, "forbidden", "You cannot download this media.");
      }
      if (options.mode === "redirect") {
        const target = await media.downloadUrl(grant.mediaId, { signal });
        if (!target.streamed) {
          return new Response(null, {
            status: 302,
            headers: { ...baseHeaders, Location: target.url },
          });
        }
      }
      const download = await media.downloadStream(grant.mediaId, { signal });
      return proxied(
        download.body,
        download.contentType,
        grant.filename ?? download.filename,
        download.contentLength,
      );
    } catch (error) {
      const status = (error as { status?: unknown } | null)?.status;
      if (status === 404) {
        return jsonError(404, "not_found", "Media not found.");
      }
      return jsonError(
        502,
        "media_unavailable",
        "The media could not be downloaded.",
      );
    }
  };
}

function isGrant(
  grant: MediaDownloadGrant | null | undefined,
  mode: MediaDownloadRouteOptions["mode"],
): grant is MediaDownloadGrant {
  if (typeof grant !== "object" || grant === null) return false;
  if (mode === "whatsapp") {
    return (
      "message" in grant &&
      typeof grant.message?.media === "string" &&
      typeof grant.message.type === "string"
    );
  }
  return (
    "mediaId" in grant &&
    typeof grant.mediaId === "string" &&
    grant.mediaId.length > 0
  );
}

/** Returns the lowercase MIME essence, or undefined when malformed. */
export function mediaTypeEssence(
  value: string | undefined,
): string | undefined {
  const essence = value?.split(";")[0]?.trim().toLowerCase();
  return essence !== undefined &&
    /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(essence)
    ? essence
    : undefined;
}

/** Builds the safe response headers used by proxied media. */
export function safeMediaHeaders(
  contentType: string | undefined,
  filename: string | undefined,
  contentLength?: number,
): Record<string, string> {
  const essence = mediaTypeEssence(contentType);
  const inline = essence !== undefined && INLINE_MEDIA_TYPES.has(essence);
  const headers: Record<string, string> = {
    ...baseHeaders,
    "Content-Type": inline ? essence : "application/octet-stream",
    "Content-Security-Policy": "sandbox",
    "Content-Disposition": contentDisposition(
      inline ? "inline" : "attachment",
      filename,
    ),
  };
  if (contentLength !== undefined && Number.isSafeInteger(contentLength)) {
    headers["Content-Length"] = String(contentLength);
  }
  return headers;
}

function proxied(
  body: ReadableStream<Uint8Array>,
  contentType: string | undefined,
  filename: string | undefined,
  contentLength: number | undefined,
): Response {
  return new Response(body, {
    status: 200,
    headers: safeMediaHeaders(contentType, filename, contentLength),
  });
}

function contentDisposition(
  type: "inline" | "attachment",
  filename: string | undefined,
): string {
  if (filename === undefined) return type;
  const clean = Array.from(filename)
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code >= 0x20 && code !== 0x7f;
    })
    .join("")
    .replace(/[\\/]/g, "_")
    .slice(0, 255);
  if (clean.length === 0) return type;
  const ascii = clean.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  const encoded = encodeURIComponent(clean).replace(
    /['()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

function jsonError(
  status: number,
  code: string,
  message: string,
  headers: Record<string, string> = {},
): Response {
  return Response.json(
    { error: { code, message } },
    { status, headers: { ...baseHeaders, ...headers } },
  );
}
