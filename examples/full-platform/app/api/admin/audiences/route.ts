import { organization } from "../../../../lib/polymorfa.js";
import {
  action,
  object,
  route,
  text,
  unknownAction,
} from "../../../../lib/route.js";

// The audience contract leaves request payloads open, so `payload` is forwarded.
export const GET = route("admin", () => organization().audiences.list());

export const POST = route("admin", async ({ body }) => {
  const audiences = organization().audiences;
  switch (action(body)) {
    case "create":
      return audiences.create(object(body, "payload"));
    case "retrieve":
      return audiences.retrieve(text(body, "listId"));
    case "delete":
      return audiences.delete(text(body, "listId"));
    case "createUpload":
      return audiences.createUpload(object(body, "payload"));
    default:
      return unknownAction(action(body));
  }
});
