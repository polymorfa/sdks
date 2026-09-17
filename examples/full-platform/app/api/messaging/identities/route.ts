import type { ResolveIdentityParams } from "@polymorfa/sdk";

import { messaging } from "../../../../lib/polymorfa.js";
import {
  InputError,
  action,
  optionalText,
  route,
  text,
  unknownAction,
  type Body,
} from "../../../../lib/route.js";

export const POST = route("agent", async ({ body, sessionOf }) => {
  const session = sessionOf(body);
  switch (action(body)) {
    case "resolve":
      return messaging().identities.resolve(session, identity(body));
    case "securityCode":
      // Display-only verification code for a stable user id.
      return messaging().users.getSecurityCode(session, text(body, "userId"));
    default:
      return unknownAction(action(body));
  }
});

function identity(body: Body): ResolveIdentityParams {
  const phoneNumber = optionalText(body, "phoneNumber");
  if (phoneNumber !== undefined) return { phoneNumber };
  const id = optionalText(body, "id");
  if (id !== undefined) return { id };
  const username = optionalText(body, "username");
  if (username === undefined) {
    throw new InputError("Provide phoneNumber, id or username.");
  }
  const usernameKey = optionalText(body, "usernameKey");
  return { username, ...(usernameKey === undefined ? {} : { usernameKey }) };
}
