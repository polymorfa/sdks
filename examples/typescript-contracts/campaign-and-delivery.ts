import type {
  Client,
  MessagingClient,
  CampaignVariableMapping,
  HistorySyncPayload,
  SignalCustodyMode,
} from "@polymorfa/sdk";

/** Source example; API admission and matching package availability are required. */
export async function createDraft(organization: Client, projectId: string) {
  const variableMapping: CampaignVariableMapping = {
    first_name: { source: "name", fallback: "Friend" },
  };
  return organization.campaigns.create({
    projectId,
    name: "Customer-authored audience",
    variableMapping,
    trackedLinks: [{ key: "details", url: "https://example.com/details" }],
  });
}

/** Consent and custody are distinct. Supplementary links cannot change mode. */
export function initialInvitation(
  messaging: MessagingClient,
  signalMode: SignalCustodyMode,
) {
  return messaging.quickLinks.create({
    signalMode,
    configuration: { historySync: { consent: "ask", delivery: "descriptor" } },
  });
}

/** The public notification identity is not the event envelope UUID. */
export function notificationIdentity(
  payload: HistorySyncPayload,
): string | undefined {
  if ("delivery" in payload) return payload.whatsapp_ids.linked_devices;
  if (!("kind" in payload)) return payload.whatsapp_ids.linked_devices;
  return undefined;
}
