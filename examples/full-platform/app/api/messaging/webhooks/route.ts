import { messaging } from "../../../../lib/polymorfa.js";
import {
  action,
  flag,
  route,
  text,
  unknownAction,
} from "../../../../lib/route.js";

const EVENTS = [
  "message.received",
  "message.ack",
  "call.received",
  "call.ended",
  "call.missed",
  "session.status",
  "template.status",
];

// Messaging webhook registrations. Durable events, deliveries and signing
// secret rotation live in the management client (see /api/admin/webhooks).
export const GET = route("admin", () => messaging().webhooks.list());

export const POST = route("admin", async ({ body, request }) => {
  const webhooks = messaging().webhooks;
  switch (action(body)) {
    case "register":
      return webhooks.create({
        url: new URL("/api/polymorfa/webhooks", request.url).toString(),
        events: EVENTS,
        format: "native",
        retries: { attempts: 5, delaySeconds: 10, policy: "exponential" },
      });
    case "retrieve":
      return webhooks.retrieve(text(body, "id"));
    case "setEnabled":
      return webhooks.update(text(body, "id"), {
        enabled: flag(body, "enabled"),
      });
    case "delete":
      return webhooks.delete(text(body, "id"));
    default:
      return unknownAction(action(body));
  }
});
