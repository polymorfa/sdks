import { messaging, organization } from "../../../../lib/polymorfa.js";
import {
  InputError,
  action,
  object,
  route,
  text,
  unknownAction,
} from "../../../../lib/route.js";

// GET ?id=... streams received media back to the operator.
export const GET = route("agent", async ({ url }) => {
  const mediaId = url.searchParams.get("id");
  if (mediaId === null) throw new InputError("id is required.");
  const media = messaging().media;
  const [info, file] = await Promise.all([
    media.retrieve(mediaId),
    media.download(mediaId),
  ]);
  return new Response(file.data, {
    headers: {
      "Content-Type": info.data.data.mimeType,
      "Cache-Control": "private, max-age=300",
    },
  });
});

export const POST = route("agent", async ({ body }) => {
  switch (action(body)) {
    case "retrieve":
      return messaging().media.retrieve(text(body, "mediaId"));
    case "persist":
      // Copies the media into durable object storage.
      return messaging().media.persist(text(body, "mediaId"));
    case "upload":
      // Upload URLs come from the management API (organization key). The
      // contract leaves this payload open, so it is forwarded as sent. Send the
      // uploaded file afterwards with the messages "send" action and its URL.
      return organization().media.createUpload(object(body, "payload"));
    default:
      return unknownAction(action(body));
  }
});
