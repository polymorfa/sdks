import {
  Client,
  MessagingClient,
  PolymorfaError,
  constructWebhookDelivery,
  isWebhookEventBatch,
  isEvent,
  type WebhookBody,
} from "@polymorfa/sdk";

/** Prepared for enrolled betas. Supply a regional Messaging base URL and a
 * project token issued for that region; this example never mints credentials.
 */
export async function inspectNumber(
  messaging: MessagingClient,
  number: string,
) {
  try {
    const catalogs = await messaging.catalogs.list(number);
    const marketing = await messaging.cloudMarketing.getStatus(number);
    const history = await messaging.chats.list(number, { kind: "group" });
    return {
      catalogs: catalogs.data.data,
      marketing: marketing.data.data,
      history: history.data.data,
    };
  } catch (error) {
    if (error instanceof PolymorfaError && error.code === "feature_unavailable")
      return { unavailable: true };
    throw error;
  }
}

export async function refreshCatalog(
  messaging: MessagingClient,
  number: string,
  catalog: string,
) {
  await messaging.catalogs.sync(number, catalog);
  return messaging.catalogs.listProducts(number, catalog, { limit: 50 });
}

/** Call only after the receiver handles single deliveries and batches. */
export function enableBatching(
  client: Client,
  webhookId: string,
  idempotencyKey: string,
) {
  return client.webhooks.update(
    webhookId,
    {
      format: "native",
      batching: { enabled: true, maxEvents: 100, windowMs: 1000 },
    },
    { idempotencyKey },
  );
}

/** Verify once over the whole raw request, then deduplicate member IDs in
 * durable receiver storage before effects. Return 2xx only after every member
 * is durably handled; retries preserve the batch ID and individual event IDs.
 */
export async function receive(
  raw: WebhookBody,
  signature: string,
  secret: string,
  once: (eventId: string, effect: () => Promise<void>) => Promise<void>,
) {
  const delivery = await constructWebhookDelivery(raw, signature, secret);
  const events = isWebhookEventBatch(delivery) ? delivery.events : [delivery];
  for (const event of events) {
    await once(event.id, async () => {
      if (
        isEvent(event, "message.received") &&
        event.payload.order !== undefined
      ) {
        // Read the validated cart; it carries no computed total or payment status.
        console.log(event.payload.order.items.length);
      }
      if (
        isEvent(event, "contact.update") &&
        event.payload.identityChange !== undefined
      ) {
        // Keep previous and new identities separate. parentBsuid is metadata only.
        console.log(event.payload.identityChange.reason);
      }
    });
  }
}
