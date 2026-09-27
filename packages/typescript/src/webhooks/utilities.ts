import type { WebhookEvent } from "./events.js";
import {
  bytesHex,
  hexBytes,
  signWebhookHmac,
  verifyWebhookHmac,
  webhookBodyBytes,
} from "./crypto.js";
import {
  WebhookSignatureError,
  constructWebhookEvent,
  parseVerifiedWebhookEvent,
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
    if (!(await verifyLocalSignature(input, secret))) {
      throw new WebhookSignatureError();
    }
    return parseVerifiedWebhookEvent(input.body);
  },
  async createFixture(input: CreateWebhookFixtureInput) {
    const body = new TextEncoder().encode(JSON.stringify(input.event));
    const secret = input.secret;
    const signature = bytesHex(await signWebhookHmac(body, secret));
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

async function verifyLocalSignature(
  input: VerifyLocalWebhookInput,
  secret: Uint8Array,
): Promise<boolean> {
  const match = /^t=(\d+),v1=([a-f0-9]{64})$/.exec(input.signature);
  if (match === null) return false;
  const timestamp = Number(match[1]);
  if (!Number.isSafeInteger(timestamp)) return false;
  const now = input.nowUnixSeconds ?? Math.floor(Date.now() / 1_000);
  const tolerance = input.toleranceSeconds ?? 300;
  if (!Number.isSafeInteger(tolerance) || tolerance < 0) return false;
  if (Math.abs(now - timestamp) > tolerance) return false;
  const prefix = new TextEncoder().encode(`${timestamp}.`);
  const body = webhookBodyBytes(input.body);
  const signed = new Uint8Array(prefix.length + body.length);
  signed.set(prefix);
  signed.set(body, prefix.length);
  return verifyWebhookHmac(signed, hexBytes(match[2] ?? ""), secret);
}

function decodeLocalSecret(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]{43}$/.test(value)) throw new WebhookSignatureError();
  let decoded: string;
  try {
    decoded = atob(value.replace(/-/g, "+").replace(/_/g, "/") + "=");
  } catch {
    throw new WebhookSignatureError();
  }
  const bytes = Uint8Array.from(decoded, (character) =>
    character.charCodeAt(0),
  );
  if (bytes.length !== 32) throw new WebhookSignatureError();
  return bytes;
}
