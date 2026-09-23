import type {
  ConversationDataSource,
  ConversationEvent,
  ConversationMessage,
} from "../chat/conversation.js";
import { ConversationController } from "../chat/conversation.js";
import {
  ObservableController,
  type ControllerSnapshot,
} from "../controller.js";
import { BrowserError } from "../errors.js";
import type { PolymorfaClient } from "./client.js";

/** One row of the conversation list. */
export interface InboxConversation {
  readonly id: string;
  /** Session that owns the conversation; defaults to the grant's session. */
  readonly session?: string;
  readonly name?: string;
  readonly phoneNumber?: string;
  readonly avatarUrl?: string;
  readonly lastMessage?: {
    readonly text: string;
    readonly createdAt: number;
    readonly direction: "inbound" | "outbound";
  };
  /** Epoch milliseconds of the newest activity. */
  readonly lastActivity: number;
  readonly unreadCount: number;
}

/** What the contact panel shows. */
export interface InboxContact {
  readonly id: string;
  readonly name?: string;
  readonly phoneNumber?: string;
  readonly avatarUrl?: string;
  readonly about?: string;
  readonly email?: string;
  /** Your own fields, shown as label and value rows. */
  readonly fields?: readonly {
    readonly label: string;
    readonly value: string;
  }[];
}

export interface InboxConversationPage {
  readonly conversations: readonly InboxConversation[];
  readonly nextCursor?: string;
}

export type InboxChange =
  /** Replace or add a whole row. */
  | { readonly type: "conversation"; readonly conversation: InboxConversation }
  /** A new message: moves the row to the top and bumps its unread count. */
  | {
      readonly type: "activity";
      readonly conversationId: string;
      readonly session?: string;
      readonly name?: string;
      readonly phoneNumber?: string;
      readonly lastMessage: NonNullable<InboxConversation["lastMessage"]>;
    }
  | { readonly type: "remove"; readonly conversationId: string };

/**
 * Where `<Inbox/>` reads from. `createHandlerInboxSource` reads your
 * handler's history and events routes; `@polymorfa/store` offers a local
 * cache on top of it. Implement it yourself for any other backend.
 */
export interface InboxDataSource {
  listConversations(
    cursor?: string,
    signal?: AbortSignal,
  ): Promise<InboxConversationPage>;
  /** The message source for one conversation. Called once per open. */
  conversation(conversation: InboxConversation): ConversationDataSource;
  contact?(
    conversation: InboxConversation,
    signal?: AbortSignal,
  ): Promise<InboxContact | undefined>;
  subscribe?(listener: (change: InboxChange) => void): () => void;
  /** Release shared connections. */
  close?(): void;
}

export interface InboxSnapshot extends ControllerSnapshot {
  readonly status: "idle" | "loading" | "ready" | "loading_more" | "error";
  readonly conversations: readonly InboxConversation[];
  readonly selectedId?: string;
  readonly hasMore: boolean;
  readonly cursor?: string;
  readonly error?: string;
}

/**
 * Framework-neutral state for an inbox: the conversation list, the selected
 * conversation and one `ConversationController` per opened conversation.
 */
export class InboxController extends ObservableController<InboxSnapshot> {
  readonly source: InboxDataSource;
  readonly #conversations = new Map<string, ConversationController>();
  #abort = new AbortController();
  #unsubscribe: (() => void) | undefined;

  constructor(source: InboxDataSource, options: { now?: () => number } = {}) {
    super({ status: "idle", conversations: [], hasMore: false }, options.now);
    this.source = source;
  }

