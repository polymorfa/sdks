import type { ConversationMessage } from "@polymorfa/browser";
import type {
  WebhookEvent,
  WebhookEventOf,
  WebhookPayloadMap,
} from "@polymorfa/sdk";

import type {
  DeskCampaign,
  DeskMessage,
  Presence,
  Ticket,
} from "./desk/types.js";

/**
 * Events this app adds next to Polymorfa's webhook events. They use the same
 * envelope (`WebhookEventOf`), so the browser handles one shape whether an
 * event came from a verified webhook or from the app itself.
 */
export interface AppEventPayloads {
  readonly "desk.message": {
    readonly ticketId: string;
    readonly message: DeskMessage;
  };
  readonly "desk.ticket": { readonly ticket: Ticket };
  readonly "desk.presence": {
    readonly ticketId: string;
    readonly presence: Presence;
  };
  readonly "desk.campaign": { readonly campaign: DeskCampaign };
  /** Messages for the SDK coverage inbox route and the Web Components page. */
  readonly "inbox.message": {
    readonly chat: string;
    readonly message: ConversationMessage;
  };
}

export interface LiveEventPayloads
  extends WebhookPayloadMap, AppEventPayloads {}

export type LiveEventName = keyof LiveEventPayloads;

export type LiveEvent<K extends LiveEventName = LiveEventName> = {
  [T in K]: WebhookEventOf<T, LiveEventPayloads[T]>;
}[K];

/** What `/api/events` streams: webhook events relayed as-is, plus app events. */
export type RealtimeEvent = WebhookEvent | LiveEvent<keyof AppEventPayloads>;

// In-memory fan-out and inbox history. This only works for a single server
// process; use Redis pub/sub or your database in production.
const listeners = new Set<(event: RealtimeEvent) => void>();
const history = new Map<string, ConversationMessage[]>();
const HISTORY_LIMIT = 200;

export function publish(event: RealtimeEvent): void {
  if (event.event === "inbox.message") {
    const payload = event.payload as AppEventPayloads["inbox.message"];
    remember(payload.chat, payload.message);
  }
  for (const listener of [...listeners]) listener(event);
}

/** Builds and publishes an app event in the webhook envelope. */
export function emit<K extends keyof AppEventPayloads>(
  event: K,
  session: string,
  payload: AppEventPayloads[K],
): void {
  publish({
    id: `evt_${crypto.randomUUID()}`,
    session,
    timestamp: new Date().toISOString(),
    event,
    payload,
  } as LiveEvent<K>);
}

/** Publishes a webhook-shaped event that the app synthesizes, e.g. in demo mode. */
export function emitWebhook<K extends keyof WebhookPayloadMap>(
  event: K,
  session: string,
  payload: WebhookPayloadMap[K],
): void {
  publish({
    id: `evt_${crypto.randomUUID()}`,
    session,
    timestamp: new Date().toISOString(),
    event,
    payload,
  } as WebhookEvent);
}

export function subscribe(
  listener: (event: RealtimeEvent) => void,
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function remember(chat: string, message: ConversationMessage): void {
  const messages = history.get(chat) ?? [];
  const index = messages.findIndex((item) => item.id === message.id);
  if (index === -1) messages.push(message);
  else messages[index] = message;
  history.set(chat, messages.slice(-HISTORY_LIMIT));
}

/** Newest-last page of stored messages, paged backwards with a numeric cursor. */
export function page(
  chat: string,
  cursor: string | undefined,
  size = 50,
): { messages: ConversationMessage[]; nextCursor?: string } {
  const messages = history.get(chat) ?? [];
  const end = cursor === undefined ? messages.length : Number(cursor);
  const start = Math.max(0, end - size);
  return {
    messages: messages.slice(start, end),
    ...(start > 0 ? { nextCursor: String(start) } : {}),
  };
}
