import { messaging } from "../../../../lib/polymorfa.js";
import {
  action,
  route,
  sessionOf,
  text,
  texts,
  unknownAction,
} from "../../../../lib/route.js";
import { env } from "../../../../lib/env.js";

export const GET = route("agent", () =>
  messaging().contacts.list(env.session()),
);

export const POST = route("agent", async ({ body }) => {
  const contacts = messaging().contacts;
  const session = sessionOf(body);
  const name = action(body);
  if (name === "check") {
    return contacts.check(session, texts(body, "phones"));
  }
  if (name === "blocklist") return contacts.blocklist(session);
  const contactId = text(body, "contactId");
  switch (name) {
    case "retrieve":
      return contacts.retrieve(session, contactId);
    case "picture":
      return contacts.picture(session, contactId);
    case "info":
      return contacts.info(session, contactId);
    case "devices":
      return contacts.devices(session, contactId);
    case "businessProfile":
      return contacts.businessProfile(session, contactId);
    case "block":
      return contacts.block(session, contactId);
    case "unblock":
      return contacts.unblock(session, contactId);
    default:
      return unknownAction(name);
  }
});
