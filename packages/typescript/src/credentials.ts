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

export type ClientCredential =
  | { readonly type: "projectToken"; readonly value: string }
  | { readonly type: "organizationApiKey"; readonly value: string };

export interface OrganizationClientOptions extends SharedClientOptions {
  readonly credential: {
    readonly type: "organizationApiKey";
    readonly value: string;
  };
  readonly projectId?: never;
}

export interface ProjectScopedClientOptions extends SharedClientOptions {
  readonly credential: ClientCredential;
  readonly projectId: string;
}

export type ClientOptions =
  OrganizationClientOptions | ProjectScopedClientOptions;

export function validateMessagingCredential(
  credential: MessagingCredential,
): MessagingCredential {
  if (credential.type === "clientToken") {
    if (
      !credential.value.startsWith("pmfa_ct_") ||
      credential.value.length <= "pmfa_ct_".length
    ) {
      throw new PolymorfaConfigurationError(
        "Messaging client token must use the pmfa_ct_ prefix.",
        "credential",
      );
    }
    return credential;
  }

  if (!isServerApiKey(credential.value)) {
    throw new PolymorfaConfigurationError(
      "Messaging API key must be a pmfa_ server API key.",
      "credential",
    );
  }
  return credential;
}

export function validateClientCredential(
  credential: ClientCredential,
): ClientCredential {
  rejectListenerCredential(credential.value);
  if (credential.type === "projectToken") {
    if (
      !credential.value.startsWith("pmfa_pt_") ||
      credential.value.length <= "pmfa_pt_".length
    ) {
      throw new PolymorfaConfigurationError(
        "Project tokens must use the pmfa_pt_ prefix.",
        "credential",
      );
    }
    return credential;
  }
  validateOrganizationApiKey(credential.value);
  return credential;
}

export function validateOrganizationApiKey(value: string): string {
  rejectListenerCredential(value);
  if (!isServerApiKey(value)) {
    throw new PolymorfaConfigurationError(
      "Organization server API keys must use the pmfa_ prefix.",
      "credential",
    );
  }
  return value;
}

function rejectListenerCredential(value: string): void {
  if (value.startsWith("pmfa_ls_")) {
    throw new PolymorfaConfigurationError(
      "Listener credentials are accepted only by the Polymorfa CLI listener protocol.",
      "credential",
    );
  }
}

export function assertServerRuntime(
  runtime: { readonly window?: unknown } = globalThis as {
    readonly window?: unknown;
  },
): void {
  if (typeof runtime.window !== "undefined") {
    throw new PolymorfaConfigurationError(
      "Polymorfa server API keys cannot be used in browsers.",
      "runtime",
    );
  }
}

function isServerApiKey(value: string): boolean {
  return (
    value.startsWith("pmfa_") &&
    value.length > "pmfa_".length &&
    !value.startsWith("pmfa_ct_") &&
    !value.startsWith("pmfa_pt_") &&
    !value.startsWith("pmfa_ls_")
  );
}
