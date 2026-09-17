import { readVerifiedWebhook } from "@polymorfa/nextjs";
import {
  WebhookSignatureError,
  constructWebhookEvent,
  isEvent,
  type LinkedDeviceMessagePayload,
  type MessageReceivedPayload,
  type WebhookEvent,
} from "@polymorfa/sdk";

import { env } from "../../../../lib/env.js";
import { publish } from "../../../../lib/realtime.js";

export async function POST(request: Request): Promise<Response> {
  let event: WebhookEvent;
  try {
    event = await readVerifiedWebhook(request, {
      constructEvent: constructWebhookEvent,
      secret: env.webhookSecret(),
    });
  } catch (error) {
    if (error instanceof WebhookSignatureError || error instanceof TypeError) {
      return new Response(null, { status: 401 });
    }
    throw error;
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
