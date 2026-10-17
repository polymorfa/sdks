/** Local shape validation only. The API verifies signatures and live authority. */
export function isSignedCredentialV2(
  value: string,
  prefix: "pmfa_" | "pmfa_pt_",
): boolean {
  if (value.length > 16_384 || !value.startsWith(prefix)) return false;
  const body = value.slice(prefix.length);
  if (!/^[A-Za-z0-9_-]+$/.test(body)) return false;
  try {
    const raw = atob(body.replaceAll("-", "+").replaceAll("_", "/"));
    return (
      raw.length >= 66 &&
      raw.charCodeAt(0) === 2 &&
      btoa(raw).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "") ===
        body
    );
  } catch {
    return false;
  }
}
