import { PolymorfaError, PolymorfaValidationError } from "../errors.js";
import {
  hexBytes,
  verifyWebhookHmac,
  webhookBodyBytes,
  type WebhookBody,
} from "./crypto.js";
import {
  KNOWN_WEBHOOK_EVENT_TYPES,
  type KnownWebhookEvent,
  type UnknownWebhookEvent,
  type WebhookEvent,
} from "./events.js";

export type { WebhookBody } from "./crypto.js";

export class WebhookSignatureError extends PolymorfaError {
  constructor() {
    super("Webhook signature verification failed.", {
      code: "invalid_webhook_signature",
    });
  }
}

export async function verifyWebhookSignature(
  rawBody: WebhookBody,
  signatureHeader: string,
  secret: string,
): Promise<boolean> {
  const normalized = signatureHeader.startsWith("sha256=")
    ? signatureHeader.slice(7)
    : signatureHeader;
  if (!/^[a-fA-F0-9]{64}$/.test(normalized) || secret.length === 0)
    return false;
  return verifyWebhookHmac(
    webhookBodyBytes(rawBody),
    hexBytes(normalized),
    secret,
  );
}

export async function constructWebhookEvent(
  rawBody: WebhookBody,
  signatureHeader: string,
  secret: string,
): Promise<WebhookEvent> {
  if (!(await verifyWebhookSignature(rawBody, signatureHeader, secret))) {
    throw new WebhookSignatureError();
  }

  return parseVerifiedWebhookEvent(rawBody);
}

export function parseVerifiedWebhookEvent(rawBody: WebhookBody): WebhookEvent {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(
      webhookBodyBytes(rawBody),
    );
  } catch (cause) {
    throw new PolymorfaValidationError(
      "Webhook body must contain valid UTF-8.",
      {
        code: "invalid_webhook_body",
        cause,
      },
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch (cause) {
    throw new PolymorfaValidationError(
      "Webhook body must contain valid JSON.",
      {
        code: "invalid_webhook_json",
        cause,
      },
    );
  }

  if (!isEventEnvelope(parsed)) {
    throw new PolymorfaValidationError(
      "Webhook body is not a valid event envelope.",
      {
        code: "invalid_webhook_event",
      },
    );
  }
  return KNOWN_EVENT_TYPES.has(parsed.event)
    ? (parsed as KnownWebhookEvent)
    : (parsed as UnknownWebhookEvent);
}

const KNOWN_EVENT_TYPES: ReadonlySet<string> = new Set(
  KNOWN_WEBHOOK_EVENT_TYPES,
);

function isEventEnvelope(value: unknown): value is UnknownWebhookEvent {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return false;
  const record = value as Record<string, unknown>;
  return (
    isNonEmptyString(record.id) &&
    // Project-scoped events (`customer.*`, `voice.*`) carry an empty session.
    typeof record.session === "string" &&
    isNonEmptyString(record.timestamp) &&
    isNonEmptyString(record.event) &&
    Object.hasOwn(record, "payload")
  );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}
