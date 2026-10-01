import { PolymorfaConfigurationError } from "../errors.js";

export type WebhookBody = string | ArrayBuffer | ArrayBufferView;

export function webhookBodyBytes(body: WebhookBody): Uint8Array<ArrayBuffer> {
  if (typeof body === "string") return new TextEncoder().encode(body);
  if (body instanceof ArrayBuffer) return new Uint8Array(body);
  return new Uint8Array(
    new Uint8Array(body.buffer, body.byteOffset, body.byteLength),
  );
}

export function hexBytes(value: string): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

export function bytesHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

export async function signWebhookHmac(
  body: Uint8Array<ArrayBuffer>,
  secret: string | Uint8Array,
): Promise<Uint8Array<ArrayBuffer>> {
  const subtle = webhookSubtle();
  const key = await subtle.importKey(
    "raw",
    hmacKeyBytes(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(await subtle.sign("HMAC", key, body));
}

export async function verifyWebhookHmac(
  body: Uint8Array<ArrayBuffer>,
  signature: Uint8Array<ArrayBuffer>,
  secret: string | Uint8Array,
): Promise<boolean> {
  const subtle = webhookSubtle();
  const key = await subtle.importKey(
    "raw",
    hmacKeyBytes(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  return subtle.verify("HMAC", key, signature, body);
}

function webhookSubtle(): SubtleCrypto {
  const subtle = globalThis.crypto?.subtle;
  if (subtle === undefined) {
    throw new PolymorfaConfigurationError(
      "Webhook verification requires WebCrypto (crypto.subtle).",
      "crypto",
    );
  }
  return subtle;
}

function hmacKeyBytes(secret: string | Uint8Array): Uint8Array<ArrayBuffer> {
  const bytes =
    typeof secret === "string"
      ? new TextEncoder().encode(secret)
      : new Uint8Array(secret);
  // HMAC pads an empty SHA-256 key with zeroes to its 64-byte block size.
  // WebCrypto rejects an empty imported key, while Node's createHmac accepts it.
  return bytes.length === 0 ? new Uint8Array(64) : bytes;
}
