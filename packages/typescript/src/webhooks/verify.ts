import { createHmac, timingSafeEqual } from "node:crypto";

import { PolymorfaError, PolymorfaValidationError } from "../errors.js";
import {
  KNOWN_WEBHOOK_EVENT_TYPES,
  type KnownWebhookEvent,
  type UnknownWebhookEvent,
  type WebhookEvent,
} from "./events.js";

export type WebhookBody = string | ArrayBuffer | ArrayBufferView;

export class WebhookSignatureError extends PolymorfaError {
  constructor() {
    super("Webhook signature verification failed.", { code: "invalid_webhook_signature" });
  }
}

export async function verifyWebhookSignature(
  rawBody: WebhookBody,
  signatureHeader: string,
  secret: string,
): Promise<boolean> {
  const normalized = signatureHeader.startsWith("sha256=") ? signatureHeader.slice(7) : signatureHeader;
  if (!/^[a-fA-F0-9]{64}$/.test(normalized) || secret.length === 0) return false;
  const expected = createHmac("sha256", secret).update(toBuffer(rawBody)).digest();
  const actual = Buffer.from(normalized, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function constructWebhookEvent(
  rawBody: WebhookBody,
  signatureHeader: string,
  secret: string,
): Promise<WebhookEvent> {
  if (!(await verifyWebhookSignature(rawBody, signatureHeader, secret))) {
    throw new WebhookSignatureError();
  }

  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(toBuffer(rawBody));
  } catch (cause) {
    throw new PolymorfaValidationError("Webhook body must contain valid UTF-8.", {
      code: "invalid_webhook_body",
      cause,
    });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch (cause) {
    throw new PolymorfaValidationError("Webhook body must contain valid JSON.", {
      code: "invalid_webhook_json",
      cause,
    });
  }

  if (!isEventEnvelope(parsed)) {
    throw new PolymorfaValidationError("Webhook body is not a valid event envelope.", {
      code: "invalid_webhook_event",
    });
  }
  return KNOWN_EVENT_TYPES.has(parsed.event)
    ? (parsed as KnownWebhookEvent)
    : (parsed as UnknownWebhookEvent);
}

const KNOWN_EVENT_TYPES: ReadonlySet<string> = new Set(KNOWN_WEBHOOK_EVENT_TYPES);

function isEventEnvelope(value: unknown): value is UnknownWebhookEvent {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    isNonEmptyString(record.id) &&
    isNonEmptyString(record.session) &&
    isNonEmptyString(record.timestamp) &&
    isNonEmptyString(record.event) &&
    Object.hasOwn(record, "payload")
  );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function toBuffer(body: WebhookBody): Buffer {
  if (typeof body === "string") return Buffer.from(body, "utf8");
  if (body instanceof ArrayBuffer) return Buffer.from(body);
  return Buffer.from(body.buffer, body.byteOffset, body.byteLength);
}
