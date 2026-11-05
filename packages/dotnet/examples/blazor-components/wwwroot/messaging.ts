import {
  defineUiKit,
  type PolymorfaSessionStatusElement,
  type PolymorfaConnectWhatsAppElement,
  type PolymorfaInboxElement,
} from "@polymorfa/ui-kit/web-components";
import { PolymorfaClient } from "@polymorfa/ui-kit";
let client: ReturnType<typeof defineUiKit> | undefined;
export async function mount(tokenEndpoint: string) {
  client?.dispose();
  const response = await fetch("/example/config", {
    credentials: "same-origin",
  });
  if (!response.ok)
    throw new Error("Application configuration could not be loaded.");
  const config = (await response.json()) as { apiBaseUrl: string };
  client = defineUiKit({
    client: new PolymorfaClient({ tokenEndpoint, baseUrl: config.apiBaseUrl }),
  });
  for (const element of document.querySelectorAll<
    | PolymorfaSessionStatusElement
    | PolymorfaConnectWhatsAppElement
    | PolymorfaInboxElement
  >("pmfa-session-status,pmfa-connect-whatsapp,pmfa-inbox"))
    element.client = client;
  const inbox = document.querySelector<PolymorfaInboxElement>("pmfa-inbox");
  if (inbox) inbox.source = undefined;
}
export function dispose() {
  client?.dispose();
  client = undefined;
}
