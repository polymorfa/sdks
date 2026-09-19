import { env } from "../../../../lib/env.js";
import { receiveWebhook } from "../../../../lib/webhooks.js";

// Management webhook (POST /api/admin/webhooks "create").
export async function POST(request: Request): Promise<Response> {
  return receiveWebhook(request, env.webhookSecret());
}