  async load(): Promise<void> {
    this.assertActive();
    this.#abort.abort();
    this.#abort = new AbortController();
    const signal = this.#abort.signal;
    const selectedId = this.getSnapshot().selectedId;
    this.transition({
      status: "loading",
      conversations: [],
      hasMore: false,
      ...(selectedId === undefined ? {} : { selectedId }),
    });
    try {
      const page = await this.source.listConversations(undefined, signal);
      if (signal.aborted) return;
      this.transition({
        status: "ready",
        conversations: sortConversations(page.conversations).map(
          (conversation) =>
            conversation.id === selectedId && conversation.unreadCount > 0
              ? { ...conversation, unreadCount: 0 }
              : conversation,
        ),
        hasMore: page.nextCursor !== undefined,
        ...(page.nextCursor === undefined ? {} : { cursor: page.nextCursor }),
        ...(selectedId === undefined ? {} : { selectedId }),
      });
      this.#unsubscribe?.();
      this.#unsubscribe = this.source.subscribe?.((change) =>
        this.#apply(change),
      );
    } catch (cause) {
      if (!signal.aborted)
        this.transition({
          status: "error",
          conversations: [],
          hasMore: false,
          error: message(cause),
          ...(selectedId === undefined ? {} : { selectedId }),
        });
    }
  }

  async loadMore(): Promise<void> {
    const current = this.getSnapshot();
    if (current.status !== "ready" || current.cursor === undefined) return;
    const signal = this.#abort.signal;
    this.transition({ ...rest(current), status: "loading_more" });
    try {
      const page = await this.source.listConversations(current.cursor, signal);
      if (signal.aborted) return;
      const latest = this.getSnapshot();
      const { cursor: _cursor, ...base } = rest(latest);
      void _cursor;
      this.transition({
        ...base,
        status: "ready",
        conversations: sortConversations(
          merge(latest.conversations, page.conversations),
        ),
        hasMore: page.nextCursor !== undefined,
        ...(page.nextCursor === undefined ? {} : { cursor: page.nextCursor }),
      });
    } catch (cause) {
      if (!signal.aborted)
        this.transition({
          ...rest(this.getSnapshot()),
          status: "ready",
          error: message(cause),
        });
    }
  }

  /** Select a conversation, or pass `undefined` to go back to the list. */
  select(conversationId: string | undefined): void {
    const current = rest(this.getSnapshot());
    const { selectedId: _selected, ...base } = current;
    void _selected;
    this.transition({
      ...base,
      ...(conversationId === undefined ? {} : { selectedId: conversationId }),
      // Opening a conversation clears its unread badge locally.
      conversations: base.conversations.map((conversation) =>
        conversation.id === conversationId && conversation.unreadCount > 0
          ? { ...conversation, unreadCount: 0 }
          : conversation,
      ),
    });
  }

  get selected(): InboxConversation | undefined {
    const { selectedId, conversations } = this.getSnapshot();
    return conversations.find((conversation) => conversation.id === selectedId);
  }

  /** The shared controller for a conversation, created and loaded on first use. */
  conversation(conversation: InboxConversation): ConversationController {
    let controller = this.#conversations.get(conversation.id);
    if (controller === undefined) {
      controller = new ConversationController(
        this.source.conversation(conversation),
      );
      this.#conversations.set(conversation.id, controller);
      void controller.load();
    }
    return controller;
  }

  protected override onDispose(): void {
    this.#abort.abort();
    this.#unsubscribe?.();
    for (const controller of this.#conversations.values()) controller.dispose();
    this.#conversations.clear();
    this.source.close?.();
  }

  #apply(change: InboxChange): void {
    const current = rest(this.getSnapshot());
    if (change.type === "remove") {
      this.transition({
        ...current,
        conversations: current.conversations.filter(
          (conversation) => conversation.id !== change.conversationId,
        ),
      });
      return;
    }
    let incoming: InboxConversation;
    if (change.type === "activity") {
      const existing = current.conversations.find(
        (conversation) => conversation.id === change.conversationId,
      );
      incoming = {
        ...(existing ?? { id: change.conversationId, unreadCount: 0 }),
        ...(existing?.session === undefined && change.session !== undefined
          ? { session: change.session }
          : {}),
        ...(existing?.name === undefined && change.name !== undefined
          ? { name: change.name }
          : {}),
        ...(existing?.phoneNumber === undefined &&
        change.phoneNumber !== undefined
          ? { phoneNumber: change.phoneNumber }
          : {}),
        lastMessage: change.lastMessage,
        lastActivity: change.lastMessage.createdAt,
        unreadCount:
          (existing?.unreadCount ?? 0) +
          (change.lastMessage.direction === "inbound" ? 1 : 0),
      };
    } else incoming = change.conversation;
    if (incoming.id === current.selectedId)
      incoming = { ...incoming, unreadCount: 0 };
    this.transition({
      ...current,
      conversations: sortConversations(
        merge(current.conversations, [incoming]),
      ),
    });
  }
}

function rest(
  snapshot: InboxSnapshot,
): Omit<InboxSnapshot, "revision" | "updatedAt"> {
  const { revision: _revision, updatedAt: _updatedAt, ...fields } = snapshot;
  void _revision;
  void _updatedAt;
  return fields;
}

