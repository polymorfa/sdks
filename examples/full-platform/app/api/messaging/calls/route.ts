import { messaging } from "../../../../lib/polymorfa.js";
import {
  action,
  optionalInteger,
  route,
  text,
  unknownAction,
} from "../../../../lib/route.js";

// Browser calls use /api/messaging/calls/token. The browser places outbound
// calls with that client token; the server SDK has no placement method.
export const POST = route("agent", async ({ body, sessionOf }) => {
  const session = sessionOf(body);
  switch (action(body)) {
    case "reject":
      // For calls parked in SDK answer mode.
      return messaging().calls.reject(session, text(body, "callId"), {
        from: text(body, "from"),
      });
    case "socketTicket":
      // Single-use ticket for a server-side calls WebSocket.
      return messaging().voip.socketTicket({ session });
    case "agentToken": {
      // Per-call ticket for a voice agent that streams PCM.
      const ttlSeconds = optionalInteger(body, "ttlSeconds");
      return messaging().voip.agentToken(
        text(body, "callId"),
        ttlSeconds === undefined ? {} : { ttlSeconds },
      );
    }
    default:
      return unknownAction(action(body));
  }
});
