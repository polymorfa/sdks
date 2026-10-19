// React counterpart of the Web Components smoke. Fixture transport only.
import { createRoot } from "react-dom/client";
import { createConversationSession } from "@polymorfa/browser";
import { ChatWindow, PolymorfaProvider } from "@polymorfa/react";
import { createLocale, PT_BR_MESSAGES } from "@polymorfa/ui";
import { messages } from "./fixture";

const params = new URLSearchParams(location.search);
const dark = params.has("dark");
document.body.classList.toggle("dark", dark);
const sent: string[] = [];
const session = createConversationSession({
  load: async () => ({ messages }),
  subscribe: () => () => undefined,
  send: async (message) => {
    sent.push(message.text);
    return { id: crypto.randomUUID(), clientId: message.clientId, text: message.text, createdAt: Date.now(), direction: "outbound", status: "sent" };
  },
});
void session.conversation.load();
(window as unknown as { smoke: unknown }).smoke = { sent };
createRoot(document.getElementById("app")!).render(
  <PolymorfaProvider
    appearance={{ theme: dark ? "dark" : "light" }}
    locale={params.has("pt") ? createLocale("pt-BR", PT_BR_MESSAGES) : createLocale("en")}
  >
    <ChatWindow controller={session.conversation} composerController={session.composer} replies={false} />
  </PolymorfaProvider>,
);
