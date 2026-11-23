import { messaging } from "../../../../lib/polymorfa.js";
import {
  action,
  route,
  text,
  texts,
  unknownAction,
} from "../../../../lib/route.js";

export const GET = route("agent", ({ body, connectionOf }) =>
  messaging().contacts.list(connectionOf(body)),
);

export const POST = route("agent", async ({ body, connectionOf }) => {
  const contacts = messaging().contacts;
  const connection = connectionOf(body);
  const name = action(body);
  if (name === "check") {
    return contacts.check(connection, texts(body, "phones"));
  }
  if (name === "blocklist") return contacts.blocklist(connection);
  const contactId = text(body, "contactId");
  switch (name) {
    case "retrieve":
      return contacts.retrieve(connection, contactId);
    case "picture":
      return contacts.picture(connection, contactId);
    case "info":
      return contacts.info(connection, contactId);
    case "devices":
      return contacts.devices(connection, contactId);
    case "businessProfile":
      return contacts.businessProfile(connection, contactId);
    case "block":
      return contacts.block(connection, contactId);
    case "unblock":
      return contacts.unblock(connection, contactId);
    default:
      return unknownAction(name);
  }
});
