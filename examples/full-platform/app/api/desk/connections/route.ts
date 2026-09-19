import { desk } from "../../../../lib/desk/data.js";
import type { ConnectionAction } from "../../../../lib/desk/types.js";
import {
  action,
  idempotencyKey,
  oneOf,
  optionalText,
  route,
  text,
  unknownAction,
} from "../../../../lib/route.js";

const ACTIONS: readonly ConnectionAction[] = [
  "restart",
  "logout",
  "delete",
  "start",
  "stop",
  "qr",
  "pairingCode",
];

export const GET = route(
  "agent",
  async () => (await desk()).listConnections(),
  { demo: "handler" },
);

// Session controls are admin-only.
export const POST = route(
  "admin",
  async ({ body, request }) => {
    const data = await desk();
    switch (action(body)) {
      case "quickLink":
        // QuickLink is hosted by Polymorfa: return the URL, embed nothing.
        return data.createQuickLink(idempotencyKey(request));
      case "session":
        return data.connectionAction(
          text(body, "connectionId"),
          oneOf(body, "operation", ACTIONS),
          optionalText(body, "phone"),
        );
      default:
        return unknownAction(action(body));
    }
  },
  { demo: "handler" },
);
