import { PolymorfaConfigurationError } from "@polymorfa/sdk";

export function requiredEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.length === 0) {
    throw new PolymorfaConfigurationError(`${name} is not set.`, name);
  }
  return value;
}

export function optionalEnv(name: string): string | undefined {
  const value = process.env[name];
  return value === undefined || value.length === 0 ? undefined : value;
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
  /** Public origin of this app, e.g. https://support.example.com. */
  appOrigin: () => new URL(requiredEnv("APP_ORIGIN")).origin,
  baseUrl: () => optionalEnv("POLYMORFA_API_BASE_URL"),
};
