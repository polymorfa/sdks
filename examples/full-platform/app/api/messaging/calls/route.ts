import { messaging } from "../../../../lib/polymorfa.js";
import { action, route, text, unknownAction } from "../../../../lib/route.js";

// Browser calls use /api/messaging/calls/token: the browser places, answers,
// joins and leaves calls with that client token. These server actions act on
// a call by id with the project credential.
export const POST = route("agent", async ({ body }) => {
  switch (action(body)) {
    case "reject":
      // Declines a ringing call for every participant.
      return messaging().voip.reject(text(body, "callId"));
    case "end":
      // Ends the call for every participant, e.g. from a supervisor console.
      return messaging().voip.end(text(body, "callId"));
    default:
      return unknownAction(action(body));
  }
});
