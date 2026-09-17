import { organization, project } from "../../../../lib/polymorfa.js";
import {
  action,
  flag,
  idempotencyKey,
  optionalText,
  route,
  text,
  unknownAction,
} from "../../../../lib/route.js";

// Durable webhook endpoints and their deliveries. Project endpoints use the
// project view; `?owner=organization` reads organization-owned endpoints.
export const GET = route("admin", async ({ url }) => {
  const owner =
    url.searchParams.get("owner") === "organization"
      ? organization()
      : project();
  const [webhooks, deliveries] = await Promise.all([
    owner.webhooks.list({ limit: 50 }),
    owner.webhookDeliveries.list({ status: "failed", limit: 50 }),
  ]);
  return {
    webhooks: webhooks.items,
    failedDeliveries: deliveries.items,
    nextDeliveryCursor: deliveries.nextCursor,
  };
});

export const POST = route("admin", async ({ body, request }) => {
  const { webhooks, webhookDeliveries } = project();
  const key = { idempotencyKey: idempotencyKey(request) };
  switch (action(body)) {
    case "create": {
      // The signing secret is returned once; store it as POLYMORFA_WEBHOOK_SECRET.
      const response = await webhooks.create(
        {
          url: new URL("/api/polymorfa/webhooks", request.url).toString(),
          eventTypes: ["message.received", "call.received", "call.ended"],
          format: "native",
          retryPolicy: {
            maximumAttempts: 8,
            backoff: "exponential",
            initialDelaySeconds: 5,
          },
        },
        key,
      );
      return {
        webhook: response.data.webhook,
        secretAvailable: response.data.secretAvailable,
      };
    }
    case "retrieve":
      return webhooks.retrieve(text(body, "webhookId"));
    case "setEnabled":
      return webhooks.update(
        text(body, "webhookId"),
        { enabled: flag(body, "enabled") },
        key,
      );
    case "delete":
      return webhooks.delete(text(body, "webhookId"), key);
    case "test": {
      const eventType = optionalText(body, "eventType");
      return webhooks.test(
        text(body, "webhookId"),
        eventType === undefined ? {} : { eventType },
        key,
      );
    }
    case "rotateSecret": {
      const response = await webhooks.rotateSecret(
        text(body, "webhookId"),
        { overlapSeconds: 3600 },
        key,
      );
      return { secretMetadata: response.data.secretMetadata };
    }
    case "delivery":
      return webhookDeliveries.retrieve(text(body, "deliveryId"));
    case "attempts": {
      const page = await webhookDeliveries.listAttempts(
        text(body, "deliveryId"),
        { limit: 20 },
      );
      return page.items;
    }
    case "attempt":
      return webhookDeliveries.retrieveAttempt(
        text(body, "deliveryId"),
        text(body, "attemptId"),
      );
    case "retryDelivery":
      return webhookDeliveries.retry(text(body, "deliveryId"), {}, key);
    default:
      return unknownAction(action(body));
  }
});
