import { messaging } from "../../../../lib/polymorfa.js";
import {
  action,
  oneOf,
  route,
  text,
  unknownAction,
} from "../../../../lib/route.js";

const TIMERS = { off: 0, "24h": 86400, "7d": 604800, "90d": 7776000 } as const;

export const POST = route("agent", async ({ body, connectionOf }) => {
  const chats = messaging().chats;
  const connection = connectionOf(body);
  const chatId = text(body, "chatId");
  switch (action(body)) {
    case "editMessage":
      return chats.editMessage(connection, chatId, text(body, "messageId"), {
        text: text(body, "text"),
      });
    case "deleteMessage":
      return chats.deleteMessage(connection, chatId, text(body, "messageId"));
    case "archive":
      return chats.archive(connection, chatId);
    case "unarchive":
      return chats.unarchive(connection, chatId);
    case "disappearing": {
      const timer = oneOf(body, "timer", ["off", "24h", "7d", "90d"]);
      return chats.setDisappearingTimer(connection, chatId, {
        durationSeconds: TIMERS[timer],
      });
    }
    default:
      return unknownAction(action(body));
  }
});
