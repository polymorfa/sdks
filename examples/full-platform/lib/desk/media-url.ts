import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// Per-process signing key for public media links. Links stop working when the
// process restarts, which is fine for files Polymorfa fetches right away.
const key = randomBytes(32);
const TTL_MS = 15 * 60 * 1000;

function signature(mediaId: string, expires: number): string {
  return createHmac("sha256", key)
    .update(`${mediaId}.${expires}`)
    .digest("base64url");
}

/** An unauthenticated, expiring URL Polymorfa can fetch an upload from. */
export function signMediaUrl(origin: string, mediaId: string): string {
  const expires = Date.now() + TTL_MS;
  const url = new URL("/api/desk/media", origin);
  url.searchParams.set("id", mediaId);
  url.searchParams.set("expires", String(expires));
  url.searchParams.set("sig", signature(mediaId, expires));
  return url.toString();
}

export function verifyMediaSignature(url: URL): boolean {
  const mediaId = url.searchParams.get("id");
  const expires = Number(url.searchParams.get("expires"));
  const given = url.searchParams.get("sig");
  if (mediaId === null || given === null || !Number.isFinite(expires)) {
    return false;
  }
  if (expires < Date.now()) return false;
  const expected = Buffer.from(signature(mediaId, expires));
  const actual = Buffer.from(given);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
