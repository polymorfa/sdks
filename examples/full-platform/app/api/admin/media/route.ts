import { organization } from "../../../../lib/polymorfa.js";
import {
  action,
  object,
  route,
  text,
  unknownAction,
} from "../../../../lib/route.js";

export const POST = route("admin", async ({ body }) => {
  const media = organization().media;
  switch (action(body)) {
    case "retrieve":
      return media.retrieve(text(body, "mediaId"));
    case "delete":
      return media.delete(text(body, "mediaId"));
    case "createUpload":
      // Open payload in the contract; forwarded as sent.
      return media.createUpload(object(body, "payload"));
    default:
      return unknownAction(action(body));
  }
});
