import { messaging } from "../../../../lib/polymorfa.js";
import { action, route, text, unknownAction } from "../../../../lib/route.js";
import { env } from "../../../../lib/env.js";

export const GET = route("agent", () => messaging().profile.get(env.session()));

export const POST = route("admin", async ({ body, sessionOf }) => {
  const profile = messaging().profile;
  const session = sessionOf(body);
  switch (action(body)) {
    case "setName":
      return profile.setName(session, { name: text(body, "name") });
    case "setStatus":
      return profile.setStatus(session, { status: text(body, "status") });
    case "setPicture":
      return profile.setPicture(session, { url: text(body, "url") });
    case "deletePicture":
      return profile.deletePicture(session);
    default:
      return unknownAction(action(body));
  }
});
