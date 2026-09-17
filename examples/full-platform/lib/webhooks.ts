import { readVerifiedWebhook } from "@polymorfa/nextjs";
import {
  WebhookSignatureError,
  constructWebhookEvent,
  isEvent,
  type LinkedDeviceMessagePayload,
  type MessageReceivedPayload,
  type WebhookEvent,
} from "@polymorfa/sdk";

import { publish } from "./realtime.js";

/** Every event type `handle` reacts to. Webhook registrations subscribe to all of them. */
export const WEBHOOK_EVENTS = [
  "message.received",
  "message.ack",
  "call.received",
  "call.ended",
  "call.missed",
  "session.status",
  "session.connected",
  "session.logged_out",
  "template.status",
  "campaign.completed",
  "bansafe.enforcement",
  "customer.created",
];

const TOLERANCE_MS = 5 * 60 * 1000;
const SEEN_LIMIT = 10_000;
// Recently processed event ids, oldest first. This only protects a single
// process for its lifetime; production should record ids in a durable store
// (for example a database unique key or Redis SET NX with a TTL).
const seen = new Set<string>();

/** Verifies, de-duplicates and handles one signed webhook request. */
export async function receiveWebhook(
  request: Request,
  secret: string,
): Promise<Response> {
  let event: WebhookEvent;
  try {
    event = await readVerifiedWebhook(request, {
      constructEvent: constructWebhookEvent,
      secret,
    });
  } catch (error) {
    if (error instanceof WebhookSignatureError || error instanceof TypeError) {
      return new Response(null, { status: 401 });
    }
    throw error;
  }

  // Reject stale or future-dated events to limit replay of captured requests.
  const sentAt = Date.parse(event.timestamp);
  if (
    !Number.isFinite(sentAt) ||
    Math.abs(Date.now() - sentAt) > TOLERANCE_MS
  ) {
    return new Response(null, { status: 400 });
  }
  // Duplicates are acknowledged so the sender stops retrying.
  if (seen.has(event.id)) return new Response(null, { status: 204 });
  seen.add(event.id);
  if (seen.size > SEEN_LIMIT) {
    seen.delete(seen.values().next().value as string);
  }

  handle(event);
  // Acknowledge quickly; do slow work in a queue keyed by `event.id`.
  return new Response(null, { status: 204 });
}

function handle(event: WebhookEvent): void {
  if (isEvent(event, "message.received")) {
    receiveMessage(event.payload);
  } else if (isEvent(event, "message.ack")) {
    for (const message of event.payload.messages) {
      console.info("ack", message.id);
    }
  } else if (isEvent(event, "call.received")) {
    publish({
      type: "call.received",
      callId: event.payload.callId,
      from: event.payload.from,
    });
  } else if (isEvent(event, "call.ended")) {
    publish({
      type: "call.ended",
      callId: event.payload.callId,
      reason: event.payload.reason,
    });
  } else if (isEvent(event, "call.missed")) {
    publish({
      type: "call.ended",
      callId: event.payload.callId,
      reason: event.payload.reason,
    });
  } else if (isEvent(event, "session.status")) {
    publish({
      type: "session.status",
      session: event.session,
      status: event.payload.status,
    });
  } else if (isEvent(event, "session.connected")) {
    console.info("connected", event.session, event.payload.accountType);
  } else if (isEvent(event, "session.logged_out")) {
    console.warn("logged out", event.session, event.payload.reason);
  } else if (isEvent(event, "template.status")) {
    publish({
      type: "template.status",
      templateId: event.payload.templateId,
      status: event.payload.status,
    });
  } else if (isEvent(event, "campaign.completed")) {
    console.info("campaign completed", event.payload.campaignId);
  } else if (isEvent(event, "bansafe.enforcement")) {
    console.warn("BanSafe enforcement changed", event.session);
  } else if (isEvent(event, "customer.created")) {
    console.info("customer created", event.id);
  } else {
    // Unknown and newer event types are preserved for forward compatibility.
    console.info("unhandled webhook", event.event);
  }
}

function receiveMessage(payload: MessageReceivedPayload): void {
  const chat = payload.conversation.phoneNumber ?? payload.conversation.id;
  const linked = isLinkedDevice(payload) ? payload : undefined;
  publish({
    type: "message",
    chat,
    message: {
      id: payload.id,
      text: linked?.text ?? linked?.caption ?? `[${payload.type}]`,
      createdAt: toMilliseconds(payload.timestamp),
      direction: linked?.fromMe === true ? "outbound" : "inbound",
      status: "sent",
    },
  });
}

function isLinkedDevice(
  payload: MessageReceivedPayload,
): payload is LinkedDeviceMessagePayload {
  return typeof payload.timestamp === "number";
}

function toMilliseconds(timestamp: number | string): number {
  const value = typeof timestamp === "number" ? timestamp : Number(timestamp);
  if (!Number.isFinite(value)) return Date.parse(String(timestamp));
  return value < 1e12 ? value * 1000 : value;
}
