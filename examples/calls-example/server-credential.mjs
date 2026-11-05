import { validateClientCredential } from "@polymorfa/sdk";

export function serverCredentialType(value) {
  if (typeof value !== "string") return null;
  const type = value.startsWith("pmfa_pt_") ? "projectToken" : "apiKey";
  try {
    validateClientCredential({ type, value });
    return type;
  } catch {
    return null;
  }
}
