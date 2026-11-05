import { PolymorfaValidationError } from "../errors.js";
import type { WebhookEvent } from "./events.js";
import {
  decodeVerifiedWebhookBody,
  parseEventEnvelope,
  verifyWebhookSignature,
  WebhookSignatureError,
  type WebhookBody,
} from "./verify.js";

/** Beta. Acknowledge the entire request; partial acknowledgements are unsupported.
 * Retry keeps ID, order and membership. Deduplicate each member ID too.
 */
export interface WebhookEventBatch {
  readonly object: "event_batch";
  readonly version: 1;
  readonly id: string;
  readonly events: readonly WebhookEvent[];
}
export type WebhookDelivery = WebhookEvent | WebhookEventBatch;
export function isWebhookEventBatch(
  delivery: WebhookDelivery,
): delivery is WebhookEventBatch {
  return "object" in delivery && delivery.object === "event_batch";
}
/** Verify the signature over the original whole body before decoding any member.
 * Known and future event names retain the existing envelope validation contract.
 */
export async function constructWebhookDelivery(
  rawBody: WebhookBody,
  signatureHeader: string,
  secret: string,
): Promise<WebhookDelivery> {
  if (!(await verifyWebhookSignature(rawBody, signatureHeader, secret)))
    throw new WebhookSignatureError();
  return parseVerifiedWebhookDelivery(rawBody);
}
export function parseVerifiedWebhookDelivery(
  rawBody: WebhookBody,
): WebhookDelivery {
  const parsed = decodeVerifiedWebhookBody(rawBody);
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("object" in parsed) ||
    parsed.object !== "event_batch"
  )
    return parseEventEnvelope(parsed);
  const batch = parsed as Record<string, unknown>;
  if (
    Object.keys(batch).some(
      (key) => !["object", "version", "id", "events"].includes(key),
    ) ||
    batch.version !== 1 ||
    typeof batch.id !== "string" ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
      batch.id,
    ) ||
    !Array.isArray(batch.events) ||
    batch.events.length < 1 ||
    batch.events.length > 100
  )
    throw new PolymorfaValidationError(
      "Webhook body is not a valid version 1 event batch.",
      { code: "invalid_webhook_batch" },
    );
  return {
    object: "event_batch",
    version: 1,
    id: batch.id,
    events: batch.events.map((member: unknown) => {
      if (
        typeof member === "object" &&
        member !== null &&
        "object" in member &&
        member.object === "event_batch"
      )
        throw new PolymorfaValidationError(
          "Nested webhook batches are invalid.",
          { code: "invalid_webhook_batch" },
        );
      return parseEventEnvelope(member);
    }),
  };
}
