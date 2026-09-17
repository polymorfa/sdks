import { env } from "../../../../lib/env.js";
import { messaging } from "../../../../lib/polymorfa.js";
import { WEBHOOK_EVENTS } from "../../../../lib/webhooks.js";
import {
  action,
  flag,
  route,
  text,
  unknownAction,
} from "../../../../lib/route.js";

// Messaging webhook registrations. They target their own path and use a
// secret this app chooses (POLYMORFA_MESSAGING_WEBHOOK_SECRET), separate from
// the management webhook's secret. Durable events, deliveries and signing
// secret rotation live in the management client (see /api/admin/webhooks).
export const GET = route("admin", () => messaging().webhooks.list());

export const POST = route("admin", async ({ body }) => {
  const webhooks = messaging().webhooks;
  switch (action(body)) {
    case "register":
      return webhooks.create({
        url: new URL(
          "/api/polymorfa/messaging-webhooks",
          env.appOrigin(),
        ).toString(),
        events: WEBHOOK_EVENTS,
        hmacKey: env.messagingWebhookSecret(),
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
