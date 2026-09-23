import { env } from "../../../../lib/env.js";
import { messaging, organization } from "../../../../lib/polymorfa.js";
import {
  InputError,
  action,
  idempotencyKey,
  oneOf,
  route,
  text,
  unknownAction,
} from "../../../../lib/route.js";

// Sender-controlled media is only rendered inline for these passive types.
// Everything else (HTML, SVG, PDF, ...) is served as an opaque download.
const INLINE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "audio/aac",
  "audio/mp4",
  "audio/mpeg",
  "audio/ogg",
  "video/mp4",
  "video/3gpp",
]);

// Types an agent may request an upload URL for.
const UPLOAD_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "audio/mpeg",
  "audio/ogg",
  "video/mp4",
  "application/pdf",
] as const;

// GET ?id=... streams received media back to the operator.
export const GET = route("agent", async ({ url }) => {
  const mediaId = url.searchParams.get("id");
  if (mediaId === null) throw new InputError("id is required.");
  const media = messaging().media;
  const [info, file] = await Promise.all([
    media.retrieve(mediaId),
    media.download(mediaId),
  ]);
  const declared = info.data.data.mimeType.split(";")[0]?.trim().toLowerCase();
  const inline = declared !== undefined && INLINE_TYPES.has(declared);
  return new Response(file.data, {
    headers: {
      "Content-Type": inline ? declared : "application/octet-stream",
      "Content-Disposition": inline ? "inline" : "attachment",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox",
      "Cache-Control": "private, max-age=300",
    },
  });
});

export const POST = route("agent", async ({ body, operator, request }) => {
  switch (action(body)) {
    case "retrieve":
      return messaging().media.retrieve(text(body, "mediaId"));
    case "persist":
      // Copies the media into durable object storage.
      return messaging().media.persist(text(body, "mediaId"));
    case "upload": {
      // Upload URLs come from the management API, which accepts only an
      // organization key, so this action is limited to admins. The payload is
      // built here from validated fields; callers never choose the project.
      // Send the uploaded file afterwards with the messages "send" action.
      if (operator.role !== "admin") {
        return Response.json(
          { error: { code: "forbidden" } },
          { status: 403, headers: { "Cache-Control": "no-store, private" } },
        );
      }
      return organization().media.createUpload(
        {
          projectId: env.projectId(),
          contentType: oneOf(body, "contentType", UPLOAD_TYPES),
        },
        { idempotencyKey: idempotencyKey(request) },
      );
    }
    default:
      return unknownAction(action(body));
  }
});
