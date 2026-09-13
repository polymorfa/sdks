const REDACTED = "[REDACTED]";
const SENSITIVE_KEYS = new Set([
  "authorization",
  "accesstoken",
  "clienttoken",
  "refreshtoken",
  "token",
  "secret",
  "webhooksecret",
  "password",
  "messagebody",
  "rawbody",
  "body",
]);

export function redactDiagnostic(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactDiagnostic);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      key,
      SENSITIVE_KEYS.has(normalizeKey(key))
        ? REDACTED
        : redactDiagnostic(child),
    ]),
  );
}

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}
