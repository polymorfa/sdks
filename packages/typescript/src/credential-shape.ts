/** Shape/checksum only. Credentials are opaque; the API authenticates issued records. */
export function isOpaqueCredential(
  value: string,
  prefix: "pmfa_" | "pmfa_pt_",
): boolean {
  if (!value.startsWith(prefix)) return false;
  const body = value.slice(prefix.length);
  if (!/^[A-Za-z0-9_-]+$/.test(body)) return false;
  try {
    const raw = atob(body.replaceAll("-", "+").replaceAll("_", "/"));
    if (
      raw.length < 24 ||
      btoa(raw).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "") !==
        body
    )
      return false;
    let crc = 0xffffffff;
    for (let i = 0; i < raw.length - 4; i++) {
      crc ^= raw.charCodeAt(i);
      for (let b = 0; b < 8; b++)
        crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    const i = raw.length - 4;
    const expected =
      ((raw.charCodeAt(i) << 24) |
        (raw.charCodeAt(i + 1) << 16) |
        (raw.charCodeAt(i + 2) << 8) |
        raw.charCodeAt(i + 3)) >>>
      0;
    return (crc ^ 0xffffffff) >>> 0 === expected;
  } catch {
    return false;
  }
}

/** Canonical unpadded base64url only; the service verifies signatures. */
export function isClientCredential(value: string): boolean {
  if (!value.startsWith("pmfa_ct_")) return false;
  const body = value.slice(8);
  if (!/^[A-Za-z0-9_-]+$/.test(body)) return false;
  try {
    const raw = atob(body.replaceAll("-", "+").replaceAll("_", "/"));
    return (
      btoa(raw).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "") ===
      body
    );
  } catch {
    return false;
  }
}
