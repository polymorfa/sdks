import { PolymorfaConfigurationError } from "./errors.js";

const ORGANIZATION_API_KEY_V1 = /^pmfa_[A-Za-z0-9_-]{72}$/;
const PROJECT_TOKEN_V1 = /^pmfa_pt_[A-Za-z0-9_-]{93}[AQgw]$/;

export type MessagingCredential =
  | { readonly type: "apiKey"; readonly value: string }
  | { readonly type: "projectToken"; readonly value: string }
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
  rejectListenerCredential(credential.value);
  if (credential.type === "projectToken") {
    if (!isProjectToken(credential.value)) {
      throw new PolymorfaConfigurationError(
        "Messaging project tokens must use the canonical pmfa_pt_ v1 format.",
        "credential",
      );
    }
    return credential;
  }
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

  validateOrganizationApiKey(credential.value);
  return credential;
}

export function validateClientCredential(
  credential: ClientCredential,
): ClientCredential {
  rejectListenerCredential(credential.value);
  if (credential.type === "projectToken") {
    if (!isProjectToken(credential.value)) {
      throw new PolymorfaConfigurationError(
        "Project tokens must use the canonical pmfa_pt_ v1 format.",
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
  rejectNonOrganizationCredential(value);
  if (!isServerApiKey(value)) {
    throw new PolymorfaConfigurationError(
      "Organization server API keys must use the canonical pmfa_ v1 format.",
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

function rejectNonOrganizationCredential(value: string): void {
  if (value.startsWith("pmfa_ct_") || value.startsWith("pmfa_pt_")) {
    throw new PolymorfaConfigurationError(
      "Client and project tokens cannot be used as organization server API keys.",
      "credential",
    );
  }
  if (
    value.startsWith("pmfa_at_") ||
    value.startsWith("pmfa_wst_") ||
    value.startsWith("pmfa_sd_")
  ) {
    throw new PolymorfaConfigurationError(
      "Special-purpose tickets and capabilities cannot be used as organization server API keys.",
      "credential",
    );
  }
}

export function assertServerRuntime(
  runtime: {
    readonly window?: unknown;
    readonly importScripts?: unknown;
    readonly constructor?: { readonly name?: string };
  } = globalThis,
): void {
  const globalName = runtime.constructor?.name ?? "";
  const isBrowserWorker =
    typeof runtime.importScripts === "function" ||
    globalName === "DedicatedWorkerGlobalScope" ||
    globalName === "SharedWorkerGlobalScope" ||
    globalName === "ServiceWorkerGlobalScope" ||
    globalName.endsWith("WorkletGlobalScope");

  if (typeof runtime.window !== "undefined" || isBrowserWorker) {
    throw new PolymorfaConfigurationError(
      "Polymorfa server credentials cannot be used in browser runtimes.",
      "runtime",
    );
  }
}

function isServerApiKey(value: string): boolean {
  return ORGANIZATION_API_KEY_V1.test(value);
}

function isProjectToken(value: string): boolean {
  return PROJECT_TOKEN_V1.test(value);
}
