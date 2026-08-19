import { PolymorfaConfigurationError } from "./errors.js";

export type MessagingCredential =
  | { readonly type: "apiKey"; readonly value: string }
  | { readonly type: "clientToken"; readonly value: string };

export interface SharedClientOptions {
  readonly baseUrl?: string;
  readonly apiVersion?: string;
  readonly timeoutMs?: number;
  readonly maxNetworkRetries?: number;
  readonly fetch?: typeof fetch;
}

export interface MessagingClientOptions extends SharedClientOptions {
  readonly credential: MessagingCredential;
}

export interface PlatformClientOptions extends SharedClientOptions {
  readonly apiKey: string;
}

export function validateMessagingCredential(credential: MessagingCredential): MessagingCredential {
  if (credential.type === "clientToken") {
    if (!credential.value.startsWith("pmfa_ct_") || credential.value.length <= "pmfa_ct_".length) {
      throw new PolymorfaConfigurationError(
        "Messaging client token must use the pmfa_ct_ prefix.",
        "credential",
      );
    }
    return credential;
  }

  if (!isServerApiKey(credential.value)) {
    throw new PolymorfaConfigurationError("Messaging API key must be a pmfa_ server API key.", "credential");
  }
  return credential;
}

export function validatePlatformApiKey(value: string): string {
  if (!isServerApiKey(value)) {
    throw new PolymorfaConfigurationError("Platform server API key must use the pmfa_ prefix.", "apiKey");
  }
  return value;
}

export function assertServerRuntime(
  runtime: { readonly window?: unknown } = globalThis as { readonly window?: unknown },
): void {
  if (typeof runtime.window !== "undefined") {
    throw new PolymorfaConfigurationError("Polymorfa server API keys cannot be used in browsers.", "runtime");
  }
}

function isServerApiKey(value: string): boolean {
  return (
    value.startsWith("pmfa_") &&
    value.length > "pmfa_".length &&
    !value.startsWith("pmfa_ct_") &&
    !value.startsWith("pmfa_pt_")
  );
}
