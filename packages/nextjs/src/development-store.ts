import type {
  HistoryConversation,
  HistoryMessage,
  HistoryPage,
  PolymorfaRouteContext,
  RelayEvent,
} from "./handler.js";

export interface DevelopmentInboxStoreOptions {
  /** Conversations kept. Default 200. */
  readonly maxConversations?: number;
  /** Messages kept per conversation. Default 500. */
  readonly maxMessages?: number;
  /** Events kept for `Last-Event-ID` resume. Default 500. */
  readonly replay?: number;
}

export interface DevelopmentInboxStore {
  /** Pass as `webhooks.onEvent`: files verified webhook events. */
  readonly record: (event: unknown) => void;
  /** Pass as `history`. */
  readonly history: {
    conversations(
      context: PolymorfaRouteContext<unknown>,
      page: { readonly cursor?: string },
    ): Promise<HistoryPage<HistoryConversation>>;
    messages(
      context: PolymorfaRouteContext<unknown>,
      conversationId: string,
      page: { readonly cursor?: string },
    ): Promise<HistoryPage<HistoryMessage>>;
  };
  /** Pass as `events`: live relay with `Last-Event-ID` resume. */
  readonly events: (
    context: PolymorfaRouteContext<unknown> & { readonly lastEventId?: string },
  ) => AsyncIterable<RelayEvent>;
}

interface Conversation {
  row: HistoryConversation;
  messages: HistoryMessage[];
}

const PAGE = 50;

/**
 * An in-memory inbox for local development and the quickstart: it files
 * webhook events so `<Inbox/>` has history and live updates before you
 * build your own storage. Data lives in this process only and is lost on
 * restart; each server instance has its own copy. Replace it with your
 * database before production.
 */
export function createDevelopmentInboxStore(
  options: DevelopmentInboxStoreOptions = {},
): DevelopmentInboxStore {
  const maxConversations = options.maxConversations ?? 200;
  const maxMessages = options.maxMessages ?? 500;
  const replay = options.replay ?? 500;
  const conversations = new Map<string, Conversation>();
  const recent: RelayEvent[] = [];
  const listeners = new Set<(event: RelayEvent) => void>();

  const record = (value: unknown): void => {
    const event = asEvent(value);
    if (event === undefined) return;
    recent.push(event);
    if (recent.length > replay) recent.shift();
    fileMessage(event);
    for (const listener of [...listeners]) listener(event);
  };

  function fileMessage(event: RelayEvent): void {
    if (event.event !== "message.received" && event.event !== "message.sent")
      return;
    const payload = event.payload as Record<string, unknown> | null;
    const target = payload?.conversation as
      { id?: unknown; phoneNumber?: unknown } | undefined;
    if (typeof payload?.id !== "string" || typeof target?.id !== "string")
      return;
    const createdAt =
      time(payload.timestamp) ?? time(event.timestamp) ?? Date.now();
    const direction =
      payload.fromMe === true || event.event === "message.sent"
        ? "outbound"
        : "inbound";
    const text =
      typeof payload.text === "string"
        ? payload.text
        : typeof payload.caption === "string"
          ? payload.caption
          : "";
    let conversation = conversations.get(target.id);
    if (conversation === undefined) {
      conversation = {
        row: { id: target.id, lastActivity: 0, unreadCount: 0 },
        messages: [],
      };
      conversations.set(target.id, conversation);
      if (conversations.size > maxConversations) {
        const oldest = [...conversations.values()].sort(
          (a, b) => a.row.lastActivity - b.row.lastActivity,
        )[0];
        if (oldest !== undefined) conversations.delete(oldest.row.id);
      }
    }
    const existing = conversation.messages.findIndex(
      (message) => message.id === payload.id,
    );
    const message: HistoryMessage = {
      id: payload.id,
      text,
      createdAt,
      direction,
      status: "sent",
    };
    if (existing >= 0) conversation.messages[existing] = message;
    else {
      conversation.messages.push(message);
      conversation.messages.sort((a, b) => a.createdAt - b.createdAt);
      if (conversation.messages.length > maxMessages)
        conversation.messages.shift();
    }
    const name =
      direction === "inbound" && typeof payload.pushName === "string"
        ? payload.pushName
        : conversation.row.name;
    const phone =
      typeof target.phoneNumber === "string"
        ? target.phoneNumber
        : conversation.row.phoneNumber;
    conversation.row = {
      id: target.id,
      session: event.session,
      ...(name === undefined ? {} : { name }),
      ...(phone === undefined ? {} : { phoneNumber: phone }),
      lastMessage: { text, createdAt, direction },
      lastActivity: Math.max(conversation.row.lastActivity, createdAt),
      unreadCount:
        conversation.row.unreadCount +
        (direction === "inbound" && existing < 0 ? 1 : 0),
    };
  }

  return {
    record,
    history: {
      async conversations(_context, page) {
        const rows = [...conversations.values()]
          .map((conversation) => conversation.row)
          .sort((a, b) => b.lastActivity - a.lastActivity);
        return slice(rows, page.cursor);
      },
      async messages(_context, conversationId, page) {
        // Newest page first; the cursor walks back in time.
        const messages = conversations.get(conversationId)?.messages ?? [];
        const end =
          page.cursor === undefined ? messages.length : Number(page.cursor);
        const start = Math.max(0, end - PAGE);
        return {
          data: messages.slice(start, end),
          nextCursor: start > 0 ? String(start) : null,
        };
      },
    },
    events(context) {
      return {
        [Symbol.asyncIterator]() {
          const queue: RelayEvent[] = [];
          let wake: (() => void) | undefined;
          let done = false;
          const resumeAt =
            context.lastEventId === undefined
              ? -1
              : recent.findIndex((event) => event.id === context.lastEventId);
          if (resumeAt >= 0) queue.push(...recent.slice(resumeAt + 1));
          const listener = (event: RelayEvent) => {
            queue.push(event);
            wake?.();
          };
          listeners.add(listener);
          const finish = () => {
            done = true;
            listeners.delete(listener);
            wake?.();
          };
          context.signal.addEventListener("abort", finish, { once: true });
          return {
            async next(): Promise<IteratorResult<RelayEvent>> {
              while (queue.length === 0 && !done)
                await new Promise<void>((resolve) => (wake = resolve));
              wake = undefined;
              const value = queue.shift();
              return value === undefined
                ? { done: true, value: undefined }
                : { done: false, value };
            },
            async return(): Promise<IteratorResult<RelayEvent>> {
              finish();
              return { done: true, value: undefined };
            },
          };
        },
      };
    },
  };
}

function slice<T>(
  rows: readonly T[],
  cursor: string | undefined,
): HistoryPage<T> {
  const start = cursor === undefined ? 0 : Number(cursor) || 0;
  const end = start + PAGE;
  return {
    data: rows.slice(start, end),
    nextCursor: end < rows.length ? String(end) : null,
  };
}

function time(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value))
    // Webhook timestamps are Unix seconds.
    return value < 1e12 ? value * 1000 : value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function asEvent(value: unknown): RelayEvent | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const event = value as Partial<RelayEvent>;
  if (
    typeof event.id !== "string" ||
    typeof event.event !== "string" ||
    typeof event.session !== "string"
  )
    return undefined;
  return {
    id: event.id,
    session: event.session,
    event: event.event,
    timestamp:
      typeof event.timestamp === "string"
        ? event.timestamp
        : new Date().toISOString(),
    payload: event.payload,
  };
}