function merge(
  current: readonly InboxConversation[],
  incoming: readonly InboxConversation[],
): InboxConversation[] {
  const byId = new Map(current.map((item) => [item.id, item]));
  for (const item of incoming) byId.set(item.id, item);
  return [...byId.values()];
}

function sortConversations(
  conversations: readonly InboxConversation[],
): InboxConversation[] {
  return [...conversations].sort((a, b) => b.lastActivity - a.lastActivity);
}

function message(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

// ── Handler-backed source ─────────────────────────────────────────────

interface HistoryPage<T> {
  readonly data: readonly T[];
  readonly nextCursor?: string | null;
}

/** A webhook event envelope as the handler's events route relays it. */
export interface RelayedEvent {
  readonly id: string;
  readonly session: string;
  readonly event: string;
  readonly timestamp: string;
  readonly payload: unknown;
}

export interface HandlerInboxSourceOptions {
  /** Read live updates from the handler's `events` route. Default true. */
  readonly live?: boolean;
  /** `EventSource` constructor, for tests and non-browser runtimes. */
  readonly EventSource?: new (
    url: string,
    init?: { withCredentials?: boolean },
  ) => EventSourceLike;
}

export interface EventSourceLike {
  addEventListener(
    type: string,
    listener: (event: { data: string; lastEventId?: string }) => void,
  ): void;
  close(): void;
  onerror?: ((event: unknown) => void) | null;
}

/**
 * The default `<Inbox/>` source: history from your handler's `history`
 * routes, live changes from its `events` route, and sends straight to the
 * Polymorfa API with the client token (the API enforces `send_message`).
 */
export function createHandlerInboxSource(
  client: PolymorfaClient,
  options: HandlerInboxSourceOptions = {},
): InboxDataSource {
  const listeners = new Set<(event: RelayedEvent) => void>();
  let source: EventSourceLike | undefined;
  const EventSourceImpl =
    options.EventSource ??
    (globalThis as { EventSource?: HandlerInboxSourceOptions["EventSource"] })
      .EventSource;
  const live = options.live !== false && EventSourceImpl !== undefined;

  const listen = (listener: (event: RelayedEvent) => void): (() => void) => {
    if (!live || !client.can("subscribe_events")) return () => undefined;
    listeners.add(listener);
    if (source === undefined) {
      source = new EventSourceImpl!(client.url("events"), {
        withCredentials: true,
      });
      source.addEventListener("message", (frame) => {
        let parsed: unknown;
        try {
          parsed = JSON.parse(frame.data);
        } catch {
          return;
        }
        for (const item of Array.isArray(parsed) ? parsed : [parsed])
          if (isRelayedEvent(item))
            for (const notify of [...listeners]) notify(item);
      });
    }
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) {
        source?.close();
        source = undefined;
      }
    };
  };

  return {
    async listConversations(cursor, signal) {
      const page = await client.request<HistoryPage<InboxConversation>>(
        `history/conversations${query(cursor)}`,
        signal === undefined ? {} : { signal },
      );
      return {
        conversations: page.data,
        ...(typeof page.nextCursor === "string"
          ? { nextCursor: page.nextCursor }
          : {}),
      };
    },
    conversation(conversation) {
      const path = `history/conversations/${encodeURIComponent(conversation.id)}/messages`;
      return {
        async load(cursor, signal) {
          const page = await client.request<HistoryPage<ConversationMessage>>(
            `${path}${query(cursor)}`,
            signal === undefined ? {} : { signal },
          );
          return {
            messages: page.data,
            ...(typeof page.nextCursor === "string"
              ? { nextCursor: page.nextCursor }
              : {}),
          };
        },
        subscribe(listener: (event: ConversationEvent) => void) {
          return listen((event) => {
            const change = conversationEvent(event, conversation.id);
            if (change !== undefined) listener(change);
          });
        },
        async send(outgoing, signal) {
          const messaging = client.messaging(conversation.session);
          const body = {
            conversation: { id: conversation.id },
            content: { text: outgoing.text },
            ...(outgoing.replyTo === undefined
              ? {}
              : { quotedMessage: { id: outgoing.replyTo } }),
          } as Parameters<typeof messaging.messages.send>[0];
          const request = () =>
            messaging.messages.send(
              body,
              signal === undefined ? {} : { signal },
            );
          let response;
          try {
            response = await request();
          } catch (cause) {
            // A refused token gets exactly one fresh token, then gives up.
            if (
              cause instanceof BrowserError &&
              (cause.status === 401 || cause.status === 403)
            ) {
              await client.refresh();
              response = await request();
            } else throw cause;
          }
          const data = (response.data as { data?: { id?: unknown } }).data;
          return {
            id: typeof data?.id === "string" ? data.id : outgoing.clientId,
            clientId: outgoing.clientId,
            text: outgoing.text,
            createdAt: Date.now(),
            direction: "outbound",
            status: "sent",
            ...(outgoing.replyTo === undefined
              ? {}
              : { replyTo: outgoing.replyTo }),
          };
        },
      };
    },
    async contact(conversation, signal) {
      try {
        const page = await client.request<{ data: InboxContact }>(
          `history/conversations/${encodeURIComponent(conversation.id)}/contact`,
          signal === undefined ? {} : { signal },
        );
        return page.data;
      } catch (cause) {
        if (cause instanceof BrowserError && cause.status === 404)
          return undefined;
        throw cause;
      }
    },
    subscribe(listener) {
      return listen((event) => {
        const change = inboxChange(event);
        if (change !== undefined) listener(change);
      });
    },
    close() {
      listeners.clear();
      source?.close();
      source = undefined;
    },
  };
}

