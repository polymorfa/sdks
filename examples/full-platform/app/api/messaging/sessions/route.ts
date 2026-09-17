import { messaging } from "../../../../lib/polymorfa.js";
import {
  InputError,
  action,
  integer,
  object,
  route,
  sessionOf,
  text,
  unknownAction,
} from "../../../../lib/route.js";

// Sessions are created by QuickLink (see ../quicklinks). These routes list,
// inspect and operate existing sessions.
export const GET = route("agent", () => messaging().sessions.list());

export const POST = route("admin", async ({ body }) => {
  const sessions = messaging().sessions;
  const session = sessionOf(body);
  switch (action(body)) {
    case "retrieve":
      return sessions.retrieve(session);
    case "status": {
      const response = await sessions.retrieve(session);
      const { status, statusReason } = response.data.data;
      return { session, status, statusReason };
    }
    case "account":
      return sessions.account(session);
    case "start":
      return sessions.start(session);
    case "stop":
      return sessions.stop(session);
    case "restart":
      return sessions.restart(session);
    case "logout":
      return sessions.logout(session);
    case "delete":
      return sessions.delete(session);
    case "configure": {
      // Optimistic concurrency: pass the revision you last read.
      const history = object(body, "historySync");
      const mode = text(history, "mode");
      if (mode !== "metadata_only" && mode !== "deliver") {
        throw new InputError("historySync.mode is invalid.");
      }
      return sessions.update(session, {
        configuration: { set: { historySync: { mode } } },
        revision: integer(body, "revision"),
      });
    }
    // Direct pairing is entitlement-gated; QuickLink is the standard flow.
    case "qr":
      return sessions.qr(session);
    case "pairingCode":
      return sessions.requestPairingCode(session, {
        phone: text(body, "phone"),
      });
    default:
      return unknownAction(action(body));
  }
});
