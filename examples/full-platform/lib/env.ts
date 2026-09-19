import { PolymorfaConfigurationError } from "@polymorfa/sdk";

export function requiredEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim().length === 0) {
    throw new PolymorfaConfigurationError(`${name} is not set.`, name);
  }
  return value;
}

export function optionalEnv(name: string): string | undefined {
  const value = process.env[name];
  return value === undefined || value.trim().length === 0 ? undefined : value;
}

export const env = {
  projectToken: () => requiredEnv("POLYMORFA_PROJECT_TOKEN"),
  organizationApiKey: () => requiredEnv("POLYMORFA_ORGANIZATION_API_KEY"),
  projectId: () => requiredEnv("POLYMORFA_PROJECT_ID"),
  projectSlug: () => requiredEnv("POLYMORFA_PROJECT_SLUG"),
  session: () => requiredEnv("POLYMORFA_SESSION"),
  templateSession: () => requiredEnv("POLYMORFA_TEMPLATE_SESSION"),
  webhookSecret: () => requiredEnv("POLYMORFA_WEBHOOK_SECRET"),
  messagingWebhookSecret: () =>
    requiredEnv("POLYMORFA_MESSAGING_WEBHOOK_SECRET"),
  /** Extra sessions agents may address; the default session is always allowed. */
  agentSessions: () =>
    (optionalEnv("POLYMORFA_AGENT_SESSIONS") ?? "")
      .split(",")
      .map((name) => name.trim())
      .filter((name) => name.length > 0),
  /**
   * Public origin of this app, e.g. https://support.example.com. In demo mode
   * without APP_ORIGIN, the origin the request was addressed to is used.
   */
  appOrigin: (request?: Request) => {
    const configured = optionalEnv("APP_ORIGIN");
    if (configured === undefined && request !== undefined && isDemoMode()) {
      return new URL(request.url).origin;
    }
    return new URL(requiredEnv("APP_ORIGIN")).origin;
  },
  baseUrl: () => optionalEnv("POLYMORFA_API_BASE_URL"),
};

/**
 * Demo data is used when no project token is configured, or when
 * ACME_DEMO_DATA=true forces it.
 */
export function isDemoMode(): boolean {
  return (
    optionalEnv("ACME_DEMO_DATA") === "true" ||
    optionalEnv("POLYMORFA_PROJECT_TOKEN") === undefined
  );
}
