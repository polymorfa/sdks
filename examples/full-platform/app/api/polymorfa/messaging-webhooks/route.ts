import { env } from "../../../../lib/env.js";
import { receiveWebhook } from "../../../../lib/webhooks.js";

// Messaging webhook (POST /api/messaging/webhooks "register").
export async function POST(request: Request): Promise<Response> {
  return receiveWebhook(request, env.messagingWebhookSecret());
}
