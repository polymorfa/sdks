import { createHmac, timingSafeEqual } from "node:crypto";

import type { WebhookEvent } from "./events.js";
import {
  WebhookSignatureError,
  constructWebhookEvent,
  verifyWebhookSignature,
  type WebhookBody,
} from "./verify.js";

export interface VerifyWebhookInput {
  readonly body: WebhookBody;
  readonly signature: string;
  readonly secret: string;
}
export type VerifyWebhookSignatureInput = VerifyWebhookInput;
export interface VerifyLocalWebhookInput extends VerifyWebhookInput {
  readonly toleranceSeconds?: number;
  readonly nowUnixSeconds?: number;
}
export interface CreateWebhookFixtureInput {
  readonly event: WebhookEvent;
  readonly secret: string;
}
export interface WebhookFixture {
  readonly body: Uint8Array;
  readonly contentType: "application/json";
  readonly signature: string;
  readonly headers: Readonly<{
    readonly "content-type": "application/json";
    readonly "x-webhook-signature": string;
  }>;
}
export interface WebhookUtilities {
  verify(input: VerifyWebhookInput): Promise<WebhookEvent>;
  verifySignature(input: VerifyWebhookSignatureInput): Promise<boolean>;
  verifyLocal(input: VerifyLocalWebhookInput): Promise<WebhookEvent>;
  createFixture(input: CreateWebhookFixtureInput): Promise<WebhookFixture>;
}

export const webhooks: WebhookUtilities = Object.freeze({
  verify: (input: VerifyWebhookInput) =>
    constructWebhookEvent(input.body, input.signature, input.secret),
  verifySignature: (input: VerifyWebhookSignatureInput) =>
    verifyWebhookSignature(input.body, input.signature, input.secret),
  async verifyLocal(input: VerifyLocalWebhookInput) {
    const secret = decodeLocalSecret(input.secret);
    if (!verifyLocalSignature(input, secret)) throw new WebhookSignatureError();
    const verificationSecret = "local-verification-complete";
    const body = toBytes(input.body);
    const signature = createHmac("sha256", verificationSecret)
      .update(body)
      .digest("hex");
    return constructWebhookEvent(body, signature, verificationSecret);
  },
  async createFixture(input: CreateWebhookFixtureInput) {
    const body = new TextEncoder().encode(JSON.stringify(input.event));
    const secret = input.secret;
    const signature = createHmac("sha256", secret).update(body).digest("hex");
    return Object.freeze({
      body,
      contentType: "application/json",
      signature,
      headers: Object.freeze({
        "content-type": "application/json",
        "x-webhook-signature": signature,
      }),
    });
  },
});

function verifyLocalSignature(
  input: VerifyLocalWebhookInput,
  secret: Uint8Array,
): boolean {
  const match = /^t=(\d+),v1=([a-f0-9]{64})$/.exec(input.signature);
  if (match === null) return false;
  const timestamp = Number(match[1]);
  if (!Number.isSafeInteger(timestamp)) return false;
  const now = input.nowUnixSeconds ?? Math.floor(Date.now() / 1_000);
  const tolerance = input.toleranceSeconds ?? 300;
  if (!Number.isSafeInteger(tolerance) || tolerance < 0) return false;
  if (Math.abs(now - timestamp) > tolerance) return false;
  const expected = createHmac("sha256", secret)
    .update(new TextEncoder().encode(`${timestamp}.`))
    .update(toBytes(input.body))
    .digest();
  const actual = Buffer.from(match[2] ?? "", "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function decodeLocalSecret(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]{43}$/.test(value)) throw new WebhookSignatureError();
  const bytes = Buffer.from(value, "base64url");
  if (bytes.length !== 32) throw new WebhookSignatureError();
  return bytes;
}

function toBytes(body: WebhookBody): Uint8Array {
  if (typeof body === "string") return new TextEncoder().encode(body);
  if (body instanceof ArrayBuffer) return new Uint8Array(body);
  return new Uint8Array(body.buffer, body.byteOffset, body.byteLength);
}
