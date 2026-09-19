import { organization } from "../../../../lib/polymorfa.js";
import {
  action,
  object,
  route,
  text,
  unknownAction,
} from "../../../../lib/route.js";

// The opt-out contract leaves request payloads open, so `payload` is forwarded.
export const GET = route("admin", () => organization().optOuts.list());

export const POST = route("admin", async ({ body }) => {
  const optOuts = organization().optOuts;
  switch (action(body)) {
    case "create":
      return optOuts.create(object(body, "payload"));
    case "createBatch":
      return optOuts.createBatch(object(body, "payload"));
    case "delete":
      return optOuts.delete(text(body, "phone"));
    default:
      return unknownAction(action(body));
  }
});
