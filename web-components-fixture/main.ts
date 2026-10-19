// Based on the SDK's examples/vanilla-elements sample. Fixture transport only.
import { definePolymorfaElements } from "@polymorfa/elements";
import {
  createConversationSession,
  MessageFilterController,
  type ConversationMessage,
} from "@polymorfa/browser";
import { createLocale, PT_BR_MESSAGES } from "@polymorfa/ui";

definePolymorfaElements();

const t0 = Date.parse("2026-10-19T09:00:00Z");
const at = (minutes: number) => t0 + minutes * 60_000;
const manyItems = Array.from({ length: 23 }, (_, i) => ({
  productRetailerId: `SKU-${String(i + 1).padStart(3, "0")}`,
  quantity: (i % 3) + 1,
  itemPrice: i % 4 === 0 ? null : 12.5 + i,
  currency: i % 4 === 0 ? null : "BRL",
}));
const messages: ConversationMessage[] = [
  { id: "m1", text: "Hi, I'd like to order", createdAt: at(0), direction: "inbound", status: "sent" },
  { id: "m2", text: "", createdAt: at(1), direction: "inbound", status: "sent", messageType: "order",
    order: { catalogId: "CAT-1", text: "Two shirts please", items: [
      { productRetailerId: "SHIRT-BLUE-M", quantity: 2, itemPrice: 79.9, currency: "BRL" },
      { productRetailerId: "SOCKS-3PK", quantity: 1, itemPrice: null, currency: null },
    ] } },
  { id: "m3", text: "", createdAt: at(2), direction: "inbound", status: "sent", messageType: "order", order: { catalogId: "CAT-1", items: manyItems } },
  { id: "m4", text: "", createdAt: at(3), direction: "inbound", status: "sent", messageType: "order", order: "unreadable" },
  { id: "m5", text: "", createdAt: at(4), direction: "outbound", status: "sent", contentState: "not_retained" },
  { id: "m6", text: "", createdAt: at(5), direction: "inbound", status: "sent", contentState: "deleted" },
  { id: "m7", text: "", createdAt: at(6), direction: "inbound", status: "sent", contentState: "unavailable" },
  { id: "m8", text: "", createdAt: at(7), direction: "inbound", status: "sent" },
  { id: "m9", text: "Your order ships today", createdAt: at(8), direction: "outbound", status: "sent", receipt: { state: "read" } },
];

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
