import {
  definePolymorfa,
  type PolymorfaSessionStatusElement,
  type PolymorfaConnectWhatsAppElement,
  type PolymorfaInboxElement,
} from "@polymorfa/elements";
import { PolymorfaClient } from "@polymorfa/browser";
let client: ReturnType<typeof definePolymorfa> | undefined;
export async function mount(tokenEndpoint: string) {
  client?.dispose();
  const response = await fetch("/example/config", {
    credentials: "same-origin",
  });
  if (!response.ok)
    throw new Error("Application configuration could not be loaded.");
  const config = (await response.json()) as { apiBaseUrl: string };
  client = definePolymorfa({
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
