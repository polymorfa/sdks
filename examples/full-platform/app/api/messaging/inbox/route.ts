import { messaging } from "../../../../lib/polymorfa.js";
import { env } from "../../../../lib/env.js";
import { page, publish } from "../../../../lib/realtime.js";
import {
  InputError,
  idempotencyKey,
  optionalText,
  route,
  text,
} from "../../../../lib/route.js";

// Data source for the inbox ConversationController. History is stored by this
// application from webhooks; the Messaging API does not serve chat history.
export const GET = route("agent", async ({ url }) => {
  const chat = url.searchParams.get("chat");
  if (chat === null) throw new InputError("chat is required.");
  return page(chat, url.searchParams.get("cursor") ?? undefined);
});

export const POST = route("agent", async ({ body, request }) => {
  const chat = text(body, "chat");
  const replyTo = optionalText(body, "replyTo");
  const response = await messaging().messages.send(
    env.session(),
    {
      conversation: { phoneNumber: chat },
      content: { text: text(body, "text") },
      ...(replyTo === undefined ? {} : { quotedMessage: { id: replyTo } }),
    },
    { idempotencyKey: idempotencyKey(request) },
  );
  const sent = response.data.data;
  const message = {
    id: sent.id,
    clientId: text(body, "clientId"),
    text: text(body, "text"),
    createdAt: Date.parse(sent.timestamp) || Date.now(),
    direction: "outbound" as const,
    status: "sent" as const,
  };
  publish({ type: "message", chat, message });
  return message;
});
