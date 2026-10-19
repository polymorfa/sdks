// Based on the SDK's examples/vanilla-elements sample. Fixture transport only.
import { definePolymorfaElements } from "@polymorfa/elements";
import {
  createConversationSession,
  MessageFilterController,
  type ConversationMessage,
} from "@polymorfa/browser";
import { createLocale, PT_BR_MESSAGES } from "@polymorfa/ui";

definePolymorfaElements();

import { messages } from "./fixture";

const sent: string[] = [];
const session = createConversationSession({
  load: async () => ({ messages }),
  subscribe: () => () => undefined,
  send: async (message) => {
    sent.push(message.text);
    return {
      id: crypto.randomUUID(), clientId: message.clientId, text: message.text,
      createdAt: Date.now(), direction: "outbound", status: "sent",
    };
  },
});
const conversation = session.conversation;
const filters = new MessageFilterController();
const chat = document.querySelector("pmfa-chat-window") as HTMLElement & {
  controller: unknown; configuration: unknown; composerController: unknown;
  messageFilter: ((m: ConversationMessage) => boolean) | undefined;
};
chat.controller = conversation;
chat.composerController = session.composer;
void conversation.load();

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const configure = () => {
  const pt = $<HTMLInputElement>("pt").checked;
  const dark = $<HTMLInputElement>("dark").checked;
  document.body.classList.toggle("dark", dark);
  chat.configuration = {
    appearance: { theme: dark ? "dark" : "light" },
    locale: pt ? createLocale("pt-BR", PT_BR_MESSAGES) : createLocale("en"),
  };
};
const applyFilters = () => {
  filters.setQuery($<HTMLInputElement>("q").value);
  filters.setType($<HTMLSelectElement>("type").value as never);
  filters.setDirection($<HTMLSelectElement>("dir").value as never);
  const s = filters.getSnapshot();
  chat.messageFilter = s.query === "" && s.type === "all" && s.direction === "all"
    ? undefined : (m) => filters.matches(m);
};
for (const id of ["q", "type", "dir"]) $(id).addEventListener("input", applyFilters);
$("replies").addEventListener("change", (e) => {
  if ((e.target as HTMLInputElement).checked) chat.setAttribute("replies", "false");
  else chat.removeAttribute("replies");
});
for (const id of ["pt", "dark"]) $(id).addEventListener("change", configure);
configure();
(window as unknown as { smoke: unknown }).smoke = { conversation, filters, composer: session.composer, sent };
