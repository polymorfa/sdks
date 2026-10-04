import {
  hexBytes,
  verifyWebhookHmac,
  webhookBodyBytes,
  type WebhookBody,
} from "./crypto.js";

/** Header on a decrypted WhatsApp Flow request that Polymorfa forwards to your endpoint. */
export const FLOW_FORWARD_SIGNATURE_HEADER = "x-polymorfa-flow-signature";

export interface VerifyFlowForwardSignatureOptions {
  /** Maximum age or clock skew of the signature timestamp. Defaults to 300 seconds. */
  readonly toleranceSeconds?: number;
  /** Current time in milliseconds, for tests. */
  readonly now?: number;
}

/**
 * Verifies `X-Polymorfa-Flow-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256>`
 * over `"<t>.<raw body>"` with the endpoint's signing secret, and refuses a
 * timestamp outside the tolerance. Pass the exact raw request body.
 */
export async function verifyFlowForwardSignature(
  rawBody: WebhookBody,
  signatureHeader: string | null | undefined,
  secret: string,
  options: VerifyFlowForwardSignatureOptions = {},
): Promise<boolean> {
  if (
    typeof signatureHeader !== "string" ||
    typeof secret !== "string" ||
    secret.length === 0
  )
    return false;
  const match = /^t=(\d{1,12}),v1=([a-fA-F0-9]{64})$/.exec(
    signatureHeader.trim(),
  );
  if (!match) return false;
  const timestamp = Number(match[1]);
  const tolerance = options.toleranceSeconds ?? 300;
  const nowSeconds = (options.now ?? Date.now()) / 1000;
  if (
    !Number.isFinite(tolerance) ||
    tolerance < 0 ||
    Math.abs(nowSeconds - timestamp) > tolerance
  )
    return false;
  const body = webhookBodyBytes(rawBody);
  const prefix = new TextEncoder().encode(`${match[1]}.`);
  const signed = new Uint8Array(prefix.length + body.length);
  signed.set(prefix, 0);
  signed.set(body, prefix.length);
  return verifyWebhookHmac(signed, hexBytes(match[2]!), secret);
}
