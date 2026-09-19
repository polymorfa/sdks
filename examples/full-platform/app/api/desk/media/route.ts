import { desk } from "../../../../lib/desk/data.js";
import { verifyMediaSignature } from "../../../../lib/desk/media-url.js";
import {
  InputError,
  errorResponse,
  route,
  text,
} from "../../../../lib/route.js";

// Uploaded files are only rendered inline for passive media types. Anything
// else, including SVG and HTML, downloads as an opaque file.
const INLINE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "audio/aac",
  "audio/mp4",
  "audio/mpeg",
  "audio/ogg",
  "audio/wav",
  "audio/webm",
  "video/mp4",
  "video/webm",
]);

// Agents may attach these types.
const UPLOAD_TYPES = new Set([
  ...INLINE_TYPES,
  "application/pdf",
  "text/plain",
  "text/csv",
  "application/zip",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

const MAX_BASE64 = Math.ceil((16 * 1024 * 1024) / 3) * 4;

async function serve(mediaId: string): Promise<Response> {
  const media = await (await desk()).readMedia(mediaId);
  if (media === null) return new Response(null, { status: 404 });
  const declared = media.contentType.split(";")[0]?.trim().toLowerCase() ?? "";
  const inline = INLINE_TYPES.has(declared);
  const filename = media.name.replace(/[^\w.-]+/g, "_");
  return new Response(new Uint8Array(media.bytes), {
    headers: {
      "Content-Type": inline ? declared : "application/octet-stream",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${filename}"`,
      "Content-Length": String(media.bytes.byteLength),
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox",
      "Cache-Control": "private, max-age=300",
    },
  });
}

const authenticatedGet = route(
  "agent",
  async ({ url }) => {
    const mediaId = url.searchParams.get("id");
    if (mediaId === null) throw new InputError("id is required.");
    return serve(mediaId);
  },
  { demo: "handler" },
);

// Signed links let Polymorfa fetch an upload without a session cookie.
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  if (url.searchParams.has("sig")) {
    try {
      if (!verifyMediaSignature(url)) {
        return new Response(null, { status: 403 });
      }
      return await serve(url.searchParams.get("id") ?? "");
    } catch (error) {
      return errorResponse(error);
    }
  }
  return authenticatedGet(request);
}

// JSON upload: { name, contentType, data: base64 }. JSON keeps the route
// behind the same CSRF checks as every other mutation.
export const POST = route(
  "agent",
  async ({ body }) => {
    const contentType = text(body, "contentType")
      .split(";")[0]
      ?.trim()
      .toLowerCase();
    if (contentType === undefined || !UPLOAD_TYPES.has(contentType)) {
      throw new InputError("This file type cannot be sent.");
    }
    const data = text(body, "data");
    if (data.length > MAX_BASE64) {
      throw new InputError("The file is larger than 16 MB.");
    }
    const bytes = Uint8Array.from(Buffer.from(data, "base64"));
    const name = text(body, "name").slice(0, 120);
    return (await desk()).uploadMedia({ name, contentType, bytes });
  },
  { demo: "handler" },
);
