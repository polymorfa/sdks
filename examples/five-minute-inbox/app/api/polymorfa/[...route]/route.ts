import { MessagingClient, constructWebhookEvent } from "@polymorfa/sdk";
import {
  createDevelopmentInboxStore,
  createPolymorfaHandler,
} from "@polymorfa/nextjs";
import { currentUser } from "../../../../lib/auth.js";

// Keeps webhook events in memory. Swap in your database before production.
const inbox = createDevelopmentInboxStore();

export const { GET, POST } = createPolymorfaHandler({
  polymorfa: new MessagingClient({
    credential: { type: "apiKey", value: process.env.POLYMORFA_API_KEY! },
  }),
  authenticate: currentUser,
  // The only place permissions are chosen: the smallest set this user needs.
  mint: () => ({
    session: process.env.POLYMORFA_SESSION!,
    conversations: "all",
    allow: ["read_messages", "subscribe_events", "send_message"],
    ttlSeconds: 600,
  }),
  webhooks: {
    secret: process.env.POLYMORFA_WEBHOOK_SECRET!,
    constructEvent: constructWebhookEvent,
    onEvent: inbox.record,
  },
  history: inbox.history,
  events: inbox.events,
});
