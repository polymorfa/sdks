import { messaging } from "../../../../lib/polymorfa.js";
import {
  action,
  oneOf,
  route,
  text,
  unknownAction,
} from "../../../../lib/route.js";

export const GET = route("agent", ({ body, connectionOf }) =>
  messaging().presence.get(connectionOf(body)),
);

export const POST = route("agent", async ({ body, connectionOf }) => {
  const presence = messaging().presence;
  const connection = connectionOf(body);
  switch (action(body)) {
    case "set":
      return presence.set(connection, {
        presence: oneOf(body, "presence", ["available", "unavailable"]),
      });
    case "forChat":
      // Retained observations governed by the observation policy.
      return presence.getForChat(connection, text(body, "chatId"));
    case "subscribe":
      return presence.subscribe(connection, text(body, "chatId"));
    default:
      return unknownAction(action(body));
  }
});
