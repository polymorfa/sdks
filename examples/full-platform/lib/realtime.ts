import type { ConversationMessage } from "@polymorfa/browser";

/** Events the server relays to signed-in browsers over `/api/events`. */
export type RealtimeEvent =
  | {
      readonly type: "message";
      readonly chat: string;
      readonly message: ConversationMessage;
    }
  | {
      readonly type: "call.received";
      readonly callId: string;
      readonly from: {
        readonly id: string;
        readonly phoneNumber?: string;
        readonly bsuid?: string;
        readonly username?: string;
      };
    }
  | {
      readonly type: "call.ended";
      readonly callId: string;
      readonly reason: string;
    }
  | {
      readonly type: "session.status";
      readonly session: string;
      readonly status: string;
    }
  | {
      readonly type: "template.status";
      readonly templateId: string;
      readonly status: string;
    };

// In-memory fan-out and message history. This only works for a single
// server process; use Redis pub/sub or your database in production.
const listeners = new Set<(event: RealtimeEvent) => void>();
const history = new Map<string, ConversationMessage[]>();
const HISTORY_LIMIT = 200;

export function publish(event: RealtimeEvent): void {
  if (event.type === "message") remember(event.chat, event.message);
  for (const listener of [...listeners]) listener(event);
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
