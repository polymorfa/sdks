import { messaging } from "../../../../lib/polymorfa.js";
import {
  action,
  oneOf,
  route,
  sessionOf,
  text,
  unknownAction,
} from "../../../../lib/route.js";
import { env } from "../../../../lib/env.js";

export const GET = route("agent", () =>
  messaging().presence.get(env.session()),
);

export const POST = route("agent", async ({ body }) => {
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
