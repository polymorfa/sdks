import { readVerifiedWebhook } from "@polymorfa/nextjs";
import {
  WebhookSignatureError,
  constructWebhookEvent,
  isEvent,
  type LinkedDeviceMessagePayload,
  type MessageReceivedPayload,
  type WebhookEvent,
} from "@polymorfa/sdk";

import { desk } from "./desk/data.js";
import type { DeskMessageKind } from "./desk/types.js";
import { optionalEnv } from "./env.js";
import { emit, publish } from "./realtime.js";

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
  // Browsers get the verified event unchanged, in the same envelope.
  publish(event);
  if (isEvent(event, "message.received")) {
    receiveMessage(event.payload, event.session);
  } else if (isEvent(event, "message.ack")) {
    for (const message of event.payload.messages) {
      console.info("ack", message.id);
    }
  } else if (isEvent(event, "session.connected")) {
    console.info("connected", event.session, event.payload.accountType);
  } else if (isEvent(event, "session.logged_out")) {
    console.warn("logged out", event.session, event.payload.reason);
  } else if (isEvent(event, "campaign.completed")) {
    console.info("campaign completed", event.payload.campaignId);
  } else if (isEvent(event, "bansafe.enforcement")) {
    console.warn("BanSafe enforcement changed", event.session);
  } else if (
    !isEvent(event, "call.received") &&
    !isEvent(event, "call.ended") &&
    !isEvent(event, "call.missed") &&
    !isEvent(event, "session.status") &&
    !isEvent(event, "template.status") &&
    !isEvent(event, "customer.created")
  ) {
    // Unknown and newer event types are preserved for forward compatibility.
    console.info("unhandled webhook", event.event);
  }
}

function receiveMessage(
  payload: MessageReceivedPayload,
  session: string | undefined,
): void {
  const chat = payload.conversation.phoneNumber ?? payload.conversation.id;
  const linked = isLinkedDevice(payload) ? payload : undefined;
  // Both payload shapes may carry text or a caption.
  const body = stringField(payload, "text") ?? stringField(payload, "caption");
  const createdAt = toMilliseconds(payload.timestamp);
  const phone = payload.conversation.phoneNumber;
  // Customer messages open or update a help-desk ticket.
  if (linked?.fromMe !== true && phone !== undefined && session !== undefined) {
    void desk()
      .then((data) => {
        data.ingestInbound?.({
          id: payload.id,
          session,
          phone,
          text: body ?? "",
          kind: kindOf(payload.type),
          createdAt,
        });
      })
      .catch((error: unknown) => console.error("ticket ingest failed", error));
  }
  // The inbox reads and replies through POLYMORFA_SESSION, so only that
  // session's messages go there; tickets above keep their own session.
  if (session === undefined || session !== optionalEnv("POLYMORFA_SESSION")) {
    return;
  }
  emit("inbox.message", session, {
    chat,
    message: {
      id: payload.id,
      text: body ?? `[${payload.type}]`,
      createdAt,
      direction: linked?.fromMe === true ? "outbound" : "inbound",
      status: "sent",
    },
  });
}

function stringField(
  payload: MessageReceivedPayload,
  key: "text" | "caption",
): string | undefined {
  const value = payload[key];
  return typeof value === "string" ? value : undefined;
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

function kindOf(type: string): DeskMessageKind {
  switch (type) {
    case "image":
    case "video":
    case "audio":
    case "location":
    case "sticker":
      return type;
    case "voice":
    case "ptt":
      return "audio";
    case "document":
    case "file":
      return "document";
    case "contact":
    case "contacts":
      return "contact";
    case "interactive":
    case "button":
      return "interactive";
    default:
      return "text";
  }
}
