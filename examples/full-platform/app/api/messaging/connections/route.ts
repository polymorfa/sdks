import { messaging } from "../../../../lib/polymorfa.js";
import {
  InputError,
  action,
  integer,
  object,
  route,
  text,
  unknownAction,
} from "../../../../lib/route.js";

// Connections are created by QuickLink (see ../quicklinks). These routes list,
// inspect and operate existing connections.
export const GET = route("agent", () => messaging().connections.list());

export const POST = route("admin", async ({ body, connectionOf }) => {
  const connections = messaging().connections;
  const connection = connectionOf(body);
  switch (action(body)) {
    case "retrieve":
      return connections.retrieve(connection);
    case "status": {
      const response = await connections.retrieve(connection);
      const { status, statusReason } = response.data.data;
      return { connection, status, statusReason };
    }
    case "account":
      return connections.account(connection);
    case "start":
      return connections.start(connection);
    case "stop":
      return connections.stop(connection);
    case "restart":
      return connections.restart(connection);
    case "logout":
      return connections.logout(connection);
    case "delete":
      return connections.delete(connection);
    case "configure": {
      // Optimistic concurrency: pass the revision you last read.
      const history = object(body, "historySync");
      const mode = text(history, "mode");
      if (mode !== "metadata_only" && mode !== "deliver") {
        throw new InputError("historySync.mode is invalid.");
      }
      return connections.update(connection, {
        configuration: { set: { historySync: { mode } } },
        revision: integer(body, "revision"),
      });
    }
    // Direct pairing is entitlement-gated; QuickLink is the standard flow.
    case "qr":
      return connections.qr(connection);
    case "pairingCode":
      return connections.requestPairingCode(connection, {
        phone: text(body, "phone"),
      });
    default:
      return unknownAction(action(body));
  }
});
