import { env } from "../../../../lib/env.js";
import { organization, project } from "../../../../lib/polymorfa.js";
import { WEBHOOK_EVENTS } from "../../../../lib/webhooks.js";
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
// project view; `?owner=organization` selects organization-owned endpoints
// for both reads and actions.
function ownerOf(url: URL) {
  return url.searchParams.get("owner") === "organization"
    ? organization()
    : project();
}

export const GET = route("admin", async ({ url }) => {
  const owner = ownerOf(url);
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

// Signing secrets are shown once, so the response must never be cached.
const secretHeaders = { "Cache-Control": "no-store" };

export const POST = route("admin", async ({ body, request, url }) => {
  const { webhooks, webhookDeliveries } = ownerOf(url);
  const key = { idempotencyKey: idempotencyKey(request) };
  switch (action(body)) {
    case "create": {
      // The signing secret is returned once; store it as POLYMORFA_WEBHOOK_SECRET.
      const response = await webhooks.create(
        {
          url: new URL("/api/polymorfa/webhooks", env.appOrigin()).toString(),
          eventTypes: WEBHOOK_EVENTS,
          format: "native",
          retryPolicy: {
            maximumAttempts: 8,
            backoff: "exponential",
            initialDelaySeconds: 5,
          },
        },
        key,
      );
      return Response.json(
        {
          data: {
            webhook: response.data.webhook,
            secret: response.data.secret,
            secretAvailable: response.data.secretAvailable,
          },
          requestId: response.metadata.requestId,
        },
        { headers: secretHeaders },
      );
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
      // The previous secret stays valid for overlapSeconds; deploy the new one
      // as POLYMORFA_WEBHOOK_SECRET before the overlap ends.
      return Response.json(
        {
          data: {
            secret: response.data.secret,
            secretAvailable: response.data.secretAvailable,
            secretMetadata: response.data.secretMetadata,
          },
          requestId: response.metadata.requestId,
        },
        { headers: secretHeaders },
      );
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
