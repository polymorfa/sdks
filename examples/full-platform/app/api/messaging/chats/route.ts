import { messaging } from "../../../../lib/polymorfa.js";
import {
  action,
  oneOf,
  route,
  text,
  unknownAction,
} from "../../../../lib/route.js";

const TIMERS = { off: 0, "24h": 86400, "7d": 604800, "90d": 7776000 } as const;

export const POST = route("agent", async ({ body, sessionOf }) => {
  const chats = messaging().chats;
  const session = sessionOf(body);
  const chatId = text(body, "chatId");
  switch (action(body)) {
    case "editMessage":
      return chats.editMessage(session, chatId, text(body, "messageId"), {
        text: text(body, "text"),
      });
    case "deleteMessage":
      return chats.deleteMessage(session, chatId, text(body, "messageId"));
    case "archive":
      return chats.archive(session, chatId);
    case "unarchive":
      return chats.unarchive(session, chatId);
    case "disappearing": {
      const timer = oneOf(body, "timer", ["off", "24h", "7d", "90d"]);
      return chats.setDisappearingTimer(session, chatId, {
        durationSeconds: TIMERS[timer],
      });
    }
    default:
      return unknownAction(action(body));
  }
});
