import { messaging } from "../../../../lib/polymorfa.js";
import { action, route, text, unknownAction } from "../../../../lib/route.js";

export const GET = route("agent", ({ body, connectionOf }) =>
  messaging().profile.get(connectionOf(body)),
);

export const POST = route("admin", async ({ body, connectionOf }) => {
  const profile = messaging().profile;
  const connection = connectionOf(body);
  switch (action(body)) {
    case "setName":
      return profile.setName(connection, { name: text(body, "name") });
    case "setStatus":
      return profile.setStatus(connection, { status: text(body, "status") });
    case "setPicture":
      return profile.setPicture(connection, { url: text(body, "url") });
    case "deletePicture":
      return profile.deletePicture(connection);
    default:
      return unknownAction(action(body));
  }
});
