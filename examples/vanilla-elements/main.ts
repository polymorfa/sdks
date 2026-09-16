import {
  definePolymorfaElements,
  type PolymorfaMessageListElement,
} from "@polymorfa/elements";
import { ConversationController } from "@polymorfa/browser";

definePolymorfaElements();

// Replace this data source with your application's conversation adapter.
const conversation = new ConversationController({
  load: async () => ({
    messages: [
      {
        id: "message_1",
        text: "Hello from Polymorfa",
        createdAt: Date.now(),
        direction: "inbound",
        status: "sent",
      },
    ],
  }),
  subscribe: () => () => undefined,
  send: async (message) => ({
    id: crypto.randomUUID(),
    clientId: message.clientId,
    text: message.text,
    createdAt: Date.now(),
    direction: "outbound",
    status: "sent",
  }),
});

const element =
  document.querySelector<PolymorfaMessageListElement>("pmfa-message-list");
if (element) {
  element.controller = conversation;
  void conversation.load();
}
