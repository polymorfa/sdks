import { messaging } from "../../../../lib/polymorfa.js";
import {
  action,
  oneOf,
  route,
  text,
  unknownAction,
} from "../../../../lib/route.js";

export const GET = route("agent", ({ body, sessionOf }) =>
  messaging().presence.get(sessionOf(body)),
);

export const POST = route("agent", async ({ body, sessionOf }) => {
  const presence = messaging().presence;
  const session = sessionOf(body);
  switch (action(body)) {
    case "set":
      return presence.set(session, {
        presence: oneOf(body, "presence", ["available", "unavailable"]),
      });
    case "forChat":
      // Retained observations governed by the observation policy.
      return presence.getForChat(session, text(body, "chatId"));
    case "subscribe":
      return presence.subscribe(session, text(body, "chatId"));
    default:
      return unknownAction(action(body));
  }
});
