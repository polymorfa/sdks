import { messaging } from "../../../../lib/polymorfa.js";
import {
  action,
  route,
  text,
  unknownAction,
  type Body,
} from "../../../../lib/route.js";

export const GET = route("agent", ({ body, sessionOf }) =>
  messaging().quickReplies.list(sessionOf(body)),
);

export const POST = route("agent", async ({ body, sessionOf }) => {
  const quickReplies = messaging().quickReplies;
  const session = sessionOf(body);
  switch (action(body)) {
    case "create":
      return quickReplies.create(session, reply(body));
    case "replace":
      return quickReplies.replace(
        session,
        text(body, "quickReplyId"),
        reply(body),
      );
    case "delete":
      return quickReplies.delete(session, text(body, "quickReplyId"));
    default:
      return unknownAction(action(body));
  }
});

function reply(body: Body) {
  return {
    shortcut: text(body, "shortcut"),
    message: text(body, "message"),
  };
}
