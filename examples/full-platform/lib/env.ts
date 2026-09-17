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
  baseUrl: () => optionalEnv("POLYMORFA_API_BASE_URL"),
};