function query(cursor: string | undefined): string {
  return cursor === undefined ? "" : `?cursor=${encodeURIComponent(cursor)}`;
}

function isRelayedEvent(value: unknown): value is RelayedEvent {
  if (typeof value !== "object" || value === null) return false;
  const event = value as Partial<RelayedEvent>;
  return (
    typeof event.id === "string" &&
    typeof event.event === "string" &&
    typeof event.session === "string"
  );
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

/** The conversation an event belongs to, as the store reducers read it. */
export function relayedConversationId(event: RelayedEvent): string | undefined {
  const payload = record(event.payload);
  const id =
    record(payload?.conversation)?.id ?? record(payload?.from)?.id ?? undefined;
  return typeof id === "string" ? id : undefined;
}

function messageFromEvent(
  event: RelayedEvent,
): (ConversationMessage & { conversationId: string }) | undefined {
  if (
    event.event !== "message.received" &&
    event.event !== "message.sent" &&
    event.event !== "message.edited"
  )
    return undefined;
  const payload = record(event.payload);
  const conversationId = relayedConversationId(event);
  if (payload === undefined || conversationId === undefined) return undefined;
  const id = payload.id;
  if (typeof id !== "string") return undefined;
  const text =
    typeof payload.text === "string"
      ? payload.text
      : typeof payload.caption === "string"
        ? payload.caption
        : "";
  const time = Date.parse(
    typeof payload.timestamp === "string" ? payload.timestamp : event.timestamp,
  );
  return {
    conversationId,
    id,
    text,
    createdAt: Number.isFinite(time) ? time : Date.now(),
    direction: payload.fromMe === true ? "outbound" : "inbound",
    status: "sent",
  };
}

function conversationEvent(
  event: RelayedEvent,
  conversationId: string,
): ConversationEvent | undefined {
  if (relayedConversationId(event) !== conversationId) return undefined;
  if (event.event === "message.delete" || event.event === "message.revoked") {
    const payload = record(event.payload);
    const id = payload?.revokedId ?? payload?.id;
    return typeof id === "string"
      ? { type: "delete", messageId: id }
      : undefined;
  }
  const message = messageFromEvent(event);
  if (message === undefined) return undefined;
  const { conversationId: _id, ...rest } = message;
  void _id;
  return { type: "upsert", message: rest };
}

function inboxChange(event: RelayedEvent): InboxChange | undefined {
  const message = messageFromEvent(event);
  if (message === undefined) return undefined;
  const payload = record(event.payload);
  const conversation = record(payload?.conversation);
  const name =
    message.direction === "inbound" && typeof payload?.pushName === "string"
      ? payload.pushName
      : undefined;
  const phone =
    typeof conversation?.phoneNumber === "string"
      ? conversation.phoneNumber
      : undefined;
  return {
    type: "activity",
    conversationId: message.conversationId,
    session: event.session,
    ...(name === undefined ? {} : { name }),
    ...(phone === undefined ? {} : { phoneNumber: phone }),
    lastMessage: {
      text: message.text,
      createdAt: message.createdAt,
      direction: message.direction,
    },
  };
}
