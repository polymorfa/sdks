import { messaging } from "../../../../lib/polymorfa.js";
import {
  action,
  route,
  text,
  unknownAction,
  type Body,
} from "../../../../lib/route.js";

export const GET = route("agent", ({ body, connectionOf }) =>
  messaging().quickReplies.list(connectionOf(body)),
);

export const POST = route("agent", async ({ body, connectionOf }) => {
  const quickReplies = messaging().quickReplies;
  const connection = connectionOf(body);
  switch (action(body)) {
    case "create":
      return quickReplies.create(connection, reply(body));
    case "replace":
      return quickReplies.replace(
        connection,
        text(body, "quickReplyId"),
        reply(body),
      );
    case "delete":
      return quickReplies.delete(connection, text(body, "quickReplyId"));
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
